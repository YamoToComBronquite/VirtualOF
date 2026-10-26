import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { SandboxMode } from '@openai/codex-sdk';

export interface AgentConfig {
  id: string;
  nome: string;
  tipo: 'claude' | 'codex';
  papel: string;
  cor: string;
  instrucoes: string;
  /** Codex only. */
  sandbox?: SandboxMode;
}

export interface OfficeConfig {
  porta: number;
  projeto: string;
  agentes: AgentConfig[];
  antigravity: { pasta: string; ativoSegundos: number; maximo: number };
}

const CONFIG_PATH = fileURLToPath(new URL('../escritorio.config.json', import.meta.url));
/** Machine-specific choices (like the project folder) live here, outside version control. */
const LOCAL_PATH = fileURLToPath(new URL('../.escritorio.local.json', import.meta.url));

export function loadConfig(): OfficeConfig {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as OfficeConfig;
  if (existsSync(LOCAL_PATH)) Object.assign(config, JSON.parse(readFileSync(LOCAL_PATH, 'utf8')));
  config.antigravity.pasta = config.antigravity.pasta.replace(/^~/, homedir());
  return config;
}

/** Remembers the chosen project folder for the next start. */
export function saveProject(project: string) {
  writeFileSync(LOCAL_PATH, `${JSON.stringify({ projeto: project }, null, 2)}\n`);
}
