import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { ClientMessage } from '../shared/types.ts';

const HEIGHT_KEY = 'virtualof.terminal-altura';

/** The terminal panel along the bottom of the window: a real PowerShell on this computer. */
export class ShellDock {
  private readonly term = new Terminal({
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: {
      background: '#17131f',
      foreground: '#d9f2db',
      cursor: '#5fd86f',
      selectionBackground: '#3a3155',
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

  /** Ends PowerShell; typing in the panel opens a fresh one. */
  kill() {
    this.send({ type: 'shell-kill' });
  }

  /** Lets the panel fill most of the window, like the editor's maximized terminal. */
  toggleMaximized(button: HTMLElement) {
    const on = !this.dock.classList.contains('is-max');
    this.dock.classList.toggle('is-max', on);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'Restaurar tamanho' : 'Maximizar';
    this.onToggle();
  }

  /** Dragging the top edge (or arrow keys on it) changes the panel height, remembered per computer. */
  makeResizable(grip: HTMLElement) {
    const set = (height: number) => {
      const max = window.innerHeight - 160;
      const value = Math.round(Math.min(Math.max(height, 120), max));
      this.dock.style.setProperty('--shell-h', `${value}px`);
      try {
        localStorage.setItem(HEIGHT_KEY, String(value));
      } catch {
        // Private windows may refuse storage; the height just resets next time.
      }
    };
    try {
      const saved = Number(localStorage.getItem(HEIGHT_KEY));
      if (saved) this.dock.style.setProperty('--shell-h', `${saved}px`);
    } catch {
      // Same as above.
    }
    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent) => set(window.innerHeight - e.clientY);
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowUp' ? 24 : event.key === 'ArrowDown' ? -24 : 0;
      if (step) set(this.dock.getBoundingClientRect().height + step);
    });
  }

  output(data: string) {
    this.term.write(data);
  }

  state(running: boolean, cwd: string) {
    this.cwdLabel.textContent = running ? cwd : 'encerrado: digite algo para abrir de novo';
  }

  /** After reconnecting, the server resends the scrollback, so start from a clean screen. */
  clear() {
    this.term.reset();
  }

  private refit() {
    if (this.opened && this.visible) this.fit.fit();
  }
}
