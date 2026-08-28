/**
 * WHO IS PLAYING, written on the forest floor.
 *
 * The board had no players on it: the header counted two armies and called them "You" and
 * "Enemy", which is a scoreboard rather than an opponent — and the colony, the number the
 * whole game is played for (CLAUDE.md §8a), was on the menus only and never once in front
 * of the player while they were playing for it.
 *
 * It is drawn on the GROUND rather than laid out in a strip of chrome. A band above the
 * board and another below it is two more pieces of interface stacked on a screen that
 * already has a header, a turn bar and an action row; a name sitting on the soil beside a
 * nest belongs to the nest. No plate, no panel, no background — a mark and two words.
 *
 * Each side is aligned to its OWN base: the player's nest is in the bottom-left corner, so
 * their name sits under the board's left edge; the enemy's is top-right, so theirs sits
 * over the board's right edge. Lined up with the tiles, not with the screen — the label is
 * about that corner of the board, and centring it would point at the middle instead.
 */
import type { Player, SpeciesId } from "../engine";
import type { Layout } from "./layout";
import { antHead, basicLook } from "./art";
import { COL, SPECIES_COL, ownerCol } from "./palette";

/** One side's identity. Settled when the match starts and never written again. */
export interface Plate {
  name: string;
  colony: number;
  species: SpeciesId;
}

/** How far off the board's edge the row sits, as a share of a tile. */
const GAP = 0.42;

/**
 * Draw both rows. `size` formats the colony the way the rest of the game writes it — passed
 * in rather than imported, because the renderer does not read the progression layer.
 */
export function drawPlates(
  ctx: CanvasRenderingContext2D, layout: Layout,
  plates: Partial<Record<Player, Plate>>, size: (n: number) => string,
  alpha = 1,
): void {
  if (alpha <= 0) return;
  const board = layout.ts * layout.size;
  const left = layout.ox;
  const right = layout.ox + board;
  const ts = layout.ts;
  const font = Math.max(11, Math.min(15, ts * 0.34));
  const icon = font * 1.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "middle";

  for (const who of ["ai", "you"] as const) {
    const plate = plates[who];
    if (!plate) continue;
    // The enemy's nest is at the top of the board and the player's at the bottom, so each
    // row sits on the same side of the board as the base it names.
    const y = who === "ai"
      ? layout.oy - ts * GAP - icon / 2
      : layout.oy + board + ts * GAP + icon / 2;

    ctx.font = `900 ${font}px var(--font),sans-serif`;
    const name = plate.name;
    const troops = size(plate.colony);
    const gap = font * 0.5;
    const wName = ctx.measureText(name).width;
    const wTroops = ctx.measureText(troops).width;
    const total = icon + gap + wName + gap + wTroops;

    // Aligned to the board's own edge — the corner the base is in, not the screen's middle.
    const x = who === "ai" ? right - total : left;

    const g = ctx;
    antHead(g, x + icon / 2, y, icon * 0.46, SPECIES_COL[plate.species], basicLook(plate.species));

    // The name reads in the page's own ink; the figure in that side's colour, which is the
    // colour its ground is drawn in — so the row belongs to the half of the board it is on.
    g.fillStyle = COL.ink || "#e8f0e4";
    g.textAlign = "left";
    g.fillText(name, x + icon + gap, y);
    g.fillStyle = ownerCol(who);
    g.fillText(troops, x + icon + gap + wName + gap, y);
  }
  ctx.restore();
}
