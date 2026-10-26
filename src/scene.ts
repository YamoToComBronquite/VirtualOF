import type { AgentStatus, AgentView } from '../shared/types.ts';

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
  parede: 'ameixa' | 'floresta' | 'terracota' | 'grafite';
  piso: 'madeira' | 'carpete' | 'xadrez';
  gato: boolean;
  tapete: boolean;
  plantas: boolean;
  /** Coffee corner and server rack. */
  extras: boolean;
}

export const DEFAULT_THEME: Theme = {
  periodo: 'noite',
  parede: 'ameixa',
  piso: 'madeira',
  gato: true,
  tapete: true,
  plantas: true,
  extras: true,
};

const WALLS: Record<Theme['parede'], { wall: string; stripe: string; wainscot: string; panel: string; trim: string }> = {
  ameixa: { wall: '#2e2645', stripe: '#2a2240', wainscot: '#241d38', panel: '#2b2343', trim: '#3d3358' },
  floresta: { wall: '#22382f', stripe: '#1f332b', wainscot: '#1a2b24', panel: '#20342b', trim: '#2f4a3e' },
  terracota: { wall: '#4a2c26', stripe: '#442822', wainscot: '#36201b', panel: '#402620', trim: '#5c3a31' },
  grafite: { wall: '#2b2d33', stripe: '#27292f', wainscot: '#202227', panel: '#26282e', trim: '#3a3d45' },
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
const BOOKS = Array.from({ length: 21 }, () => ({
  w: 3 + Math.floor(rand() * 2),
  h: 8 + Math.floor(rand() * 4),
  color: ['#b9504a', '#4f7fb3', '#d4a043', '#5b9a6a', '#8a66b0', '#cfc6b0', '#c77b45'][Math.floor(rand() * 7)],
}));
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
  let look = looks.get(agent.id);
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
  looks.set(agent.id, look);
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
    this.vignette();

    const { screen } = this;
    screen.fillStyle = '#120f1c';
    screen.fillRect(0, 0, this.canvas.width, this.canvas.height);
    screen.imageSmoothingEnabled = false;
    screen.drawImage(this.world, this.offsetX, this.offsetY, W * this.scale, H * this.scale);
    // Text goes on top at screen resolution, so it stays sharp at any zoom.
    DESKS.forEach((desk, i) => {
      const agent = this.agents[i];
      if (agent) this.nameplate(desk.x, desk.y + 12, agent);
    });
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
    for (let x = 4; x < W; x += 12) this.rect(x, 0, 2, 50, walls.stripe);
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
    this.ctx.restore();
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

    // Bookshelf
    this.box(12, 10, 46, 58, '#5c3f2b');
    for (let shelf = 0; shelf < 3; shelf++) {
      const y = 14 + shelf * 17;
      this.rect(15, y, 40, 13, '#2a1d15');
      this.rect(15, y + 13, 40, 2, '#7a5538');
      let x = 16;
      for (let i = shelf * 7; i < shelf * 7 + 7 && x < 52; i++) {
        const book = BOOKS[i];
        this.rect(x, y + 13 - book.h, book.w, book.h, book.color);
        this.rect(x, y + 13 - book.h, book.w, 1, 'rgba(255,255,255,0.18)');
        x += book.w + 1;
      }
    }

    // Wall clock with the real time
    const now = new Date();
    this.box(80, 14, 18, 18, '#d9cfb8');
    this.rect(82, 16, 14, 14, '#f4ecd8');
    this.hand(89, 23, (now.getHours() % 12) / 12 + now.getMinutes() / 720, 3);
    this.hand(89, 23, now.getMinutes() / 60, 5);

    // Corkboard: one pinned note per finished task
    this.box(284, 10, 84, 40, '#6e5133');
    this.rect(287, 13, 78, 34, '#a8814f');
    const notes = Math.min(this.doneCount, 14);
    for (let i = 0; i < notes; i++) {
      const x = 290 + (i % 7) * 11;
      const y = 16 + Math.floor(i / 7) * 15;
      this.rect(x + 1, y + 1, 8, 10, 'rgba(0,0,0,0.25)');
      this.rect(x, y, 8, 10, i % 3 === 0 ? C.note : C.paper);
      this.rect(x + 1, y + 4, 5, 1, '#b8ad92');
      this.rect(x + 1, y + 6, 4, 1, '#b8ad92');
      this.rect(x + 3, y, 2, 2, C.bad);
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
    const sky = this.ctx.createLinearGradient(0, 9, 0, 45);
    sky.addColorStop(0, look.top);
    sky.addColorStop(1, look.bottom);
    this.ctx.fillStyle = sky;
    this.ctx.fillRect(132, 10, 120, 34);

    if (period === 'noite') {
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
    // Water cooler
    this.box(266, 34, 12, 14, '#9fd3f0', '#2b3a4a');
    this.rect(268, 36, 3, 8, 'rgba(255,255,255,0.4)');
    this.box(264, 47, 16, 24, '#d9dde6', '#5b6475');
    this.rect(269, 53, 6, 3, '#5b6475');
    if (this.theme.plantas) {
      this.plant(10, 196);
      this.plant(372, 196);
      this.plant(102, 52);
    }
    if (this.theme.extras) {
      this.coffeeCorner(time);
      this.serverRack(time);
    }
  }

  /** Coffee machine on a little cabinet, by the bookshelf. */
  private coffeeCorner(time: number) {
    this.rect(5, 117, 24, 3, C.deskShadow);
    this.box(4, 88, 26, 30, '#5c3f2b');
    this.rect(6, 102, 22, 1, '#3e2a1d');
    this.rect(16, 94, 2, 3, '#c9a36a'); // knobs
    this.rect(16, 108, 2, 3, '#c9a36a');
    this.box(8, 70, 18, 19, '#3a3f52');
    this.rect(10, 72, 14, 4, '#22252f');
    this.rect(11, 73, 2, 2, Math.floor(time / 900) % 2 ? '#5fd86f' : '#2f6b37');
    this.rect(15, 76, 4, 4, '#22252f'); // spout
    this.box(14, 82, 6, 6, '#e8e2d2', '#6b5a48');
    this.steam(17, 80, time, 2);
  }

  /** Blinks faster the more agents are working. */
  private serverRack(time: number) {
    const busy = this.agents.filter((a) => ACTIVE.includes(a.status)).length;
    this.rect(357, 117, 22, 3, C.deskShadow);
    this.box(356, 56, 24, 62, '#2a2d3a');
    for (let slot = 0; slot < 6; slot++) {
      const y = 59 + slot * 9;
      this.rect(358, y, 20, 7, '#1d2029');
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
  private vignette() {
    const look = PERIODS[this.theme.periodo];
    if (look.wash) {
      this.ctx.fillStyle = look.wash;
      this.ctx.fillRect(0, 0, W, H);
    }
    const v = this.ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 250);
    v.addColorStop(0, 'rgba(10, 8, 20, 0)');
    v.addColorStop(1, `rgba(10, 8, 20, ${look.vignette})`);
    this.ctx.fillStyle = v;
    this.ctx.fillRect(0, 0, W, H);
  }
}
