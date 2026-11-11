/** Shared colony-level rules. Legacy modifier fields remain readable for saved matches. */
import { SPECIES } from "./species";
import type { PlayerMods, SpeciesId } from "./types";

export const SPECIES_LEVEL_MAX = 10;
/** Research retains the previous maximum +25% attack and defence. */
export const RESEARCH_STAT_CAP = 0.25;
export const COOLDOWN_CHANCE_CAP = 10;

/** Save and engine inputs must never turn into uncapped or non-finite bonuses. */
export function speciesLevel(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(SPECIES_LEVEL_MAX, Math.floor(value))) : 0;
}

export const researchBoost = (level: number): number =>
  1 + RESEARCH_STAT_CAP * speciesLevel(level) / SPECIES_LEVEL_MAX;

export const cooldownChance = (level: number): number =>
  COOLDOWN_CHANCE_CAP * speciesLevel(level) / SPECIES_LEVEL_MAX;

export function researchedStats(id: SpeciesId, level: number): { attack: number; defence: number; cooldown: number } {
  const boost = researchBoost(level);
  return { attack: SPECIES[id].atk * boost, defence: SPECIES[id].def * boost, cooldown: cooldownChance(level) };
}

/** Old records omit researchLevel and retain their original independent tracks. */
export function combatResearch(mods: PlayerMods, track: "mandible" | "cuticle"): number {
  return mods.researchLevel === undefined ? 1 + mods[track] * 0.05 : researchBoost(mods.researchLevel);
}
