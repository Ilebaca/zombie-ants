import { CHAMBER_MAX } from "./config";
import { SPECIES_LEVEL_MAX } from "./research";
import { NEUTRAL_MODS } from "./types";
import type { PlayerMods } from "./types";
import type { Difficulty } from "./difficulty";

/** Impossible uses the same chamber and colony-level caps available to the player. */
export function opponentModifiers(difficulty: Difficulty): PlayerMods {
  if (difficulty !== "impossible") return { ...NEUTRAL_MODS };
  return {
    ...NEUTRAL_MODS, ...CHAMBER_MAX,
    researchLevel: SPECIES_LEVEL_MAX,
  };
}
