/**
 * The Colony Road: a ladder of rewards paid out as the colony grows.
 *
 * It used to be a Trophy Road — a hundred stops two hundred and fifty trophies apart,
 * running to twenty-five thousand and stopping. That shape belongs to a rating, which is a
 * number about the player. The colony is a number about the COLONY, and a colony compounds
 * (colony.ts), so the road has to compound with it: every stop is a fixed MULTIPLE of the
 * one before, and a hundred of them carry it from a few dozen troops to past a trillion.
 *
 * That is also why a stop is identified by its INDEX rather than by its size. The old table
 * asked "is this number a multiple of five hundred?", which only works on a ladder with
 * even rungs; on a geometric one the rung number is the only stable name a reward has.
 *
 * Pure functions — no storage, no DOM. The screen renders whatever `roadStops()` returns,
 * and `ProfileStore.claimRoad` is the only thing that pays out, so the table can be retuned
 * without touching either.
 *
 * Two tracks, as in the legacy build: FREE pays once a chapter, PASS pays at every stop but
 * only to players who hold the Colony Pass. The pass is the RevenueCat integration point
 * (roadmap step 5) — `ProfileStore.grantPass()` is what a purchase calls.
 */
import { COLONY_START } from "./colony";

/** A chapter is two stops wide: one free reward, two pass rewards. */
export const ROAD_CHAPTER_STOPS = 2;
export const ROAD_CHAPTERS = 50;
export const ROAD_STOPS = ROAD_CHAPTERS * ROAD_CHAPTER_STOPS;

/**
 * The first rung, and the last: a hundred stops from a young colony to five million troops.
 *
 * The last rung used to be two trillion, which is what a flat compounding win rate reaches
 * — and a chapter-50 victory paid a hundred and thirty-six billion troops, a number that
 * has stopped meaning anything. The win share tapers now (colony.ts), and the road's top
 * comes down to meet it: five million is about two hundred wins of climbing, and a victory
 * there pays a hundred and fifty thousand.
 */
export const ROAD_FIRST = 100;
export const ROAD_LAST = 5e6;

/**
 * What each rung multiplies the one before it by.
 *
 * Solved from the two ends rather than picked, so retuning either end keeps the ladder
 * evenly spaced instead of bunching at one of them.
 */
export const ROAD_GROWTH = (ROAD_LAST / ROAD_FIRST) ** (1 / (ROAD_STOPS - 1));

export type RoadTrack = "free" | "pass";

export interface RoadReward {
  mycel?: number;
  pheromone?: number;
}

export interface RoadStop {
  /** Which rung this is, counting from one. The reward's stable name. */
  index: number;
  /** Troops needed to reach it. */
  colony: number;
  chapter: number;
  free: RoadReward | null;
  pass: RoadReward | null;
}

/** The colony size that reaches rung `index` (1-based). */
export function stopColony(index: number): number {
  if (index < 1) return COLONY_START;
  const raw = ROAD_FIRST * ROAD_GROWTH ** (index - 1);
  // Rounded to something a player would read: three significant figures is as much as the
  // compact label can show anyway, and a rung of "1,047,382" is a number nobody wants.
  return roundish(raw);
}

/** Round to three significant figures, so every rung reads as a round-ish number. */
function roundish(n: number): number {
  if (n < 1000) return Math.round(n / 10) * 10;
  const mag = 10 ** (Math.floor(Math.log10(n)) - 2);
  return Math.round(n / mag) * mag;
}

/** Stable id for a reward, used as the claim key stored on the profile. */
export const roadKey = (track: RoadTrack, index: number): string =>
  `${track === "pass" ? "p" : "f"}${index}`;

/**
 * Reward tables, ported from the legacy build's roadFree/roadPass.
 *
 * Legacy pays some stops in larva — the lucky-hatch currency, which is not ported — so
 * those stops pay pheromone at LARVA_IN_PHEROMONE each instead. Every other number is the
 * legacy number, so a stop that pays mycelium there pays the same mycelium here.
 */
const LARVA_IN_PHEROMONE = 50;

/** Free track: one reward per chapter, alternating currency. */
export function freeReward(index: number): RoadReward | null {
  if (index < 1 || index > ROAD_STOPS) return null;
  if (index % ROAD_CHAPTER_STOPS !== 0) return null;
  const tier = index / ROAD_CHAPTER_STOPS;
  return tier % 2 === 0
    ? { pheromone: 10 * LARVA_IN_PHEROMONE }
    : { mycel: 200 + tier * 15 };
}

/** Pass track: pays at every stop, and every fourth stop pays both currencies. */
export function passReward(index: number): RoadReward | null {
  if (index < 1 || index > ROAD_STOPS) return null;
  if (index % 4 === 0) return { mycel: 300, pheromone: 10 * LARVA_IN_PHEROMONE };
  return index % 2 === 0 ? { pheromone: 4 * LARVA_IN_PHEROMONE } : { mycel: 180 };
}

export function roadStops(): RoadStop[] {
  const out: RoadStop[] = [];
  for (let i = 1; i <= ROAD_STOPS; i++) {
    out.push({
      index: i,
      colony: stopColony(i),
      chapter: Math.ceil(i / ROAD_CHAPTER_STOPS),
      free: freeReward(i),
      pass: passReward(i),
    });
  }
  return out;
}

/** Look a reward back up from its claim key. Returns null for a key that pays nothing. */
export function rewardFor(key: string): RoadReward | null {
  const track = key[0];
  const index = Number(key.slice(1));
  if (!Number.isFinite(index) || index <= 0) return null;
  if (track === "f") return freeReward(index);
  if (track === "p") return passReward(index);
  return null;
}

/** The colony size a claim key asks for, so the store can refuse one not yet reached. */
export const roadColony = (key: string): number => stopColony(Number(key.slice(1)));
export const isPassKey = (key: string): boolean => key[0] === "p";

/** The rung the colony is standing on, 0 before the first one. */
export function stopReached(colony: number): number {
  let reached = 0;
  for (let i = 1; i <= ROAD_STOPS; i++) {
    if (colony >= stopColony(i)) reached = i; else break;
  }
  return reached;
}

export function rewardText(r: RoadReward): string {
  return [
    r.mycel ? `+${r.mycel} mycelium` : "",
    r.pheromone ? `+${r.pheromone} pheromone` : "",
  ].filter(Boolean).join("  ");
}
