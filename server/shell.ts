import { spawn, type IPty } from '@lydell/node-pty';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { ServerMessage } from '../shared/types.ts';

/** How much past output a page that connects later gets to see. */
const SCROLLBACK = 200_000;

/**
 * The office's own PowerShell: one real terminal shared by every open page, so logins and
 * installs that need a keyboard happen inside the app instead of a separate window.
 */
export class Shell {
  private pty: IPty | undefined;
  private buffer = '';
  private cols = 100;
  private rows = 24;
  /** The folder PowerShell started in. */
  cwd = '';

  constructor(
    private readonly publish: (msg: ServerMessage) => void,
    private readonly folder: () => string,
  ) {}

  get running() {
    return this.pty !== undefined;
  }

  /** What a page that just connected should print first. */
  history() {
    return this.buffer;
  }

  /** Starts PowerShell in the project folder (or the home folder) if it is not running yet. */
  open() {
    if (this.pty) return;
    const cwd = existsSync(this.folder()) ? this.folder() : homedir();
    const program = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
    const args = process.platform === 'win32' ? ['-NoLogo'] : [];
    // Electron sets this for its own helpers; a shell started from the app must not inherit it.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const pty = spawn(program, args, { name: 'xterm-256color', cols: this.cols, rows: this.rows, cwd, env });
    this.pty = pty;
    this.cwd = cwd;
    this.buffer = '';
    this.publish({ type: 'shell-state', running: true, cwd });
    pty.onData((data) => {
      this.buffer = (this.buffer + data).slice(-SCROLLBACK);
      this.publish({ type: 'shell-output', data });
    });
    pty.onExit(() => {
      if (this.pty !== pty) return;
      this.pty = undefined;
      this.publish({ type: 'shell-state', running: false, cwd });
    });
  }

  /** Keystrokes from the page, exactly as typed. */
  input(data: string) {
    this.open();
    this.pty!.write(data);
  }

  /** Types a whole command and presses Enter, e.g. from a "needs the terminal" card. */
  run(command: string) {
    this.open();
    this.pty!.write(command.replace(/\r?\n/g, ' ') + '\r');
  }

  resize(cols: number, rows: number) {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || rows < 3 || cols > 500 || rows > 200) return;
    this.cols = cols;
    this.rows = rows;
    this.pty?.resize(cols, rows);
  }

  /** Closes the current PowerShell; the next keystroke opens a fresh one. */
  restart() {
    this.close();
    this.open();
  }

  close() {
    const pty = this.pty;
    if (!pty) return;
    this.pty = undefined;
    pty.kill();
    this.publish({ type: 'shell-state', running: false, cwd: this.cwd });
  }
}
