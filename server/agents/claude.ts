import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentConfig } from '../config.ts';
import { TERMINAL_RULE, type Office } from '../office.ts';
import { clip, describeTool, statusForTool } from './describe.ts';

/**
 * A Claude Code session driven through the Agent SDK. Runs on the user's own Claude login;
 * every tool call that needs approval becomes a sticky note in the office.
 */
export class ClaudeAgent {
  private sessionId?: string;
  private sessionCwd?: string;
  private abort?: AbortController;
  private sessionCost = 0;
  private closedSessionsCost = 0;

  constructor(
    private readonly config: AgentConfig,
    private readonly office: Office,
  ) {}

  get busy() {
    return this.abort !== undefined;
  }

  async run(prompt: string, cwd: string) {
    const { id } = this.config;
    // A session belongs to one folder; switching projects starts a fresh conversation.
    if (this.sessionCwd !== cwd) {
      this.sessionId = undefined;
      this.closedSessionsCost += this.sessionCost;
      this.sessionCost = 0;
    }
    this.sessionCwd = cwd;
    this.abort = new AbortController();
    this.office.write(id, 'task', prompt);
    this.office.setStatus(id, 'thinking', 'Lendo a tarefa');

    try {
      const run = query({
        prompt,
        options: {
          cwd,
          resume: this.sessionId,
          abortController: this.abort,
          systemPrompt: { type: 'preset', preset: 'claude_code', append: `${this.config.instrucoes}\n\n${TERMINAL_RULE}` },
          canUseTool: async (tool, input, { signal }) => {
            this.office.setStatus(id, 'waiting', `Esperando você aprovar: ${tool}`);
            const allow = await this.office.askPermission(id, tool, describeTool(tool, input), signal);
            this.office.setStatus(id, allow ? statusForTool(tool) : 'thinking', allow ? describeTool(tool, input) : 'Permissão negada');
            return allow
              ? { behavior: 'allow', updatedInput: input }
              : { behavior: 'deny', message: 'O usuário negou essa ação pelo escritório virtual.' };
          },
        },
      });
      for await (const message of run) this.handle(message);
    } catch (error) {
      if (this.abort?.signal.aborted) {
        this.office.setStatus(id, 'idle', 'Parado por você');
        this.office.write(id, 'result', 'Tarefa interrompida.');
      } else {
        const text = error instanceof Error ? error.message : String(error);
        this.office.setStatus(id, 'error', 'Deu erro, veja o registro');
        this.office.write(id, 'error', text);
      }
    } finally {
      this.abort = undefined;
    }
  }

  stop() {
    this.abort?.abort();
  }

  private handle(message: SDKMessage) {
    const { id } = this.config;
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') this.sessionId = message.session_id;
        break;
      case 'assistant':
        // Subagent traffic (parent_tool_use_id set) stays out of the log to keep it readable.
        if (message.parent_tool_use_id) break;
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            this.office.say(id, block.text.trim());
            this.office.setStatus(id, 'thinking', clip(block.text.trim().split('\n')[0], 70));
          } else if (block.type === 'tool_use') {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const line = describeTool(block.name, input);
            this.office.write(id, 'tool', line);
            this.office.setStatus(id, statusForTool(block.name), line);
          }
        }
        break;
      case 'result': {
        this.sessionId = message.session_id;
        const usage = message.usage;
        this.office.addUsage(id, usage.input_tokens + (usage.cache_read_input_tokens ?? 0), usage.output_tokens);
        // total_cost_usd is a running total that a resumed session carries over, so it replaces
        // this session's share instead of adding to it.
        this.sessionCost = message.total_cost_usd;
        const agent = this.office.getAgent(id);
        if (agent) this.office.update(id, { usage: { ...agent.usage, costUsd: this.closedSessionsCost + this.sessionCost } });
        if (message.subtype === 'success') {
          this.office.setStatus(id, 'done', 'Terminou a tarefa');
          this.office.write(id, 'result', `Pronto em ${Math.round(message.duration_ms / 1000)} s.`);
        } else {
          this.office.setStatus(id, 'error', 'Parou com erro');
          this.office.write(id, 'error', message.errors.join('\n') || message.subtype);
        }
        break;
      }
    }
  }
}
