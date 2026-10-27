import { describe, expect, it, vi } from 'vitest';
import type { Account, AccountStatus, RoleKey, ServerMessage } from '../shared/types.ts';
import type { RunOutcome } from '../server/agents/runner.ts';
import { Office } from '../server/office.ts';
import { Orchestrator } from '../server/orchestrator.ts';
import type { Member, Team } from '../server/team.ts';

const ok = (text = 'segue'): RunOutcome => ({ ok: true, text });
const plan = (...tasks: string[]) => ok('```plano\n' + JSON.stringify(tasks.map(tarefa => ({ agente: 'worker', tarefa }))) + '\n```');
const replacement = () => ok('Plano atualizado:\n```plano\n[{"agente":"cover","tarefa":"replacement"}]\n```');

function setup(...outcomes: RunOutcome[]) {
  const office = new Office('', {} as Record<Account, AccountStatus>);
  const members = [
    { config: { id: 'lead', nome: 'Lead', papel: 'coordenador', tipo: 'claude' } },
    { config: { id: 'worker', nome: 'Worker', papel: 'executor', tipo: 'codex' } },
    { config: { id: 'cover', nome: 'Cover', papel: 'executor', tipo: 'antigravity' } },
  ].map(member => ({ ...member, runner: { busy: false, stop: vi.fn() } })) as unknown as Member[];
  const run = vi.fn<(member: Member, role: RoleKey, prompt: string) => Promise<RunOutcome>>();
  for (const outcome of outcomes) run.mockResolvedValueOnce(outcome);
  run.mockImplementation(async () => { throw new Error('Unexpected extra turn'); });
  const substitute = vi.fn<(member: Member) => Member | null>(() => null);
  const team = {
    list: () => members, coordinator: () => members[0], workers: () => members.slice(1), busy: false,
    get: (id: string) => members.find(member => member.config.id === id),
    label: (member: Member) => member.config.nome, account: (member: Member) => member.config.tipo,
    handoverNote: () => 'handover', substitute, runAs: run,
  } as unknown as Team;
  const orchestrator = new Orchestrator(office, team);
  const result = () => (office.snapshot() as Extract<ServerMessage, { type: 'snapshot' }>).plan!;
  return { orchestrator, office, members, run, substitute, result };
}

describe('general command completion', () => {
  it('succeeds only after steps, reviews and summary succeed', async () => {
    const { orchestrator, result, run } = setup(plan('first', 'second'), ok('first done'), ok(), ok('second done'), ok(), ok('completed'));
    await orchestrator.start('test', '.');
    expect(result()).toMatchObject({ status: 'done', summary: 'completed' });
    expect(result().steps.map(step => step.status)).toEqual(['done', 'done']);
    expect(run).toHaveBeenCalledTimes(6);
    expect(orchestrator.running).toBe(false);
  });

  it('does not report success when an executed step failed, even if later turns succeed', async () => {
    const { orchestrator, result } = setup(plan('first', 'second'), { ok: false, text: 'failed' }, ok(), ok(), ok(), ok('completed'));
    await orchestrator.start('test', '.');
    expect(result().status).toBe('error');
    expect(result().steps.map(step => step.status)).toEqual(['error', 'done']);
  });

  it.each([
    { ok: false, text: 'summary failed' },
    { ok: false, text: 'summary limited', limited: true },
  ])('fails when the final summary fails: %j', async summary => {
    const { orchestrator, result } = setup(plan('first'), ok(), ok(), summary);
    await orchestrator.start('test', '.');
    expect(result().status).toBe('error');
    expect(result().steps[0].status).toBe('done');
    expect(orchestrator.running).toBe(false);
  });

  it.each([
    { ok: false, text: 'review failed' },
    { ok: false, text: 'review limited', limited: true },
    { ok: false, text: replacement().text },
    ok('Não está aprovado.'),
    ok('```plano\nnot json\n```'),
    ok('```plano\n[{"agente":"unknown","tarefa":"fix"}]\n```'),
  ])('does not continue after an unsuccessful or invalid review: %j', async review => {
    const { orchestrator, result, run } = setup(plan('first', 'second'), ok(), review);
    await orchestrator.start('test', '.');
    expect(result().status).toBe('error');
    expect(result().steps.map(step => step.status)).toEqual(['done', 'skipped']);
    expect(run).toHaveBeenCalledTimes(3);
    expect(orchestrator.running).toBe(false);
  });

  it('allows a valid coordinator replan to replace pending steps', async () => {
    const { orchestrator, result, run } = setup(plan('first', 'obsolete'), ok(), replacement(), ok(), ok('Segue.'), ok('completed'));
    await orchestrator.start('test', '.');
    expect(result().status).toBe('done');
    expect(result().steps.map(step => step.task)).toEqual(['first', 'replacement']);
    const prompts = run.mock.calls.filter(([, role]) => role === 'executor').map(([, , prompt]) => prompt);
    expect(prompts.some(prompt => prompt.includes('obsolete'))).toBe(false);
    expect(prompts.some(prompt => prompt.includes('replacement'))).toBe(true);
  });

  it('keeps a failed executed step visible after replanning instead of converting it into success', async () => {
    const { orchestrator, result } = setup(plan('first'), { ok: false, text: 'failed' }, replacement(), ok(), ok(), ok('completed'));
    await orchestrator.start('test', '.');
    expect(result().status).toBe('error');
    expect(result().steps.map(step => step.status)).toEqual(['error', 'done']);
  });

  it('allows a successful substitute to complete the same limited step', async () => {
    const { orchestrator, result, substitute, members } = setup(plan('first'), { ok: false, text: 'limited', limited: true }, ok(), ok(), ok('completed'));
    substitute.mockReturnValueOnce(members[2]);
    await orchestrator.start('test', '.');
    expect(result().status).toBe('done');
    expect(result().steps).toEqual([expect.objectContaining({ agentId: 'cover', status: 'done' })]);
  });

  it('allows a substitute coordinator to supply a valid review after a usage limit', async () => {
    const { orchestrator, result, substitute, members } = setup(plan('first'), ok(), { ok: false, text: 'limited', limited: true }, ok(), ok('completed'));
    substitute.mockReturnValueOnce(members[2]);
    await orchestrator.start('test', '.');
    expect(result().status).toBe('done');
  });

  it('allows a valid substitute to supply the final summary after a usage limit', async () => {
    const { orchestrator, result, substitute, members } = setup(plan('first'), ok(), ok(), { ok: false, text: 'limited', limited: true }, ok('completed'));
    substitute.mockReturnValueOnce(members[2]);
    await orchestrator.start('test', '.');
    expect(result()).toMatchObject({ status: 'done', summary: 'completed' });
  });

  it('fails and finalizes remaining work when no substitute can complete a limited step', async () => {
    const { orchestrator, result, run } = setup(plan('first', 'second'), { ok: false, text: 'limited', limited: true });
    await orchestrator.start('test', '.');
    expect(result().status).toBe('error');
    expect(result().steps.map(step => step.status)).toEqual(['error', 'skipped']);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('fails if the execution cap skips required steps', async () => {
    const outcomes: RunOutcome[] = [plan('first')];
    for (let i = 0; i < 12; i++) outcomes.push(ok(), plan(`next-${i}`));
    outcomes.push(ok('completed'));
    const { orchestrator, result, run } = setup(...outcomes);
    await orchestrator.start('test', '.');
    expect(result().status).toBe('error');
    expect(result().steps.filter(step => step.status === 'done')).toHaveLength(12);
    expect(result().steps.at(-1)?.status).toBe('skipped');
    expect(run.mock.calls.filter(([, role]) => role === 'executor')).toHaveLength(12);
  });

  it('keeps explicit cancellation distinct from an execution failure', async () => {
    const { orchestrator, result, run } = setup(plan('first', 'second'));
    run.mockImplementationOnce(async () => {
      orchestrator.stop();
      return { ok: false, text: 'cancelled' };
    });
    await orchestrator.start('test', '.');
    expect(result().status).toBe('stopped');
    expect(result().steps.every(step => step.status === 'skipped')).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each(['review', 'summary'])('keeps cancellation during %s stopped rather than reporting failure or success', async stage => {
    const outcomes = [plan('first'), ok()];
    if (stage === 'summary') outcomes.push(ok());
    const { orchestrator, result, run } = setup(...outcomes);
    run.mockImplementationOnce(async () => {
      orchestrator.stop();
      return { ok: false, text: 'cancelled' };
    });
    await orchestrator.start('test', '.');
    expect(result().status).toBe('stopped');
    expect(result().steps[0].status).toBe('done');
    expect(orchestrator.running).toBe(false);
  });
});
