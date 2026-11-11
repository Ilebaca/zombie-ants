/**
 * THE NAMES OF EVERYONE WHO IS NOT YOU.
 *
 * One pool, because three places draw from it and a world with three different sets of
 * names is three worlds: the matchmaking search, the bot rosters it seats from
 * (matchmaking.ts), and the Leaderboard's table.
 */

import { seeded, seedFrom } from "../engine";
import { AVATAR_IDS } from "./avatars";

/** Stable player avatar for an offline rival. A separate seed leaves their roster unchanged. */
export function rivalAvatar(identity: string): string {
  const random = seeded(seedFrom(identity) ^ 0x41c64e6d);
  return AVATAR_IDS[Math.floor(random() * AVATAR_IDS.length)] as string;
}

/** One pool of names, shared by the nameplate and the ladder, so the world is consistent. */
export const RIVAL_NAMES = [
  "Mandible", "Pheromone", "SixLegs", "Formica", "Stinger", "Myrmidon", "TunnelKing",
  "Brood", "Crawler", "AphidLord", "HiveMind", "Antenna", "Chitin", "Swarmlord", "Pincer",
  "Velvet", "Mound", "Drone", "Carapace", "Skitter",
] as const;
