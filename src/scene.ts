import type { AgentStatus, AgentView } from '../shared/types.ts';

/** Logical canvas size; everything is drawn on this grid and scaled up by a whole number. */
export const W = 384;
export const H = 224;

const WALL_BOTTOM = 72;

const C = {
  outline: '#1b1626',
  wall: '#2e2645',
  wallStripe: '#2a2240',
  wainscot: '#241d38',
  wainscotPanel: '#2b2343',
  trim: '#3d3358',
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
    this.furniture();
    DESKS.forEach((desk, i) => this.desk(desk.x, desk.y, this.agents[i], time));
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
    this.rect(0, 0, W, WALL_BOTTOM, C.wall);
    for (let x = 4; x < W; x += 12) this.rect(x, 0, 2, 50, C.wallStripe);
    // Wainscot with recessed panels, then the trim
    this.rect(0, 50, W, WALL_BOTTOM - 50, C.wainscot);
    for (let x = 6; x < W - 20; x += 30) this.rect(x, 54, 24, 13, C.wainscotPanel);
    this.rect(0, 49, W, 2, C.trim);
    this.rect(0, WALL_BOTTOM - 2, W, 2, '#1a1428');

    // Window onto the city at night, with curtains
    this.box(128, 6, 128, 42, '#4d4066');
    const sky = this.ctx.createLinearGradient(0, 9, 0, 45);
    sky.addColorStop(0, '#0c1130');
    sky.addColorStop(1, '#2d3166');
    this.ctx.fillStyle = sky;
    this.ctx.fillRect(132, 10, 120, 34);
    for (const s of STARS) if (Math.sin(time / 800 + s.x * 3) > -0.5) this.rect(s.x, s.y, 1, 1, '#e8e4ff');
    this.rect(226, 13, 7, 7, '#f3ecc8');
    this.rect(229, 13, 4, 5, '#22265a');
    for (const b of SKYLINE) {
      this.rect(b.x, 44 - b.h, 7, b.h, '#151833');
      b.lit.forEach((on, i) => {
        const wy = 44 - b.h + 3 + Math.floor(i / 2) * 4;
        if (on && wy < 42) this.rect(b.x + 1 + (i % 2) * 3, wy, 2, 2, '#e9b45a');
      });
    }
    this.rect(191, 10, 2, 34, '#4d4066');
    this.rect(132, 26, 120, 2, '#4d4066');
    this.box(122, 46, 140, 4, '#5e4f7a');
    for (const side of [118, 252]) {
      this.rect(side, 4, 14, 44, '#6b2f3f');
      for (let y = 4; y < 48; y += 1) this.rect(side + 3 + (y % 4 === 0 ? 1 : 0), y, 1, 1, '#5a2634');
      this.rect(side + 9, 4, 1, 44, '#5a2634');
    }
    this.rect(112, 3, 160, 2, '#3a2f50');

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
    // Shadow where the wall meets the floor
    const fade = this.ctx.createLinearGradient(0, WALL_BOTTOM, 0, WALL_BOTTOM + 10);
    fade.addColorStop(0, 'rgba(15, 8, 20, 0.45)');
    fade.addColorStop(1, 'rgba(15, 8, 20, 0)');
    this.ctx.fillStyle = fade;
    this.ctx.fillRect(0, WALL_BOTTOM, W, 10);
  }

  private furniture() {
    // Water cooler
    this.box(266, 34, 12, 14, '#9fd3f0', '#2b3a4a');
    this.rect(268, 36, 3, 8, 'rgba(255,255,255,0.4)');
    this.box(264, 47, 16, 24, '#d9dde6', '#5b6475');
    this.rect(269, 53, 6, 3, '#5b6475');
    this.plant(10, 196);
    this.plant(372, 196);
    this.plant(102, 52);
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

  private desk(cx: number, top: number, agent: AgentView | undefined, time: number) {
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
    this.box(cx - 10, top - 1, 20, 5, '#4a4f63');
    for (let k = 0; k < 4; k++) this.rect(cx - 8 + k * 4, top + 1, 3, 1, '#7d849c');
    this.box(left + 4, top - 2, 6, 6, '#e8e2d2', '#6b5a48');
    this.rect(left + 5, top - 1, 4, 1, '#6b4a2a');
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

  private vignette() {
    const v = this.ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 250);
    v.addColorStop(0, 'rgba(10, 8, 20, 0)');
    v.addColorStop(1, 'rgba(10, 8, 20, 0.4)');
    this.ctx.fillStyle = v;
    this.ctx.fillRect(0, 0, W, H);
  }
}
