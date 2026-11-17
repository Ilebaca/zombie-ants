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
  ATK_CAP, LUCK_CAP, SLOT_STEP, TRAITS, TRAIT_SLOTS, TRAIT_TIER,
  TRAIT_TIERS, combine, effectText, fitsScope, rollDrop, rollTier, slotChapter, slotOpen,
  slotsOpen, tierOdds, totalsOf, traitDef, traitsFor,
} from "../traits";
import type { TraitItem, TraitTier } from "../traits";
import { ProfileStore, normalise } from "../profile";
import { MemoryStore } from "../storage";
import { SPECIES } from "../../engine";
import { ROAD_CHAPTER_STOPS, ROAD_LAST, stopColony } from "../road";
import { COLONY_START } from "../colony";

const item = (def: string, tier: TraitTier, uid = def): TraitItem => ({ uid, def, tier });

describe("the table", () => {
  it("shares the same three stat traits across every loadout", () => {
    expect(TRAITS.map(t => t.name)).toEqual(["Attack", "Defence", "CDR chance"]);
    for (const scope of ["hill", ...Object.keys(SPECIES)] as const) {
      expect(traitsFor(scope as "hill")).toEqual(TRAITS);
    }
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
   * TWO 10% CHANCES ARE NOT A 20% CHANCE. They are two draws — 1 − 0.9², which is 19%.
   * Independent chances retain diminishing returns as the player equips more copies.
   */
  it("draws cooldown chances independently rather than adding them", () => {
    const one = totalsOf([item(cd[0]!.id, "mythic", "a")]).luckPct;
    const two = totalsOf([item(cd[0]!.id, "mythic", "a"), item(cd[0]!.id, "mythic", "b")]).luckPct;
    expect(one).toBe(TRAIT_TIER.mythic.luck);
    expect(two).toBeGreaterThan(one);
    expect(two, "two chances were added together").toBeLessThan(one * 2);
    expect(two).toBe(Math.round((1 - (1 - one / 100) ** 2) * 100));
  });

  it("never lets a stack past the ceiling", () => {
    const many = Array.from({ length: 20 }, (_, i) => item(atk, "mythic", `a${i}`));
    expect(totalsOf(many).atkPct).toBe(ATK_CAP);
    const lucky = Array.from({length: 10}, (_, i) => item(cd[0]!.id, "mythic", `cdr${i}`));
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
  it("allows legacy species traits on any ant and the anthill", () => {
    const mine = traitDef("fire.sting")!;
    expect(fitsScope(item(mine.id, "rare"), "fire")).toBe(true);
    expect(fitsScope(item(mine.id, "rare"), "ghost")).toBe(true);
    expect(fitsScope(item(mine.id, "rare"), "hill")).toBe(true);
  });

  it("allows shared traits on any colony", () => {
    const shared = TRAITS.find((t) => t.species === null)!;
    expect(fitsScope(item(shared.id, "rare"), "hill")).toBe(true);
    expect(fitsScope(item(shared.id, "rare"), "fire")).toBe(true);
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

  /**
   * THE ODDS ARE PRINTED, so they have to be the odds. A stated chance that has drifted
   * from the table is the game lying about the only thing a player has to go on.
   */
  it("states odds that add up and match what it actually rolls", () => {
    const total = TRAIT_TIERS.reduce((n, t) => n + tierOdds(t), 0);
    expect(total).toBeCloseTo(100, 6);

    let seed = 999;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const seen: Record<string, number> = {};
    const runs = 40_000;
    for (let i = 0; i < runs; i++) {
      const t = rollTier(rnd);
      seen[t] = (seen[t] ?? 0) + 1;
    }
    // Within a point and a half: forty thousand rolls off a cheap LCG lands close, and a
    // tighter band here would be a test of the generator rather than of the table.
    for (const t of TRAIT_TIERS) {
      const measured = (seen[t] ?? 0) / runs * 100;
      expect(Math.abs(measured - tierOdds(t)), `${t} does not roll at its stated odds`)
        .toBeLessThan(1.5);
    }
  });

  /** Common quite high, mythic very small, and strictly descending in between. */
  it("makes every tier rarer than the one below it", () => {
    expect(tierOdds("common")).toBeGreaterThanOrEqual(50);
    expect(tierOdds("mythic")).toBeLessThanOrEqual(2);
    for (let i = 1; i < TRAIT_TIERS.length; i++) {
      expect(tierOdds(TRAIT_TIERS[i]!)).toBeLessThan(tierOdds(TRAIT_TIERS[i - 1]!));
    }
  });

  it("pays a trait of the kind it was asked for", () => {
    const universal = rollDrop(feed([0.1, 0.9]), [null]);
    expect(traitDef(universal!.def)?.species).toBeNull();
    const mine = rollDrop(feed([0.1, 0.9]), ["carpenter"]);
    expect(traitDef(mine!.def)?.species).toBeNull();
  });
});

describe("the bag and the benches", () => {
  const store = (): ProfileStore => new ProfileStore(new MemoryStore());
  const rich = (): ProfileStore => {
    const s = store();
    // Chapter 1 opens traits and the FIRST slot; the fifth opens at chapter 50, which is
    // the end of the road (ROAD_LAST). These tests are about the bench mechanics rather
    // than the gate, so they run with all five open.
    s.update((p) => { p.colony = ROAD_LAST; });
    return s;
  };

  it("opens traits and the hatch immediately for a new colony", () => {
    expect(store().traitsOpen()).toBe(true);
    expect(store().hatchOpen()).toBe(true);
    expect(store().slotsOpen()).toBe(1);
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

  it("moves any trait between anthill and species", () => {
    const s = rich();
    const mine = traitDef("fire.sting")!;
    const one = s.findTrait(mine.id, "rare")!;
    expect(s.equipTrait("hill", one.uid)).toBe(true);
    expect(s.equipTrait("ghost", one.uid)).toBe(true);
    expect(s.equipTrait("fire", one.uid)).toBe(true);
    expect(s.bench("ghost")[0]).toBeNull();
  });

  it("refuses a sixth trait rather than pushing one out", () => {
    const s = rich();
    const shared = TRAITS.filter((t) => t.species === null);
    const uids = Array.from({length: TRAIT_SLOTS + 1}, () => s.findTrait(shared[0]!.id, "common")!.uid);
    for (let i = 0; i < TRAIT_SLOTS; i++) expect(s.equipTrait("hill", uids[i]!)).toBe(true);
    expect(s.equipTrait("hill", uids[TRAIT_SLOTS]!), "a sixth went in").toBe(false);
    expect(s.bench("hill").filter(Boolean).length).toBe(TRAIT_SLOTS);
  });

  it("will not wear one item in two slots", () => {
    const s = rich();
    const one = s.findTrait(TRAITS.find((t) => t.species === null)!.id, "rare")!;
    expect(s.equipTrait("hill", one.uid, 0)).toBe(true);
    expect(s.equipTrait("hill", one.uid, 1)).toBe(true);
    expect(s.bench("hill")[0]).toBeNull();
    expect(s.bench("hill")[1]?.uid).toBe(one.uid);
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

  it("accepts a species trait in the anthill while deduplicating its copy", () => {
    const mine = traitDef("fire.sting")!;
    const p = normalise({
      bag: [{ uid: "t1", def: mine.id, tier: "rare" }],
      wearing: { hill: ["t1", null, null, null, null], fire: ["t1", null, null, null, null] },
    });
    expect(p.wearing.hill?.[0]).toBe("t1");
    expect(p.wearing.fire?.[0]).toBeNull();
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

/**
 * SLOTS OPEN ONE EVERY TEN CHAPTERS, on both benches.
 *
 * Five handed over at once is a bench a player fills in an afternoon and never looks at
 * again — the choice a trait is supposed to be only exists while there are more traits
 * than room.
 */
describe("slots opening immediately, then every five chapters", () => {
  const at = (chapter:number):ProfileStore => {
    const s=new ProfileStore(new MemoryStore());
    s.update(p=>{p.colony=chapter<=1?COLONY_START:stopColony((chapter-1)*ROAD_CHAPTER_STOPS);});return s;
  };
  it("uses chapter milestones 0, 5, 10, 15 and 20", () => {
    expect(SLOT_STEP).toBe(5);
    expect([0,1,2,3,4].map(slotChapter)).toEqual([0,5,10,15,20]);
    for(const [chapter,open] of [[0,1],[1,1],[4,1],[5,2],[9,2],[10,3],[14,3],[15,4],[19,4],[20,5],[50,5],[500,5]]) {
      expect(slotsOpen(chapter!)).toBe(open);
      expect(slotsOpen(chapter!,true)).toBe(open);
    }
    expect(slotOpen(-1,20)).toBe(false);
    expect(slotOpen(4,19)).toBe(false);
    expect(slotOpen(4,20)).toBe(true);
  });
  it("refuses closed slots on both loadouts", () => {
    const s=at(1);
    const uids=TRAITS.filter(t=>t.species===null).slice(0,2).map(t=>s.findTrait(t.id,"common")!.uid);
    for(const scope of ["hill","fire"] as const) {
      expect(s.equipTrait(scope,uids[0]!,0)).toBe(true);
      expect(s.equipTrait(scope,uids[1]!,1)).toBe(false);
    }
    expect(s.bench("hill")[0]).toBeNull();
    expect(s.bench("fire")[0]?.uid).toBe(uids[0]);
  });
  it("does not change milestones after buying a pass", () => {
    const s=at(1);s.grantPass();
    expect(s.slotsOpen()).toBe(1);
    s.update(p=>{p.colony=stopColony(4*ROAD_CHAPTER_STOPS);});
    expect(s.slotsOpen()).toBe(2);
    expect(s.nextSlotChapter()).toBe(10);
    expect(at(20).nextSlotChapter()).toBeNull();
  });
  it("equips every rarity on a level-zero species", () => {
    const s=at(1);
    for(const tier of TRAIT_TIERS) {
      const one=s.findTrait(traitDef("fire.sting")!.id,tier)!;
      expect(s.equipTrait("bullet",one.uid,0)).toBe(true);
      expect(s.bench("bullet")[0]?.uid).toBe(one.uid);
      expect(s.get().research.bullet?.level??0).toBe(0);
    }
  });
  it("moves one owned copy between pages without double-counting or losing it on reload", () => {
    const memory=new MemoryStore(),s=new ProfileStore(memory);
    const one=s.findTrait(TRAITS.find(t=>t.species===null)!.id,"mythic")!;
    expect(s.equipTrait("hill",one.uid,0)).toBe(true);
    expect(s.equipTrait("bullet",one.uid,0)).toBe(true);
    expect(s.bench("hill")[0]).toBeNull();
    expect(s.bag).toHaveLength(1);
    const reopened=new ProfileStore(memory);
    expect(reopened.bench("bullet")[0]?.uid).toBe(one.uid);
    expect(reopened.bench("hill")[0]).toBeNull();
    expect(reopened.modsFor("bullet").you.atkPct).toBe(TRAIT_TIER.mythic.stat);
  });
  it("keeps an equipped copy saved when a slot closes after troop losses", () => {
    const s=at(5);
    const held=Array.from({length:2},()=>s.findTrait("u.mandible","mythic")!);
    held.forEach(i=>expect(s.equipTrait("hill",i.uid)).toBe(true));
    const both=s.benchTotals("hill");
    s.update(p=>{p.colony=COLONY_START;});
    expect(s.slotsOpen()).toBe(1);
    expect(s.bench("hill").filter(Boolean)).toHaveLength(2);
    expect(s.benchTotals("hill").atkPct).toBeLessThan(both.atkPct);
    s.update(p=>{p.colony=stopColony(4*ROAD_CHAPTER_STOPS);});
    expect(s.benchTotals("hill")).toEqual(both);
  });
});

it("scales individual CDR traits evenly up to a ten-percent Mythic", () => {
  expect(TRAIT_TIERS.map(tier => TRAIT_TIER[tier].luck)).toEqual([2,4,6,8,10]);
  const cdr = TRAITS.find(trait => trait.kind === "cooldown")!;
  for (const tier of TRAIT_TIERS) {
    expect(totalsOf([item(cdr.id,tier)]).luckPct).toBe(TRAIT_TIER[tier].luck);
  }
});

it("recalculates an existing CDR trait and its power on equip, remove and reload", () => {
  const memory = new MemoryStore(), s = new ProfileStore(memory);
  const cdr = s.findTrait("fire.reburn","mythic")!;
  const before = s.powerFor("fire").total;
  expect(s.equipTrait("fire",cdr.uid,0)).toBe(true);
  expect(s.modsFor("fire").you.boonPct).toBe(10);
  expect(s.powerFor("fire").total - before).toBe(20);
  const reopened = new ProfileStore(memory);
  expect(reopened.modsFor("fire").you.boonPct).toBe(10);
  expect(reopened.powerFor("fire").total).toBe(before + 20);
  expect(reopened.unequipTrait("fire",0)).toBe(true);
  expect(reopened.powerFor("fire").total).toBe(before);
});

it("migrates mixed legacy copies without losing rarity, uid, loadouts or fusion eligibility", () => {
  const saved = normalise({
    bag: [
      {uid:"t1",def:"fire.sting",tier:"rare"},
      {uid:"t2",def:"carpenter.galleries",tier:"mythic"},
      {uid:"t3",def:"ghost.relay",tier:"common"},
      {uid:"t4",def:"u.raid",tier:"common"},
      {uid:"t5",def:"pharaoh.budding",tier:"common"},
    ],
    wearing: {fire:["t1"], hill:["t2"]},
  });
  expect(saved.bag.map(i=>[i.uid,i.def,i.tier])).toEqual([
    ["t1","u.mandible","rare"],["t2","u.cuticle","mythic"],
    ["t3","u.gland","common"],["t4","u.mandible","common"],["t5","u.gland","common"],
  ]);
  const memory = new MemoryStore();
  const store = new ProfileStore(memory);
  store.update(p => Object.assign(p, saved, {pheromone:100000}));
  expect(store.bench("fire")[0]?.uid).toBe("t1");
  expect(store.bench("hill")[0]?.uid).toBe("t2");
  expect(store.equipTrait("hill","t1",0)).toBe(true);
  expect(store.bench("fire")[0]).toBeNull();
  expect(store.spares("common")).toHaveLength(3);
  expect(store.fuse("common",()=>0)?.tier).toBe("uncommon");
  const reopened = new ProfileStore(memory);
  expect(reopened.bag.some(i=>i.uid==="t1")).toBe(true);
  expect(reopened.bag.some(i=>i.uid==="t2")).toBe(true);
  expect(reopened.bench("hill")[0]?.uid).toBe("t1");
});

it("moves each stat and rarity through every ant and anthill with exactly one owner", () => {
  const memory = new MemoryStore(), store = new ProfileStore(memory);
  const scopes = ["hill", ...Object.keys(SPECIES)] as Array<"hill" | keyof typeof SPECIES>;
  for (const def of TRAITS) for (const tier of TRAIT_TIERS) {
    const copy=store.findTrait(def.id,tier)!;
    for (const scope of scopes) {
      expect(store.equipTrait(scope,copy.uid,0)).toBe(true);
      expect(Object.values(store.get().wearing).flat().filter(uid=>uid===copy.uid)).toHaveLength(1);
      expect(new ProfileStore(memory).bench(scope)[0]?.uid).toBe(copy.uid);
    }
  }
});
