import { describe, it, expect } from "vitest";
import { incomeOf, recomputeConnectivity, runProduction, tile, NEUTRAL_MODS } from "../index";
import { blankGame, put } from "./helpers";

const mods = { ...NEUTRAL_MODS };

describe("production", () => {
  it("pays nest 2, stable 1, resource 3", () => {
    const s = blankGame("small", { you: "ghost", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 3 });
    put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 3, terrain: "resource" });
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", mods)).toBe(2 + 1 + 3);
  });

  it("pays nothing for veins", () => {
    const s = blankGame("small", { you: "ghost", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", mods)).toBe(2);
  });

  it("pays nothing for tiles detached from the queen", () => {
    const s = blankGame("small", { you: "ghost", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 1, 7, { owner: "you", struct: "stable", soldiers: 3 });   // floating
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", mods)).toBe(2);
  });

  it("scales resources with Fungal Cultivation, up to double", () => {
    const s = blankGame("small", { you: "ghost", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 3, terrain: "resource" });
    recomputeConnectivity(s);
    expect(incomeOf(s, "you", { ...mods, cultivate: 0 })).toBe(5);
    expect(incomeOf(s, "you", { ...mods, cultivate: 3 })).toBe(8);   // resource 3 -> 6
  });

  it("adds exactly one troop to an ordinary tile each turn", () => {
    const s = blankGame("small", { you: "bullet", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "stable", soldiers: 1 });
    put(s, 1, 2, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    const start = tile(s, 1, 1).soldiers;
    for (let i = 0; i < 4; i++) runProduction(s, "you", mods);
    expect(tile(s, 1, 1).soldiers).toBe(start + 4);
  });

  it("hatches Brood Nursery soldiers into the nest", () => {
    const s = blankGame("small", { you: "ghost", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    runProduction(s, "you", { ...mods, brood: 3 });
    expect(tile(s, 1, 1).soldiers).toBe(10 + 2 + 3);   // base output + brood
  });
});

it("includes Brood Nursery in displayed income and actual output", () => {
  const state = blankGame("small", { you: "ghost", ai: "fire" });
  put(state, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
  recomputeConnectivity(state);
  expect(incomeOf(state, "you", { ...mods, brood: 5 })).toBe(7);
  const events = runProduction(state, "you", { ...mods, brood: 5 });
  const gained = events.find((event) => event.type === "production");
  expect(gained?.type === "production" ? gained.gained : 0).toBe(7);
});

it("uses identical regular and special tile output for all eight species", () => {
  for(const species of ["ghost","pharaoh","leafcutter","fire","army","carpenter","bullet","demon"] as const){
    const s=blankGame("small",{you:species,ai:"fire"});
    put(s,1,1,{owner:"you",struct:"nest",soldiers:10});
    put(s,2,1,{owner:"you",struct:"stable",soldiers:3});
    put(s,3,1,{owner:"you",struct:"stable",soldiers:3,terrain:"resource"});
    recomputeConnectivity(s);
    expect(incomeOf(s,"you",mods)).toBe(6);
    for(let turn=1;turn<=10;turn++){
      runProduction(s,"you",mods);
      expect(tile(s,1,1).soldiers).toBe(10+2*turn);
      expect(tile(s,2,1).soldiers).toBe(3+turn);
      expect(tile(s,3,1).soldiers).toBe(3+3*turn);
    }
    expect(incomeOf(s,"you",{...mods,brood:2,cultivate:3})).toBe(11);
  }
});
