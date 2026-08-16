import { describe, it, expect } from "vitest";
import { addEffect, isConnected, recomputeConnectivity, tickEffects, tile, NEUTRAL_MODS, PERMANENT } from "../index";
import { blankGame, put } from "./helpers";

const mods = { ...NEUTRAL_MODS };

describe("effects", () => {
  it("venom that severs a colony deactivates the far side immediately", () => {
    // Regression: connectivity was not recomputed after effects, so cut-off units
    // stayed active for a turn. (CLAUDE.md §4.2)
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 4 });   // connector, will die
    put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 20 });  // only linked through it
    recomputeConnectivity(s);
    expect(isConnected(s, tile(s, 3, 1))).toBe(true);

    addEffect(s, 2, 1, "venom", "ai", 3);
    s.current = "you";
    tickEffects(s, "you", mods);

    expect(tile(s, 2, 1).owner).toBeNull();               // connector destroyed
    expect(isConnected(s, tile(s, 3, 1))).toBe(false);    // far side inactive at once
  });

  it("fire wipes out a small garrison entirely", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 4 });
    recomputeConnectivity(s);
    addEffect(s, 2, 1, "fire", "ai", 3);
    tickEffects(s, "you", mods);
    expect(tile(s, 2, 1).owner).toBeNull();
  });

  it("fire only burns a large garrison down, and the gland softens it", () => {
    const make = (gland: number) => {
      const s = blankGame();
      put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
      put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 100 });
      recomputeConnectivity(s);
      addEffect(s, 2, 1, "fire", "ai", 3);
      tickEffects(s, "you", { ...mods, gland });
      return tile(s, 2, 1).soldiers;
    };
    expect(make(0)).toBe(70);                 // 30% lost
    expect(make(5)).toBeGreaterThan(70);      // gland reduces the burn
  });

  it("expires a leaf wall into defensive armour, but never a permanent one", () => {
    const s = blankGame();
    addEffect(s, 4, 4, "leaf", "you", 1);
    tickEffects(s, "you", mods);
    expect(s.effects.some(e => e.kind === "leaf" && e.c === 4)).toBe(false);
    expect(s.effects.some(e => e.kind === "armor" && e.c === 4)).toBe(true);

    addEffect(s, 6, 6, "leaf", "you", PERMANENT);
    for (let i = 0; i < 20; i++) tickEffects(s, "you", mods);
    expect(s.effects.some(e => e.kind === "leaf" && e.c === 6)).toBe(true);
  });
});
