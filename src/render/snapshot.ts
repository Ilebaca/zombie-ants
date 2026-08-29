/**
 * A STILL OF THE BOARD, drawn by the board's own code.
 *
 * The manual (ui/rules.ts) explains the rules beside pictures of them, and a picture of a
 * game is only worth having if it cannot go stale. These are not screenshots: they are the
 * real `drawTile` over a real `GameState`, so a change to how a vein or a wild garrison is
 * drawn shows up in the manual on the same commit — and there is no image file to keep in
 * step with the game.
 *
 * One frame, no loop, no animation: everything is already landed, nothing is selected, and
 * the reveal is finished. The ground is the flat clearing rather than the baked scenery —
 * a fern in a figure two inches wide is noise, and the bake is sized for a whole screen.
 */
import type { Coord, GameState, Player } from "../engine";
import { Layout } from "./layout";
import {
  drawFillets, drawSelection, drawSurge, drawTile, drawTileBevels, drawTrails,
} from "./board";
import type { Scene } from "./board";
import { RevealTracker } from "./reveal";
import { MAP } from "./palette";
import { basicLook } from "./art";
import type { Look } from "./art";

export interface SnapshotOptions {
  /** Pixels per tile. The canvas is sized from this and the window. */
  tile?: number;
  looks?: Partial<Record<Player, Look>>;
  /**
   * The part of the board to show, in tiles. A figure is usually a corner of a position
   * rather than a whole map: the smallest board in the game is 7x7, and a 7x7 picture two
   * inches wide is mostly empty ground.
   */
  view?: { c: number; r: number; cols: number; rows: number };
  /** A tile shown as picked up, and the squares it may act on. */
  selection?: Coord | null;
  valid?: readonly Coord[];
}

/**
 * Draw `state` into `canvas`, sizing the canvas to fit the board exactly.
 *
 * Returns false when there is no 2D context — jsdom has none, and a screen must survive
 * that rather than throw (CLAUDE.md §6).
 */
export function drawSnapshot(
  canvas: HTMLCanvasElement, state: GameState, opts: SnapshotOptions = {},
): boolean {
  const ts = opts.tile ?? 34;
  const pad = Math.round(ts * 0.18);
  const view = opts.view ?? { c: 0, r: 0, cols: state.size, rows: state.size };
  const w = ts * view.cols + pad * 2;
  const h = ts * view.rows + pad * 2;

  const dpr = Math.min(typeof devicePixelRatio === "number" ? devicePixelRatio : 1, 2);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // The layout is built by hand rather than measured: a figure is exactly as big as its
  // window, so there is no container to fit into and nothing to centre in. The window is
  // just an ORIGIN — every tile is still drawn, and the ones outside land off the canvas,
  // which is what keeps a colony's edges (fillets, trails) correct at the crop.
  const layout = new Layout(state.size);
  layout.ts = ts;
  layout.ox = pad - view.c * ts;
  layout.oy = pad - view.r * ts;
  layout.width = w;
  layout.height = h;

  ctx.fillStyle = MAP.clearing;
  ctx.fillRect(0, 0, w, h);

  const scene: Scene = {
    ctx,
    layout,
    state,
    reveal: new RevealTracker(),
    looks: {
      you: opts.looks?.you ?? basicLook(state.species.you),
      ai: opts.looks?.ai ?? basicLook(state.species.ai),
    },
    hideCounts: false,
    flood: null,
    selection: opts.selection ?? null,
    valid: opts.valid ?? [],
    current: state.current,
  };

  // The same two passes the live board uses: every under-band first, then every face, so a
  // colony reads as one slab rather than a grid of separately-shadowed squares.
  drawTileBevels(scene);
  for (const row of state.grid) for (const t of row) drawTile(scene, t);
  drawFillets(scene);
  drawSurge(scene);
  drawTrails(scene);
  drawSelection(scene);
  return true;
}
