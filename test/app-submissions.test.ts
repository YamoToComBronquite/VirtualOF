import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.ts';
import type { Office } from '../server/office.ts';

const state = vi.hoisted(() => ({ run: vi.fn(), cleanup: vi.fn(), save: vi.fn(), office: undefined as Office | undefined }));
vi.mock('node:fs', async (original) => ({ ...await original<typeof import('node:fs')>(), mkdirSync: vi.fn() }));
vi.mock('../server/config.ts', () => ({
  loadConfig: () => ({ projeto: process.cwd(), antigravity: {}, porta: 0 }),
  saveLanguage: vi.fn(), savePermissionMode: vi.fn(), saveProject: vi.fn(),
}));
vi.mock('../server/accounts.ts', () => ({ detectAccounts: () => ({}) }));
vi.mock('../server/models.ts', () => ({ loadModels: async () => ({}) }));
vi.mock('../server/agents/antigravity.ts', () => ({ watchAntigravity: () => () => {} }));
vi.mock('../server/shell.ts', () => ({ Shell: class { running = false; close() {} } }));
vi.mock('../server/team.ts', () => ({
  Team: class {
    members = [
      { config: { id: 'lead', nome: 'Lead', papel: 'coordenador', tipo: 'claude' }, runner: { run: state.run, busy: false, stop() {} } },
      { config: { id: 'worker', nome: 'Worker', papel: 'executor', tipo: 'claude' }, runner: { run: state.run, busy: false, stop() {} } },
    ];
    constructor(_config: unknown, office: Office) {
      state.office = office;
      for (const { config } of this.members) office.addAgent({
        id: config.id, name: config.nome, defaultName: config.nome, kind: 'claude', role: config.papel,
        status: 'idle', activity: '', color: '#fff', controllable: true, usage: { tasks: 0, inputTokens: 0, outputTokens: 0 },
      });
    }
    get busy() { return false; }
    list() { return this.members; }
    get(id: string) { return this.members.find(member => member.config.id === id); }
    coordinator() { return this.members[0]; }
    workers() { return this.members.slice(1); }
    label(member: this['members'][number]) { return member.config.nome; }
    account() { return 'claude'; }
    runAs(member: this['members'][number], _role: string, prompt: string) { return member.runner.run(prompt); }
  },
}));
vi.mock('../server/uploads.ts', async (original) => ({
  ...await original<typeof import('../server/uploads.ts')>(),
  saveImages: state.save, discardImages: state.cleanup,
}));

const { startOffice } = await import('../server/app.ts');
let server: Awaited<ReturnType<typeof startOffice>>;
const sockets: WebSocket[] = [];
let warning: ReturnType<typeof vi.spyOn>;

async function connect() {
  const messages: ServerMessage[] = [];
  const socket = new WebSocket(server.url.replace('http:', 'ws:').replace('localhost', '127.0.0.1') + '/ws', { origin: server.url });
  sockets.push(socket);
  socket.on('message', data => messages.push(JSON.parse(String(data)) as ServerMessage));
  await vi.waitFor(() => expect(messages.some(msg => msg.type === 'snapshot')).toBe(true));
  return { messages, send: (msg: ClientMessage) => socket.send(JSON.stringify(msg)), socket };
}

beforeEach(async () => {
  vi.resetAllMocks();
  warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  state.run.mockResolvedValue({ ok: true, text: 'ok' });
  state.save.mockReturnValue([]);
  server = await startOffice({ port: 0, web: { dir: process.cwd() } });
});
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.terminate();
  server?.shutdown();
  warning.mockRestore();
});

describe('submission acknowledgements over WebSocket', () => {
  it.each(['task', 'command'] as const)('cleans saved images if recording a %s fails before acceptance', async (type) => {
    const saved = [{ name: 'test.png', mime: 'image/png' as const, data: 'AA==', path: 'temporary-test.png' }];
    state.save.mockReturnValueOnce(saved);
    const write = state.office!.write.bind(state.office);
    vi.spyOn(state.office!, 'write').mockImplementationOnce((...args) => {
      write(...args); // A listener can fail after the user entry is already in the log.
      throw new Error('log failed');
    });
    const client = await connect();
    client.send(type === 'task'
      ? { type, agentId: 'worker', prompt: 'test', requestId: 'record-failed' }
      : { type, prompt: 'test', requestId: 'record-failed' });
    await vi.waitFor(() => expect(client.messages).toContainEqual(expect.objectContaining({ type: 'submission', accepted: false })));
    expect(state.office!.hasSubmission('record-failed')).toBe(false);
    expect(state.run).not.toHaveBeenCalled();
    expect(state.cleanup).toHaveBeenCalledWith(saved);
    const reconnected = await connect();
    reconnected.send({ type: 'submission-status', requestId: 'record-failed' });
    await vi.waitFor(() => expect(reconnected.messages).toContainEqual(expect.objectContaining({
      type: 'submission-status', requestId: 'record-failed', accepted: false,
    })));
  });

  it('still runs an accepted task if sending its acknowledgement throws', async () => {
    const originalSend = WebSocket.prototype.send;
    let failed = false;
    const send = vi.spyOn(WebSocket.prototype, 'send').mockImplementation(function (data, ...args) {
      if (typeof data === 'string' && JSON.parse(data).type === 'submission' && !failed) {
        failed = true;
        throw new Error('acknowledgement failed');
      }
      return originalSend.call(this, data, ...args);
    });
    try {
      const client = await connect();
      client.send({ type: 'task', agentId: 'worker', prompt: 'test', requestId: 'lost-ack' });
      await vi.waitFor(() => expect(state.run).toHaveBeenCalledOnce());
      expect(failed).toBe(true);
      expect(state.office!.hasSubmission('lost-ack')).toBe(true);
      client.send({ type: 'task', agentId: 'worker', prompt: 'test', requestId: 'lost-ack' });
      await vi.waitFor(() => expect(client.messages).toContainEqual(expect.objectContaining({ type: 'submission', duplicate: true })));
      expect(state.run).toHaveBeenCalledOnce();
    } finally { send.mockRestore(); }
  });

  it('recognizes acceptance after reconnection and never reruns an accepted id', async () => {
    let finish!: (outcome: unknown) => void;
    state.run.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const first = await connect();
    const message: ClientMessage = { type: 'task', agentId: 'worker', prompt: 'test', requestId: 'same-id' };
    first.send(message);
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledOnce());
    first.socket.terminate(); // Ignore its acknowledgement, as if the connection lost it.
    const reconnected = await connect();
    reconnected.send({ type: 'submission-status', requestId: 'same-id' });
    await vi.waitFor(() => expect(reconnected.messages).toContainEqual({
      type: 'submission-status', requestId: 'same-id', accepted: true, serverId: state.office!.serverId,
    }));
    reconnected.send(message);
    await vi.waitFor(() => expect(reconnected.messages).toContainEqual(expect.objectContaining({ type: 'submission', accepted: true, duplicate: true })));
    expect(state.run).toHaveBeenCalledOnce();
    finish({ ok: true, text: 'ok' });
    await vi.waitFor(() => expect(state.cleanup).toHaveBeenCalledOnce());
    reconnected.messages.length = 0;
    reconnected.send(message);
    await vi.waitFor(() => expect(reconnected.messages).toContainEqual(expect.objectContaining({ type: 'submission', accepted: true, duplicate: true })));
    expect(state.run).toHaveBeenCalledOnce();
    expect(state.save).toHaveBeenCalledOnce();
  });

  it('reports runner and cleanup rejection, finalizes the agent, and accepts another task', async () => {
    state.run.mockRejectedValueOnce(new Error('runner failed'));
    state.cleanup.mockImplementationOnce(() => { throw new Error('cleanup failed'); });
    const client = await connect();
    client.send({ type: 'task', agentId: 'worker', prompt: 'test', requestId: 'failed' });
    await vi.waitFor(() => expect(state.office!.getAgent('worker')?.status).toBe('error'));
    await vi.waitFor(() => expect(client.messages).toContainEqual(expect.objectContaining({
      type: 'log', entry: expect.objectContaining({ kind: 'error', text: expect.stringContaining('cleanup failed') }),
    })));
    client.send({ type: 'task', agentId: 'worker', prompt: 'next', requestId: 'next' });
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
    expect(state.office!.hasSubmission('next')).toBe(true);
  });

  it('finalizes a rejected general command and releases the office for another submission', async () => {
    state.run.mockRejectedValueOnce(new Error('planning failed'));
    const client = await connect();
    client.send({ type: 'command', prompt: 'test', requestId: 'command' });
    await vi.waitFor(() => expect(client.messages).toContainEqual(expect.objectContaining({
      type: 'plan', plan: expect.objectContaining({ status: 'error', summary: expect.stringContaining('planning failed') }),
    })));
    client.send({ type: 'task', agentId: 'worker', prompt: 'next', requestId: 'after-command' });
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledTimes(2));
    expect(state.office!.hasSubmission('after-command')).toBe(true);
  });

  it('does not reserve ids rejected before acceptance, so the same request can be retried', async () => {
    state.save.mockImplementationOnce(() => { throw new Error('ENOSPC'); });
    const client = await connect();
    const message: ClientMessage = { type: 'task', agentId: 'worker', prompt: 'test', requestId: 'retry' };
    client.send(message);
    await vi.waitFor(() => expect(client.messages).toContainEqual(expect.objectContaining({ type: 'submission', accepted: false })));
    expect(state.office!.hasSubmission('retry')).toBe(false);
    expect(state.run).not.toHaveBeenCalled();
    client.send(message);
    await vi.waitFor(() => expect(state.run).toHaveBeenCalledOnce());
    expect(state.office!.hasSubmission('retry')).toBe(true);
  });

  it('marks the failed step as error and skips pending steps on an unexpected worker rejection', async () => {
    state.run.mockResolvedValueOnce({ ok: true, text: '```plano\n[{"agente":"worker","tarefa":"first"},{"agente":"worker","tarefa":"next"}]\n```' })
      .mockRejectedValueOnce(new Error('worker failed'));
    const client = await connect();
    client.send({ type: 'command', prompt: 'test', requestId: 'worker-command' });
    await vi.waitFor(() => expect(client.messages).toContainEqual(expect.objectContaining({
      type: 'plan', plan: expect.objectContaining({ status: 'error', steps: [
        expect.objectContaining({ status: 'error' }), expect.objectContaining({ status: 'skipped' }),
      ] }),
    })));
    expect(state.office!.getAgent('worker')?.status).toBe('error');
  });
});
