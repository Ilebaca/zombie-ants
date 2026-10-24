import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * The picture is drawn by the BOARD'S own code, so the only way to see what the screen
 * asked for is to watch the call. Everything else in `../../render` passes straight
 * through — the screen wants `setFactionColor`, `antHead` and `lookCol` for real.
 */
const shots: { art?: string | null; terrain?: boolean }[] = [];
vi.mock("../../render", async (real) => {
  const mod = await real<typeof import("../../render")>();
  return {
    ...mod,
    drawSnapshot: (c: HTMLCanvasElement, s: never, o: { art?: string | null } = {}) => {
      shots.push(o);
      return mod.drawSnapshot(c, s, o);
    },
  };
});
import { MAPS, SPECIES, START_SHAPES } from "../../engine";
import type { ShapeId, SpeciesId } from "../../engine";
import { MemoryStore, ProfileStore, SPECIES_ORDER } from "../../platform";
import { MAP_PAD_TILES, buildSetup, rollAISpecies, shapeName } from "../setup";
import { App } from "../app";
import { TOUR_VERSION, chapterOf } from "../../platform";
import { groundFor } from "../regions";

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
  });

  /**
   * IT OPENS ON THE LAST PICK. It used to reset to the first formation on every open, so a
   * player with a favourite re-stepped to it before every single match. What it still has
   * to do is refuse a choice the build no longer carries.
   */
  it("opens on the formation it was handed", () => {
    const { root } = build();
    expect(name(root)).toBe(shapeName("corner"));
  });

  it("falls back to the first formation when the saved one is gone", () => {
    const choices = { map: "small" as const, species: "fire" as SpeciesId, shape: "ziggurat" as ShapeId };
    const root = buildSetup({
      choices, profile: new ProfileStore(new MemoryStore()),
      onBack: () => {}, onBegin: () => {},
    });
    expect(choices.shape).toBe(Object.keys(START_SHAPES)[0]);
    expect(name(root)).toBe(shapeName(Object.keys(START_SHAPES)[0] as ShapeId));
  });

  /**
   * EVERY FORMATION IS REACHABLE, WITHOUT WRAPPING. This used to walk one full loop and
   * assert it came back round; the picker clamps at both ends now (§ the ends of the
   * picker), so reaching all twelve means walking to one end and back along the whole
   * list rather than off the end of it.
   */
  it("steps through every formation with the arrows, both ways", () => {
    const { root, choices } = build();
    const shapes = Object.keys(START_SHAPES) as ShapeId[];
    const seen = new Set<string>();
    for (let i = 0; i < shapes.length; i++) { seen.add(choices.shape); press(root, "pickPrev"); }
    expect(choices.shape, "walking back did not reach the first").toBe(shapes[0]);
    for (let i = 0; i < shapes.length; i++) { seen.add(choices.shape); press(root, "pickNext"); }
    expect(choices.shape, "walking on did not reach the last").toBe(shapes[shapes.length - 1]);
    expect(seen.size, "the arrows do not reach every formation").toBe(shapes.length);
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

  /**
   * THE COLONY STEP SHOWS THE COLONY. It recoloured the same BOARD and stepped a name
   * under it, so the thing being chosen — which ant — was a word and a tint on a map.
   * The paintings are the picture now, on a rail that slides one across per press, and
   * the little drawn head beside the name went with it: the same fact twice on one line,
   * and the smaller of the two.
   */
  it("shows the colony's painting on the colony step, never the board", () => {
    const { root } = build();
    const reel = root.querySelector("#setupReel") as HTMLElement;
    const board = root.querySelector("#setupBoard") as HTMLElement;
    expect(reel, "the rail was never built").toBeTruthy();

    // Formation step: the board, and no rail.
    expect(reel.classList.contains("on"), "the rail is up on the formation step").toBe(false);
    expect(board.classList.contains("off"), "the board is hidden on its own step").toBe(false);

    press(root, "setupGo");
    expect(reel.classList.contains("on"), "the rail never came up").toBe(true);
    expect(board.classList.contains("off"), "the board is still showing").toBe(true);
    expect(root.querySelector(".pickface"), "the head is still beside the name").toBeNull();
  });

  /** One pane per colony the player may field, in the order the arrows walk them. */
  it("carries every colony it can step to on the rail", () => {
    const store = new ProfileStore(new MemoryStore());
    const owned = SPECIES_ORDER.filter((id) => store.isUnlocked(id));
    const { root } = build(store);
    expect(root.querySelectorAll(".coverpane").length).toBe(owned.length);
  });

  /**
   * THE RAIL MOVES BY WHOLE PANES, and the offset follows the CHOICE rather than a count
   * of presses — so stepping back to the colony after the formation lands where it was
   * left rather than at the start.
   */
  it("slides one pane per press", () => {
    const store = new ProfileStore(new MemoryStore());
    const owned = SPECIES_ORDER.filter((id) => store.isUnlocked(id));
    const { root, choices } = build(store);
    press(root, "setupGo");
    const rail = root.querySelector(".coverrail") as HTMLElement;
    const at = (): string => rail.style.transform;

    expect(at()).toBe(`translate3d(${-100 * owned.indexOf(choices.species)}%,0,0)`);
    press(root, "pickNext");
    expect(at(), "the rail did not follow the arrow")
      .toBe(`translate3d(${-100 * owned.indexOf(choices.species)}%,0,0)`);
    press(root, "pickPrev");
    expect(at()).toBe(`translate3d(${-100 * owned.indexOf(choices.species)}%,0,0)`);
    // It wraps, and the rail has a pane to land on at either end.
    for (let i = 0; i < owned.length; i++) press(root, "pickPrev");
    const back = owned.indexOf(choices.species);
    expect(back, "stepping all the way round did not come home").toBeGreaterThanOrEqual(0);
    expect(at()).toBe(`translate3d(${-100 * back}%,0,0)`);
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

  /**
   * THE PICTURE IS SIZED AGAINST THE BOX IT SITS IN. The board is measured in JS off the
   * viewport minus the screen's own gutter — so a second inset on the stage makes it wider
   * than its own column, and a grid item wider than its track does not centre: it
   * overflows the END and is clipped there. Reported as "the map is cut off to the right".
   */
  it("gives the stage no side inset of its own", () => {
    const css = readFileSync(resolve(__dirname, "..", "skin.css"), "utf8");
    const rule = /\.setupstage \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule, "no .setupstage rule").not.toBe("");
    for (const decl of rule.split(";")) {
      const [prop, value] = decl.split(":").map((x) => x.trim());
      if (!prop?.startsWith("padding")) continue;
      const sides = prop === "padding"
        ? (value ?? "").split(/\s+/)
        : /inline|left|right/.test(prop) ? [value ?? ""] : [];
      // `padding: a b c` — the second value is both sides; one value is all four.
      const across = prop === "padding" ? [sides[1] ?? sides[0] ?? "0"] : sides;
      for (const v of across) {
        expect(parseFloat(v) || 0, `.setupstage insets the picture with ${decl.trim()}`).toBe(0);
      }
    }
  });
});

/**
 * THE BUTTON THAT OPENS IT NAMES THE BOARD. There is one board now (§ ONE BOARD), so the
 * screen that used to ask which is gone — and with it the only place the player was ever
 * told what they were about to play on. It is read off the map, never typed, so a second
 * board cannot leave the home screen lying about the first.
 */
describe("the way in", () => {
  it("says which board PLAY plays on", () => {
    const store = new ProfileStore(new MemoryStore());
    store.update((p) => { p.tourSeen = TOUR_VERSION; });
    const host = document.createElement("div");
    host.id = "app";
    document.body.replaceChildren(host);
    new App(host, store).start();
    const label = host.querySelector(".playbtn")?.textContent ?? "";
    expect(label).toContain("PLAY");
    expect(label).toContain(`${MAPS.small.size}\u00d7${MAPS.small.size}`);
  });
});

/**
 * THE PICKER REMEMBERS. The choice is written to the save when a match starts, and the
 * shell reads it back into the setup's choices — so the whole round trip is save → App →
 * screen, and the screen's own reset was what defeated it for as long as it existed.
 */
describe("the last pick", () => {
  it("is what the setup opens on next time", () => {
    const store = new ProfileStore(new MemoryStore());
    store.update((p) => {
      p.tourSeen = TOUR_VERSION;
      p.lastSpecies = "carpenter";
      p.lastShape = "zigzag";
    });
    const host = document.createElement("div");
    host.id = "app";
    document.body.replaceChildren(host);
    new App(host, store).start();
    host.querySelector<HTMLButtonElement>(".playbtn")?.click();

    const setup = host.querySelector<HTMLElement>("#formation");
    expect(setup, "the setup screen did not open").toBeTruthy();
    expect(setup?.querySelector(".picktext")?.textContent).toBe(shapeName("zigzag"));
    // ...and the colony step opens on the colony last fielded.
    setup?.querySelector<HTMLButtonElement>("#setupGo")?.click();
    expect(setup?.querySelector(".picktext")?.textContent).toBe(SPECIES.carpenter.name);
  });
});

/**
 * THE PICTURE IS THE GROUND THE MATCH WILL BE PLAYED ON.
 *
 * The board a player picks a formation on was the game's own drawn forest floor on every
 * chapter, while the match itself is played on the region's painted ground (§ THE BOARD'S
 * GROUND IS PAINTED PER REGION). They are choosing a formation FOR a place, so the picture
 * has to be that place.
 */
describe("the ground under the setup board", () => {
  it("is the region the player's chapter plays on", () => {
    for (const colony of [40, 5_000, 5_000_000]) {
      shots.length = 0;
      const store = new ProfileStore(new MemoryStore());
      store.update((p) => { p.colony = colony; });
      buildSetup({
        choices: { map: "small", species: "fire" as SpeciesId, shape: "wedge" as ShapeId },
        profile: store, onBack: () => {}, onBegin: () => {},
      });
      const asked = shots[shots.length - 1];
      expect(asked, "the board was never drawn").toBeTruthy();
      expect(asked?.terrain, "the setup board lost its ground").toBe(true);
      expect(asked?.art, "the setup board drew no region at all").toBeTruthy();
      expect(asked?.art, `chapter ${chapterOf(colony)} drew the wrong ground`)
        .toBe(groundFor(chapterOf(colony)));
      // Today every unpainted region falls back to one placeholder, so an exact match
      // between two chapters proves little — what this holds NOW is that the screen asks
      // for a region at all, and it starts telling them apart the day a second is painted.
    }
  });

});

/**
 * THE PICKER STOPS AT BOTH ENDS.
 *
 * It wrapped, and with the colony step drawn as a RAIL that is the one place wrapping
 * cannot work: stepping past the last colony slid the whole row backwards across every
 * other one to reach the first, which reads as the screen throwing the player back to
 * the start. Clamping is also what lets the end arrow go dead and SAY SO — a wrapping
 * picker has no ends, so it can never tell you that you have seen everything.
 */
describe("the ends of the picker", () => {
  const SHAPE_IDS = Object.keys(START_SHAPES) as ShapeId[];
  const build = (store = new ProfileStore(new MemoryStore())) => {
    const choices = {
      map: "small" as const, species: "fire" as SpeciesId, shape: "corner" as ShapeId,
    };
    const root = buildSetup({ choices, profile: store, onBack: () => {}, onBegin: () => {} });
    document.body.replaceChildren(root);
    return { root, choices };
  };
  const press = (root: HTMLElement, id: string): void =>
    root.querySelector<HTMLButtonElement>(`#${id}`)?.click() as void;
  const arrows = (root: HTMLElement) => ({
    prev: root.querySelector("#pickPrev") as HTMLButtonElement,
    next: root.querySelector("#pickNext") as HTMLButtonElement,
  });

  it("stops on the last colony rather than coming round to the first", () => {
    const store = new ProfileStore(new MemoryStore());
    const owned = SPECIES_ORDER.filter((id) => store.isUnlocked(id));
    expect(owned.length, "one colony cannot test an end").toBeGreaterThan(1);
    const { root, choices } = build(store);
    press(root, "setupGo");

    for (let i = 0; i < owned.length + 3; i++) press(root, "pickNext");
    expect(choices.species, "the picker wrapped round to the first colony")
      .toBe(owned[owned.length - 1]);
    expect(arrows(root).next.disabled, "the arrow at the end is still live").toBe(true);

    for (let i = 0; i < owned.length + 3; i++) press(root, "pickPrev");
    expect(choices.species, "the picker wrapped round to the last colony").toBe(owned[0]);
    expect(arrows(root).prev.disabled, "the arrow at the start is still live").toBe(true);
  });

  /** Both steps are the same two arrows in the same place, so both behave the same. */
  it("stops at both ends of the formations too", () => {
    const { root, choices } = build();
    for (let i = 0; i < SHAPE_IDS.length + 3; i++) press(root, "pickNext");
    expect(choices.shape).toBe(SHAPE_IDS[SHAPE_IDS.length - 1]);
    expect(arrows(root).next.disabled).toBe(true);
    expect(arrows(root).prev.disabled, "the start arrow died at the far end").toBe(false);
  });

  /** In the middle of the list both arrows are live, or the test above proves nothing. */
  it("leaves both arrows live anywhere in between", () => {
    const { root } = build();
    press(root, "pickNext");
    expect(arrows(root).prev.disabled).toBe(false);
    expect(arrows(root).next.disabled).toBe(false);
  });
});
