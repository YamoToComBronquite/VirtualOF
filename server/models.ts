import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelCatalog, ModelOption } from '../shared/types.ts';
import { setAgySignedIn } from './accounts.ts';
import { agyPath } from './agents/agy.ts';
import { OPENCODE_DEFAULT_MODEL, opencodePath, spawnOpencode } from './agents/opencode.ts';

const CLAUDE: ModelOption[] = [
  { id: '', label: 'Padrão do Claude Code' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
];

/** The model set in ~/.codex/config.toml, plus the visible ones from Codex's own model cache. */
function codexModels(): ModelOption[] {
  const dir = join(homedir(), '.codex');
  let current = '';
  try {
    current = readFileSync(join(dir, 'config.toml'), 'utf8').match(/^model\s*=\s*"([^"]+)"/m)?.[1] ?? '';
  } catch {
    // no config: Codex falls back to its own default
  }
  const options: ModelOption[] = [{ id: '', label: current ? `Padrão (${current})` : 'Padrão do Codex' }];
  try {
    const cache = JSON.parse(readFileSync(join(dir, 'models_cache.json'), 'utf8')) as {
      models?: { slug: string; display_name?: string; visibility?: string }[];
    };
    for (const m of cache.models ?? []) {
      if (m.visibility === 'list' && m.slug !== current) options.push({ id: m.slug, label: m.display_name ?? m.slug });
    }
  } catch {
    // the cache is optional
  }
  return options;
}

/**
 * `agy models` prints one "slug<TAB>label" line per model the Google account can use. It lists
 * none when the account is signed out, which is how the office knows the Gemini login.
 */
export function agyModels(): Promise<ModelOption[]> {
  const fallback: ModelOption[] = [{ id: '', label: 'Padrão do Antigravity' }];
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(agyPath(), ['models'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on('data', (chunk) => (out += String(chunk)));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(fallback);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const listed = out
        .split(/\r?\n/)
        .map((line) => line.split('\t'))
        .filter((parts) => parts.length === 2 && parts[0].trim())
        .map(([id, label]) => ({ id: id.trim(), label: label.trim() }));
      setAgySignedIn(listed.length > 0);
      resolve([...fallback, ...listed]);
    });
  });
}

/** OpenCode's free models as its docs list them; `opencode models opencode` replaces this when it answers. */
const OPENCODE_FREE: ModelOption[] = [
  { id: '', label: 'Padrão (Big Pickle, grátis)' },
  ...['deepseek-v4.1-flash-free', 'glm-5.3-flash-free', 'mimo-v2.6-flash-free', 'nemotron-3-ultra-free', 'nemotron-3.5-super-vl-free'].map(
    (id) => ({ id: `opencode/${id}`, label: id }),
  ),
];

/** The free models the installed opencode offers right now ("opencode/<id>" lines). */
function opencodeModels(): Promise<ModelOption[]> {
  const exe = opencodePath();
  if (!exe) return Promise.resolve(OPENCODE_FREE);
  return new Promise((resolve) => {
    let out = '';
    const child = spawnOpencode(exe, ['models', 'opencode'], homedir());
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout?.on('data', (chunk) => (out += String(chunk)));
    child.on('error', () => {
      clearTimeout(timer);
      resolve(OPENCODE_FREE);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const free = out
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((id) => /^opencode\/[\w.-]+$/.test(id) && /free|big-pickle/.test(id) && id !== OPENCODE_DEFAULT_MODEL)
        .map((id) => ({ id, label: id.slice('opencode/'.length) }));
      resolve(free.length ? [OPENCODE_FREE[0], ...free] : OPENCODE_FREE);
    });
  });
}

/** Claude and Codex lists are immediate; the agy and opencode lists arrive when their CLIs answer. */
export async function loadModels(onUpdate: (models: ModelCatalog) => void): Promise<ModelCatalog> {
  const models: ModelCatalog = {
    claude: CLAUDE,
    codex: codexModels(),
    antigravity: [{ id: '', label: 'Padrão do Antigravity' }],
    opencode: OPENCODE_FREE,
  };
  void agyModels().then((list) => {
    models.antigravity = list;
    onUpdate(models);
  });
  void opencodeModels().then((list) => {
    models.opencode = list;
    onUpdate(models);
  });
  return models;
}
