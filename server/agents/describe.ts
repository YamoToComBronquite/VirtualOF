import { basename } from 'node:path';
import type { AgentStatus } from '../../shared/types.ts';

const READING = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'LS']);
const WRITING = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const RUNNING = new Set(['Bash', 'PowerShell', 'BashOutput']);

export function statusForTool(tool: string): AgentStatus {
  if (READING.has(tool)) return 'reading';
  if (WRITING.has(tool)) return 'writing';
  if (RUNNING.has(tool)) return 'running';
  return 'thinking';
}

const clip = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** One readable line for a Claude tool call, e.g. "Editando App.tsx" or "npm run build". */
export function describeTool(tool: string, input: Record<string, unknown>): string {
  const str = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
  const file = str('file_path') || str('notebook_path') || str('path');
  switch (statusForTool(tool)) {
    case 'reading':
      if (file) return `Lendo ${basename(file)}`;
      if (str('pattern')) return `Procurando "${clip(str('pattern'), 40)}"`;
      if (str('url')) return `Abrindo ${clip(str('url'), 60)}`;
      if (str('query')) return `Pesquisando "${clip(str('query'), 50)}"`;
      return `Lendo (${tool})`;
    case 'writing':
      return `${tool === 'Write' ? 'Criando' : 'Editando'} ${file ? basename(file) : 'arquivo'}`;
    case 'running':
      return clip(str('command') || tool);
    default:
      return clip(str('description') || str('prompt') || tool);
  }
}

export { clip };
