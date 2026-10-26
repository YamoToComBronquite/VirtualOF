import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { TERMINAL_RULE, type Office } from '../office.ts';
import { clip } from './describe.ts';
import type { AgentStatus } from '../../shared/types.ts';
import type { RoleBrief, RunOutcome, Runner } from './runner.ts';

const INSTALL_COMMAND = 'irm https://antigravity.google/cli/install.ps1 | iex';
const LIMIT = /quota|rate.?limit|resource.?exhausted|\b429\b|usage limit|exhausted/i;

/** Where the official installer puts agy on Windows; elsewhere we rely on PATH. */
export function agyPath() {
  const local = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe') : '';
  return local && existsSync(local) ? local : 'agy';
}

function statusForAgyTool(tool: string): AgentStatus {
  if (/write|replace|edit|create|delete|move/i.test(tool)) return 'writing';
  if (/command|terminal|shell|run/i.test(tool)) return 'running';
  if (/view|read|list|grep|search|find|fetch|browse/i.test(tool)) return 'reading';
  return 'thinking';
}

function describeAgyTool(tool: string, params: Record<string, unknown>) {
  const value = Object.values(params).find((v) => typeof v === 'string') as string | undefined;
  return clip(value ? `${tool}: ${value}` : tool);
}

/** agy reports usage as an object whose exact keys aren't documented; add up what looks like tokens. */
function tokens(usage: unknown) {
  let input = 0;
  let output = 0;
  if (usage && typeof usage === 'object') {
    for (const [key, value] of Object.entries(usage)) {
      if (typeof value !== 'number') continue;
      if (/input|prompt/i.test(key)) input += value;
      else if (/output|candidate|completion|response/i.test(key)) output += value;
    }
  }
  return { input, output };
}

interface AgyEvent {
  event: 'init' | 'step_update' | 'result';
  conversation_id?: string;
  state?: string;
  step_type?: string;
  tool_name?: string;
  text_delta?: string;
  tool_info?: { name?: string; parameters?: Record<string, unknown>; output?: unknown };
  tools?: string[];
  model?: string;
  status?: string;
  response?: string;
  error?: string | { message?: string };
  usage?: unknown;
}

/**
 * Gemini through the Antigravity CLI (`agy -p --output-format stream-json`), on the user's
 * Google account (agy keeps its own login, separate from the IDE's). Headless agy has no approval prompt:
 * edits inside the project are allowed and shell commands are refused unless pre-approved in
 * its own settings, so there are no sticky notes for this agent.
 */
export class AgyAgent implements Runner {
  private child?: ChildProcess;
  private conversationId?: string;
  private conversationCwd?: string;
  private conversationRole?: string;
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
    this.conversationId = undefined;
  }

  stop() {
    this.stopped = true;
    this.child?.kill();
  }

  run(prompt: string, cwd: string, note?: string): Promise<RunOutcome> {
    const { id } = this;
    const role = this.brief();
    // A new role or model starts a fresh conversation, like a new folder does.
    const setup = `${role.key}|${role.model}`;
    if (this.conversationCwd !== cwd || this.conversationRole !== setup) this.reset();
    this.conversationCwd = cwd;
    this.conversationRole = setup;

    let input = note ? `${prompt}\n\n${note}` : prompt;
    // agy has no system prompt flag, so the role goes in front of the first message.
    if (!this.conversationId) input = `${role.instructions}\n\n${TERMINAL_RULE}\n\n${input}`;

    this.stopped = false;
    this.outcome = { ok: false, text: '' };
    this.office.write(id, 'task', prompt);
    this.office.setStatus(id, 'thinking', 'Lendo a tarefa');

    const args = ['-p', input, '--output-format', 'stream-json'];
    if (role.model) args.push('--model', role.model);
    if (this.conversationId) args.push('--conversation', this.conversationId);

    return new Promise((resolve) => {
      let stderr = '';
      let reply = '';
      let settled = false;
      // A failed spawn may or may not be followed by 'close', so both paths finish here once.
      const settle = () => {
        if (settled) return;
        settled = true;
        this.child = undefined;
        resolve(this.outcome);
      };
      // No stdin: when signed out, agy would otherwise wait for an auth code nobody can type here.
      const child = spawn(agyPath(), args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;

      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          this.fail('O Antigravity CLI (agy) não está instalado neste computador.');
          this.office.needTerminal(id, INSTALL_COMMAND, 'O Gemini roda pelo Antigravity CLI (agy), que ainda não está instalado. É o instalador oficial do Google.');
        } else {
          this.fail(error.message);
        }
        settle();
      });
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));

      createInterface({ input: child.stdout! }).on('line', (line) => {
        let event: AgyEvent;
        try {
          // Fields come nested under the event's own name ({"event":"result","result":{…}}),
          // so lift them up next to `event`.
          const raw = JSON.parse(line) as Record<string, unknown> & { event: AgyEvent['event'] };
          const nested = raw[raw.event];
          event = { ...raw, ...(nested && typeof nested === 'object' ? nested : {}) } as AgyEvent;
        } catch {
          return; // not every line is an event (e.g. update notices)
        }
        if (event.conversation_id) this.conversationId = event.conversation_id;
        if (event.event === 'init') {
          this.office.update(id, {
            toolkit: { skills: [], plugins: [], mcp: [], note: `Ferramentas do Antigravity CLI: ${(event.tools ?? []).length}.` },
          });
        } else if (event.event === 'step_update') {
          if (event.step_type === 'tool' && event.state === 'ACTIVE') {
            const tool = event.tool_name ?? event.tool_info?.name ?? 'ferramenta';
            const line = describeAgyTool(tool, event.tool_info?.parameters ?? {});
            this.office.write(id, 'tool', line);
            this.office.setStatus(id, statusForAgyTool(tool), line);
          } else if (event.step_type === 'agent_response' && event.text_delta) {
            reply += event.text_delta;
            this.office.setStatus(id, 'thinking', clip(reply.trim().split('\n').at(-1) ?? '', 70));
          }
        } else if (event.event === 'result') {
          const usage = tokens(event.usage);
          this.office.addUsage(id, usage.input, usage.output);
          const text = (event.response ?? reply).trim();
          if (event.status === 'SUCCESS') {
            if (text) this.office.say(id, text);
            this.office.setStatus(id, 'done', 'Terminou a tarefa');
            this.office.write(id, 'result', 'Pronto.');
            this.outcome = { ok: true, text };
            if (this.office.isLimited('antigravity')) this.office.setQuota('antigravity', { status: 'ok' });
          } else {
            const error = typeof event.error === 'string' ? event.error : event.error?.message;
            this.fail(error || `O Antigravity terminou com status ${event.status ?? 'desconhecido'}.`);
          }
        }
      });

      child.on('close', (code) => {
        if (settled) return;
        if (this.stopped) {
          this.office.setStatus(id, 'idle', 'Parado por você');
          this.office.write(id, 'result', 'Tarefa interrompida.');
          this.outcome = { ok: false, text: 'Interrompida pelo usuário.' };
        } else if (!this.outcome.ok && !this.outcome.text) {
          const detail = stderr.trim().split('\n').slice(-3).join('\n');
          this.fail(detail || `O agy saiu com código ${code}.`);
        }
        settle();
      });
    });
  }

  private fail(text: string) {
    const { id } = this;
    this.office.write(id, 'error', text);
    if (!this.outcome.text) this.outcome = { ok: false, text };
    if (/authenticat|sign.?in|log.?in/i.test(text)) {
      this.office.setStatus(id, 'error', 'Falta entrar com a conta do Google');
      this.office.needTerminal(
        id,
        'agy',
        'O Antigravity CLI tem login próprio. Rode este comando num terminal novo, entre com sua conta do Google no navegador e, se aparecer um código, cole no terminal.',
      );
      return;
    }
    if (LIMIT.test(text)) {
      this.outcome.limited = true;
      this.office.setStatus(id, 'error', 'Limite de uso do Google atingido');
      this.office.setQuota('antigravity', { status: 'limited' });
      return;
    }
    this.office.setStatus(id, 'error', 'Deu erro, veja o registro');
  }
}
