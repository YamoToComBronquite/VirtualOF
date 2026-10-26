/** Types shared by the server and the browser. */

export type AgentKind = 'claude' | 'codex' | 'antigravity';

/** Job an agent has on the team; 'folga' means it sits out of general commands. */
export type RoleKey = 'coordenador' | 'executor' | 'revisor' | 'folga';

export const ROLE_NAMES: Record<RoleKey, string> = {
  coordenador: 'Coordenador',
  executor: 'Executor',
  revisor: 'Revisor',
  folga: 'De folga',
};

/** What the character is doing at the desk; drives the animation and the status text. */
export type AgentStatus = 'idle' | 'thinking' | 'reading' | 'writing' | 'running' | 'waiting' | 'done' | 'error';

export interface AgentUsage {
  /** Tasks this agent took on since the office started. */
  tasks: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated by the Claude Agent SDK; Codex only reports tokens. */
  costUsd?: number;
}

export interface AgentView {
  id: string;
  /** Nickname when the user gave one, otherwise the configured name. */
  name: string;
  /** The configured name, shown as a hint under a nickname. */
  defaultName: string;
  /** Model chosen in Configurações; empty means the engine's own default. */
  model?: string;
  kind: AgentKind;
  /** Display name of the role, e.g. "Executor". */
  role: string;
  /** Undefined for agents the office only watches. */
  roleKey?: RoleKey;
  color: string;
  status: AgentStatus;
  /** Short line about the current step, e.g. "Editando App.tsx". */
  activity: string;
  /** False for agents the office can only watch (Antigravity). */
  controllable: boolean;
  /** What the agent loaded on its last start: skills, plugins and MCP servers. */
  toolkit?: { skills: string[]; plugins: string[]; mcp: string[]; note?: string };
  usage: AgentUsage;
}

/** 'user' is what the user typed; its agentId is the agent, or 'equipe' for a general command. */
export type LogKind = 'user' | 'task' | 'text' | 'tool' | 'result' | 'error' | 'permission';

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

export interface ModelOption {
  /** What the engine expects, e.g. "claude-sonnet-5-5"; empty for the engine's default. */
  id: string;
  label: string;
}

/** Models each engine can run, offered in Configurações. */
export type ModelCatalog = Record<AgentKind, ModelOption[]>;

/** One agent's settings as saved from Configurações. */
export interface MemberSettings {
  id: string;
  role: RoleKey;
  nickname: string;
  model: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  folder: string;
}

/** Skills installed for each tool, read from their skills folders. */
export type SkillCatalog = Record<Account, SkillInfo[]>;

/** One file of a skill being imported, path relative to the skill's folder. */
export interface SkillFile {
  path: string;
  base64: string;
}

/** Agents bill to an account: both Claude agents share one, Codex uses the ChatGPT one. */
export type Account = 'claude' | 'codex' | 'antigravity';

/** How much of an account's subscription limit is used, as far as its SDK tells us. */
export interface Quota {
  status: 'unknown' | 'ok' | 'warning' | 'limited';
  /** 0..1, only Claude reports it. */
  utilization?: number;
  /** Which window the numbers are about, e.g. "5 horas". */
  window?: string;
  /** Epoch ms when the limit resets. */
  resetsAt?: number;
}

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface PlanStep {
  id: number;
  agentId: string;
  task: string;
  status: PlanStepStatus;
}

/** A general command: the coordinator orders the steps, the office runs them one by one. */
export interface Plan {
  command: string;
  status: 'planning' | 'running' | 'done' | 'stopped' | 'error';
  steps: PlanStep[];
  summary?: string;
}

export type ServerMessage =
  | {
      type: 'snapshot';
      agents: AgentView[];
      log: LogEntry[];
      permissions: PermissionRequest[];
      terminal: TerminalAlert[];
      plan: Plan | null;
      quota: Record<Account, Quota>;
      autoSwitch: boolean;
      models: ModelCatalog;
      project: string;
    }
  | { type: 'models'; models: ModelCatalog }
  | { type: 'skills'; skills: SkillCatalog }
  | { type: 'skill-imported'; ok: boolean; message: string }
  | { type: 'quota'; quota: Record<Account, Quota> }
  | { type: 'auto-switch'; enabled: boolean }
  | { type: 'plan'; plan: Plan | null }
  | { type: 'agent'; agent: AgentView }
  | { type: 'agent-removed'; id: string }
  | { type: 'log'; entry: LogEntry }
  | { type: 'permission'; request: PermissionRequest }
  | { type: 'permission-resolved'; id: string }
  | { type: 'project'; project: string }
  | { type: 'notice'; text: string }
  | { type: 'terminal'; alert: TerminalAlert }
  | { type: 'terminal-cleared'; id: string }
  | { type: 'shell-output'; data: string }
  | { type: 'shell-state'; running: boolean; cwd: string };

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
  | { type: 'shell-input'; data: string }
  | { type: 'shell-run'; command: string }
  | { type: 'shell-resize'; cols: number; rows: number }
  | { type: 'shell-restart' }
  | { type: 'shell-kill' }
  | { type: 'command'; prompt: string }
  | { type: 'team'; team: MemberSettings[]; autoSwitch: boolean }
  | { type: 'list-skills' }
  | { type: 'import-skill'; files: SkillFile[]; targets: Account[] }
  | { type: 'stop-plan' }
  | { type: 'project'; path: string };
