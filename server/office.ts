import { randomUUID } from 'node:crypto';
import type {
  Account,
  AgentStatus,
  AgentView,
  LogEntry,
  LogKind,
  ModelCatalog,
  PermissionRequest,
  Plan,
  Quota,
  ServerMessage,
  TerminalAlert,
} from '../shared/types.ts';

/** When an SDK reports a limit without a reset time, assume it lasts this long. */
const UNKNOWN_RESET_MS = 60 * 60 * 1000;

const LOG_LIMIT = 500;

/**
 * Appended to every agent's instructions. The user drives the office from the browser, so
 * anything that needs their terminal has to come back as a marker the office can show.
 */
export const TERMINAL_RULE =
  'O usuário fala com você por um escritório virtual no navegador e não está olhando nenhum terminal. ' +
  'Se você precisar de algo que só ele pode fazer num terminal ou no editor (login, instalar uma ferramenta, ' +
  'instalar ou abrir uma extensão do VS Code, ' +
  'um comando interativo, digitar uma senha), não tente contornar: pare e escreva uma linha exatamente assim:\n' +
  'PRECISA_TERMINAL: <comando a rodar> | <por que, em uma frase>\n' +
  'Uma linha por comando. Depois que ele rodar, ele te avisa e você continua.';

const MARKER = /^\s*PRECISA_TERMINAL:\s*(.+?)\s*\|\s*(.+?)\s*$/gm;

interface PendingPermission {
  request: PermissionRequest;
  resolve: (allow: boolean) => void;
}

/**
 * Single source of truth for what the office shows. Agents report into it; every change is
 * broadcast to the connected browsers.
 */
export class Office {
  private agents = new Map<string, AgentView>();
  private log: LogEntry[] = [];
  private pending = new Map<string, PendingPermission>();
  private terminal = new Map<string, TerminalAlert>();
  private plan: Plan | null = null;
  private quota: Record<Account, Quota> = {
    claude: { status: 'unknown' },
    codex: { status: 'unknown' },
    antigravity: { status: 'unknown' },
  };
  /** Hand a step to another agent when its account hits the limit. */
  autoSwitch = true;
  /** Models each engine offers, for Configurações. */
  models: ModelCatalog = { claude: [], codex: [], antigravity: [] };
  private nextLogId = 1;
  private listeners = new Set<(msg: ServerMessage) => void>();
  project: string;

  constructor(project: string) {
    this.project = project;
  }

  subscribe(listener: (msg: ServerMessage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): ServerMessage {
    return {
      type: 'snapshot',
      agents: [...this.agents.values()],
      log: this.log,
      permissions: [...this.pending.values()].map((p) => p.request),
      terminal: [...this.terminal.values()],
      plan: this.plan,
      quota: this.quota,
      autoSwitch: this.autoSwitch,
      models: this.models,
      project: this.project,
    };
  }

  private emit(msg: ServerMessage) {
    for (const listener of this.listeners) listener(msg);
  }

  addAgent(agent: AgentView) {
    this.agents.set(agent.id, agent);
    this.emit({ type: 'agent', agent });
  }

  /** Puts these agents first, in this order (desk order), and resends everything. */
  reorder(ids: string[]) {
    const rest = [...this.agents.values()].filter((a) => !ids.includes(a.id));
    const ordered = ids.flatMap((id) => this.agents.get(id) ?? []);
    this.agents = new Map([...ordered, ...rest].map((a) => [a.id, a]));
    this.emit(this.snapshot());
  }

  removeAgent(id: string) {
    if (this.agents.delete(id)) this.emit({ type: 'agent-removed', id });
  }

  getAgent(id: string) {
    return this.agents.get(id);
  }

  update(id: string, patch: Partial<AgentView>) {
    const agent = this.agents.get(id);
    if (!agent) return;
    Object.assign(agent, patch);
    this.emit({ type: 'agent', agent });
  }

  setStatus(id: string, status: AgentStatus, activity: string) {
    this.update(id, { status, activity });
  }

  addUsage(id: string, input: number, output: number, costUsd?: number) {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.usage.inputTokens += input;
    agent.usage.outputTokens += output;
    if (costUsd !== undefined) agent.usage.costUsd = (agent.usage.costUsd ?? 0) + costUsd;
    this.emit({ type: 'agent', agent });
  }

  setQuota(account: Account, quota: Quota) {
    if (quota.status === 'limited' && !quota.resetsAt) quota.resetsAt = Date.now() + UNKNOWN_RESET_MS;
    this.quota[account] = quota;
    this.emit({ type: 'quota', quota: this.quota });
  }

  /** True while the account is over its limit; clears itself once the reset time passes. */
  isLimited(account: Account) {
    const quota = this.quota[account];
    if (quota.status !== 'limited') return false;
    if (quota.resetsAt && quota.resetsAt <= Date.now()) {
      this.setQuota(account, { status: 'unknown' });
      return false;
    }
    return true;
  }

  setModels(models: ModelCatalog) {
    this.models = models;
    this.emit({ type: 'models', models });
  }

  setAutoSwitch(enabled: boolean) {
    this.autoSwitch = enabled;
    this.emit({ type: 'auto-switch', enabled });
  }

  write(agentId: string, kind: LogKind, text: string) {
    if (kind === 'task') {
      const agent = this.agents.get(agentId);
      if (agent) agent.usage.tasks++;
    }
    const entry: LogEntry = { id: this.nextLogId++, agentId, at: Date.now(), kind, text };
    this.log.push(entry);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    this.emit({ type: 'log', entry });
  }

  notice(text: string) {
    this.emit({ type: 'notice', text });
  }

  /** Raises an "open the terminal" card for something only the user can do. */
  needTerminal(agentId: string, command: string, reason: string) {
    const alert: TerminalAlert = { id: randomUUID(), agentId, command, reason };
    this.terminal.set(alert.id, alert);
    this.emit({ type: 'terminal', alert });
    this.write(agentId, 'permission', `Precisa do terminal: ${command}`);
  }

  clearTerminal(id: string) {
    if (this.terminal.delete(id)) this.emit({ type: 'terminal-cleared', id });
  }

  /** Logs an agent's message and turns any PRECISA_TERMINAL lines into terminal cards. */
  say(agentId: string, text: string) {
    this.write(agentId, 'text', text);
    for (const match of text.matchAll(MARKER)) this.needTerminal(agentId, match[1], match[2]);
  }

  /** Publishes the current general-command plan (the orchestrator mutates it, then calls this). */
  showPlan(plan: Plan | null) {
    this.plan = plan;
    this.emit({ type: 'plan', plan });
  }

  setProject(project: string) {
    this.project = project;
    this.emit({ type: 'project', project });
  }

  /** Puts a sticky note on the board and waits for the user's answer (or the abort signal). */
  askPermission(agentId: string, tool: string, summary: string, signal?: AbortSignal): Promise<boolean> {
    const request: PermissionRequest = { id: randomUUID(), agentId, tool, summary };
    return new Promise((resolve) => {
      const settle = (allow: boolean) => {
        if (!this.pending.delete(request.id)) return;
        signal?.removeEventListener('abort', onAbort);
        this.emit({ type: 'permission-resolved', id: request.id });
        resolve(allow);
      };
      const onAbort = () => settle(false);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(request.id, { request, resolve: settle });
      this.emit({ type: 'permission', request });
      this.write(agentId, 'permission', `Pediu permissão: ${tool} · ${summary}`);
    });
  }

  answerPermission(id: string, allow: boolean) {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.write(pending.request.agentId, 'permission', allow ? `Aprovado: ${pending.request.tool}` : `Negado: ${pending.request.tool}`);
    pending.resolve(allow);
  }
}
