/** Versioned loadout estimate. It measures equipment, not player skill or win chance. */
import { CHAMBER_MAX, DEF, PROD, START_SOLDIERS, TRAIT_PCT_CAP } from "./config";
import { combatResearch, cooldownChance, speciesLevel } from "./research";
import { SPECIES } from "./species";
import type { AbilityKind, PlayerMods, SpeciesId } from "./types";

export const POWER_VERSION = 2;
const finite = (n: number, max: number): number => Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
const ABILITY_VALUE: Record<AbilityKind, number> = {
  tunnel: 1.12, bud: 1.08, leaf: 1.08, fire: 1.05,
  swarm: 1.10, fortify: 1.08, venom: 1.10, flee: 1.08,
};

export interface PowerRating {
  version: typeof POWER_VERSION;
  total: number;
  /** Weighted points, before rounding; their sum is the total. */
  attack: number;
  defence: number;
  economy: number;
  ability: number;
  opening: number;
}

/** Only combat-active modifiers count. Stored wallets, cosmetics and granary do not. */
export function combatPower(species: SpeciesId, input: PlayerMods): PowerRating {
  const mods: PlayerMods = { ...input };
  for (const key of Object.keys(CHAMBER_MAX) as Array<keyof typeof CHAMBER_MAX>) {
    mods[key] = Math.floor(finite(input[key], CHAMBER_MAX[key]));
  }
  for (const key of ["mandible", "cuticle", "reservoir"] as const) mods[key] = Math.floor(finite(input[key], 5));
  if (input.researchLevel !== undefined) mods.researchLevel = speciesLevel(input.researchLevel);
  const s = SPECIES[species];
  const attack = 300 * s.atk * combatResearch(mods, "mandible")
    * (1 + finite(mods.atkPct, TRAIT_PCT_CAP) / 100);
  const nestDefence = Math.round(DEF.nest * (1 + mods.soldierCaste * .05)) - DEF.nest;
  const defence = 250 * (s.def * combatResearch(mods, "cuticle")
    * (1 + finite(mods.defPct, TRAIT_PCT_CAP) / 100) + nestDefence / 30 + mods.gland * .01);
  // A common reference position: one nest, four ordinary producers, two resources.
  const baseIncome = PROD.nest + 4 * PROD.stable + 2 * PROD.resourceStable;
  const economy = 300 * ((baseIncome + 2 * mods.cultivate + mods.brood) / baseIncome);
  const recovery = mods.researchLevel === undefined ? 0 : cooldownChance(mods.researchLevel) / 100;
  const cooldown = Math.max(1, s.ability.cooldown - finite(mods.boonPct, 50) / 100);
  const ability = 100 * ABILITY_VALUE[s.ability.kind] * (1 + recovery) * 6 / cooldown;
  const starting = START_SOLDIERS.nest + 4 * START_SOLDIERS.stable;
  const opening = 50 * (starting + mods.royal) / starting;
  return { version: POWER_VERSION, total: Math.round(attack + defence + economy + ability + opening),
    attack, defence, economy, ability, opening };
}
