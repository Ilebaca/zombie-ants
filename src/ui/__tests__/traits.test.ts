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
import { buildAnthill } from "../anthill";
import { TIERS, basicLook, looksFor } from "../../engine";
import {
  FUSE_COST, FUSE_FUEL, ROAD_CHAPTER_STOPS, ROAD_LAST, SLOT_STEP, slotChapter, stopColony,
} from "../../platform";
import type { TraitScope } from "../../platform";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

const UNIVERSAL = TRAITS.filter((t) => t.species === null);
const FIRE = TRAITS.filter((t) => t.species === "fire");

/** A store past the chapter gate, so the screens are open. */
/**
 * A colony at the END of the road, so all five slots are open — they unlock one every ten
 * chapters (platform/traits.ts) and most of these tests are about the bench rather than
 * the gate. The gate has its own describe below.
 */
const store = (colony = ROAD_LAST): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.colony = colony; });
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

describe("the trait picker", () => {
  const choose = (root: HTMLElement, slot = 0): void => { slots(root)[slot]!.click(); };
  const inspect = (root: HTMLElement, uid: string): void => {
    root.querySelector<HTMLButtonElement>(`#trBag [data-uid="${uid}"]`)!.click();
  };
  const equip = (root: HTMLElement): void => {
    root.querySelector<HTMLButtonElement>(".trait-detail-equip")!.click();
  };

  it("keeps five individual slots and opens inventory only below the selected slot", () => {
    const s = store();
    s.findTrait(UNIVERSAL[0]!.id, "rare");
    const root = bench(s);
    expect(slots(root)).toHaveLength(TRAIT_SLOTS);
    expect(root.querySelector("#traitPicker")).toBeNull();
    choose(root, 3);
    expect(root.querySelector(".trait-slot-anchor > #traitPicker")).toBeTruthy();
    expect(slots(root)[3]!.classList.contains("armed")).toBe(true);
    expect(slots(root)[3]!.getAttribute("aria-expanded")).toBe("true");
    expect(rows(root)).toHaveLength(1);
    choose(root, 3);
    expect(root.querySelector("#traitPicker")).toBeNull();
    expect(slots(root)[3]!.classList.contains("armed")).toBe(false);
  });

  it("shows the whole collection, including worn and other-colony traits", () => {
    const s = store();
    const one = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    const two = s.findTrait(FIRE[0]!.id, "mythic")!;
    s.equipTrait("hill", one.uid);
    const root = bench(s);
    choose(root);
    expect(rows(root)).toHaveLength(2);
    expect(root.querySelector(`#trBag [data-uid="${one.uid}"]`)!.classList.contains("worn")).toBe(true);
    inspect(root, two.uid);
    expect(root.querySelector(".trait-detail-scope")!.textContent).toContain("Fire Ant");
    expect(root.querySelector<HTMLButtonElement>(".trait-detail-equip")!.disabled).toBe(true);
    equip(root);
    expect(s.bench("hill")[0]!.uid).toBe(one.uid);
  });

  it("shows the actual rarity, effect and biology before equipping", () => {
    const s = store(), def = UNIVERSAL.find(t => t.kind === "attack")!;
    const one = s.findTrait(def.id, "mythic")!;
    const root = bench(s);
    choose(root);
    inspect(root, one.uid);
    expect(root.querySelector(".trait-detail-name")!.textContent).toBe(def.name);
    expect(root.querySelector(".trait-detail-effect")!.textContent).toContain(effectFigure(def, one.tier));
    expect(root.querySelector(".trait-detail-note")!.textContent).toBe(def.note);
    expect(root.querySelector(".trait-detail-tier")!.textContent).toBe("Mythic");
    expect(s.bench("hill").filter(Boolean)).toHaveLength(0);
    expect(slots(root)[0]!.classList.contains("armed")).toBe(true);
  });

  it("equips only after confirmation, into the chosen slot, and updates totals", () => {
    const s = store(), def = UNIVERSAL.find(t => t.kind === "attack")!;
    const one = s.findTrait(def.id, "mythic")!;
    let changes = 0;
    const root = buildTraitBench(s, { scope: "hill", onBack: () => {}, onChanged: () => { changes++; } });
    document.body.replaceChildren(root);
    choose(root, 4);
    inspect(root, one.uid);
    expect(s.bench("hill")[4]).toBeNull();
    equip(root);
    expect(s.bench("hill")[4]!.uid).toBe(one.uid);
    expect(s.bench("hill")[0]).toBeNull();
    expect(root.querySelector(".trtotal-v")!.textContent).toBe(`${TRAIT_TIER.mythic.stat}%`);
    expect(root.querySelector(".trait-detail-layer")).toBeNull();
    expect(root.querySelector("#traitPicker")).toBeNull();
    expect(changes).toBe(1);
  });

  it("replaces a filled slot without deleting the previous item", () => {
    const s = store(), one = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    const two = s.findTrait(UNIVERSAL[1]!.id, "mythic")!;
    s.equipTrait("hill", one.uid);
    const root = bench(s);
    choose(root);
    expect(s.bench("hill")[0]!.uid).toBe(one.uid);
    inspect(root, two.uid); equip(root);
    expect(s.bench("hill")[0]!.uid).toBe(two.uid);
    expect(s.bag.map(i => i.uid)).toContain(one.uid);
    choose(root, 1);
    inspect(root, two.uid);
    expect(root.querySelector<HTMLButtonElement>(".trait-detail-equip")!.disabled).toBe(true);
    equip(root);
    expect(s.bench("hill")[1]).toBeNull();
  });

  it("can remove a selected trait explicitly", () => {
    const s = store(), one = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    s.equipTrait("hill", one.uid);
    const root = bench(s);
    choose(root);
    root.querySelector<HTMLButtonElement>(".trait-picker-remove")!.click();
    expect(s.bench("hill")[0]).toBeNull();
    expect(s.bag.map(i => i.uid)).toContain(one.uid);
    expect(root.querySelector(".trait-picker")).toBeNull();
  });

  it("switches selected slots without changing equipment", () => {
    const root = bench(store());
    choose(root, 0); choose(root, 4);
    expect(root.querySelectorAll("#trWorn .armed")).toHaveLength(1);
    expect(slots(root)[4]!.classList.contains("armed")).toBe(true);
    expect(root.querySelectorAll(".trait-picker")).toHaveLength(1);
  });

  it("closes details by X, backdrop or card tap while retaining the picker and selection", () => {
    const s = store(), one = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    const root = bench(s); choose(root, 2);
    for (const selector of [".trait-detail-close", ".trait-detail-layer", ".trait-detail-name"]) {
      inspect(root, one.uid);
      root.querySelector<HTMLElement>(selector)!.click();
      expect(root.querySelector(".trait-detail-layer")).toBeNull();
      expect(root.querySelector("#traitPicker")).toBeTruthy();
      expect(slots(root)[2]!.classList.contains("armed")).toBe(true);
      expect(s.bench("hill").filter(Boolean)).toHaveLength(0);
    }
  });

  it("closes the highest layer first with Back and Escape", () => {
    const s = store(), one = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    let back = 0;
    const root = buildTraitBench(s, { scope: "hill", onBack: () => { back++; } });
    document.body.replaceChildren(root);
    choose(root); inspect(root, one.uid);
    root.querySelector<HTMLButtonElement>("#trBack")!.click();
    expect(root.querySelector(".trait-detail-layer")).toBeNull();
    expect(root.querySelector("#traitPicker")).toBeTruthy();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector("#traitPicker")).toBeNull();
    expect(back).toBe(0);
    root.querySelector<HTMLButtonElement>("#trBack")!.click();
    expect(back).toBe(1);
  });

  it("restores focus and contains keyboard focus within the detail dialog", () => {
    const s = store(), one = s.findTrait(UNIVERSAL[0]!.id, "rare")!;
    const root = bench(s); choose(root); inspect(root, one.uid);
    const close = root.querySelector<HTMLButtonElement>(".trait-detail-close")!;
    const equip = root.querySelector<HTMLButtonElement>(".trait-detail-equip")!;
    expect(document.activeElement).toBe(close);
    close.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(document.activeElement).toBe(equip);
    equip.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.activeElement).toBe(close);
    close.click();
    expect(document.activeElement).toBe(rows(root)[0]);
  });

  it("dismisses the picker on an outside tap and never opens a locked slot", () => {
    const s = new ProfileStore(new MemoryStore());
    const root = bench(s);
    slots(root)[1]!.click();
    expect(root.querySelector("#traitPicker")).toBeNull();
    choose(root);
    expect(root.querySelector(".trempty")!.textContent).toContain("lucky hatch");
    root.querySelector<HTMLElement>(".trtotals")!.click();
    expect(root.querySelector("#traitPicker")).toBeNull();
    expect(root.querySelector("#trWorn .armed")).toBeNull();
  });

  it("keeps the three bonus ceilings visible", () => {
    const root = bench(store());
    const caps = Array.from(root.querySelectorAll(".trtotal-c")).map(e => e.textContent);
    expect(caps).toHaveLength(3);
    for (const cap of caps) expect(cap).toMatch(/^max \d+%$/);
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

  it("opens inventory and usable trait controls in chapter one without a pass", () => {
    const early = new ProfileStore(new MemoryStore());
    const one = early.findTrait(UNIVERSAL[0]!.id, "rare")!;
    expect(early.get().pass).toBe(false);
    const inv = inventory(early);
    expect(inv.querySelectorAll(".invhead")).toHaveLength(1);
    expect(inv.querySelector(".trtile")?.getAttribute("data-uid")).toBe(one.uid);
    const hill = buildAnthill(early, { onTraits: () => {} });
    expect(hill.querySelector("#hillTraits")?.classList.contains("locked")).toBe(false);
    const species = buildSpeciesPage(early, { species: "fire", onBack: () => {}, onTraits: () => {} });
    expect(species.querySelector("#spgTraits")?.classList.contains("locked")).toBe(false);
    const root = bench(early);
    expect(root.querySelectorAll("#trWorn .trtile.empty")).toHaveLength(1);
    expect(root.querySelectorAll("#trWorn .trtile.shut")).toHaveLength(4);
    slots(root)[0]?.click();
    rows(root)[0]?.click();
    root.querySelector<HTMLButtonElement>(".trait-detail-equip")!.click();
    expect(early.bench("hill")[0]?.uid).toBe(one.uid);
    expect(early.benchTotals("hill").atkPct).toBeGreaterThan(0);
  });

  it("shows where to find traits from the first chapter", () => {
    const early = new ProfileStore(new MemoryStore());
    const root = inventory(early);
    expect(root.querySelector(".trempty")?.textContent).toContain("lucky hatch");
    expect(root.textContent).not.toContain("open at chapter");
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

/**
 * A LOCKED SLOT IS DRAWN, AND IT NAMES ITS CHAPTER.
 *
 * Five squares with two live is the shape of the bench a player is working toward; two
 * squares is a bench that looks finished. And a number is something to play toward, where
 * a padlock only says you cannot — the same rule the granary's levels follow.
 */
describe("slots that have not opened yet", () => {
  const at = (chapter: number): ProfileStore =>
    store(stopColony((chapter - 1) * ROAD_CHAPTER_STOPS));

  it("draws all five, with the shut ones naming their chapter", () => {
    const root = bench(at(20));
    const cells = Array.from(root.querySelectorAll("#trWorn > *"));
    expect(cells.length, "the bench shrank instead of locking").toBe(5);
    expect(root.querySelectorAll("#trWorn .trtile.shut").length).toBe(3);
    expect(cells[2]?.textContent).toContain(`CH ${slotChapter(2)}`);
    expect(cells[4]?.textContent).toContain(`CH ${slotChapter(4)}`);
    // The two that ARE open are live controls.
    expect((cells[0] as HTMLElement).tagName).toBe("BUTTON");
    expect((cells[2] as HTMLElement).tagName, "a shut slot was a button").not.toBe("BUTTON");
  });

  /** "2 / 5" on a bench with two slots reads as three empty ones nobody can see. */
  it("counts against the slots that are open, not against five", () => {
    const said = bench(at(20)).textContent ?? "";
    expect(said).toContain("Equipped  0 / 2");
    expect(said).not.toContain("0 / 5");
  });

  it("opens them one at a time, ten chapters apart", () => {
    for (const [chapter, open] of [[10, 1], [20, 2], [30, 3], [40, 4], [50, 5]] as const) {
      const root = bench(at(chapter));
      expect(root.querySelectorAll("#trWorn .trtile.shut").length,
        `chapter ${chapter} did not have ${open} slots`).toBe(5 - open);
    }
    expect(SLOT_STEP).toBe(10);
  });

  /** The opener row is the same five squares, so it locks the same way. */
  it("locks the same slots on the row that opens the bench", () => {
    const row = traitOpener(at(20), "hill", () => {}, null);
    expect(row.querySelectorAll(".tropen-slot").length).toBe(5);
    expect(row.querySelectorAll(".tropen-slot.shut").length).toBe(3);
    expect(row.textContent).toContain("No traits equipped");
  });

  it("counts against the open slots on that row too", () => {
    const s = at(20);
    s.equipTrait("hill", s.findTrait(UNIVERSAL[0]!.id, "rare")!.uid);
    expect(traitOpener(s, "hill", () => {}, null).textContent).toContain("1 of 2 equipped");
  });
});


/* ======================================================================= FUSING

   WHERE PHEROMONE GOES ONCE THE RESEARCH TREE IS BOUGHT.

   The hatch pays a common six times in ten for ever, so a collection that has been running
   a while is mostly spares pressing against the bag's ceiling with nothing to do but be
   thrown away. Three of one rarity make one of the next, and the panel that offers it is
   the only place in the app that says so. */
describe("fusing spares", () => {
  const inventory = (s: ProfileStore): HTMLElement => {
    const root = buildInventory(s, { onBack: () => {}, onOpen: () => {} });
    document.body.replaceChildren(root);
    return root;
  };
  const rich = (pheromone = 1e6): ProfileStore => {
    const s = store();
    s.update((p) => { p.pheromone = pheromone; });
    return s;
  };
  const spares = (s: ProfileStore, n: number): void => {
    for (let i = 0; i < n; i++) s.findTrait(UNIVERSAL[0]!.id, "common");
  };

  /**
   * A ROW ONLY APPEARS WHEN THE FUEL IS HELD. Four rows that mostly say no is a panel
   * that says nothing, and this one is at the head of the collection where it cannot be
   * scrolled past.
   */
  it("says nothing until there are enough spares to fuse", () => {
    const s = rich();
    spares(s, FUSE_FUEL - 1);
    expect(inventory(s).querySelector("#fuseBox")).toBe(null);

    spares(s, 1);
    expect(inventory(s).querySelector("#fuseBox [data-fuse='common']")).toBeTruthy();
  });

  it("fuses three into one of the next tier and redraws the collection", () => {
    const s = rich(FUSE_COST.uncommon);
    spares(s, FUSE_FUEL);
    const root = inventory(s);
    root.querySelector<HTMLButtonElement>("[data-fuse='common']")?.click();

    expect(s.bag.length).toBe(1);
    expect(s.bag[0]?.tier).toBe("uncommon");
    expect(s.get().pheromone).toBe(0);
    // The tile on the screen is the new one, and the row that made it has gone with its
    // fuel — the screen is showing the save rather than the save it was built from.
    expect(root.querySelectorAll(".trtile").length).toBe(1);
    expect(root.querySelector("#fuseBox")).toBe(null);
  });

  /**
   * IT STATES THE PRICE WHETHER OR NOT IT CAN BE PAID. A control that goes blank when a
   * player cannot afford it reads as broken rather than as priced — the same rule every
   * other buy in the app follows.
   */
  it("prices the trade it cannot make, and makes nothing", () => {
    const s = rich(FUSE_COST.uncommon - 1);
    spares(s, FUSE_FUEL);
    const root = inventory(s);
    const go = root.querySelector<HTMLButtonElement>("[data-fuse='common']");
    expect(go?.textContent).toContain(String(FUSE_COST.uncommon));
    // The app's one buy button, so an unaffordable price wears the same class here as it
    // does on a chamber or a research level.
    expect(go?.className).toContain("off");
    go?.click();
    expect(s.bag.length).toBe(FUSE_FUEL);
  });
});
