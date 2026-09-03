/**
 * WHERE A CURRENCY GOES WHEN THERE IS NOTHING LEFT TO BUY.
 *
 * Both spendable currencies had FINITE sinks and both ran dry inside the road, which is a
 * currency that stops meaning anything while the game carries on. Measured against the
 * player the economy is tuned for (two and a half matches a day, an even record):
 *
 *   mycelium   sink 21,865 — chambers 3,745, colonies 2,120, the granary 16,000.
 *              Covered ON DAY 251 of a 440-day road: nearly half the game holding a
 *              currency that buys nothing, and then for ever after.
 *   pheromone  sink 14,850 — every research level on all nine colonies. Covered on day
 *              399, and then for ever after.
 *
 * (Pheromone was WORSE than that until the same commit: `buyResearch` charged mycelium,
 * so mycelium bought everything in the game and pheromone bought nothing at all, while
 * being printed in the top bar of every screen. See `ProfileStore.buyResearch`.)
 *
 * THE FIX CANNOT BE "MORE THINGS THAT CHANGE A MATCH". Every match-affecting number in
 * this game is capped on purpose (CLAUDE.md §8), because player progression must never
 * become mandatory and the AI gets none of it. Uncapping a chamber or a research track to
 * make a sink would buy an endless economy with the one rule the game is built on.
 *
 * So the sinks point at the COLLECTION, which is the only thing here that does not end —
 * and each currency keeps the job it already had:
 *
 *   mycelium is BREADTH. It buys more colonies, more chambers, more room. Its endless
 *            sink is more ROLLS: larva, which is the one currency with an infinite sink
 *            already (the hatch).
 *   pheromone is DEPTH. It buys research, which makes one colony better. Its endless sink
 *            is making what you have BETTER: fusing spare traits up a tier.
 *
 * And fusing solves the collection's own end-state at the same time. The hatch pays a
 * common 60% of the time for ever, so a long-running bag is mostly duplicates — dead
 * weight against `BAG_MAX`, with nothing to do but be thrown away. Now they are the fuel.
 */
import { TIER_IDS, TIERS } from "../engine";
import type { TierId } from "../engine";

/* --------------------------------------------------------------- MYCELIUM → LARVA */

/**
 * What one larva costs in mycelium.
 *
 * Priced against the SURPLUS rather than against income. Measured on the tuned player: the
 * mycelium sink is covered around day 250 of a 440-day road, and from there the whole
 * day's income — about 64 mycelium — arrives with nothing to buy. So 250 is a larva every
 * four days out of money that was doing nothing.
 *
 * PLAYING MUST STAY THE MAIN FAUCET. A win pays a larva outright, which at two and a half
 * matches a day on an even record is 1.25 a day; this adds a quarter of one. At 150 it
 * added nearly half again, which starts to read as the way to GET larva rather than as
 * somewhere for the leftovers to go.
 *
 * It also has to stay clear of the shop, which sells larva for real money — three for a
 * euro. A euro is about five days of this surplus, so the shelf still means something.
 */
export const LARVA_MYCEL = 250;

/* ------------------------------------------------------------------- FUSING TRAITS */

/**
 * How many spare traits of one tier fuse into one of the next.
 *
 * Three, not two. The hatch's own odds step by roughly 2.4× between rungs, so a two-for-one
 * fuse would be BETTER than rolling — a player would stop wanting the hatch and start
 * wanting commons, which is the opposite of what a chase is. Three is deliberately worse
 * than the natural rate: fusing is what you do with what the hatch gave you anyway.
 */
export const FUSE_FUEL = 3;

/**
 * Pheromone to fuse INTO each tier. Nothing fuses into Common — it is the bottom rung, and
 * the fuel for everything above it.
 *
 * The prices rise faster than the tiers do, so the top of the ladder stays a long way off.
 * Against the ~42 pheromone a day left over once the research tree is bought: an Uncommon is
 * a day and a half, a Rare four days, an Exceptional ten and a Mythic twenty-four — and
 * that is the price of the LAST step only. A Mythic fused all the way from the bottom is
 * 81 commons and 5,170 pheromone, which is four months of surplus. That is the shape a late-game sink wants:
 * the low rungs are something to do this week, the top one is something to work toward.
 */
export const FUSE_COST: Record<TierId, number> = {
  common: 0,
  uncommon: 60,
  rare: 150,
  exceptional: 400,
  mythic: 1000,
};

/** The tier one rung up, or null at the top. Mythic fuses into nothing. */
export function nextTier(tier: TierId): TierId | null {
  const at = TIERS[tier].rank;
  return (TIER_IDS[at + 1] as TierId | undefined) ?? null;
}

/**
 * What a fuse out of this tier costs and produces, or null when there is no rung above.
 *
 * One function so the screen, the store and the tests cannot disagree about the price of
 * the same trade — the whole reason a player trusts a number on a button.
 */
export function fuseDeal(
  from: TierId,
): { from: TierId; into: TierId; fuel: number; pheromone: number } | null {
  const into = nextTier(from);
  return into
    ? { from, into, fuel: FUSE_FUEL, pheromone: FUSE_COST[into] }
    : null;
}

/** Every trade there is, commonest first. Four of them: Mythic is the top. */
export const FUSE_DEALS = TIER_IDS.map(fuseDeal)
  .filter((d): d is NonNullable<typeof d> => !!d);
