import { randomUUID } from 'node:crypto';
import {
  DESK_COUNT,
  FREE_ACCOUNTS,
  ROLE_NAMES,
  WORKER_ROLES,
  type Account,
  type AgentView,
  type MemberSettings,
  type RoleKey,
} from '../shared/types.ts';
import { AgyAgent } from './agents/agy.ts';
import { ClaudeAgent } from './agents/claude.ts';
import { CodexAgent } from './agents/codex.ts';
import { OpencodeAgent } from './agents/opencode.ts';
import type { RunImage, Runner } from './agents/runner.ts';
import { nameAgents, saveTeam, type AgentConfig, type OfficeConfig } from './config.ts';
import type { Office } from './office.ts';

const ENGINES = { claude: ClaudeAgent, codex: CodexAgent, antigravity: AgyAgent, opencode: OpencodeAgent };

/** Shirt colors handed to new desks, one per desk. */
const PALETTE = ['#e3a04f', '#4fb3a5', '#d9705a', '#5fbf8f', '#6f8cf0', '#c98bd9'];

/** Codex, agy and opencode read their own config, which they do not report back in full. */
function toolkitNote(agent: AgentConfig): AgentView['toolkit'] {
  if (agent.tipo === 'codex') return { skills: [], plugins: [], mcp: [], note: 'Usa a configuração do Codex (~/.codex): servidores MCP e skills de lá.' };
  if (agent.tipo === 'antigravity') return { skills: [], plugins: [], mcp: [], note: 'Usa a configuração do Antigravity CLI (~/.gemini/antigravity-cli).' };
  if (agent.tipo === 'opencode') return { skills: [], plugins: [], mcp: [], note: 'Usa a configuração do OpenCode (~/.config/opencode).' };
  return undefined;
}

function view(agent: AgentConfig): AgentView {
  return {
    id: agent.id,
    name: agent.apelido || agent.nome,
    defaultName: agent.nome,
    model: agent.modelo ?? '',
    kind: agent.tipo,
    role: ROLE_NAMES[agent.papel],
    roleKey: agent.papel,
    color: agent.cor,
    status: 'idle',
    activity: 'Livre',
    controllable: true,
    usage: { tasks: 0, inputTokens: 0, outputTokens: 0 },
    toolkit: toolkitNote(agent),
  };
}

export interface Member {
  config: AgentConfig;
  runner: Runner;
}

/** The controllable agents, their order (desk order) and who plays which role. */
export class Team {
  private members: Member[];
  /** Roles agents are temporarily playing while they cover for someone over the limit. */
  private overrides = new Map<string, RoleKey>();

  constructor(
    private readonly config: OfficeConfig,
    private readonly office: Office,
  ) {
    this.members = config.agentes.map((agent) => ({ config: agent, runner: this.engine(agent) }));
    for (const { config: agent } of this.members) office.addAgent(view(agent));
  }

  private engine(agent: AgentConfig): Runner {
    return new ENGINES[agent.tipo](agent.id, this.office, () => this.brief(agent.id));
  }

  get(id: string) {
    return this.members.find((m) => m.config.id === id);
  }

  list() {
    return this.members;
  }

  coordinator() {
    return this.members.find((m) => m.config.papel === 'coordenador');
  }

  /** Everyone a coordinator can hand work to. */
  workers() {
    return this.members.filter((m) => WORKER_ROLES.includes(m.config.papel));
  }

  get busy() {
    return this.members.some((m) => m.runner.busy);
  }

  /** The name the user knows the agent by: its nickname, if it has one. */
  label(member: Member) {
    return member.config.apelido || member.config.nome;
  }

  /** Whose subscription an agent bills to; agents on the same account hit limits together. */
  account(member: Member): Account {
    return member.config.tipo;
  }

  /**
   * Someone on another account who can cover for `member`: same role first, then anyone on
   * the team, then whoever is off duty. Null when every other account is over its limit too.
   * `taken` lists agents already committed elsewhere (e.g. on another step of the same plan).
   */
  substitute(member: Member, taken: ReadonlySet<string> = new Set()): Member | null {
    const free = this.members.filter(
      (m) =>
        m !== member &&
        !m.runner.busy &&
        !taken.has(m.config.id) &&
        this.account(m) !== this.account(member) &&
        !this.office.isLimited(this.account(m)),
    );
    // Free accounts cover first, so a limit does not start spending on another paid plan.
    const cost = (m: Member) => (FREE_ACCOUNTS.includes(this.account(m)) ? 0 : 1);
    const rank = (m: Member) =>
      m.config.papel === member.config.papel ? 0 : WORKER_ROLES.includes(m.config.papel) ? 1 : m.config.papel === 'folga' ? 2 : 3;
    return free.sort((a, b) => cost(a) - cost(b) || rank(a) - rank(b))[0] ?? null;
  }

  /**
   * Before handing work to an agent whose account is near its limit: asks the user whether to keep
   * going on it. False means hand the work to someone else, which is only offered when someone free
   * on another account could take it.
   */
  async keepGoing(member: Member, taken: ReadonlySet<string> = new Set()): Promise<boolean> {
    const account = this.account(member);
    if (!this.office.autoSwitch || !this.office.nearLimit(account) || !this.substitute(member, taken)) return true;
    return (await this.office.confirmLimit(member.config.id, account)) === 'continue';
  }

  /**
   * The note a stand-in gets when it takes over a task mid-way: the original task, what the
   * agent that hit its limit already did, and where it stopped, so the work carries on.
   */
  handoverNote(from: Member, task: string, sinceLogId: number, partial: string) {
    const done = this.office
      .entriesSince(from.config.id, sinceLogId)
      .filter((e) => e.kind === 'tool' || e.kind === 'text')
      .slice(-40)
      .map((e) => `- ${e.kind === 'text' ? 'disse: ' : ''}${e.text.replace(/\s+/g, ' ').slice(0, 220)}`);
    return [
      `[Passagem de bastão] ${this.label(from)} bateu o limite de uso no meio desta tarefa e você assumiu.`,
      'Continue de onde parou. Não refaça o que já foi feito: o trabalho anterior já está salvo nos arquivos do projeto, então confira o estado atual antes de seguir.',
      '',
      'Tarefa original:',
      task,
      '',
      `O que ${this.label(from)} já fez:`,
      done.length ? done.join('\n') : '- nada registrado ainda',
      ...(partial.trim() ? ['', 'Última resposta antes de parar:', partial.trim().slice(0, 1500)] : []),
    ].join('\n');
  }

  /** Runs a task with the agent temporarily playing `role` (when it covers for someone). */
  async runAs(member: Member, role: RoleKey, prompt: string, cwd: string, note?: string, images?: RunImage[]) {
    this.overrides.set(member.config.id, role);
    try {
      return await member.runner.run(prompt, cwd, note, images);
    } finally {
      this.overrides.delete(member.config.id);
    }
  }

  private brief(id: string) {
    const config = this.get(id)?.config;
    const key = this.overrides.get(id) ?? config?.papel ?? 'folga';
    const instructions = key === 'folga' ? '' : this.config.papeis[key].instrucoes;
    const named = config?.apelido ? `\n\nNeste escritório, o usuário te chama de "${config.apelido}".` : '';
    const english = this.office.lang === 'en' ? '\n\nAlways reply to the user in English.' : '';
    return { key, instructions: instructions + named + english, model: config?.modelo ?? '' };
  }

  /**
   * Applies Configurações: who sits at each desk (desks can be filled, emptied or given another
   * AI), roles, nicknames, models and order. Returns an error message, or null.
   */
  apply(team: MemberSettings[], autoSwitch: boolean): string | null {
    if (this.busy) return 'Espere os agentes terminarem antes de mudar a equipe.';
    const valid = (t: MemberSettings) =>
      (this.get(t.id) || t.id.startsWith('novo')) && t.role in ROLE_NAMES && t.kind in ENGINES && typeof t.nickname === 'string';
    if (team.length > DESK_COUNT || new Set(team.map((t) => t.id)).size !== team.length || !team.every(valid)) return 'Equipe inválida.';
    // An empty office is fine; a team that works needs someone to plan and someone to build.
    if (team.length) {
      if (team.filter((t) => t.role === 'coordenador').length !== 1) return 'Escolha exatamente um supervisor.';
      if (!team.some((t) => t.role === 'executor')) return 'Escolha pelo menos um fullstack.';
    }
    const models = this.office.models;
    if (team.some((t) => t.model && !models[t.kind].some((m) => m.id === t.model))) return 'Modelo desconhecido para um dos agentes.';

    const keep = new Set(team.map((t) => t.id));
    for (const gone of this.members.filter((m) => !keep.has(m.config.id))) {
      gone.runner.stop();
      this.office.removeAgent(gone.config.id);
    }
    const used = new Set(this.members.filter((m) => keep.has(m.config.id)).map((m) => m.config.cor));
    const added: Member[] = [];

    this.members = team.map(({ id, kind, role, nickname, model }) => {
      const apelido = nickname.trim().slice(0, 24) || undefined;
      let member = this.get(id);
      if (!member) {
        const cor = PALETTE.find((c) => !used.has(c)) ?? PALETTE[0];
        used.add(cor);
        const config: AgentConfig = { id: `${kind}-${randomUUID().slice(0, 8)}`, nome: '', tipo: kind, papel: role, cor, apelido, modelo: model || undefined };
        member = { config, runner: this.engine(config) };
        added.push(member);
        return member;
      }
      if (member.config.tipo !== kind) {
        // Another AI at this desk: a new engine, with nothing carried over from the old one.
        member.config.tipo = kind;
        member.runner = this.engine(member.config);
      } else if (member.config.papel !== role || member.config.apelido !== apelido || (member.config.modelo ?? '') !== model) {
        // New role, nickname or model means new instructions: start a fresh conversation.
        member.runner.reset();
      }
      member.config.papel = role;
      member.config.apelido = apelido;
      member.config.modelo = model || undefined;
      return member;
    });
    nameAgents(this.members.map((m) => m.config));
    for (const { config: agent } of this.members) {
      if (added.some((m) => m.config === agent)) {
        this.office.addAgent(view(agent));
        continue;
      }
      const { kind, role, roleKey, name, defaultName, model, toolkit } = view(agent);
      this.office.update(agent.id, { kind, role, roleKey, name, defaultName, model, toolkit });
    }
    this.office.setAutoSwitch(autoSwitch);
    saveTeam(
      this.members.map(({ config: { nome: _, ...saved } }) => saved),
      autoSwitch,
    );
    this.office.reorder(this.members.map((m) => m.config.id));
    return null;
  }
}
