import { Codex, type Thread, type ThreadEvent, type ThreadItem } from '@openai/codex-sdk';
import { basename } from 'node:path';
import type { AgentConfig } from '../config.ts';
import { fileURLToPath } from 'node:url';
import { TERMINAL_RULE, type Office } from '../office.ts';
import { clip } from './describe.ts';

/** The Codex binary ships inside this project's node_modules, so its login runs from here. */
const OFFICE_DIR = fileURLToPath(new URL('../..', import.meta.url));

/**
 * A Codex thread driven through the Codex SDK, on the user's ChatGPT login. Codex has no
 * per-call approval hook in exec mode, so safety comes from the sandbox (read-only by default).
 */
export class CodexAgent {
  private codex = new Codex();
  private thread?: Thread;
  private threadCwd?: string;
  private abort?: AbortController;

  constructor(
    private readonly config: AgentConfig,
    private readonly office: Office,
  ) {}

  get busy() {
    return this.abort !== undefined;
  }

  async run(prompt: string, cwd: string) {
    const { id } = this.config;
    let input = prompt;
    if (!this.thread || this.threadCwd !== cwd) {
      this.thread = this.codex.startThread({
        workingDirectory: cwd,
        skipGitRepoCheck: true,
        sandboxMode: this.config.sandbox ?? 'read-only',
        approvalPolicy: 'never',
      });
      this.threadCwd = cwd;
      // The SDK has no system prompt, so the role goes in front of the first message.
      input = `${this.config.instrucoes}\n\n${TERMINAL_RULE}\n\n${prompt}`;
    }
    this.abort = new AbortController();
    this.office.write(id, 'task', prompt);
    this.office.setStatus(id, 'thinking', 'Lendo a tarefa');

    try {
      const { events } = await this.thread.runStreamed(input, { signal: this.abort.signal });
      for await (const event of events) this.handle(event);
    } catch (error) {
      if (this.abort?.signal.aborted) {
        this.office.setStatus(id, 'idle', 'Parado por você');
        this.office.write(id, 'result', 'Tarefa interrompida.');
      } else {
        this.fail(error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.abort = undefined;
    }
  }

  stop() {
    this.abort?.abort();
  }

  private fail(text: string) {
    const { id } = this.config;
    this.office.setStatus(id, 'error', 'Deu erro, veja o registro');
    this.office.write(id, 'error', text);
    if (/login|auth|401|unauthorized/i.test(text)) {
      this.thread = undefined; // the next task starts clean after the login
      this.office.needTerminal(id, `cd "${OFFICE_DIR}"; npx codex login`, 'O Codex ainda não está logado na sua conta do ChatGPT.');
    }
  }

  private handle(event: ThreadEvent) {
    const { id } = this.config;
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
    const { id } = this.config;
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
    const { id } = this.config;
    switch (item.type) {
      case 'agent_message':
        if (item.text.trim()) this.office.say(id, item.text.trim());
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
