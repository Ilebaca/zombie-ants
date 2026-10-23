import { describe, it, expect } from "vitest";
import {
  abilityReady, activateAbility, addEffect, allTiles, captureQueen, createGame, defaultContext,
  endTurn, hiveCells, isConnected, moveOrAttack, neighbours, NEUTRAL_MODS, pruneAllVeins,
  rally, rallyTargets, recomputeConnectivity, startTurn, tile, travel, travelTargets,
} from "../index";
import { aiTurn } from "../../ai/search";
import type { GameState, Tile } from "../index";
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
    put(s, 1, 7, { owner: "you", struct: "stable", soldiers: 3 });
    put(s, 2, 7, { owner: "you", struct: "stable", soldiers: 3 });
    recomputeConnectivity(s);

    expect(isConnected(s, tile(s, 2, 1))).toBe(true);
    expect(isConnected(s, tile(s, 1, 7))).toBe(false);
    expect(isConnected(s, tile(s, 2, 7))).toBe(false);
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
    put(s, 7, 7, { owner: "you", struct: "stable", soldiers: 5, tunnel: true });
    recomputeConnectivity(s);
    expect(isConnected(s, tile(s, 7, 7))).toBe(true);
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

/**
 * A VEIN IS NOT SOMEWHERE TROOPS CAN STAND (§4.4, §4.6).
 *
 * It holds no garrison — that is what makes damage destroy one outright rather than taking
 * a percentage of nothing — and the other half of the same rule is that troops ARRIVING on
 * one promote it to a stable. Every path that lands troops has to obey it, and one did
 * not: Feeding Swarm devours a bitten garrison INTO a bordering tile of its own, and the
 * tile it picked was allowed to be a vein. The colony grew a vein carrying a garrison,
 * which then ate the next bite as well and climbed on every cast — found by `npm run
 * veins` after a real match came back with a number on a trail.
 */
describe("troops landing on a vein", () => {
  it("promote it rather than garrisoning it, when a swarm devours into one", () => {
    const s = blankGame("small", { you: "army", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    // A trail out of the nest, with the enemy standing beside its far end.
    const vein = put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 4 });
    put(s, 2, 2, { owner: "ai", struct: "stable", soldiers: 12 });
    recomputeConnectivity(s);

    activateAbility(s, "you", { ...NEUTRAL_MODS });

    expect(vein.soldiers === 0 || vein.struct === "stable",
      `a vein was left carrying ${vein.soldiers} soldiers`).toBe(true);
    // And the rest of the rule still holds across the whole board.
    for (const t of allTiles(s)) {
      if (t.struct === "vein") expect(t.soldiers, `${t.c},${t.r}`).toBe(0);
    }
  });

  /**
   * THE LANDING TILE HAS TO SURVIVE THE PRUNE, or this tests nothing. A first version put
   * the runner on the end of a thread: without the promotion the tile stayed a vein with
   * a garrison on it for a moment and was then destroyed for having one anchor, so the
   * board came out clean either way and the mutation that deleted the rule passed. The
   * landing tile is given TWO anchors of its own here, so a vein left carrying troops is
   * still standing to be found.
   */
  it("promote it when a fleeing garrison lands on one", () => {
    const s = blankGame("small", { you: "demon", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 5 });
    put(s, 3, 1, { owner: "ai", struct: "stable", soldiers: 6 });   // runs two tiles clear
    // (4,1) is left open to run across; the trail it lands in holds itself up.
    const landing = put(s, 5, 1, { owner: "ai", struct: "vein", soldiers: 0 });
    put(s, 5, 2, { owner: "ai", struct: "vein", soldiers: 0 });
    put(s, 6, 1, { owner: "ai", struct: "stable", soldiers: 3 });
    put(s, 6, 2, { owner: "ai", struct: "stable", soldiers: 3 });
    recomputeConnectivity(s);

    activateAbility(s, "you", { ...NEUTRAL_MODS });

    expect(landing.soldiers, "the runner never reached the trail").toBeGreaterThan(0);
    expect(landing.struct, "a garrison is standing on a vein").toBe("stable");
    for (const t of allTiles(s)) {
      if (t.struct === "vein") expect(t.soldiers, `${t.c},${t.r} is a vein with a garrison`).toBe(0);
    }
  });
});

/**
 * THE HIVE TAKING ITS FIVE TILES BACK IS AN ANCHOR GOING AWAY.
 *
 * While a colony holds them they are ordinary stables, so a trail may legitimately end on
 * one — and when the surge lapses, or the queen storms a camp off her own ground, they go
 * back to bare ground. `startTurn` recomputed supply lines after the hive tick and did not
 * PRUNE, so the trail stood there as a stub for the rest of the turn with nothing on the
 * board to explain it. Reported from a real match, hive "Back in 4", one vein hanging off
 * the colony pointing at nothing.
 */
describe("the hive handing its tiles back", () => {
  const trailIntoTheHive = (): GameState => {
    const s = blankGame();
    const q = hiveCells(s).find((t) => t.terrain === "hiveQ") as Tile;
    put(s, 1, q.r, { owner: "you", struct: "nest", soldiers: 20 });
    // nest — vein … vein — [hive guard], so the guard is the trail's far anchor.
    for (let c = 2; c < q.c - 1; c++) put(s, c, q.r, { owner: "you", struct: "vein", soldiers: 0 });
    s.hive.phase = "awake";
    s.hive.awokeTurn = 1;
    captureQueen(s, "you");
    recomputeConnectivity(s);
    return s;
  };

  const stubs = (s: GameState): string[] => {
    const bad: string[] = [];
    for (const t of allTiles(s)) {
      if (t.struct !== "vein" || !t.owner) continue;
      let n = 0;
      for (const nb of neighbours(s, t)) {
        if (nb.owner === t.owner && (nb.struct === "vein" || nb.struct === "stable" || nb.struct === "nest")) n++;
      }
      if (n < 2) bad.push(`${t.c},${t.r}`);
    }
    return bad;
  };

  it("holds the trail up while the colony still owns them", () => {
    const s = trailIntoTheHive();
    expect(stubs(s), "the board was already wrong before the surge lapsed").toEqual([]);
  });

  it("prunes the trail in the same tick the surge lapses", () => {
    const s = trailIntoTheHive();
    s.hive.buffLeft = 1;
    s.current = "you";
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });

    expect(s.hive.phase, "the surge never lapsed, so this tested nothing").toBe("cooling");
    expect(stubs(s), "a trail was left hanging off the hive").toEqual([]);
  });
});

/**
 * THE TRIPWIRE. `npm run veins` is the real sweep — every vein rule checked after every
 * engine entry point across whole games at hard; this is the short version the suite can
 * afford, and it exists because of what it replaced.
 *
 * `invariants.test.ts` has played whole games and checked these same rules for months and
 * never once caught a vein fault — because it plays `easy`, and easy generates NO TRAVEL
 * (CLAUDE.md §4a). Travel is the only thing in this game that lays a vein, so the audit
 * with the most vein rules in it was running on boards that had almost none. `normal` is
 * the cheapest difficulty that travels.
 *
 * It also checks after the HAND-OVER, not only after an action: `startTurn` is where
 * effects tick and the hive takes its five tiles back, and both of those can strand a
 * trail. A check that only runs after a move cannot see either.
 */
describe("a real game leaves no trail in a state the rules cannot read", () => {
  const faults = (s: GameState): string[] => {
    const bad: string[] = [];
    const reaching = (owner: "you" | "ai"): Set<string> => {
      const held = new Set<string>();
      const queue = allTiles(s).filter(
        (t) => t.owner === owner && (t.struct === "stable" || t.struct === "nest"));
      while (queue.length) {
        for (const nb of neighbours(s, queue.pop() as Tile)) {
          if (nb.owner !== owner || nb.struct !== "vein") continue;
          const k = `${nb.c},${nb.r}`;
          if (held.has(k)) continue;
          held.add(k);
          queue.push(nb);
        }
      }
      return held;
    };
    const held = { you: reaching("you"), ai: reaching("ai") };
    for (const t of allTiles(s)) {
      if (t.struct !== "vein") continue;
      const at = `${t.c},${t.r}`;
      if (!t.owner) { bad.push(`${at} is a vein owned by nobody`); continue; }
      if (t.soldiers !== 0) bad.push(`${at} is a vein carrying ${t.soldiers} soldiers`);
      let n = 0;
      for (const nb of neighbours(s, t)) {
        if (nb.owner === t.owner && (nb.struct === "vein" || nb.struct === "stable" || nb.struct === "nest")) n++;
      }
      if (n < 2) bad.push(`${at} is a vein standing on ${n} anchor(s)`);
      if (!held[t.owner].has(at)) bad.push(`${at} is a vein reaching no captured tile`);
      if (s.effects.some((e) => e.c === t.c && e.r === t.r && e.kind === "armor")) {
        bad.push(`${at} is a vein wearing armour`);
      }
    }
    return bad;
  };

  it("holds through a game that actually lays some", () => {
    const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
    const s = createGame({ map: "small", species: { you: "army", ai: "bullet" }, seed: 1003 });
    let laid = 0;
    for (let i = 0; i < 26 && !s.over; i++) {
      const p = s.current;
      startTurn(s, mods);
      expect(faults(s), `after startTurn for ${p} on turn ${s.turn}`).toEqual([]);
      if (s.over) break;
      if (abilityReady(s, p)) {
        activateAbility(s, p, mods[p]);
        expect(faults(s), `after ${s.species[p]}'s ability on turn ${s.turn}`).toEqual([]);
      }
      if (s.over) break;
      aiTurn(s, p, "normal", defaultContext());
      expect(faults(s), `after ${p} moved on turn ${s.turn}`).toEqual([]);
      if (s.over) break;
      endTurn(s, mods);
      expect(faults(s), `after turn ${s.turn} was handed over`).toEqual([]);
      laid = Math.max(laid, allTiles(s).filter((t) => t.struct === "vein").length);
    }
    // Without this the whole test passes on a board that never grew a trail — which is
    // exactly how the audit it replaced stayed green while a vein bug shipped.
    expect(laid, "no vein was ever laid, so none of this was tested").toBeGreaterThan(0);
  });
});

/**
 * A VEIN TAKES NO ARMOUR (§4.4, §4.6).
 *
 * Attacking an enemy vein captures it instantly — the combat path returns before `fight()`
 * is reached — so a defence bonus on one cannot change a single outcome. What it does do
 * is DRAW: armour is a full-tile plate and a shield badge, so an armoured vein lit a
 * square over a trail that is drawn as a thin bar, and put a shield on the one tile in the
 * game that cannot defend itself. Fortify already skipped veins; this is the other half.
 */
describe("armour never lands on a trail", () => {
  const armoured = (s: GameState, t: Tile): boolean =>
    s.effects.some((e) => e.c === t.c && e.r === t.r && e.kind === "armor");

  it("is refused by Fungal Garden's frontline sweep", () => {
    const s = blankGame("small", { you: "leafcutter", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    const vein = put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    const stable = put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 4 });
    recomputeConnectivity(s);

    activateAbility(s, "you", { ...NEUTRAL_MODS });

    expect(armoured(s, stable), "the garden armoured nothing, so this tested nothing")
      .toBe(true);
    expect(armoured(s, vein), "a trail was armoured").toBe(false);
  });

  /**
   * THE THIRD PATH, and the one the two add-site guards could not cover. Razing a tile
   * does NOT clear the effects on it — deliberately, because venom and fire keep burning
   * ground after whatever stood there is gone. Armour is the one effect that belongs to
   * the GARRISON rather than to the ground, so it outlived its tile, and a travel laying
   * a trail across that square inherited a shield nobody cast there. Found by the sweep
   * AFTER both other guards were in, which is the whole reason the sweep exists.
   */
  it("is stripped from ground a trail is laid across", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 30 });
    // Ground that was armoured while the colony held it, and has since been lost.
    const lost = put(s, 3, 1, { owner: null, struct: null, soldiers: 0 });
    addEffect(s, lost.c, lost.r, "armor", "you", 4);
    recomputeConnectivity(s);

    const path = travelTargets(s, tile(s, 1, 1)).find((o) => o.c === 4 && o.r === 1);
    expect(path, "the send this test is about is not legal").toBeTruthy();
    travel(s, { c: 1, r: 1 }, { c: 4, r: 1 });

    expect(lost.struct, "the trail never crossed the armoured ground").toBe("vein");
    expect(armoured(s, lost), "a trail inherited armour off the ground under it").toBe(false);
  });

  it("is refused when a leaf wall withers onto ground a trail now crosses", () => {
    const s = blankGame("small", { you: "leafcutter", ai: "fire" });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    const vein = put(s, 2, 1, { owner: "you", struct: "vein", soldiers: 0 });
    put(s, 3, 1, { owner: "you", struct: "stable", soldiers: 4 });
    recomputeConnectivity(s);
    // A wall is only ever cast on EMPTY ground — and a travel may lay a trail across it
    // before it withers, which is the only way these two ever meet.
    addEffect(s, vein.c, vein.r, "leaf", "you", 1);

    s.current = "you";
    startTurn(s, { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } });

    expect(s.effects.some((e) => e.kind === "leaf"), "the wall never withered").toBe(false);
    expect(armoured(s, vein), "a withered wall armoured the trail under it").toBe(false);
  });
});
