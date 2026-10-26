import { randomUUID } from 'node:crypto';
import type { AgentStatus, AgentView, LogEntry, LogKind, PermissionRequest, ServerMessage, TerminalAlert } from '../shared/types.ts';

const LOG_LIMIT = 500;

/**
 * Appended to every agent's instructions. The user drives the office from the browser, so
 * anything that needs their terminal has to come back as a marker the office can show.
 */
export const TERMINAL_RULE =
  'O usuário fala com você por um escritório virtual no navegador e não está olhando nenhum terminal. ' +
  'Se você precisar de algo que só ele pode fazer num terminal (login, instalar uma ferramenta ou extensão, ' +
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

  write(agentId: string, kind: LogKind, text: string) {
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
