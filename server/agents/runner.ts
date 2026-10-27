import type { ImageMime, RoleKey } from '../../shared/types.ts';

/** An image the user sent, already checked and saved to a temp file outside the project. */
export interface RunImage {
  name: string;
  mime: ImageMime;
  /** Plain base64, for engines that take the bytes. */
  data: string;
  /** The temp file, for engines that take a path. */
  path: string;
}

/** Tells the agent where the images are, so it can also copy one into the project if asked. */
export function imagesNote(images: RunImage[]) {
  const list = images.map((i) => `- ${i.name}: ${i.path}`).join('\n');
  return `[O usuário anexou ${images.length === 1 ? 'uma imagem' : `${images.length} imagens`} a esta mensagem. Arquivos temporários:\n${list}]`;
}

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
  /** `note` reaches the agent after the prompt but stays out of the office log; so do `images`. */
  run(prompt: string, cwd: string, note?: string, images?: RunImage[]): Promise<RunOutcome>;
  stop(): void;
  /** Forgets the conversation, e.g. after the agent changes role. */
  reset(): void;
}

/** The agent's current role, its instructions and chosen model, read at the start of every task. */
export type RoleBrief = () => { key: RoleKey; instructions: string; model: string };
