import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { RoleKey } from '../shared/types.ts';

export interface AgentConfig {
  id: string;
  nome: string;
  tipo: 'claude' | 'codex' | 'antigravity';
  papel: RoleKey;
  cor: string;
  /** Nickname chosen in Configurações. */
  apelido?: string;
  /** Model chosen in Configurações; empty uses the engine's default. */
  modelo?: string;
}

type SavedMember = { id: string; papel: RoleKey; apelido?: string; modelo?: string };

export interface OfficeConfig {
  porta: number;
  projeto: string;
  papeis: Record<Exclude<RoleKey, 'folga'>, { nome: string; instrucoes: string }>;
  agentes: AgentConfig[];
  antigravity: { pasta: string; ativoSegundos: number; maximo: number };
  /** Hand work to an agent on another account when one hits its limit (default on). */
  trocaAutomatica?: boolean;
}

/** What the user changed in the page; kept out of version control. */
interface LocalSettings {
  projeto?: string;
  trocaAutomatica?: boolean;
  /** Team order, roles, nicknames and models, as chosen in Configurações. */
  equipe?: SavedMember[];
}

const CONFIG_PATH = fileURLToPath(new URL('../escritorio.config.json', import.meta.url));
const LOCAL_PATH = fileURLToPath(new URL('../.escritorio.local.json', import.meta.url));

function readLocal(): LocalSettings {
  return existsSync(LOCAL_PATH) ? (JSON.parse(readFileSync(LOCAL_PATH, 'utf8')) as LocalSettings) : {};
}

function writeLocal(patch: LocalSettings) {
  writeFileSync(LOCAL_PATH, `${JSON.stringify({ ...readLocal(), ...patch }, null, 2)}\n`);
}

export function loadConfig(): OfficeConfig {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as OfficeConfig;
  const local = readLocal();
  if (local.projeto !== undefined) config.projeto = local.projeto;
  if (local.trocaAutomatica !== undefined) config.trocaAutomatica = local.trocaAutomatica;
  if (local.equipe) {
    const byId = new Map(config.agentes.map((a) => [a.id, a]));
    const ordered = local.equipe.flatMap(({ id, ...saved }) => {
      const agent = byId.get(id);
      byId.delete(id);
      return agent ? [{ ...agent, ...saved }] : [];
    });
    config.agentes = [...ordered, ...byId.values()]; // agents added to the file later go last
  }
  config.antigravity.pasta = config.antigravity.pasta.replace(/^~/, homedir());
  return config;
}

/** Remembers the chosen project folder for the next start. */
export function saveProject(project: string) {
  writeLocal({ projeto: project });
}

export function saveTeam(team: SavedMember[], autoSwitch: boolean) {
  writeLocal({ equipe: team, trocaAutomatica: autoSwitch });
}
