/**
 * THE LUCKY HATCH.
 *
 * It is the only source of a trait in the game, so what matters is that a hatch is
 * ATOMIC — a larva spent always produces a trait in the bag, and a hatch that cannot be
 * afforded takes nothing. Everything else on the screen is one egg and one button.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  HATCH_COST, MemoryStore, ProfileStore, TRAITS, TRAITS_CHAPTER, TRAIT_TIER, TRAIT_TIERS, itemDef, tierOdds,
} from "../../platform";
import { buildHatch } from "../hatch";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

/** A store past the chapter gate, with larva in it. */
const store = (larva = 5): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => {
    p.colony = 2_000_000;
    p.larva = larva;
    p.unlocked = ["leafcutter", "fire"];
  });
  return s;
};

interface Spy { shop: number; bag: number; changed: number }

const build = (s: ProfileStore, random = (): number => 0.5): { root: HTMLElement; spy: Spy } => {
  const spy: Spy = { shop: 0, bag: 0, changed: 0 };
  const root = buildHatch(s, {
    onBack: () => {},
    onBuyLarva: () => { spy.shop++; },
    onInventory: () => { spy.bag++; },
    onChanged: () => { spy.changed++; },
    random,
  });
  document.body.replaceChildren(root);
  return { root, spy };
};

const tap = (root: HTMLElement, id: string): void =>
  root.querySelector<HTMLButtonElement>(`#${id}`)?.click();

describe("the odds", () => {
  /**
   * A hatch that does not print its chances asks a player to keep spending on a
   * distribution they can only guess at, and the guess is always that the good one never
   * comes. Read off `tierOdds` rather than written out here, so a retune cannot leave the
   * screen quietly stating a chance the roll does not use.
   */
  it("prints every tier and its real chance", () => {
    const rows = build(store()).root.querySelectorAll("#hatchOdds .ho-row");
    expect(rows.length).toBe(TRAIT_TIERS.length);
    const text = build(store()).root.querySelector("#hatchOdds")?.textContent ?? "";
    for (const t of TRAIT_TIERS) {
      expect(text, `${t} is not named`).toContain(TRAIT_TIER[t].name);
      expect(text, `${t}'s chance is not stated`).toContain(`${Math.round(tierOdds(t))}%`);
    }
  });

  /** Shut with the rest of it: there is nothing to state the chances OF. */
  it("says nothing before the hatch opens", () => {
    const young = new ProfileStore(new MemoryStore());
    expect(build(young).root.querySelector("#hatchOdds")).toBeNull();
  });
});

describe("the hatch", () => {
  it("shows how many larva are in hand", () => {
    expect(build(store(7)).root.querySelector("#hatchLarva")?.textContent).toBe("7");
  });

  it("spends a larva and puts a trait in the bag", () => {
    const s = store(3);
    const { root } = build(s);
    tap(root, "hatchGo");
    expect(s.get().larva).toBe(3 - HATCH_COST);
    expect(s.bag.length).toBe(1);
  });

  /**
   * ATOMIC. A hatch that spent and did not roll takes something for nothing; one that
   * rolled and did not spend is free traits for ever. The store owns both halves.
   */
  it("takes nothing when there is nothing to spend", () => {
    const s = store(0);
    const { root, spy } = build(s);
    tap(root, "hatchGo");
    expect(s.get().larva).toBe(0);
    expect(s.bag.length).toBe(0);
    // ...and the button is not a dead end: with no larva it is the way to buy some.
    expect(spy.shop, "an empty hatch did nothing at all").toBe(1);
  });

  /**
   * ...and the STORE refuses too, not just the screen. The screen's button turns into a
   * shop link when there is nothing to spend, so the guard that actually protects the
   * save is never reached from there — and it is the one that has to hold for every
   * future caller.
   */
  it("refuses a hatch that cannot be paid for, whoever asks", () => {
    const s = store(0);
    expect(s.hatch(() => 0.5)).toBeNull();
    expect(s.bag.length, "a trait was hatched for nothing").toBe(0);
    expect(s.get().larva).toBe(0);
  });

  it("reveals what came out, and says where it went", () => {
    vi.useFakeTimers();
    const s = store();
    const { root, spy } = build(s);
    tap(root, "hatchGo");
    // The egg rocks first: the answer is not on screen the instant the button is pressed.
    expect(root.querySelector("#hatchPrize")).toBeNull();
    expect(root.querySelector(".hatchegg.shaking")).toBeTruthy();

    vi.advanceTimersByTime(2000);
    const prize = root.querySelector("#hatchPrize");
    expect(prize).toBeTruthy();
    const item = s.bag[0]!;
    expect(prize?.textContent).toContain(itemDef(item)?.name);
    expect(spy.changed).toBe(1);

    tap(root, "hatchToBag");
    expect(spy.bag).toBe(1);
    vi.useRealTimers();
  });

  /** One press is one larva, however many times the button is hit mid-animation. */
  it("cannot be hatched twice into one animation", () => {
    vi.useFakeTimers();
    const s = store(5);
    const { root } = build(s);
    tap(root, "hatchGo");
    // The button itself is what stops the second press — one mechanism, and the one a
    // player can see, rather than a flag re-checked inside the handler as well.
    expect(root.querySelector<HTMLButtonElement>("#hatchGo")?.disabled,
      "the button stayed live while the egg was still rocking").toBe(true);
    tap(root, "hatchGo");
    tap(root, "hatchGo");
    expect(s.get().larva).toBe(4);
    expect(s.bag.length).toBe(1);
    vi.useRealTimers();
  });

  /**
   * SHUT UNTIL TRAITS ARE. Larva buys traits and nothing else, so a hatch open before the
   * benches are would sell a player something they cannot equip on any colony — which is
   * the one thing a shop must never do.
   */
  it("is shut before the chapter that opens traits", () => {
    const early = new ProfileStore(new MemoryStore());
    early.update((p) => { p.larva = 9; });
    const { root } = build(early);
    expect(root.querySelector("#hatchShut")?.textContent).toContain(`chapter ${TRAITS_CHAPTER}`);
    expect(root.querySelector("#hatchGo"), "a shut hatch still offered a hatch").toBeNull();
    expect(root.querySelector("#hatchBuy"), "a shut hatch still sold larva").toBeNull();
  });

  it("takes the plus sign to the shop", () => {
    const { root, spy } = build(store());
    tap(root, "hatchBuy");
    expect(spy.shop).toBe(1);
  });
});

describe("what is in a larva", () => {
  /**
   * ONLY COLONIES THE PLAYER HAS, plus the universal ones. A mythic for a colony they may
   * never buy is a mythic they cannot use, and the whole point of the top tier is that
   * finding one is the best thing that happens in the feature.
   */
  it("never hatches a trait for a colony the player does not own", () => {
    const s = store(200);
    let seed = 1;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 200; i++) s.hatch(rnd);
    expect(s.bag.length).toBe(200);
    for (const item of s.bag) {
      const def = itemDef(item);
      expect(def, "hatched something not in the table").toBeTruthy();
      if (def?.species === null) continue;
      expect(s.get().unlocked, `hatched a ${def?.species} trait`).toContain(def?.species);
    }
  });

  /** ...and it can reach ALL of them: universal, and every colony that is owned. */
  it("reaches every trait the player can use", () => {
    const s = store(3000);
    let seed = 99;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 3000; i++) s.hatch(rnd);
    const seen = new Set(s.bag.map((i) => i.def));
    const reachable = TRAITS.filter(
      (t) => t.species === null || s.get().unlocked.includes(t.species));
    expect(seen.size, "some traits can never be hatched").toBe(reachable.length);
    // ...and every tier turns up, or the top of the table is decoration.
    expect(new Set(s.bag.map((i) => i.tier)).size).toBe(5);
  });
});
