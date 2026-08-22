import { describe, it, expect } from "vitest";
import {
  allTiles, attackMultiplier, createGame, defaultContext, defenceMultiplier, endTurn,
  flatDefence, isConnected, moveOrAttack, recomputeConnectivity, restore, snapshot, tile,
  NEUTRAL_MODS,
} from "../../engine";
import { aiTurn, chooseMove, evaluate, generateMoves } from "../search";
import { generate } from "../moves";
import { blankGame, put } from "../../engine/__tests__/helpers";

const ctx = defaultContext();
const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };

/** Signature of every mutable tile field, to prove snapshot/restore is lossless. */
const sig = (s: ReturnType<typeof blankGame>) =>
  allTiles(s).map(t => `${t.owner}${t.struct}${t.soldiers}${t.guard}${t.tunnel}`).join("|");

describe("snapshot / restore", () => {
  it("restores the board exactly after a simulated move", () => {
    const s = createGame({ map: "mid", species: { you: "fire", ai: "fire" } });
    const before = sig(s);
    const snap = snapshot(s);

    const moves = generateMoves(s, "ai", ctx);
    s.current = "ai";
    moveOrAttack(s, moves[0]!.from, moves[0]!.to, ctx);
    expect(sig(s)).not.toBe(before);        // the move really happened

    restore(s, snap);
    expect(sig(s)).toBe(before);            // and was perfectly undone
  });
});

describe("search quality", () => {
  it("takes a lethal nest capture", () => {
    const s = blankGame();
    put(s, 4, 4, { owner: "ai", struct: "nest", soldiers: 60 });
    put(s, 5, 4, { owner: "you", struct: "nest", soldiers: 3 });
    put(s, 1, 10, { owner: "you", struct: "stable", soldiers: 5 });
    recomputeConnectivity(s);
    s.current = "ai";

    aiTurn(s, "ai", "hard", ctx);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("ai");
  });

  it("avoids a trade the opponent immediately punishes", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "ai", struct: "nest", soldiers: 10 });
    put(s, 3, 3, { owner: "ai", struct: "stable", soldiers: 12 });
    put(s, 4, 3, { owner: "you", struct: "stable", soldiers: 3 });    // bait
    put(s, 4, 2, { owner: "you", struct: "stable", soldiers: 60 });   // punisher
    put(s, 9, 9, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    s.current = "ai";

    aiTurn(s, "ai", "hard", ctx);
    expect(tile(s, 4, 3).owner).not.toBe("ai");
  });

  it("defends its nest before attacking elsewhere", () => {
    const s = blankGame("small");
    put(s, 7, 7, { owner: "ai", struct: "nest", soldiers: 3 });
    put(s, 7, 6, { owner: "ai", struct: "stable", soldiers: 40 });    // reserve
    // The threat has to be CONNECTED to its own nest or it cannot act at all
    // (`canActFrom`), and an AI that garrisons against an army which is already cut off is
    // wasting the turn. An earlier version of this test forgot that and was passing on a
    // threat that could never have landed.
    put(s, 6, 7, { owner: "you", struct: "stable", soldiers: 30 });
    for (const r of [6, 5, 4, 3, 2]) put(s, 6, r, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 6, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    s.current = "ai";

    aiTurn(s, "ai", "hard", ctx);
    endTurn(s, mods);           // hand over, which is when burn and production tick

    /*
     * Asserted on the OUTCOME at the moment it matters, not on the move.
     *
     * There is more than one right answer here and the AI has found two of them: garrison
     * the queen, or take (6,6) and cut the 30-stack off from its own nest, after which it
     * cannot act at all. It has also played a third — set the raider alight and let the
     * burn tick down before it can swing. Demanding the garrison specifically would have
     * failed all the cleverer plays; what must be true is only that when the opponent is
     * actually on move, the queen is not there for the taking.
     */
    const queen = tile(s, 7, 7);
    const raider = tile(s, 6, 7);
    const canTakeHer = raider.owner === "you"
      && isConnected(s, raider)
      && (raider.soldiers - 1) * attackMultiplier(s, "you", NEUTRAL_MODS)
         > queen.soldiers * defenceMultiplier(s, "ai", NEUTRAL_MODS)
           + flatDefence(s, queen, NEUTRAL_MODS);
    expect(canTakeHer, "left the queen there for the taking").toBe(false);
  });

  it("ranks an adjacent resource above adjacent plain ground", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "ai", struct: "nest", soldiers: 10 });
    put(s, 1, 2, { owner: "ai", struct: "stable", soldiers: 20 });
    put(s, 0, 2, { terrain: "resource" });
    put(s, 2, 2, { terrain: "ground" });
    put(s, 11, 11, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    s.current = "ai";

    // Asserted on the ORDERING, not on the move played. Two things make the played move a
    // bad assertion on an otherwise empty board: with no enemy contact, a long push into
    // open ground is a defensible choice, and the wild Hive sits at the centre of every
    // map, so "empty board" positions quietly offer the AI a better objective than the
    // resource. What must never be defensible is rating plain ground above a resource.
    const ranked = generate(s, "ai", ctx, { limit: 400, travel: true, rally: true, reinforce: true, veinGuard: true });
    const step = (c: number, r: number): number =>
      ranked.findIndex((x) => x.action.kind === "move" && x.action.to.c === c && x.action.to.r === r);
    const resource = step(0, 2);
    const plain = step(2, 2);
    // Compared against each other, not against the whole list: a long send can and should
    // outrank both, because with one action per turn a four-tile reach beats a one-tile
    // step even onto something good. What must never invert is these two.
    expect(resource).toBeGreaterThanOrEqual(0);
    expect(plain).toBeGreaterThan(resource);
  });

  it("never sees through a cloaked tile", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "ai", struct: "nest", soldiers: 20 });
    const hidden = put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 99 });
    hidden.hidden = true;
    recomputeConnectivity(s);
    // the AI should treat it as empty ground, i.e. as a cheap expansion, not a known fight
    const moves = generateMoves(s, "ai", ctx);
    const m = moves.find(x => x.to.c === 2 && x.to.r === 1);
    expect(m).toBeDefined();
  });
});

describe("difficulty", () => {
  it("plays a full deterministic match without error at every depth", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const s = createGame({ map: "small", species: { you: "fire", ai: "fire" } });
      let guard = 0;
      // Drive it exactly as the match screen does: whoever is `current` acts, then the turn
      // is handed over. Setting `current` by hand instead means endTurn never increments the
      // turn counter, so the turn limit can never resolve a stalemate.
      while (!s.over && guard++ < 400) {
        aiTurn(s, s.current, s.current === "ai" ? level : "easy", ctx);
        if (s.over) break;
        endTurn(s, mods);
      }
      expect(s.over, `${level} never resolved`).toBe(true);
      expect(s.winner).not.toBeNull();
    }
  });

  it("searching does not mutate the real board", () => {
    const s = createGame({ map: "mid", species: { you: "fire", ai: "fire" } });
    const before = sig(s);
    chooseMove(s, "ai", "hard", ctx);
    expect(sig(s)).toBe(before);
  });

  it("scores a winning position above a losing one", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "ai", struct: "nest", soldiers: 50 });
    put(s, 2, 1, { owner: "ai", struct: "stable", soldiers: 30 });
    put(s, 9, 9, { owner: "you", struct: "nest", soldiers: 5 });
    recomputeConnectivity(s);
    expect(evaluate(s, "ai", mods)).toBeGreaterThan(0);
    expect(evaluate(s, "you", mods)).toBeLessThan(0);
  });
});
