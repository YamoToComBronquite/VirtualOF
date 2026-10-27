import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline';
import { TERMINAL_RULE, type Office } from '../office.ts';
import { clip } from './describe.ts';
import type { AgentStatus } from '../../shared/types.ts';
import type { RoleBrief, RunOutcome, Runner } from './runner.ts';

// npm.cmd on Windows: PowerShell's default policy blocks the npm.ps1 that a plain `npm` runs.
export const OPENCODE_INSTALL = `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} install -g opencode-ai`;
/** A model OpenCode offers for free, used when none was picked in Configurações. */
export const OPENCODE_DEFAULT_MODEL = 'opencode/big-pickle';
const LIMIT = /rate.?limit|too many requests|\b429\b|quota|exhausted|usage limit/i;
const AUTH = /api.?key|unauthori[sz]ed|\b401\b|authenticat|not logged/i;
/** Ids that are safe to put on a command line (the Windows launcher goes through cmd.exe). */
const SAFE_ARG = /^[\w./:@-]+$/;

/** The opencode launcher: on PATH (npm, scoop, choco) or where its own installer puts it. */
export function opencodePath(): string | undefined {
  const names = process.platform === 'win32' ? ['opencode.exe', 'opencode.cmd'] : ['opencode'];
  // npm's global folder is listed too: an install done after the office started is not on its PATH yet.
  const npmGlobal = process.env.APPDATA ? [join(process.env.APPDATA, 'npm')] : [];
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...npmGlobal, join(homedir(), '.opencode', 'bin')];
  for (const dir of dirs.filter(Boolean)) {
    for (const name of names) {
      const file = join(dir, name);
      if (existsSync(file)) return file;
    }
  }
  return undefined;
}

/** Starts opencode; npm's .cmd launcher on Windows only runs through the shell. */
export function spawnOpencode(exe: string, args: string[], cwd: string) {
  const shell = /\.(cmd|bat)$/i.test(exe);
  // `opencode run` takes its folder from PWD before the real cwd, so both must point at the project.
  return spawn(shell ? `"${exe}"` : exe, args, { cwd, shell, windowsHide: true, env: { ...process.env, PWD: cwd } });
}

function statusForTool(tool: string): AgentStatus {
  if (/write|edit|patch|create|delete|move/i.test(tool)) return 'writing';
  if (/bash|shell|command|run/i.test(tool)) return 'running';
  if (/read|list|grep|glob|search|find|fetch/i.test(tool)) return 'reading';
  return 'thinking';
}

/** Adds up the numbers that look like input and output tokens, wherever opencode nests them. */
function tokens(usage: unknown) {
  let input = 0;
  let output = 0;
  if (usage && typeof usage === 'object') {
    for (const [key, value] of Object.entries(usage)) {
      if (typeof value !== 'number') continue;
      if (/input|prompt/i.test(key)) input += value;
      else if (/output|completion/i.test(key)) output += value;
    }
  }
  return { input, output };
}

interface OpencodeEvent {
  type: 'step_start' | 'text' | 'reasoning' | 'tool_use' | 'step_finish' | 'error';
  sessionID?: string;
  part?: {
    text?: string;
    tool?: string;
    state?: { status?: string; input?: Record<string, unknown>; error?: string };
    tokens?: unknown;
    cost?: number;
  };
  error?: { message?: string };
}

/**
 * OpenCode's free models through `opencode run --format json`, one run per task, with the
 * prompt on stdin. A headless run can't ask for permission, so anything opencode would ask
 * about is refused; edits and commands its own config allows go ahead without sticky notes.
 */
export class OpencodeAgent implements Runner {
  private child?: ChildProcess;
  private sessionId?: string;
  private sessionCwd?: string;
  private sessionRole?: string;
  private stopped = false;
  private outcome: RunOutcome = { ok: false, text: '' };

  constructor(
    private readonly id: string,
    private readonly office: Office,
    private readonly brief: RoleBrief,
  ) {}

  get busy() {
    return this.child !== undefined;
  }

  reset() {
    this.sessionId = undefined;
  }

  stop() {
    this.stopped = true;
    this.child?.kill();
  }

  run(prompt: string, cwd: string, note?: string): Promise<RunOutcome> {
    const { id } = this;
    const role = this.brief();
    const setup = `${role.key}|${role.model}`;
    if (this.sessionCwd !== cwd || this.sessionRole !== setup) this.reset();
    this.sessionCwd = cwd;
    this.sessionRole = setup;

    let input = note ? `${prompt}\n\n${note}` : prompt;
    // No system prompt flag here either, so the role goes in front of the first message.
    if (!this.sessionId) input = `${role.instructions}\n\n${TERMINAL_RULE}\n\n${input}`;

    this.stopped = false;
    this.outcome = { ok: false, text: '' };
    this.office.write(id, 'task', prompt);
    this.office.setStatus(id, 'thinking', 'Lendo a tarefa');

    const exe = opencodePath();
    if (!exe) {
      this.fail('O OpenCode não está instalado neste computador.');
      this.office.needTerminal(id, OPENCODE_INSTALL, 'Os modelos grátis rodam pelo OpenCode, que ainda não está instalado. Precisa do Node.js.');
      return Promise.resolve(this.outcome);
    }
    const model = role.model || OPENCODE_DEFAULT_MODEL;
    const args = ['run', '--format', 'json'];
    if (SAFE_ARG.test(model)) args.push('--model', model);
    if (this.sessionId && SAFE_ARG.test(this.sessionId)) args.push('--session', this.sessionId);

    return new Promise((resolve) => {
      let stderr = '';
      const replies: string[] = [];
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        this.child = undefined;
        resolve(this.outcome);
      };
      const child = spawnOpencode(exe, args, cwd);
      this.child = child;
      child.stdin?.end(input);

      child.on('error', (error) => {
        this.fail(error.message);
        settle();
      });
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));

      createInterface({ input: child.stdout! }).on('line', (line) => {
        let event: OpencodeEvent;
        try {
          event = JSON.parse(line) as OpencodeEvent;
        } catch {
          return; // not every line is an event
        }
        if (event.sessionID) this.sessionId = event.sessionID;
        const part = event.part ?? {};
        if (event.type === 'text' && part.text?.trim()) {
          replies.push(part.text.trim());
          this.office.setStatus(id, 'thinking', clip(part.text.trim().split('\n').at(-1) ?? '', 70));
        } else if (event.type === 'tool_use' && part.tool) {
          const target = Object.values(part.state?.input ?? {}).find((v) => typeof v === 'string') as string | undefined;
          const text = clip(target ? `${part.tool}: ${target}` : part.tool);
          this.office.write(id, 'tool', part.state?.status === 'error' ? `${text} (falhou)` : text);
          this.office.setStatus(id, statusForTool(part.tool), text);
        } else if (event.type === 'step_finish') {
          const usage = tokens(part.tokens);
          this.office.addUsage(id, usage.input, usage.output);
        } else if (event.type === 'error') {
          this.fail(event.error?.message || 'O OpenCode deu erro.');
        }
      });

      child.on('close', (code) => {
        if (settled) return;
        if (this.stopped) {
          this.office.setStatus(id, 'idle', 'Parado por você');
          this.office.write(id, 'result', 'Tarefa interrompida.');
          this.outcome = { ok: false, text: 'Interrompida pelo usuário.' };
        } else if (!this.outcome.text && code === 0) {
          const text = replies.join('\n\n');
          if (text) this.office.say(id, text);
          this.office.setStatus(id, 'done', 'Terminou a tarefa');
          this.office.write(id, 'result', 'Pronto.');
          this.outcome = { ok: true, text };
          if (this.office.isLimited('opencode')) this.office.setQuota('opencode', { status: 'ok' });
        } else if (!this.outcome.text) {
          const detail = stderr.trim().split('\n').slice(-3).join('\n');
          this.fail(detail || `O opencode saiu com código ${code}.`);
        }
        settle();
      });
    });
  }

  private fail(text: string) {
    const { id } = this;
    this.office.write(id, 'error', text);
    if (!this.outcome.text) this.outcome = { ok: false, text };
    if (LIMIT.test(text)) {
      this.outcome.limited = true;
      this.office.setStatus(id, 'error', 'Limite do modelo grátis atingido');
      this.office.setQuota('opencode', { status: 'limited' });
      return;
    }
    if (AUTH.test(text)) {
      this.office.setStatus(id, 'error', 'Falta entrar no OpenCode');
      this.office.needTerminal(id, 'opencode auth login', 'Este modelo pede login. Escolha o provedor OpenCode e siga o que aparecer.');
      return;
    }
    this.office.setStatus(id, 'error', 'Deu erro, veja o registro');
  }
}
