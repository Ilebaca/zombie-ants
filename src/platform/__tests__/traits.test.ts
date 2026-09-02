/**
 * TRAITS.
 *
 * What matters here is not that a percentage is added up — it is the arithmetic that is
 * easy to get wrong and impossible to see: the cooldown chances that must NOT sum, the
 * caps, the uid that has to survive a bag being sorted and thinned, and a save from
 * another build being read back into a consistent bag and bench.
 */
import { describe, expect, it } from "vitest";
import {
  ATK_CAP, LUCK_CAP, TRAITS, TRAIT_SLOTS, TRAIT_TIER, TRAIT_TIERS, combine, effectText,
  fitsScope, rollDrop, rollTier, totalsOf, traitDef, traitsFor,
} from "../traits";
import type { TraitItem, TraitTier } from "../traits";
import { ProfileStore, normalise } from "../profile";
import { MemoryStore } from "../storage";
import { SPECIES } from "../../engine";

const item = (def: string, tier: TraitTier, uid = def): TraitItem => ({ uid, def, tier });

describe("the table", () => {
  it("gives every colony its own five, and the anthill its own", () => {
    for (const id of Object.keys(SPECIES) as (keyof typeof SPECIES)[]) {
      expect(traitsFor(id).length, `${id} has no traits of its own`).toBe(TRAIT_SLOTS);
    }
    // Enough universal traits to fill the anthill's five with different ones.
    expect(traitsFor("hill").length).toBeGreaterThanOrEqual(TRAIT_SLOTS);
  });

  it("has no two traits sharing an id", () => {
    const ids = TRAITS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A trait with no line about it is a stat with a name on it, which is the one thing the
  // rest of this game does not do.
  it("says what every trait is, in words", () => {
    for (const t of TRAITS) {
      expect(t.name.length, `${t.id} has no name`).toBeGreaterThan(2);
      expect(t.note.length, `${t.id} explains nothing`).toBeGreaterThan(20);
    }
  });

  /** Higher tier, higher strength — in both directions. Nothing else defines a tier. */
  it("makes every tier stronger than the one below it", () => {
    for (let i = 1; i < TRAIT_TIERS.length; i++) {
      const lower = TRAIT_TIER[TRAIT_TIERS[i - 1] as TraitTier];
      const upper = TRAIT_TIER[TRAIT_TIERS[i] as TraitTier];
      expect(upper.stat, `${upper.id} is no stronger than ${lower.id}`).toBeGreaterThan(lower.stat);
      expect(upper.luck, `${upper.id} is no luckier than ${lower.id}`).toBeGreaterThan(lower.luck);
      // ...and rarer, or the tiers are five names for one thing.
      expect(upper.weight, `${upper.id} is not rarer than ${lower.id}`).toBeLessThan(lower.weight);
    }
  });

  it("says what an item does in the units the player reads", () => {
    const atk = TRAITS.find((t) => t.kind === "attack");
    const cd = TRAITS.find((t) => t.kind === "cooldown");
    expect(effectText(atk!, "mythic")).toBe(`+${TRAIT_TIER.mythic.stat}% attack`);
    expect(effectText(cd!, "common")).toContain(`${TRAIT_TIER.common.luck}%`);
  });
});

describe("adding a bench up", () => {
  const atk = TRAITS.find((t) => t.kind === "attack" && t.species === null)!.id;
  const def = TRAITS.find((t) => t.kind === "defence" && t.species === null)!.id;
  const cd = TRAITS.filter((t) => t.kind === "cooldown" && t.species === null);

  it("sums attack and defence", () => {
    const t = totalsOf([item(atk, "rare", "a"), item(atk, "common", "b"), item(def, "mythic", "c")]);
    expect(t.atkPct).toBe(TRAIT_TIER.rare.stat + TRAIT_TIER.common.stat);
    expect(t.defPct).toBe(TRAIT_TIER.mythic.stat);
  });

  /**
   * TWO 22% CHANCES ARE NOT A 44% CHANCE. They are two draws — 1 − 0.78², which is 39%.
   * Summing them would let five mythics GUARANTEE the boon, and a certainty is not what
   * the trait says it gives; it would also make the fifth copy worth as much as the
   * first, when the whole shape of a stacked chance is that it is worth less.
   */
  it("draws cooldown chances independently rather than adding them", () => {
    const one = totalsOf([item(cd[0]!.id, "mythic", "a")]).luckPct;
    const two = totalsOf([item(cd[0]!.id, "mythic", "a"), item(cd[1]!.id, "mythic", "b")]).luckPct;
    expect(one).toBe(TRAIT_TIER.mythic.luck);
    expect(two).toBeGreaterThan(one);
    expect(two, "two chances were added together").toBeLessThan(one * 2);
    expect(two).toBe(Math.round((1 - (1 - one / 100) ** 2) * 100));
  });

  it("never lets a stack past the ceiling", () => {
    const many = Array.from({ length: 20 }, (_, i) => item(atk, "mythic", `a${i}`));
    expect(totalsOf(many).atkPct).toBe(ATK_CAP);
    const lucky = cd.flatMap((c) => [item(c.id, "mythic", `${c.id}1`), item(c.id, "mythic", `${c.id}2`)]);
    expect(totalsOf([...lucky, ...lucky, ...lucky]).luckPct).toBe(LUCK_CAP);
  });

  it("ignores an item whose trait no longer exists", () => {
    expect(totalsOf([item("nothing.at.all", "mythic", "x")])).toEqual(
      { atkPct: 0, defPct: 0, luckPct: 0 });
  });

  // The anthill's five and a colony's five: still two independent draws for the cooldown.
  it("combines two benches the same way", () => {
    const a = { atkPct: 4, defPct: 0, luckPct: 20 };
    const b = { atkPct: 3, defPct: 2, luckPct: 20 };
    const both = combine(a, b);
    expect(both.atkPct).toBe(7);
    expect(both.luckPct).toBe(36);
    expect(both.luckPct, "the two benches' chances were added").toBeLessThan(40);
  });
});

describe("what fits where", () => {
  it("keeps a colony's trait out of the anthill and everyone else's colony", () => {
    const mine = TRAITS.find((t) => t.species === "fire")!;
    expect(fitsScope(item(mine.id, "rare"), "fire")).toBe(true);
    expect(fitsScope(item(mine.id, "rare"), "ghost")).toBe(false);
    expect(fitsScope(item(mine.id, "rare"), "hill")).toBe(false);
  });

  it("keeps a universal trait out of a colony", () => {
    const shared = TRAITS.find((t) => t.species === null)!;
    expect(fitsScope(item(shared.id, "rare"), "hill")).toBe(true);
    expect(fitsScope(item(shared.id, "rare"), "fire")).toBe(false);
  });
});

describe("finding one", () => {
  /** A stream that walks a fixed list, so a roll is a fact rather than a coin flip. */
  const feed = (values: number[]): (() => number) => {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
  };

  it("rolls the common tier far more often than the mythic one", () => {
    let common = 0;
    let mythic = 0;
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 8000; i++) {
      const t = rollTier(rnd);
      if (t === "common") common++;
      if (t === "mythic") mythic++;
    }
    expect(common).toBeGreaterThan(mythic * 20);
    // ...and a mythic still turns up, or the top tier is decoration.
    expect(mythic).toBeGreaterThan(0);
  });

  it("pays a trait of the kind it was asked for", () => {
    const universal = rollDrop(feed([0.1, 0.9]), [null]);
    expect(traitDef(universal!.def)?.species).toBeNull();
    const mine = rollDrop(feed([0.1, 0.9]), ["weaver"]);
    expect(traitDef(mine!.def)?.species).toBe("weaver");
  });
});

describe("the bag and the benches", () => {
  const store = (): ProfileStore => new ProfileStore(new MemoryStore());
  const rich = (): ProfileStore => {
    const s = store();
    // Chapter 10 is the gate; the colony is what decides the chapter.
    s.update((p) => { p.colony = 2_000_000; });
    return s;
  };

  it("keeps traits shut until the chapter that opens them", () => {
    expect(store().traitsOpen()).toBe(false);
    expect(rich().traitsOpen()).toBe(true);
  });

  it("mints a uid per item, and never the same one twice", () => {
    const s = rich();
    const shared = TRAITS.filter((t) => t.species === null);
    const a = s.findTrait(shared[0]!.id, "rare");
    const b = s.findTrait(shared[0]!.id, "rare");
    expect(a?.uid).not.toBe(b?.uid);
    expect(s.bag.length).toBe(2);
  });

  it("refuses a trait that is not in the table", () => {
    const s = rich();
    expect(s.findTrait("no.such.trait", "rare")).toBeNull();
    expect(s.bag.length).toBe(0);
  });

  it("equips into the first free slot, and takes one off again", () => {
    const s = rich();
    const shared = TRAITS.filter((t) => t.species === null);
    const one = s.findTrait(shared[0]!.id, "mythic")!;
    expect(s.equipTrait("hill", one.uid)).toBe(true);
    expect(s.bench("hill")[0]?.uid).toBe(one.uid);
    // It is worn, so it is not spare any more — but it is still in the bag.
    expect(s.spare("hill").some((i) => i.uid === one.uid)).toBe(false);
    expect(s.bag.length).toBe(1);
    expect(s.unequipTrait("hill", 0)).toBe(true);
    expect(s.bench("hill")[0]).toBeNull();
    expect(s.spare("hill").length).toBe(1);
  });

  it("refuses an item that does not belong in that bench", () => {
    const s = rich();
    const mine = TRAITS.find((t) => t.species === "fire")!;
    const one = s.findTrait(mine.id, "rare")!;
    expect(s.equipTrait("hill", one.uid)).toBe(false);
    expect(s.equipTrait("ghost", one.uid)).toBe(false);
    expect(s.equipTrait("fire", one.uid)).toBe(true);
  });

  it("refuses a sixth trait rather than pushing one out", () => {
    const s = rich();
    const shared = TRAITS.filter((t) => t.species === null);
    const uids = shared.slice(0, TRAIT_SLOTS + 1)
      .map((t) => s.findTrait(t.id, "common")!.uid);
    for (let i = 0; i < TRAIT_SLOTS; i++) expect(s.equipTrait("hill", uids[i]!)).toBe(true);
    expect(s.equipTrait("hill", uids[TRAIT_SLOTS]!), "a sixth went in").toBe(false);
    expect(s.bench("hill").filter(Boolean).length).toBe(TRAIT_SLOTS);
  });

  it("will not wear one item in two slots", () => {
    const s = rich();
    const one = s.findTrait(TRAITS.find((t) => t.species === null)!.id, "rare")!;
    expect(s.equipTrait("hill", one.uid, 0)).toBe(true);
    expect(s.equipTrait("hill", one.uid, 1)).toBe(false);
  });

  /** Throwing one away has to take it off the bench in the SAME write. */
  it("empties the slot of a trait that is thrown away", () => {
    const s = rich();
    const one = s.findTrait(TRAITS.find((t) => t.species === null)!.id, "rare")!;
    s.equipTrait("hill", one.uid);
    expect(s.dropTrait(one.uid)).toBe(true);
    expect(s.bag.length).toBe(0);
    expect(s.bench("hill").filter(Boolean).length).toBe(0);
  });
});

describe("reading a save back", () => {
  it("drops an item whose trait is gone and empties the slot that wore it", () => {
    const p = normalise({
      bag: [{ uid: "t1", def: "no.longer.exists", tier: "mythic" }],
      wearing: { hill: ["t1", null, null, null, null] },
    });
    expect(p.bag).toEqual([]);
    expect(p.wearing.hill).toEqual([null, null, null, null, null]);
  });

  it("empties a slot pointing at nothing", () => {
    const p = normalise({ bag: [], wearing: { hill: ["t9", null, null, null, null] } });
    expect(p.wearing.hill?.[0]).toBeNull();
  });

  it("refuses an item worn in a bench it does not belong to", () => {
    const mine = TRAITS.find((t) => t.species === "fire")!;
    const p = normalise({
      bag: [{ uid: "t1", def: mine.id, tier: "rare" }],
      wearing: { hill: ["t1", null, null, null, null], fire: ["t1", null, null, null, null] },
    });
    expect(p.wearing.hill?.[0], "a colony's trait was worn in the anthill").toBeNull();
    expect(p.wearing.fire?.[0]).toBe("t1");
  });

  /**
   * ONE ITEM CANNOT BE IN TWO SLOTS. A save that says otherwise shows the same trait
   * twice on the bench and counts it twice in the total, which is a colony quietly
   * fighting with a stat it does not have.
   */
  it("wears one item once, however many slots claim it", () => {
    const shared = TRAITS.find((t) => t.species === null)!;
    const p = normalise({
      bag: [{ uid: "t1", def: shared.id, tier: "mythic" }],
      wearing: { hill: ["t1", "t1", "t1", null, null] },
    });
    expect(p.wearing.hill?.filter((s) => s === "t1").length).toBe(1);
  });

  it("refuses a tier that is not one of the five", () => {
    const shared = TRAITS.find((t) => t.species === null)!;
    expect(normalise({ bag: [{ uid: "t1", def: shared.id, tier: "legendary" }] }).bag).toEqual([]);
  });

  it("throws away a duplicate uid rather than keeping both", () => {
    const shared = TRAITS.find((t) => t.species === null)!;
    const p = normalise({ bag: [
      { uid: "t1", def: shared.id, tier: "rare" },
      { uid: "t1", def: shared.id, tier: "mythic" },
    ] });
    expect(p.bag.length).toBe(1);
  });

  /**
   * A save whose counter was lost must not mint a uid that is already in use: two items
   * with one uid is one item the player can never take off.
   */
  it("moves the counter past every uid it can see", () => {
    const shared = TRAITS.find((t) => t.species === null)!;
    const p = normalise({ traitSeq: 0, bag: [{ uid: "t41", def: shared.id, tier: "rare" }] });
    expect(p.traitSeq).toBeGreaterThan(41);
  });

  it("gives every bench five slots, however many the save had", () => {
    const p = normalise({ wearing: { hill: ["a", "b"] } });
    expect(p.wearing.hill?.length).toBe(TRAIT_SLOTS);
    for (const id of Object.keys(SPECIES)) expect(p.wearing[id]?.length).toBe(TRAIT_SLOTS);
  });
});
