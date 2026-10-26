import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { ClientMessage } from '../shared/types.ts';

/** The PowerShell dock under the office: a real terminal running on this computer. */
export class ShellDock {
  private readonly term = new Terminal({
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: {
      background: '#0b0f0b',
      foreground: '#d9f2db',
      cursor: '#5fd86f',
      selectionBackground: '#2f5a35',
    },
  });
  private readonly fit = new FitAddon();
  private opened = false;

  constructor(
    private readonly dock: HTMLElement,
    private readonly screen: HTMLElement,
    private readonly cwdLabel: HTMLElement,
    private readonly send: (msg: ClientMessage) => void,
    private readonly onToggle: () => void,
  ) {
    this.term.loadAddon(this.fit);
    this.term.onData((data) => this.send({ type: 'shell-input', data }));
    this.term.onResize(({ cols, rows }) => this.send({ type: 'shell-resize', cols, rows }));
    // Ctrl+C copies when something is selected; otherwise it goes to PowerShell as usual.
    this.term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown' || !event.ctrlKey) return true;
      if (event.key === 'c' && this.term.hasSelection()) {
        void navigator.clipboard.writeText(this.term.getSelection());
        this.term.clearSelection();
        return false;
      }
      if (event.key === 'v') {
        void navigator.clipboard.readText().then((text) => this.term.paste(text));
        return false;
      }
      return true;
    });
    new ResizeObserver(() => this.refit()).observe(screen);
  }

  get visible() {
    return !this.dock.hidden;
  }

  show() {
    if (this.dock.hidden) {
      this.dock.hidden = false;
      this.onToggle();
    }
    if (!this.opened) {
      this.term.open(this.screen);
      this.opened = true;
    }
    this.refit();
    // An empty keystroke-free nudge: starts PowerShell if it is not running yet.
    this.send({ type: 'shell-input', data: '' });
    this.term.focus();
  }

  hide() {
    this.dock.hidden = true;
    this.onToggle();
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  /** Types a command into PowerShell and presses Enter. */
  run(command: string) {
    this.show();
    this.send({ type: 'shell-run', command });
  }

  restart() {
    this.term.reset();
    this.send({ type: 'shell-restart' });
    this.term.focus();
  }

  output(data: string) {
    this.term.write(data);
  }

  state(running: boolean, cwd: string) {
    this.cwdLabel.textContent = running ? cwd : 'fechado: digite algo para abrir de novo';
  }

  /** After reconnecting, the server resends the scrollback, so start from a clean screen. */
  clear() {
    this.term.reset();
  }

  private refit() {
    if (this.opened && this.visible) this.fit.fit();
  }
}
