/** Types shared by the server and the browser. */

export type AgentKind = 'claude' | 'codex' | 'antigravity' | 'opencode';

/** The room has six desks: three across, two rows. */
export const DESK_COUNT = 6;

/** Job an agent has on the team; 'folga' means it sits out of general commands. */
export type RoleKey = 'coordenador' | 'designer' | 'executor' | 'tester' | 'revisor' | 'folga';

/** Roles whose agents change files; the reviewer only reads. ('executor' is the fullstack developer.) */
export const EDITING_ROLES: RoleKey[] = ['designer', 'executor', 'tester'];

/** Roles that take steps of a general command. */
export const WORKER_ROLES: RoleKey[] = [...EDITING_ROLES, 'revisor'];

export const ROLE_NAMES: Record<RoleKey, string> = {
  coordenador: 'Supervisor',
  designer: 'UI/UX Designer',
  executor: 'Fullstack',
  tester: 'Tester',
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
  requestId?: string;
  id: number;
  agentId: string;
  at: number;
  kind: LogKind;
  text: string;
  /** Images the user sent with a 'user' entry, for thumbnails; only the newest entries keep them. */
  images?: { name: string; mime: string; data: string }[];
}

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export const IMAGE_MIMES: ImageMime[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** At most this many images per message, each at most MAX_IMAGE_BYTES once decoded. */
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 32 * 1024;

/** An image sent with a message; `data` is plain base64, without the "data:...;base64," prefix. */
export interface ImageAttachment {
  name: string;
  mime: ImageMime;
  data: string;
  /** Small JPEG preview for the office log; full images only reach the agents. */
  thumbnail?: { mime: 'image/jpeg'; data: string };
}

/** 'manual' asks on a sticky note; 'auto' approves every tool request right away. */
export type PermissionMode = 'manual' | 'auto';

export interface PermissionRequest {
  id: string;
  agentId: string;
  tool: string;
  summary: string;
  /** 'limit': the account is near its usage limit; allow keeps going on it, deny hands the work over. */
  kind?: 'limit';
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
  /** An existing agent's id, or one starting with "novo" for a desk filled in Configurações. */
  id: string;
  /** Which AI sits at this desk, by the accounts the user has. */
  kind: AgentKind;
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
export type Account = AgentKind;

/** Accounts with a free tier: Gemini through the Antigravity CLI, and OpenCode's free models. */
export const FREE_ACCOUNTS: Account[] = ['antigravity', 'opencode'];

/** Whether this machine has a login for an account, and the command that sets it up. */
export interface AccountStatus {
  /** Undefined when the CLI's login can't be read from outside (the free ones). */
  signedIn?: boolean;
  /** False when the CLI isn't on this machine yet; `login` then installs it. */
  installed: boolean;
  login: string;
  /** What to do once the command is running, e.g. type /login. */
  hint: string;
}

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
  /** Steps (by id) that must finish first; absent means "after every earlier step". */
  dependsOn?: number[];
}

/** A general command: the coordinator plans the steps, the office runs independent ones at the same time. */
export interface Plan {
  command: string;
  status: 'planning' | 'running' | 'done' | 'stopped' | 'error';
  steps: PlanStep[];
  summary?: string;
}

/** Language of the page and of the agents' replies. */
export type Lang = 'pt' | 'en';

export type ServerMessage =
  /** Acceptance is not task completion. Replaying an accepted id never runs it again. */
  | { type: 'submission'; requestId: string; accepted: boolean; text?: string; serverId?: string; duplicate?: boolean }
  | { type: 'submission-status'; requestId: string; accepted: boolean; serverId: string }
  | {
      type: 'snapshot';
      serverId: string;
      agents: AgentView[];
      log: LogEntry[];
      permissions: PermissionRequest[];
      terminal: TerminalAlert[];
      plan: Plan | null;
      quota: Record<Account, Quota>;
      autoSwitch: boolean;
      permissionMode: PermissionMode;
      models: ModelCatalog;
      accounts: Record<Account, AccountStatus>;
      project: string;
      lang: Lang;
    }
  | { type: 'language'; lang: Lang }
  | { type: 'accounts'; accounts: Record<Account, AccountStatus> }
  | { type: 'models'; models: ModelCatalog }
  | { type: 'skills'; skills: SkillCatalog }
  | { type: 'skill-imported'; ok: boolean; message: string }
  | { type: 'quota'; quota: Record<Account, Quota> }
  | { type: 'auto-switch'; enabled: boolean }
  | { type: 'permission-mode'; mode: PermissionMode }
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
  | { type: 'submission-status'; requestId: string }
  | { type: 'task'; agentId: string; prompt: string; images?: ImageAttachment[]; requestId?: string }
  | { type: 'stop'; agentId: string }
  | { type: 'permission'; id: string; allow: boolean }
  /** Answers every pending sticky note at once; terminal cards are not included. */
  | { type: 'permission-all'; allow: boolean }
  | { type: 'permission-mode'; mode: PermissionMode }
  | { type: 'terminal-done'; id: string }
  | { type: 'shell-input'; data: string }
  | { type: 'shell-run'; command: string }
  | { type: 'shell-resize'; cols: number; rows: number }
  | { type: 'shell-restart' }
  | { type: 'shell-kill' }
  | { type: 'command'; prompt: string; images?: ImageAttachment[]; requestId?: string }
  | { type: 'team'; team: MemberSettings[]; autoSwitch: boolean }
  | { type: 'check-accounts' }
  | { type: 'list-skills' }
  | { type: 'import-skill'; files: SkillFile[] }
  | { type: 'share-skills' }
  | { type: 'stop-plan' }
  | { type: 'language'; lang: Lang }
  | { type: 'project'; path: string };
