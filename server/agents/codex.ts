import { Codex, type Input, type Thread, type ThreadEvent, type ThreadItem } from '@openai/codex-sdk';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { EDITING_ROLES, type Quota } from '../../shared/types.ts';
import type { Office } from '../office.ts';
import { codexBinary, packagedCodex } from './binaries.ts';
import { clip } from './describe.ts';
import { imagesNote, type RoleBrief, type RunImage, type RunOutcome, type Runner } from './runner.ts';

/** Codex ships inside this project's packages, so its login runs that same executable. */
export function loginCommand() {
  const exe = codexBinary();
  return exe ? `& "${exe}" login` : 'npx codex login';
}

/** Reads "try again at 1:34 PM" from a Codex limit message as today's (or tomorrow's) time. */
function parseRetryAt(text: string): number | undefined {
  const match = text.match(/try again at (\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return undefined;
  let hours = Number(match[1]);
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  const at = new Date();
  at.setHours(hours, Number(match[2]), 0, 0);
  if (at.getTime() < Date.now()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/**
 * How much of the ChatGPT plan's usage windows the last turn left used. The SDK doesn't report
 * it, but Codex writes it into the thread's session file (`rate_limits`, newest last).
 */
export function readCodexLimits(threadId: string, home = process.env.CODEX_HOME || join(homedir(), '.codex')): Quota | undefined {
  const root = join(home, 'sessions');
  // Session files sit in sessions/YYYY/MM/DD/; a thread from the last few days is in one of the newest folders.
  const newest = (dir: string) => (existsSync(dir) ? readdirSync(dir).sort().reverse().slice(0, 3) : []);
  for (const year of newest(root)) {
    for (const month of newest(join(root, year))) {
      for (const day of newest(join(root, year, month))) {
        const folder = join(root, year, month, day);
        const file = readdirSync(folder).find((name) => name.endsWith(`${threadId}.jsonl`));
        if (file) return parseCodexLimits(readFileSync(join(folder, file), 'utf8'));
      }
    }
  }
  return undefined;
}

const WINDOWS: Record<number, string> = { 300: '5 horas', 10080: '7 dias' };

/** The fuller of the two windows (5 hours, 7 days) in the last rate_limits a session file holds. */
export function parseCodexLimits(text: string): Quota | undefined {
  const last = text.lastIndexOf('"rate_limits"');
  if (last < 0) return undefined;
  const windows = [...text.slice(last).matchAll(/"(?:primary|secondary)":\{"used_percent":([\d.]+),"window_minutes":(\d+),"resets_at":(\d+)\}/g)]
    .map((m) => ({ used: Number(m[1]) / 100, minutes: Number(m[2]), resetsAt: Number(m[3]) * 1000 }));
  if (!windows.length) return undefined;
  const top = windows.reduce((a, b) => (b.used > a.used ? b : a));
  return {
    status: top.used >= 1 ? 'limited' : top.used >= 0.8 ? 'warning' : 'ok',
    utilization: top.used,
    window: WINDOWS[top.minutes] ?? `${Math.round(top.minutes / 60)} horas`,
    resetsAt: top.resetsAt,
  };
}

/**
 * A Codex thread driven through the Codex SDK, on the user's ChatGPT login. Codex has no
 * per-call approval hook in exec mode, so safety comes from the sandbox: it may only write
 * files while it is an executor.
 */
export class CodexAgent implements Runner {
  // Inside the desktop app the SDK must be pointed at the unpacked executable.
  private codex = new Codex({ codexPathOverride: packagedCodex() });
  private thread?: Thread;
  private threadCwd?: string;
  private threadRole?: string;
  private threadModel?: string;
  private threadFull?: boolean;
  private abort?: AbortController;
  private outcome: RunOutcome = { ok: false, text: '' };

  constructor(
    private readonly id: string,
    private readonly office: Office,
    private readonly brief: RoleBrief,
  ) {}

  get busy() {
    return this.abort !== undefined;
  }

  reset() {
    this.thread = undefined;
  }

  async run(prompt: string, cwd: string, note?: string, images: RunImage[] = []): Promise<RunOutcome> {
    const { id } = this;
    let input = note ? `${prompt}\n\n${note}` : prompt;
    const role = this.brief();
    // Sandbox and model are fixed per thread, so changing either (even for one covered step)
    // needs a new thread.
    const editing = EDITING_ROLES.includes(role.key);
    const full = editing && this.office.permissionMode === 'auto';
    if (!this.thread || this.threadCwd !== cwd || this.threadRole !== role.key || this.threadModel !== role.model || this.threadFull !== full) {
      this.threadRole = role.key;
      this.threadFull = full;
      this.threadModel = role.model;
      this.thread = this.codex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck: true,
        // Full authorization lifts the sandbox (commands, network, installs); otherwise edits stay in the project.
        sandboxMode: full ? 'danger-full-access' : editing ? 'workspace-write' : 'read-only',
        model: role.model || undefined,
        approvalPolicy: 'never',
      });
      this.threadCwd = cwd;
      // The SDK has no system prompt, so the role goes in front of the first message.
      input = `${role.instructions}\n\n${this.office.terminalRule()}\n\n${input}`;
    }
    this.abort = new AbortController();
    this.outcome = { ok: false, text: '' };
    this.office.write(id, 'task', prompt);
    this.office.setStatus(id, 'thinking', 'Lendo a tarefa');

    try {
      const turn: Input = images.length
        ? [{ type: 'text', text: `${input}\n\n${imagesNote(images)}` }, ...images.map((i) => ({ type: 'local_image' as const, path: i.path }))]
        : input;
      const { events } = await this.thread.runStreamed(turn, { signal: this.abort.signal });
      for await (const event of events) this.handle(event);
    } catch (error) {
      if (this.abort?.signal.aborted) {
        this.office.setStatus(id, 'idle', 'Parado por você');
        this.office.write(id, 'result', 'Tarefa interrompida.');
        this.outcome = { ok: false, text: 'Interrompida pelo usuário.' };
      } else if (!this.outcome.text) {
        this.fail(error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.abort = undefined;
    }
    return this.outcome;
  }

  stop() {
    this.abort?.abort();
  }

  /** After a turn, the plan's usage from Codex's own session file; it feeds Consumo and the 90% question. */
  private readLimits() {
    let quota: Quota | undefined;
    try {
      quota = this.thread?.id ? readCodexLimits(this.thread.id) : undefined;
    } catch {
      // the file is Codex's, not ours; without it the office just doesn't know the percentage
    }
    if (quota && quota.status !== 'limited') this.office.setQuota('codex', quota);
    else if (this.office.isLimited('codex')) this.office.setQuota('codex', { status: 'ok' });
  }

  private fail(text: string) {
    const { id } = this;
    this.office.write(id, 'error', text);
    // The first error says what went wrong; the process exit that follows only says it exited.
    if (this.outcome.ok || !this.outcome.text) this.outcome = { ok: false, text };
    if (/usage limit|rate limit/i.test(text)) {
      this.outcome.limited = true;
      this.office.setStatus(id, 'error', 'Limite de uso do ChatGPT atingido');
      this.office.setQuota('codex', { status: 'limited', resetsAt: parseRetryAt(text) });
      return;
    }
    this.office.setStatus(id, 'error', 'Deu erro, veja o registro');
    if (/login|auth|401|unauthorized/i.test(text)) {
      this.thread = undefined; // the next task starts clean after the login
      this.office.needTerminal(id, loginCommand(), 'O Codex ainda não está logado na sua conta do ChatGPT.');
    }
  }

  private handle(event: ThreadEvent) {
    const { id } = this;
    switch (event.type) {
      case 'item.started':
        this.started(event.item);
        break;
      case 'item.completed':
        this.completed(event.item);
        break;
      case 'turn.completed':
        this.office.addUsage(id, event.usage.input_tokens, event.usage.output_tokens + event.usage.reasoning_output_tokens);
        this.office.setStatus(id, 'done', 'Terminou a tarefa');
        this.office.write(id, 'result', 'Pronto.');
        this.outcome.ok = true;
        this.readLimits();
        break;
      case 'turn.failed':
        this.fail(event.error.message);
        break;
      case 'error':
        this.fail(event.message);
        break;
    }
  }

  private started(item: ThreadItem) {
    const { id } = this;
    switch (item.type) {
      case 'reasoning':
        this.office.setStatus(id, 'thinking', 'Pensando');
        break;
      case 'command_execution':
        this.office.setStatus(id, 'running', clip(item.command));
        this.office.write(id, 'tool', clip(item.command));
        break;
      case 'web_search':
        this.office.setStatus(id, 'reading', `Pesquisando "${clip(item.query, 50)}"`);
        break;
      case 'mcp_tool_call':
        this.office.setStatus(id, 'thinking', `${item.server}: ${item.tool}`);
        break;
    }
  }

  private completed(item: ThreadItem) {
    const { id } = this;
    switch (item.type) {
      case 'agent_message':
        if (item.text.trim()) {
          this.office.say(id, item.text.trim());
          this.outcome.text = item.text.trim();
        }
        break;
      case 'file_change': {
        const files = item.changes.map((c) => basename(c.path)).join(', ');
        this.office.setStatus(id, 'writing', `Editando ${clip(files, 60)}`);
        this.office.write(id, 'tool', `Editou ${files}`);
        break;
      }
      case 'error':
        this.office.write(id, 'error', item.message);
        break;
    }
  }
}
