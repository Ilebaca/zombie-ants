/**
 * The chapter road: the home screen as a stack of platforms, one per Trophy Road chapter.
 *
 * The road is already cut into chapters of 500 trophies (platform/road.ts). This is that
 * same ladder seen from the front: the chapter the player is in is the slab they are
 * standing on, the one behind it is the chapter they came from, and the one ahead floats
 * above with the trophy count that opens it. A dashed trail threads the ones that are
 * joined and stops at the gap in front of the one that is not — reaching the next chapter
 * is what closes it.
 *
 * WHY A CANVAS. The slabs are drawn in perspective: a top face that narrows as it recedes,
 * a front face under it, and a ragged underside where the soil breaks off. None of that is
 * a rectangle, so none of it is CSS. The things the player TAPS are DOM — the play button,
 * the chapter chip, the locked chip — positioned from the same geometry the canvas draws
 * with, so the two can never drift apart.
 *
 * Every chapter is forest floor for now. The theme is a table (`THEMES`) keyed by chapter,
 * so giving chapter 3 a swamp is a row of colours rather than a rewrite.
 */
import { ROAD_CHAPTER, chapterStanding } from "../platform";
import type { ChapterStanding } from "../platform";
import { el } from "./chrome";
import { icon } from "./icons";

/* ---------------------------------------------------------------------- THEME */

interface Theme {
  /** The top face: far edge, middle, near edge. Light falls off toward the viewer. */
  faceHigh: string;
  face: string;
  faceLow: string;
  /** The front wall of the slab, and the soil under it. */
  wall: string;
  soil: string;
  /** The rim where the top face meets the wall. */
  rim: string;
  /** Scenery. */
  rock: string;
  rockTop: string;
  leaf: string;
  leafDark: string;
  /** The trail across the slab. */
  trail: string;
}

const FOREST: Theme = {
  faceHigh: "#4e8040",
  face: "#3f6a35",
  faceLow: "#294821",
  wall: "#4a3a24",
  soil: "#33281a",
  rim: "#6fa257",
  rock: "#7c8574",
  rockTop: "#9aa48f",
  leaf: "#6cc25a",
  leafDark: "#3c7a33",
  trail: "#d8c68a",
};

/** Per-chapter looks. Everything falls back to the forest floor until a chapter has one. */
const THEMES: Record<number, Theme> = {};
const themeFor = (chapter: number): Theme => THEMES[chapter] ?? FOREST;

/* ------------------------------------------------------------------ GEOMETRY */

/**
 * One slab, in screen pixels.
 *
 * A slab is a trapezoid seen from slightly above: `topW` is narrower than `botW` because
 * the far edge is further away. `wall` is how much of the front face shows under it.
 */
interface Slab {
  cx: number;
  topY: number;
  botY: number;
  topW: number;
  botW: number;
  wall: number;
}

/** Half-width of the slab at a given y — everything on it is placed through this. */
const halfAt = (s: Slab, y: number): number => {
  const t = (y - s.topY) / Math.max(1, s.botY - s.topY);
  return (s.topW + (s.botW - s.topW) * Math.max(0, Math.min(1, t))) / 2;
};

/**
 * Where the three slabs sit.
 *
 * The numbers are proportions of the view, tuned against the sketch: the current chapter
 * fills the middle of the screen, the next one floats above it small enough to read as
 * further away, and the one behind is a sliver at the bottom that the trail runs into.
 */
function layout(w: number, h: number): { current: Slab; next: Slab; previous: Slab } {
  const cx = w / 2;
  return {
    // Measured off the sketch: the near edge is about a seventh wider than the far one,
    // over a depth a little taller than the slab is wide.
    current: { cx, topY: h * 0.335, botY: h * 0.905, topW: w * 0.64, botW: w * 0.88, wall: h * 0.075 },
    // The chapter ahead is far enough away to be seen almost edge-on, and it runs up
    // behind the top bar rather than floating clear of it — it is ground, not an island.
    next: { cx, topY: h * -0.02, botY: h * 0.245, topW: w * 0.56, botW: w * 0.62, wall: h * 0.055 },
    // The chapter behind is mostly off the bottom of the screen; only its far edge shows.
    previous: { cx, topY: h * 0.955, botY: h * 1.16, topW: w * 0.98, botW: w * 1.34, wall: h * 0.05 },
  };
}

/* ------------------------------------------------------------------- DRAWING */

const TAU = Math.PI * 2;

/** A tiny deterministic generator, so a chapter's scenery is the same every time it opens. */
function seeded(seed: number): () => number {
  let s = (seed | 0) * 2654435761 || 1;
  const next = (): number => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
  // Warm it up: from a small seed the first few values sit almost on top of each other,
  // which is exactly how every chapter ended up with the same two rocks.
  for (let i = 0; i < 8; i++) next();
  return next;
}

function slabPath(ctx: CanvasRenderingContext2D, s: Slab): void {
  ctx.beginPath();
  ctx.moveTo(s.cx - s.topW / 2, s.topY);
  ctx.lineTo(s.cx + s.topW / 2, s.topY);
  ctx.lineTo(s.cx + s.botW / 2, s.botY);
  ctx.lineTo(s.cx - s.botW / 2, s.botY);
  ctx.closePath();
}

/**
 * The soil under the slab: a ragged edge rather than a straight cut, because a straight
 * one reads as a box and the whole point is that it is a piece of ground torn out.
 */
function drawWall(ctx: CanvasRenderingContext2D, s: Slab, theme: Theme, rand: () => number): void {
  const left = s.cx - s.botW / 2;
  const right = s.cx + s.botW / 2;
  const teeth = Math.max(5, Math.round(s.botW / 46));

  ctx.beginPath();
  ctx.moveTo(left, s.botY);
  for (let i = 0; i <= teeth; i++) {
    const x = left + (right - left) * (i / teeth);
    const drop = s.wall * (0.55 + rand() * 0.75);
    ctx.lineTo(x, s.botY + drop);
  }
  ctx.lineTo(right, s.botY);
  ctx.closePath();
  ctx.fillStyle = theme.soil;
  ctx.fill();

  // The wall proper, between the rim and the soil.
  ctx.fillStyle = theme.wall;
  ctx.fillRect(left, s.botY - 1, right - left, s.wall * 0.55);
}

function drawSlab(
  ctx: CanvasRenderingContext2D, s: Slab, theme: Theme, seed: number, dim: number,
): void {
  const rand = seeded(seed);
  ctx.save();
  if (dim < 1) ctx.globalAlpha = dim;

  drawWall(ctx, s, theme, rand);

  // Light falls off toward the viewer, which is most of what makes the slab read as
  // tilted away rather than as a flat shape lying on the screen.
  const grad = ctx.createLinearGradient(0, s.topY, 0, s.botY);
  grad.addColorStop(0, theme.faceHigh);
  grad.addColorStop(0.55, theme.face);
  grad.addColorStop(1, theme.faceLow);
  slabPath(ctx, s);
  ctx.fillStyle = grad;
  ctx.fill();

  // The far edge catches the light — a thin line, not a band: anything wider reads as a
  // seam between two shapes rather than as the lip of one.
  ctx.beginPath();
  ctx.moveTo(s.cx - s.topW / 2, s.topY + 0.5);
  ctx.lineTo(s.cx + s.topW / 2, s.topY + 0.5);
  ctx.strokeStyle = theme.rim;
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha /= 0.55;

  scatter(ctx, s, theme, rand);
  ctx.restore();
}

/** Rocks, tufts and pebbles, kept off the middle where the trail and the buttons go. */
function scatter(ctx: CanvasRenderingContext2D, s: Slab, theme: Theme, rand: () => number): void {
  const depth = s.botY - s.topY;
  const count = Math.round(depth / 26);
  for (let i = 0; i < count; i++) {
    const t = 0.06 + rand() * 0.88;
    const y = s.topY + depth * t;
    const half = halfAt(s, y);
    // Out toward the edges: the centre lane belongs to the trail.
    const side = rand() < 0.5 ? -1 : 1;
    const x = s.cx + side * half * (0.34 + rand() * 0.58);
    // Things further away are drawn smaller, which is most of the perspective.
    const size = (16 + rand() * 26) * (0.42 + t * 0.85);
    const roll = rand();
    if (roll < 0.30) rock(ctx, x, y, size, theme, rand);
    else if (roll < 0.58) tuft(ctx, x, y, size * 0.9, theme, rand);
    else if (roll < 0.80) leaf(ctx, x, y, size, theme, rand);
    else pebble(ctx, x, y, size * 0.5, theme);
  }
}

function rock(
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, theme: Theme, rand: () => number,
): void {
  const w = s * (0.8 + rand() * 0.5), h = w * (0.6 + rand() * 0.25);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); ctx.ellipse(x, y + h * 0.34, w * 0.6, h * 0.28, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = theme.rock;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + h / 2);
  ctx.quadraticCurveTo(x - w * 0.42, y - h * 0.5, x, y - h / 2);
  ctx.quadraticCurveTo(x + w * 0.46, y - h * 0.42, x + w / 2, y + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = theme.rockTop;
  ctx.beginPath();
  ctx.ellipse(x - w * 0.08, y - h * 0.16, w * 0.26, h * 0.16, -0.2, 0, TAU);
  ctx.fill();
}

function tuft(
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, theme: Theme, rand: () => number,
): void {
  ctx.lineCap = "round";
  const blades = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < blades; i++) {
    const lean = (rand() - 0.5) * s * 0.9;
    ctx.strokeStyle = i % 2 ? theme.leaf : theme.leafDark;
    ctx.lineWidth = Math.max(1, s * 0.13);
    ctx.beginPath();
    ctx.moveTo(x + (rand() - 0.5) * s * 0.4, y);
    ctx.quadraticCurveTo(x + lean * 0.4, y - s * 0.5, x + lean, y - s * (0.6 + rand() * 0.5));
    ctx.stroke();
  }
}

/** A fallen leaf, lying flat on the ground: a pointed oval with a midrib. */
function leaf(
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, theme: Theme, rand: () => number,
): void {
  const len = s * (0.9 + rand() * 0.6);
  const wide = len * (0.42 + rand() * 0.16);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rand() - 0.5) * 2.4);
  ctx.fillStyle = rand() < 0.5 ? theme.leaf : theme.leafDark;
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(0, -wide / 2, len / 2, 0);
  ctx.quadraticCurveTo(0, wide / 2, -len / 2, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.22)";
  ctx.lineWidth = Math.max(1, len * 0.035);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  ctx.restore();
}

function pebble(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, theme: Theme): void {
  ctx.fillStyle = theme.rock;
  ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.32, 0, 0, TAU); ctx.fill();
}

/**
 * The trail across a slab: a wandering dashed line from its far edge to its near one.
 *
 * It is drawn in the slab's own space, so it narrows with the ground it is painted on —
 * a straight line down the middle read as a flagpole standing in front of the picture
 * rather than as a path lying on it.
 */
function trailPath(ctx: CanvasRenderingContext2D, s: Slab, sway: number): void {
  const depth = s.botY - s.topY;
  ctx.beginPath();
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = s.topY + depth * t;
    // Two gentle bends, wider apart as the ground comes toward the viewer.
    const x = s.cx + Math.sin((t + sway) * 4.1) * halfAt(s, y) * 0.30;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function dashes(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.setLineDash([width * 1.5, width * 2.2]);
}

function drawTrail(ctx: CanvasRenderingContext2D, s: Slab, theme: Theme, sway: number): void {
  ctx.save();
  ctx.strokeStyle = theme.trail;
  dashes(ctx, Math.max(2.5, s.botW * 0.013));
  trailPath(ctx, s, sway);
  ctx.stroke();
  ctx.restore();
}

/**
 * The join between two chapters, drawn in the gap between their slabs.
 *
 * `joined` is the whole mechanic: the chapter behind is linked to the one being played,
 * and the one ahead is NOT — the trail sets off toward it and stops in mid-air. Closing
 * that gap is what arriving at the next chapter looks like.
 */
function drawJoin(
  ctx: CanvasRenderingContext2D, from: Slab, to: Slab, theme: Theme, joined: boolean,
): void {
  const y0 = from.topY;
  const y1 = to.botY;
  if (y0 - y1 < 4) return;

  ctx.save();
  const reach = joined ? y0 - y1 : (y0 - y1) * 0.42;
  const grad = ctx.createLinearGradient(0, y0, 0, y0 - reach);
  grad.addColorStop(0, theme.trail);
  grad.addColorStop(1, joined ? theme.trail : "rgba(216,198,138,0)");
  ctx.strokeStyle = grad;
  dashes(ctx, Math.max(2, from.topW * 0.014));
  ctx.beginPath();
  ctx.moveTo(from.cx + Math.sin(4.1) * from.topW * 0.06, y0);
  ctx.lineTo(to.cx, y0 - reach);
  ctx.stroke();
  ctx.restore();
}

/* --------------------------------------------------------------------- SCREEN */

export interface ChapterRoadOptions {
  trophies: number;
  /** Start a match. */
  onPlay: () => void;
  /** Open the Trophy Road itself — the chapter chip is a way in. */
  onRoad: () => void;
}

/**
 * Build the chapter road. It measures itself and redraws on resize; in a context that
 * cannot draw (jsdom, a hidden tab) the canvas simply stays blank and every control still
 * works, which is the same rule the board follows.
 */
export function buildChapterRoad(opts: ChapterRoadOptions): HTMLElement {
  const root = el("div", "chaproad");
  const canvas = el("canvas", "chapcanvas");
  root.appendChild(canvas);

  const standing = chapterStanding(opts.trophies);

  // The chip on the platform ahead: what it costs to get there.
  const lock = el("button", "chaplock");
  lock.appendChild(icon("lock", 15));
  lock.append(el("span", undefined, standing.next
    ? `Unlocks at ${standing.next.from.toLocaleString()}`
    : "Road complete"));
  lock.appendChild(icon("trophy", 14));
  lock.onclick = opts.onRoad;
  lock.disabled = !standing.next;
  root.appendChild(lock);

  const stage = el("div", "chapstage");
  const name = el("button", "chapname");
  name.append(el("b", undefined, `Chapter ${standing.current.index}`), progressBar(standing));
  name.onclick = opts.onRoad;
  stage.appendChild(name);

  const play = el("button", "playbtn", "PLAY");
  play.id = "goPlay";
  play.onclick = opts.onPlay;
  stage.appendChild(play);
  root.appendChild(stage);

  const paint = (): void => draw(canvas, root, standing);
  requestAnimationFrame(paint);
  if (typeof ResizeObserver === "function") new ResizeObserver(paint).observe(root);
  else window.addEventListener("resize", paint);

  return root;
}

/** How far through the chapter the player is — the same number the Trophy Road shows. */
function progressBar(standing: ChapterStanding): HTMLElement {
  const wrap = el("span", "chapbar");
  const fill = el("i");
  fill.style.width = `${Math.round((standing.into / standing.span) * 100)}%`;
  wrap.appendChild(fill);
  const left = el("small", undefined, standing.next
    ? `${standing.toGo.toLocaleString()} to Chapter ${standing.next.index}`
    : "Every chapter cleared");
  const box = el("span", "chapprog");
  box.append(wrap, left);
  return box;
}

/**
 * Draw the three slabs, far to near, and place the controls on them.
 *
 * The DOM overlay is positioned from the SAME geometry, so the play button always sits on
 * the platform rather than near it.
 */
function draw(canvas: HTMLCanvasElement, root: HTMLElement, standing: ChapterStanding): void {
  const w = root.clientWidth;
  const h = root.clientHeight;
  // A zero measurement is a layout that has not happened yet, never a real size — writing
  // it to the canvas would pin it there (CLAUDE.md §5).
  if (w < 2 || h < 2) { requestAnimationFrame(() => draw(canvas, root, standing)); return; }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const slabs = layout(w, h);
  placeControls(root, slabs.current, slabs.next);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;                       // jsdom, or a tab that is not compositing
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Far to near: the next chapter is behind the current one, and the one behind the player
  // overlaps the bottom of it.
  if (standing.next) {
    drawSlab(ctx, slabs.next, themeFor(standing.next.index), standing.next.index * 977, 0.62);
  }
  const theme = themeFor(standing.current.index);
  drawSlab(ctx, slabs.current, theme, standing.current.index * 977, 1);
  drawTrail(ctx, slabs.current, theme, 0.15);
  // Toward the chapter ahead: it sets off and stops, because that one is not open yet.
  if (standing.next) drawJoin(ctx, slabs.current, slabs.next, theme, false);

  if (standing.previous) {
    drawSlab(ctx, slabs.previous, themeFor(standing.previous.index), standing.previous.index * 977, 1);
    drawTrail(ctx, slabs.previous, themeFor(standing.previous.index), 0.6);
    // The chapter behind IS joined: the trail crosses the gap and lands.
    drawJoin(ctx, slabs.previous, slabs.current, theme, true);
  }
}

/** Put the chip, the name and the play button where the platforms actually are. */
function placeControls(root: HTMLElement, current: Slab, next: Slab): void {
  const stage = root.querySelector<HTMLElement>(".chapstage");
  const lock = root.querySelector<HTMLElement>(".chaplock");
  if (stage) {
    // Low on the slab, where it is widest and the eye already is.
    const y = current.topY + (current.botY - current.topY) * 0.58;
    stage.style.top = `${Math.round(y)}px`;
    stage.style.left = `${Math.round(current.cx - halfAt(current, y) * 0.92)}px`;
    stage.style.width = `${Math.round(halfAt(current, y) * 1.84)}px`;
  }
  if (lock) {
    const y = next.topY + (next.botY - next.topY) * 0.55;
    lock.style.top = `${Math.round(y)}px`;
    lock.style.left = `${Math.round(next.cx)}px`;
  }
}

export const CHAPTER_SPAN = ROAD_CHAPTER;
