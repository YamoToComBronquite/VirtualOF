/** Types shared by the server and the browser. */

export type AgentKind = 'claude' | 'codex' | 'antigravity';

/** What the character is doing at the desk; drives the animation and the status text. */
export type AgentStatus = 'idle' | 'thinking' | 'reading' | 'writing' | 'running' | 'waiting' | 'done' | 'error';

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  /** Estimated by the Claude Agent SDK; Codex only reports tokens. */
  costUsd?: number;
}

export interface AgentView {
  id: string;
  name: string;
  kind: AgentKind;
  role: string;
  color: string;
  status: AgentStatus;
  /** Short line about the current step, e.g. "Editando App.tsx". */
  activity: string;
  /** False for agents the office can only watch (Antigravity). */
  controllable: boolean;
  usage: AgentUsage;
}

export type LogKind = 'task' | 'text' | 'tool' | 'result' | 'error' | 'permission';

export interface LogEntry {
  id: number;
  agentId: string;
  at: number;
  kind: LogKind;
  text: string;
}

export interface PermissionRequest {
  id: string;
  agentId: string;
  tool: string;
  summary: string;
}

export type ServerMessage =
  | {
      type: 'snapshot';
      agents: AgentView[];
      log: LogEntry[];
      permissions: PermissionRequest[];
      terminal: TerminalAlert[];
      project: string;
    }
  | { type: 'agent'; agent: AgentView }
  | { type: 'agent-removed'; id: string }
  | { type: 'log'; entry: LogEntry }
  | { type: 'permission'; request: PermissionRequest }
  | { type: 'permission-resolved'; id: string }
  | { type: 'project'; project: string }
  | { type: 'notice'; text: string }
  | { type: 'terminal'; alert: TerminalAlert }
  | { type: 'terminal-cleared'; id: string };

/** Something only the user can do in a terminal (a login, an install, an interactive command). */
export interface TerminalAlert {
  id: string;
  agentId: string;
  command: string;
  reason: string;
}

export type ClientMessage =
  | { type: 'task'; agentId: string; prompt: string }
  | { type: 'stop'; agentId: string }
  | { type: 'permission'; id: string; allow: boolean }
  | { type: 'terminal-done'; id: string }
  | { type: 'project'; path: string };
