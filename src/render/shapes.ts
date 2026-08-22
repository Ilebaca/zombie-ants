/**
 * Rounded-rectangle path helpers.
 *
 * The board's "one continuous colony" look comes from corner suppression: a corner is only
 * rounded where BOTH touching sides face a different owner. Same-owner neighbours therefore
 * fuse into a single blob instead of reading as a grid of separate lozenges.
 */
import { tileAt } from "../engine";
import type { GameState, Player, Tile } from "../engine";

export function rrect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Rounded rect with an independent radius per corner. A 0 corner stays square, so it fuses. */
export function rrectC(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  tl: number, tr: number, br: number, bl: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr); else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl); else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl); else ctx.lineTo(x, y);
  ctx.closePath();
}

/**
 * Captured = a tile that holds troops and produces (stable or nest).
 * Veins are trails, not captured, so they never fuse with solid territory.
 */
export function isCaptured(state: GameState, c: number, r: number, owner: Player | null): boolean {
  const t = tileAt(state, c, r);
  return !!(t && t.owner === owner && (t.struct === "stable" || t.struct === "nest"));
}

/** Per-corner radii for a captured cell, suppressed where a same-owner neighbour touches. */
export function capturedCorners(
  state: GameState, t: Tile, radius: number,
): [number, number, number, number] {
  const o = t.owner;
  const up = isCaptured(state, t.c, t.r - 1, o);
  const dn = isCaptured(state, t.c, t.r + 1, o);
  const lf = isCaptured(state, t.c - 1, t.r, o);
  const rt = isCaptured(state, t.c + 1, t.r, o);
  return [
    (!up && !lf) ? radius : 0,
    (!up && !rt) ? radius : 0,
    (!dn && !rt) ? radius : 0,
    (!dn && !lf) ? radius : 0,
  ];
}

/**
 * INNER CORNERS.
 *
 * `capturedCorners` suppresses a radius wherever a same-owner neighbour touches, which fuses
 * the cells — but it leaves the union with a SHARP reflex vertex wherever three cells meet
 * around an empty one. Rounding that vertex means adding a small fillet into the notch, not
 * cutting one out, so it cannot be expressed as a per-cell radius; it is its own little
 * shape drawn afterwards.
 *
 * Returns each such corner as the grid corner it sits on plus the quadrant the missing cell
 * lies in, so the caller can build the fillet in pixels.
 */
export interface InnerCorner { c: number; r: number; sx: -1 | 1; sy: -1 | 1 }

export function innerCorners(state: GameState, owner: Player): InnerCorner[] {
  const out: InnerCorner[] = [];
  for (let r = 1; r < state.size; r++) {
    for (let c = 1; c < state.size; c++) {
      // The four cells that meet at grid corner (c, r), and where each one sits from it.
      const quad = [
        { c: c - 1, r: r - 1, sx: -1 as const, sy: -1 as const },
        { c, r: r - 1, sx: 1 as const, sy: -1 as const },
        { c: c - 1, r, sx: -1 as const, sy: 1 as const },
        { c, r, sx: 1 as const, sy: 1 as const },
      ];
      const gap = quad.filter((q) => !isCaptured(state, q.c, q.r, owner));
      if (gap.length !== 1) continue;

      // Only fillet into open ground: filling into the enemy's cell, a vein or a rock would
      // paint over something that is drawn there.
      const hole = tileAt(state, (gap[0] as InnerCorner).c, (gap[0] as InnerCorner).r);
      if (!hole || hole.owner || hole.terrain === "blocked") continue;
      out.push({ c, r, sx: (gap[0] as InnerCorner).sx, sy: (gap[0] as InnerCorner).sy });
    }
  }
  return out;
}

/**
 * The curved triangle that fills a reflex corner: two straight sides meeting at the corner
 * and an arc swept back TOWARD it, so the notch reads as a smooth fillet rather than a
 * quarter-disc bump stuck on the outside of it.
 */
export function filletPath(
  ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number, radius: number,
): void {
  // Centre of the arc sits in the empty cell, one radius away along both axes.
  const cx = x + sx * radius, cy = y + sy * radius;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + sx * radius, y);
  ctx.arc(cx, cy, radius, Math.atan2(-sy, 0), Math.atan2(0, -sx), sx * sy > 0);
  ctx.closePath();
}
