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
