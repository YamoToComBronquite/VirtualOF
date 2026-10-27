import { z } from 'zod';
import { ROLE_NAMES, type Plan, type PlanStep } from '../shared/types.ts';
import { imagesNote, type RunImage, type RunOutcome } from './agents/runner.ts';
import type { Office } from './office.ts';
import type { Member, Team } from './team.ts';

/** Hard stop so a coordinator that keeps re-planning cannot loop forever. */
const MAX_STEPS = 12;
const RESULT_CHARS = 2500;

const PlanBlock = z
  .array(z.object({ agente: z.string(), tarefa: z.string().min(1), depois: z.array(z.number().int().positive()).optional() }))
  .min(1)
  .max(8);

/** Finds the last ```plano block in a coordinator reply and checks it names real agents. */
export function parsePlan(text: string, ids: string[]) {
  const blocks = [...text.matchAll(/```plano\s*([\s\S]*?)```/g)];
  const last = blocks.at(-1);
  if (!last) return null;
  try {
    const steps = PlanBlock.parse(JSON.parse(last[1]));
    return steps.every((s) => ids.includes(s.agente)) ? steps : null;
  } catch {
    return null;
  }
}

const clip = (text: string) => (text.length > RESULT_CHARS ? `${text.slice(0, RESULT_CHARS)}\n[…cortado]` : text);

type PlannedStep = { agente: string; tarefa: string; depois?: number[] };

/**
 * Runs a general command: the coordinator writes the plan, the office hands every step whose
 * dependencies are done to its agent (independent steps run at the same time, one step per
 * agent), and after every step the coordinator may rewrite what is still pending.
 */
export class Orchestrator {
  private plan: Plan | null = null;
  private stopped = false;
  private nextStepId = 1;
  /** Agents working on a step right now, including stand-ins; nobody hands them a second job. */
  private working = new Set<string>();
  private outcomes = new Map<number, RunOutcome>();
  private active = new Map<number, Promise<void>>();
  /** Whoever coordinates right now; it changes if the coordinator's account hits its limit. */
  private lead!: Member;
  private cwd = '';
  private images: RunImage[] = [];
  private imageRecipients = new Set<string>();

  constructor(
    private readonly office: Office,
    private readonly team: Team,
  ) {}

  get running() {
    return this.plan?.status === 'planning' || this.plan?.status === 'running';
  }

  stop() {
    if (!this.running || !this.plan) return;
    this.stopped = true;
    for (const member of this.team.list()) member.runner.stop();
    this.plan.status = 'stopped';
    for (const step of this.plan.steps) {
      if (step.status === 'pending' || step.status === 'running') step.status = 'skipped';
    }
    this.publish();
  }

  /** An unexpected runner rejection must release the plan just like a normal failure. */
  fail(summary: string) {
    if (!this.running || !this.plan) return;
    this.stopped = true;
    // Steps running in parallel with the one that failed stop too.
    for (const id of this.working) this.team.get(id)?.runner.stop();
    for (const step of this.plan.steps) {
      if (step.status === 'running') {
        step.status = 'error';
        this.office.setStatus(step.agentId, 'error', 'A tarefa falhou');
      } else if (step.status === 'pending') step.status = 'skipped';
    }
    this.office.setStatus(this.lead.config.id, 'error', 'O comando geral falhou');
    this.finish('error', summary);
  }

  /** Images go only to each agent's first turn within this command. */
  async start(command: string, cwd: string, images: RunImage[] = []) {
    const error = this.startError();
    if (error) return this.office.notice(error);
    const coordinator = this.team.coordinator()!;
    const workers = this.team.workers();

    this.stopped = false;
    this.images = images;
    this.imageRecipients.clear();
    this.working.clear();
    this.outcomes.clear();
    this.active.clear();
    this.nextStepId = 1; // the coordinator refers to steps by these numbers
    this.lead = coordinator;
    this.cwd = cwd;
    this.plan = { command, status: 'planning', steps: [] };
    this.publish();

    const ids = workers.map((w) => w.config.id);
    let reply = await this.ask(this.planningPrompt(command, workers));
    let steps = reply.ok ? parsePlan(reply.text, ids) : null;
    if (reply.ok && !steps && !this.stopped) {
      reply = await this.ask(
        `Não consegui ler o plano. Responda de novo só com o bloco \`\`\`plano, em JSON válido, usando apenas estes ids: ${ids.join(', ')}.`,
      );
      steps = reply.ok ? parsePlan(reply.text, ids) : null;
    }
    if (this.stopped) return;
    if (!steps) return this.finish('error', reply.ok ? 'O coordenador não montou um plano que eu consiga seguir.' : reply.text);

    this.replaceRemaining(steps);
    this.plan.status = 'running';
    this.publish();

    // Steps run as soon as what they depend on is done and their agent is free; the coordinator
    // reviews each finished step (one at a time) while the others keep working.
    const finished: PlanStep[] = [];
    const reviewed = new Set<number>();
    let executed = 0;
    try {
      while (!this.stopped) {
        executed = this.launchReady(command, reviewed, finished, executed);
        const step = finished.shift();
        if (step) {
          if (!(await this.review(step, ids))) return;
          reviewed.add(step.id);
          continue;
        }
        if (this.active.size) {
          await Promise.race(this.active.values());
          continue;
        }
        // Nothing running and nothing to review: whatever is still pending can never start.
        const stuck = this.plan.steps.filter((s) => s.status === 'pending');
        if (!stuck.length) break;
        for (const s of stuck) s.status = 'skipped';
        this.publish();
      }
    } finally {
      // A failure or stop ends the plan at once; let the steps still running settle first.
      await Promise.allSettled(this.active.values());
    }
    if (this.stopped) return;

    // Valid replanning replaces only pending work. Failed executed steps and cap-skipped work
    // remain in the plan and cannot be turned into success by a successful summary.
    const allDone = this.plan.steps.every((step) => step.status === 'done');
    const summary = await this.ask(
      (allDone ? 'Todos os passos terminaram. ' : 'O plano tem passos com erro ou ignorados e não foi concluído com sucesso. ') +
      'Escreva para o usuário um resumo curto do que foi feito e do que ainda falta, se faltar algo. Sem bloco de plano.',
    );
    if (this.stopped) return;
    if (summary.limited) return this.fail(this.outOfLimits());
    if (!summary.ok) return this.fail(`O resumo final falhou: ${summary.text || '(sem resposta)'}`);
    this.finish(allDone ? 'done' : 'error', allDone ? summary.text : `O plano terminou com passos em erro ou ignorados.\n${summary.text}`);
  }

  /**
   * Starts every pending step that can run now. A step with `dependsOn` waits for those steps
   * to be done (and is skipped if one of them failed); one without it is from a plan with no
   * dependencies and waits for every earlier step to finish and be reviewed, as before.
   */
  private launchReady(command: string, reviewed: Set<number>, finished: PlanStep[], executed: number) {
    if (!this.plan) return executed;
    let changed = false;
    for (const step of this.plan.steps) {
      if (step.status !== 'pending') continue;
      if (step.dependsOn) {
        const deps = this.plan.steps.filter((s) => step.dependsOn!.includes(s.id));
        if (deps.some((s) => s.status === 'error' || s.status === 'skipped')) {
          step.status = 'skipped';
          changed = true;
          continue;
        }
        if (!deps.every((s) => s.status === 'done')) continue;
      } else {
        const earlier = this.plan.steps.filter((s) => s.id < step.id);
        if (!earlier.every((s) => s.status === 'skipped' || reviewed.has(s.id))) continue;
      }
      const member = this.team.get(step.agentId);
      if (!member) {
        step.status = 'skipped';
        changed = true;
        continue;
      }
      if (this.working.has(step.agentId) || member.runner.busy) continue; // one step per agent at a time
      if (executed >= MAX_STEPS) {
        step.status = 'skipped';
        changed = true;
        continue;
      }
      executed++;
      changed = true;
      const run = this.executeStep(step, member, command)
        .then(() => {
          if (!this.stopped) finished.push(step);
        })
        .finally(() => this.active.delete(step.id));
      this.active.set(step.id, run);
    }
    if (changed) this.publish();
    return executed;
  }

  /** Agents that cannot take over anything right now: the coordinator and whoever is on a step. */
  private unavailable() {
    return new Set([this.lead.config.id, ...this.working]);
  }

  /** Runs one step on its agent; if the account hits its limit, a free agent on another account takes over. */
  private async executeStep(step: PlanStep, first: Member, command: string) {
    let member = first;
    this.working.add(member.config.id);
    // The step keeps the role of the agent it was planned for, even if someone covers it.
    const role = member.config.papel === 'folga' || member.config.papel === 'coordenador' ? 'executor' : member.config.papel;
    step.status = 'running';
    try {
      const parallel = this.plan!.steps.some((s) => s !== step && s.status === 'running');
      const prompt =
        `Comando geral do usuário: "${command}"\n\nSua parte (passo ${step.id} de ${this.plan!.steps.length}): ${step.task}` +
        (parallel ? '\n\nOutros agentes estão trabalhando no projeto ao mesmo tempo. Mexa só no que a sua parte pede.' : '');
      let since = this.office.lastLogId;
      let outcome: RunOutcome = { ok: false, text: '', limited: this.office.isLimited(this.team.account(member)) };
      if (!outcome.limited) outcome = await this.runWithImages(member, role, prompt);
      while (outcome.limited && this.office.autoSwitch && !this.stopped) {
        const cover = this.team.substitute(member, this.unavailable());
        if (!cover) break;
        this.handover(member, cover, `o passo ${step.id}`);
        this.working.delete(member.config.id);
        this.working.add(cover.config.id);
        step.agentId = cover.config.id;
        this.publish();
        const note = this.team.handoverNote(member, prompt, since, outcome.text);
        member = cover;
        since = this.office.lastLogId;
        outcome = await this.runWithImages(member, role, note);
      }
      if (this.stopped) return;
      if (outcome.limited) return this.fail(this.outOfLimits());
      this.outcomes.set(step.id, outcome);
      step.status = outcome.ok ? 'done' : 'error';
    } catch (error) {
      if (this.stopped) return;
      const text = error instanceof Error ? error.message : String(error);
      this.office.setStatus(member.config.id, 'error', 'A tarefa falhou');
      this.office.write(member.config.id, 'error', `A tarefa falhou: ${text}`);
      this.outcomes.set(step.id, { ok: false, text });
      step.status = 'error';
    } finally {
      this.working.delete(member.config.id);
    }
    this.publish();
  }

  /** The coordinator looks at a finished step and may rewrite what is still pending. False ends the plan. */
  private async review(step: PlanStep, ids: string[]) {
    const plan = this.plan!;
    const outcome = this.outcomes.get(step.id) ?? { ok: false, text: '' };
    const line = (s: PlanStep) => `#${s.id} ${s.agentId}${s.dependsOn?.length ? ` (depois de ${s.dependsOn.map((d) => `#${d}`).join(', ')})` : ''}: ${s.task}`;
    const running = plan.steps.filter((s) => s.status === 'running');
    const remaining = plan.steps.filter((s) => s.status === 'pending');
    const review = await this.ask(
      `Passo ${step.id} (${this.team.label(this.team.get(step.agentId) ?? this.lead)}) ${outcome.ok ? 'terminou' : 'falhou'}. Resultado:\n${clip(outcome.text || '(sem resposta)')}\n\n` +
        (running.length ? `Em andamento agora: ${running.map(line).join(' | ')}.\n` : '') +
        (remaining.length ? `Próximos passos: ${remaining.map(line).join(' | ')}.\n` : 'Não há mais passos no plano.\n') +
        'Se o plano precisa mudar (por exemplo, para corrigir o que o revisor apontou), termine com um novo bloco ```plano com TODOS os passos que faltam ' +
        `(os que estão em andamento continuam; os passos novos serão numerados a partir de #${this.nextStepId}, e "depois" pode citar qualquer número). ` +
        'Se um agente falhou por limite de uso, login ou algo fora do controle dele, não mande a mesma coisa para ele de novo: passe para outro agente ou siga sem esse passo. ' +
        'Se não precisa mudar nada, responda só: segue.',
    );
    if (this.stopped) return false;
    if (review.limited) return this.fail(this.outOfLimits()), false;
    if (!review.ok) return this.fail(`A revisão do passo ${step.id} falhou: ${review.text || '(sem resposta)'}`), false;
    const revised = parsePlan(review.text, ids);
    if (revised) {
      this.replaceRemaining(revised);
      this.publish();
    } else if (!/^segue[.!]?$/i.test(review.text.trim())) {
      this.fail(`A revisão do passo ${step.id} não confirmou a continuação nem apresentou um plano válido: ${clip(review.text || '(sem resposta)')}`);
      return false;
    }
    return true;
  }

  /** Check before accepting a browser submission, using the same rules as start(). */
  startError() {
    if (this.running) return 'Já tem um comando geral em andamento.';
    if (!this.team.list().length) return 'O escritório está vazio. Monte a equipe em Ajustes.';
    if (!this.team.coordinator()) return 'Escolha um coordenador em Configurações.';
    if (!this.team.workers().some((w) => w.config.papel === 'executor')) return 'A equipe precisa de pelo menos um fullstack.';
    if (this.team.busy) return 'Espere os agentes terminarem a tarefa atual.';
    return null;
  }

  /**
   * Asks the coordinator. If its account is over the limit, someone on another account takes
   * over the coordination for the rest of this command, briefed on what happened so far.
   */
  private async ask(prompt: string) {
    let outcome: RunOutcome = { ok: false, text: '', limited: this.office.isLimited(this.team.account(this.lead)) };
    if (!outcome.limited) outcome = await this.runWithImages(this.lead, 'coordenador', prompt);
    while (outcome.limited && this.office.autoSwitch && !this.stopped) {
      const cover = this.team.substitute(this.lead, this.working);
      if (!cover) break;
      const previous = this.lead;
      this.handover(previous, cover, 'a coordenação');
      this.lead = cover;
      outcome = await this.runWithImages(cover, 'coordenador', `${this.briefing(previous)}\n\n${prompt}`);
    }
    return outcome;
  }

  private runWithImages(member: Member, role: Parameters<Team['runAs']>[1], prompt: string) {
    const first = !this.imageRecipients.has(member.config.id);
    this.imageRecipients.add(member.config.id);
    return this.team.runAs(member, role, prompt, this.cwd,
      !first && this.images.length ? imagesNote(this.images) : undefined, first ? this.images : []);
  }

  /** Catches up a stand-in coordinator, who did not see the conversation so far. */
  private briefing(previous: Member) {
    const steps = this.plan?.steps.map((s, i) => `${i + 1}. ${s.agentId} (${s.status}): ${s.task}`).join('\n') || 'nenhum ainda';
    return `Você assumiu a coordenação porque ${this.team.label(previous)} bateu o limite de uso. Comando geral do usuário: "${this.plan?.command}".\nPlano até agora:\n${steps}`;
  }

  private handover(from: Member, to: Member, what: string) {
    const text = `${this.team.label(from)} bateu o limite de uso. ${this.team.label(to)} assumiu ${what}.`;
    this.office.write(to.config.id, 'permission', text);
    this.office.notice(text);
  }

  private outOfLimits() {
    const accounts = new Set(this.team.list().map((m) => this.team.account(m)));
    const blocked = [...accounts].every((a) => this.office.isLimited(a));
    if (!this.office.autoSwitch) return 'Um agente bateu o limite de uso e a troca automática está desligada (Configurações).';
    return blocked
      ? 'Todas as contas bateram o limite de uso. Veja em Consumo quando cada uma volta e mande o comando de novo.'
      : 'Um agente bateu o limite de uso e não havia ninguém livre de outra conta para assumir.';
  }

  private planningPrompt(command: string, workers: Member[]) {
    const roster = workers
      .map((w) => {
        const can = {
          coordenador: '',
          designer: 'cuida da interface e da experiência de uso (UI/UX), edita arquivos',
          executor: 'fullstack: programa front e back, edita arquivos e roda comandos',
          tester: 'escreve e roda testes, edita arquivos de teste',
          revisor: 'só lê e aponta problemas, não edita',
          folga: '',
        }[w.config.papel];
        return `- id "${w.config.id}": ${this.team.label(w)}, ${ROLE_NAMES[w.config.papel]} (${can})`;
      })
      .join('\n');
    return [
      `Comando geral do usuário: "${command}"`,
      '',
      'Monte o plano para a equipe. Equipe disponível:',
      roster,
      '',
      'Regras do plano:',
      '- Cada passo vai para UM agente e precisa ser uma tarefa completa e autoexplicativa, porque o agente não vê este comando inteiro.',
      '- Os passos são numerados a partir de 1, na ordem do bloco. Passos de agentes diferentes rodam AO MESMO TEMPO; use "depois" com os números dos passos que precisam terminar antes ([] começa na hora). Cada agente faz um passo por vez.',
      '- Divida o trabalho para a equipe trabalhar em paralelo, mas nunca ponha ao mesmo tempo dois passos que mexem nos mesmos arquivos.',
      '- Coloque revisão depois das mudanças importantes (com "depois" apontando para elas).',
      '- Você pode olhar os arquivos do projeto para planejar, mas não edite nada.',
      '- No máximo 8 passos.',
      '',
      'Termine a resposta com um bloco assim, e nada depois dele:',
      '```plano',
      '[{"agente": "<id>", "tarefa": "<o que fazer>", "depois": []}, {"agente": "<id>", "tarefa": "<o que fazer>", "depois": [1]}]',
      '```',
    ].join('\n');
  }

  /**
   * Keeps started and finished steps and swaps everything still pending for the new list.
   * "depois" may only point back (to an earlier number), which also rules out cycles.
   */
  private replaceRemaining(steps: PlannedStep[]) {
    if (!this.plan) return;
    const kept = this.plan.steps.filter((s) => s.status !== 'pending');
    const first = this.nextStepId;
    const known = new Set([...kept.map((s) => s.id), ...steps.map((_, i) => first + i)]);
    this.plan.steps = [
      ...kept,
      ...steps.map((s) => {
        const id = this.nextStepId++;
        const step: PlanStep = { id, agentId: s.agente, task: s.tarefa, status: 'pending' };
        if (s.depois) step.dependsOn = [...new Set(s.depois)].filter((d) => d < id && known.has(d));
        return step;
      }),
    ];
  }

  private finish(status: 'done' | 'error', summary: string) {
    this.images = [];
    if (!this.plan) return;
    this.plan.status = status;
    this.plan.summary = summary;
    this.publish();
  }

  private publish() {
    // Send a copy so later mutations don't race with serialization.
    this.office.showPlan(this.plan && structuredClone(this.plan));
  }
}
