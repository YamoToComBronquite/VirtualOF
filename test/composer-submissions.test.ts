import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

// Exercise the actual receive branches with minimal UI stand-ins, without starting agents.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const rejection = source.slice(source.indexOf("    case 'submission': {"), source.indexOf("    case 'snapshot':"));

// Exercise production transitions; these stand-ins do not validate browser rendering.
function recovery() {
  const original = { name: 'original.png', mime: 'image/png', data: 'original' };
  const extra = { name: 'new.png', mime: 'image/png', data: 'new' };
  const env = {
    pendingSubmission: { id: 'stable-id', prompt: 'original', images: [original], target: 'worker', serverId: 'server', retry: false },
    serverId: 'server', socket: { readyState: 1 } as { readyState: number } | undefined,
    WebSocket: { OPEN: 1 }, commandField: { value: 'original' }, attachments: [original],
    imageError: { hidden: false }, sessionImages: new Map(), renderAttachments: vi.fn(),
    growCommand: vi.fn(), renderPendingSubmission: vi.fn(), toast: vi.fn(), translate: (text: string) => text,
    send: vi.fn(), badge: { querySelector: () => ({ textContent: '' }), classList: { remove: vi.fn() } },
    setTimeout: vi.fn(), connect: vi.fn(),
  };
  const helpers = source.slice(source.indexOf('function finishSubmission()'), source.indexOf('const attachmentList'));
  const responses = source.slice(source.indexOf("    case 'submission-status':"), source.indexOf("    case 'snapshot':"));
  const close = source.slice(source.indexOf('  ws.onclose = () => {') + '  ws.onclose = () => {'.length,
    source.indexOf('  ws.onmessage =')).replace(/};\s*$/, '');
  const actions = new Function('env', `with (env) {
    ${helpers}
    return { checkPendingSubmission, transmitPendingSubmission,
      receive: msg => { switch (msg.type) { ${responses} } },
      disconnect: () => { ${stripTypeScriptTypes(close)} } };
  }`)(env);
  return { env, actions, original, extra };
}

describe('pending submission identity and acknowledgement', () => {
  it('retains identity and attachments on disconnect, then queries before retrying', () => {
    const { env, actions, original } = recovery();
    actions.disconnect();
    expect(env.pendingSubmission.id).toBe('stable-id');
    expect(env.attachments).toEqual([original]);
    expect(env.socket).toBeUndefined();
    env.socket = { readyState: 1 };
    actions.checkPendingSubmission();
    expect(env.send).toHaveBeenCalledWith({ type: 'submission-status', requestId: 'stable-id' });
  });

  it.each(['server', 'restarted'])('allows retry only within original instance (%s)', serverId => {
    const { env, actions } = recovery();
    actions.receive({ type: 'submission-status', requestId: 'stable-id', accepted: false, serverId });
    expect(env.pendingSubmission.retry).toBe(serverId === 'server');
    expect(env.pendingSubmission.id).toBe('stable-id');
    expect(env.send).not.toHaveBeenCalled();
  });

  it('retries the immutable payload and keeps it after a synchronous send failure', () => {
    const { env, actions, original, extra } = recovery();
    env.commandField.value = 'new text'; env.attachments = [extra];
    actions.transmitPendingSubmission();
    expect(env.send).toHaveBeenCalledWith({ type: 'task', agentId: 'worker', prompt: 'original', images: [original], requestId: 'stable-id' });
    env.send.mockImplementationOnce(() => { throw new Error('disconnected'); });
    expect(() => actions.transmitPendingSubmission()).not.toThrow();
    expect(env.pendingSubmission.id).toBe('stable-id');
    expect(env.commandField.value).toBe('new text');
    expect(env.attachments).toEqual([extra]);
  });

  it.each(['submission', 'submission-status'])('recognizes %s without deleting new text or new attachments', type => {
    const { env, actions, original, extra } = recovery();
    env.commandField.value = 'new text'; env.attachments = [original, extra];
    actions.receive({ type, requestId: 'stable-id', accepted: true, duplicate: true, serverId: 'server' });
    expect(env.pendingSubmission).toBeUndefined();
    expect(env.commandField.value).toBe('new text');
    expect(env.attachments).toEqual([extra]);
    expect(env.send).not.toHaveBeenCalled();
  });

  it('ignores acknowledgements for a different pending message', () => {
    const { env, actions, original } = recovery();
    actions.receive({ type: 'submission', requestId: 'another-id', accepted: true });
    expect(env.pendingSubmission.id).toBe('stable-id');
    expect(env.attachments).toEqual([original]);
  });
});
function reply(editedText: boolean, removedImage: boolean) {
  const image = { name: 'original.png', mime: 'image/png', data: 'original' };
  const draft = { id: 'id', prompt: 'original', images: [image], serverId: 'server', retry: false };
  const commandField = { value: editedText ? 'new text' : draft.prompt };
  const attachments = removedImage ? [] : [image];
  const sessionImages = new Map([[draft.id, draft.images]]);
  const receive = new Function('pendingSubmission', 'commandField', 'attachments', 'sessionImages',
    'renderPendingSubmission', 'toast', 'translate', 'finishSubmission',
    `return msg => { switch(msg.type) { ${rejection} } return pendingSubmission; };`)(
    draft, commandField, attachments, sessionImages, vi.fn(), vi.fn(), (text: string) => text, vi.fn());
  const pending = receive({ type: 'submission', requestId: draft.id, accepted: false, serverId: 'server', text: 'busy' });
  return { pending, draft, commandField, attachments, sessionImages };
}

describe('refused submission recovery', () => {
  it('leaves an unchanged refused draft in the editable composer', () => {
    const result = reply(false, false);
    expect(result.pending).toBeUndefined();
    expect(result.commandField.value).toBe('original');
    expect(result.attachments).toEqual(result.draft.images);
  });

  it.each([[true, false], [false, true], [true, true]])('keeps the refused original separately when text=%s or images=%s changed', (text, image) => {
    const result = reply(text, image);
    expect(result.pending).toBe(result.draft);
    expect(result.pending).toMatchObject({ rejected: true, retry: true });
    expect(result.sessionImages.get('id')).toEqual(result.draft.images);
    expect(result.commandField.value).toBe(text ? 'new text' : 'original');
    expect(result.attachments).toHaveLength(image ? 0 : 1);
  });

  it('queries acceptance after a snapshot even when its log contains the request id', () => {
    const snapshot = source.slice(source.indexOf("    case 'snapshot':"), source.indexOf('      shell.clear();'));
    const check = vi.fn(), finish = vi.fn();
    new Function('msg', 'pendingSubmission', 'checkPendingSubmission', 'finishSubmission',
      `let serverId; switch(msg.type) { ${snapshot} break; }`)(
      { type: 'snapshot', serverId: 'server', log: [{ requestId: 'id' }] }, { id: 'id' }, check, finish);
    expect(check).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
  });
});
