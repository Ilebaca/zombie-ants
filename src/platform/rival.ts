/**
 * THE OPPONENT ACROSS THE BOARD.
 *
 * There is no server yet (roadmap — async PvP comes later), so the colony the player is
 * playing against is generated rather than fetched. It is here, in one place, because two
 * screens show it: the match's nameplate above the board and the Leaderboard's table.
 *
 * A rival is drawn NEAR the player's own colony, because that is what a ranked ladder
 * would serve them — a match against someone of about their own size. The spread is wide
 * enough that the number changes match to match and narrow enough that it never reads as
 * a mismatch. When the server exists this file swaps its source and nothing else moves.
 */

/** One pool of names, shared by the nameplate and the ladder, so the world is consistent. */
export const RIVAL_NAMES = [
  "Mandible", "Pheromone", "SixLegs", "Formica", "Stinger", "Myrmidon", "TunnelKing",
  "Brood", "Crawler", "AphidLord", "HiveMind", "Antenna", "Chitin", "Swarmlord", "Pincer",
  "Velvet", "Mound", "Drone", "Carapace", "Skitter",
] as const;

export interface Rival {
  name: string;
  colony: number;
}

/** How far above or below the player's own colony a rival can be drawn. */
const SPREAD = 0.25;

/**
 * A rival for one match, decided by the seed so the plate does not change under the player
 * mid-match and a replayed seed brings back the same opponent.
 */
export function rivalFor(colony: number, seed: number): Rival {
  // One cheap hash, two draws off it: the name and the size must not move together, or
  // every "Formica" in the game would be the same size.
  const h = Math.abs(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b));
  const name = RIVAL_NAMES[h % RIVAL_NAMES.length] as string;
  const tag = ((h >>> 7) % 89) + 11;
  const swing = (((h >>> 13) % 2001) / 1000 - 1) * SPREAD;
  return { name: `${name}${tag}`, colony: Math.max(1, Math.round(colony * (1 + swing))) };
}
