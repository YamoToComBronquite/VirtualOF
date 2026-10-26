import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { OfficeConfig } from '../config.ts';
import type { Office } from '../office.ts';

const POLL_MS = 2000;
const RECENT_MS = 24 * 60 * 60 * 1000;
const COLOR = '#6f8cf0';

/**
 * Watches Antigravity from the outside: each conversation is a .db file, and a file that was
 * written in the last few seconds means that agent is working. Nothing is opened or changed.
 */
export function watchAntigravity(settings: OfficeConfig['antigravity'], office: Office) {
  const shown = new Map<string, string>(); // file name -> agent id
  let warned = false;

  const tick = async () => {
    let files: { name: string; mtime: number }[];
    try {
      const names = (await readdir(settings.pasta)).filter((n) => n.endsWith('.db'));
      files = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(join(settings.pasta, name))).mtimeMs })));
    } catch {
      if (!warned) office.notice(`Não achei as conversas do Antigravity em ${settings.pasta}.`);
      warned = true;
      return;
    }

    const now = Date.now();
    const recent = files
      .filter((f) => now - f.mtime < RECENT_MS)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, settings.maximo);
    const keep = new Set(recent.map((f) => f.name));

    for (const [name, id] of shown) {
      if (!keep.has(name)) {
        office.removeAgent(id);
        shown.delete(name);
      }
    }

    recent.forEach((file) => {
      const id = `ag-${file.name.slice(0, 8)}`;
      const active = now - file.mtime < settings.ativoSegundos * 1000;
      const minutes = Math.round((now - file.mtime) / 60000);
      const activity = active ? 'Trabalhando no Antigravity' : minutes < 1 ? 'Parou agora há pouco' : `Parado há ${minutes} min`;
      if (!shown.has(file.name)) {
        shown.set(file.name, id);
        office.addAgent({
          id,
          name: `Antigravity ${shown.size}`,
          kind: 'antigravity',
          role: 'Só acompanhamento',
          color: COLOR,
          status: active ? 'writing' : 'idle',
          activity,
          controllable: false,
          usage: { inputTokens: 0, outputTokens: 0 },
        });
        return;
      }
      const agent = office.getAgent(id);
      const status = active ? 'writing' : 'idle';
      if (agent && (agent.status !== status || agent.activity !== activity)) {
        if (agent.status !== status) office.write(id, 'tool', active ? 'Começou a trabalhar' : 'Parou');
        office.setStatus(id, status, activity);
      }
    });
  };

  void tick();
  const timer = setInterval(() => void tick(), POLL_MS);
  return () => clearInterval(timer);
}
