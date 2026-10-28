import { query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { Office } from '../office.ts';
import { claudeBinary } from './binaries.ts';
import { clip, describeTool, statusForTool } from './describe.ts';
import { imagesNote, type RoleBrief, type RunImage, type RunOutcome, type Runner } from './runner.ts';

/** The prompt as one user message with image blocks, the way the SDK takes images. */
async function* withImages(text: string, images: RunImage[]): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        ...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mime, data: i.data } })),
        { type: 'text' as const, text: `${text}\n\n${imagesNote(images)}` },
      ],
    },
  };
}

const WINDOW_NAMES: Record<string, string> = {
  five_hour: '5 horas',
  seven_day: '7 dias',
  seven_day_opus: '7 dias (Opus)',
  seven_day_sonnet: '7 dias (Sonnet)',
  seven_day_overage_included: '7 dias',
  overage: 'uso extra',
};

/**
 * A Claude Code session driven through the Agent SDK. Runs on the user's own Claude login;
 * every tool call that needs approval becomes a sticky note in the office.
 */
export class ClaudeAgent implements Runner {
  private sessionId?: string;
  private sessionCwd?: string;
  private abort?: AbortController;
  private sessionCost = 0;
  private closedSessionsCost = 0;
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
    this.sessionId = undefined;
    this.closedSessionsCost += this.sessionCost;
    this.sessionCost = 0;
  }

  async run(prompt: string, cwd: string, note?: string, images: RunImage[] = []): Promise<RunOutcome> {
    const { id } = this;
    // A session belongs to one folder; switching projects starts a fresh conversation.
    if (this.sessionCwd !== cwd) this.reset();
    this.sessionCwd = cwd;
    const brief = this.brief();
    this.abort = new AbortController();
    this.outcome = { ok: false, text: '' };
    this.office.write(id, 'task', prompt);
    this.office.setStatus(id, 'thinking', 'Lendo a tarefa');

    try {
      const text = note ? `${prompt}\n\n${note}` : prompt;
      const run = query({
        prompt: images.length ? withImages(text, images) : text,
        options: {
          cwd,
          resume: this.sessionId,
          abortController: this.abort,
          // Same setup as the user's Claude Code: their settings, CLAUDE.md, plugins, MCP
          // servers, and every skill they installed.
          settingSources: ['user', 'project', 'local'],
          skills: 'all',
          systemPrompt: { type: 'preset', preset: 'claude_code', append: `${brief.instructions}\n\n${this.office.terminalRule()}` },
          // Empty means whatever the user's Claude Code is set to.
          model: brief.model || undefined,
          pathToClaudeCodeExecutable: claudeBinary(),
          canUseTool: async (tool, input, { signal }) => {
            // Mid-task near the limit: the user may hand the rest to an agent on another account.
            if (this.office.autoSwitch && this.office.nearLimit('claude')) {
              this.office.setStatus(id, 'waiting', 'Perto do limite: continuar ou trocar?');
              if ((await this.office.confirmLimit(id, 'claude', signal)) === 'switch') {
                this.outcome.limited = true;
                this.abort?.abort();
                return { behavior: 'deny', message: 'A tarefa vai para um agente de outra conta.' };
              }
            }
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
      if (this.abort?.signal.aborted && this.outcome.limited) {
        // Stopped to hand over near the limit: the office passes the task on with what was done.
        this.office.setStatus(id, 'idle', 'Passou a tarefa para outra conta');
        this.outcome = { ok: false, text: this.outcome.text, limited: true };
      } else if (this.abort?.signal.aborted) {
        this.office.setStatus(id, 'idle', 'Parado por você');
        this.office.write(id, 'result', 'Tarefa interrompida.');
        this.outcome = { ok: false, text: 'Interrompida pelo usuário.' };
      } else {
        const text = error instanceof Error ? error.message : String(error);
        this.office.setStatus(id, 'error', 'Deu erro, veja o registro');
        this.office.write(id, 'error', text);
        this.outcome = { ok: false, text };
      }
    } finally {
      this.abort = undefined;
    }
    return this.outcome;
  }

  stop() {
    this.abort?.abort();
  }

  private handle(message: SDKMessage) {
    const { id } = this;
    switch (message.type) {
      case 'system':
        if (message.subtype === 'init') {
          this.sessionId = message.session_id;
          this.office.update(id, {
            toolkit: {
              skills: message.skills,
              plugins: message.plugins.map((p) => p.name),
              mcp: message.mcp_servers.filter((s) => s.status === 'connected').map((s) => s.name),
            },
          });
        }
        break;
      case 'rate_limit_event': {
        const info = message.rate_limit_info;
        const resetsAt = info.resetsAt === undefined ? undefined : info.resetsAt < 1e12 ? info.resetsAt * 1000 : info.resetsAt;
        const status = info.status === 'rejected' ? 'limited' : info.status === 'allowed_warning' ? 'warning' : 'ok';
        this.office.setQuota('claude', {
          status,
          utilization: info.utilization,
          window: info.rateLimitType ? WINDOW_NAMES[info.rateLimitType] : undefined,
          resetsAt,
        });
        if (status === 'limited') this.outcome.limited = true;
        break;
      }
      case 'assistant':
        if (message.error === 'rate_limit') {
          this.outcome.limited = true;
          if (!this.office.isLimited('claude')) this.office.setQuota('claude', { status: 'limited' });
        }
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
        const limited = this.outcome.limited ?? false;
        if (message.subtype === 'success' && !limited) {
          this.office.setStatus(id, 'done', 'Terminou a tarefa');
          this.office.write(id, 'result', `Pronto em ${Math.round(message.duration_ms / 1000)} s.`);
          this.outcome = { ok: true, text: message.result };
        } else {
          const text = (message.subtype === 'success' ? message.result : message.errors.join('\n')) || message.subtype;
          this.office.setStatus(id, 'error', limited ? 'Limite de uso do Claude atingido' : 'Parou com erro');
          this.office.write(id, 'error', text);
          this.outcome = { ok: false, text, limited };
        }
        break;
      }
    }
  }
}
