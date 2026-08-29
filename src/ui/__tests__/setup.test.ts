import { describe, expect, it } from "vitest";
import { MAPS, SPECIES, START_SHAPES } from "../../engine";
import type { MapId, SpeciesId } from "../../engine";
import { MemoryStore, ProfileStore } from "../../platform";
import { MAP_PAD_TILES, buildMapSelect, rollAISpecies } from "../setup";

/** The order the picker lists them in, mirrored here so the test names its own subjects. */
const MAP_ORDER_TEST: readonly MapId[] = ["tiny", "small", "mid"];

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

describe("the map picker", () => {
  const build = (): HTMLElement => {
    const store = new ProfileStore(new MemoryStore());
    return buildMapSelect({
      choices: { map: "tiny", species: "fire", shape: "corner" },
      profile: store,
      onBack: () => {},
      onNext: () => {},
      onBegin: () => {},
    });
  };

  it("says how to reach the other maps", () => {
    expect(build().querySelector(".maphint")?.textContent).toMatch(/swipe/i);
  });

  // The picture is the PLAYFIELD and a hair of soil, not a fill: bled to the corners, all
  // three maps are the same photograph of undergrowth with a board somewhere in it.
  it("draws the board as a plate inside the screen, not edge to edge", () => {
    const shots = Array.from(build().querySelectorAll<HTMLCanvasElement>(".mapshot canvas"));
    expect(shots.length).toBe(3);
    for (const canvas of shots) {
      const w = parseFloat(canvas.style.width);
      const h = parseFloat(canvas.style.height);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThan(window.innerWidth - 20);
      expect(h).toBeLessThan(window.innerHeight * 0.6);
    }
  });

  // Fitted, so every map is whole. A bigger board therefore draws SMALLER tiles, which is
  // the honest comparison: Gauntlet really is thirteen squares of what Skirmish gets seven
  // of. Measured per tile of BOARD, so it holds whatever the soil margin is set to.
  it("fits a bigger board by shrinking its tiles, never by cropping it", () => {
    const shots = Array.from(build().querySelectorAll<HTMLCanvasElement>(".mapshot canvas"));
    const tile = shots.map((c, i) =>
      parseFloat(c.style.width) / (MAPS[MAP_ORDER_TEST[i]!].size + 2 * MAP_PAD_TILES));
    expect(tile[0]!).toBeGreaterThan(tile[1]!);
    expect(tile[1]!).toBeGreaterThan(tile[2]!);
  });
});
