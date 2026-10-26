import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Account, AccountStatus } from '../shared/types.ts';
import { AGY_INSTALL, agyPath } from './agents/agy.ts';
import { claudeExecutable } from './agents/binaries.ts';
import { loginCommand as codexLogin } from './agents/codex.ts';
import { OPENCODE_INSTALL, opencodePath } from './agents/opencode.ts';

function claudeSignedIn() {
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  return (
    !!process.env.ANTHROPIC_API_KEY ||
    existsSync(join(dir, '.credentials.json')) ||
    // On macOS the login lives in the keychain; ~/.claude.json at least shows Claude Code was set up.
    (process.platform === 'darwin' && existsSync(join(homedir(), '.claude.json')))
  );
}

function codexSignedIn() {
  const dir = process.env.CODEX_HOME || join(homedir(), '.codex');
  return !!process.env.OPENAI_API_KEY || !!process.env.CODEX_API_KEY || existsSync(join(dir, 'auth.json'));
}

/**
 * Which accounts this machine is signed in to, from the files each CLI keeps its login in,
 * and the command that sets each one up. A login file only says a login exists, not that it
 * is still valid (an expired one still counts). The free ones keep their login where we can't
 * read it, so they only say whether the CLI is installed.
 */
export function detectAccounts(): Record<Account, AccountStatus> {
  const claude = claudeExecutable();
  const agy = agyPath();
  const agyInstalled = agy !== 'agy';
  const opencode = opencodePath();
  return {
    claude: {
      signedIn: claudeSignedIn(),
      installed: true, // ships with the office
      login: claude ? `& "${claude}"` : 'npx @anthropic-ai/claude-code',
      hint: 'Quando o Claude Code abrir, digite /login, entre com sua conta no navegador e depois digite /exit.',
    },
    codex: {
      signedIn: codexSignedIn(),
      installed: true, // ships with the office
      login: codexLogin(),
      hint: 'Entre com sua conta do ChatGPT no navegador que abrir.',
    },
    antigravity: {
      installed: agyInstalled,
      login: agyInstalled ? `& "${agy}"` : AGY_INSTALL,
      hint: agyInstalled
        ? 'Entre com sua conta do Google no navegador e, se aparecer um código, cole no terminal.'
        : 'Instala o Antigravity CLI, o instalador oficial do Google. Depois clique em Entrar.',
    },
    opencode: {
      installed: !!opencode,
      login: opencode ? 'opencode auth login' : OPENCODE_INSTALL,
      hint: opencode
        ? 'Os modelos grátis funcionam sem login. Entre só se quiser usar outro provedor.'
        : 'Instala o OpenCode pelo npm (precisa do Node.js). Os modelos grátis funcionam sem login.',
    },
  };
}
