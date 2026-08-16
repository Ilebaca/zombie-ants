import { describe, expect, it } from "vitest";
import { SPECIES, START_SHAPES } from "../../engine";
import type { SpeciesId } from "../../engine";
import { rollAISpecies } from "../app";

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
