/** Skin catalogue helpers. Skins are not awarded by Lucky Hatch or larva. */
import { UNLOCKABLE_LOOKS, looksFor } from "../engine";
import type { Look, SpeciesId, TierId } from "../engine";

/** Cosmetic rarity metadata; independent of the hatch reward table. */
export const SKIN_TIERS: readonly TierId[] =
  [...new Set(UNLOCKABLE_LOOKS.map((l) => l.tier).filter((t): t is TierId => !!t))];

export const skinTier = (tier: TierId): boolean => SKIN_TIERS.includes(tier);

/** Unowned looks for owned colonies, optionally restricted to a rarity. */
export function lockedLooks(
  owned: readonly SpeciesId[], found: readonly string[], tier?: TierId,
): readonly Look[] {
  const has = new Set(found);
  const mine = new Set(owned);
  return UNLOCKABLE_LOOKS.filter((look) =>
    mine.has(look.species) && !has.has(look.id) && (!tier || look.tier === tier));
}

/** Catalogue selection utility; no currency or hatch payout is attached to it. */
export function rollSkin(
  random: () => number, owned: readonly SpeciesId[], found: readonly string[], tier: TierId,
): Look | null {
  const pool = lockedLooks(owned, found, tier);
  return pool[Math.floor(random() * pool.length)] ?? null;
}

/** How many of a colony's optional looks the player owns. */
export function skinProgress(
  species: SpeciesId, found: readonly string[],
): { has: number; of: number } {
  const list = looksFor(species).slice(1);
  const has = new Set(found);
  return { has: list.filter((l) => has.has(l.id)).length, of: list.length };
}
