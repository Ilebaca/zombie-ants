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

/** Hive defenders grow one step every N turns since waking. */
export const HIVE_GROW_EVERY = 4;

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

/** Anthill caps. Fungal Cultivation is deliberately shorter than the rest. */
export const CHAMBER_MAX = { royal: 5, brood: 5, soldierCaste: 5, gland: 5, cultivate: 3 } as const;

export const chamberCost = (level: number): number => 60 + level * 55;

/** Cost of the NEXT research level, given the level already held. */
export const researchCost = (level: number): number => 40 + level * 35;

/** Trophies drive the Trophy Road. Floored at zero elsewhere. */
export const TROPHY_WIN = 30;
export const TROPHY_LOSS = -15;
