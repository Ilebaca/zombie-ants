/**
 * SKINS — how often the hatch pays one, and out of what.
 *
 * The catalogue itself is in the engine (`engine/skins.ts`) because the renderer needs it
 * too and these two layers may not import each other. What lives here is the part that is
 * a PROGRESSION decision rather than a fact about the game: how rare a skin is, and which
 * ones a given player can find.
 *
 * A SKIN IS NOT A TIER. The five trait tiers are a curve — most hatches are common, one
 * in a hundred is mythic — and a skin does not sit anywhere on it: it is a different KIND
 * of prize, with no stat on it at all, and slotting it into the tier table would have
 * meant either making it a bad common or an unfindable mythic. So it is drawn first, as
 * its own chance, and the tier roll happens only if it did not land.
 */
import { UNLOCKABLE_LOOKS, looksFor } from "../engine";
import type { Look, SpeciesId } from "../engine";

/**
 * How often a hatch pays a skin rather than a trait.
 *
 * There are eighteen to find and a win pays one larva, so at the two or three matches a
 * day this economy is tuned for (CLAUDE.md §8c) a player meets one every couple of weeks.
 * That is deliberately slower than a trait and faster than a mythic: a skin is the prize
 * a player can SEE on the board for the rest of the match, so finding one has to be an
 * event, and there are only ever eighteen of them — a chase that ends is a chase that has
 * to be worth walking.
 *
 * It is spent only when there is something to give: with every skin for every colony the
 * player owns already found, the roll falls through to a trait rather than paying nothing.
 */
export const SKIN_CHANCE = 0.07;

/**
 * Every look this player could still find.
 *
 * Only colonies they OWN, for the same reason the trait pool works that way: a skin for a
 * colony they may never buy is a skin they cannot wear, and the whole point of a look is
 * that it is on screen. Only looks past index 0, because the basic one is not found.
 */
export function lockedLooks(
  owned: readonly SpeciesId[], found: readonly string[],
): readonly Look[] {
  const has = new Set(found);
  const mine = new Set(owned);
  return UNLOCKABLE_LOOKS.filter((look) => mine.has(look.species) && !has.has(look.id));
}

/**
 * One skin, or null when there is nothing left to find.
 *
 * Null is not a failure — it is what makes a completed collection fall through to a trait
 * instead of eating the larva, so the last skin found is never the hatch getting worse.
 */
export function rollSkin(
  random: () => number, owned: readonly SpeciesId[], found: readonly string[],
): Look | null {
  const pool = lockedLooks(owned, found);
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
