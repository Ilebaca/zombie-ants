/**
 * THE ANTS.
 *
 * A constant line of short dashes travelling around the outside of everything a colony
 * holds — tiles and veins alike. It is the only always-moving thing on the board, and it
 * is what makes a colony read as a living thing rather than a shape.
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

const owns = (t: Tile | undefined, p: Player): boolean => t?.owner === p;

/**
 * Trace the boundary of `p`'s territory into closed loops of grid corners.
 *
 * Every tile contributes the sides that face something else, wound clockwise around the
 * tile. Wound consistently, those edges join end-to-end into loops with no bookkeeping
 * beyond a map from each edge's start corner to its end.
 */
export function territoryLoops(state: GameState, p: Player): Corner[][] {
  const edges = new Map<string, Corner[]>();
  const at = (c: number, r: number): Tile | undefined => state.grid[r]?.[c];

  for (const row of state.grid) {
    for (const t of row) {
      if (t.owner !== p) continue;
      const { c, r } = t;
      if (!owns(at(c, r - 1), p)) addEdge(edges, { c, r }, { c: c + 1, r });
      if (!owns(at(c + 1, r), p)) addEdge(edges, { c: c + 1, r }, { c: c + 1, r: r + 1 });
      if (!owns(at(c, r + 1), p)) addEdge(edges, { c: c + 1, r: r + 1 }, { c, r: r + 1 });
      if (!owns(at(c - 1, r), p)) addEdge(edges, { c, r: r + 1 }, { c, r });
    }
  }

  const loops: Corner[][] = [];
  while (edges.size) {
    const startKey = edges.keys().next().value as string;
    const loop: Corner[] = [];
    let cur = startKey;
    // Walk forward until the trail runs out or comes back on itself.
    while (edges.has(cur)) {
      const outs = edges.get(cur) as Corner[];
      const next = outs.pop() as Corner;
      if (!outs.length) edges.delete(cur);
      loop.push(next);
      cur = key(next.c, next.r);
      if (cur === startKey) break;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

function addEdge(edges: Map<string, Corner[]>, from: Corner, to: Corner): void {
  const k = key(from.c, from.r);
  const list = edges.get(k);
  if (list) list.push(to); else edges.set(k, [to]);
}

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
  const dash = ts * DASH, gap = ts * GAP;
  const radius = Math.min(ts * 0.26, ts / 2);

  ctx.save();
  ctx.setLineDash([dash, gap]);
  // Negative, so the dashes travel forward along the winding rather than backwards.
  ctx.lineDashOffset = -(((now / 1000) * SPEED * ts + style.phase * ts) % (dash + gap));
  ctx.strokeStyle = style.colour;
  ctx.lineWidth = style.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const loop of loops) {
    const pts = loop.map((p) => ({ x: layout.ox + p.c * ts, y: layout.oy + p.r * ts }));
    ctx.beginPath();
    roundedLoop(ctx, pts, radius);
    ctx.stroke();
  }
  ctx.restore();
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
