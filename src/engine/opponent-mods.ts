import { CHAMBER_MAX, RESEARCH_MAX } from "./config";
import { NEUTRAL_MODS } from "./types";
import type { PlayerMods } from "./types";
import type { Difficulty } from "./difficulty";

/** Impossible uses the same chamber and research caps available to the player. */
export function opponentModifiers(difficulty: Difficulty): PlayerMods {
  if (difficulty !== "impossible") return { ...NEUTRAL_MODS };
  return {
    ...NEUTRAL_MODS, ...CHAMBER_MAX,
    reservoir: RESEARCH_MAX, mandible: RESEARCH_MAX, cuticle: RESEARCH_MAX,
  };
}
