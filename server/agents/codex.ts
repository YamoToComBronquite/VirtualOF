import { Codex, type Thread, type ThreadEvent, type ThreadItem } from '@openai/codex-sdk';
import { basename } from 'node:path';
import { EDITING_ROLES } from '../../shared/types.ts';
import { TERMINAL_RULE, type Office } from '../office.ts';
import { codexBinary, packagedCodex } from './binaries.ts';
import { clip } from './describe.ts';
import type { RoleBrief, RunOutcome, Runner } from './runner.ts';

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

  async run(prompt: string, cwd: string, note?: string): Promise<RunOutcome> {
    const { id } = this;
    let input = note ? `${prompt}\n\n${note}` : prompt;
    const role = this.brief();
    // Sandbox and model are fixed per thread, so changing either (even for one covered step)
    // needs a new thread.
    if (!this.thread || this.threadCwd !== cwd || this.threadRole !== role.key || this.threadModel !== role.model) {
      this.threadRole = role.key;
      this.threadModel = role.model;
      this.thread = this.codex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck: true,
        sandboxMode: EDITING_ROLES.includes(role.key) ? 'workspace-write' : 'read-only',
        model: role.model || undefined,
        approvalPolicy: 'never',
      });
      this.threadCwd = cwd;
      // The SDK has no system prompt, so the role goes in front of the first message.
      input = `${role.instructions}\n\n${TERMINAL_RULE}\n\n${input}`;
    }
    this.abort = new AbortController();
    this.outcome = { ok: false, text: '' };
    this.office.write(id, 'task', prompt);
    this.office.setStatus(id, 'thinking', 'Lendo a tarefa');

    try {
      const { events } = await this.thread.runStreamed(input, { signal: this.abort.signal });
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
        if (this.office.isLimited('codex')) this.office.setQuota('codex', { status: 'ok' });
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
