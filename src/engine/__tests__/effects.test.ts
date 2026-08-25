import { describe, it, expect } from "vitest";
import {
  addEffect, hiveCells, isConnected, recomputeConnectivity, setHiveDefence, startTurn,
  tickEffects, tile, NEUTRAL_MODS, PERMANENT,
} from "../index";
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

describe("venom on a trail", () => {
  /**
   * A vein holds no garrison at all, so the soldier arithmetic in the venom tick could
   * never touch one — the barrage fell straight through the thing most worth hitting.
   * Breaking one is rarely just one tile: connectivity is nest-anchored (§4.2), so
   * everything that reached the nest only through here goes dark, and the trail beyond
   * the break loses its anchor and prunes in turn (§4.5).
   */
  const trail = () => {
    const s = blankGame("small");
    s.current = "you";
    // nest — vein — vein — vein — outpost, a single thread out from the colony
    put(s, 0, 0, { owner: "you", struct: "nest", soldiers: 20 });
    for (const c of [1, 2, 3]) put(s, c, 0, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 4, 0, { owner: "you", struct: "stable", soldiers: 6 });
    recomputeConnectivity(s);
    return s;
  };

  it("destroys the vein it lands on", () => {
    const s = trail();
    addEffect(s, 2, 0, "venom", "ai", 3);
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });
    expect(tile(s, 2, 0).owner, "the trail survived a direct hit").toBeNull();
    expect(tile(s, 2, 0).struct).toBeNull();
  });

  it("takes the whole trail with it, and strands what hung off the end", () => {
    const s = trail();
    addEffect(s, 2, 0, "venom", "ai", 3);
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });

    /*
     * The ENTIRE thread goes, not just the far half. A vein needs two same-owner anchors
     * (§4.5), so the break leaves (1,0) hanging off the nest with nothing on its other
     * side and (3,0) hanging off the outpost — both prune, and the prune iterates.
     * Trails are all-or-nothing that way, which is what makes cutting one worth a cast.
     */
    for (const c of [1, 2, 3]) {
      expect(tile(s, c, 0).owner, `vein at ${c} should have collapsed`).toBeNull();
    }
    // The outpost is not destroyed — it is CUT OFF, which is a different and worse thing:
    // it still belongs to the player, it just produces nothing until it is relinked.
    expect(tile(s, 4, 0).owner).toBe("you");
    expect(isConnected(s, tile(s, 4, 0)), "should have gone dark in the same tick").toBe(false);
    expect(tile(s, 0, 0).owner, "the nest is never touched by this").toBe("you");
  });

  it("leaves the caster's own trails alone", () => {
    const s = trail();
    addEffect(s, 2, 0, "venom", "you", 3);          // our own barrage
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });
    expect(tile(s, 2, 0).owner).toBe("you");
  });

  it("still bleeds a garrisoned tile rather than deleting it outright", () => {
    const s = trail();
    put(s, 4, 0, { owner: "you", struct: "stable", soldiers: 30 });   // enough to survive
    recomputeConnectivity(s);
    addEffect(s, 4, 0, "venom", "ai", 3);
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });
    const t = tile(s, 4, 0);
    expect(t.owner, "a defended tile is bled, not deleted").toBe("you");
    expect(t.soldiers).toBeLessThan(30);
  });

  /**
   * FIRE EATS A TRAIL THE SAME WAY.
   *
   * Wildfire takes 30% of a garrison, and 30% of a vein's garrison is 30% of nothing — so
   * the burn fell straight through the one thing on the board that cannot defend itself.
   * A vein has nothing for the arithmetic to bite, which is exactly why the outcome has to
   * be flat: it burns away, every time.
   */
  it("burns away under enemy fire, every time", () => {
    const s = trail();
    addEffect(s, 2, 0, "fire", "ai", 3);
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });
    expect(tile(s, 2, 0).owner, "the trail survived being set alight").toBeNull();
    expect(tile(s, 2, 0).struct).toBeNull();
    // And the collapse is the same one venom causes: the rest of the thread loses its
    // anchors in the same tick.
    for (const c of [1, 3]) expect(tile(s, c, 0).owner, `vein at ${c}`).toBeNull();
    expect(isConnected(s, tile(s, 4, 0)), "the outpost should have gone dark").toBe(false);
  });

  it("does not burn the caster's own trail", () => {
    const s = trail();
    addEffect(s, 2, 0, "fire", "you", 3);
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });
    expect(tile(s, 2, 0).owner, "a colony burned its own supply line").toBe("you");
  });
});

/**
 * YOUR OWN FIRE BURNS WHAT IS NOT YOURS.
 *
 * Hive terrain stays hive terrain after somebody captures it, and the branch that softens
 * the neutral hive recognised tiles by that terrain alone — so a colony's own fire burned
 * the hive tiles it was holding, down past the one-soldier floor and on to zero. That leaves
 * a tile with an owner and no garrison, which nothing else in the rules can produce.
 */
describe("wildfire and the hive", () => {
  it("softens a hive tile nobody holds", () => {
    const s = blankGame("small");
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 6;
    setHiveDefence(s);
    const guard = hiveCells(s).find((t) => t.terrain === "hiveG") as { c: number; r: number };
    const before = tile(s, guard.c, guard.r).soldiers;
    addEffect(s, guard.c, guard.r, "fire", "you", 3);

    tickEffects(s, "you", { ...NEUTRAL_MODS });
    expect(tile(s, guard.c, guard.r).soldiers).toBeLessThan(before);
  });

  it("leaves a hive tile its own colony is holding alone", () => {
    const s = blankGame("small");
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 6;
    setHiveDefence(s);
    const guard = hiveCells(s).find((t) => t.terrain === "hiveG") as { c: number; r: number };
    put(s, guard.c, guard.r, { owner: "you", struct: "stable", soldiers: 3 });
    addEffect(s, guard.c, guard.r, "fire", "you", 3);

    tickEffects(s, "you", { ...NEUTRAL_MODS });
    const t = tile(s, guard.c, guard.r);
    expect(t.soldiers, "it burned its own garrison").toBe(3);
    expect(t.owner).toBe("you");
  });
});

/**
 * DAMAGE DOES NOT STOP AT ONE, AND DOES NOT ASK WHOSE TILE IT IS.
 *
 * A barrage that only ever hurt the enemy colony was a barrage the wild guards and the
 * sleeping queen sat out — and a rounding rule that could never take the last soldier left
 * them at 1 forever, which is not a floor anyone designed (CLAUDE.md §4.9 is about what you
 * may SPEND, not about what can be killed).
 */
describe("venom lands on whatever it was scattered over", () => {
  it("bleeds a wild garrison", () => {
    const s = blankGame("small");
    const wild = put(s, 1, 1, { owner: null, guard: 10 });
    addEffect(s, 1, 1, "venom", "you", 3);

    tickEffects(s, "you", { ...NEUTRAL_MODS });
    expect(wild.guard).toBeLessThan(10);
  });

  it("bleeds the neutral hive", () => {
    const s = blankGame("small");
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 6;
    setHiveDefence(s);
    const cell = hiveCells(s).find((t) => t.terrain === "hiveG") as { c: number; r: number };
    const before = tile(s, cell.c, cell.r).soldiers;
    addEffect(s, cell.c, cell.r, "venom", "you", 3);

    tickEffects(s, "you", { ...NEUTRAL_MODS });
    expect(tile(s, cell.c, cell.r).soldiers).toBeLessThan(before);
  });

  it("takes the last guard rather than leaving one standing forever", () => {
    const s = blankGame("small");
    const wild = put(s, 1, 1, { owner: null, guard: 3 });
    addEffect(s, 1, 1, "fire", "you", 9);

    for (let i = 0; i < 9 && wild.guard > 0; i++) tickEffects(s, "you", { ...NEUTRAL_MODS });
    expect(wild.guard, "a rounding rule left the last guard immortal").toBe(0);
  });

  it("leaves a hive tile its own colony is holding alone", () => {
    const s = blankGame("small");
    s.hive.phase = "awake"; s.hive.awokeTurn = 1; s.turn = 6;
    setHiveDefence(s);
    const cell = hiveCells(s).find((t) => t.terrain === "hiveG") as { c: number; r: number };
    put(s, cell.c, cell.r, { owner: "you", struct: "stable", soldiers: 4 });
    addEffect(s, cell.c, cell.r, "venom", "you", 3);

    tickEffects(s, "you", { ...NEUTRAL_MODS });
    expect(tile(s, cell.c, cell.r).soldiers, "it poisoned its own garrison").toBe(4);
  });
});
