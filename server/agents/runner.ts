import type { RoleKey } from '../../shared/types.ts';

/** How a task ended, with the agent's final message (or the error). */
export interface RunOutcome {
  ok: boolean;
  text: string;
  /** True when the account hit its subscription limit, so another agent should take over. */
  limited?: boolean;
}

/** What every controllable agent offers the office, whatever SDK drives it. */
export interface Runner {
  readonly busy: boolean;
  run(prompt: string, cwd: string): Promise<RunOutcome>;
  stop(): void;
  /** Forgets the conversation, e.g. after the agent changes role. */
  reset(): void;
}

/** The agent's current role and its instructions, read at the start of every task. */
export type RoleBrief = () => { key: RoleKey; instructions: string };
