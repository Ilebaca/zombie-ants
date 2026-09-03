/**
 * THE TRAIT BENCH, driven the way a player drives it.
 *
 * Five slots and the inventory under them, on one screen — so the test that matters is
 * that tapping a row in the bag really moves the save AND really moves the total on the
 * screen, because the whole reason the two halves share a page is that you can watch the
 * second happen when you do the first.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { ProfileStore, TRAITS, TRAIT_SLOTS, TRAIT_TIER, effectFigure } from "../../platform";
import { MemoryStore } from "../../platform";
import { buildInventory, buildTraitBench, traitOpener } from "../traits";
import { buildSpeciesPage } from "../species";
import { TIERS, basicLook, looksFor } from "../../engine";
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
  /**
   * It shows the traits THEMSELVES. A row of dashes said how many and, when one was lit,
   * that something rare was worn somewhere — never what it did.
   */
  it("shows each worn trait, with what it is worth, and holds the empty slots", () => {
    const s = store();
    const def = UNIVERSAL[0]!;
    s.equipTrait("hill", s.findTrait(def.id, "rare")!.uid);
    const row = traitOpener(s, "hill", () => {}, null);

    expect(row.querySelectorAll(".tropen-slot").length).toBe(TRAIT_SLOTS);
    expect(row.querySelectorAll(".tropen-slot.filled").length).toBe(1);
    expect(row.querySelectorAll(".tropen-slot.empty").length).toBe(TRAIT_SLOTS - 1);

    const worn = row.querySelector<HTMLElement>(".tropen-slot.filled");
    expect(worn?.title, "the trait is not named").toContain(def.name);
    expect(worn?.title).toContain("Rare");
    expect(worn?.style.getPropertyValue("--tier")).toBe(TRAIT_TIER.rare.colour);
    expect(worn?.querySelector(".tropen-slot-v")?.textContent, "what it is worth is missing")
      .toBe(effectFigure(def, "rare"));
  });

  /** Nothing equipped still has to SAY nothing is equipped, in words as well as squares. */
  it("says so in words when the bench is empty", () => {
    const row = traitOpener(store(), "hill", () => {}, null);
    expect(row.textContent).toContain("No traits equipped");
    expect(row.querySelectorAll(".tropen-slot.filled").length).toBe(0);
    expect(row.querySelectorAll(".tropen-slot.empty").length).toBe(TRAIT_SLOTS);
  });

  /** A number is something to play toward. A padlock says only that you cannot. */
  it("names the chapter when it is locked, and does not open", () => {
    let opened = 0;
    const row = traitOpener(store(), "hill", () => { opened++; }, "Chapter 10");
    expect(row.textContent).toContain("Chapter 10");
    row.click();
    expect(opened).toBe(0);
    // A locked bench shows no slots: five empty squares would say it is open and unused.
    expect(row.querySelectorAll(".tropen-slot").length).toBe(0);
  });

  it("opens when it is not locked", () => {
    let opened = 0;
    traitOpener(store(), "hill", () => { opened++; }, null).click();
    expect(opened).toBe(1);
  });
});

/* ==================================================================== INVENTORY */

/**
 * THE COLLECTION AS A COLLECTION.
 *
 * The benches show only what fits them, so a player with traits spread over ten benches
 * could never see all of them anywhere. This screen is the only place in the app that
 * does, and the thing worth holding is that it shows EVERYTHING — worn included — because
 * a collection that hid what was in use would be a different number every time a loadout
 * changed.
 */
describe("the inventory", () => {
  const inventory = (s: ProfileStore, onOpen: (sc: TraitScope) => void = () => {}): HTMLElement => {
    const root = buildInventory(s, { onBack: () => {}, onOpen });
    document.body.replaceChildren(root);
    return root;
  };
  const tiles = (root: HTMLElement): HTMLButtonElement[] =>
    Array.from(root.querySelectorAll<HTMLButtonElement>(".trtile"));

  it("shows everything found, worn or not", () => {
    const s = store();
    const worn = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    s.findTrait(UNIVERSAL[1]!.id, "common");
    s.findTrait(FIRE[0]!.id, "mythic");
    s.equipTrait("hill", worn.uid);

    const root = inventory(s);
    expect(tiles(root).length, "a worn trait was left out of the collection").toBe(3);
    // ...and the worn one is marked rather than hidden.
    expect(root.querySelectorAll(".trtile.worn").length).toBe(1);
  });

  it("groups by bench, and every group is a door into it", () => {
    const s = store();
    s.findTrait(UNIVERSAL[0]!.id, "rare");
    s.findTrait(FIRE[0]!.id, "mythic");
    const opened: TraitScope[] = [];
    const root = inventory(s, (sc) => opened.push(sc));

    const heads = Array.from(root.querySelectorAll<HTMLButtonElement>(".invhead"));
    expect(heads.map((h) => h.dataset.scope)).toEqual(["hill", "fire"]);
    heads[1]?.click();
    expect(opened).toEqual(["fire"]);
  });

  // A bench with nothing in it is not a heading over an empty grid.
  it("names only the benches it has something for", () => {
    const s = store();
    s.findTrait(FIRE[0]!.id, "rare");
    expect(inventory(s).querySelectorAll(".invhead").length).toBe(1);
  });

  it("takes a tapped tile to the bench it belongs to", () => {
    const s = store();
    s.findTrait(FIRE[0]!.id, "rare");
    const opened: TraitScope[] = [];
    tiles(inventory(s, (sc) => opened.push(sc)))[0]?.click();
    expect(opened).toEqual(["fire"]);
  });

  /** A screen with nothing on it has to say why, or it reads as one that failed. */
  it("says where traits come from when there are none", () => {
    const root = inventory(store());
    expect(root.querySelectorAll(".trtile").length).toBe(0);
    expect(root.querySelector(".trempty")?.textContent).toContain("lucky hatch");
  });

  it("names the chapter before traits are open", () => {
    const early = new ProfileStore(new MemoryStore());
    const root = inventory(early);
    expect(root.querySelector(".trempty")?.textContent).toContain("chapter 10");
    expect(root.querySelectorAll(".invhead").length).toBe(0);
  });
});

/**
 * THE ROW IS PART OF THE HERO, not a section of its own.
 *
 * A heading, a card and a gap either side of it, for one row summarising what the colony
 * is WEARING — while everything in the card above summarised what the colony IS. It is
 * the card's last line now, and still a door.
 */
describe("where the colony page keeps its traits", () => {
  const grown = (): ProfileStore => {
    const s = new ProfileStore(new MemoryStore());
    s.update((p) => { p.colony = 2_000_000; });
    return s;
  };

  it("puts the row inside the hero card, last, with its slots", () => {
    let opened = 0;
    const page = buildSpeciesPage(grown(), {
      species: "fire", onBack: () => {}, onTraits: () => { opened++; },
    });
    const hero = page.querySelector(".spghero");
    const row = hero?.querySelector<HTMLElement>("#spgTraits");
    expect(row, "the traits row is not in the hero card").toBeTruthy();
    expect(hero?.lastElementChild, "something was added after it").toBe(row);
    expect(row?.querySelectorAll(".tropen-slot").length, "the slots are not shown")
      .toBe(TRAIT_SLOTS);

    // Still a door.
    row?.click();
    expect(opened).toBe(1);
  });

  /** The section it used to have is gone, or the page says "Traits" twice. */
  it("keeps no separate Traits section", () => {
    const page = buildSpeciesPage(grown(), { species: "fire", onBack: () => {} });
    const heads = Array.from(page.querySelectorAll(".secthead")).map((h) => h.textContent);
    expect(heads).not.toContain("Traits");
  });
});

/**
 * THE SKIN PICKER — three looks, and the one being worn.
 *
 * A skin is not an item: it never reaches the inventory, it is unlocked for ever, and the
 * only place it can be worn from is the colony it belongs to. So the whole of the feature
 * on this screen is three cards and a tap.
 */
describe("choosing a colony's look", () => {
  const grown = (): ProfileStore => {
    const s = new ProfileStore(new MemoryStore());
    s.update((p) => { p.colony = 2_000_000; });
    return s;
  };

  const page = (s: ProfileStore): HTMLElement =>
    buildSpeciesPage(s, { species: "fire", onBack: () => {} });

  const cards = (root: HTMLElement): HTMLButtonElement[] =>
    Array.from(root.querySelectorAll<HTMLButtonElement>("#spgSkins .skincard"));

  /** Purple then red, so the row reads left to right in rarity order. */
  it("names each look's rarity, in the game's one colour for it", () => {
    const all = cards(page(grown()));
    const worn = looksFor("fire");
    expect(all[0]?.querySelector(".skincard-t"), "a basic look carries a rarity").toBeNull();
    for (const i of [1, 2]) {
      const tier = TIERS[worn[i]!.tier!];
      expect(all[i]?.querySelector(".skincard-t")?.textContent).toBe(tier.name);
      expect(all[i]?.style.getPropertyValue("--tier")).toBe(tier.colour);
    }
    expect(all[1]?.textContent).toContain("Exceptional");
    expect(all[2]?.textContent).toContain("Mythic");
  });

  it("shows all three looks, with the two unfound ones locked", () => {
    const root = page(grown());
    const all = cards(root);
    expect(all.length).toBe(looksFor("fire").length);
    expect(all.map((c) => c.dataset.look)).toEqual(looksFor("fire").map((l) => l.id));

    // The basic one is worn and always wearable; the found ones are not there yet.
    expect(all[0]?.className).toContain("on");
    expect(all[0]?.disabled).toBe(false);
    expect(all[1]?.className, "an unfound skin was offered").toContain("locked");
    expect(all[1]?.disabled).toBe(true);
    // ...and it is still DRAWN, because seeing what you have not found is the point.
    expect(all[1]?.querySelector("canvas"), "a locked skin was hidden").toBeTruthy();
    expect(all[1]?.textContent).toContain("Locked");
  });

  it("wears one that has been found, and says which is worn", () => {
    const s = grown();
    const look = looksFor("fire")[1]!;
    s.findSkin(look.id);

    const root = page(s);
    const card = cards(root)[1];
    expect(card?.disabled).toBe(false);
    expect(card?.textContent).toContain("Wear");

    card?.click();
    expect(s.lookFor("fire")).toBe(look);
    // The screen redraws in place, so the state on it moved too.
    const after = cards(root);
    expect(after[1]?.className).toContain("on");
    expect(after[1]?.textContent).toContain("Worn");
    expect(after[0]?.className).not.toContain("on");
  });

  it("puts it back by tapping the basic one", () => {
    const s = grown();
    const look = looksFor("fire")[1]!;
    s.findSkin(look.id);
    s.wearSkin("fire", look.id);

    const root = page(s);
    cards(root)[0]?.click();
    expect(s.lookFor("fire")).toBe(basicLook("fire"));
    expect(s.hasSkin(look.id), "putting a skin back threw it away").toBe(true);
  });

  /** A locked card must not be a live control: a dead tap is worse than a dead button. */
  it("does nothing when a locked card is tapped", () => {
    const s = grown();
    cards(page(s))[2]?.click();
    expect(s.lookFor("fire")).toBe(basicLook("fire"));
    expect(s.get().look).toEqual({});
  });
});
