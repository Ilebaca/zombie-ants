/**
 * The progression catalogue: what the Anthill and Antarium sell, and what it says on the tin.
 *
 * This is meta-layer data, not rules. The engine owns the *effect* of a chamber or research
 * level (PlayerMods); this file owns the price, the icon and the sentence the player reads.
 * Keeping the wording here means a copy change never touches combat maths.
 *
 * The effect strings must stay in step with the engine — each one names the file that
 * implements it, so a balance change has a paper trail back to the text the player sees.
 */
import { CHAMBER_MAX, RESEARCH_MAX, SPECIES } from "../engine";
import type { SpeciesId } from "../engine";
import type { ChamberId, Research } from "./profile";

export type ResearchTrack = keyof Research;

export interface ChamberDef {
  id: ChamberId;
  icon: string;
  name: string;
  desc: string;
  max: number;
  /** What level `l` does, phrased for the player. */
  effect: (level: number) => string;
}

/** Anthill chambers. Order is the order they appear on screen. */
export const CHAMBERS: readonly ChamberDef[] = [
  {
    id: "royal", icon: "👑", name: "Royal Chamber", max: CHAMBER_MAX.royal,
    desc: "A deeper chamber lets the queen lay a larger brood before the war begins.",
    effect: (l) => `+${l} soldier${l === 1 ? "" : "s"} in your nest at match start`,
  },
  {
    id: "brood", icon: "🥚", name: "Brood Nursery", max: CHAMBER_MAX.brood,
    desc: "Nurse workers tend the eggs around the clock, hatching replacements.",
    effect: (l) => `Your nest hatches +${l} soldier${l === 1 ? "" : "s"} per turn`,
  },
  {
    id: "soldierCaste", icon: "⚔️", name: "Soldier Caste", max: CHAMBER_MAX.soldierCaste,
    desc: "Major workers with oversized heads plug the nest entrance.",
    effect: (l) => `+${l * 5}% defence on your nest tile`,
  },
  {
    id: "gland", icon: "🧪", name: "Metapleural Gland", max: CHAMBER_MAX.gland,
    desc: "Secretes antibiotics that suppress fungal and chemical attack.",
    effect: (l) => `−${l * 5}% damage from venom, fire and the Hive`,
  },
  {
    id: "cultivate", icon: "🌱", name: "Fungal Cultivation", max: CHAMBER_MAX.cultivate,
    desc: "The colony farms its captured resource tiles, and each one yields more.",
    effect: (l) => `+${l} production on every resource tile you hold`,
  },
];

export interface ResearchDef {
  id: ResearchTrack;
  icon: string;
  name: string;
  desc: string;
  /** Per-level effect summary. Shown once, not per level. */
  effect: string;
}

/**
 * Per-species research. Reservoir is deliberately not a flat percentage: the cooldown only
 * drops at MAX (engine/abilities.ts), and Leafcutter's permanent-leaf cap is a running
 * total, not a per-cast bonus (CLAUDE.md §5).
 */
export const RESEARCH_TRACKS: readonly ResearchDef[] = [
  {
    id: "reservoir", icon: "⚗️", name: "Exocrine reservoir",
    desc: "Larger gland reserves refill faster and dose harder.",
    effect: `−1 turn cooldown at Lv ${RESEARCH_MAX} · Leafcutter keeps 1/2/3 permanent leaf walls at Lv 2/3/4`,
  },
  {
    id: "mandible", icon: "⚔️", name: "Mandible muscle",
    desc: "A thicker adductor muscle drives a harder bite.",
    effect: "+5% attack per level",
  },
  {
    id: "cuticle", icon: "🛡️", name: "Sclerotised cuticle",
    desc: "Cross-linked chitin hardens the exoskeleton.",
    effect: "+5% defence per level",
  },
];

/**
 * Mycelium price of each species. Zero means it is a starter colony — the three the player
 * already has (profile.ts STARTER_SPECIES). Demon is premium: it is priced here so the
 * Antarium can show a number, but `premium` species are gated by the shop, not by mycel.
 */
export const SPECIES_UNLOCK: Record<SpeciesId, number> = {
  fire: 0, leafcutter: 0, ghost: 0,
  pharaoh: 260, weaver: 280, army: 300, carpenter: 260, bullet: 320,
  demon: 700,
};

/** Total research levels a single species can hold, across all tracks. */
export const RESEARCH_TOTAL_MAX = RESEARCH_TRACKS.length * RESEARCH_MAX;

/** Field notes shown on a species' Antarium page — the real biology behind the abilities. */
export const SPECIES_NOTES: Record<SpeciesId, string> = {
  ghost:
    "Tapinoma melanocephalum. Tiny, pale and translucent enough to vanish against a wall; " +
    "nests are shallow, temporary and moved on a whim, which is why a gallery can open anywhere.",
  pharaoh:
    "Monomorium pharaonis. An indoor supercolony with many queens: cut a nest in half and you " +
    "get two nests. Budding, not flight, is how it spreads — slow, relentless, unkillable by halves.",
  leafcutter:
    "Atta cephalotes. Does not eat leaves — it farms a fungus on them, in the largest agricultural " +
    "system any animal runs. The garden is the colony; the leaves are just the feedstock.",
  fire:
    "Solenopsis invicta. Answers a disturbance with mass: hundreds boil out at once and sting in " +
    "unison. Floods are survived by linking legs into a living raft.",
  army:
    "Eciton burchellii. No permanent nest at all — the colony bivouacs from its own bodies and " +
    "marches, stripping everything in the swarm front's path.",
  weaver:
    "Oecophylla smaragdina. Builds nests by pulling living leaves together and stitching them with " +
    "silk squeezed from its own larvae — the larva is the tool.",
  carpenter:
    "Camponotus. Excavates galleries in dead wood rather than eating it, and posts major workers " +
    "with plug-shaped heads in the entrances as living doors.",
  bullet:
    "Paraponera clavata. The most painful sting recorded on the Schmidt index — waves of burning " +
    "for a full day. Small colonies; every individual is a weapon.",
  demon:
    "Not a described species. A colony of the story, kept for what it does rather than what it is: " +
    "a terror pheromone that empties ground without a fight.",
};

/** Species in display order — starters first, then by price. */
export const SPECIES_ORDER: readonly SpeciesId[] = (Object.keys(SPECIES) as SpeciesId[])
  .slice()
  .sort((a, b) => SPECIES_UNLOCK[a] - SPECIES_UNLOCK[b] || a.localeCompare(b));
