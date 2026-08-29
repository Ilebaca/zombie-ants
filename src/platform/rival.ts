/**
 * THE NAMES OF EVERYONE WHO IS NOT YOU.
 *
 * One pool, because three places draw from it and a world with three different sets of
 * names is three worlds: the matchmaking search, the bot rosters it seats from
 * (matchmaking.ts), and the Leaderboard's table.
 */

/** One pool of names, shared by the nameplate and the ladder, so the world is consistent. */
export const RIVAL_NAMES = [
  "Mandible", "Pheromone", "SixLegs", "Formica", "Stinger", "Myrmidon", "TunnelKing",
  "Brood", "Crawler", "AphidLord", "HiveMind", "Antenna", "Chitin", "Swarmlord", "Pincer",
  "Velvet", "Mound", "Drone", "Carapace", "Skitter",
] as const;
