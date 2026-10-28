import { describe, expect, it } from 'vitest';
import type { Account, AccountStatus, PermissionRequest, ServerMessage } from '../shared/types.ts';
import { parseCodexLimits } from '../server/agents/codex.ts';
import { Office } from '../server/office.ts';

function office() {
  const o = new Office('', {} as Record<Account, AccountStatus>);
  const cards: PermissionRequest[] = [];
  o.subscribe((msg: ServerMessage) => {
    if (msg.type === 'permission') cards.push(msg.request);
  });
  return { o, cards };
}

describe('near the usage limit', () => {
  it('does not ask below 90%', async () => {
    const { o, cards } = office();
    o.setQuota('claude', { status: 'warning', utilization: 0.85 });
    expect(await o.confirmLimit('dev', 'claude')).toBe('continue');
    expect(cards).toHaveLength(0);
  });

  it('asks once, even with automatic approval, and remembers the answer until the window resets', async () => {
    const { o, cards } = office();
    o.setPermissionMode('auto');
    o.setQuota('claude', { status: 'warning', utilization: 0.92, window: '5 horas', resetsAt: Date.now() + 60_000 });
    const first = o.confirmLimit('dev', 'claude');
    const second = o.confirmLimit('chefe', 'claude'); // same account: same card
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'limit', summary: expect.stringContaining('92%') });
    o.answerAllPermissions(true); // "approve all" never answers a limit card
    o.answerPermission(cards[0].id, false);
    expect(await first).toBe('switch');
    expect(await second).toBe('switch');
    expect(await o.confirmLimit('dev', 'claude')).toBe('switch');
    expect(cards).toHaveLength(1);
  });

  it('switching to automatic approval leaves limit cards waiting', async () => {
    const { o, cards } = office();
    o.setQuota('codex', { status: 'warning', utilization: 0.95 });
    let answered = false;
    void o.confirmLimit('dev', 'codex').then(() => (answered = true));
    o.setPermissionMode('auto');
    await Promise.resolve();
    expect(answered).toBe(false);
    o.answerPermission(cards[0].id, true);
    await Promise.resolve();
    await Promise.resolve();
    expect(answered).toBe(true);
  });

  it('gives agents a terminal rule that lets them run commands only with full authorization', () => {
    const { o } = office();
    expect(o.terminalRule()).not.toContain('autorização total');
    o.setPermissionMode('auto');
    expect(o.terminalRule()).toContain('autorização total');
  });
});

describe('Codex usage from its session file', () => {
  it('takes the fuller window from the last rate_limits entry', () => {
    const line = (p: number, s: number) =>
      `{"payload":{"rate_limits":{"limit_id":"codex","primary":{"used_percent":${p},"window_minutes":300,"resets_at":1793142814},"secondary":{"used_percent":${s},"window_minutes":10080,"resets_at":1793619271}}}}`;
    expect(parseCodexLimits(`${line(10, 20)}\n${line(91, 40)}\n`)).toEqual({
      status: 'warning', utilization: 0.91, window: '5 horas', resetsAt: 1793142814000,
    });
    expect(parseCodexLimits('{"no":"limits"}')).toBeUndefined();
  });
});
