import { describe, expect, it } from "vitest";
import { MAPS, SPECIES, START_SHAPES } from "../../engine";
import type { ShapeId, SpeciesId } from "../../engine";
import { MemoryStore, ProfileStore, SPECIES_ORDER } from "../../platform";
import { MAP_PAD_TILES, buildSetup, rollAISpecies, shapeName } from "../setup";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

describe("AI species roll", () => {
  const ids = Object.keys(SPECIES) as SpeciesId[];

  it("never mirrors your species", () => {
    for (const yours of ids) {
      for (let i = 0; i < 50; i++) {
        expect(rollAISpecies(yours, () => i / 50)).not.toBe(yours);
      }
    }
  });

  it("never fields a premium species against you", () => {
    for (let i = 0; i < 200; i++) {
      const picked = rollAISpecies("fire", () => i / 200);
      expect(SPECIES[picked].premium).toBeFalsy();
    }
  });

  it("can still produce every non-premium species", () => {
    const seen = new Set<SpeciesId>();
    for (let i = 0; i < 400; i++) seen.add(rollAISpecies("fire", () => i / 400));
    const expected = ids.filter((k) => k !== "fire" && !SPECIES[k].premium);
    for (const k of expected) expect(seen.has(k)).toBe(true);
  });

  it("stays in bounds at the extremes of the roll", () => {
    expect(ids).toContain(rollAISpecies("fire", () => 0));
    expect(ids).toContain(rollAISpecies("fire", () => 0.999999));
  });
});

describe("formation choices", () => {
  // A colony that starts with more than five tiles is a legacy bonus leaking back in
  // (CLAUDE.md §5). The picker must only ever offer exactly-five shapes.
  it("offers only five-tile formations", () => {
    for (const [id, cells] of Object.entries(START_SHAPES)) {
      expect(cells.length, `${id} must be 5 tiles`).toBe(5);
    }
  });

  it("has a distinct set of cells per formation", () => {
    for (const [id, cells] of Object.entries(START_SHAPES)) {
      const keys = new Set(cells.map(([c, r]) => `${c},${r}`));
      expect(keys.size, `${id} repeats a cell`).toBe(5);
    }
  });
});

/**
 * THE SETUP: ONE SCREEN, TWO CHOICES.
 *
 * It was three — a map picker, a colony picker and a formation picker. There is one board
 * now (engine/config.ts), so the first had nothing left to ask; the other two were the same
 * shape twice for two facts about the same five tiles. What is held here is that both
 * choices are really made, that the picture is the BOARD rather than a diagram of one, and
 * that the screen never offers a colony it will then refuse.
 */
describe("the setup screen", () => {
  const build = (store = new ProfileStore(new MemoryStore()), on: {
    back?: () => void; begin?: () => void; step?: (s: string) => void;
  } = {}) => {
    const choices = { map: "small" as const, species: "fire" as SpeciesId, shape: "corner" as ShapeId };
    const root = buildSetup({
      choices,
      profile: store,
      onBack: on.back ?? (() => {}),
      onBegin: on.begin ?? (() => {}),
      onStep: on.step,
    });
    document.body.replaceChildren(root);
    return { root, choices };
  };
  const name = (root: HTMLElement): string => root.querySelector(".picktext")?.textContent ?? "";
  const press = (root: HTMLElement, id: string): void =>
    root.querySelector<HTMLButtonElement>(`#${id}`)?.click() as void;

  it("opens on the formation, with the board and one picker", () => {
    const { root } = build();
    expect(root.querySelector(".screenh")?.textContent).toBe("Formation");
    expect(root.querySelector("#setupBoard"), "no board").toBeTruthy();
    expect(root.querySelector("#setupGo")?.textContent).toBe("Next");
    expect(name(root)).toBe(shapeName(Object.keys(START_SHAPES)[0] as ShapeId));
  });

  it("steps through every formation with the arrows, both ways", () => {
    const { root, choices } = build();
    const shapes = Object.keys(START_SHAPES) as ShapeId[];
    const seen = new Set<string>();
    for (let i = 0; i < shapes.length; i++) { seen.add(choices.shape); press(root, "pickNext"); }
    expect(seen.size, "the arrows do not reach every formation").toBe(shapes.length);
    expect(choices.shape, "a full loop did not come back round").toBe(shapes[0]);
    press(root, "pickPrev");
    expect(choices.shape).toBe(shapes[shapes.length - 1]);
  });

  // Next does not navigate: the same row starts naming colonies, and the button becomes
  // the one that starts the match.
  it("turns into the colony picker rather than opening another screen", () => {
    const { root, choices } = build();
    press(root, "setupGo");
    expect(root.querySelector(".screenh")?.textContent).toBe("Colony");
    expect(root.querySelector("#setupBoard"), "the board went away").toBeTruthy();
    expect(root.querySelector("#setupGo")?.textContent).toBe("Play");
    expect(name(root)).toBe(SPECIES[choices.species].name);
    press(root, "pickNext");
    expect(name(root)).toBe(SPECIES[choices.species].name);
  });

  /** A colony is a face everywhere else it is named on this screen too. */
  it("puts the colony's head beside its name", () => {
    const { root } = build();
    expect(root.querySelector(".pickface"), "a formation has no head").toBeNull();
    press(root, "setupGo");
    expect(root.querySelector(".pickface")).toBeTruthy();
  });

  /**
   * AN ARROW MAY NOT STEP ONTO SOMETHING THE SCREEN WILL THEN REFUSE. The grid of cards it
   * replaced showed locked colonies so the goal was visible and turned them down with a
   * toast; a stepper that lands on one is a dead end with no way to tell.
   */
  it("steps only through the colonies the player owns", () => {
    const store = new ProfileStore(new MemoryStore());
    const owned = SPECIES_ORDER.filter((id) => store.isUnlocked(id));
    expect(owned.length, "every colony is unlocked; nothing to hold").toBeLessThan(SPECIES_ORDER.length);
    const { root, choices } = build(store);
    press(root, "setupGo");
    for (let i = 0; i < SPECIES_ORDER.length + 2; i++) {
      expect(owned, `stepped onto ${choices.species}, which is locked`).toContain(choices.species);
      press(root, "pickNext");
    }
  });

  it("plays only from the second step, and reports both", () => {
    const steps: string[] = [];
    let played = 0;
    const { root } = build(undefined, { begin: () => { played++; }, step: (s) => steps.push(s) });
    press(root, "setupGo");
    expect(played, "it started a match before the colony was chosen").toBe(0);
    press(root, "setupGo");
    expect(played).toBe(1);
    expect(steps).toEqual(["shape", "species"]);
  });

  it("goes back a step before it goes home", () => {
    let home = 0;
    const { root } = build(undefined, { back: () => { home++; } });
    press(root, "setupGo");
    press(root, "setupBack");
    expect(home, "the back arrow left the flow from the second step").toBe(0);
    expect(root.querySelector(".screenh")?.textContent).toBe("Formation");
    press(root, "setupBack");
    expect(home).toBe(1);
  });

  /**
   * THE PICTURE IS THE BOARD, and a hair of soil around it — bled to the corners it is a
   * photograph of undergrowth with a board somewhere in it. Sized in JS off the viewport,
   * so this holds the shape rather than a number.
   */
  it("draws the board as a plate inside the screen, not edge to edge", () => {
    const { root } = build();
    const canvas = root.querySelector<HTMLCanvasElement>("#setupBoard");
    const w = parseFloat(canvas?.style.width ?? "0");
    const h = parseFloat(canvas?.style.height ?? "0");
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(window.innerWidth - 32);
    expect(h).toBeLessThan(window.innerHeight * 0.6);
    // Square, because the board is: the padding is the same on every side.
    expect(w).toBeCloseTo(h, 0);
    expect(w / (MAPS.small.size + 2 * MAP_PAD_TILES)).toBeGreaterThan(12);
  });
});
