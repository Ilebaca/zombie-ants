/**
 * THE FINALE: the winner takes the whole board.
 *
 * A match used to end on a popup over a board frozen mid-position — the last thing the
 * player saw was the fight they were in, and then a card told them it was over. The colony
 * that won now spreads out from its nest and consumes everything: enemy ground, veins, wild
 * garrisons, the resource seams and the Hive herself, all of it going over to one colour
 * before the card comes up.
 *
 * It is a VIEW, not a move. The engine is untouched — the result card still reports the
 * armies and the ground as they actually stood when the queen fell, which is what the
 * player was playing for. Drawing over the board cannot change it (CLAUDE.md §3), so this
 * is the only place the finale can live.
 *
 * EVERYTHING goes under it, rocks included. A wash that stopped at the boulders left four
 * grey holes in the finished board, which read as the colour failing to paint rather than
 * as a colony overrunning the map.
 *
 * The counts are the one thing that does not wait its turn: they go the moment the finale
 * starts (`hideCounts`) rather than being covered tile by tile, because the board falling
 * quiet is the first sign the player gets that it is over.
 */
import { key, nestTile } from "../engine";
import type { GameState, Player } from "../engine";

/**
 * How fast the front crosses the board, in tiles per second.
 *
 * The same idea as the Hive's surge (board.ts) and the reveal: a constant tiles-per-second
 * front, so a 7×7 skirmish and a 13×13 gauntlet look the same rather than one crawling and
 * the other streaking. The clamps below keep the whole thing inside a beat the player will
 * sit through — nobody wants three seconds of animation between them and the result.
 */
export const FLOOD_TILES_PER_SEC = 11;
export const FLOOD_MIN_MS = 850;
export const FLOOD_MAX_MS = 1700;

/** The finished board is held for a moment before the card, or the wave has no landing. */
export const FLOOD_HOLD_MS = 420;

export interface Flood {
  owner: Player;
  /** Distance in tiles from the winner's nest, per cell. */
  rings: Map<string, number>;
  /** Rings the front has to cross: the furthest ring, plus one for it to finish filling. */
  span: number;
  start: number;
  dur: number;
}

/**
 * Plan the wash. `instant` collapses it for reduced motion — the end state without the
 * travel, since the point of the setting is that nothing moves.
 */
export function planFlood(
  state: GameState, owner: Player, now: number, instant = false,
): Flood {
  // The winner's own nest. If they won BY taking the enemy's, either nest is theirs and
  // either is a fair place for it to start from; `nestTile` returns one of them.
  const home = nestTile(state, owner);
  const origin = home ?? { c: (state.size - 1) / 2, r: (state.size - 1) / 2 };

  const rings = new Map<string, number>();
  let furthest = 0;
  for (const row of state.grid) {
    for (const t of row) {
      const d = Math.abs(t.c - origin.c) + Math.abs(t.r - origin.r);
      rings.set(key(t.c, t.r), d);
      if (d > furthest) furthest = d;
    }
  }

  const span = furthest + 1;
  const dur = instant
    ? 1
    : Math.min(FLOOD_MAX_MS, Math.max(FLOOD_MIN_MS, (span / FLOOD_TILES_PER_SEC) * 1000));
  return { owner, rings, span, start: now, dur };
}

/**
 * How far a cell has been consumed, 0..1.
 *
 * The front is at `progress × span` rings out; a cell fills over the one ring-time after
 * the front reaches it.
 */
export function floodAt(flood: Flood, c: number, r: number, now: number): number {
  const ring = flood.rings.get(key(c, r));
  if (ring === undefined) return 0;
  const p = Math.min(1, Math.max(0, (now - flood.start) / flood.dur));
  const d = p * flood.span - ring;
  return d <= 0 ? 0 : (d >= 1 ? 1 : d);
}

/** Total time from the start of the wash to the result card. */
export const floodDuration = (flood: Flood): number => flood.dur + FLOOD_HOLD_MS;

/**
 * How much of the colonies' own chrome is still showing, 1..0.
 *
 * The marching-ants outlines belong to two colonies that are being erased, and a dashed
 * border half a pixel outside a flooded cell is exactly the sort of leftover that reads as
 * a bug. They dissolve over the first part of the wash rather than vanishing on the frame
 * the match ends, which would pop.
 */
export function floodFade(flood: Flood, now: number): number {
  const p = Math.min(1, Math.max(0, (now - flood.start) / (flood.dur * 0.35)));
  return 1 - p;
}
