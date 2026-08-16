import { describe, it, expect } from "vitest";
import {
  allTiles, createGame, defaultContext, endTurn, moveOrAttack,
  recomputeConnectivity, restore, snapshot, tile, NEUTRAL_MODS,
} from "../../engine";
import { aiTurn, chooseMove, evaluate, generateMoves } from "../search";
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
    const s = blankGame();
    put(s, 10, 10, { owner: "ai", struct: "nest", soldiers: 3 });
    put(s, 10, 9, { owner: "ai", struct: "stable", soldiers: 40 });   // reserve
    put(s, 9, 10, { owner: "you", struct: "stable", soldiers: 30 });  // threat
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    s.current = "ai";

    const before = tile(s, 10, 10).soldiers;
    aiTurn(s, "ai", "hard", ctx);
    expect(tile(s, 10, 10).soldiers).toBeGreaterThan(before);
  });

  it("prefers a resource over plain ground", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "ai", struct: "nest", soldiers: 10 });
    put(s, 1, 2, { owner: "ai", struct: "stable", soldiers: 20 });
    put(s, 0, 2, { terrain: "resource" });
    put(s, 2, 2, { terrain: "ground" });
    put(s, 11, 11, { owner: "you", struct: "nest", soldiers: 10 });
    recomputeConnectivity(s);
    s.current = "ai";

    aiTurn(s, "ai", "hard", ctx);
    expect(tile(s, 0, 2).owner).toBe("ai");
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
      while (!s.over && guard++ < 200) {
        s.current = "ai"; aiTurn(s, "ai", level, ctx);
        if (s.over) break;
        s.current = "you"; aiTurn(s, "you", "easy", ctx);
        if (s.over) break;
        endTurn(s, mods);
      }
      expect(guard).toBeLessThan(200);   // games actually resolve
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
