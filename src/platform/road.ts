/**
 * The Trophy Road: a ladder of rewards paid out as the player's trophy count climbs.
 *
 * Pure functions over a trophy number — no storage, no DOM. The screen renders whatever
 * `roadStops()` returns, and `ProfileStore.claimRoad` is the only thing that pays out, so
 * the reward table can be retuned without touching either.
 *
 * Two tracks, as in the legacy build: FREE pays every 500 trophies, PASS pays every 250 but
 * only to players who hold the Trophy Pass. The pass is the RevenueCat integration point
 * (roadmap step 5) — `ProfileStore.grantPass()` is what a purchase calls.
 */

export const ROAD_STEP = 250;
/** A chapter is two steps wide, so every chapter holds one free reward and two pass rewards. */
export const ROAD_CHAPTER = 500;
export const ROAD_CHAPTERS = 40;
export const ROAD_MAX = ROAD_CHAPTERS * ROAD_CHAPTER;

export type RoadTrack = "free" | "pass";

export interface RoadReward {
  mycel?: number;
  pheromone?: number;
}

export interface RoadStop {
  /** Trophies needed. */
  trophies: number;
  chapter: number;
  free: RoadReward | null;
  pass: RoadReward | null;
}

/** Stable id for a reward, used as the claim key stored on the profile. */
export const roadKey = (track: RoadTrack, trophies: number): string =>
  `${track === "pass" ? "p" : "f"}${trophies}`;

/** Free track: one reward per chapter, alternating currency so both stay useful. */
export function freeReward(trophies: number): RoadReward | null {
  if (trophies % ROAD_CHAPTER !== 0) return null;
  const tier = trophies / ROAD_CHAPTER;
  return tier % 2 === 0
    ? { pheromone: 120 + tier * 10 }
    : { mycel: 200 + tier * 15 };
}

/** Pass track: pays at every stop, and every fourth stop pays both currencies. */
export function passReward(trophies: number): RoadReward | null {
  if (trophies % ROAD_STEP !== 0) return null;
  const tier = trophies / ROAD_STEP;
  if (tier % 4 === 0) return { mycel: 300, pheromone: 200 };
  return tier % 2 === 0 ? { pheromone: 150 } : { mycel: 180 };
}

export function roadStops(): RoadStop[] {
  const out: RoadStop[] = [];
  for (let t = ROAD_STEP; t <= ROAD_MAX; t += ROAD_STEP) {
    out.push({
      trophies: t,
      chapter: Math.ceil(t / ROAD_CHAPTER),
      free: freeReward(t),
      pass: passReward(t),
    });
  }
  return out;
}

/** Look a reward back up from its claim key. Returns null for a key that pays nothing. */
export function rewardFor(key: string): RoadReward | null {
  const track = key[0];
  const trophies = Number(key.slice(1));
  if (!Number.isFinite(trophies) || trophies <= 0) return null;
  if (track === "f") return freeReward(trophies);
  if (track === "p") return passReward(trophies);
  return null;
}

export const roadTrophies = (key: string): number => Number(key.slice(1));
export const isPassKey = (key: string): boolean => key[0] === "p";

export function rewardText(r: RoadReward): string {
  return [
    r.mycel ? `+${r.mycel} 🍄` : "",
    r.pheromone ? `+${r.pheromone} 🧪` : "",
  ].filter(Boolean).join("  ");
}
