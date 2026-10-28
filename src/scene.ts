import type { AgentStatus, AgentView, PlanStepStatus } from '../shared/types.ts';
import { translate } from './i18n.ts';

/** Logical canvas size; everything is drawn on this grid and scaled up by a whole number. */
export const W = 384;
export const H = 224;

const WALL_BOTTOM = 72;

const C = {
  outline: '#1b1626',
  floorLine: '#3e2a1d',
  plank: ['#7a5236', '#744e33', '#6f4a31', '#7e5539'],
  plankLight: 'rgba(255, 220, 170, 0.07)',
  deskTop: '#c09060',
  deskTopLight: '#d4a874',
  deskFront: '#8f6440',
  deskFrontDark: '#7a5435',
  deskShadow: 'rgba(20, 10, 5, 0.35)',
  chair: '#3a3150',
  chairLight: '#4b4066',
  paper: '#f4ecd8',
  note: '#f2d974',
  ok: '#5fbf6a',
  bad: '#e0574b',
  lamp: '244, 194, 107',
};

/** How the room looks; chosen in the Ambiente window and kept in the browser. */
export interface Theme {
  periodo: 'noite' | 'entardecer' | 'dia';
  parede: 'ameixa' | 'floresta' | 'terracota' | 'grafite' | 'pedra';
  piso: 'madeira' | 'carpete' | 'xadrez';
  gato: boolean;
  tapete: boolean;
  plantas: boolean;
  /** Coffee corner and server rack. */
  extras: boolean;
  /** Weather outside the window. */
  clima: 'limpo' | 'chuva' | 'neve';
  /** A string of twinkling lights along the top of the wall. */
  luzes: boolean;
  /** A tear-off calendar under the clock, showing today. */
  calendario: boolean;
  /** Wall lanterns; by night and at dusk they light the room in warm pools. */
  lanternas: boolean;
}

export const DEFAULT_THEME: Theme = {
  periodo: 'noite',
  parede: 'ameixa',
  piso: 'madeira',
  gato: true,
  tapete: true,
  plantas: true,
  extras: true,
  clima: 'limpo',
  luzes: true,
  calendario: true,
  lanternas: true,
};

/** Where the wall lanterns hang (x, room pixels). */
const LANTERNS = [66, 376];

/** What the corkboard shows: the open project and the current plan's steps, as a small kanban. */
export interface Board {
  project: string;
  steps: PlanStepStatus[];
}

const BULBS = ['#ff6b6b', '#ffd166', '#6be0a0', '#6bb7ff', '#d78bff'];
/** Drops that slide down the glass, each at its own pace. */
const GLASS_DROPS = Array.from({ length: 14 }, (_, i) => ({ x: 133 + ((i * 47) % 118), y: (i * 13) % 34, speed: 60 + ((i * 37) % 70) }));
const LIGHTNING_EVERY = 11000;

/** The sky on a rainy day, evening or night: grey and low. */
const RAIN_SKY: Record<Theme['periodo'], { top: string; bottom: string; cloud: string }> = {
  dia: { top: '#6f7884', bottom: '#a3acb6', cloud: 'rgba(90, 98, 110, 0.85)' },
  entardecer: { top: '#3d3648', bottom: '#7a6370', cloud: 'rgba(60, 52, 70, 0.85)' },
  noite: { top: '#0e111c', bottom: '#262b3d', cloud: 'rgba(30, 34, 50, 0.9)' },
};

const WALLS: Record<Theme['parede'], { wall: string; stripe: string; wainscot: string; panel: string; trim: string }> = {
  ameixa: { wall: '#2e2645', stripe: '#2a2240', wainscot: '#241d38', panel: '#2b2343', trim: '#3d3358' },
  floresta: { wall: '#22382f', stripe: '#1f332b', wainscot: '#1a2b24', panel: '#20342b', trim: '#2f4a3e' },
  terracota: { wall: '#4a2c26', stripe: '#442822', wainscot: '#36201b', panel: '#402620', trim: '#5c3a31' },
  grafite: { wall: '#2b2d33', stripe: '#27292f', wainscot: '#202227', panel: '#26282e', trim: '#3a3d45' },
  pedra: { wall: '#2c3340', stripe: '#252b36', wainscot: '#1f242e', panel: '#262c38', trim: '#4a3a2a' },
};

const PERIODS: Record<
  Theme['periodo'],
  { top: string; bottom: string; building: string; cloud: string; light: string; lightAlpha: number; vignette: number; wash?: string }
> = {
  noite: { top: '#0c1130', bottom: '#2d3166', building: '#151833', cloud: 'rgba(40, 46, 96, 0.85)', light: '150, 170, 255', lightAlpha: 0.07, vignette: 0.4 },
  entardecer: { top: '#2b2350', bottom: '#f0905a', building: '#2a2140', cloud: 'rgba(150, 80, 110, 0.8)', light: '255, 170, 110', lightAlpha: 0.1, vignette: 0.3, wash: 'rgba(255, 150, 90, 0.05)' },
  dia: { top: '#6cb4e4', bottom: '#cfe8f5', building: '#56688c', cloud: 'rgba(255, 255, 255, 0.9)', light: '255, 245, 210', lightAlpha: 0.13, vignette: 0.12, wash: 'rgba(255, 250, 235, 0.07)' },
};

const SKINS = ['#f3cba5', '#e0ac84', '#b97d58', '#8a5a3c', '#5e3b28'];
const HAIRS = ['#2b1d16', '#1c1a24', '#7a3f22', '#d6a95a', '#9a9aa6', '#a33b3b'];
const HAIR_STYLES = ['curto', 'longo', 'coque', 'franja'] as const;

/** Desk centres (x) and the y of each desk's top edge: three across, two rows. */
export const DESKS = [
  { x: 72, y: 116 },
  { x: 192, y: 116 },
  { x: 312, y: 116 },
  { x: 72, y: 182 },
  { x: 192, y: 182 },
  { x: 312, y: 182 },
];

const DESK_W = 78;
const ACTIVE: AgentStatus[] = ['thinking', 'reading', 'writing', 'running', 'waiting'];

/** What the tag over an agent's head says it is doing. */
const STATUS_TAGS: Partial<Record<AgentStatus, string>> = {
  thinking: 'PENSANDO',
  reading: 'LENDO',
  writing: 'CODANDO',
  running: 'RODANDO',
  waiting: 'ESPERANDO',
  done: 'PRONTO',
  error: 'ERRO',
};

/** How long a hand-off arrow stays on screen. */
const LINK_MS = 4500;

/**
 * Seated character seen from the front, 16 px wide. Letters are palette slots:
 * o outline, h/H hair and highlight, s/S skin and shade, e eyes, m mouth,
 * w collar, c/C shirt and shade. Rows below the shoulders hide behind the desk.
 */
const BODY = [
  '....oooooooo....',
  '...ohhhhhhhho...',
  '..ohhHHhhhhhho..',
  '..ohhhhhhhhhho..',
  '..ohhsssssshho..',
  '..ohssssssssho..',
  '..ossessssesso..',
  '..ossessssesso..',
  '..oSssssssssSo..',
  '...oSssmmssSo...',
  '....ooSSSSoo....',
  '.....osSSso.....',
  '..oooccwwccooo..',
  '.occcccwwccccco.',
  'occcccccccccccco',
  'oCccccccccccccCo',
  'oCccccccccccccCo',
  'oCCccccccccccCCo',
];

/** Extra hair drawn on top of BODY, as [x, y, slot] offsets from the sprite's corner. */
function hairOverlay(style: (typeof HAIR_STYLES)[number]): [number, number, string][] {
  const px: [number, number, string][] = [];
  if (style === 'longo') {
    for (let y = 4; y <= 12; y++) {
      px.push([2, y, 'h'], [13, y, 'h'], [1, y, 'o'], [14, y, 'o']);
    }
    px.push([2, 13, 'o'], [13, 13, 'o']);
  } else if (style === 'coque') {
    for (let x = 6; x <= 9; x++) px.push([x, -3, 'o'], [x, -2, 'h'], [x, -1, 'h']);
    px.push([5, -2, 'o'], [5, -1, 'o'], [10, -2, 'o'], [10, -1, 'o'], [7, -2, 'H']);
  } else if (style === 'franja') {
    for (let x = 4; x <= 11; x++) px.push([x, 4, 'h']);
    px.push([4, 5, 'h'], [5, 5, 'h'], [10, 5, 'h']);
  }
  return px;
}

function shade(hex: string, factor: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** Small seeded generator so the skyline, books and planks look the same on every frame. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

const rand = seeded(11);
const SKYLINE = Array.from({ length: 15 }, (_, i) => {
  const h = 12 + Math.floor(rand() * 22);
  const lit = Array.from({ length: 12 }, () => rand() > 0.62);
  return { x: 134 + i * 8, h, lit };
});
const STARS = Array.from({ length: 18 }, () => ({ x: 134 + Math.floor(rand() * 116), y: 12 + Math.floor(rand() * 16) }));
const PLANKS = Array.from({ length: 40 }, () => ({
  color: Math.floor(rand() * 4),
  offset: Math.floor(rand() * 70),
}));

function hash(text: string) {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

interface Look {
  palette: Record<string, string>;
  overlay: [number, number, string][];
  headset: boolean;
}

const looks = new Map<string, Look>();

export type StressLevel = 'calmo' | 'apertado' | 'esgotado' | 'sem-dados';

export interface Stress {
  level: StressLevel;
  /** 0..1 for the bar; when the account gives no percentage it only reflects the level. */
  value: number;
}

/** Bar colour for a stress value: green, then yellow, then red. */
export function stressColor(value: number) {
  return value >= 0.9 ? '#e0574b' : value >= 0.6 ? '#f2c14e' : '#6cc46a';
}

/** Skin, hair and hairstyle come from the agent id, so a character looks the same everywhere. */
function lookFor(agent: AgentView): Look {
  // A desk can switch AI (and with it the headset), so the kind is part of the key.
  const key = `${agent.id}|${agent.kind}|${agent.color}`;
  let look = looks.get(key);
  if (look) return look;
  const h = hash(agent.id);
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRS[(h >> 4) % HAIRS.length];
  look = {
    palette: {
      o: C.outline,
      h: hair,
      H: shade(hair, 1.45),
      s: skin,
      S: shade(skin, 0.82),
      e: C.outline,
      m: shade(skin, 0.62),
      w: C.paper,
      c: agent.color,
      C: shade(agent.color, 0.72),
    },
    overlay: hairOverlay(HAIR_STYLES[(h >> 8) % HAIR_STYLES.length]),
    headset: agent.kind === 'antigravity',
  };
  looks.set(key, look);
  return look;
}

/** Draws the seated character with its top-left corner at (x, y), 1 unit per pixel. */
export function paintCharacter(ctx: CanvasRenderingContext2D, agent: AgentView, x: number, y: number) {
  const look = lookFor(agent);
  const dot = (px: number, py: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px, py, 1, 1);
  };
  BODY.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const color = look.palette[row[i]];
      if (color) dot(x + i, y + j, color);
    }
  });
  for (const [dx, dy, slot] of look.overlay) dot(x + dx, y + dy, look.palette[slot]);
  if (look.headset) {
    ctx.fillStyle = '#2e3a66';
    ctx.fillRect(x + 2, y - 1, 12, 1);
    ctx.fillRect(x + 1, y + 5, 2, 4);
    ctx.fillRect(x + 13, y + 5, 2, 4);
  }
}

export class Scene {
  /** The room is painted at 1:1 on this small canvas, then blown up onto the visible one. */
  private world = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private screen: CanvasRenderingContext2D;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  agents: AgentView[] = [];
  selectedId?: string;
  /** How close each agent's account is to its limit; drives the bar, sweat and steam. */
  stress = new Map<string, Stress>();
  theme: Theme = { ...DEFAULT_THEME };
  /** The user's own picture for the window view, already shrunk to the window's size. */
  view?: CanvasImageSource;
  doneCount = 0;
  /** The corkboard's kanban; without a plan it keeps one note per finished task. */
  board: Board = { project: '', steps: [] };
  /** When each agent last finished, so the check mark shows for a few seconds. */
  private finishedAt = new Map<string, number>();

  constructor(private canvas: HTMLCanvasElement) {
    this.world.width = W;
    this.world.height = H;
    const ctx = this.world.getContext('2d');
    const screen = canvas.getContext('2d');
    if (!ctx || !screen) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
    this.screen = screen;
  }

  markFinished(id: string) {
    this.finishedAt.set(id, performance.now());
  }

  /** Arrows drawn between desks while work changes hands, like a live whiteboard diagram. */
  private links: { from: string; to: string; label: string; at: number }[] = [];
  /** When each agent joined the team, for the "new hire" banner. */
  private hires = new Map<string, number>();

  /** Shows work going from one desk to another for a few seconds ("PASSA TAREFA", "ENTREGA"…). */
  link(from: string, to: string, label: string) {
    if (from === to) return;
    this.links.push({ from, to, label, at: performance.now() });
    if (this.links.length > 8) this.links.shift();
  }

  hired(id: string) {
    this.hires.set(id, performance.now());
  }

  resize() {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(box.width * dpr);
    this.canvas.height = Math.floor(box.height * dpr);
    this.scale = Math.min(this.canvas.width / W, this.canvas.height / H);
    this.offsetX = Math.floor((this.canvas.width - W * this.scale) / 2);
    this.offsetY = Math.floor((this.canvas.height - H * this.scale) / 2);
  }

  /** Which agent's desk is under a click, in CSS pixels relative to the canvas. */
  hit(clientX: number, clientY: number): string | undefined {
    const dpr = window.devicePixelRatio || 1;
    const x = (clientX * dpr - this.offsetX) / this.scale;
    const y = (clientY * dpr - this.offsetY) / this.scale;
    const index = DESKS.findIndex((d) => Math.abs(x - d.x) < DESK_W / 2 + 4 && y > d.y - 34 && y < d.y + 26);
    return index >= 0 ? this.agents[index]?.id : undefined;
  }

  draw(time: number) {
    this.wall(time);
    this.floor();
    this.moonlight(time);
    if (this.theme.tapete) this.runner();
    this.furniture(time);
    DESKS.forEach((desk, i) => this.desk(desk.x, desk.y, this.agents[i], time, i));
    this.vignette(time);

    const { screen } = this;
    screen.fillStyle = '#120f1c';
    screen.fillRect(0, 0, this.canvas.width, this.canvas.height);
    screen.imageSmoothingEnabled = false;
    screen.drawImage(this.world, this.offsetX, this.offsetY, W * this.scale, H * this.scale);
    // Text goes on top at screen resolution, so it stays sharp at any zoom.
    this.wallText();
    DESKS.forEach((desk, i) => {
      const agent = this.agents[i];
      if (agent) this.nameplate(desk.x, desk.y + 12, agent);
    });
    DESKS.forEach((desk, i) => {
      const agent = this.agents[i];
      if (agent) this.roleTag(desk.x, desk.y, agent, time);
    });
    this.drawLinks(time);
  }

  /** Plain pixel-font text at a room point, at screen resolution, squeezed to fit `maxW` room pixels. */
  private text(x: number, y: number, text: string, color: string, maxW: number, div = 4) {
    const ctx = this.screen;
    const size = 8 * Math.max(1, Math.round(this.scale / div));
    ctx.font = `400 ${size}px "Silkscreen", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(this.offsetX + x * this.scale), Math.round(this.offsetY + y * this.scale) + 1, maxW * this.scale);
  }

  /** The words on the wall: the project on the corkboard, its column titles and today on the calendar. */
  private wallText() {
    const name = this.board.project.split(/[\\/]/).filter(Boolean).at(-1) || 'VirtualOF';
    this.text(326, 10.5, name.toUpperCase(), '#3b2a1c', 40);
    ['A FAZER', 'FAZENDO', 'FEITO'].forEach((title, col) => this.text(300 + col * 26, 19.5, translate(title), '#2a1d12', 24, 5));
    if (this.theme.calendario) this.text(89, 43.5, String(new Date().getDate()), '#2e2645', 14, 3);
  }

  /** Where an agent's head is, in room pixels; undefined when it has no desk. */
  private headOf(id: string) {
    const index = this.agents.findIndex((a) => a.id === id);
    const desk = DESKS[index];
    return desk ? { x: desk.x, y: desk.y - 30 } : undefined;
  }

  /** A pixel-font label centered on a room point, painted at screen resolution so it stays sharp. */
  private label(x: number, y: number, text: string, fill: string, ink: string) {
    const ctx = this.screen;
    const size = 8 * Math.max(1, Math.round(this.scale / 3));
    ctx.font = `400 ${size}px "Silkscreen", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.round(ctx.measureText(text).width + size);
    const h = Math.round(size * 1.5);
    const sx = Math.round(this.offsetX + x * this.scale);
    const sy = Math.round(this.offsetY + y * this.scale);
    const edge = Math.max(1, Math.round(this.scale / 2));
    ctx.fillStyle = C.outline;
    ctx.fillRect(sx - Math.round(w / 2) - edge, sy - Math.round(h / 2) - edge, w + edge * 2, h + edge * 2);
    ctx.fillStyle = fill;
    ctx.fillRect(sx - Math.round(w / 2), sy - Math.round(h / 2), w, h);
    ctx.fillStyle = ink;
    ctx.fillText(text, sx, sy + 1);
  }

  /**
   * Role and what the agent is doing, over its head ("FULLSTACK · CODANDO"). A new hire's tag
   * flashes "NOVO NA EQUIPE!" for its first seconds instead.
   */
  private roleTag(cx: number, top: number, agent: AgentView, time: number) {
    const hired = this.hires.get(agent.id);
    if (hired !== undefined && time - hired < 6000 && Math.floor((time - hired) / 700) % 2 === 0) {
      this.label(cx, top - 26, translate('NOVO NA EQUIPE!'), C.note, C.outline);
      return;
    }
    const doing = STATUS_TAGS[agent.status];
    const role = (agent.role || agent.kind || '').toUpperCase();
    const text = [translate(role), doing ? translate(doing) : ''].filter(Boolean).join(' · ');
    const active = ACTIVE.includes(agent.status);
    if (text) this.label(cx, top - 26, text, active ? agent.color : '#2a2340', active ? C.outline : '#d8cfee');
  }

  /** Marching-dash arrows from desk to desk with their label, fading out after a few seconds. */
  private drawLinks(time: number) {
    const ctx = this.screen;
    const s = this.scale;
    this.links = this.links.filter((l) => time - l.at < LINK_MS);
    for (const link of this.links) {
      const from = this.headOf(link.from);
      const to = this.headOf(link.to);
      if (!from || !to) continue;
      const age = time - link.at;
      ctx.save();
      ctx.globalAlpha = age > LINK_MS - 800 ? (LINK_MS - age) / 800 : 1;
      const ax = this.offsetX + from.x * s;
      const ay = this.offsetY + from.y * s;
      const bx = this.offsetX + to.x * s;
      const by = this.offsetY + to.y * s;
      // A gentle arc, so arrows between desks of the same row don't run through the heads.
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 - 18 * s;
      ctx.lineWidth = Math.max(2, Math.round(s));
      ctx.strokeStyle = `rgb(${C.lamp})`;
      ctx.setLineDash([4 * s, 3 * s]);
      ctx.lineDashOffset = -time / 25;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
      ctx.stroke();
      // Arrowhead along the curve's last direction
      ctx.setLineDash([]);
      const angle = Math.atan2(by - my, bx - mx);
      const head = 5 * s;
      ctx.fillStyle = `rgb(${C.lamp})`;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - head * Math.cos(angle - 0.5), by - head * Math.sin(angle - 0.5));
      ctx.lineTo(bx - head * Math.cos(angle + 0.5), by - head * Math.sin(angle + 0.5));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = age > LINK_MS - 800 ? (LINK_MS - age) / 800 : 1;
      this.label((from.x + to.x) / 2, (from.y + to.y) / 2 - 9, translate(link.label), C.paper, C.outline);
      ctx.restore();
    }
  }

  private rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  /** Filled box with a 1 px outline, the basic building block of the furniture. */
  private box(x: number, y: number, w: number, h: number, fill: string, outline = C.outline) {
    this.rect(x, y, w, h, outline);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }

  /* ---------- Room ---------- */

  private wall(time: number) {
    const walls = WALLS[this.theme.parede];
    this.rect(0, 0, W, WALL_BOTTOM, walls.wall);
    if (this.theme.parede === 'pedra') this.stones();
    else for (let x = 4; x < W; x += 12) this.rect(x, 0, 2, 50, walls.stripe);
    // A dark ceiling beam along the top; the string lights hang from it.
    this.rect(0, 0, W, 2, '#1d1626');
    this.rect(0, 2, W, 1, '#3b2c22');
    // Wainscot with recessed panels, then the trim
    this.rect(0, 50, W, WALL_BOTTOM - 50, walls.wainscot);
    for (let x = 6; x < W - 20; x += 30) this.rect(x, 54, 24, 13, walls.panel);
    this.rect(0, 49, W, 2, walls.trim);
    this.rect(0, WALL_BOTTOM - 2, W, 2, '#1a1428');

    // Window with curtains: the city at the chosen time of day, or the user's own picture
    this.box(128, 6, 128, 42, '#4d4066');
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(132, 10, 120, 34);
    this.ctx.clip();
    if (this.view) this.ctx.drawImage(this.view, 132, 10, 120, 34);
    else this.city(time);
    this.weather(time);
    this.ctx.restore();
    if (this.theme.clima === 'neve') this.rect(122, 45, 140, 1, '#e9eef7'); // snow piling on the sill
    this.rect(191, 10, 2, 34, '#4d4066');
    this.rect(132, 26, 120, 2, '#4d4066');
    this.box(122, 46, 140, 4, '#5e4f7a');
    for (const side of [118, 252]) {
      this.rect(side, 4, 14, 44, '#6b2f3f');
      for (let y = 4; y < 48; y += 1) this.rect(side + 3 + (y % 4 === 0 ? 1 : 0), y, 1, 1, '#5a2634');
      this.rect(side + 9, 4, 1, 44, '#5a2634');
    }
    this.rect(112, 3, 160, 2, '#3a2f50');
    if (this.theme.gato) this.cat(time);

    this.bookshelf(time);
    this.clock();

    this.corkboard(time);
    if (this.theme.lanternas) for (const x of LANTERNS) this.lantern(x, 16, time);
    if (this.theme.calendario) this.calendar();
    if (this.theme.luzes) this.stringLights(time);
  }

  /**
   * The corkboard as the project's kanban: A FAZER, FAZENDO and FEITO, one sticky note per step
   * of the current plan, colored by how it went. Without a plan, one note per finished task.
   */
  private corkboard(time: number) {
    this.box(284, 10, 84, 40, '#6e5133');
    this.rect(287, 13, 78, 34, '#a8814f');
    for (let x = 289; x < 365; x += 6) this.rect(x, 14 + (x % 4), 1, 1, '#97723f'); // cork grain
    for (const col of [1, 2]) this.rect(287 + col * 26, 15, 1, 31, '#8f6c40');
    const heads = ['#d9cfb8', '#f2a541', '#6fcf7a'];
    heads.forEach((color, col) => this.rect(289 + col * 26, 15, 22, 2, color));

    const steps = this.board.steps.length ? this.board.steps : Array<PlanStepStatus>(Math.min(this.doneCount, 9)).fill('done');
    const column = (s: PlanStepStatus) => (s === 'pending' ? 0 : s === 'running' ? 1 : 2);
    const used = [0, 0, 0];
    for (const status of steps) {
      const col = column(status);
      const n = used[col]++;
      if (n >= 9) continue; // three rows of three per column
      const x = 289 + col * 26 + (n % 3) * 8;
      const y = 22 + Math.floor(n / 3) * 8;
      const paper = { pending: C.note, running: '#f7b955', done: '#bfe8b0', error: '#f0a097', skipped: '#bdb6a6' }[status];
      this.rect(x + 1, y + 1, 7, 6, 'rgba(0,0,0,0.25)');
      this.rect(x, y, 7, 6, paper);
      this.rect(x + 1, y + 3, 4, 1, 'rgba(60,45,30,0.35)');
      const blink = status === 'running' && Math.floor(time / 500) % 2;
      this.rect(x + 3, y, 1, 1, blink ? '#fff4c2' : C.bad); // the pin
      if (status === 'done') this.rect(x + 5, y + 4, 1, 1, '#2f8a3a');
      if (status === 'error') this.rect(x + 5, y + 4, 1, 1, '#8a1f17');
    }
    // A paper strip pinned over the top edge carries the project's name (lettered in screen pixels).
    this.rect(305, 7, 42, 7, C.paper);
    this.rect(305, 13, 42, 1, '#cfc4a8');
    this.rect(325, 7, 2, 2, C.bad);
  }

  /** A tear-off calendar under the clock with today's day; the number is lettered in screen pixels. */
  private calendar() {
    this.box(81, 35, 16, 13, C.paper);
    this.rect(82, 36, 14, 3, C.bad);
    this.rect(84, 35, 1, 2, '#6b5a48');
    this.rect(93, 35, 1, 2, '#6b5a48');
  }

  /** A sagging string of bulbs along the top of the wall; each twinkles on its own beat. */
  private stringLights(time: number) {
    const hooks = [2, 112, 272, 382];
    let bulb = 0;
    for (let h = 0; h < hooks.length - 1; h++) {
      const a = hooks[h];
      const b = hooks[h + 1];
      for (let x = a; x <= b; x++) {
        const t = (x - a) / (b - a);
        const y = Math.round(2 + 5 * 4 * t * (1 - t));
        this.rect(x, y, 1, 1, '#1b1626');
        if ((x - a) % 9 === 4) {
          const color = BULBS[bulb++ % BULBS.length];
          const on = Math.sin(time / 600 + bulb * 1.7) > -0.6;
          if (on) {
            this.ctx.fillStyle = `${color}33`;
            this.ctx.fillRect(x - 2, y, 5, 5);
          }
          this.rect(x, y + 1, 2, 2, on ? color : shade(color, 0.45));
        }
      }
    }
  }

  /** Stone blocks in staggered courses, each a little lighter or darker, lit from above. */
  private stones() {
    const base = WALLS.pedra.wall;
    for (let row = 0, y = 3; y < 49; row++, y += 7) {
      let x = row % 2 ? -8 : 0;
      for (let k = 0; x < W; k++) {
        const w = 14 + ((row * 7 + k * 5) % 3) * 4;
        const tone = 0.82 + (((row * 13 + k * 7) % 5) * 0.06);
        const h = Math.min(6, 49 - y);
        this.rect(x, y, w - 1, h, shade(base, tone));
        this.rect(x, y, w - 1, 1, shade(base, tone + 0.18)); // lit top edge
        this.rect(x + w - 2, y + 1, 1, h - 1, shade(base, tone - 0.15));
        if ((row + k) % 4 === 0) this.rect(x + 3, y + 3, 2, 1, shade(base, tone - 0.1)); // chips and pits
        x += w;
      }
      this.rect(0, y + 6, W, 1, '#171b23'); // mortar
    }
  }

  /** An iron wall lantern; the flame flickers and lights its own glass. */
  private lantern(x: number, y: number, time: number) {
    const flicker = 0.75 + 0.25 * Math.sin(time / 90 + x) * Math.sin(time / 37 + x * 2);
    this.rect(x + 2, y - 4, 1, 4, '#1b1626'); // bracket
    this.rect(x - 1, y - 4, 4, 1, '#1b1626');
    this.box(x - 3, y, 8, 2, '#2a2230');
    this.rect(x - 2, y + 2, 6, 7, '#1b1626');
    this.rect(x - 1, y + 3, 4, 5, `rgba(255, ${170 + Math.round(40 * flicker)}, 90, ${0.55 + 0.4 * flicker})`);
    this.rect(x, y + 4 + (flicker > 0.8 ? 0 : 1), 2, 3, '#fff1b8');
    this.rect(x - 3, y + 9, 8, 2, '#2a2230');
    this.rect(x + 1, y + 11, 1, 1, '#2a2230');
  }

  /** Ivy trailing from the top of the bookshelf and the curtain rod. */
  private ivy(time: number) {
    const sway = Math.sin(time / 1400);
    for (const [x0, len, step] of [
      [14, 22, 3],
      [24, 14, 4],
      [50, 26, 3],
      [114, 18, 3],
      [268, 20, 3],
    ] as const) {
      for (let i = 0; i < len; i++) {
        const x = Math.round(x0 + Math.sin(i / 3 + x0) * 1.5 + (sway * i) / 18);
        const y = 6 + i;
        this.rect(x, y, 1, 1, '#2f5a32');
        if (i % step === 0) {
          this.rect(x - 1, y, 2, 2, i % 2 ? '#4f9a4a' : '#3d7a3c');
          this.rect(x + 1, y + 1, 1, 1, '#6cbf5f');
        }
      }
    }
  }

  /**
   * By night and at dusk the room dims and each lantern throws a warm pool on the wall, a cone
   * down to the wainscot and a glow on the floor, flickering with the flame.
   */
  private lanternLight(time: number) {
    if (!this.theme.lanternas || this.theme.periodo === 'dia') return;
    const { ctx } = this;
    ctx.fillStyle = `rgba(6, 4, 14, ${this.theme.periodo === 'noite' ? 0.22 : 0.12})`;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const x of LANTERNS) {
      const flicker = 0.85 + 0.15 * Math.sin(time / 90 + x) * Math.sin(time / 37 + x * 2);
      const glow = ctx.createRadialGradient(x + 1, 21, 1, x + 1, 21, 44);
      glow.addColorStop(0, `rgba(255, 170, 80, ${0.45 * flicker})`);
      glow.addColorStop(1, 'rgba(255, 170, 80, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 44, 0, 90, 70);
      ctx.fillStyle = `rgba(255, 175, 90, ${0.07 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(x - 2, 27);
      ctx.lineTo(x + 4, 27);
      ctx.lineTo(x + 20, WALL_BOTTOM);
      ctx.lineTo(x - 18, WALL_BOTTOM);
      ctx.closePath();
      ctx.fill();
      const pool = ctx.createRadialGradient(x + 1, WALL_BOTTOM + 8, 1, x + 1, WALL_BOTTOM + 8, 36);
      pool.addColorStop(0, `rgba(255, 150, 60, ${0.22 * flicker})`);
      pool.addColorStop(1, 'rgba(255, 150, 60, 0)');
      ctx.fillStyle = pool;
      ctx.fillRect(x - 36, WALL_BOTTOM - 28, 74, 72);
    }
    ctx.restore();
  }

  /** Lightning now and then in a storm, except by day. */
  private flashing(time: number) {
    return this.theme.clima === 'chuva' && this.theme.periodo !== 'dia' && time % LIGHTNING_EVERY < 130;
  }

  /** Rain or snow over the window view (the city or the user's picture), inside the glass. */
  private weather(time: number) {
    const { clima } = this.theme;
    if (clima === 'chuva') {
      this.ctx.fillStyle = 'rgba(25, 30, 48, 0.4)'; // overcast
      this.ctx.fillRect(132, 10, 120, 34);
      for (let i = 0; i < 48; i++) {
        const x = 130 + ((i * 53 + time / 8) % 126);
        const y = 6 + ((i * 29 + time / 3) % 42);
        this.rect(Math.floor(x), Math.floor(y), 1, 3, 'rgba(175, 195, 255, 0.55)');
      }
      for (const drop of GLASS_DROPS) {
        const y = 10 + ((drop.y + time / drop.speed) % 34);
        this.rect(drop.x, Math.floor(y), 1, 2, 'rgba(215, 228, 255, 0.6)');
      }
      if (this.flashing(time)) {
        this.ctx.fillStyle = 'rgba(235, 240, 255, 0.6)';
        this.ctx.fillRect(132, 10, 120, 34);
      }
    } else if (clima === 'neve') {
      for (let i = 0; i < 36; i++) {
        const x = 132 + ((i * 41 + Math.sin(time / 900 + i) * 3 + 120) % 120);
        const y = 8 + ((i * 23 + time / 45) % 38);
        this.rect(Math.floor(x), Math.floor(y), i % 4 ? 1 : 2, i % 4 ? 1 : 2, 'rgba(250, 252, 255, 0.85)');
      }
    }
  }

  private hand(cx: number, cy: number, turn: number, length: number) {
    const angle = turn * Math.PI * 2 - Math.PI / 2;
    for (let i = 0; i <= length; i++) {
      this.rect(Math.round(cx + Math.cos(angle) * i), Math.round(cy + Math.sin(angle) * i), 1, 1, '#2e2645');
    }
  }

  private floor() {
    if (this.theme.piso === 'carpete') {
      this.rect(0, WALL_BOTTOM, W, H - WALL_BOTTOM, '#3d4a5c');
      // Speckles give the carpet its texture
      PLANKS.forEach((p, i) => {
        for (let k = 0; k < 6; k++) {
          const x = (p.offset * 5 + k * 67 + i * 13) % W;
          const y = WALL_BOTTOM + ((i * 11 + k * 23) % (H - WALL_BOTTOM));
          this.rect(x, y, 1, 1, k % 2 ? '#47566a' : '#35404f');
        }
      });
    } else if (this.theme.piso === 'xadrez') {
      for (let y = WALL_BOTTOM, row = 0; y < H; y += 8, row++) {
        for (let x = 0, col = 0; x < W; x += 16, col++) {
          this.rect(x, y, 16, 8, (row + col) % 2 ? '#5c5468' : '#a89f8f');
          this.rect(x, y, 16, 1, 'rgba(255, 255, 255, 0.06)');
        }
      }
    } else {
      const plankH = 6;
      for (let y = WALL_BOTTOM, row = 0; y < H; y += plankH, row++) {
        const p = PLANKS[row % PLANKS.length];
        this.rect(0, y, W, plankH, C.plank[p.color]);
        this.rect(0, y, W, 1, C.plankLight);
        this.rect(0, y + plankH - 1, W, 1, C.floorLine);
        // Each board a shade apart, grain flecks, and nails at the ends
        for (let x = p.offset - 74, seg = 0; x < W; x += 74, seg++) {
          if ((seg + row) % 3 === 0) this.rect(Math.max(0, x + 1), y, 73, plankH - 1, 'rgba(20, 10, 5, 0.08)');
          if ((seg + row) % 4 === 1) this.rect(Math.max(0, x + 1), y + 1, 73, 1, 'rgba(255, 220, 170, 0.05)');
        }
        for (let x = (p.offset * 3 + row * 11) % 23; x < W; x += 23) this.rect(x, y + 2 + (x % 3), 3, 1, 'rgba(60, 35, 20, 0.28)');
        for (let x = p.offset; x < W; x += 74) {
          this.rect(x + 2, y + 1, 1, 1, '#3a2a20');
          this.rect(x + 2, y + plankH - 3, 1, 1, '#3a2a20');
        }
        // Board ends, staggered per row so it reads as a wooden floor
        for (let x = p.offset; x < W; x += 74) {
          this.rect(x, y, 1, plankH - 1, C.floorLine);
          this.rect(x + 1, y, 1, plankH - 1, 'rgba(255, 220, 170, 0.06)');
        }
      }
    }
    // Shadow where the wall meets the floor
    const fade = this.ctx.createLinearGradient(0, WALL_BOTTOM, 0, WALL_BOTTOM + 10);
    fade.addColorStop(0, 'rgba(15, 8, 20, 0.45)');
    fade.addColorStop(1, 'rgba(15, 8, 20, 0)');
    this.ctx.fillStyle = fade;
    this.ctx.fillRect(0, WALL_BOTTOM, W, 10);
  }

  /** The view out of the window: sky, sun or moon, clouds and the skyline. */
  private city(time: number) {
    const period = this.theme.periodo;
    const look = PERIODS[period];
    // Rain greys the sky over and hides the sun, the moon and the stars behind the clouds.
    const rainy = this.theme.clima === 'chuva';
    const sky = this.ctx.createLinearGradient(0, 9, 0, 45);
    sky.addColorStop(0, rainy ? RAIN_SKY[period].top : look.top);
    sky.addColorStop(1, rainy ? RAIN_SKY[period].bottom : look.bottom);
    this.ctx.fillStyle = sky;
    this.ctx.fillRect(132, 10, 120, 34);

    if (rainy) {
      for (let i = 0; i < 6; i++) {
        const x = 126 + ((i * 29 + time / 500) % 140);
        this.rect(Math.floor(x), 10 + (i % 3) * 3, 24, 4, RAIN_SKY[period].cloud);
      }
    } else if (period === 'noite') {
      for (const s of STARS) if (Math.sin(time / 800 + s.x * 3) > -0.5) this.rect(s.x, s.y, 1, 1, '#e8e4ff');
      this.shootingStar(time);
      this.rect(226, 13, 7, 7, '#f3ecc8');
      this.rect(229, 13, 4, 5, '#22265a');
    } else if (period === 'entardecer') {
      this.rect(202, 28, 14, 10, '#ffb36b'); // the sun setting behind the buildings
      this.rect(204, 26, 10, 2, '#ffc98a');
      this.rect(206, 25, 6, 1, '#ffd9a6');
    } else {
      this.rect(222, 13, 8, 8, '#fff3b0');
      this.rect(221, 15, 10, 4, '#fff3b0');
      this.rect(224, 12, 4, 10, '#fff3b0');
    }

    // Two slow clouds drift across
    for (const [speed, y, offset] of [
      [260, 15, 0],
      [380, 22, 70],
    ] as const) {
      const x = 120 + ((time / speed + offset) % 150);
      this.rect(x, y, 16, 3, look.cloud);
      this.rect(x + 3, y - 2, 9, 2, look.cloud);
      this.rect(x + 5, y - 3, 4, 1, look.cloud);
    }

    const tallest = SKYLINE.reduce((a, b) => (b.h > a.h ? b : a));
    for (const b of SKYLINE) {
      this.rect(b.x, 44 - b.h, 7, b.h, look.building);
      if (period === 'dia') continue; // nobody needs the lights on in daylight
      b.lit.forEach((on, i) => {
        // A few windows switch on and off over time, like people at home
        const flickers = (b.x + i * 7) % 9 === 0;
        const lit = (flickers ? Math.sin(time / 4000 + b.x + i) > 0 : on) && (period === 'noite' || i % 2 === 0);
        const wy = 44 - b.h + 3 + Math.floor(i / 2) * 4;
        if (lit && wy < 42) this.rect(b.x + 1 + (i % 2) * 3, wy, 2, 2, '#e9b45a');
      });
    }
    this.rect(tallest.x + 3, 44 - tallest.h - 3, 1, 3, '#2a2f55');
    if (Math.floor(time / 700) % 2) this.rect(tallest.x + 3, 44 - tallest.h - 4, 1, 1, '#ff5a4a');
  }

  /** A streak crosses the sky for a moment every half minute or so. */
  private shootingStar(time: number) {
    const cycle = time % 27000;
    if (cycle > 700) return;
    const t = cycle / 700;
    const x = 240 - t * 70;
    const y = 12 + t * 14;
    for (let i = 0; i < 6; i++) this.rect(Math.round(x + i * 2), Math.round(y - i), 1, 1, `rgba(255, 250, 220, ${0.9 - i * 0.15})`);
  }

  /** The office cat, asleep on the windowsill, tail swishing now and then. */
  private cat(time: number) {
    const x = 236;
    const y = 39;
    const ink = C.outline;
    this.rect(x, y + 2, 13, 5, ink);
    this.rect(x + 1, y + 3, 11, 3, '#3b3346');
    this.rect(x + 9, y, 6, 5, ink); // head
    this.rect(x + 10, y + 1, 4, 3, '#3b3346');
    this.rect(x + 9, y - 1, 1, 1, ink); // ears
    this.rect(x + 14, y - 1, 1, 1, ink);
    // Eyes stay shut, opening a crack once in a while
    const peek = Math.floor(time / 150) % 60 === 0;
    this.rect(x + 11, y + 2, 1, 1, peek ? '#f2d974' : '#2b2433');
    this.rect(x + 13, y + 2, 1, 1, peek ? '#f2d974' : '#2b2433');
    const swish = Math.floor(time / 500) % 4;
    const tail = [0, 1, 2, 1][swish];
    this.rect(x - 4, y + 5 - tail, 5, 1, ink);
    this.rect(x - 5, y + 4 - tail, 1, 2, ink);
  }

  /** Light falls through the window onto the floor, with dust drifting in it. */
  private moonlight(time: number) {
    const { ctx } = this;
    const look = PERIODS[this.theme.periodo];
    ctx.fillStyle = `rgba(${look.light}, ${look.lightAlpha})`;
    for (const [from, to] of [
      [140, 189],
      [195, 246],
    ]) {
      ctx.beginPath();
      ctx.moveTo(from, WALL_BOTTOM);
      ctx.lineTo(to, WALL_BOTTOM);
      ctx.lineTo(to - 34, 128);
      ctx.lineTo(from - 34, 128);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 7; i++) {
      const drift = (time / (2600 + i * 400) + i * 0.37) % 1;
      const x = 150 + ((i * 29) % 80) - drift * 30;
      const y = WALL_BOTTOM + 6 + drift * 48;
      this.rect(Math.round(x), Math.round(y), 1, 1, `rgba(220, 228, 255, ${0.35 * Math.sin(drift * Math.PI)})`);
    }
  }

  /** A long rug down the aisle between the two rows of desks. */
  private runner() {
    this.rect(22, 146, 340, 12, '#4a2330');
    this.rect(24, 147, 336, 10, '#7a3b4a');
    this.rect(26, 149, 332, 6, '#6a3240');
    for (let x = 34; x < 352; x += 14) {
      this.rect(x, 151, 2, 2, '#c07a5a');
      this.rect(x - 2, 152, 6, 1, '#a8645a');
    }
    for (let x = 22; x < 362; x += 3) {
      this.rect(x, 145, 1, 1, '#a8645a'); // fringe
      this.rect(x, 158, 1, 1, '#a8645a');
    }
  }

  private furniture(time: number) {
    this.waterCooler(time);
    if (this.theme.plantas) {
      this.plant(10, 196);
      this.plant(372, 196);
      this.plant(102, 52);
      this.ivy(time);
    }
    if (this.theme.extras) {
      this.coffeeCorner(time);
      this.serverRack(time);
    }
  }

  /**
   * A wooden bookcase: lit left post, shaded right one, a crown on top, and shelves that hold
   * more than books (leaning and stacked ones, a little plant, a photo, a jar, a globe).
   */
  private bookshelf(time: number) {
    const wood = '#6b4a30';
    // Carcass: back panel with grain, posts lit from the left, crown and plinth
    this.rect(13, 12, 44, 56, '#2a1c13');
    for (let x = 15; x < 56; x += 5) this.rect(x, 13, 1, 54, '#24180f');
    this.rect(10, 9, 50, 3, shade(wood, 1.15));
    this.rect(10, 9, 50, 1, shade(wood, 1.4));
    this.rect(11, 12, 48, 1, '#1b1209');
    this.rect(11, 12, 3, 57, shade(wood, 1.1));
    this.rect(11, 12, 1, 57, shade(wood, 1.35));
    this.rect(56, 12, 3, 57, shade(wood, 0.8));
    this.rect(58, 12, 1, 57, shade(wood, 0.6));
    this.rect(10, 68, 50, 2, shade(wood, 0.75));
    this.rect(10, 70, 50, 1, 'rgba(10, 6, 4, 0.4)');

    type Item =
      | { t: 'book'; w: number; h: number; c: string }
      | { t: 'lean'; h: number; c: string }
      | { t: 'stack'; c: string[] }
      | { t: 'pot' | 'frame' | 'jar' | 'globe' };
    const shelves: Item[][] = [
      [
        { t: 'book', w: 3, h: 11, c: '#9c3b36' },
        { t: 'book', w: 4, h: 12, c: '#3f6f9e' },
        { t: 'book', w: 3, h: 10, c: '#c9963c' },
        { t: 'book', w: 3, h: 11, c: '#4f8a5c' },
        { t: 'lean', h: 10, c: '#7a58a0' },
        { t: 'globe' },
        { t: 'book', w: 3, h: 12, c: '#b86a3a' },
      ],
      [
        { t: 'stack', c: ['#3f6f9e', '#c9963c', '#9c3b36'] },
        { t: 'book', w: 3, h: 11, c: '#cfc6b0' },
        { t: 'book', w: 4, h: 12, c: '#2f5b4a' },
        { t: 'book', w: 3, h: 10, c: '#a04a6a' },
        { t: 'pot' },
      ],
      [
        { t: 'frame' },
        { t: 'book', w: 3, h: 11, c: '#4f8a5c' },
        { t: 'book', w: 3, h: 12, c: '#3f6f9e' },
        { t: 'lean', h: 11, c: '#c9963c' },
        { t: 'jar' },
        { t: 'book', w: 4, h: 11, c: '#9c3b36' },
      ],
    ];
    shelves.forEach((items, row) => {
      const floor = 26 + row * 18; // top of this shelf board
      // The shelf board: lit lip, shadow it casts on the back panel below
      this.rect(14, floor, 42, 2, shade(wood, 1.2));
      this.rect(14, floor, 42, 1, shade(wood, 1.45));
      this.rect(14, floor + 2, 42, 1, 'rgba(0, 0, 0, 0.35)');
      this.rect(14, floor - 14, 42, 2, 'rgba(0, 0, 0, 0.3)'); // shadow under the shelf above
      let x = 16;
      for (const item of items) {
        if (item.t === 'book') {
          this.spine(x, floor - item.h, item.w, item.h, item.c);
          x += item.w + (x % 3 === 0 ? 1 : 0);
        } else if (item.t === 'lean') {
          // A book leaning on its neighbour: a stepped diagonal spine
          for (let i = 0; i < item.h; i++) {
            const dx = Math.floor((item.h - i) / 3);
            this.rect(x + dx, floor - i - 1, 3, 1, i === item.h - 1 ? shade(item.c, 1.3) : item.c);
            this.rect(x + dx, floor - i - 1, 1, 1, shade(item.c, 1.25));
          }
          x += 7;
        } else if (item.t === 'stack') {
          item.c.forEach((c, i) => {
            const w = 11 - i * 2;
            this.rect(x + i, floor - 3 * (i + 1), w, 3, c);
            this.rect(x + i, floor - 3 * (i + 1), w, 1, shade(c, 1.3));
            this.rect(x + i + w - 1, floor - 3 * (i + 1), 1, 3, '#e8dcc0'); // page edges
          });
          x += 12;
        } else if (item.t === 'pot') {
          this.rect(x + 1, floor - 4, 5, 4, '#b0663f');
          this.rect(x, floor - 5, 7, 1, '#c97a4f');
          this.rect(x + 2, floor - 9, 1, 4, '#3f7d4b');
          this.rect(x + 4, floor - 8, 2, 3, '#62ae6c');
          this.rect(x, floor - 8, 2, 2, '#4f9a5c');
          this.rect(x + 3, floor - 11, 2, 2, '#62ae6c');
          x += 8;
        } else if (item.t === 'frame') {
          this.rect(x, floor - 9, 8, 9, '#c9a36a');
          this.rect(x + 1, floor - 8, 6, 7, '#6cb4e4');
          this.rect(x + 1, floor - 4, 6, 3, '#4f8a5c'); // a landscape photo
          this.rect(x + 5, floor - 7, 1, 1, '#fff3b0');
          x += 9;
        } else if (item.t === 'jar') {
          this.rect(x, floor - 7, 5, 7, 'rgba(180, 210, 230, 0.55)');
          this.rect(x + 1, floor - 5, 3, 4, '#d9a441'); // honey, or candy
          this.rect(x, floor - 8, 5, 1, '#8a5a3c');
          this.rect(x, floor - 7, 1, 5, 'rgba(255, 255, 255, 0.5)');
          x += 6;
        } else {
          // A small desk globe, its oceans turning slowly
          const turn = Math.floor(time / 1600) % 3;
          this.rect(x + 1, floor - 9, 5, 6, '#3f6f9e');
          this.rect(x + 2 + turn % 2, floor - 8, 2, 2, '#5b9a6a');
          this.rect(x + 1 + turn, floor - 5, 2, 1, '#5b9a6a');
          this.rect(x + 1, floor - 9, 1, 1, '#9fc3e6');
          this.rect(x + 3, floor - 3, 1, 2, '#8a6a3a');
          this.rect(x + 1, floor - 1, 5, 1, '#8a6a3a');
          x += 7;
        }
      }
    });
    // Top of the bookcase: a few books lying down and a trailing plant pot
    this.rect(14, 4, 12, 2, '#3f6f9e');
    this.rect(15, 2, 10, 2, '#c9963c');
    this.rect(14, 4, 12, 1, shade('#3f6f9e', 1.3));
    this.rect(44, 4, 7, 5, '#b0663f');
    this.rect(43, 3, 9, 1, '#c97a4f');
  }

  /** One book spine: lit left edge, shaded right edge, and gilt bands near the top and bottom. */
  private spine(x: number, y: number, w: number, h: number, color: string) {
    this.rect(x, y, w, h, color);
    this.rect(x, y, 1, h, shade(color, 1.3));
    this.rect(x + w - 1, y, 1, h, shade(color, 0.7));
    this.rect(x, y, w, 1, shade(color, 0.8));
    const band = '#d9b65a';
    this.rect(x + 1, y + 2, Math.max(1, w - 2), 1, band);
    this.rect(x + 1, y + h - 3, Math.max(1, w - 2), 1, band);
    if (h > 10) this.rect(x + 1, y + 5, Math.max(1, w - 2), 2, shade(color, 0.85)); // title label
  }

  /** A round wall clock with a wooden rim, hour marks and the real time. */
  private clock() {
    const cx = 89;
    const cy = 23;
    // Rim and face as stacked rows, so the circle reads round at this size
    const rim = [3, 5, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 6, 5, 3];
    rim.forEach((half, i) => {
      const y = cy - 7 + i;
      this.rect(cx - half, y, half * 2 + 1, 1, '#5c3f2b');
      const face = half - 2;
      if (face > 0 && i > 0 && i < rim.length - 1) this.rect(cx - face, y, face * 2 + 1, 1, i < 4 ? '#fbf5e4' : '#f1e8d2');
    });
    this.rect(cx - 7, cy - 4, 1, 9, '#7a5538'); // lit side of the rim
    for (const [dx, dy] of [[0, -5], [5, 0], [0, 5], [-5, 0]]) this.rect(cx + dx, cy + dy, 1, 1, '#3b2a1c');
    const now = new Date();
    this.hand(cx, cy, (now.getHours() % 12) / 12 + now.getMinutes() / 720, 3);
    this.hand(cx, cy, now.getMinutes() / 60, 4);
    this.rect(cx, cy, 1, 1, C.bad);
  }

  /** A water cooler: a bottle with bubbles rising now and then, taps and a drip tray. */
  private waterCooler(time: number) {
    // Bottle
    this.rect(267, 33, 10, 1, '#2b3a4a');
    this.rect(266, 34, 12, 13, '#7fbfe4');
    this.rect(266, 34, 12, 3, '#a8d6f0'); // air above the water
    this.rect(267, 35, 2, 11, 'rgba(255, 255, 255, 0.45)');
    this.rect(276, 35, 1, 11, '#5a9cc4');
    this.rect(270, 31, 4, 3, '#3f7fb3'); // cap
    for (let i = 0; i < 3; i++) {
      const rise = (time / (700 + i * 300) + i * 0.4) % 1;
      this.rect(271 + i * 2, Math.round(46 - rise * 9), 1, 1, 'rgba(235, 248, 255, 0.85)');
    }
    // Body with a lit side, a recessed panel, taps and a tray
    this.box(264, 47, 16, 24, '#d9dde6', '#5b6475');
    this.rect(265, 48, 2, 22, '#eef1f6');
    this.rect(277, 48, 2, 22, '#b8bfcc');
    this.rect(268, 51, 8, 8, '#c4cad6');
    this.rect(269, 53, 2, 3, '#d9574b'); // hot
    this.rect(273, 53, 2, 3, '#4f8fd6'); // cold
    this.rect(268, 60, 8, 2, '#5b6475');
    this.rect(268, 60, 8, 1, '#8a93a6');
    this.rect(265, 70, 14, 1, 'rgba(10, 8, 20, 0.35)');
  }

  /** Coffee machine on a little cabinet, by the bookshelf. */
  private coffeeCorner(time: number) {
    const wood = '#5c3f2b';
    this.rect(5, 117, 24, 3, C.deskShadow);
    // Cabinet: countertop with a lit edge, two doors with raised panels and brass knobs
    this.box(4, 90, 26, 28, wood);
    this.rect(3, 88, 28, 3, shade(wood, 1.3));
    this.rect(3, 88, 28, 1, shade(wood, 1.55));
    this.rect(5, 91, 1, 26, shade(wood, 1.2));
    for (const dx of [6, 18]) {
      this.rect(dx, 93, 10, 22, shade(wood, 0.85));
      this.rect(dx + 1, 94, 8, 20, shade(wood, 1.08));
      this.rect(dx + 1, 94, 8, 1, shade(wood, 1.3));
      this.rect(dx + 1, 113, 8, 1, shade(wood, 0.7));
    }
    this.rect(15, 102, 1, 3, '#d9b65a');
    this.rect(18, 102, 1, 3, '#d9b65a');
    // Espresso machine: brushed metal, a glowing button, the portafilter and a cup
    this.rect(8, 70, 18, 18, '#3a3f52');
    this.rect(8, 70, 18, 1, '#5b6378');
    this.rect(8, 71, 1, 17, '#4a5166');
    this.rect(25, 71, 1, 17, '#262a37');
    this.rect(10, 72, 14, 4, '#1c1f28');
    this.rect(11, 73, 2, 2, Math.floor(time / 900) % 2 ? '#5fd86f' : '#2f6b37');
    this.rect(15, 73, 7, 1, '#3d5a7a'); // little display
    this.rect(13, 77, 8, 2, '#22252f');
    this.rect(16, 79, 2, 2, '#22252f'); // spout
    this.rect(9, 86, 16, 2, '#22252f'); // drip grate
    for (let x = 10; x < 24; x += 2) this.rect(x, 86, 1, 1, '#4a5166');
    this.box(14, 82, 6, 5, '#efe7d4', '#6b5a48');
    this.rect(20, 83, 1, 2, '#6b5a48'); // cup handle
    this.rect(15, 83, 4, 1, '#6b3d22'); // coffee
    this.steam(17, 80, time, 2);
    // A jar of beans and a sugar bowl beside it
    this.rect(27, 82, 3, 6, 'rgba(200, 220, 235, 0.5)');
    this.rect(27, 84, 3, 4, '#5a3420');
    this.rect(27, 81, 3, 1, '#8a6a3a');
  }

  /** Blinks faster the more agents are working. */
  private serverRack(time: number) {
    const busy = this.agents.filter((a) => ACTIVE.includes(a.status)).length;
    this.rect(357, 117, 22, 3, C.deskShadow);
    this.box(356, 56, 24, 62, '#2a2d3a');
    this.rect(357, 57, 1, 60, '#3d4254'); // lit edge
    this.rect(378, 57, 1, 60, '#1a1c25');
    this.rect(357, 57, 22, 1, '#454b60');
    for (let x = 359; x < 377; x += 3) this.rect(x, 113, 2, 2, '#1d2029'); // vent at the foot
    for (let slot = 0; slot < 6; slot++) {
      const y = 59 + slot * 9;
      this.rect(358, y, 20, 7, '#1d2029');
      this.rect(358, y, 20, 1, '#30354a');
      this.rect(359, y + 1, 1, 5, '#4a5166'); // handles
      this.rect(376, y + 1, 1, 5, '#4a5166');
      for (let v = 361; v < 369; v += 2) this.rect(v, y + 5, 1, 1, '#2f3445'); // vent slits
      this.rect(360, y + 3, 9, 1, '#3a3f52');
      for (let led = 0; led < 3; led++) {
        const rate = 900 - busy * 220;
        const on = Math.sin(time / Math.max(120, rate) + slot * 1.7 + led * 2.3) > 0.2;
        const color = led === 2 ? (busy ? '#f2c14e' : '#3a3f52') : '#5fd86f';
        this.rect(371 + led * 2, y + 2, 1, 2, on ? color : '#24402a');
      }
    }
  }

  /** Little wisps rising from a hot drink. */
  private steam(x: number, y: number, time: number, strength: number) {
    for (let i = 0; i < strength + 1; i++) {
      const phase = (time / 600 + i * 0.5) % 1;
      const sway = Math.round(Math.sin(phase * Math.PI * 2 + i) * 1.2);
      this.rect(x + sway + i - 1, Math.round(y - phase * 7), 1, 2, `rgba(230, 230, 240, ${0.55 * (1 - phase)})`);
    }
  }

  private plant(x: number, y: number) {
    this.box(x - 6, y + 6, 13, 12, '#b0663f', '#5a2e1c');
    this.rect(x - 7, y + 5, 15, 3, '#8f4f31');
    const leaves: [number, number, number, number, string][] = [
      [-1, -10, 3, 16, '#3f7d4b'],
      [-8, -4, 7, 3, '#4f9a5c'],
      [2, -7, 7, 3, '#4f9a5c'],
      [-7, 1, 6, 3, '#62ae6c'],
      [2, -1, 6, 3, '#62ae6c'],
      [-3, -13, 3, 4, '#62ae6c'],
    ];
    for (const [dx, dy, w, h, color] of leaves) {
      this.rect(x + dx - 1, y + dy - 1, w + 2, h + 2, '#1f3a26');
      this.rect(x + dx, y + dy, w, h, color);
    }
  }

  /* ---------- Desks and people ---------- */

  /** Articulated desk lamp at the left end; on while the agent works, with a warm cone. */
  private deskLamp(left: number, top: number, on: boolean) {
    if (on) {
      const { ctx } = this;
      ctx.fillStyle = `rgba(${C.lamp}, 0.16)`;
      ctx.beginPath();
      ctx.moveTo(left + 7, top - 17);
      ctx.lineTo(left + 12, top - 17);
      ctx.lineTo(left + 34, top + 5);
      ctx.lineTo(left - 2, top + 5);
      ctx.closePath();
      ctx.fill();
    }
    this.box(left + 1, top - 4, 8, 3, '#3a3f52');
    this.rect(left + 4, top - 16, 1, 12, '#565b70');
    this.rect(left + 5, top - 17, 3, 1, '#565b70');
    this.box(left + 6, top - 21, 8, 5, on ? '#e3a04f' : '#4a4f63');
    this.rect(left + 8, top - 16, 4, 1, on ? '#fff1c4' : '#2a2d3a');
  }

  /** Something personal on each desk, picked from the desk's position so it never changes. */
  private keepsake(x: number, top: number, index: number) {
    switch (index % 4) {
      case 0: // small plant
        this.box(x, top - 6, 6, 5, '#b0663f', '#5a2e1c');
        this.rect(x + 1, top - 10, 1, 4, '#4f9a5c');
        this.rect(x + 3, top - 11, 1, 5, '#62ae6c');
        this.rect(x + 4, top - 9, 2, 1, '#4f9a5c');
        break;
      case 1: // stack of books
        this.rect(x - 1, top - 3, 9, 2, '#4f7fb3');
        this.rect(x, top - 5, 8, 2, '#c0544a');
        this.rect(x - 1, top - 7, 8, 2, '#d9a441');
        break;
      case 2: // photo frame
        this.box(x, top - 9, 7, 8, '#d4a874', '#6b4a2a');
        this.rect(x + 1, top - 8, 5, 3, '#7cc4e8');
        this.rect(x + 1, top - 5, 5, 3, '#62ae6c');
        break;
      default: // cactus
        this.box(x + 1, top - 4, 5, 4, '#c9a36a', '#6b4a2a');
        this.rect(x + 2, top - 11, 3, 7, '#4f9a5c');
        this.rect(x, top - 9, 2, 1, '#4f9a5c');
        this.rect(x, top - 10, 1, 1, '#4f9a5c');
        this.rect(x + 3, top - 10, 1, 1, '#9fd87b');
    }
  }

  private desk(cx: number, top: number, agent: AgentView | undefined, time: number, index: number) {
    const left = cx - DESK_W / 2;
    const selected = agent && agent.id === this.selectedId;

    if (selected) {
      // A rug under the chosen desk marks the selection
      this.rect(left - 6, top - 30, DESK_W + 12, 58, '#3a2d56');
      this.rect(left - 4, top - 28, DESK_W + 8, 54, '#4a3a6c');
      this.rect(left - 2, top - 26, DESK_W + 4, 50, '#3a2d56');
    }

    const active = agent && ACTIVE.includes(agent.status);
    if (active) {
      const glow = this.ctx.createRadialGradient(cx, top - 8, 2, cx, top - 8, 46);
      glow.addColorStop(0, `rgba(${C.lamp}, 0.2)`);
      glow.addColorStop(1, `rgba(${C.lamp}, 0)`);
      this.ctx.fillStyle = glow;
      this.ctx.fillRect(cx - 50, top - 54, 100, 96);
    }

    // Chair back sits behind the person
    this.box(cx - 12, top - 16, 24, 16, C.chair);
    this.rect(cx - 10, top - 14, 20, 2, C.chairLight);

    if (agent) this.person(cx, top, agent, time);

    // Floor shadow, legs, front panel, top surface
    this.rect(left + 2, top + 22, DESK_W - 2, 4, C.deskShadow);
    this.box(left + 3, top + 14, 5, 10, C.deskFrontDark);
    this.box(left + DESK_W - 8, top + 14, 5, 10, C.deskFrontDark);
    this.box(left, top + 6, DESK_W, 12, C.deskFront);
    this.rect(left + 1, top + 16, DESK_W - 2, 1, C.deskFrontDark);
    this.box(left - 2, top - 4, DESK_W + 4, 11, C.deskTop);
    this.rect(left - 1, top - 3, DESK_W + 2, 1, C.deskTopLight);

    // Things on the desk
    this.deskLamp(left, top, !!active);
    this.keepsake(left + 15, top, index);
    this.box(cx - 10, top - 1, 20, 5, '#4a4f63');
    for (let k = 0; k < 4; k++) this.rect(cx - 8 + k * 4, top + 1, 3, 1, '#7d849c');
    this.box(cx - 18, top - 3, 6, 6, '#e8e2d2', '#6b5a48');
    this.rect(cx - 17, top - 2, 4, 1, '#6b4a2a');
    if (active) this.steam(cx - 15, top - 5, time, 1);
    if (agent) this.hands(cx, top, agent, time);
    this.monitor(cx + 20, top - 20, agent?.status ?? 'idle', time);

    if (agent) {
      this.strain(cx, top, agent, time);
      if (selected) this.stressBar(cx, top - 31, agent);
      this.bubble(cx, top - 42, agent, time);
    }
  }

  /** Sweat when the account is close to its limit, steam once it ran out. */
  private strain(cx: number, top: number, agent: AgentView, time: number) {
    const stress = this.stress.get(agent.id);
    if (!stress || (stress.level !== 'apertado' && stress.level !== 'esgotado')) return;
    const head = top - 22;
    // A teardrop that slides down beside the forehead and starts over
    const drop = Math.floor(time / 150) % 6;
    const dx = cx + 9;
    const dy = head + 1 + drop;
    this.rect(dx + 1, dy, 1, 1, '#2b5f86');
    this.rect(dx, dy + 1, 3, 3, '#2b5f86');
    this.rect(dx + 1, dy + 1, 1, 1, '#bfe6ff');
    this.rect(dx + 1, dy + 2, 1, 1, '#7cc4f0');
    if (stress.level === 'esgotado') {
      // Steam rising from both ears, clear of the speech bubble above the head
      const step = Math.floor(time / 220) % 4;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const rise = (step + i) % 4;
          const px = cx + side * (11 + rise) - (side < 0 ? 4 : 0);
          const py = head + 4 - rise * 4;
          this.rect(px, py, 4, 3, `rgba(232, 232, 240, ${0.85 - rise * 0.2})`);
          this.rect(px + 1, py - 1, 2, 1, `rgba(232, 232, 240, ${0.6 - rise * 0.15})`);
        }
      }
    }
  }

  /** Small segmented bar over the selected agent's head. */
  private stressBar(cx: number, y: number, agent: AgentView) {
    const stress = this.stress.get(agent.id);
    if (!stress) return;
    const segments = 7; // 2 px blocks with 1 px gaps fill the 20 px inside the frame
    const lit = stress.level === 'sem-dados' ? 0 : Math.max(1, Math.round(stress.value * segments));
    this.box(cx - 11, y, 22, 5, '#1d1830');
    for (let i = 0; i < segments; i++) {
      this.rect(cx - 10 + i * 3, y + 1, 2, 3, i < lit ? stressColor((i + 1) / segments) : '#3a3150');
    }
  }

  private person(cx: number, top: number, agent: AgentView, time: number) {
    const look = lookFor(agent);
    const busy = agent.status !== 'waiting' && ACTIVE.includes(agent.status);
    const bob = busy && Math.floor(time / 240) % 2 ? 1 : 0;
    const x = cx - 8;
    const y = top - 22 + bob;
    paintCharacter(this.ctx, agent, x, y);
    // Blink now and then
    if (Math.floor(time / 100) % 37 === 0) {
      this.rect(x + 5, y + 6, 1, 2, look.palette.s);
      this.rect(x + 10, y + 6, 1, 2, look.palette.s);
      this.rect(x + 5, y + 7, 1, 1, C.outline);
      this.rect(x + 10, y + 7, 1, 1, C.outline);
    }
  }

  /** Forearms resting on the keyboard; they take turns while typing. */
  private hands(cx: number, top: number, agent: AgentView, time: number) {
    const look = lookFor(agent);
    const typing = agent.status === 'writing' || agent.status === 'running';
    const tap = typing ? Math.floor(time / 120) % 2 : 0;
    for (const [hx, up] of [
      [cx - 8, tap],
      [cx + 5, 1 - tap],
    ] as const) {
      this.rect(hx, top - 3 - up, 4, 3, look.palette.C);
      this.rect(hx, top - up, 4, 2, look.palette.s);
      this.rect(hx, top + 2 - up, 4, 1, look.palette.S);
    }
  }

  private monitor(x: number, y: number, status: AgentStatus, time: number) {
    // Stand, then a bezel with the screen showing what the agent is doing
    this.box(x + 7, y + 13, 4, 5, '#3a3f52');
    this.box(x + 3, y + 17, 12, 3, '#3a3f52');
    this.box(x - 1, y - 1, 20, 15, '#2a2d3a');
    const sx = x + 1;
    const sy = y + 1;
    const step = Math.floor(time / 200);
    const screen = (bg: string) => this.rect(sx, sy, 16, 11, bg);
    switch (status) {
      case 'reading':
        screen('#d6deec');
        for (let i = 0; i < 4; i++) this.rect(sx + 2, sy + 1 + ((i * 3 + step) % 10), 7 + ((i * 5) % 5), 1, '#7b879e');
        break;
      case 'writing':
        screen('#1d2233');
        for (let i = 0; i < 5; i++) {
          const width = i === 4 ? (step % 9) + 1 : 4 + ((i * 7) % 8);
          this.rect(sx + 1 + (i % 2) * 2, sy + 1 + i * 2, width, 1, ['#e3a04f', '#7cc4e8', '#c79ae8', '#9fd87b', '#e8e2d2'][i]);
        }
        break;
      case 'running':
        screen('#0b0f0b');
        for (let i = 0; i < 5; i++) this.rect(sx + 1, sy + 1 + i * 2, 3 + (((i + step) * 5) % 11), 1, '#5fd86f');
        break;
      case 'thinking':
        screen('#1d2233');
        for (let i = 0; i < 3; i++) this.rect(sx + 4 + i * 3, sy + 5, 2, 2, i === step % 3 ? '#c9d6ff' : '#55618f');
        break;
      case 'waiting':
        screen(step % 2 ? '#3a3420' : '#5a4f22');
        this.rect(sx + 7, sy + 2, 2, 5, C.note);
        this.rect(sx + 7, sy + 8, 2, 2, C.note);
        break;
      case 'done':
        screen('#16301c');
        this.rect(sx + 4, sy + 5, 2, 2, C.ok);
        this.rect(sx + 6, sy + 7, 2, 2, C.ok);
        this.rect(sx + 8, sy + 5, 2, 2, C.ok);
        this.rect(sx + 10, sy + 3, 2, 2, C.ok);
        break;
      case 'error':
        screen('#3a1616');
        this.rect(sx + 7, sy + 2, 2, 5, C.bad);
        this.rect(sx + 7, sy + 8, 2, 2, C.bad);
        break;
      default:
        screen('#14161f');
        this.rect(sx + 1, sy + 1, 3, 1, 'rgba(255,255,255,0.08)');
    }
  }

  private bubble(cx: number, y: number, agent: AgentView, time: number) {
    const finished = this.finishedAt.get(agent.id);
    const showDone = agent.status === 'done' && finished !== undefined && time - finished < 6000;
    const kind =
      agent.status === 'waiting' ? 'waiting' : agent.status === 'error' ? 'error' : agent.status === 'thinking' ? 'thinking' : showDone ? 'done' : null;
    if (!kind) return;
    const by = y - (Math.floor(time / 450) % 2);
    const bg = kind === 'waiting' ? C.note : C.paper;
    this.box(cx - 9, by, 18, 12, bg);
    this.rect(cx - 2, by + 11, 4, 2, C.outline);
    this.rect(cx - 1, by + 11, 2, 2, bg);
    this.rect(cx - 1, by + 13, 2, 1, C.outline);
    if (kind === 'thinking') {
      const dots = Math.floor(time / 300) % 4;
      for (let i = 0; i < dots; i++) this.rect(cx - 5 + i * 4, by + 5, 2, 2, '#3b3450');
    } else if (kind === 'waiting') {
      this.rect(cx - 1, by + 2, 2, 5, '#3b2a12');
      this.rect(cx - 1, by + 8, 2, 2, '#3b2a12');
    } else if (kind === 'done') {
      this.rect(cx - 5, by + 5, 2, 2, '#2f8a3a');
      this.rect(cx - 3, by + 7, 2, 2, '#2f8a3a');
      this.rect(cx - 1, by + 5, 2, 2, '#2f8a3a');
      this.rect(cx + 1, by + 3, 2, 2, '#2f8a3a');
      this.rect(cx + 3, by + 2, 2, 2, '#2f8a3a');
    } else {
      for (let i = 0; i < 6; i++) {
        this.rect(cx - 3 + i, by + 3 + i, 1, 1, C.bad);
        this.rect(cx + 2 - i, by + 3 + i, 1, 1, C.bad);
      }
    }
  }

  /** Name on the desk front, drawn in screen pixels so the font stays crisp. */
  private nameplate(cx: number, y: number, agent: AgentView) {
    const ctx = this.screen;
    const s = this.scale;
    // Silkscreen is drawn on an 8 px grid; whole multiples of 8 keep its pixels square.
    const size = 8 * Math.max(1, Math.round((s * 2) / 3));
    ctx.font = `400 ${size}px "Silkscreen", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textW = Math.min(ctx.measureText(agent.name).width, (DESK_W - 10) * s);
    const plateW = Math.ceil(textW / s) + 8;
    const px = (n: number) => Math.round(n * s);
    const sx = this.offsetX + px(Math.round(cx - plateW / 2));
    const sy = this.offsetY + px(y - 5);
    ctx.fillStyle = C.outline;
    ctx.fillRect(sx, sy, px(plateW), px(10));
    ctx.fillStyle = '#3b2a1c';
    ctx.fillRect(sx + px(1), sy + px(1), px(plateW - 2), px(8));
    ctx.fillStyle = '#f4dca8';
    ctx.fillText(agent.name, this.offsetX + px(cx), sy + px(5) + 1, (DESK_W - 10) * s);
  }

  /** Darker corners at night, a warm or bright wash by day, so the room matches the window. */
  private vignette(time: number) {
    const look = PERIODS[this.theme.periodo];
    if (look.wash) {
      this.ctx.fillStyle = look.wash;
      this.ctx.fillRect(0, 0, W, H);
    }
    this.lanternLight(time);
    if (this.theme.clima === 'chuva') {
      // A grey day indoors, and the whole room lights up for an instant with each lightning.
      this.ctx.fillStyle = this.flashing(time) ? 'rgba(220, 228, 255, 0.12)' : 'rgba(40, 50, 80, 0.06)';
      this.ctx.fillRect(0, 0, W, H);
    }
    const v = this.ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 250);
    v.addColorStop(0, 'rgba(10, 8, 20, 0)');
    v.addColorStop(1, `rgba(10, 8, 20, ${look.vignette})`);
    this.ctx.fillStyle = v;
    this.ctx.fillRect(0, 0, W, H);
  }
}
