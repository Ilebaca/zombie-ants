import { describe, it, expect } from "vitest";
import {
  defaultContext, isConnected, moveOrAttack, pruneAllVeins, rally, rallyTargets,
  recomputeConnectivity, tile, travel, travelTargets,
} from "../index";
import { blankGame, put } from "./helpers";

describe("veins have no defence", () => {
  it("captures an enemy vein instantly, with no losses", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 9 });
    // enemy trail anchored at both ends so it is not pruned before we test it
    put(s, 3, 1, { owner: "ai", struct: "vein", soldiers: 0 });
    put(s, 4, 1, { owner: "ai", struct: "vein", soldiers: 0 });
    put(s, 5, 1, { owner: "ai", struct: "nest", soldiers: 20 });
    recomputeConnectivity(s);
    s.current = "you";

    moveOrAttack(s, { c: 2, r: 1 }, { c: 3, r: 1 }, defaultContext());

    expect(tile(s, 3, 1).owner).toBe("you");
    expect(tile(s, 3, 1).struct).toBe("stable");   // becomes a real tile
    expect(tile(s, 3, 1).soldiers).toBe(8);        // all committed troops survive: no fight
  });
});

describe("dangling veins prune", () => {
  it("destroys a trail back to the nearest captured tile when it loses an anchor", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 3, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 4, 1, { owner: "you", struct: "stable", soldiers: 5 });
    recomputeConnectivity(s);

    // lose the far anchor
    put(s, 4, 1, { owner: "ai", struct: "stable", soldiers: 5 });
    pruneAllVeins(s);

    expect(tile(s, 3, 1).owner).toBeNull();
    expect(tile(s, 2, 1).owner).toBeNull();
    expect(tile(s, 1, 1).struct).toBe("nest");     // the nest is untouched
  });

  it("preserves a junction that still leads somewhere", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 3, 1, { owner: "you", struct: "vein", soldiers: 0 });   // junction
    put(s, 4, 1, { owner: "you", struct: "stable", soldiers: 5 });
    put(s, 3, 2, { owner: "you", struct: "vein", soldiers: 0 });   // branch
    put(s, 3, 3, { owner: "you", struct: "stable", soldiers: 5 });
    recomputeConnectivity(s);

    put(s, 4, 1, { owner: "ai", struct: "stable", soldiers: 5 });  // lose one branch only
    pruneAllVeins(s);

    expect(tile(s, 3, 1).owner).toBe("you");   // junction survives
    expect(tile(s, 3, 2).owner).toBe("you");
    expect(tile(s, 3, 3).owner).toBe("you");
  });
});

describe("veins are infrastructure, not tiles", () => {
  it("is not offered as a rally target", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 8 });
    put(s, 3, 1, { owner: "you", struct: "vein", soldiers: 0 });
    recomputeConnectivity(s);

    const targets = rallyTargets(s, "you").map((t) => t.struct);
    expect(targets).not.toContain("vein");
    expect(targets).toContain("nest");
    expect(targets).toContain("stable");
  });

  it("promotes to a stable if troops do gather on it", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 8 });
    recomputeConnectivity(s);
    s.current = "you";

    rally(s, { c: 2, r: 1 });
    expect(tile(s, 2, 1).struct).toBe("stable");
    expect(tile(s, 2, 1).soldiers).toBeGreaterThan(0);
  });
});

describe("connectivity is anchored to the queen", () => {
  it("marks a fragment with no path to the nest as inactive", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 3 });
    // floating cluster far from the nest, in a corner away from the hive
    put(s, 1, 10, { owner: "you", struct: "stable", soldiers: 3 });
    put(s, 2, 10, { owner: "you", struct: "stable", soldiers: 3 });
    recomputeConnectivity(s);

    expect(isConnected(s, tile(s, 2, 1))).toBe(true);
    expect(isConnected(s, tile(s, 1, 10))).toBe(false);
    expect(isConnected(s, tile(s, 2, 10))).toBe(false);
  });

  it("conducts connectivity through veins", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 3, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 4, 1, { owner: "you", struct: "stable", soldiers: 5 });
    recomputeConnectivity(s);
    expect(isConnected(s, tile(s, 4, 1))).toBe(true);
  });

  it("keeps a lone tunnel gallery connected", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 9, 9, { owner: "you", struct: "stable", soldiers: 5, tunnel: true });
    recomputeConnectivity(s);
    expect(isConnected(s, tile(s, 9, 9))).toBe(true);
  });
});

describe("travel", () => {
  it("lays a vein trail and promotes the destination", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 30 });
    recomputeConnectivity(s);
    s.current = "you";

    const targets = travelTargets(s, tile(s, 1, 1));
    expect(targets.length).toBeGreaterThan(0);

    travel(s, { c: 1, r: 1 }, { c: 1, r: 4 });
    expect(tile(s, 1, 4).owner).toBe("you");
    expect(tile(s, 1, 4).struct).toBe("stable");
    // the path behind it is vein, not stable
    expect(tile(s, 1, 2).struct).toBe("vein");
  });

  it("never reaches further than the travel range", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 30 });
    recomputeConnectivity(s);
    for (const t of travelTargets(s, tile(s, 1, 1))) {
      expect(Math.abs(t.c - 1) + Math.abs(t.r - 1)).toBeLessThanOrEqual(4);
    }
  });
});

/**
 * A LOOP IS NOT AN ANCHOR.
 *
 * The dangling rule is local: it asks each vein how many same-owner neighbours it has. A
 * closed ring answers "two" for ever, so a loop cut off from its colony by a barrage stood
 * on the board permanently — ground that produced nothing, defended nothing, and had to be
 * cleared one tile at a time. Reported from a real match, where venom severed the trail
 * that held one.
 */
describe("veins cut off from the colony", () => {
  /** A 2×2 ring of veins, and a colony somewhere else entirely. */
  const looseRing = () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    for (const [c, r] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) {
      put(s, c, r, { owner: "you", struct: "vein", soldiers: 0 });
    }
    recomputeConnectivity(s);
    return s;
  };

  it("destroys a ring that reaches no captured tile", () => {
    const s = looseRing();
    // Every vein in the ring has two same-owner neighbours, so the anchor rule alone is
    // satisfied by all four of them.
    pruneAllVeins(s);
    for (const [c, r] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) {
      expect(tile(s, c, r).owner, `the ring survived at ${c},${r}`).toBeNull();
      expect(tile(s, c, r).struct).toBeNull();
    }
    expect(tile(s, 1, 1).owner, "the colony is never touched by this").toBe("you");
  });

  it("keeps a ring that is still joined to the colony", () => {
    const s = looseRing();
    // A stable beside the ring: redundant infrastructure is legal, and useful.
    put(s, 4, 5, { owner: "you", struct: "stable", soldiers: 4 });
    recomputeConnectivity(s);
    pruneAllVeins(s);
    for (const [c, r] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) {
      expect(tile(s, c, r).struct, `the ring lost ${c},${r}`).toBe("vein");
    }
  });

  it("takes the whole thing when the tile holding it up is lost", () => {
    const s = looseRing();
    put(s, 4, 5, { owner: "you", struct: "stable", soldiers: 4 });
    recomputeConnectivity(s);
    pruneAllVeins(s);

    // The enemy takes the one captured tile the ring hung from.
    put(s, 4, 5, { owner: "ai", struct: "stable", soldiers: 4 });
    pruneAllVeins(s);
    for (const [c, r] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) {
      expect(tile(s, c, r).owner, `${c},${r} outlived its anchor`).toBeNull();
    }
  });

  it("leaves a trail that still ends on a captured tile", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    for (const c of [2, 3, 4]) put(s, c, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 5, 1, { owner: "you", struct: "stable", soldiers: 6 });
    recomputeConnectivity(s);

    pruneAllVeins(s);
    for (const c of [2, 3, 4]) expect(tile(s, c, 1).struct, `vein at ${c}`).toBe("vein");
  });
});
