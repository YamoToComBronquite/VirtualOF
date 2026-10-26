import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, normalize, sep } from 'node:path';
import type { Account, SkillCatalog, SkillFile, SkillInfo } from '../shared/types.ts';

/** Where each tool looks for the user's own skills (one folder per skill, with a SKILL.md). */
export const SKILL_DIRS: Record<Account, string> = {
  claude: join(homedir(), '.claude', 'skills'),
  codex: join(homedir(), '.codex', 'skills'),
  antigravity: join(homedir(), '.gemini', 'antigravity-cli', 'skills'),
  opencode: join(homedir(), '.config', 'opencode', 'skills'),
};

const MAX_FILES = 300;
const MAX_BYTES = 10 * 1024 * 1024;
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Reads `name` and `description` from the YAML-ish frontmatter at the top of a SKILL.md. */
export function parseSkill(text: string): { name?: string; description?: string } {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!block) return {};
  const field = (key: string) => {
    const value = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1].trim();
    return value?.replace(/^(['"])(.*)\1$/, '$2');
  };
  return { name: field('name'), description: field('description') };
}

export function listSkills(): SkillCatalog {
  const catalog = { claude: [], codex: [], antigravity: [], opencode: [] } as SkillCatalog;
  for (const account of Object.keys(SKILL_DIRS) as Account[]) {
    const root = SKILL_DIRS[account];
    if (!existsSync(root)) continue;
    for (const folder of readdirSync(root)) {
      const file = join(root, folder, 'SKILL.md');
      if (!existsSync(file)) continue;
      const meta = parseSkill(readFileSync(file, 'utf8'));
      catalog[account].push({ name: meta.name ?? folder, description: meta.description ?? '', folder });
    }
    catalog[account].sort((a: SkillInfo, b: SkillInfo) => a.name.localeCompare(b.name));
  }
  return catalog;
}

const ALL = Object.keys(SKILL_DIRS) as Account[];

/**
 * Skills are shared by the whole office: every agent runs on one of these tools, so a skill
 * that sits in all three folders reaches every agent, including ones added later.
 * Copies each skill to the tools that miss it; never overwrites. Returns a message for the user.
 */
export function shareSkills(): { ok: boolean; message: string } {
  const catalog = listSkills();
  let copied = 0;
  for (const from of ALL) {
    for (const skill of catalog[from]) {
      for (const to of ALL) {
        if (catalog[to].some((s) => s.name === skill.name) || existsSync(join(SKILL_DIRS[to], skill.folder))) continue;
        cpSync(join(SKILL_DIRS[from], skill.folder), join(SKILL_DIRS[to], skill.folder), { recursive: true, errorOnExist: false, force: false });
        catalog[to].push(skill);
        copied++;
      }
    }
  }
  return copied
    ? { ok: true, message: `Pronto: ${copied} cópia(s) feitas. Agora todos os agentes têm as mesmas skills.` }
    : { ok: true, message: 'Todos os agentes já tinham as mesmas skills.' };
}

/**
 * Installs an uploaded skill folder into every tool's skills folder, so all agents get it. Paths are checked so
 * nothing lands outside the new skill's folder, and an existing skill is never overwritten.
 * Returns a message for the user.
 */
export function importSkill(files: SkillFile[]): { ok: boolean; message: string } {
  if (!files.length || files.length > MAX_FILES) return { ok: false, message: `A skill precisa ter entre 1 e ${MAX_FILES} arquivos.` };

  const decoded = files.map((f) => ({ path: f.path.replace(/\\/g, '/'), data: Buffer.from(f.base64, 'base64') }));
  const size = decoded.reduce((sum, f) => sum + f.data.length, 0);
  if (size > MAX_BYTES) return { ok: false, message: 'A skill passa de 10 MB. Tire arquivos grandes que ela não precisa.' };

  for (const f of decoded) {
    const clean = normalize(f.path);
    if (!f.path || f.path.startsWith('/') || /^[a-z]:/i.test(f.path) || clean.split(sep).includes('..')) {
      return { ok: false, message: `Caminho de arquivo inválido na skill: ${f.path}` };
    }
  }

  const skillMd = decoded.find((f) => f.path === 'SKILL.md');
  if (!skillMd) return { ok: false, message: 'Não achei o SKILL.md na raiz da pasta da skill.' };
  const meta = parseSkill(skillMd.data.toString('utf8'));
  if (!meta.name || !NAME.test(meta.name)) {
    return { ok: false, message: 'O SKILL.md precisa de um "name:" no topo, só com letras, números, - ou _.' };
  }
  if (!meta.description) return { ok: false, message: 'O SKILL.md precisa de uma "description:" no topo.' };

  // A tool that already has a skill with this name keeps its own copy.
  const targets = ALL.filter((t) => !existsSync(join(SKILL_DIRS[t], meta.name!)));
  if (!targets.length) {
    return { ok: false, message: `Todos os agentes já têm uma skill "${meta.name}". Apague ou renomeie a antiga antes de importar.` };
  }

  for (const target of targets) {
    const root = join(SKILL_DIRS[target], meta.name);
    for (const f of decoded) {
      const dest = join(root, normalize(f.path));
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, f.data);
    }
  }
  return { ok: true, message: `Skill "${meta.name}" instalada para todos os agentes. Vale a partir da próxima tarefa.` };
}
