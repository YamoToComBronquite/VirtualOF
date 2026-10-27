import { describe, expect, it, vi } from 'vitest';
import type { Account, AccountStatus, RoleKey, ServerMessage } from '../shared/types.ts';
import type { RunOutcome } from '../server/agents/runner.ts';
import { Office } from '../server/office.ts';
import { Orchestrator } from '../server/orchestrator.ts';
import type { Member, Team } from '../server/team.ts';

type Step = { agente: string; tarefa: string; depois?: number[] };
const ok = (text = 'segue'): RunOutcome => ({ ok: true, text });
const planReply = (steps: Step[]) => ok('```plano\n' + JSON.stringify(steps) + '\n```');

/** Workers answer by task name; each turn waits until the test releases it, so overlap is visible. */
function setup(steps: Step[], results: Record<string, RunOutcome> = {}) {
  const office = new Office('', {} as Record<Account, AccountStatus>);
  const members = [
    { config: { id: 'lead', nome: 'Lead', papel: 'coordenador', tipo: 'claude' } },
    { config: { id: 'a', nome: 'A', papel: 'executor', tipo: 'codex' } },
    { config: { id: 'b', nome: 'B', papel: 'executor', tipo: 'opencode' } },
    { config: { id: 'c', nome: 'C', papel: 'revisor', tipo: 'antigravity' } },
  ].map((member) => ({ ...member, runner: { busy: false, stop: vi.fn() } })) as unknown as Member[];
  const started: string[] = [];
  const running = new Set<string>();
  let maxParallel = 0;
  const waiting: (() => void)[] = [];
  const release = () => waiting.splice(0).forEach((done) => done());
  let planned = false;
  const run = vi.fn(async (member: Member, _role: RoleKey, prompt: string): Promise<RunOutcome> => {
    if (member.config.id === 'lead') {
      if (!planned) return (planned = true), planReply(steps);
      return /Escreva para o usuário/.test(prompt) ? ok('resumo') : ok();
    }
    const task = /: ([^\n]+)$/m.exec(prompt.split('\n\n')[1] ?? '')?.[1] ?? prompt;
    started.push(task);
    running.add(task);
    maxParallel = Math.max(maxParallel, running.size);
    await new Promise<void>((done) => waiting.push(done));
    running.delete(task);
    return results[task] ?? ok(`${task} feito`);
  });
  const substitute = vi.fn<(member: Member, taken?: ReadonlySet<string>) => Member | null>(() => null);
  const team = {
    list: () => members, coordinator: () => members[0], workers: () => members.slice(1), busy: false,
    get: (id: string) => members.find((member) => member.config.id === id),
    label: (member: Member) => member.config.nome, account: (member: Member) => member.config.tipo,
    handoverNote: () => 'handover', substitute, runAs: run,
  } as unknown as Team;
  const orchestrator = new Orchestrator(office, team);
  const result = () => (office.snapshot() as Extract<ServerMessage, { type: 'snapshot' }>).plan!;
  // Let the turns that can start right now start, then let them finish.
  const tick = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  };
  const drive = async (done: Promise<unknown>) => {
    let finished = false;
    void done.then(() => (finished = true));
    for (let i = 0; i < 50 && !finished; i++) {
      await tick();
      release();
    }
    await done;
  };
  return { orchestrator, result, started, members, substitute, drive, maxParallel: () => maxParallel };
}

describe('parallel general command', () => {
  it('runs steps without dependencies at the same time and waits for dependencies', async () => {
    const t = setup([
      { agente: 'a', tarefa: 'front', depois: [] },
      { agente: 'b', tarefa: 'back', depois: [] },
      { agente: 'c', tarefa: 'revisar', depois: [1, 2] },
    ]);
    await t.drive(t.orchestrator.start('cmd', '.'));
    expect(t.result().status).toBe('done');
    expect(t.maxParallel()).toBe(2);
    expect(t.started.indexOf('revisar')).toBe(2);
    expect(t.result().steps.map((s) => s.dependsOn)).toEqual([[], [], [1, 2]]);
  });

  it('gives an agent one step at a time', async () => {
    const t = setup([
      { agente: 'a', tarefa: 'um', depois: [] },
      { agente: 'a', tarefa: 'dois', depois: [] },
    ]);
    await t.drive(t.orchestrator.start('cmd', '.'));
    expect(t.result().status).toBe('done');
    expect(t.maxParallel()).toBe(1);
  });

  it('skips a step whose dependency failed, while independent work still runs', async () => {
    const t = setup(
      [
        { agente: 'a', tarefa: 'quebra', depois: [] },
        { agente: 'b', tarefa: 'solto', depois: [] },
        { agente: 'c', tarefa: 'depende', depois: [1] },
      ],
      { quebra: { ok: false, text: 'erro' } },
    );
    await t.drive(t.orchestrator.start('cmd', '.'));
    expect(t.result().steps.map((s) => s.status)).toEqual(['error', 'done', 'skipped']);
    expect(t.started).not.toContain('depende');
    expect(t.result().status).toBe('error');
  });

  it('never hands a limited step to the coordinator or an agent busy on another step', async () => {
    const t = setup(
      [
        { agente: 'a', tarefa: 'limite', depois: [] },
        { agente: 'b', tarefa: 'ocupado', depois: [] },
      ],
      { limite: { ok: false, text: 'limit', limited: true } },
    );
    t.substitute.mockImplementation((_member, taken) => {
      expect(taken?.has('lead')).toBe(true);
      expect(taken?.has('b')).toBe(true);
      return null;
    });
    await t.drive(t.orchestrator.start('cmd', '.'));
    expect(t.substitute).toHaveBeenCalled();
    expect(t.result().status).toBe('error');
  });
});
