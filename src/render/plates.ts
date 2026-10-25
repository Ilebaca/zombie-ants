/**
 * WHO IS PLAYING, AND WHAT THEY HOLD — written on the ground at each edge of the board.
 *
 * The board had no players on it: the header counted two armies and called them "You" and
 * "Enemy", which is a scoreboard rather than an opponent — and the colony, the number the
 * whole game is played for (CLAUDE.md §8a), was on the menus only and never once in front
 * of the player while they were playing for it.
 *
 * It is drawn on the GROUND rather than laid out in a strip of chrome. A band above the
 * board and another below it is two more pieces of interface stacked on a screen that
 * already has a header, a turn bar and an action row; a name sitting on the soil beside a
 * nest belongs to the nest. No plate, no panel, no background — two words.
 *
 * Both rows are CENTRED on the board: the enemy over its top edge, the player under its
 * bottom one. They used to be pushed out to the corner each base stands in — the player's
 * to the left, the enemy's to the right — on the argument that a label belongs to the
 * corner it is about. On a 9x9 board that reads as two labels flung to opposite ends of a
 * wide screen rather than as a pair, and which side is which is already said by the half
 * of the board the row sits on. Centred they line up with each other, and the board reads
 * as two players facing off across it.
 *
 * THERE WAS A HEAD AT THE START OF EACH ROW and it is gone, asked for directly. It drew
 * the colony the side was fielding, wearing its skin — which is a third thing on a line
 * that is already a name and a number, on top of a painted plaque that is carrying marks
 * of its own now. What that head said is on the board itself in the colony's colour.
 *
 * `rowsOf` is the geometry on its own, because the scenery needs it too: a fern or a fallen
 * log baked where the name goes reads as clutter over the text, so `terrain.ts` keeps those
 * exact boxes clear (and only those — everything else stays where it grew).
 */
import type { GameState, Player } from "../engine";
import type { Layout } from "./layout";
import { COL, MAP } from "./palette";

/** One side's identity. Settled when the match starts and never written again. */
export interface Plate {
  name: string;
  colony: number;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** One row, measured: where it goes and what goes in it. */
export interface PlateRow extends Rect {
  who: Player;
  plate: Plate;
  troops: string;
  font: number;
  gap: number;
  nameW: number;
}

/**
 * HOW FAR OFF THE BOARD'S EDGE A ROW SITS, as a share of a tile — and it is a different
 * number at each edge, because the PLAQUE painted into every region's ground is.
 *
 * The plaque reaches about 0.44 tiles above the board's top edge and about 0.57 below its
 * bottom one (measured across the ten region files), and the name has to clear it: one
 * gap for both put the enemy's name half on top of the stone it sits above.
 */
const GAP = { ai: 0.58, you: 0.72 } as const;

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
  const gap = font * 0.5;
  const line = font * 1.5;
  const rows: PlateRow[] = [];

  ctx.save();
  ctx.font = `900 ${font}px var(--font),sans-serif`;
  for (const who of ["ai", "you"] as const) {
    const plate = plates[who];
    if (!plate) continue;
    const troops = size(plate.colony);
    const nameW = ctx.measureText(plate.name).width;
    const w = nameW + gap + ctx.measureText(troops).width;
    // The enemy's nest is at the top of the board and the player's at the bottom, so each
    // row sits on the same side of the board as the base it names.
    const y = who === "ai"
      ? layout.oy - ts * GAP.ai - line
      : layout.oy + board + ts * GAP.you;
    // Centred on the BOARD, never on the canvas: the board is what the row is about, and
    // on a screen wider than the playfield the two would otherwise drift off its ends.
    const x = layout.ox + (board - w) / 2;
    rows.push({ who, plate, troops, font, gap, nameW, x, y, w, h: line });
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
  alpha = 1,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  for (const row of rowsOf(ctx, layout, plates, size)) {
    const mid = row.y + row.h / 2;
    ctx.font = `900 ${row.font}px var(--font),sans-serif`;
    // THE NAME AND THE FIGURE ARE ONE LINE, so they are one colour — the page's own ink.
    // The figure used to be drawn in that side's colony colour, which made it read as a
    // second thing rather than as part of the name, and put a dark orange or blue number
    // on ground the picture chooses: the ink is what is legible on every region there is,
    // and which side the row belongs to is already said by the half of the board it sits on.
    ctx.fillStyle = COL.ink || "#e8f0e4";
    ctx.fillText(row.plate.name, row.x, mid);
    ctx.fillText(row.troops, row.x + row.nameW + row.gap, mid);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ THE SEAM COUNTER */

/**
 * THE FOUR SOCKETS ON THE PLAQUE COUNT THE SEAMS A SIDE HOLDS.
 *
 * Every region's ground has a stone plaque painted onto each edge of the board with four
 * empty diamond sockets cut into it. They are the only thing on the board that says who is
 * winning the resources — a seam pays three a turn where a plain stable pays one (§8), and
 * until now the only way to know was to find all four on the grid and read their colours.
 *
 * One socket lights, left to right, per seam that side holds; it goes dark again the
 * moment the tile is lost. FOUR, because the board has four of them — the number is the
 * ARTWORK's (the sockets are painted, not drawn), and `plates.test.ts` holds the map to
 * the same count so the two cannot drift.
 *
 * The geometry is measured off the region files themselves, in TILES from the board's own
 * edges, which is the one frame both the picture and the board agree on (§ THE PICTURE
 * CARRIES THE GRID): the picture is scaled until its painted cells are the board's, so a
 * pip placed in tiles lands on the painted socket on every screen and in every region.
 */
export const SOCKETS = 4;

/** Between two sockets' centres, in tiles. */
const SOCKET_STEP = 0.448;

/** A socket's half-diagonal, in tiles. */
const SOCKET_RAD = 0.157;

/**
 * How far beyond the board's own edge the sockets' centres sit, in tiles — and, like the
 * name rows above, it is not the same at both edges, because the plaques are not painted
 * at quite the same distance out.
 */
const SOCKET_OUT = { ai: 0.224, you: 0.372 } as const;

/** How many resource tiles a side holds — what the counter counts. */
export function seamsHeld(state: GameState, who: Player): number {
  let n = 0;
  for (const row of state.grid) {
    for (const t of row) if (t.terrain === "resource" && t.owner === who) n++;
  }
  return n;
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, rad: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - rad); ctx.lineTo(cx + rad, cy);
  ctx.lineTo(cx, cy + rad); ctx.lineTo(cx - rad, cy);
  ctx.closePath();
}

/**
 * Light each side's sockets.
 *
 * `painted` is whether the region's picture has LANDED (§ THE PICTURE CARRIES THE GRID).
 * On it the sockets are already cut into the stone and only the lit ones are drawn; on the
 * game's own drawn floor there is no plaque at all, so the empty ones are drawn too — four
 * pips with nothing behind them read as decoration rather than as a counter of four.
 */
export function drawSockets(
  ctx: CanvasRenderingContext2D, layout: Layout,
  held: Partial<Record<Player, number>>, painted: boolean, alpha = 1,
): void {
  if (alpha <= 0) return;
  const ts = layout.ts;
  const board = ts * layout.size;
  const mid = layout.ox + board / 2;
  const rad = ts * SOCKET_RAD;

  ctx.save();
  ctx.globalAlpha = alpha;
  for (const who of ["ai", "you"] as const) {
    const lit = held[who];
    if (lit === undefined) continue;
    const y = who === "ai"
      ? layout.oy - ts * SOCKET_OUT.ai
      : layout.oy + board + ts * SOCKET_OUT.you;
    for (let i = 0; i < SOCKETS; i++) {
      const x = mid + (i - (SOCKETS - 1) / 2) * SOCKET_STEP * ts;
      if (i < lit) {
        // The same cyan as the seam it is counting, with the glow the gem itself carries.
        ctx.save();
        ctx.shadowColor = MAP.gemTop;
        ctx.shadowBlur = ts * 0.22;
        ctx.fillStyle = MAP.gem;
        diamond(ctx, x, y, rad); ctx.fill();
        ctx.restore();
        ctx.fillStyle = MAP.gemTop;
        diamond(ctx, x, y - rad * 0.22, rad * 0.42); ctx.fill();
      } else if (!painted) {
        ctx.fillStyle = MAP.gemEdge;
        diamond(ctx, x, y, rad); ctx.fill();
      }
    }
  }
  ctx.restore();
}
