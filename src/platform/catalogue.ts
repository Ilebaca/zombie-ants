/**
 * The progression catalogue: what the Anthill and Antarium sell, and what it says on the tin.
 *
 * This is meta-layer data, not rules. The engine owns the *effect* of a chamber or research
 * level (PlayerMods); this file owns the price, the icon and the sentence the player reads.
 *
 * `icon` names a mark in src/ui/icons.ts. These were emoji, which meant a crown, an egg and
 * a pair of swords from three different illustrators sitting in one list.
 * Keeping the wording here means a copy change never touches combat maths.
 *
 * The effect strings must stay in step with the engine — each one names the file that
 * implements it, so a balance change has a paper trail back to the text the player sees.
 */
import { CHAMBER_MAX, SPECIES_LEVEL_MAX, SPECIES, TIERS as TIER_DEFS } from "../engine";
import type { SpeciesId, TierId } from "../engine";
import type { ChamberId } from "./profile";

export interface ChamberDef {
  id: ChamberId;
  icon: string;
  name: string;
  desc: string;
  max: number;
  /** What level `l` does, phrased for the player. */
  effect: (level: number) => string;
}

/**
 * Anthill chambers. Order, wording and effect phrasing are the legacy build's CHAMBERS
 * table verbatim — the player reads these strings, so they are part of the design.
 */
export const CHAMBERS: readonly ChamberDef[] = [
  {
    id: "royal", icon: "crown", name: "Royal Chamber", max: CHAMBER_MAX.royal,
    desc: "A deeper chamber lets the queen lay a slightly larger brood before the war begins.",
    effect: (l) => `+${l} soldier${l === 1 ? "" : "s"} in your base at match start`,
  },
  {
    id: "brood", icon: "brood", name: "Brood Nursery", max: CHAMBER_MAX.brood,
    desc: "Nurse workers tend eggs around the clock, hatching replacements.",
    effect: (l) => `Base hatches +${l} soldier${l === 1 ? "" : "s"} per turn`,
  },
  {
    id: "soldierCaste", icon: "attack", name: "Soldier Caste", max: CHAMBER_MAX.soldierCaste,
    desc: "Major workers with oversized heads plug the nest entrance.",
    effect: (l) => `+${l * 5}% defense on your base tile`,
  },
  {
    id: "gland", icon: "flask", name: "Metapleural Gland", max: CHAMBER_MAX.gland,
    desc: "Secretes antibiotics that suppress fungal and chemical attack.",
    effect: (l) => `−${l * 5}% damage from venom, fire & the Hive`,
  },
  {
    id: "cultivate", icon: "leaf", name: "Fungal Cultivation", max: CHAMBER_MAX.cultivate,
    desc: "Research lets the colony cultivate captured resource tiles — each upgrade makes every resource yield more.",
    effect: (l) => `+${l} production on each resource tile`,
  },
];

/**
 * Mycelium price of each species, exactly as the legacy build prices them (SPEC_UNLOCK).
 * Zero means a starter colony — the three the player already has (profile.ts
 * STARTER_SPECIES). Demon is premium: it is priced here so the Antarium can show a number,
 * but `premium` species are gated by the shop, not by mycel.
 */
export const SPECIES_UNLOCK: Record<SpeciesId, number> = {
  ghost: 260, pharaoh: 260, leafcutter: 0, fire: 0, army: 300,
  carpenter: 0, bullet: 320, demon: 700,
};

/**
 * Rarity tiers. These are what the Antarium colours a colony by, and what orders the
 * species picker — a player reads the collection as founding castes first, mythic last.
 */
export interface Tier {
  k: TierId;
  name: string;
  col: string;
  glow: string;
  /** The rung painted as a whole surface rather than as ink — see `TierDef.fill`. */
  fill: string;
}

/**
 * A COLONY'S RARITY IS THE GAME'S RARITY, not a second ladder that happens to have four
 * rungs. It used to be its own table — "Founding castes / Rare colonies / Elite castes /
 * Mythic" in green, blue, purple and GOLD — so the same rung had two names on two screens
 * and the top rung had two colours: a player who learned that red is the best thing in the
 * hatch met a gold Mythic colony and had to learn it twice.
 *
 * COMMON IS HELD OPEN. There is no grey colony yet and there will be, so the three a
 * player starts with are Uncommon and the rung below them is left empty rather than the
 * ladder renumbered — renumbering is how a rung ends up meaning two things again.
 */
const RANKS: readonly TierId[] = ["uncommon", "rare", "exceptional", "mythic"];

export const TIERS: readonly Tier[] = RANKS.map((id) => ({
  k: id,
  name: TIER_DEFS[id].name,
  col: TIER_DEFS[id].colour,
  // The glow is the tier's own colour at low alpha, derived rather than typed out: two
  // places spelling one colour is two chances for a retune to move only one of them.
  glow: `${TIER_DEFS[id].colour}55`,
  fill: TIER_DEFS[id].fill,
}));

/** Tier is derived from price, never stored — one number decides colour, name and order. */
export function tierOf(id: SpeciesId): Tier {
  if (SPECIES[id].premium) return TIERS[3] as Tier;
  const cost = SPECIES_UNLOCK[id];
  if (cost === 0) return TIERS[0] as Tier;
  if (cost <= 280) return TIERS[1] as Tier;
  return TIERS[2] as Tier;
}

const tierRank = (id: SpeciesId): number => TIERS.findIndex((t) => t.k === tierOf(id).k);

/** Total upgrades a single species can hold. */
export const RESEARCH_TOTAL_MAX = SPECIES_LEVEL_MAX;

/**
 * Field notes shown on a species' Antarium page — the real biology behind the abilities.
 * Copied from the legacy build's ANT_BIO so both builds read identically.
 */
export const SPECIES_NOTES: Record<SpeciesId, string> = {
  ghost:
    "Tapinoma-like tramp ants run tiny, fast-moving colonies. Their cuticle is so thin light passes through it, and they navigate almost entirely by trail pheromone rather than sight.",
  pharaoh:
    "Monomorium pharaonis reproduces by budding: a queen simply walks away with workers and brood and starts again. That is why an infestation is nearly impossible to eradicate.",
  leafcutter:
    "Atta cut leaves not to eat, but to compost. Underground gardens of Leucoagaricus fungus feed the colony — the oldest agriculture on Earth, roughly 50 million years old.",
  fire:
    "Solenopsis invicta swarms any disturbance within seconds and stings in unison on a chemical cue. Flooded colonies link legs and mandibles into a living raft.",
  army:
    "Eciton burchellii never builds a nest. The colony forms a living bivouac from its own bodies and moves in raiding columns that strip the forest floor.",
  carpenter:
    "Camponotus excavate galleries in dead wood rather than eating it. Majors have armoured heads shaped to plug the nest entrance like a living door.",
  bullet:
    "Paraponera clavata delivers the most painful recorded insect sting — poneratoxin, a paralysing neurotoxin. Small colonies, enormous individual threat.",
  demon:
    "Ophiocordyceps rewrites the host's behaviour, not its body: infected ants abandon the colony, climb, and lock their mandibles onto a leaf vein before the fruiting body erupts.",
};

/**
 * Display order: by rarity tier, stable within a tier so the declaration order in
 * species.ts breaks ties. Same list the legacy build shows (speciesByRarity).
 */
export const SPECIES_ORDER: readonly SpeciesId[] = (Object.keys(SPECIES) as SpeciesId[])
  .slice()
  .sort((a, b) => tierRank(a) - tierRank(b));

/** The colony a brand-new profile opens on: the first of the founding castes. */
export const DEFAULT_SPECIES: SpeciesId = SPECIES_ORDER[0] as SpeciesId;
