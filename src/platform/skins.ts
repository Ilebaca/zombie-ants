/**
 * SKINS — how often the hatch pays one, and out of what.
 *
 * The catalogue itself is in the engine (`engine/skins.ts`) because the renderer needs it
 * too and these two layers may not import each other. What lives here is the part that is
 * a PROGRESSION decision rather than a fact about the game: how rare a skin is, and which
 * ones a given player can find.
 *
 * A SKIN IS THE TOP OF THE LADDER. It carries a rarity like everything else the hatch
 * pays out (`engine/tiers.ts`), and only ever the top two rungs — Exceptional or Mythic.
 * So it needs no chance of its own: the hatch rolls a tier, and a roll at one of those two
 * pays a skin of that tier while one is still locked. One number decides both, which is
 * the only way the odds printed on the screen can be the odds the game actually uses.
 */
import { UNLOCKABLE_LOOKS, looksFor } from "../engine";
import type { Look, SpeciesId, TierId } from "../engine";

/**
 * THE TIERS A SKIN CAN COME OUT OF, and there are only two.
 *
 * A skin is not a sixth rung and it is not a separate chance beside the ladder — it IS
 * the top of the ladder. A hatch rolls a tier exactly as it always did, and an
 * Exceptional or Mythic roll pays a SKIN of that tier while one is still locked. That is
 * 5 hatches in 100, which is what makes a skin hard to get; and it needs no number of its
 * own, so there is nothing here that can drift out of step with the odds on the screen.
 *
 * The tiers a skin can be are decided by the catalogue (`engine/skins.ts`) — this is only
 * the set the hatch consults, derived from it rather than restated.
 */
export const SKIN_TIERS: readonly TierId[] =
  [...new Set(UNLOCKABLE_LOOKS.map((l) => l.tier).filter((t): t is TierId => !!t))];

/** Whether a tier roll is one a skin can come out of. */
export const skinTier = (tier: TierId): boolean => SKIN_TIERS.includes(tier);

/**
 * Every look this player could still find, at one tier.
 *
 * Only colonies they OWN, for the same reason the trait pool works that way: a skin for a
 * colony they may never buy is a skin they cannot wear, and the whole point of a look is
 * that it is on screen. Only looks past index 0, because the basic one is not found.
 */
export function lockedLooks(
  owned: readonly SpeciesId[], found: readonly string[], tier?: TierId,
): readonly Look[] {
  const has = new Set(found);
  const mine = new Set(owned);
  return UNLOCKABLE_LOOKS.filter((look) =>
    mine.has(look.species) && !has.has(look.id) && (!tier || look.tier === tier));
}

/**
 * One skin at this tier, or null when there is none left to find.
 *
 * Null is not a failure — it is what makes a completed collection fall back to a trait of
 * the same tier instead of eating the larva, so the last skin found is never the hatch
 * getting worse. It never reaches across tiers either: a Mythic roll that pays a purple
 * skin would be the card lying about what just happened.
 */
export function rollSkin(
  random: () => number, owned: readonly SpeciesId[], found: readonly string[], tier: TierId,
): Look | null {
  const pool = lockedLooks(owned, found, tier);
  return pool[Math.floor(random() * pool.length)] ?? null;
}

/** How far a colony's own collection has come: found, out of what there is to find. */
export function skinProgress(
  species: SpeciesId, found: readonly string[],
): { has: number; of: number } {
  const list = looksFor(species).slice(1);
  const has = new Set(found);
  return { has: list.filter((l) => has.has(l.id)).length, of: list.length };
}
