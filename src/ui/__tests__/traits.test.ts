/**
 * THE TRAIT BENCH, driven the way a player drives it.
 *
 * Five slots and the inventory under them, on one screen — so the test that matters is
 * that tapping a row in the bag really moves the save AND really moves the total on the
 * screen, because the whole reason the two halves share a page is that you can watch the
 * second happen when you do the first.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { ProfileStore, TRAITS, TRAIT_SLOTS, TRAIT_TIER } from "../../platform";
import { MemoryStore } from "../../platform";
import { buildTraitBench, traitOpener } from "../traits";
import type { TraitScope } from "../../platform";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

const UNIVERSAL = TRAITS.filter((t) => t.species === null);
const FIRE = TRAITS.filter((t) => t.species === "fire");

/** A store past the chapter gate, so the screens are open. */
const store = (): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.colony = 2_000_000; });
  return s;
};

const bench = (s: ProfileStore, scope: TraitScope = "hill"): HTMLElement => {
  const root = buildTraitBench(s, { scope, onBack: () => {} });
  document.body.replaceChildren(root);
  return root;
};

/** The two grids: the five slots, then everything spare. Both hold `.trtile`. */
const grid = (root: HTMLElement, id: string): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>(`#${id} .trtile`));
const slots = (root: HTMLElement): HTMLButtonElement[] => grid(root, "trWorn");
const rows = (root: HTMLElement): HTMLButtonElement[] => grid(root, "trBag");

describe("the bench", () => {
  it("always shows five slots, filled or not", () => {
    expect(slots(bench(store())).length).toBe(TRAIT_SLOTS);
  });

  it("lists what fits and nothing else", () => {
    const s = store();
    s.findTrait(UNIVERSAL[0]!.id, "rare");
    s.findTrait(FIRE[0]!.id, "mythic");
    expect(rows(bench(s, "hill")).length, "a colony's trait was offered to the anthill").toBe(1);
    expect(rows(bench(s, "fire")).length).toBe(1);
    expect(rows(bench(s, "ghost")).length).toBe(0);
  });

  it("puts a tapped trait in the first free slot", () => {
    const s = store();
    s.findTrait(UNIVERSAL[0]!.id, "rare");
    const root = bench(s);
    rows(root)[0]?.click();
    expect(s.bench("hill")[0]).toBeTruthy();
    expect(slots(root)[0]?.classList.contains("filled")).toBe(true);
    // ...and it leaves the inventory, because it is not spare any more.
    expect(rows(root).length).toBe(0);
  });

  it("takes one off when its slot is tapped, and it comes back to the bag", () => {
    const s = store();
    const one = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    s.equipTrait("hill", one.uid);
    const root = bench(s);
    slots(root)[0]?.click();
    expect(s.bench("hill")[0]).toBeNull();
    expect(rows(root).length, "it did not come back to the inventory").toBe(1);
  });

  /**
   * Tapping an empty slot ARMS it, so replacing one particular trait is two taps rather
   * than a remove and an add. Without it, filling the fourth slot while the first three
   * are full is fine — but choosing WHICH gap is impossible.
   */
  it("fills the slot the player pointed at", () => {
    const s = store();
    for (let i = 0; i < 3; i++) s.equipTrait("hill", s.findTrait(UNIVERSAL[i]!.id, "common")!.uid);
    const spare = s.findTrait(UNIVERSAL[4]!.id, "mythic")!;
    const root = bench(s);
    slots(root)[4]?.click();          // arm the LAST slot, not the first free one
    rows(root)[0]?.click();
    expect(s.bench("hill")[4]?.uid).toBe(spare.uid);
    expect(s.bench("hill")[3]).toBeNull();
  });

  it("lets an armed slot be disarmed by tapping it again", () => {
    const s = store();
    s.findTrait(UNIVERSAL[0]!.id, "rare");
    const root = bench(s);
    slots(root)[2]?.click();
    expect(slots(root)[2]?.classList.contains("armed")).toBe(true);
    slots(root)[2]?.click();
    expect(slots(root)[2]?.classList.contains("armed")).toBe(false);
    // Disarmed, so it goes in the first gap rather than the one that was pointed at.
    rows(root)[0]?.click();
    expect(s.bench("hill")[0]).toBeTruthy();
  });

  /**
   * THE TOTAL HAS TO MOVE ON THE SCREEN. It is the whole reason the slots and the bag
   * share a page: you slot something and you watch the number change.
   */
  it("moves the total when something is slotted", () => {
    const s = store();
    const attack = UNIVERSAL.find((t) => t.kind === "attack")!;
    s.findTrait(attack.id, "mythic");
    const root = bench(s);
    const value = (): string => root.querySelector(".trtotal .trtotal-v")?.textContent ?? "";
    expect(value()).toBe("0%");
    rows(root)[0]?.click();
    expect(value()).toBe(`${TRAIT_TIER.mythic.stat}%`);
  });

  /** A ceiling a player only finds by watching a number stop moving reads as a bug. */
  it("prints the ceiling beside every figure", () => {
    const root = bench(store());
    const caps = Array.from(root.querySelectorAll(".trtotal-c")).map((e) => e.textContent);
    expect(caps.length).toBe(3);
    for (const c of caps) expect(c).toMatch(/^max \d+%$/);
  });

  it("says what an empty inventory means rather than showing nothing", () => {
    const root = bench(store());
    expect(root.querySelector(".trempty")?.textContent?.length ?? 0).toBeGreaterThan(30);
  });
});

describe("the row that opens it", () => {
  it("shows a pip per slot, lit for the ones that are filled", () => {
    const s = store();
    s.equipTrait("hill", s.findTrait(UNIVERSAL[0]!.id, "rare")!.uid);
    const row = traitOpener(s, "hill", () => {}, null);
    const pips = row.querySelectorAll(".tropen-pip");
    expect(pips.length).toBe(TRAIT_SLOTS);
    expect(row.querySelectorAll(".tropen-pip.on").length).toBe(1);
  });

  /** A number is something to play toward. A padlock says only that you cannot. */
  it("names the chapter when it is locked, and does not open", () => {
    let opened = 0;
    const row = traitOpener(store(), "hill", () => { opened++; }, "Chapter 10");
    expect(row.textContent).toContain("Chapter 10");
    row.click();
    expect(opened).toBe(0);
    // A locked bench shows no pips: five empty slots would say it is open and unused.
    expect(row.querySelectorAll(".tropen-pip").length).toBe(0);
  });

  it("opens when it is not locked", () => {
    let opened = 0;
    traitOpener(store(), "hill", () => { opened++; }, null).click();
    expect(opened).toBe(1);
  });
});
