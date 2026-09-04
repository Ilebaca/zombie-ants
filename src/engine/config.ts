import type { MapLimits } from "./types";

/** Production per turn, by tile role. Resource output is boosted by Fungal Cultivation. */
export const PROD = { nest: 2, stable: 1, resourceStable: 3 } as const;

/**
 * Flat defence bonuses added to defence power. Veins and hive tiles get NOTHING.
 *
 * `guard` is the flat bonus every neutral defender gets; `guardGround`/`guardResource` are
 * added on top of it, so a wild garrison holding a resource defends at 5 and one on open
 * ground at 2.
 */
export const DEF = {
  nest: 6, stable: 1, resourceOwned: 2,
  guard: 1, guardGround: 1, guardResource: 4,
} as const;

export const START_SOLDIERS = { nest: 10, stable: 3 } as const;

/** Long-range Travel reach, in tiles. Same on every map. */
export const TRAVEL_RANGE = 4;

/** A tile can never be emptied: this many always stay behind. Tunnels must hold 5. */
export const KEEP_NORMAL = 1;
export const KEEP_TUNNEL = 5;

/** Hive defenders grow one step every N turns since the hive first woke. */
export const HIVE_GROW_EVERY = 4;

/** Neutral garrison a level-1 queen and each of her guards wake with, and their growth step. */
export const HIVE_QUEEN_BASE = 16;
export const HIVE_QUEEN_STEP = 6;
export const HIVE_GUARD_BASE = 9;
export const HIVE_GUARD_STEP = 3;

/**
 * What one hive level is worth, as a multiplier on the whole garrison.
 *
 * It has to MULTIPLY rather than add, and the growth clock has to keep running across a
 * respawn, or a queen who had been sitting a long time came back at level 2 with FEWER
 * soldiers than the level-1 queen the player had just beaten. Levelling up must always
 * make her harder.
 */
export const HIVE_LEVEL_GROWTH = 1.55;

/**
 * Turns between a surge ending and the queen coming back, one level stronger.
 *
 * The GDD describes the respawn but sets no gap for it, so this is a design decision:
 * without one, the colony that just rode a surge walks straight back onto a fresh queen,
 * and the Hive becomes a tap rather than a contest.
 */
export const HIVE_COOLDOWN = 4;

export type MapId = "tiny" | "small" | "mid";

export interface MapDef extends MapLimits {
  id: MapId;
  name: string;
  size: number;
}

export const MAPS: Record<MapId, MapDef> = {
  tiny:  { id: "tiny",  name: "Skirmish (7×7)",    size: 7,  awakenTurn: 10, turnLimit: 32, buffTurns: 3 },
  small: { id: "small", name: "Corridor (9×9)",    size: 9,  awakenTurn: 14, turnLimit: 45, buffTurns: 4 },
  mid:   { id: "mid",   name: "Gauntlet (13×13)",  size: 13, awakenTurn: 18, turnLimit: 80, buffTurns: 5 },
};

/** Per-species research cap. At max, an ability's cooldown drops by exactly one turn. */
export const RESEARCH_MAX = 5;

/**
 * The most a stack of traits may ever add to attack or to defence, as a percentage.
 *
 * The tier table lives in the progression layer, which is where deciding what a mythic is
 * worth belongs — this is the engine refusing to let ANY table double a colony's punch.
 * It is deliberately well above what a full collection reaches, so it never binds during
 * a real game; it is here for a save somebody has hand-edited and for the day the tiers
 * are retuned by somebody who does not read this file.
 */
export const TRAIT_PCT_CAP = 40;

/** Anthill caps. Fungal Cultivation is deliberately shorter than the rest. */
export const CHAMBER_MAX = { royal: 5, brood: 5, soldierCaste: 5, gland: 5, cultivate: 3 } as const;

export const chamberCost = (level: number): number => 60 + level * 55;

/** Cost of the NEXT research level, given the level already held. */
export const researchCost = (level: number): number => 40 + level * 35;


/* ------------------------------------------------- WHAT THE ABILITIES DO

   THESE NUMBERS ARE ALSO SENTENCES. Every one of them appears in the copy a player reads
   on the colony's page (`engine/species.ts`), which used to carry its own hand-typed copy
   of each — and Venom Rain said "10 troops/turn" while the engine took 7, ported verbatim
   from the legacy build and wrong in both for as long as either existed.

   A number a player counts their attack out with cannot live in two places. They live here,
   because `config.ts` imports nothing: the rules read them, and the description strings are
   BUILT from them, so a balance change cannot leave the game lying about itself. It is the
   same rule the manual already follows (CLAUDE.md: "The numbers are read from
   engine/config.ts, never typed out"), applied to the one screen that had escaped it. */

/** Troops a venomed tile loses per turn — flat, not a share. */
export const VENOM_BITE = 7;
/** Share of a burning garrison lost per turn. A garrison of five or fewer is wiped. */
export const FIRE_BITE = 0.20;
/** Share of each bordering garrison the Army Ant devours. */
export const SWARM_BITE = 0.25;
/** Turns a fresh venom cloud, a wildfire and a leaf wall last, before research. */
export const VENOM_TURNS = 3;
export const FIRE_TURNS = 3;
export const LEAF_TURNS = 4;
/** Troops a tile needs before it can bud, and the share that leaves for the new one. */
export const BUD_MIN = 40;
export const BUD_SHARE = 0.30;
/** Fortify: what a frontline tile gains, and what the whole colony defends at. */
export const FORTIFY_GAIN = 0.12;
export const FORTIFY_DEF = 1.7;
export const FORTIFY_TURNS = 3;
/** Defence multiplier a withered leaf wall leaves behind. */
export const ARMOUR_DEF = 1.4;
/** How far the Demon Ant's terror reaches, in tiles. */
export const FLEE_REACH = 3;

/** A multiplier as the percentage a player reads: 1.7 -> "70". */
export const asPct = (mult: number): number => Math.round((mult - 1) * 100);
/** A share as the percentage a player reads: 0.25 -> "25". */
export const sharePct = (share: number): number => Math.round(share * 100);
