import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Inside the desktop app, packages live in app.asar, which can't run executables; the
 * installer keeps the agent binaries in app.asar.unpacked instead.
 */
function unpacked(path: string) {
  return path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function packageFile(pkg: string, ...parts: string[]) {
  try {
    return unpacked(join(dirname(require.resolve(`${pkg}/package.json`)), ...parts));
  } catch {
    return undefined;
  }
}

const packaged = import.meta.url.includes('app.asar');

/** Claude Code binary, only when the SDK can't find it on its own (inside the app). */
export function claudeBinary(): string | undefined {
  if (!packaged || process.platform !== 'win32') return undefined;
  const file = packageFile('@anthropic-ai/claude-agent-sdk-win32-x64', 'claude.exe');
  return file && existsSync(file) ? file : undefined;
}

/** The Codex executable on Windows, for the app and for the login command. */
export function codexBinary(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const file = packageFile('@openai/codex-win32-x64', 'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  return file && existsSync(file) ? file : undefined;
}

/** Codex executable to hand the SDK, only inside the app (elsewhere the SDK finds it itself). */
export function packagedCodex(): string | undefined {
  return packaged ? codexBinary() : undefined;
}
