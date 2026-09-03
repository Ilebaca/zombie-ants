/**
 * WHERE A CURRENCY GOES ONCE THERE IS NOTHING LEFT TO BUY.
 *
 * Both spendable sinks are FINITE — chambers, colonies and the granary for mycelium; every
 * research level on all nine colonies for pheromone — and both are emptied well inside the
 * road by the player the economy is tuned for. From those days each currency is a number
 * going up, which is what these two trades exist to stop.
 *
 * What is worth testing here is not that a number goes down. It is that the trade cannot
 * come apart: spending without producing takes something for nothing, producing without
 * spending is free traits for ever, and burning a trait the player is WEARING would take a
 * loadout off a colony to pay for a roll.
 */
import { describe, expect, it } from "vitest";
import {
  FUSE_COST, FUSE_DEALS, FUSE_FUEL, LARVA_MYCEL, fuseDeal, nextTier,
} from "../exchange";
import { ProfileStore } from "../profile";
import { MemoryStore } from "../storage";
import { TIER_IDS } from "../../engine";
import { TRAITS_CHAPTER } from "../traits";
import type { TraitTier } from "../traits";
import { ROAD_CHAPTERS, ROAD_LAST, stopColony } from "../road";

const store = (mycel = 0, pheromone = 0): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.mycel = mycel; p.pheromone = pheromone; p.larva = 0; });
  return s;
};

/** The colony a player has when they reach this chapter — the trait gate is a chapter. */
const colonyAtChapter = (chapter: number): number =>
  stopColony(Math.ceil((chapter / ROAD_CHAPTERS) * 100)) || ROAD_LAST;

/** n spare traits of one tier, taken from the colonies this player actually has. */
const fill = (s: ProfileStore, tier: TraitTier, n: number): void => {
  for (let i = 0; i < n; i++) expect(s.findTrait("u.mandible", tier)).toBeTruthy();
};

describe("the ladder of trades", () => {
  it("steps every rung but the top, and stops at mythic", () => {
    expect(FUSE_DEALS.map((d) => d.from)).toEqual(TIER_IDS.slice(0, -1));
    expect(nextTier("mythic")).toBe(null);
    expect(fuseDeal("mythic")).toBe(null);
    for (const deal of FUSE_DEALS) expect(deal.into).toBe(nextTier(deal.from));
  });

  /**
   * THE PRICE RISES FASTER THAN THE TIERS DO, or the top of the ladder is a weekend rather
   * than a chase. At the ~39 pheromone a day this economy pays, an exceptional is ten days
   * of income and a mythic twenty-six.
   */
  it("prices each rung above the one below it", () => {
    const costs = FUSE_DEALS.map((d) => d.pheromone);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(new Set(costs).size).toBe(costs.length);
    expect(FUSE_COST.common, "nothing fuses into the bottom rung").toBe(0);
  });

  /**
   * THREE, NOT TWO. The hatch's own odds step by roughly 2.4x between rungs, so a
   * two-for-one fuse would be BETTER than rolling — a player would stop wanting the hatch
   * and start wanting commons, which is the opposite of a chase.
   */
  it("asks for more fuel than the odds between two rungs are worth", () => {
    expect(FUSE_FUEL).toBeGreaterThan(2);
  });
});

describe("mycelium into a larva", () => {
  it("spends the price and pays exactly one", () => {
    const s = store(LARVA_MYCEL);
    expect(s.buyLarva()).toBe(true);
    expect(s.get().larva).toBe(1);
    expect(s.get().mycel).toBe(0);
  });

  it("refuses a penny short, and spends nothing", () => {
    const s = store(LARVA_MYCEL - 1);
    expect(s.buyLarva()).toBe(false);
    expect(s.get().larva).toBe(0);
    expect(s.get().mycel).toBe(LARVA_MYCEL - 1);
  });

  /**
   * IT MUST NOT OUT-EARN PLAYING. A win pays a larva outright, and this is priced against
   * the daily SURPLUS: at roughly seventy free mycelium a day it is a larva every four
   * days, so it is a top-up rather than a reason to stop playing.
   */
  it("costs several days of free mycelium", () => {
    expect(LARVA_MYCEL).toBeGreaterThan(70 * 2);
  });
});

describe("fusing spares", () => {
  it("burns the fuel and the pheromone, and pays one of the next tier up", () => {
    const s = store(0, FUSE_COST.uncommon);
    fill(s, "common", FUSE_FUEL);
    expect(s.canFuse("common")).toBe(true);

    const made = s.fuse("common", () => 0);
    expect(made?.tier).toBe("uncommon");
    expect(s.get().pheromone).toBe(0);
    expect(s.bag.length, "three went in and one came out").toBe(1);
    expect(s.bag[0]?.uid).toBe(made?.uid);
  });

  it("refuses without the fuel, and takes no pheromone for the refusal", () => {
    const s = store(0, 1e6);
    fill(s, "common", FUSE_FUEL - 1);
    expect(s.canFuse("common")).toBe(false);
    expect(s.fuse("common")).toBe(null);
    expect(s.get().pheromone).toBe(1e6);
    expect(s.bag.length).toBe(FUSE_FUEL - 1);
  });

  it("refuses without the pheromone, and burns nothing", () => {
    const s = store(1e6, FUSE_COST.uncommon - 1);
    fill(s, "common", FUSE_FUEL);
    expect(s.canFuse("common")).toBe(false);
    expect(s.fuse("common")).toBe(null);
    expect(s.bag.length).toBe(FUSE_FUEL);
  });

  /**
   * A WORN TRAIT IS NOT FUEL. Fusing is what you do with the duplicates; taking one off a
   * colony to pay for a roll would change a loadout the player chose, silently, from a
   * screen that is not the bench.
   */
  it("never spends a trait that is being worn", () => {
    const s = store(0, FUSE_COST.uncommon);
    // A bench slot does not open until chapter 10 (platform/traits.ts), so this player has
    // to have got there before anything can be worn at all.
    s.update((p) => { p.colony = colonyAtChapter(TRAITS_CHAPTER); });
    fill(s, "common", FUSE_FUEL);
    const worn = s.bag[0];
    expect(s.equipTrait("hill", worn?.uid ?? "")).toBe(true);

    expect(s.spares("common").length).toBe(FUSE_FUEL - 1);
    expect(s.canFuse("common")).toBe(false);

    fill(s, "common", 1);
    expect(s.fuse("common", () => 0)).toBeTruthy();
    expect(s.bench("hill")[0]?.uid, "the worn one is still on the bench").toBe(worn?.uid);
    expect(s.bag.some((b) => b.uid === worn?.uid)).toBe(true);
  });

  it("has no trade out of the top tier", () => {
    const s = store(0, 1e6);
    fill(s, "mythic", FUSE_FUEL);
    expect(s.canFuse("mythic")).toBe(false);
    expect(s.fuse("mythic")).toBe(null);
    expect(s.bag.length).toBe(FUSE_FUEL);
  });
});
