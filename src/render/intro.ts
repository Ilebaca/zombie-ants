/**
 * THE OPENING: the camera comes down through the canopy.
 *
 * A match used to begin with the board simply being there. It starts above the trees now:
 * leaves rush past at three depths as the camera drops between them, the forest floor grows
 * up to meet it and locks, and only then do the two colonies fill in from their nests.
 *
 * Like the finale (flood.ts) this is a VIEW and nothing else. The board it descends onto is
 * the board the engine already built — the camera is one transform around the frame, and
 * the canopy is drawn over the top of it. Nothing here can change a tile (CLAUDE.md §3).
 *
 * The layers are what sells it. One sheet of leaves scaling up reads as a texture being
 * zoomed; three at different rates read as depth, because that difference is the only cue
 * a flat canvas has for "between". Each is seeded, so the same board opens the same way
 * rather than reshuffling on a resize, exactly as the scenery does (terrain.ts).
 */
import { MAP } from "./palette";

const TAU = 6.283185307;

/** The descent: above the canopy to locked on the map. */
export const INTRO_MS = 1400;

/**
 * ...and then the colonies fill in from their nests.
 *
 * Long enough for the reveal to run its front out to the far corner of a starting
 * formation, which is what makes the opening read as the colony ARRIVING rather than
 * as five tiles that were already there.
 */
export const INTRO_FILL_MS = 820;

/** How far above the floor the camera starts, as a share of the final framing. */
const FROM = 0.58;

/**
 * One sheet of leaves, and how fast it rushes past.
 *
 * `rush` is where the layer has grown to by the time the camera lands: the nearest sheet
 * blows past the edges of the screen early, the furthest is still only twice its size at
 * the end. `until` is when it has gone; `tone` is how much of the light it still catches —
 * a leaf ABOVE the camera is backlit, so the closer it is the darker it reads.
 */
interface Sheet {
  rush: number;
  until: number;
  tone: number;
  leaves: number;
}

const SHEETS: readonly Sheet[] = [
  { rush: 9.0, until: 0.42, tone: 0.30, leaves: 7 },
  { rush: 4.2, until: 0.70, tone: 0.58, leaves: 11 },
  { rush: 2.1, until: 1.00, tone: 1.00, leaves: 16 },
];

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

/** Everything the caller has to wait for: down through the trees, then the colonies. */
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

interface Blade { x: number; y: number; r: number; a: number; dark: boolean }

/** Leaves are placed once per screen size, not per frame. */
let cached: { key: string; sheets: Blade[][] } | null = null;

function sheetsFor(w: number, h: number): Blade[][] {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (cached && cached.key === key) return cached.sheets;
  const rand = seeded(0x5eed1eaf);
  const span = Math.max(w, h);
  const sheets = SHEETS.map((sheet) => {
    const out: Blade[] = [];
    for (let i = 0; i < sheet.leaves; i++) {
      out.push({
        // Spread beyond the frame: a sheet that only covers the middle parts like a
        // curtain instead of opening around the camera.
        x: w / 2 + (rand() - 0.5) * w * 1.5,
        y: h / 2 + (rand() - 0.5) * h * 1.5,
        r: span * (0.07 + rand() * 0.11),
        a: rand() * TAU,
        dark: rand() < 0.42,
      });
    }
    return out;
  });
  cached = { key, sheets };
  return sheets;
}

/** Drop the cached canopy — used by tests. */
export function resetCanopy(): void { cached = null; }

/**
 * The canopy, over everything: it is between the camera and the floor.
 *
 * Each sheet grows from its own middle outward, which is what a camera moving straight down
 * through it does. They are drawn far-first so the nearest is on top right up to the moment
 * it clears the frame.
 */
export function drawCanopy(
  ctx: CanvasRenderingContext2D, w: number, h: number, p: number,
): void {
  if (p >= 1) return;
  const sheets = sheetsFor(w, h);

  // Under the trees is shade. It lifts as the last leaves clear, so the board arrives at
  // its own colours rather than at a tinted version of them — and once it is down to
  // nothing it stops being drawn, rather than costing a full-screen fill for no ink.
  const shadeA = (1 - p) ** 2 * 0.55;
  if (shadeA > 0.01) {
    ctx.save();
    ctx.globalAlpha = shadeA;
    ctx.fillStyle = "#0b1a0d";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  for (let i = SHEETS.length - 1; i >= 0; i--) {
    const sheet = SHEETS[i] as Sheet;
    if (p >= sheet.until) continue;
    const t = p / sheet.until;                       // this sheet's own 0..1
    const scale = 1 + (sheet.rush - 1) * t * t;      // accelerating toward the lens
    const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    for (const b of sheets[i] as Blade[]) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.fillStyle = shade(b.dark ? MAP.leafDark : MAP.leaf, sheet.tone);
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r, b.r * 0.42, 0, 0, TAU);
      ctx.fill();
      // The midrib, so a blob reads as a leaf.
      ctx.strokeStyle = shade(MAP.leafDark, sheet.tone * 0.8);
      ctx.lineWidth = Math.max(1, b.r * 0.045);
      ctx.beginPath();
      ctx.moveTo(-b.r, 0);
      ctx.lineTo(b.r, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** Mix a hex colour toward black. A leaf between the camera and the sun is a silhouette. */
function shade(hex: string, tone: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1] as string, 16);
  const f = Math.max(0, Math.min(1, tone));
  return `rgb(${Math.round(((v >> 16) & 255) * f)},`
    + `${Math.round(((v >> 8) & 255) * f)},${Math.round((v & 255) * f)})`;
}
