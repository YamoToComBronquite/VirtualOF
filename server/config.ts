import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DESK_COUNT, type AgentKind, type Lang, type RoleKey } from '../shared/types.ts';

export interface AgentConfig {
  id: string;
  /** Named after its AI ("Claude", "Gemini 2"); see nameAgents. Not saved. */
  nome: string;
  tipo: AgentKind;
  papel: RoleKey;
  cor: string;
  /** Nickname chosen in Configurações. */
  apelido?: string;
  /** Model chosen in Configurações; empty uses the engine's default. */
  modelo?: string;
}

type SavedMember = Omit<AgentConfig, 'nome'>;

export const ENGINE_NAMES: Record<AgentKind, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Gemini', opencode: 'OpenCode' };

/** Names each desk after its AI, numbering repeats in desk order ("Claude", "Claude 2"). */
export function nameAgents(agents: AgentConfig[]) {
  const taken = new Set<string>();
  for (const agent of agents) {
    const base = ENGINE_NAMES[agent.tipo];
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    taken.add(name);
    agent.nome = name;
  }
}

export interface OfficeConfig {
  porta: number;
  projeto: string;
  papeis: Record<Exclude<RoleKey, 'folga'>, { nome: string; instrucoes: string }>;
  /** The team the user put together in Configurações; the office starts with empty desks. */
  agentes: AgentConfig[];
  antigravity: { pasta: string; ativoSegundos: number; maximo: number };
  /** Hand work to an agent on another account when one hits its limit (default on). */
  trocaAutomatica?: boolean;
  idioma?: Lang;
}

/** What the user changed in the page; kept out of version control. */
interface LocalSettings {
  projeto?: string;
  trocaAutomatica?: boolean;
  /** Who sits at each desk, in desk order, as chosen in Configurações. */
  equipe?: Partial<SavedMember>[];
  idioma?: Lang;
}

const CONFIG_PATH = fileURLToPath(new URL('../escritorio.config.json', import.meta.url));
// The desktop app is installed read-only, so it keeps these in the user's app-data folder.
const LOCAL_PATH = process.env.VIRTUALOF_DATA_DIR
  ? join(process.env.VIRTUALOF_DATA_DIR, 'escritorio.local.json')
  : fileURLToPath(new URL('../.escritorio.local.json', import.meta.url));

function readLocal(): LocalSettings {
  return existsSync(LOCAL_PATH) ? (JSON.parse(readFileSync(LOCAL_PATH, 'utf8')) as LocalSettings) : {};
}

function writeLocal(patch: LocalSettings) {
  writeFileSync(LOCAL_PATH, `${JSON.stringify({ ...readLocal(), ...patch }, null, 2)}\n`);
}

/** The fixed team of version 0.1.0, whose saved desks only had an id. */
const LEGACY_DESKS: Record<string, Pick<SavedMember, 'tipo' | 'cor'> & { apelido?: string }> = {
  chefe: { tipo: 'claude', cor: '#e3a04f' },
  dev: { tipo: 'claude', cor: '#d9705a', apelido: 'Claude Dev' },
  revisor: { tipo: 'codex', cor: '#4fb3a5' },
  gemini: { tipo: 'antigravity', cor: '#6f8cf0' },
  astra: { tipo: 'codex', cor: '#5fbf8f' },
  critico: { tipo: 'claude', cor: '#c98bd9', apelido: 'Claude Revisor' },
};

export function loadConfig(): OfficeConfig {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as OfficeConfig;
  const local = readLocal();
  if (local.projeto !== undefined) config.projeto = local.projeto;
  if (local.trocaAutomatica !== undefined) config.trocaAutomatica = local.trocaAutomatica;
  if (local.idioma) config.idioma = local.idioma;
  // Teams saved before desks had their own AI and color carry neither: the agents of 0.1.0 get
  // theirs back from LEGACY_DESKS; anything else unknown is dropped.
  config.agentes = (local.equipe ?? [])
    .map((m) => (m.id && !m.tipo && m.id in LEGACY_DESKS ? { ...LEGACY_DESKS[m.id], ...m } : m))
    .filter((m): m is SavedMember => !!(m.id && m.tipo && m.tipo in ENGINE_NAMES && m.papel && m.cor))
    .slice(0, DESK_COUNT)
    .map((m) => ({ ...m, nome: '' }));
  nameAgents(config.agentes);
  config.antigravity.pasta = config.antigravity.pasta.replace(/^~/, homedir());
  return config;
}

/** Remembers the chosen project folder for the next start. */
export function saveProject(project: string) {
  writeLocal({ projeto: project });
}

export function saveLanguage(lang: Lang) {
  writeLocal({ idioma: lang });
}

export function saveTeam(team: SavedMember[], autoSwitch: boolean) {
  writeLocal({ equipe: team, trocaAutomatica: autoSwitch });
}
