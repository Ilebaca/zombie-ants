/**
 * THE OPENING: the camera drops onto the map.
 *
 * A match used to begin with the board simply being there. It starts high above it now: the
 * clearing is small in a frame of undergrowth, the floor grows up to meet the lens and
 * locks, and only then do the two colonies grow out of their nests.
 *
 * Like the finale (flood.ts) this is a VIEW and nothing else. The board it descends onto is
 * the board the engine already built — the camera is one transform around the frame.
 * Nothing here can change a tile (CLAUDE.md §3).
 *
 * THE FRAME MUST BE FULL. The board's own scenery is painted to the edges of the canvas and
 * no further, so the moment the camera pulls back there is a border of nothing around it and
 * the map reads as a picture floating on a colour. The bushes fill that border: they live in
 * the same space as the board, so they slide off the edges as it grows rather than sitting
 * over it, and they overlap its rim a little so there is no hard rectangle where the scenery
 * stops. Placement is seeded — the same board opens the same way rather than reshuffling on
 * a resize, exactly as the scenery does (terrain.ts).
 */
import { MAP } from "./palette";

const TAU = 6.283185307;

/** The descent: high above the clearing to locked on it. */
export const INTRO_MS = 1150;

/**
 * ...and then the colonies fill in from their nests.
 *
 * Long enough for the reveal to run its front out to the far corner of a starting
 * formation, which is what makes the opening read as the colony ARRIVING rather than
 * as five tiles that were already there.
 */
export const INTRO_FILL_MS = 820;

/**
 * How big the floor is when the descent starts, as a share of its final framing.
 *
 * Deliberately not far out. Past about this the clearing stops being the subject and starts
 * being a stamp in the middle of a screen of undergrowth, and the zoom stops reading as a
 * camera coming down and starts reading as a picture being scaled.
 */
const FROM = 0.66;

/** How far past the board's edge the bushes are scattered, as a share of its width. */
const RING = 0.55;

export interface Intro {
  start: number;
  dur: number;
}

/** `instant` is for reduced motion: the map, without the journey down to it. */
export function planIntro(now: number, instant = false): Intro {
  return { start: now, dur: instant ? 1 : INTRO_MS };
}

/** Descent progress, 0..1. */
export function introAt(intro: Intro, now: number): number {
  const p = (now - intro.start) / intro.dur;
  return p <= 0 ? 0 : (p >= 1 ? 1 : p);
}

/** Everything the caller has to wait for: the descent, then the colonies. */
export const introTotal = (intro: Intro): number =>
  intro.dur + (intro.dur > 1 ? INTRO_FILL_MS : 0);

/**
 * How big the floor is at this point in the descent.
 *
 * Eased out hard, with a hair of overshoot at the end — that last settle back is what reads
 * as the camera LOCKING onto the map rather than drifting to a halt on it.
 */
export function introScale(p: number): number {
  const e = 1 - (1 - p) ** 3;
  const settle = p > 0.82 ? Math.sin((p - 0.82) / 0.18 * Math.PI) * 0.018 : 0;
  return FROM + (1 - FROM) * e + settle;
}

/** A tiny deterministic generator. The engine's rng is off-limits to the renderer. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Bush { x: number; y: number; r: number; lobes: number; a: number; dark: boolean }

/** Bushes are placed once per screen size, not per frame. */
let cached: { key: string; bushes: Bush[] } | null = null;

function bushesFor(w: number, h: number): Bush[] {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (cached && cached.key === key) return cached.bushes;
  const rand = seeded(0x5eed1eaf);
  const band = w * RING;
  const span = Math.max(w, h);
  const out: Bush[] = [];

  // Around the outside, and a little way in over the rim: the overlap is what stops the
  // scenery ending on a straight line.
  const edge = (n: number, place: (t: number) => { x: number; y: number }): void => {
    for (let i = 0; i < n; i++) {
      const at = place((i + rand() * 0.9) / n);
      out.push({
        x: at.x, y: at.y,
        r: span * (0.10 + rand() * 0.13),
        lobes: 4 + Math.floor(rand() * 3),
        a: rand() * TAU,
        dark: rand() < 0.68,
      });
    }
  };
  const over = span * 0.05;                        // how far a bush may lean onto the board
  // Biased toward the rim rather than spread evenly through the band: a thin scatter at the
  // edge of the clearing leaves gaps for the board's own scenery to end on a straight line,
  // which is the thing the bushes are here to hide.
  const inward = (): number => Math.sqrt(rand()) * (band + over);
  edge(12, (t) => ({ x: -band + t * (w + band * 2), y: -band + (band + over) - inward() }));
  edge(12, (t) => ({ x: -band + t * (w + band * 2), y: h + band - inward() }));
  edge(10, (t) => ({ x: -band + (band + over) - inward(), y: -band + t * (h + band * 2) }));
  edge(10, (t) => ({ x: w + band - inward(), y: -band + t * (h + band * 2) }));

  cached = { key, bushes: out };
  return out;
}

/** Drop the cached bushes — used by tests. */
export function resetSurround(): void { cached = null; }

/**
 * The undergrowth around the clearing, drawn INSIDE the camera so it belongs to the ground.
 *
 * It fades over the last part of the descent rather than only sliding away: a bush leaning
 * over the board's rim would otherwise still be sitting on the playfield at the moment the
 * camera locks, and the first thing the player looks at must be the board.
 */
export function drawSurround(
  ctx: CanvasRenderingContext2D, w: number, h: number, p: number,
): void {
  if (p >= 1) return;
  // Gone a beat BEFORE the lock, not exactly on it: the last frames of the descent should
  // be the board and nothing else, which is what the camera is arriving at.
  const alpha = p < 0.66 ? 1 : 1 - (p - 0.66) / 0.28;
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  for (const b of bushesFor(w, h)) {
    // A shadow pooled under it, then the clump, then one lit crown — the same three-layer
    // build every raised thing on this board uses. Undergrowth in a forest is SHADED, so
    // the body is the dark green and the crown is a hint rather than a highlight.
    ctx.fillStyle = MAP.groundShade;
    blob(ctx, b, b.r * 0.94, b.r * 0.16);
    ctx.fillStyle = b.dark ? "#2b4720" : MAP.leafDark;
    blob(ctx, b, b.r, 0);
    ctx.globalAlpha = alpha * 0.34;
    ctx.fillStyle = MAP.leaf;
    blob(ctx, b, b.r * 0.55, -b.r * 0.20);
    ctx.globalAlpha = alpha;
  }
  ctx.restore();
}

/** A clump: overlapping circles around a centre, so it reads as foliage and not a ball. */
function blob(ctx: CanvasRenderingContext2D, b: Bush, r: number, dy: number): void {
  ctx.beginPath();
  for (let i = 0; i < b.lobes; i++) {
    const a = b.a + (i / b.lobes) * TAU;
    ctx.moveTo(b.x + Math.cos(a) * r * 0.5 + r * 0.55, b.y + dy + Math.sin(a) * r * 0.42);
    ctx.arc(b.x + Math.cos(a) * r * 0.5, b.y + dy + Math.sin(a) * r * 0.42, r * 0.55, 0, TAU);
  }
  ctx.fill();
}
