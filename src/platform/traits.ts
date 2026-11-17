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
 * WHERE THEY GO. Every trait can be equipped by any species, at any research level.
 * The same traits can also be equipped on the Anthill. Each owned copy is equipped in
 * one place at a time, so moving it never doubles its contribution.
 *
 * WHAT THE ENGINE SEES is three finished percentages (PlayerMods.atkPct / defPct /
 * boonPct). The engine owns what a percentage DOES; this file owns what a tier is WORTH,
 * because that is a progression decision and it will be retuned.
 */
import { SPECIES, TIERS, TIER_IDS } from "../engine";
import type { SpeciesId, TierId } from "../engine";

/* ------------------------------------------------------------------- TIERS */

/**
 * The ladder is the game's ONE rarity ladder (`engine/tiers.ts`), re-exported under the
 * names this file has always used so nothing that reads traits has to change. What a rung
 * is called and what colour it is are decided there; what it is WORTH is decided here.
 */
export const TRAIT_TIERS = TIER_IDS;
export type TraitTier = TierId;

export interface TraitTierDef {
  id: TraitTier;
  name: string;
  /** The colour the tier is known by. Milan named these; they are not negotiable. */
  colour: string;
  /** Attack or defence, in percent. */
  stat: number;
  /** Cooldown chance, in percent. */
  luck: number;
  /**
   * The chance of a hatch landing on this tier, in percent.
   *
   * A percentage rather than a relative weight, and the five add up to a hundred, because
   * this number is PRINTED on the hatch screen: a player deciding whether to keep opening
   * has to be told what they are chasing, and a weight of 1.6 out of 171.6 is not
   * something anybody can be told. `tierOdds()` still divides by the total rather than
   * reading this straight, so a retune that stops summing to a hundred cannot quietly put
   * a wrong figure on screen.
   */
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
/** What a rung is worth and how often it lands. The name and the colour come from the ladder. */
const WORTH: Record<TraitTier, { stat: number; luck: number; weight: number }> = {
  common:      { stat: 1, luck: 2,  weight: 60 },
  uncommon:    { stat: 2, luck: 4,  weight: 25 },
  rare:        { stat: 3, luck: 6, weight: 10 },
  exceptional: { stat: 5, luck: 8, weight: 4 },
  mythic:      { stat: 8, luck: 10, weight: 1 },
};

export const TRAIT_TIER: Record<TraitTier, TraitTierDef> = Object.fromEntries(
  TRAIT_TIERS.map((id) => [id, {
    id, name: TIERS[id].name, colour: TIERS[id].colour, ...WORTH[id],
  }]),
) as Record<TraitTier, TraitTierDef>;

/** Slots, per colony and for the anthill. Five each, as designed. */
export const TRAIT_SLOTS = 5;

/** Five slots: available immediately, then at chapters 5, 10, 15 and 20. */
export const SLOT_STEP = 5;
export const slotChapter = (i: number): number => i * SLOT_STEP;
export function slotsOpen(chapter: number, _pass = false): number {
  return Math.max(1, Math.min(TRAIT_SLOTS, Math.floor(chapter / SLOT_STEP) + 1));
}

/** Whether one slot is open. The only question the screens actually ask. */
export const slotOpen = (i: number, chapter: number, pass = false): boolean =>
  i >= 0 && i < slotsOpen(chapter, pass);

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

/** Traits, inventory and the lucky hatch are available from the first chapter. */
export const TRAITS_CHAPTER = 1;

/* ------------------------------------------------------------------ TRAITS */

export type TraitKind = "attack" | "defence" | "cooldown";

export interface TraitDef {
  id: string;
  kind: TraitKind;
  name: string;
  /** What it is, in one line — real biology, like everything else in this game. */
  note: string;
  /** All traits are universal; retained for saved reward metadata. */
  species: SpeciesId | null;
  /** Shared stat artwork. */
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

/** Three shared traits. Copies differ by rarity and uid, never by species. */
export const TRAITS: readonly TraitDef[] = [
  { id: "u.mandible", kind: "attack", name: "Attack", icon: "attack", species: null,
    note: "Increases attack when equipped on any ant or the anthill." },
  { id: "u.cuticle", kind: "defence", name: "Defence", icon: "defence", species: null,
    note: "Increases defence when equipped on any ant or the anthill." },
  { id: "u.gland", kind: "cooldown", name: "CDR chance", icon: "clock", species: null,
    note: "A chance at match start to reduce ability cooldown by one turn." },
];

/** Old saves and fixed rewards retain their ids; resolve them by their actual stat. */
const LEGACY_KIND: Readonly<Record<string, TraitKind>> = {
  "u.mandible": "attack",
  "u.raid": "attack",
  "u.majors": "attack",
  "u.cuticle": "defence",
  "u.rampart": "defence",
  "u.brood": "defence",
  "u.gland": "cooldown",
  "u.trophallaxis": "cooldown",
  "ghost.silent": "attack",
  "ghost.ambush": "attack",
  "ghost.mask": "defence",
  "ghost.fissure": "defence",
  "ghost.relay": "cooldown",
  "pharaoh.swarmfound": "attack",
  "pharaoh.persist": "attack",
  "pharaoh.satellite": "defence",
  "pharaoh.polygyny": "defence",
  "pharaoh.budding": "cooldown",
  "leafcutter.shear": "attack",
  "leafcutter.column": "attack",
  "leafcutter.fungus": "defence",
  "leafcutter.waste": "defence",
  "leafcutter.garden": "cooldown",
  "fire.sting": "attack",
  "fire.mass": "attack",
  "fire.raft": "defence",
  "fire.mound": "defence",
  "fire.reburn": "cooldown",
  "army.bivouac": "attack",
  "army.shear2": "attack",
  "army.bridge": "defence",
  "army.column2": "defence",
  "army.nomad": "cooldown",
  "carpenter.excavate": "attack",
  "carpenter.formic": "attack",
  "carpenter.galleries": "defence",
  "carpenter.heartwood": "defence",
  "carpenter.repair": "cooldown",
  "bullet.poneratoxin": "attack",
  "bullet.solitary": "attack",
  "bullet.armour": "defence",
  "bullet.buttress": "defence",
  "bullet.venom": "cooldown",
  "demon.swarmdrive": "attack",
  "demon.terror": "attack",
  "demon.carapace": "defence",
  "demon.retreat": "defence",
  "demon.fervour": "cooldown"
};
const BY_KIND = new Map(TRAITS.map(t => [t.kind, t]));
export const traitDef = (id: string): TraitDef | null =>
  BY_KIND.get(LEGACY_KIND[id] as TraitKind) ?? null;

/** Every loadout draws from the same inventory. */
export const traitsFor = (_scope: TraitScope): TraitDef[] => [...TRAITS];

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
export function fitsScope(item: TraitItem, _scope: TraitScope): boolean {
  return itemDef(item) !== null;
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
 * arguing about: two 10% chances are not a 20% chance, they are two draws — 1 − 0.9²,
 * which is 19%. Independent chances mean the second copy is
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

const tierTotal = (): number =>
  TRAIT_TIERS.reduce((n, t) => n + TRAIT_TIER[t].weight, 0);

/**
 * THE ODDS, AS THE PLAYER IS TOLD THEM.
 *
 * Derived from the same table the roll uses rather than written out beside it, because a
 * printed chance that has drifted from the real one is worse than none — it is the game
 * lying about the only thing a player has to go on when deciding whether to open another.
 *
 * 60 / 25 / 10 / 4 / 1. Common most of the time so a hatch nearly always gives something;
 * mythic one in a hundred so finding one is the best thing that happens in the feature,
 * and a win pays one larva, so it is about a hundred wins of chase. That is deliberately
 * long: the benches hold fifty slots across ten colonies, so the chase is never over and
 * every tier below the top keeps arriving while it runs.
 */
export function tierOdds(tier: TraitTier): number {
  return (TRAIT_TIER[tier].weight / tierTotal()) * 100;
}

/**
 * Roll a tier.
 *
 * Weighted, and the weights are what make a mythic feel like one. Deliberately steep —
 * the whole point of a tier is that the top of it is rare, and a table where the best
 * outcome turns up every tenth time has four tiers and a formality.
 */
export function rollTier(random: () => number): TraitTier {
  const total = tierTotal();
  let roll = random() * total;
  for (const t of TRAIT_TIERS) {
    roll -= TRAIT_TIER[t].weight;
    if (roll < 0) return t;
  }
  return "common";
}

/** A trait roll shared by lucky hatches and premium Colony Road rewards. */
export interface Drop { def: string; tier: TraitTier }

/** One larva. It buys exactly one hatch, which is the only thing larva buys. */
export const HATCH_COST = 1;

/**
 * WHAT A WIN PAYS TOWARD THE CHASE.
 *
 * Larva used to be bought and nothing else, which made the hatch a shop with one shelf:
 * a player who never spent money never opened one, so the whole collection — fifty slots
 * across ten benches — was closed to them. A win pays exactly one, so a hatch is a thing
 * you PLAY for, the odds above are a chase somebody is actually on, and the shop sells
 * the same thing faster rather than the only way in.
 *
 * One, not more, and only on a win. At two or three matches a day winning about half
 * (PROJECT_GUIDE.md §8c) that is roughly a hatch a day: a mythic at one in a hundred is about
 * three months of play, and every tier below it arrives while that runs.
 */
export const WIN_LARVA = 1;

/**
 * One pull: a trait, and a tier for it.
 *
 * `random` is injected rather than reached for, so a test is not a coin flip and so the
 * hatch can later draw from whatever stream it wants to be verifiable against.
 *
 * Nonempty legacy pool requests all draw from the same three shared traits.
 */
export function rollDrop(
  random: () => number, from: readonly (SpeciesId | null)[],
): Drop | null {
  const def = rollTrait(random, from);
  return def ? { def: def.id, tier: rollTier(random) } : null;
}

/** Roll a shared stat trait independently of the player\'s species collection. */
export function rollTrait(
  random: () => number, from: readonly (SpeciesId | null)[],
): TraitDef | null {
  const pool = from.length ? TRAITS : [];
  return pool[Math.floor(random() * pool.length)] ?? null;
}
