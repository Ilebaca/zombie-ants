/**
 * THE GROUND, AND WHAT GROWS ON IT.
 *
 * The playfield used to sit in a rounded tray with a pale rim — a board on a table. This
 * is the same ground running to every edge of the screen instead: the grid is a patch of
 * cleared soil in the middle of undergrowth, and the checkerboard fades out at its border
 * rather than being framed by one.
 *
 * Everything outside the grid is scenery — rock formations, fallen logs, ferns, tufts —
 * and none of it moves or means anything. It is drawn ONCE to an offscreen canvas and
 * blitted, because it is a still life redrawn sixty times a second otherwise, and it is by
 * far the most expensive thing on the frame.
 *
 * Placement is seeded, not random: the same board always grows the same scenery, so it
 * does not reshuffle itself on a resize or when the tab comes back.
 *
 * IT IS BAKED BIGGER THAN THE SCREEN. The opening (intro.ts) pulls the camera back, and a
 * plate cut to the canvas leaves a border of bare colour around itself the moment it does —
 * so the match began on one background and settled onto another, with the rocks and sticks
 * appearing to shift as the plate grew into place. The bleed is sized off the height the
 * camera starts at, so the SAME ground covers the frame from the first frame of the descent
 * to the last. It is extended, never stretched: the extra is more ground with more scenery
 * scattered on it at the same density, not the same picture blown up.
 */
import { MAP } from "./palette";
import { INTRO_FROM } from "./intro";
import type { Layout } from "./layout";
import { rrect } from "./shapes";

const TAU = 6.283185307;

/** A tiny deterministic generator — the engine's rng is off-limits to the renderer. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Cached {
  canvas: HTMLCanvasElement;
  key: string;
}
let cache: Cached | null = null;

/** Everything static about the scene, so the cache knows when to redraw. */
const sceneKey = (layout: Layout): string =>
  `${Math.round(layout.width)}x${Math.round(layout.height)}:${layout.size}:${layout.ts}:${layout.ox},${layout.oy}`;

/**
 * How far past each edge of the canvas the ground is painted.
 *
 * The camera starts at `INTRO_FROM` of its final framing and scales about the middle of the
 * BOARD, which is not always the middle of the canvas — so the furthest the lens can see in
 * any direction is set by the longer of the two sides of the board's centre. Anything less
 * and the plate's own edge comes into shot during the descent, which is the hard rectangle
 * the whole thing exists to avoid.
 */
export function terrainBleed(layout: Layout): number {
  const cx = layout.ox + (layout.size * layout.ts) / 2;
  const cy = layout.oy + (layout.size * layout.ts) / 2;
  const reach = Math.max(cx, layout.width - cx, cy, layout.height - cy);
  return Math.ceil(reach * (1 / INTRO_FROM - 1)) + 2;
}

export function drawTerrain(ctx: CanvasRenderingContext2D, layout: Layout): void {
  // No DOM (a node test, a worker) means no offscreen canvas to bake into. Draw nothing
  // rather than throwing: the scenery is decoration, and everything that matters is drawn
  // by the passes after this one.
  if (typeof document === "undefined") return;
  const bleed = terrainBleed(layout);
  const key = `${sceneKey(layout)}:${bleed}`;
  if (!cache || cache.key !== key) cache = bake(layout, key, bleed);
  // Blitted 1:1 and hung off the top-left corner, so the overhang falls outside the canvas
  // and is simply clipped away until the camera pulls back far enough to want it.
  if (cache) ctx.drawImage(cache.canvas, -bleed, -bleed);
}

/** Throw the cached scenery away — used by tests and on a species recolour. */
export function resetTerrain(): void { cache = null; }

function bake(layout: Layout, key: string, bleed: number): Cached | null {
  const w = Math.max(1, Math.round(layout.width));
  const h = Math.max(1, Math.round(layout.height));
  const canvas = document.createElement("canvas");
  canvas.width = w + bleed * 2;
  canvas.height = h + bleed * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Everything below is written in CANVAS coordinates — the same ones the board is drawn
  // in — so the overhang is just negative space off the top and left of them.
  ctx.translate(bleed, bleed);
  paintGround(ctx, layout, w, h, bleed);
  paintScenery(ctx, layout, w, h, bleed);
  return { canvas, key };
}

/**
 * The soil, everywhere, with the grid's checkerboard laid over the middle of it.
 *
 * The checker squares fade toward the edge of the grid so the playfield has no border —
 * it simply stops being chequered and carries on being ground.
 */
function paintGround(
  ctx: CanvasRenderingContext2D, layout: Layout, w: number, h: number, bleed: number,
): void {
  const n = layout.size, ts = layout.ts;
  const bx = layout.ox, by = layout.oy, bw = ts * n, bh = ts * n;
  const W = w + bleed * 2, H = h + bleed * 2;

  ctx.fillStyle = MAP.groundB;
  ctx.fillRect(-bleed, -bleed, W, H);

  // Broad tonal drift, so the bare soil is never a flat colour. Counted by AREA, so the
  // overhang is more of the same ground rather than the same ground spread thinner.
  const rand = seeded(0x5eed1);
  const drifts = Math.round(26 * (W * H) / (w * h));
  for (let i = 0; i < drifts; i++) {
    const x = -bleed + rand() * W, y = -bleed + rand() * H;
    const rad = (0.10 + rand() * 0.22) * Math.max(w, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rand() > 0.5 ? MAP.groundA : MAP.groundDark);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.globalAlpha = 1;

  // The cleared patch: lighter than the undergrowth around it, edges feathered.
  const clear = ctx.createRadialGradient(
    bx + bw / 2, by + bh / 2, bw * 0.30, bx + bw / 2, by + bh / 2, bw * 0.82,
  );
  clear.addColorStop(0, MAP.clearing);
  clear.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = clear;
  ctx.fillRect(bx - bw * 0.4, by - bh * 0.4, bw * 1.8, bh * 1.8);

  // The chequer, fading out toward the rim of the grid so there is no hard border.
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2 === 0) continue;
      const dc = Math.abs(c - (n - 1) / 2) / ((n - 1) / 2 || 1);
      const dr = Math.abs(r - (n - 1) / 2) / ((n - 1) / 2 || 1);
      const edge = Math.max(dc, dr);
      ctx.globalAlpha = 0.46 * (1 - edge * 0.42);
      ctx.fillStyle = MAP.groundA;
      ctx.fillRect(layout.x0(c), layout.y0(r), ts, ts);
    }
  }
  ctx.globalAlpha = 1;
}

/** Is this point far enough from the playfield to put something in the way? */
const clearOfBoard = (layout: Layout, x: number, y: number, pad: number): boolean => {
  const bx = layout.ox - pad, by = layout.oy - pad;
  const bw = layout.ts * layout.size + pad * 2, bh = bw;
  return x < bx || x > bx + bw || y < by || y > by + bh;
};

function paintScenery(
  ctx: CanvasRenderingContext2D, layout: Layout, w: number, h: number, bleed: number,
): void {
  const ts = layout.ts;
  const at: Plate = { w, h, bleed, margin: Math.max(10, ts * 0.35) };

  // Big things first, so small things settle in front of them.
  place(layout, 0xa27c01, at, 8, ts * 1.15, (x, y, s, rr) => rockCluster(ctx, x, y, s, rr));
  place(layout, 0x10cb17, at, 4, ts * 1.15, (x, y, s, rr) => fallenLog(ctx, x, y, s, rr));
  place(layout, 0xfe271d, at, 18, ts * 0.8, (x, y, s, rr) => fern(ctx, x, y, s, rr));
  place(layout, 0x7f4a11, at, 34, ts * 0.45, (x, y, s, rr) => tuft(ctx, x, y, s, rr));
  place(layout, 0x9b0b1e, at, 30, ts * 0.28, (x, y, s) => pebble(ctx, x, y, s));
}

export interface Plate { w: number; h: number; bleed: number; margin: number }

/** The plate a layout bakes onto: the canvas, its overhang, and the board's clearance. */
export const plateFor = (layout: Layout): Plate => ({
  w: Math.max(1, Math.round(layout.width)),
  h: Math.max(1, Math.round(layout.height)),
  bleed: terrainBleed(layout),
  margin: Math.max(10, layout.ts * 0.35),
});

/**
 * How many times more scattering ground the plate has than the canvas alone.
 *
 * Counts are given per SCREEN, so the overhang has to be paid for or the scenery thins out
 * — which is what happened when the plate first grew: scaling the count by total area
 * looked right and was not, because props never land on the playfield. The board is a
 * large hole in the middle of the canvas and barely a dent in the plate, so the free ground
 * grew by much more than the area did and the ring around the tiles emptied out.
 */
function spread(layout: Layout, at: Plate, pad: number): number {
  const board = layout.ts * layout.size + pad * 2;
  const bx = layout.ox - pad, by = layout.oy - pad;
  const overlap = Math.max(0, Math.min(bx + board, at.w) - Math.max(bx, 0))
    * Math.max(0, Math.min(by + board, at.h) - Math.max(by, 0));
  const canvasFree = at.w * at.h - overlap;
  if (canvasFree < at.w * at.h * 0.05) return 1;   // the board fills the screen: leave it be
  const plateFree = (at.w + at.bleed * 2) * (at.h + at.bleed * 2) - board * board;
  return Math.max(1, plateFree / canvasFree);
}

/** One prop, with the generator that placed it left ready for its own detail. */
export interface Prop { x: number; y: number; s: number; rand: () => number }

/**
 * Where one kind of prop goes. `per` is the count for a SCREENFUL of free ground; the plate
 * gets as many as its own free ground is worth.
 *
 * Each prop has its OWN generator, keyed on its index. It reads like an indulgence and is
 * not: with one shared sequence, a prop rejected for landing on the board consumed a
 * different number of draws than one that was kept, so five pixels of resize reshuffled
 * every prop after the first difference — the whole scene rearranging itself over a
 * relayout it should not have noticed.
 */
export function scatter(
  layout: Layout, at: Plate, seed: number, per: number, size: number,
): Prop[] {
  const W = at.w + at.bleed * 2, H = at.h + at.bleed * 2;
  const pad = at.margin + size * 0.5;
  const count = Math.round(per * spread(layout, at, pad));
  const out: Prop[] = [];
  for (let i = 0; i < count; i++) {
    const rand = seeded(seed + i * 0x9e3779b1);
    const x = -at.bleed + rand() * W, y = -at.bleed + rand() * H;
    const s = size * (0.7 + rand() * 0.6);
    if (clearOfBoard(layout, x, y, pad)) out.push({ x, y, s, rand });
  }
  return out;
}

/** Draw one kind of prop wherever `scatter` put it. */
function place(
  layout: Layout, seed: number, at: Plate, per: number, size: number,
  draw: (x: number, y: number, s: number, rand: () => number) => void,
): void {
  for (const p of scatter(layout, at, seed, per, size)) draw(p.x, p.y, p.s, p.rand);
}

function rockCluster(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rand: () => number): void {
  const lumps = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < lumps; i++) {
    const ox = (rand() - 0.5) * s * 0.9, oy = (rand() - 0.5) * s * 0.4;
    const rw = s * (0.35 + rand() * 0.35), rh = rw * (0.7 + rand() * 0.3);
    ctx.fillStyle = MAP.rockEdge;
    rrect(ctx, x + ox - rw / 2, y + oy - rh / 2 + rh * 0.16, rw, rh, rh * 0.34); ctx.fill();
    ctx.fillStyle = MAP.rock;
    rrect(ctx, x + ox - rw / 2, y + oy - rh / 2, rw, rh, rh * 0.34); ctx.fill();
    ctx.fillStyle = MAP.rockTop;
    rrect(ctx, x + ox - rw / 2 + rw * 0.14, y + oy - rh / 2 + rh * 0.10, rw * 0.72, rh * 0.34, rh * 0.17);
    ctx.fill();
  }
}

function fallenLog(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rand: () => number): void {
  const len = s * (1.2 + rand() * 0.9), thick = s * (0.26 + rand() * 0.12);
  const angle = (rand() - 0.5) * 1.1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = MAP.logShade;
  rrect(ctx, -len / 2, -thick / 2 + thick * 0.26, len, thick, thick / 2); ctx.fill();
  ctx.fillStyle = MAP.log;
  rrect(ctx, -len / 2, -thick / 2, len, thick, thick / 2); ctx.fill();
  ctx.fillStyle = MAP.logTop;
  rrect(ctx, -len / 2 + thick * 0.3, -thick / 2 + thick * 0.14, len - thick * 0.6, thick * 0.26, thick * 0.13);
  ctx.fill();
  // The cut end, so it reads as a log rather than a bar.
  ctx.fillStyle = MAP.logEnd;
  ctx.beginPath(); ctx.ellipse(len / 2, 0, thick * 0.20, thick * 0.46, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

function fern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rand: () => number): void {
  const fronds = 3 + Math.floor(rand() * 3);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  for (let i = 0; i < fronds; i++) {
    const a = -Math.PI / 2 + (i - (fronds - 1) / 2) * (0.42 + rand() * 0.12);
    const len = s * (0.6 + rand() * 0.5);
    ctx.strokeStyle = i % 2 === 0 ? MAP.leaf : MAP.leafDark;
    ctx.lineWidth = Math.max(1.4, s * 0.10);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.7, Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function tuft(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rand: () => number): void {
  const blades = 3 + Math.floor(rand() * 3);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  ctx.strokeStyle = MAP.leafDark;
  ctx.lineWidth = Math.max(1, s * 0.16);
  for (let i = 0; i < blades; i++) {
    const lean = (rand() - 0.5) * s * 0.8;
    ctx.beginPath();
    ctx.moveTo((rand() - 0.5) * s * 0.4, 0);
    ctx.quadraticCurveTo(lean * 0.5, -s * 0.4, lean, -s * (0.5 + rand() * 0.4));
    ctx.stroke();
  }
  ctx.restore();
}

function pebble(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = MAP.rockEdge;
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.2, s * 0.5, s * 0.34, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = MAP.rock;
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.34, 0, 0, TAU); ctx.fill();
}
