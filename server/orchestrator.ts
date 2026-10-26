import { z } from 'zod';
import type { Plan } from '../shared/types.ts';
import type { RunOutcome } from './agents/runner.ts';
import type { Office } from './office.ts';
import type { Member, Team } from './team.ts';

/** Hard stop so a coordinator that keeps re-planning cannot loop forever. */
const MAX_STEPS = 12;
const RESULT_CHARS = 2500;

const PlanBlock = z
  .array(z.object({ agente: z.string(), tarefa: z.string().min(1) }))
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

/**
 * Runs a general command: the coordinator writes the plan, the office hands each step to
 * its agent in order, and after every step the coordinator may rewrite what is left.
 */
export class Orchestrator {
  private plan: Plan | null = null;
  private stopped = false;
  private nextStepId = 1;
  /** Whoever coordinates right now; it changes if the coordinator's account hits its limit. */
  private lead!: Member;
  private cwd = '';

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
    for (const step of this.plan.steps) if (step.status === 'pending') step.status = 'skipped';
    this.publish();
  }

  async start(command: string, cwd: string) {
    if (this.running) return this.office.notice('Já tem um comando geral em andamento.');
    const coordinator = this.team.coordinator();
    if (!coordinator) return this.office.notice('Escolha um coordenador em Configurações.');
    const workers = this.team.workers();
    if (!workers.some((w) => w.config.papel === 'executor')) return this.office.notice('A equipe precisa de pelo menos um executor.');
    if (this.team.busy) return this.office.notice('Espere os agentes terminarem a tarefa atual.');

    this.stopped = false;
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

    let executed = 0;
    for (let step = this.nextPending(); step && !this.stopped; step = this.nextPending()) {
      if (executed++ >= MAX_STEPS) {
        step.status = 'skipped';
        continue;
      }
      let member = this.team.get(step.agentId)!;
      // The step keeps the role of the agent it was planned for, even if someone covers it.
      const role = member.config.papel === 'folga' || member.config.papel === 'coordenador' ? 'executor' : member.config.papel;
      step.status = 'running';
      this.publish();

      const position = this.plan.steps.indexOf(step) + 1;
      const prompt = `Comando geral do usuário: "${command}"\n\nSua parte (passo ${position} de ${this.plan.steps.length}): ${step.task}`;
      let outcome: RunOutcome = { ok: false, text: '', limited: this.office.isLimited(this.team.account(member)) };
      if (!outcome.limited) outcome = await this.team.runAs(member, role, prompt, cwd);
      while (outcome.limited && this.office.autoSwitch && !this.stopped) {
        const cover = this.team.substitute(member);
        if (!cover) break;
        this.handover(member, cover, `o passo ${position}`);
        step.agentId = cover.config.id;
        this.publish();
        member = cover;
        outcome = await this.team.runAs(member, role, prompt, cwd);
      }
      if (this.stopped) return;
      if (outcome.limited) return this.finish('error', this.outOfLimits());
      step.status = outcome.ok ? 'done' : 'error';
      this.publish();

      const remaining = this.plan.steps.filter((s) => s.status === 'pending');
      const review = await this.ask(
        `Passo ${position} (${this.team.label(member)}) ${outcome.ok ? 'terminou' : 'falhou'}. Resultado:\n${clip(outcome.text || '(sem resposta)')}\n\n` +
          (remaining.length
            ? `Próximos passos: ${remaining.map((s) => `${s.agentId}: ${s.task}`).join(' | ')}.\n`
            : 'Não há mais passos no plano.\n') +
          'Se o plano precisa mudar (por exemplo, para corrigir o que o revisor apontou), termine com um novo bloco ```plano com TODOS os passos que faltam. ' +
          'Se um agente falhou por limite de uso, login ou algo fora do controle dele, não mande a mesma coisa para ele de novo: passe para outro agente ou siga sem esse passo. ' +
          'Se não precisa mudar nada, responda só: segue.',
      );
      if (this.stopped) return;
      if (review.limited) return this.finish('error', this.outOfLimits());
      const revised = review.ok ? parsePlan(review.text, ids) : null;
      if (revised) {
        this.replaceRemaining(revised);
        this.publish();
      }
    }
    if (this.stopped) return;

    const summary = await this.ask(
      'Todos os passos terminaram. Escreva para o usuário um resumo curto do que foi feito e do que ainda falta, se faltar algo. Sem bloco de plano.',
    );
    if (this.stopped) return;
    this.finish('done', summary.limited ? 'Todos os passos terminaram, mas o coordenador bateu o limite antes do resumo.' : summary.text);
  }

  /**
   * Asks the coordinator. If its account is over the limit, someone on another account takes
   * over the coordination for the rest of this command, briefed on what happened so far.
   */
  private async ask(prompt: string) {
    let outcome: RunOutcome = { ok: false, text: '', limited: this.office.isLimited(this.team.account(this.lead)) };
    if (!outcome.limited) outcome = await this.team.runAs(this.lead, 'coordenador', prompt, this.cwd);
    while (outcome.limited && this.office.autoSwitch && !this.stopped) {
      const cover = this.team.substitute(this.lead);
      if (!cover) break;
      const previous = this.lead;
      this.handover(previous, cover, 'a coordenação');
      this.lead = cover;
      outcome = await this.team.runAs(cover, 'coordenador', `${this.briefing(previous)}\n\n${prompt}`, this.cwd);
    }
    return outcome;
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
        const can = w.config.papel === 'executor' ? 'edita arquivos e roda comandos' : 'só lê e aponta problemas, não edita';
        return `- id "${w.config.id}": ${this.team.label(w)}, ${w.config.papel} (${can})`;
      })
      .join('\n');
    return [
      `Comando geral do usuário: "${command}"`,
      '',
      'Monte o plano para a equipe, na melhor ordem. Equipe disponível:',
      roster,
      '',
      'Regras do plano:',
      '- Cada passo vai para UM agente e precisa ser uma tarefa completa e autoexplicativa, porque o agente não vê este comando inteiro.',
      '- Coloque revisão depois das mudanças importantes.',
      '- Você pode olhar os arquivos do projeto para planejar, mas não edite nada.',
      '- No máximo 8 passos.',
      '',
      'Termine a resposta com um bloco assim, e nada depois dele:',
      '```plano',
      '[{"agente": "<id>", "tarefa": "<o que fazer>"}]',
      '```',
    ].join('\n');
  }

  private nextPending() {
    return this.plan?.steps.find((s) => s.status === 'pending');
  }

  /** Keeps finished steps and swaps everything still pending for the new list. */
  private replaceRemaining(steps: { agente: string; tarefa: string }[]) {
    if (!this.plan) return;
    this.plan.steps = [
      ...this.plan.steps.filter((s) => s.status !== 'pending'),
      ...steps.map((s) => ({ id: this.nextStepId++, agentId: s.agente, task: s.tarefa, status: 'pending' as const })),
    ];
  }

  private finish(status: 'done' | 'error', summary: string) {
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
