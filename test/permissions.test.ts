import { describe, expect, it } from 'vitest';
import type { Account, AccountStatus, ServerMessage } from '../shared/types.ts';
import { Office } from '../server/office.ts';

function office() {
  const o = new Office('', {} as Record<Account, AccountStatus>);
  const sent: ServerMessage[] = [];
  o.subscribe((msg) => sent.push(msg));
  const state = () => o.snapshot() as Extract<ServerMessage, { type: 'snapshot' }>;
  const log = () => state().log.map((e) => e.text);
  return { o, sent, log, state };
}

/** Resolves to the answer, or 'pending' if the request is still waiting after the microtasks run. */
async function settled<T>(promise: Promise<T>) {
  return Promise.race([promise, new Promise<'pending'>((r) => setTimeout(() => r('pending'), 0))]);
}

describe('manual mode', () => {
  it('starts manual and waits for answerPermission', async () => {
    const { o, state, log } = office();
    expect(o.permissionMode).toBe('manual');
    const asked = o.askPermission('a', 'Bash', 'npm test');
    expect(await settled(asked)).toBe('pending');
    const [request] = state().permissions;
    expect(request).toMatchObject({ agentId: 'a', tool: 'Bash', summary: 'npm test' });
    o.answerPermission(request.id, true);
    expect(await asked).toBe(true);
    expect(state().permissions).toEqual([]);
    expect(log()).toEqual(['Pediu permissão: Bash · npm test', 'Aprovado: Bash']);
  });

  it('denies with false', async () => {
    const { o, state } = office();
    const asked = o.askPermission('a', 'Edit', 'x.ts');
    o.answerPermission(state().permissions[0].id, false);
    expect(await asked).toBe(false);
  });

  it('ignores an answer to an unknown id', () => {
    const { o, log } = office();
    o.answerPermission('nope', true);
    expect(log()).toEqual([]);
  });
});

describe('auto mode', () => {
  it('approves right away, without a sticky note, and logs it', async () => {
    const { o, sent, state, log } = office();
    o.setPermissionMode('auto');
    expect(await settled(o.askPermission('a', 'Write', 'y.ts'))).toBe(true);
    expect(state().permissions).toEqual([]);
    expect(sent.some((m) => m.type === 'permission')).toBe(false);
    expect(log()).toEqual(['Aprovado automaticamente: Write · y.ts']);
  });

  it('switching to auto approves what was waiting, and tells every page', async () => {
    const { o, sent, state } = office();
    const first = o.askPermission('a', 'Bash', 'ls');
    const second = o.askPermission('b', 'Edit', 'z.ts');
    o.setPermissionMode('auto');
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(state().permissions).toEqual([]);
    expect(state().permissionMode).toBe('auto');
    expect(sent).toContainEqual({ type: 'permission-mode', mode: 'auto' });
  });

  it('switching back to manual asks again', async () => {
    const { o } = office();
    o.setPermissionMode('auto');
    o.setPermissionMode('manual');
    expect(await settled(o.askPermission('a', 'Bash', 'ls'))).toBe('pending');
  });
});

describe('answer all', () => {
  it.each([true, false])('answers every pending request with %s', async (allow) => {
    const { o, state, log } = office();
    const asked = [o.askPermission('a', 'Bash', 'ls'), o.askPermission('b', 'Edit', 'x.ts'), o.askPermission('a', 'Write', 'y.ts')];
    o.answerAllPermissions(allow);
    expect(await Promise.all(asked)).toEqual([allow, allow, allow]);
    expect(state().permissions).toEqual([]);
    const word = allow ? 'Aprovado' : 'Negado';
    expect(log().filter((t) => t.startsWith(`${word}:`))).toEqual([`${word}: Bash`, `${word}: Edit`, `${word}: Write`]);
  });

  it('does not answer a request twice', async () => {
    const { o, state, sent, log } = office();
    const first = o.askPermission('a', 'Bash', 'ls');
    const second = o.askPermission('a', 'Edit', 'x.ts');
    o.answerPermission(state().permissions[0].id, false);
    o.answerAllPermissions(true);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(sent.filter((m) => m.type === 'permission-resolved')).toHaveLength(2);
    expect(log().filter((t) => /^(Aprovado|Negado):/.test(t))).toEqual(['Negado: Bash', 'Aprovado: Edit']);
  });
});

describe('terminal cards', () => {
  it('are left alone by auto mode and by answer all', () => {
    const { o, state, sent } = office();
    o.needTerminal('a', 'claude login', 'precisa entrar');
    o.answerAllPermissions(true);
    o.setPermissionMode('auto');
    o.answerAllPermissions(false);
    expect(state().terminal).toEqual([expect.objectContaining({ command: 'claude login' })]);
    expect(sent.some((m) => m.type === 'terminal-cleared')).toBe(false);
  });
});

describe('abort signal', () => {
  it('cancels a pending request with false', async () => {
    const { o, state, sent } = office();
    const abort = new AbortController();
    const asked = o.askPermission('a', 'Bash', 'ls', abort.signal);
    abort.abort();
    expect(await asked).toBe(false);
    expect(state().permissions).toEqual([]);
    expect(sent.filter((m) => m.type === 'permission-resolved')).toHaveLength(1);
    // An answer that arrives later changes nothing.
    o.answerAllPermissions(true);
    expect(sent.filter((m) => m.type === 'permission-resolved')).toHaveLength(1);
  });

  it.each(['manual', 'auto'] as const)('cancels an already-aborted request in %s mode', async (mode) => {
    const { o, state, log } = office();
    o.setPermissionMode(mode);
    const abort = new AbortController();
    abort.abort();
    expect(await settled(o.askPermission('a', 'Bash', 'ls', abort.signal))).toBe(false);
    expect(state().permissions).toEqual([]);
    expect(log()).toEqual([]);
  });
});
