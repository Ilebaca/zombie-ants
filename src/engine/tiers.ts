/**
 * ONE RARITY LADDER, FOR EVERYTHING THAT HAS ONE.
 *
 * There were two, and they disagreed. Traits ran common / uncommon / rare / exceptional /
 * mythic in grey, green, blue, purple and red; colonies ran "Founding castes" / "Rare
 * colonies" / "Elite castes" / "Mythic" in green, blue, purple and GOLD. So the same rung
 * had two names on two screens, and the top rung had two different colours — a player
 * learning that red means "the best thing in the hatch" then met a gold Mythic colony in
 * the Antarium and had to learn it twice.
 *
 * A rarity is a promise about how hard something is to get. It has to mean one thing.
 *
 * WHAT LIVES HERE is the ladder itself: the rungs, their order, their names and their
 * colours. WHAT DOES NOT is what a rung is WORTH — a trait's percentages, a colony's
 * price, the weight a hatch rolls it at. Those are progression decisions that will be
 * retuned and they belong beside the prices (`platform/`). This is only the vocabulary,
 * and it is in the engine for the same reason the skin catalogue is: `render/` and
 * `platform/` both need it and may not import each other.
 *
 * COMMON IS UNUSED BY COLONIES, ON PURPOSE. There is no grey colony yet and there will
 * be — the three a player starts with are Uncommon, and the rung below them is held open
 * rather than renumbered, because renumbering a ladder is how a rung ends up meaning two
 * things again.
 */

export const TIER_IDS = ["common", "uncommon", "rare", "exceptional", "mythic"] as const;

export type TierId = typeof TIER_IDS[number];

export interface TierDef {
  id: TierId;
  name: string;
  /** The one colour this rarity is known by, anywhere in the app. */
  colour: string;
  /** 0 for the commonest. Used for ordering, never for value. */
  rank: number;
}

export const TIERS: Record<TierId, TierDef> = {
  common:      { id: "common",      name: "Common",      colour: "#9aa5a0", rank: 0 },
  uncommon:    { id: "uncommon",    name: "Uncommon",    colour: "#5fc86b", rank: 1 },
  rare:        { id: "rare",        name: "Rare",        colour: "#4c9df0", rank: 2 },
  exceptional: { id: "exceptional", name: "Exceptional", colour: "#a86df0", rank: 3 },
  mythic:      { id: "mythic",      name: "Mythic",      colour: "#f2674c", rank: 4 },
};

/** The ladder in order, commonest first. */
export const TIER_LADDER: readonly TierDef[] = TIER_IDS.map((id) => TIERS[id]);

/** A rung by id, or null — a save can name one this build no longer has. */
export const tierById = (id: string): TierDef | null =>
  (TIER_IDS as readonly string[]).includes(id) ? TIERS[id as TierId] : null;
