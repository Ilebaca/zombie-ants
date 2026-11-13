/** Frozen coefficients for reconstructing pre-v2 move records, never new matches. */
import type { GameState, Player, SpeciesId } from "./types";
export const CURRENT_RULES_VERSION = 2;
const ARCHIVED_COEFFICIENT: Record<SpeciesId, number> = {
  ghost:1,pharaoh:1.25,leafcutter:1.15,fire:1.05,army:.95,carpenter:1.05,bullet:.70,demon:.95,
};
/** Live and resumed fights always use current rules and receive a factor of one. */
export const recordedGrowthFactor = (state:GameState, player:Player):number =>
  state.rulesVersion === 1 ? ARCHIVED_COEFFICIENT[state.species[player]] : 1;
