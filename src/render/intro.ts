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
 * THE FRAME IS FULL OF GROUND, and that is the TERRAIN's job, not this file's — the plate is
 * baked bigger than the canvas so the same ground covers the frame from the top of the
 * descent (terrain.ts, `terrainBleed`). These bushes are foliage over it: they live in the
 * same space as the board, and they overlap its rim so the eye has something to come down
 * PAST rather than a clearing that was always in full view. They get out of the way
 * by MOVING — straight out from the middle as the camera drops — rather than by fading:
 * a bush that dissolves says the picture is changing, a bush that slides out of frame says
 * the camera is coming down past it. They move on the camera's OWN curve (`descent`), start
 * to finish, because the ring opening and the floor growing are one movement and reading as
 * two was the whole complaint. Placement is seeded, so the same board opens the same way
 * rather than reshuffling on a resize, exactly as the scenery does (terrain.ts).
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
export const INTRO_FROM = 0.66;
const FROM = INTRO_FROM;

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
 * THE ONE CURVE. Everything in the opening moves on it — the floor coming up and the
 * undergrowth opening out are one camera movement, so they cannot be on two curves. They
 * were, once: the floor eased out (fast, then settling) while the ring eased in (held, then
 * rushing), which read as two things happening rather than as one lens descending.
 *
 * Eased out ALL THE WAY: its speed is zero when it reaches the end, so the camera comes to
 * rest on the framing rather than arriving at it with speed left. There was a hair of
 * overshoot here once, meant to read as a lock, and it did the opposite — the bump was a
 * sine that returns to zero at the end, but its SLOPE at that moment is not zero, so the
 * last drawn frame was still moving and the next one, with the camera gone entirely, was
 * not. A jolt on the one frame the whole descent is aiming at.
 */
export const descent = (p: number): number => 1 - (1 - p) ** 3;

/** How big the floor is at this point in the descent. */
export function introScale(p: number): number {
  return FROM + (1 - FROM) * descent(p);
}

/**
 * How far along its exit a clump is, 0..1 — the SAME curve, so the ring opens in step with
 * the floor growing rather than against it.
 *
 * It moves rather than fading: a bush that dissolves says the picture is changing, a bush
 * that slides out of frame says the camera is coming down past it, which is the thing being
 * shown. The corners still hold the frame longest without any timing of their own, because
 * a clump leaving on a diagonal has further to go before it is out of the picture.
 */
export const surroundEase = descent;

/** A tiny deterministic generator. The engine's rng is off-limits to the renderer. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Bush {
  x: number; y: number; r: number; lobes: number; a: number; dark: boolean;
  /** Unit direction out of frame, and how far it has to go to be gone. */
  nx: number; ny: number; travel: number;
}

/**
 * Which way a clump leaves, and how far it has to go to be gone.
 *
 * Worked out ONCE, at placement, rather than pushed a fixed distance and hoped: the
 * surround stops being drawn the moment the camera lands, so anything still in frame at
 * that instant pops out of existence. Solving for the nearest edge means every clump is
 * genuinely outside the picture by then, and the stop is invisible.
 */
function exit(
  x: number, y: number, r: number, w: number, h: number,
): { nx: number; ny: number; travel: number } {
  const dx = x - w / 2, dy = y - h / 2;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len, ny = dy / len;
  const clear = r * 1.15;                          // the widest a clump is drawn from centre

  // Distance along (nx, ny) to put it past each edge it is heading for. The frame at the
  // end of the descent is exactly the canvas, so that is what it has to be outside of.
  const reach: number[] = [];
  if (nx > 0.01) reach.push((w + clear - x) / nx);
  if (nx < -0.01) reach.push((-clear - x) / nx);
  if (ny > 0.01) reach.push((h + clear - y) / ny);
  if (ny < -0.01) reach.push((-clear - y) / ny);

  return { nx, ny, travel: Math.max(0, Math.min(...reach, span2(w, h) * 2)) };
}

const span2 = (w: number, h: number): number => Math.max(w, h);

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
      const r = span * (0.10 + rand() * 0.13);
      out.push({
        x: at.x, y: at.y, r,
        lobes: 4 + Math.floor(rand() * 3),
        a: rand() * TAU,
        dark: rand() < 0.68,
        ...exit(at.x, at.y, r, w, h),
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
 * It gets out of the way by MOVING, not by fading: each clump slides straight out from the
 * middle of the board as the camera drops, so the ring opens and the playfield is clear by
 * the time the camera locks. What is at the corners can stay there — a corner is off the
 * playfield anyway, and something left in the frame reads as forest rather than as a
 * curtain that failed to close.
 */
export function drawSurround(
  ctx: CanvasRenderingContext2D, w: number, h: number, p: number,
): void {
  if (p >= 1) return;

  ctx.save();
  for (const b of bushesFor(w, h)) {
    // Straight out from the middle, on the camera's own curve: a clump on the rim leaves
    // across the nearest edge, one in a corner leaves diagonally — and a diagonal is the
    // longer way out, so the corners hold the frame longest without being timed to.
    const out = b.travel * surroundEase(p);
    const x = b.x + b.nx * out;
    const y = b.y + b.ny * out;

    // A shadow pooled under it, then the clump, then one lit crown — the same three-layer
    // build every raised thing on this board uses. Undergrowth in a forest is SHADED, so
    // the body is the dark green and the crown is a hint rather than a highlight.
    ctx.fillStyle = MAP.groundShade;
    blob(ctx, b, x, y + b.r * 0.16, b.r * 0.94);
    ctx.fillStyle = b.dark ? "#2b4720" : MAP.leafDark;
    blob(ctx, b, x, y, b.r);
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = MAP.leaf;
    blob(ctx, b, x, y - b.r * 0.20, b.r * 0.55);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** A clump: overlapping circles around a centre, so it reads as foliage and not a ball. */
function blob(
  ctx: CanvasRenderingContext2D, b: Bush, x: number, y: number, r: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < b.lobes; i++) {
    const a = b.a + (i / b.lobes) * TAU;
    ctx.moveTo(x + Math.cos(a) * r * 0.5 + r * 0.55, y + Math.sin(a) * r * 0.42);
    ctx.arc(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.42, r * 0.55, 0, TAU);
  }
  ctx.fill();
}
