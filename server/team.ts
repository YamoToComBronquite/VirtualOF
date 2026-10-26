import { ROLE_NAMES, type Account, type MemberSettings, type RoleKey } from '../shared/types.ts';
import { AgyAgent } from './agents/agy.ts';
import { ClaudeAgent } from './agents/claude.ts';
import { CodexAgent } from './agents/codex.ts';
import type { Runner } from './agents/runner.ts';
import { saveTeam, type AgentConfig, type OfficeConfig } from './config.ts';
import type { Office } from './office.ts';

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
    this.members = config.agentes.map((agent) => {
      const brief = () => this.brief(agent.id);
      const Engine = { claude: ClaudeAgent, codex: CodexAgent, antigravity: AgyAgent }[agent.tipo];
      return { config: agent, runner: new Engine(agent.id, office, brief) };
    });
    for (const { config: agent } of this.members) {
      office.addAgent({
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
        // Codex and agy read their own config, which they do not report back in full.
        toolkit:
          agent.tipo === 'codex'
            ? { skills: [], plugins: [], mcp: [], note: 'Usa a configuração do Codex (~/.codex): servidores MCP e skills de lá.' }
            : agent.tipo === 'antigravity'
              ? { skills: [], plugins: [], mcp: [], note: 'Usa a configuração do Antigravity CLI (~/.gemini/antigravity-cli).' }
              : undefined,
      });
    }
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
    return this.members.filter((m) => m.config.papel === 'executor' || m.config.papel === 'revisor');
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
   */
  substitute(member: Member): Member | null {
    const free = this.members.filter(
      (m) => m !== member && !m.runner.busy && this.account(m) !== this.account(member) && !this.office.isLimited(this.account(m)),
    );
    const rank = (m: Member) =>
      m.config.papel === member.config.papel ? 0 : m.config.papel === 'executor' || m.config.papel === 'revisor' ? 1 : m.config.papel === 'folga' ? 2 : 3;
    return free.sort((a, b) => rank(a) - rank(b))[0] ?? null;
  }

  /** Runs a task with the agent temporarily playing `role` (when it covers for someone). */
  async runAs(member: Member, role: RoleKey, prompt: string, cwd: string) {
    this.overrides.set(member.config.id, role);
    try {
      return await member.runner.run(prompt, cwd);
    } finally {
      this.overrides.delete(member.config.id);
    }
  }

  private brief(id: string) {
    const config = this.get(id)?.config;
    const key = this.overrides.get(id) ?? config?.papel ?? 'folga';
    const instructions = key === 'folga' ? '' : this.config.papeis[key].instrucoes;
    const named = config?.apelido ? `\n\nNeste escritório, o usuário te chama de "${config.apelido}".` : '';
    return { key, instructions: instructions + named, model: config?.modelo ?? '' };
  }

  /** Applies Configurações: order, roles, nicknames and models. Returns an error message, or null. */
  apply(team: MemberSettings[], autoSwitch: boolean): string | null {
    if (this.busy) return 'Espere os agentes terminarem antes de mudar a equipe.';
    if (team.length !== this.members.length || !team.every((t) => this.get(t.id) && t.role in ROLE_NAMES)) {
      return 'Equipe inválida.';
    }
    if (team.filter((t) => t.role === 'coordenador').length !== 1) return 'Escolha exatamente um coordenador.';
    if (!team.some((t) => t.role === 'executor')) return 'Escolha pelo menos um executor.';
    const models = this.office.models;
    for (const t of team) {
      const kind = this.get(t.id)!.config.tipo;
      if (t.model && !models[kind].some((m) => m.id === t.model)) return `Modelo desconhecido para ${this.label(this.get(t.id)!)}.`;
    }

    this.members = team.map(({ id, role, nickname, model }) => {
      const member = this.get(id)!;
      const apelido = nickname.trim().slice(0, 24);
      // New role, nickname or model means new instructions: start a fresh conversation.
      if (member.config.papel !== role || (member.config.apelido ?? '') !== apelido || (member.config.modelo ?? '') !== model) {
        member.runner.reset();
      }
      member.config.papel = role;
      member.config.apelido = apelido || undefined;
      member.config.modelo = model || undefined;
      this.office.update(id, { role: ROLE_NAMES[role], roleKey: role, name: this.label(member), model });
      return member;
    });
    this.office.setAutoSwitch(autoSwitch);
    saveTeam(
      this.members.map((m) => ({ id: m.config.id, papel: m.config.papel, apelido: m.config.apelido, modelo: m.config.modelo })),
      autoSwitch,
    );
    this.office.reorder(this.members.map((m) => m.config.id));
    return null;
  }
}
