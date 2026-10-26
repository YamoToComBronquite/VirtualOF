import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelCatalog, ModelOption } from '../shared/types.ts';
import { agyPath } from './agents/agy.ts';

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

/** `agy models` prints one "slug<TAB>label" line per model the Google account can use. */
function agyModels(): Promise<ModelOption[]> {
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
      resolve([...fallback, ...listed]);
    });
  });
}

/** Claude and Codex lists are immediate; the agy list arrives when the CLI answers. */
export async function loadModels(onUpdate: (models: ModelCatalog) => void): Promise<ModelCatalog> {
  const models: ModelCatalog = {
    claude: CLAUDE,
    codex: codexModels(),
    antigravity: [{ id: '', label: 'Padrão do Antigravity' }],
  };
  void agyModels().then((list) => {
    models.antigravity = list;
    onUpdate(models);
  });
  return models;
}
