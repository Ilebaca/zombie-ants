/**
 * THE ANTS.
 *
 * A constant line of short dashes travelling around the outside of everything a colony
 * holds. It is the only always-moving thing on the board, and it is what makes a colony
 * read as a living thing rather than a shape.
 *
 * Solid territory and veins are traced differently on purpose. Territory is a filled area,
 * so the ants walk its OUTLINE. A vein is already drawn as a line down the middle of its
 * tile, so the ants walk that line — outlining a one-tile-wide trail on both sides turns a
 * line into a tube, and the two dashed sides march against each other.
 *
 * The dashes have to FLOW, which is why this bothers to trace real closed loops instead of
 * stroking each boundary edge on its own. Separate edges each start their dash pattern
 * afresh, so the marks sit still at every corner and march in contradictory directions
 * around the shape; one continuous path carries a single offset the whole way round.
 *
 * Holes come out of the same trace for free — a lake of enemy ground inside your territory
 * is a loop wound the other way, and it gets its own ring of ants.
 */
import { key } from "../engine";
import type { GameState, Player, Tile } from "../engine";
import type { Layout } from "./layout";

/** A corner of the grid, in tile units — (0,0) is the top-left corner of tile (0,0). */
interface Corner { c: number; r: number }

/** How long a dash and its gap are, relative to a tile. */
const DASH = 0.30;
const GAP = 0.26;
/** Tiles per second the ants travel. Slow enough to read, quick enough to look alive. */
const SPEED = 0.9;
/**
 * Corner radius, in tiles. The same number rounds the cell fill (`shapes.ts`), so the ants
 * follow the shape they are walking round instead of cutting across its corners.
 */
const CORNER = 0.20;

/**
 * Ground the ants have actually reached.
 *
 * The engine hands a tile over the instant the move resolves, but it fills in over the next
 * quarter-second (render/reveal.ts). Tracing the outline off the engine alone therefore
 * snapped the whole boundary out to the far end of a long send before the troops had
 * crossed a single tile. The renderer passes its reveal state in, so the outline extends in
 * step with the fill — one tile at a time, toward the destination.
 */
export type Settled = (c: number, r: number) => boolean;
const ALWAYS: Settled = () => true;

/**
 * Only SOLID territory contributes to the outline. Veins get their own line down the middle
 * of the tile (see `veinTrails`), because a trail one tile wide outlined on both sides reads
 * as a tube rather than as a line.
 */
const owns = (t: Tile | undefined, p: Player, done: Settled): boolean =>
  t?.owner === p && t.struct !== "vein" && done(t.c, t.r);

/** Does `t` link a vein at (c, r) — same owner and part of the colony, vein or solid? */
const links = (state: GameState, p: Player, c: number, r: number, done: Settled): boolean => {
  const t = state.grid[r]?.[c];
  return !!t && t.owner === p && done(c, r)
    && (t.struct === "vein" || t.struct === "stable" || t.struct === "nest");
};

/**
 * Trace the boundary of `p`'s territory into closed loops of grid corners.
 *
 * Every tile contributes the sides that face something else, wound clockwise around the
 * tile. Wound consistently, those edges join end-to-end into loops with no bookkeeping
 * beyond a map from each edge's start corner to its end.
 */
export function territoryLoops(state: GameState, p: Player, done: Settled = ALWAYS): Corner[][] {
  const edges = new Map<string, Corner[]>();
  const at = (c: number, r: number): Tile | undefined => state.grid[r]?.[c];

  for (const row of state.grid) {
    for (const t of row) {
      if (!owns(t, p, done)) continue;
      const { c, r } = t;
      if (!owns(at(c, r - 1), p, done)) addEdge(edges, { c, r }, { c: c + 1, r });
      if (!owns(at(c + 1, r), p, done)) addEdge(edges, { c: c + 1, r }, { c: c + 1, r: r + 1 });
      if (!owns(at(c, r + 1), p, done)) addEdge(edges, { c: c + 1, r: r + 1 }, { c, r: r + 1 });
      if (!owns(at(c - 1, r), p, done)) addEdge(edges, { c, r: r + 1 }, { c, r });
    }
  }

  const loops: Corner[][] = [];
  while (edges.size) {
    const startKey = edges.keys().next().value as string;
    const loop: Corner[] = [];
    let cur = startKey;
    let from = cornerOf(startKey);
    let dir: Corner | null = null;
    // Walk forward until the trail runs out or comes back on itself.
    while (edges.has(cur)) {
      const outs = edges.get(cur) as Corner[];
      const next = outs.splice(pickTurn(outs, from, dir), 1)[0] as Corner;
      if (!outs.length) edges.delete(cur);
      loop.push(next);
      dir = step(from, next);
      from = next;
      cur = key(next.c, next.r);
      if (cur === startKey) break;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

/**
 * Which way to go at a corner where two cells meet only DIAGONALLY.
 *
 * Four edges arrive at that one point and either pairing joins up, so a naive walk fuses
 * the two cells into a single figure-eight loop and the dashes run between them as if they
 * were connected. They are not: a corner touch is not a shared edge, and two cells that
 * only kiss should each get their own unbroken ring.
 *
 * Taking the sharpest RIGHT turn always keeps them apart, because the whole trace is wound
 * clockwise per cell — following the turn the winding is already making stays inside the
 * cell being walked. Everywhere else there is only one edge to take, so the rule costs
 * nothing.
 */
function pickTurn(outs: readonly Corner[], from: Corner, dir: Corner | null): number {
  if (outs.length < 2 || !dir) return outs.length - 1;
  const right = { c: -dir.r, r: dir.c };
  const i = outs.findIndex((o) => sameDir(step(from, o), right));
  return i >= 0 ? i : outs.length - 1;
}

function addEdge(edges: Map<string, Corner[]>, from: Corner, to: Corner): void {
  const k = key(from.c, from.r);
  const list = edges.get(k);
  if (list) list.push(to); else edges.set(k, [to]);
}

/**
 * The middle of each vein, chained into as few polylines as possible.
 *
 * The vein bar runs from the centre of the tile out to the edge it shares with each thing
 * it links, so the spine is those half-tile segments joined end to end: consecutive veins
 * meet exactly on the shared edge midpoint, and a vein touching solid ground stops on that
 * tile's outline, where the territory dashes take over.
 *
 * Chained rather than stroked segment by segment for the same reason the outline is traced
 * into loops — one path carries one dash offset, so the marks flow instead of restarting at
 * every tile boundary.
 */
export function veinTrails(state: GameState, p: Player, done: Settled = ALWAYS): Corner[][] {
  const adj = new Map<string, Corner[]>();
  const at = (n: Corner): string => `${Math.round(n.c * 2)},${Math.round(n.r * 2)}`;
  const join = (a: Corner, b: Corner): void => {
    addTo(adj, at(a), b);
    addTo(adj, at(b), a);
  };

  for (const row of state.grid) {
    for (const t of row) {
      if (t.owner !== p || t.struct !== "vein" || !done(t.c, t.r)) continue;
      const hub: Corner = { c: t.c + 0.5, r: t.r + 0.5 };
      const arms: Array<[boolean, Corner]> = [
        [links(state, p, t.c - 1, t.r, done), { c: t.c, r: t.r + 0.5 }],
        [links(state, p, t.c + 1, t.r, done), { c: t.c + 1, r: t.r + 0.5 }],
        [links(state, p, t.c, t.r - 1, done), { c: t.c + 0.5, r: t.r }],
        [links(state, p, t.c, t.r + 1, done), { c: t.c + 0.5, r: t.r + 1 }],
      ];
      let any = false;
      for (const [linked, port] of arms) if (linked) { join(hub, port); any = true; }
      // A vein still filling in has nothing to link to yet; the tile draws a bar across it,
      // so the ants get the same bar rather than nothing at all.
      if (!any) {
        join({ c: t.c, r: t.r + 0.5 }, hub);
        join(hub, { c: t.c + 1, r: t.r + 0.5 });
      }
    }
  }

  const paths: Corner[][] = [];

  // Start at loose ends first, so a plain trail comes out as ONE path end to end rather than
  // as two halves meeting wherever the scan happened to begin.
  const ends = [...adj.entries()].filter(([, o]) => o.length === 1).map(([k]) => k);
  const starts = [...ends, ...adj.keys()];

  for (const startKey of starts) {
    while ((adj.get(startKey) ?? []).length) {
      const path: Corner[] = [halfNodeOf(startKey)];
      let cur = path[0] as Corner;
      let dir: Corner | null = null;
      for (;;) {
        const outs = adj.get(at(cur));
        if (!outs || !outs.length) break;
        // Carry straight on through a junction where possible: a T is two lines crossing,
        // not a hairpin, and only a genuine elbow should get a rounded corner.
        let pick = 0;
        if (dir) {
          const ahead = outs.findIndex((o) => sameDir(step(cur, o), dir as Corner));
          if (ahead >= 0) pick = ahead;
        }
        const next = outs.splice(pick, 1)[0] as Corner;
        drop(adj, at(next), cur, at);
        if (!outs.length) adj.delete(at(cur));
        dir = step(cur, next);
        path.push(next);
        cur = next;
      }
      if (path.length > 1) paths.push(path);
    }
  }
  return paths;
}

function addTo(m: Map<string, Corner[]>, k: string, v: Corner): void {
  const list = m.get(k);
  if (list) list.push(v); else m.set(k, [v]);
}

function drop(
  m: Map<string, Corner[]>, k: string, v: Corner, at: (n: Corner) => string,
): void {
  const list = m.get(k);
  if (!list) return;
  const i = list.findIndex((o) => at(o) === at(v));
  if (i >= 0) list.splice(i, 1);
  if (!list.length) m.delete(k);
}

/** A grid corner back out of its key. */
const cornerOf = (k: string): Corner => {
  const [a, b] = k.split(",");
  return { c: Number(a), r: Number(b) };
};

/** A vein-spine node back out of its key — those are stored doubled, on a half-tile lattice. */
const halfNodeOf = (k: string): Corner => {
  const [a, b] = k.split(",");
  return { c: Number(a) / 2, r: Number(b) / 2 };
};

const step = (a: Corner, b: Corner): Corner => ({ c: Math.sign(b.c - a.c), r: Math.sign(b.r - a.r) });
const sameDir = (a: Corner, b: Corner): boolean => a.c === b.c && a.r === b.r;

export interface TrailStyle {
  colour: string;
  /** Line width in pixels. */
  width: number;
  /** Seconds, so two colonies' ants are not in lockstep. */
  phase: number;
}

/**
 * Stroke one colony's boundary as a marching dashed line.
 *
 * The path is inset by half a line width so the ants walk just inside the territory rather
 * than straddling the edge of it, and corners are rounded with `arcTo` — square corners on
 * a dashed line read as a selection marquee from a drawing program, which is the one thing
 * this must not look like.
 */
export function drawTrail(
  ctx: CanvasRenderingContext2D, layout: Layout, loops: Corner[][], style: TrailStyle, now: number,
): void {
  if (!loops.length) return;
  const ts = layout.ts;
  const radius = ts * CORNER;

  beginDashes(ctx, layout, style, now);
  for (const loop of loops) {
    const pts = loop.map((p) => ({ x: layout.ox + p.c * ts, y: layout.oy + p.r * ts }));
    ctx.beginPath();
    roundedLoop(ctx, pts, radius);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Stroke the vein spines as marching dashes ON TOP of the bar the tile already draws.
 *
 * Open paths, not loops: a trail has two ends. An elbow inside a single tile is rounded the
 * same way a colony's corner is — the bar underneath turns square, and the dashes rounding
 * it is what stops the join reading as a mitred pipe.
 */
export function drawVeinTrail(
  ctx: CanvasRenderingContext2D, layout: Layout, paths: Corner[][], style: TrailStyle, now: number,
): void {
  if (!paths.length) return;
  const ts = layout.ts;
  const radius = ts * CORNER;

  beginDashes(ctx, layout, style, now);
  for (const path of paths) {
    const pts = path.map((p) => ({ x: layout.ox + p.c * ts, y: layout.oy + p.r * ts }));
    const n = pts.length;
    if (n < 2) continue;
    ctx.beginPath();
    ctx.moveTo((pts[0] as { x: number }).x, (pts[0] as { y: number }).y);
    for (let i = 1; i < n - 1; i++) {
      const k = pts[i] as { x: number; y: number };
      const next = pts[i + 1] as { x: number; y: number };
      ctx.arcTo(k.x, k.y, next.x, next.y, radius);
    }
    const last = pts[n - 1] as { x: number; y: number };
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Shared dash state, so the outline and the vein spines march at exactly the same rate. */
function beginDashes(
  ctx: CanvasRenderingContext2D, layout: Layout, style: TrailStyle, now: number,
): void {
  const ts = layout.ts;
  const dash = ts * DASH, gap = ts * GAP;
  ctx.save();
  ctx.setLineDash([dash, gap]);
  // Negative, so the dashes travel forward along the winding rather than backwards.
  ctx.lineDashOffset = -(((now / 1000) * SPEED * ts + style.phase * ts) % (dash + gap));
  ctx.strokeStyle = style.colour;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/** A closed path through `pts` with every corner rounded off. */
function roundedLoop(
  ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>, radius: number,
): void {
  const n = pts.length;
  if (n < 3) return;
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Start half-way along the last edge, so the first corner is rounded like the rest.
  const first = mid(pts[n - 1] as { x: number; y: number }, pts[0] as { x: number; y: number });
  ctx.moveTo(first.x, first.y);
  for (let i = 0; i < n; i++) {
    const corner = pts[i] as { x: number; y: number };
    const after = pts[(i + 1) % n] as { x: number; y: number };
    const end = mid(corner, after);
    ctx.arcTo(corner.x, corner.y, end.x, end.y, radius);
  }
  ctx.closePath();
}
