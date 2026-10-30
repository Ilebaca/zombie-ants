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
import { seeded } from "../engine";
import type { Layout } from "./layout";
import { rrect } from "./shapes";

const TAU = 6.283185307;

/** A tiny deterministic generator — the engine's rng is off-limits to the renderer. */
interface Cached {
  canvas: HTMLCanvasElement;
  /** What the plate measures in CSS pixels — the backing store is `dpr` times this. */
  w: number;
  h: number;
  key: string;
}
let cache: Cached | null = null;

/** Everything static about the scene, so the cache knows when to redraw. */
const sceneKey = (layout: Layout): string =>
  `${Math.round(layout.width)}x${Math.round(layout.height)}:${layout.dpr}:${layout.size}:${layout.ts}:${layout.ox},${layout.oy}`;

/**
 * How far past each edge of the canvas the ground is painted: NOTHING, now.
 *
 * It used to be half as much again in every direction, because the opening pulled the
 * camera back and a plate cut to the canvas showed its own edge the moment it did. There
 * is no camera any more — the board is a fixed frame and the region's picture is painted
 * to fit it exactly — so an overhang is a plate several times the area for ground nobody
 * can ever see. The function stays because it is the one place that says so, and because
 * a plate is still blitted from its corner.
 */
export function terrainBleed(_layout: Layout): number {
  return 0;
}

/**
 * Rectangles the scenery must leave alone, over and above the playfield itself.
 *
 * The nameplates are written on the soil (plates.ts), and a fern or a fallen log baked
 * under one reads as clutter over the text. ONLY what actually overlaps goes: the boxes are
 * the measured rows and nothing wider, so the ring around the tiles keeps its density.
 */
export interface TerrainOptions {
  /** The region's painted ground, as a url. Absent means the ground the game draws. */
  ground?: string | null;
  /**
   * Whether to mark the cells. True everywhere in the game; the export tool
   * (`tools/mapshot.ts`) turns it off because a REGION PICTURE is the ground WITHOUT the
   * board's markings — the chequer is drawn over it at the tile size of the screen it is
   * played on, and squares baked into a picture would line up on exactly one phone.
   */
  grid?: boolean;
}

export function drawTerrain(
  ctx: CanvasRenderingContext2D, layout: Layout, reserve: readonly Rect[] = [],
  opts: TerrainOptions = {},
): void {
  // No DOM (a node test, a worker) means no offscreen canvas to bake into. Draw nothing
  // rather than throwing: the scenery is decoration, and everything that matters is drawn
  // by the passes after this one.
  if (typeof document === "undefined") return;
  const bleed = terrainBleed(layout);
  // A PAINTED GROUND ARRIVES LATE, so the key carries whether it is HERE rather than
  // whether it was asked for: the first frames of a match bake the drawn ground, the
  // picture lands, the key changes and the plate is baked again with it. Without that the
  // first bake would be kept for the whole match and the artwork would never appear.
  const grid = opts.grid !== false;
  const art = opts.ground ? groundArt(opts.ground) : null;
  const key = `${sceneKey(layout)}:${bleed}:${reserveKey(reserve)}:${art ? opts.ground : ""}:${grid}`;
  if (!cache || cache.key !== key) cache = bake(layout, key, bleed, reserve, art, grid);
  // Hung off the top-left corner, so the overhang falls outside the canvas and is simply
  // clipped away until the camera pulls back far enough to want it. The SIZE is given in
  // CSS pixels: the plate's backing store is `dpr` times that (see `bake`), and the
  // context it lands in is already scaled by `dpr`, so this is a 1:1 blit of real pixels.
  if (cache) ctx.drawImage(cache.canvas, -bleed, -bleed, cache.w, cache.h);
}

/**
 * THE REGION'S PICTURE, ONCE IT HAS LANDED.
 *
 * Every draw is synchronous and an image is not, so this answers null until the file is
 * decoded and the same element for ever after. A load that FAILS is remembered as failed
 * and never asked for again — a picture retried every frame is a request per frame, and
 * the drawn ground is a perfectly good board to play on.
 */
const loaded = new Map<string, HTMLImageElement | "failed">();

function imageFor(src: string): HTMLImageElement | "failed" | null {
  const held = loaded.get(src);
  if (held) return held;
  if (typeof Image === "undefined") return null;
  const img = new Image();
  img.onerror = (): void => { loaded.set(src, "failed"); };
  img.src = src;
  loaded.set(src, img);
  return img;
}

function groundArt(src: string): HTMLImageElement | null {
  const held = imageFor(src);
  return held && held !== "failed" && held.complete ? held : null;
}

/**
 * WHEN THE REGION'S PICTURE HAS LANDED — or failed, which counts as landed.
 *
 * The BOARD does not need this: it redraws every frame, so it simply picks the picture up
 * on whichever frame it arrives. A STILL is drawn once (`drawSnapshot`), so without this
 * the setup screen would show the drawn ground for ever — the file always lands a beat
 * after the one draw it had. The caller redraws; nothing here does, because a module that
 * decides when a screen repaints is a module reaching into the screen.
 */
export function groundReady(src: string): Promise<void> {
  const held = imageFor(src);
  if (!held || held === "failed" || held.complete) return Promise.resolve();
  return new Promise<void>((done) => {
    held.addEventListener("load", () => done(), { once: true });
    held.addEventListener("error", () => done(), { once: true });
  });
}

/**
 * IS THE REGION'S PICTURE ACTUALLY ON THE PLATE?
 *
 * What it answers is "has it LANDED", not "was one asked for" — a file that is still
 * decoding, or one that failed, leaves the DRAWN floor underneath, and the board has to
 * draw the rocks and the gem seams itself there (`board.ts`). Keyed on the asked-for url
 * instead, a picture that never arrived would take the rocks off a board that has none
 * painted in.
 */
export const groundPainted = (src: string | null | undefined): boolean =>
  !!src && groundArt(src) !== null;

/** Forget what has been loaded — tests only. */
export function resetGroundArt(): void { loaded.clear(); }

/** Throw the cached scenery away — used by tests and on a species recolour. */
export function resetTerrain(): void { cache = null; }

export interface Rect { x: number; y: number; w: number; h: number }

const reserveKey = (reserve: readonly Rect[]): string =>
  reserve.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)}`).join("|");

function bake(
  layout: Layout, key: string, bleed: number, reserve: readonly Rect[],
  art: HTMLImageElement | null, grid: boolean,
): Cached | null {
  const w = Math.max(1, Math.round(layout.width));
  const h = Math.max(1, Math.round(layout.height));
  // THE PLATE IS BAKED AT DEVICE RESOLUTION, never at CSS size. The board's own context is
  // scaled by `dpr`, so a plate baked one canvas pixel per CSS pixel is blown up two- or
  // three-fold on the way in — every pixel of the ground averaged with its neighbours.
  // That was invisible while the ground was DRAWN, because soil and ferns are soft shapes
  // anyway; a painted region is a photograph, and it came out soft over the whole board.
  const dpr = Math.max(1, layout.dpr || 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((w + bleed * 2) * dpr);
  canvas.height = Math.round((h + bleed * 2) * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Everything below is written in CANVAS coordinates — the same ones the board is drawn
  // in — so the overhang is just negative space off the top and left of them, and the
  // scale is what puts those coordinates onto the denser backing store.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(bleed, bleed);
  if (art) {
    // A PAINTED REGION REPLACES THE SOIL AND EVERYTHING GROWING ON IT. A picture already
    // has its own rocks and ferns, and drawing ours over them is two forests at once.
    paintArt(ctx, art, layout);
  } else {
    paintGround(ctx, layout, w, h, bleed);
    paintScenery(ctx, layout, w, h, bleed, reserve);
  }
  // THE CHEQUER IS THE DRAWN FLOOR'S, and only the drawn floor's. A region's picture has
  // the cells painted into it and is placed BY them (`groundAlign`), so marking them again
  // is two grids on one board. It was the other way round for as long as a picture was
  // just ground: the squares could not be baked into one, because nothing said where in
  // the file they would land.
  if (grid && !art) paintChequer(ctx, layout);
  return { canvas, w: w + bleed * 2, h: h + bleed * 2, key };
}

/**
 * THE REGION'S PICTURE, LINED UP WITH THE BOARD.
 *
 * The picture carries the nine-by-nine grid itself (`ART_GRID`), so it is placed by that
 * grid and nothing else: scaled until its painted cells are the size of the board's and
 * centred on them. It used to COVER the canvas, which put the artwork at a different size
 * on every phone — fine while the ground was soil and ferns, impossible now the slabs in
 * it ARE the cells.
 *
 * Nothing fills the frame around it, because there is no frame: the picture is painted to
 * the shape of a phone and the board is nine tenths of the screen, so it reaches every
 * edge of the canvas by itself.
 */
function paintArt(
  ctx: CanvasRenderingContext2D, art: HTMLImageElement, layout: Layout,
): void {
  const iw = art.naturalWidth || art.width, ih = art.naturalHeight || art.height;
  // The picture is usually being scaled DOWN onto the plate, where averaging the dropped
  // pixels rather than picking one is the whole difference between a photograph and a
  // mosaic of it.
  ctx.imageSmoothingQuality = "high";
  const at = groundAlign(layout, iw, ih);
  ctx.drawImage(art, at.x, at.y, at.w, at.h);
}

/**
 * WHERE THE GRID SITS IN A REGION'S PICTURE, as fractions of the file.
 *
 * Every region picture is painted to one template, which is what lets the renderer place
 * any of them without a table: the nine-by-nine grid of cells occupies this rectangle.
 *
 * MEASURED ACROSS ALL TEN REGIONS, not off one of them: a ten-line ladder fitted to each
 * file's luminance, which answers with the CENTRE of each painted grout line rather than
 * the edge of the ink — and a cell boundary belongs on the middle of the line between two
 * slabs. The ten agree to about two pixels, which is the hand that painted them, so the
 * rectangle is their mean; taking it off one file would let that file decide where the
 * other nine sit.
 *
 * AND IT IS RE-MEASURED WHENEVER THE TEN ARE REPAINTED, which is the only way to know a
 * new set was painted to the template rather than near it. The restyle moved it by six
 * tenths of a file pixel — under a third of a pixel on the board — so the number barely
 * changed, and that is the result rather than the reason to skip the measurement.
 */
export const ART_GRID = { x: 0.0570, y: 0.2936, w: 0.8850, h: 0.4027 } as const;

/**
 * Where the whole picture lands so its painted grid sits exactly on the board.
 *
 * ONE scale, never two. The file's cells are a fraction of a percent off square — 83.0
 * pixels across against 83.25 down on the forest floor — and stretching a painting to
 * hide that is worse than the half pixel it costs. The two scales are averaged and the
 * grid is centred on the board, so the error is split between the top and bottom edges
 * instead of all landing on one of them, and it is under a pixel either way.
 */
export function groundAlign(
  layout: Layout, iw: number, ih: number,
): { x: number; y: number; w: number; h: number } {
  const board = layout.ts * layout.size;
  if (iw <= 0 || ih <= 0) return { x: layout.ox, y: layout.oy, w: board, h: board };
  const scale = Math.sqrt((board / (ART_GRID.w * iw)) * (board / (ART_GRID.h * ih)));
  const w = iw * scale, h = ih * scale;
  return {
    x: layout.ox + board / 2 - (ART_GRID.x + ART_GRID.w / 2) * w,
    y: layout.oy + board / 2 - (ART_GRID.y + ART_GRID.h / 2) * h,
    w, h,
  };
}

/**
 * The soil, everywhere, and the cleared patch the board sits in.
 *
 * This is the ground the game DRAWS, which is what a region with no picture of its own
 * wears. The chequer is a pass of its own (`paintChequer`) because it marks the cells
 * rather than the ground, and it goes over a painted region too.
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

}

/**
 * THE TILE INDICATORS: a chequer of marked cells, fading out toward the rim of the grid so
 * the playfield has no hard border.
 *
 * THE DRAWN FLOOR'S ONLY. A region's picture has its cells painted in and is placed by
 * them (`groundAlign`), so it needs no mark of its own — and marking it anyway put a
 * second grid over the first.
 *
 * It was a LAYER over a painted ground for as long as a picture was only ground, and the
 * mark had to be solved against whatever luminance it landed on: a fixed white read as
 * twelve levels out of 255 on brown soil and five on bright sand, so the tiles stopped
 * standing out one region at a time as the art arrived. That whole mechanism is gone with
 * the template, and this is what it always was underneath — the soil's own lighter colour
 * on the soil.
 */
const SOIL_TILE = 0.46;

/**
 * What a marked cell is painted with. `edge` is how far out the cell sits (0 middle, 1
 * rim).
 *
 * Pulled out of the drawing so the rule can be tested: there is no canvas in a node test
 * and the plate bakes into one of its own, so this is the only part of the layer anything
 * else can see.
 */
export function tileMark(edge: number): { fill: string; alpha: number } {
  const fade = 1 - Math.min(1, Math.max(0, edge)) * 0.42;
  return { fill: MAP.groundA, alpha: SOIL_TILE * fade };
}

function paintChequer(ctx: CanvasRenderingContext2D, layout: Layout): void {
  const n = layout.size, ts = layout.ts;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2 === 0) continue;
      const dc = Math.abs(c - (n - 1) / 2) / ((n - 1) / 2 || 1);
      const dr = Math.abs(r - (n - 1) / 2) / ((n - 1) / 2 || 1);
      const mark = tileMark(Math.max(dc, dr));
      ctx.globalAlpha = mark.alpha;
      ctx.fillStyle = mark.fill;
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

/**
 * ...and clear of anything drawn on the soil over it.
 *
 * The prop's own size is what is tested, not its centre: a fern placed just outside a name
 * still has half its fronds across it. `pad` already carries half the prop's width, which
 * is the same allowance the board gets.
 */
const clearOfReserved = (
  reserve: readonly Rect[], x: number, y: number, pad: number,
): boolean => reserve.every((r) =>
  x < r.x - pad || x > r.x + r.w + pad || y < r.y - pad || y > r.y + r.h + pad);

function paintScenery(
  ctx: CanvasRenderingContext2D, layout: Layout, w: number, h: number, bleed: number,
  reserve: readonly Rect[],
): void {
  const ts = layout.ts;
  const at: Plate = { w, h, bleed, margin: Math.max(10, ts * 0.35), reserve };

  // Big things first, so small things settle in front of them.
  place(layout, 0xa27c01, at, 8, ts * 1.15, (x, y, s, rr) => rockCluster(ctx, x, y, s, rr));
  place(layout, 0x10cb17, at, 4, ts * 1.15, (x, y, s, rr) => fallenLog(ctx, x, y, s, rr));
  place(layout, 0xfe271d, at, 18, ts * 0.8, (x, y, s, rr) => fern(ctx, x, y, s, rr));
  place(layout, 0x7f4a11, at, 34, ts * 0.45, (x, y, s, rr) => tuft(ctx, x, y, s, rr));
  place(layout, 0x9b0b1e, at, 30, ts * 0.28, (x, y, s) => pebble(ctx, x, y, s));
}

export interface Plate {
  w: number; h: number; bleed: number; margin: number;
  /** Boxes on the soil the scenery must not grow over (the nameplates). */
  reserve?: readonly Rect[];
}

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
  // How many have to be SOWN for that many to come up on screen. A prop is sampled over
  // the whole plate and thrown away if it lands on the board, so the loss is the whole
  // calculation: it was the plate's own free ground over the canvas's, which only came
  // out right while the plate was half as big again as the canvas in every direction. It
  // is not any more (`terrainBleed`), and the ring around the tiles emptied by half.
  return Math.max(1, ((at.w + at.bleed * 2) * (at.h + at.bleed * 2)) / canvasFree);
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
    // A prop dropped for landing on the board — or under a name — is dropped, not moved:
    // its generator is its own (below), so the ones that were kept do not shift.
    if (clearOfBoard(layout, x, y, pad) && clearOfReserved(at.reserve ?? [], x, y, pad)) {
      out.push({ x, y, s, rand });
    }
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
