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
 * Both rows are CENTRED on the board: the enemy over its top edge, the player under its
 * bottom one. They used to be pushed out to the corner each base stands in — the player's
 * to the left, the enemy's to the right — on the argument that a label belongs to the
 * corner it is about. On a 9x9 board that reads as two labels flung to opposite ends of a
 * wide screen rather than as a pair, and which side is which is already said by the half
 * of the board the row sits on. Centred they line up with each other, and the board reads
 * as two players facing off across it.
 *
 * `rowsOf` is the geometry on its own, because the scenery needs it too: a fern or a fallen
 * log baked where the name goes reads as clutter over the text, so `terrain.ts` keeps those
 * exact boxes clear (and only those — everything else stays where it grew).
 */
import type { Player, SpeciesId } from "../engine";
import type { Layout } from "./layout";
import { antHead } from "./art";
import type { Look } from "../engine";
import { COL, lookCol, ownerCol } from "./palette";

/** One side's identity. Settled when the match starts and never written again. */
export interface Plate {
  name: string;
  colony: number;
  species: SpeciesId;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** One row, measured: where it goes and what goes in it. */
export interface PlateRow extends Rect {
  who: Player;
  plate: Plate;
  troops: string;
  font: number;
  icon: number;
  gap: number;
  nameW: number;
}

/** How far off the board's edge the row sits, as a share of a tile. */
const GAP = 0.42;

/**
 * Measure both rows. Needs a context because the width of a name is a font question, and
 * the answer decides both where the row starts and what the scenery has to leave alone.
 */
export function rowsOf(
  ctx: CanvasRenderingContext2D, layout: Layout,
  plates: Partial<Record<Player, Plate>>, size: (n: number) => string,
): PlateRow[] {
  const board = layout.ts * layout.size;
  const ts = layout.ts;
  const font = Math.max(11, Math.min(15, ts * 0.34));
  const icon = font * 1.5;
  const gap = font * 0.5;
  const rows: PlateRow[] = [];

  ctx.save();
  ctx.font = `900 ${font}px var(--font),sans-serif`;
  for (const who of ["ai", "you"] as const) {
    const plate = plates[who];
    if (!plate) continue;
    const troops = size(plate.colony);
    const nameW = ctx.measureText(plate.name).width;
    const w = icon + gap + nameW + gap + ctx.measureText(troops).width;
    // The enemy's nest is at the top of the board and the player's at the bottom, so each
    // row sits on the same side of the board as the base it names.
    const y = who === "ai"
      ? layout.oy - ts * GAP - icon
      : layout.oy + board + ts * GAP;
    // Centred on the BOARD, never on the canvas: the board is what the row is about, and
    // on a screen wider than the playfield the two would otherwise drift off its ends.
    const x = layout.ox + (board - w) / 2;
    rows.push({ who, plate, troops, font, icon, gap, nameW, x, y, w, h: icon });
  }
  ctx.restore();
  return rows;
}

/**
 * Draw both rows. `size` formats the colony the way the rest of the game writes it — passed
 * in rather than imported, because the renderer does not read the progression layer.
 */
export function drawPlates(
  ctx: CanvasRenderingContext2D, layout: Layout,
  plates: Partial<Record<Player, Plate>>, size: (n: number) => string,
  looks: Record<Player, Look>, alpha = 1,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  for (const row of rowsOf(ctx, layout, plates, size)) {
    const mid = row.y + row.icon / 2;
    ctx.font = `900 ${row.font}px var(--font),sans-serif`;
    // The head WEARS what that colony is wearing, and takes the skin's own colours with
    // it (engine/skins.ts) — otherwise the name beside a blue colony carries an orange
    // face, which is the one place on the board that would still be showing the species.
    const look = looks[row.who];
    antHead(ctx, row.x + row.icon / 2, mid, row.icon * 0.46, lookCol(row.plate.species, look), look);

    // The name reads in the page's own ink; the figure in that side's colour, which is the
    // colour its ground is drawn in — so the row belongs to the half of the board it is on.
    ctx.fillStyle = COL.ink || "#e8f0e4";
    ctx.fillText(row.plate.name, row.x + row.icon + row.gap, mid);
    ctx.fillStyle = ownerCol(row.who);
    ctx.fillText(row.troops, row.x + row.icon + row.gap + row.nameW + row.gap, mid);
  }
  ctx.restore();
}
