import { describe, it, expect } from "vitest";
import { incomeOf, recomputeConnectivity, runProduction, tile, NEUTRAL_MODS } from "../index";
import { blankGame, put } from "./helpers";

const mods = { ...NEUTRAL_MODS };

describe("production", () => {
  it("pays nest 2, stable 1, resource 3", () => {
    const s = blankGame("mid", { you: "weaver", ai: "fire" });  // weaver prod = 1.0
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 3 });
    put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 3, terrain: "resource" });
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", mods)).toBe(2 + 1 + 3);
  });

  it("pays nothing for veins", () => {
    const s = blankGame("mid", { you: "weaver", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", mods)).toBe(2);
  });

  it("pays nothing for tiles detached from the queen", () => {
    const s = blankGame("mid", { you: "weaver", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 1, 10, { owner: "you", struct: "stable", soldiers: 3 });   // floating
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", mods)).toBe(2);
  });

  it("scales resources with Fungal Cultivation, up to double", () => {
    const s = blankGame("mid", { you: "weaver", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 3, terrain: "resource" });
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", { ...mods, cultivate: 0 })).toBe(5);
    expect(incomeOf(s, "you", { ...mods, cultivate: 3 })).toBe(8);   // resource 3 -> 6
  });

  it("carries fractional growth instead of rounding it away", () => {
    const s = blankGame("mid", { you: "bullet", ai: "fire" });   // prod 0.70
    put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 1 });
    put(s, 1, 2, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    const start = tile(s, 1, 1).soldiers;
    for (let i = 0; i < 4; i++) runProduction(s, "you", mods);
    expect(tile(s, 1, 1).soldiers).toBeGreaterThan(start);   // 0.7/turn still accumulates
  });

  it("hatches Brood Nursery soldiers into the nest", () => {
    const s = blankGame("mid", { you: "weaver", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    runProduction(s, "you", { ...mods, brood: 3 });
    expect(tile(s, 1, 1).soldiers).toBe(10 + 2 + 3);   // base output + brood
  });
});
