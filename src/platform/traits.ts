/**
 * TRAITS — the collectable half of a colony.
 *
 * Chambers and research are BOUGHT: a straight line from mycelium to a number, the same
 * for every player who saves up. A trait is FOUND. It has a tier, there are a lot of
 * them, two players never have the same set, and what you do with the ones you have is a
 * choice rather than a purchase. That is the whole reason for the feature, and it is why
 * the lucky hatch needs it to exist before it can be built: a hatch that pays currency is
 * a slot machine that pays money, and a hatch that pays traits is one that pays a colony.
 *
 * WHAT A TRAIT DOES, in percentages and nothing else:
 *
 *   attack    +x% on every fight this colony picks
 *   defence   +x% on every fight it takes
 *   cooldown  an x% CHANCE, rolled once per match, that its ability comes back a turn
 *             sooner — a chance, so a run of matches without it is the design rather
 *             than a bug (engine/state.ts rolls it off the seeded stream)
 *
 * WHERE THEY GO. A species trait goes in one of that colony's five slots; a universal
 * trait goes in one of the anthill's five. That is the same split the rest of the
 * progression layer already has — research is per-colony, chambers are account-wide — so
 * a player who already understands the Anthill understands where a universal trait lives.
 *
 * WHAT THE ENGINE SEES is three finished percentages (PlayerMods.atkPct / defPct /
 * boonPct). The engine owns what a percentage DOES; this file owns what a tier is WORTH,
 * because that is a progression decision and it will be retuned.
 */
import { SPECIES } from "../engine";
import type { SpeciesId } from "../engine";

/* ------------------------------------------------------------------- TIERS */

export const TRAIT_TIERS = ["common", "uncommon", "rare", "exceptional", "mythic"] as const;
export type TraitTier = typeof TRAIT_TIERS[number];

export interface TraitTierDef {
  id: TraitTier;
  name: string;
  /** The colour the tier is known by. Milan named these; they are not negotiable. */
  colour: string;
  /** Attack or defence, in percent. */
  stat: number;
  /** Cooldown chance, in percent. */
  luck: number;
  /** Relative chance of a drop landing on this tier. */
  weight: number;
}

/**
 * The five tiers.
 *
 * The numbers are set against what the game already gives away: maxed research is +25%
 * attack, and every player gets there eventually. A full stack of mythic attack traits
 * has to be worth MORE than that — it is a collection, not a purchase — without being so
 * much more that a collector stops needing to play well. Hence the cap below: the tiers
 * stay big enough to be worth reading, and the total has a ceiling that is stated on
 * screen rather than hidden.
 */
export const TRAIT_TIER: Record<TraitTier, TraitTierDef> = {
  common:      { id: "common",      name: "Common",      colour: "#9aa5a0", stat: 1, luck: 3,  weight: 100 },
  uncommon:    { id: "uncommon",    name: "Uncommon",    colour: "#5fc86b", stat: 2, luck: 6,  weight: 46 },
  rare:        { id: "rare",        name: "Rare",        colour: "#4c9df0", stat: 3, luck: 10, weight: 18 },
  exceptional: { id: "exceptional", name: "Exceptional", colour: "#a86df0", stat: 5, luck: 15, weight: 6 },
  mythic:      { id: "mythic",      name: "Mythic",      colour: "#f2674c", stat: 8, luck: 22, weight: 1.6 },
};

/** Slots, per colony and for the anthill. Five each, as designed. */
export const TRAIT_SLOTS = 5;

/**
 * Ceilings on what a whole collection may add.
 *
 * Stated on the screen beside the total, because a cap a player only discovers by
 * hitting it is a cap that reads as a bug. Well clear of anything a real collection
 * reaches: four mythic attack traits is 32%, and four mythics is a long way in.
 */
export const ATK_CAP = 30;
export const DEF_CAP = 30;
export const LUCK_CAP = 50;

/** The chapter traits and the lucky hatch both open at. */
export const TRAITS_CHAPTER = 10;

/* ------------------------------------------------------------------ TRAITS */

export type TraitKind = "attack" | "defence" | "cooldown";

export interface TraitDef {
  id: string;
  kind: TraitKind;
  name: string;
  /** What it is, in one line — real biology, like everything else in this game. */
  note: string;
  /** `null` means universal: it goes in the anthill, not in a colony. */
  species: SpeciesId | null;
  /**
   * The mark the tile is drawn with, named rather than carried (CLAUDE.md §10 — no emoji,
   * and `Product.icon` / `Chamber.icon` name a mark the same way).
   *
   * It only has to be distinct WITHIN A BENCH, and a bench is either the eight universal
   * traits or one colony's five — so the five colony marks repeat across all nine, which
   * is the reason a set this small can cover fifty-three traits without any of them
   * looking like each other where it matters.
   */
  icon: string;
}

const KIND_MARK: Record<TraitKind, string> = {
  attack: "attack", defence: "defence", cooldown: "clock",
};

export const markOf = (kind: TraitKind): string => KIND_MARK[kind];

/**
 * What a trait is worth, in a sentence. Read where there is room for one.
 */
export function effectText(def: TraitDef, tier: TraitTier): string {
  const t = TRAIT_TIER[tier];
  if (def.kind === "attack") return `+${t.stat}% attack`;
  if (def.kind === "defence") return `+${t.stat}% defence`;
  return `${t.luck}% chance of −1 cooldown`;
}

/**
 * The same thing as a FIGURE, for a tile that has room for a mark and a number and
 * nothing else. The kind is said by the mark beside it, so the word is dropped: on a
 * square the size of a thumb, "+8% attack" is two thirds punctuation.
 */
export function effectFigure(def: TraitDef, tier: TraitTier): string {
  const t = TRAIT_TIER[tier];
  return def.kind === "cooldown" ? `${t.luck}%` : `+${t.stat}%`;
}

/**
 * THE UNIVERSAL TRAITS — the anthill's five.
 *
 * These are about the nest rather than the caste, which is why they belong to the account
 * and not to a colony: a deeper brood chamber helps whichever colony is fielded.
 */
const UNIVERSAL: readonly Omit<TraitDef, "species">[] = [
  { id: "u.mandible", kind: "attack", name: "Sharpened Mandibles", icon: "attack",
    note: "The cutting edge is sclerotised harder in a well-fed nest." },
  { id: "u.raid", kind: "attack", name: "Raiding Instinct", icon: "flag",
    note: "Scouts that find a weakness bring the column straight back to it." },
  { id: "u.majors", kind: "attack", name: "Major Caste", icon: "crown",
    note: "A nest with food to spare rears bigger soldiers." },
  { id: "u.cuticle", kind: "defence", name: "Thickened Cuticle", icon: "defence",
    note: "Layered chitin, laid down over a long season underground." },
  { id: "u.rampart", kind: "defence", name: "Rampart Building", icon: "anthill",
    note: "Excavated spoil piled at the entrance, and rebuilt nightly." },
  { id: "u.brood", kind: "defence", name: "Brood Discipline", icon: "brood",
    note: "Workers that hold their ground over the brood rather than scatter." },
  { id: "u.gland", kind: "cooldown", name: "Glandular Surplus", icon: "flask",
    note: "A reservoir refilled faster than it is spent." },
  { id: "u.trophallaxis", kind: "cooldown", name: "Trophallaxis", icon: "granary",
    note: "Mouth-to-mouth feeding moves reserves through the colony in hours." },
];

/**
 * The five marks a colony's five traits are drawn with, in order.
 *
 * The same five for every colony on purpose: a bench only ever shows ONE colony's traits,
 * so within the thing a player is looking at they are all distinct — and across colonies
 * the shape becomes a pattern rather than fifty-three marks to learn. Two attack, two
 * defence, one cooldown, which is the order every colony's list is written in.
 */
const SPECIES_MARKS = ["attack", "spark", "defence", "anthill", "clock"] as const;

/**
 * FIVE PER COLONY, so a colony's five slots can be filled with five DIFFERENT traits
 * rather than duplicates. Two attack, two defence, one cooldown each — the same shape
 * everywhere, so a player learns one pattern and it holds for all nine.
 *
 * Every one is that species' own real behaviour, which is the rule the whole game is
 * written to: the abilities are real biology, and a trait that was invented would be the
 * one thing on the screen that is not.
 */
const PER_SPECIES: Record<SpeciesId, readonly [string, TraitKind, string, string][]> = {
  ghost: [
    ["silent", "attack", "Silent Approach", "A trail laid so faintly that nothing else reads it."],
    ["ambush", "attack", "Ambush Timing", "The column waits out of contact and arrives all at once."],
    ["mask", "defence", "Pheromone Mask", "Colony scent worn thin enough to pass for nobody."],
    ["fissure", "defence", "Fissure Nesting", "Galleries in cracks too narrow to be followed into."],
    ["relay", "cooldown", "Tunnel Relay", "A finished gallery is the start of the next one."],
  ],
  pharaoh: [
    ["swarmfound", "attack", "Swarm Founding", "Several queens push in the same direction at once."],
    ["persist", "attack", "Persistent Foraging", "A trail that is worked all day rather than in bursts."],
    ["satellite", "defence", "Satellite Nests", "Losing one nest costs the colony a fraction of itself."],
    ["polygyny", "defence", "Polygyny", "More than one queen, so no single loss ends it."],
    ["budding", "cooldown", "Budding Cycle", "A colony always part-way through splitting again."],
  ],
  leafcutter: [
    ["shear", "attack", "Shearing Cut", "Mandibles that vibrate as they cut, at a thousand hertz."],
    ["column", "attack", "Cutting Column", "A carrying line that never breaks, in either direction."],
    ["fungus", "defence", "Fungal Antibiotics", "A garden dosed against everything that would take it."],
    ["waste", "defence", "Waste Management", "Refuse carried far enough out to be somebody else's problem."],
    ["garden", "cooldown", "Garden Yield", "A crop that comes in faster than it is eaten."],
  ],
  fire: [
    ["sting", "attack", "Alkaloid Sting", "Venom that burns rather than paralyses, and keeps burning."],
    ["mass", "attack", "Mass Recruitment", "Every worker within reach arrives inside a minute."],
    ["raft", "defence", "Living Raft", "Bodies linked into a hull that floats a whole colony."],
    ["mound", "defence", "Mound Nesting", "A dome that drains, warms and takes a beating."],
    ["reburn", "cooldown", "Reignition", "Ground that catches again while it is still warm."],
  ],
  army: [
    ["bivouac", "attack", "Bivouac Assault", "The nest itself moves onto what it is eating."],
    ["shear2", "attack", "Shearing Jaws", "Jaws that close hard enough to be used as sutures."],
    ["bridge", "defence", "Living Bridge", "Workers that become the ground the column crosses on."],
    ["column2", "defence", "Column Guard", "Majors standing outward along the whole length of the raid."],
    ["nomad", "cooldown", "Nomadic Phase", "A colony that is never settled long enough to be slow."],
  ],
  weaver: [
    ["silk", "attack", "Silk Anchor", "A grip nothing shakes, taken before the fight starts."],
    ["chain", "attack", "Worker Chains", "Living chains that pull two edges of a leaf together."],
    ["canopy", "defence", "Canopy Nest", "A nest sewn shut in the crown of a tree."],
    ["territorial", "defence", "Territorial Patrol", "Ground walked often enough that nothing crosses it unseen."],
    ["larval", "cooldown", "Larval Silk", "Silk drawn from the brood, and the brood is always there."],
  ],
  carpenter: [
    ["excavate", "attack", "Excavating Jaws", "Jaws shaped for wood, used on something softer."],
    ["formic", "attack", "Formic Spray", "Acid sprayed from a distance, into the wound it just made."],
    ["galleries", "defence", "Smooth Galleries", "Chambers cut so clean there is nothing to grip."],
    ["heartwood", "defence", "Heartwood Nesting", "A nest inside the hardest part of a standing tree."],
    ["repair", "cooldown", "Rapid Repair", "Damage closed up before the colony has finished noticing it."],
  ],
  bullet: [
    ["poneratoxin", "attack", "Poneratoxin", "The most painful sting there is, and it does not wear off."],
    ["solitary", "attack", "Solitary Hunter", "A forager that needs nobody's help to bring something down."],
    ["armour", "defence", "Heavy Armour", "A body built to be hit and carry on."],
    ["buttress", "defence", "Buttress Nesting", "A nest at the base of a tree, with one way in."],
    ["venom", "cooldown", "Venom Reserve", "A gland that is refilling before the last sting has landed."],
  ],
  demon: [
    ["swarmdrive", "attack", "Swarm Drive", "A push that does not stop for its own losses."],
    ["terror", "attack", "Terror Scent", "An alarm pheromone that empties the ground ahead of it."],
    ["carapace", "defence", "Blackened Carapace", "Armour that gives nothing away, including damage."],
    ["retreat", "defence", "Ordered Retreat", "A colony that gives ground without ever breaking."],
    ["fervour", "cooldown", "Fervour", "A colony that is always ready, whatever it just did."],
  ],
};

/** Every trait in the game, universal first. */
export const TRAITS: readonly TraitDef[] = [
  ...UNIVERSAL.map((t) => ({ ...t, species: null })),
  ...(Object.keys(PER_SPECIES) as SpeciesId[]).flatMap((id) =>
    PER_SPECIES[id].map(([suffix, kind, name, note], i) => ({
      id: `${id}.${suffix}`, kind, name, note, species: id,
      icon: SPECIES_MARKS[i] ?? "star",
    }))),
];

const BY_ID = new Map(TRAITS.map((t) => [t.id, t]));

export const traitDef = (id: string): TraitDef | null => BY_ID.get(id) ?? null;

/** The traits that can go in a given bench: a colony's own, or the universal ones. */
export const traitsFor = (scope: TraitScope): TraitDef[] =>
  TRAITS.filter((t) => (scope === "hill" ? t.species === null : t.species === scope));

/** Which set of five slots: the anthill's, or one colony's. */
export type TraitScope = "hill" | SpeciesId;

export const scopeName = (scope: TraitScope): string =>
  scope === "hill" ? "Anthill" : SPECIES[scope].name;

/* --------------------------------------------------------------- THE ITEMS */

/**
 * ONE FOUND TRAIT.
 *
 * `uid` rather than a position, because a slot has to keep pointing at the same item
 * while the bag around it is sorted, filtered and added to. An index would mean every
 * equipped slot silently re-pointing at a different item the first time something was
 * removed from the bag — the kind of bug that shows up as a loadout the player did not
 * choose, weeks later, with nothing to trace it to.
 */
export interface TraitItem {
  uid: string;
  def: string;
  tier: TraitTier;
}

export const itemDef = (item: TraitItem): TraitDef | null => traitDef(item.def);

/** Does this item belong in that bench? */
export function fitsScope(item: TraitItem, scope: TraitScope): boolean {
  const def = itemDef(item);
  if (!def) return false;
  return scope === "hill" ? def.species === null : def.species === scope;
}

/* -------------------------------------------------------------- THE TOTALS */

export interface TraitTotals {
  atkPct: number;
  defPct: number;
  luckPct: number;
}

/**
 * Add a set of equipped traits up.
 *
 * Attack and defence SUM, which is what a player expects of a percentage and what makes
 * a second attack trait worth exactly as much as the first.
 *
 * The cooldown chances do NOT sum, and that is the one piece of arithmetic here worth
 * arguing about: two 22% chances are not a 44% chance, they are two draws — 1 − 0.78²,
 * which is 39%. Summing them would let five mythics guarantee the boon, and a certainty
 * is not what the trait says it gives. Independent chances also mean the second copy is
 * worth slightly less than the first, which is the right shape for a thing that could
 * otherwise be stacked to a sure thing.
 */
export function totalsOf(items: readonly TraitItem[]): TraitTotals {
  let atk = 0;
  let def = 0;
  let miss = 1;
  for (const item of items) {
    const d = itemDef(item);
    if (!d) continue;
    const tier = TRAIT_TIER[item.tier];
    if (!tier) continue;
    if (d.kind === "attack") atk += tier.stat;
    else if (d.kind === "defence") def += tier.stat;
    else miss *= 1 - tier.luck / 100;
  }
  return {
    atkPct: Math.min(ATK_CAP, atk),
    defPct: Math.min(DEF_CAP, def),
    luckPct: Math.min(LUCK_CAP, Math.round((1 - miss) * 100)),
  };
}

/** The anthill's five and a colony's five, added together for the engine. */
export function combine(a: TraitTotals, b: TraitTotals): TraitTotals {
  return {
    atkPct: Math.min(ATK_CAP, a.atkPct + b.atkPct),
    defPct: Math.min(DEF_CAP, a.defPct + b.defPct),
    // Two benches, still two independent draws.
    luckPct: Math.min(LUCK_CAP,
      Math.round((1 - (1 - a.luckPct / 100) * (1 - b.luckPct / 100)) * 100)),
  };
}

/* --------------------------------------------------------------- FINDING ONE */

/**
 * Roll a tier.
 *
 * Weighted, and the weights are what make a mythic feel like one: a mythic is about one
 * drop in a hundred, an exceptional about one in twenty-five. Deliberately steep — the
 * whole point of a tier is that the top of it is rare, and a table where the best outcome
 * turns up every tenth time has four tiers and a formality.
 */
export function rollTier(random: () => number): TraitTier {
  const total = TRAIT_TIERS.reduce((n, t) => n + TRAIT_TIER[t].weight, 0);
  let roll = random() * total;
  for (const t of TRAIT_TIERS) {
    roll -= TRAIT_TIER[t].weight;
    if (roll < 0) return t;
  }
  return "common";
}

/**
 * WHAT THE LUCKY HATCH WILL PAY OUT.
 *
 * The hatch is the ONLY source of a trait, and that is a deliberate design decision
 * rather than a gap: it is what gives the hatch a reason to exist beyond handing out
 * currency the player could have earned by playing. A match pays mycelium and a colony;
 * the hatch pays the thing you cannot get any other way.
 *
 * So the roll lives here, finished and tested, and the hatch is one caller away. Until it
 * is built the bag stays empty and every bench reads as five empty slots — which is the
 * honest state of the feature rather than a bug.
 */
export interface Drop { def: string; tier: TraitTier }

/** One larva. It buys exactly one hatch, which is the only thing larva buys. */
export const HATCH_COST = 1;

/**
 * One pull: a trait, and a tier for it.
 *
 * `random` is injected rather than reached for, so a test is not a coin flip and so the
 * hatch can later draw from whatever stream it wants to be verifiable against.
 *
 * `from` is the set of colonies whose traits can turn up, with `null` in it for the
 * universal ones. It is passed rather than assumed because the hatch draws only from what
 * the player HAS: a mythic for a colony they may never buy is a mythic they cannot use,
 * and the whole point of the top tier is that finding one is the best thing that happens.
 */
export function rollDrop(
  random: () => number, from: readonly (SpeciesId | null)[],
): Drop | null {
  const def = rollTrait(random, from);
  return def ? { def: def.id, tier: rollTier(random) } : null;
}

/**
 * Roll one trait out of the pools given.
 *
 * Uniform over the TRAITS, not over the pools: a colony's five and the universal eight are
 * different sizes, and picking a pool first and a trait second would make a universal
 * trait rarer the more colonies the player owns — a collection that gets worse as it grows.
 */
export function rollTrait(
  random: () => number, from: readonly (SpeciesId | null)[],
): TraitDef | null {
  const pool = TRAITS.filter((t) => from.includes(t.species));
  return pool[Math.floor(random() * pool.length)] ?? null;
}
