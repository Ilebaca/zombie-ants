import { describe, it, expect } from "vitest";
import { fight, moveOrAttack, defaultContext, tile, recomputeConnectivity } from "../index";
import { blankGame, put } from "./helpers";

describe("fight() is deterministic", () => {
  it("returns the identical result for identical inputs", () => {
    const a = fight(20, 0.86, 8, 1.25, 1);
    for (let i = 0; i < 50; i++) expect(fight(20, 0.86, 8, 1.25, 1)).toEqual(a);
  });

  it("matches the worked example in the GDD", () => {
    // 20 Fire Ants (0.86) vs 8 Leafcutters (1.25) on a stable (+1)
    const res = fight(20, 0.86, 8, 1.25, 1);
    expect(res.winner).toBe("atk");
    expect(res.survivors).toBe(7);
  });

  it("leaves at least one survivor on either side", () => {
    expect(fight(2, 1, 100, 1, 6).survivors).toBeGreaterThanOrEqual(1);
    expect(fight(100, 1, 2, 1, 0).survivors).toBeGreaterThanOrEqual(1);
  });

  it("gives the defender the tile on a tie", () => {
    expect(fight(10, 1, 10, 1, 0).winner).toBe("def");
  });
});

describe("capture rules", () => {
  it("claims empty ground and promotes it to a stable", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 20 });
    recomputeConnectivity(s);
    s.current = "you";

    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, defaultContext());
    expect(tile(s, 2, 1).owner).toBe("you");
    expect(tile(s, 2, 1).struct).toBe("stable");
    expect(tile(s, 1, 1).soldiers).toBe(1);   // floor of 1 always stays
  });

  it("never empties the source tile", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 5 });
    recomputeConnectivity(s);
    s.current = "you";
    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, defaultContext());
    expect(tile(s, 1, 1).soldiers).toBe(1);
  });

  it("beats a wild garrison, and a failed attack leaves it weakened but not regenerating", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 4 });
    put(s, 2, 1, { terrain: "resource", guard: 30 });
    recomputeConnectivity(s);
    s.current = "you";

    moveOrAttack(s, { c: 1, r: 1 }, { c: 2, r: 1 }, defaultContext());
    expect(tile(s, 2, 1).owner).toBeNull();          // attack failed
    expect(tile(s, 2, 1).guard).toBeLessThan(30);    // but the guard took losses
  });
});

describe("nest capture ends the match", () => {
  // Regression: a refactor relabelled a captured nest "stable" BEFORE the win check,
  // so capturing the enemy queen silently stopped ending the game. (CLAUDE.md §5)
  it("ends the game immediately when the enemy nest falls, even if they hold other tiles", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 200 });
    put(s, 3, 1, { owner: "ai", struct: "nest", soldiers: 3 });
    put(s, 8, 8, { owner: "ai", struct: "stable", soldiers: 50 });  // AI still holds ground
    recomputeConnectivity(s);
    s.current = "you";

    const events = moveOrAttack(s, { c: 2, r: 1 }, { c: 3, r: 1 }, defaultContext());
    expect(s.over).toBe(true);
    expect(s.winner).toBe("you");
    expect(events.some((e) => e.type === "gameOver" && e.reason === "nest")).toBe(true);
  });

  it("loses the match when your own nest falls, whatever else you hold", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 2 });
    put(s, 6, 6, { owner: "you", struct: "stable", soldiers: 80 });
    put(s, 1, 2, { owner: "ai", struct: "stable", soldiers: 200 });
    put(s, 1, 3, { owner: "ai", struct: "nest", soldiers: 10 });   // attacker must be supplied
    recomputeConnectivity(s);
    s.current = "ai";

    moveOrAttack(s, { c: 1, r: 2 }, { c: 1, r: 1 }, defaultContext());
    expect(s.over).toBe(true);
    expect(s.winner).toBe("ai");
  });

  it("keeps a captured nest labelled 'nest'", () => {
    const s = blankGame();
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    put(s, 2, 1, { owner: "you", struct: "stable", soldiers: 200 });
    put(s, 3, 1, { owner: "ai", struct: "nest", soldiers: 3 });
    recomputeConnectivity(s);
    s.current = "you";
    moveOrAttack(s, { c: 2, r: 1 }, { c: 3, r: 1 }, defaultContext());
    expect(tile(s, 3, 1).struct).toBe("nest");
  });
});
