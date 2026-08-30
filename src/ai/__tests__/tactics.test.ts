/**
 * TACTICAL PUZZLES
 *
 * Each position has one right answer that a human would find. They exist because
 * "the AI feels weak" is not a bug report you can fix — these turn it into one.
 *
 * Every puzzle is written so the naive generator (adjacent attacks only, no idea what is
 * hanging) fails it. Between them they cover the four things the old AI could not do:
 * mass an army, rally, see a tile hanging, and look past its own capture.
 */
import { describe, expect, it } from "vitest";
import {
  NEUTRAL_MODS, defaultContext, recomputeConnectivity, tile,
} from "../../engine";
import { blankGame, put } from "../../engine/__tests__/helpers";
import { aiTurn, chooseMove } from "../search";
import { FULL, NAIVE, evaluate } from "../evaluate";

const ctx = defaultContext();
const mods = { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };

describe("massing an army", () => {
  /**
   * Two piles of 9 each lose to a stable of 14; one pile of 17 beats it. The only way to
   * win this position is to spend a turn joining them, which the old generator could not
   * even propose — it skipped every move onto a tile the AI already owned.
   */
  const twoPiles = () => {
    const s = blankGame("small");
    put(s, 0, 0, { owner: "ai", struct: "nest", soldiers: 4 });
    put(s, 1, 0, { owner: "ai", struct: "stable", soldiers: 20 });
    put(s, 1, 1, { owner: "ai", struct: "stable", soldiers: 20 });
    // The enemy QUEEN, so joining is not merely good — it wins the match next turn, and
    // no amount of free ground elsewhere can be worth more than that.
    put(s, 2, 1, { owner: "you", struct: "nest", soldiers: 14 });
    recomputeConnectivity(s);
    s.current = "ai";
    return s;
  };

  it("joins two piles that each lose the fight separately", () => {
    const s = twoPiles();
    // 19 attacking loses to 14 behind a nest's flat defence; 39 walks through it.
    aiTurn(s, "ai", "hard", ctx);
    expect(tile(s, 2, 1).owner, "should not have thrown a losing attack").not.toBe("ai");
    const stacked = tile(s, 1, 1).soldiers > 20 || tile(s, 1, 0).soldiers > 20;
    expect(stacked, "hard should have built one fist out of two piles").toBe(true);
  });

  it("easy cannot mass, and that is the point of easy", () => {
    const s = twoPiles();
    aiTurn(s, "ai", "easy", ctx);
    expect(tile(s, 1, 0).soldiers).toBeLessThanOrEqual(20);
    expect(tile(s, 1, 1).soldiers).toBeLessThanOrEqual(20);
  });
});

describe("rally", () => {
  /**
   * Spare troops scattered over six tiles, none of which can break the wall in front of
   * the enemy queen. Rally gathers every one of them onto a single tile in one action.
   * Only hard is given it — it is the strongest action in the game.
   */
  const scattered = () => {
    const s = blankGame("small");
    put(s, 0, 0, { owner: "ai", struct: "nest", soldiers: 10 });
    for (const [c, r] of [[1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [3, 1]] as const) {
      put(s, c, r, { owner: "ai", struct: "stable", soldiers: 8 });
    }
    // Again the queen: the pooled fist is a forced win, so nothing else can compete.
    put(s, 4, 0, { owner: "you", struct: "nest", soldiers: 30 });
    recomputeConnectivity(s);
    s.current = "ai";
    return s;
  };

  it("gathers the colony onto one tile when no single tile can break through", () => {
    const s = scattered();
    // Seven apiece loses to 30 behind a nest; the fifty-one they add up to does not.
    const decision = chooseMove(s, "ai", "hard", ctx);
    expect(decision.move?.action.kind, "hard should reach for rally here").toBe("rally");
  });

  it("normal is not given rally", () => {
    const s = scattered();
    const decision = chooseMove(s, "ai", "normal", ctx);
    expect(decision.move?.action.kind).not.toBe("rally");
  });
});

describe("seeing what is hanging", () => {
  /**
   * A free resource sits one step away, but taking it strips the tile that is the only
   * thing standing between a 40-stack and the AI's queen. The capture is the obvious move
   * and it loses the game; the old evaluation could not see the second half of that.
   */
  const poisonedGift = () => {
    const s = blankGame("small");
    put(s, 0, 4, { owner: "ai", struct: "nest", soldiers: 20 });     // safely out of it
    put(s, 1, 4, { owner: "ai", struct: "stable", soldiers: 6 });
    put(s, 2, 4, { owner: "ai", struct: "stable", soldiers: 6 });
    // A resource stable: the most valuable ordinary tile on the board.
    put(s, 3, 4, { owner: "ai", struct: "stable", terrain: "resource", soldiers: 20 });
    put(s, 4, 4, { owner: "you", struct: "stable", soldiers: 25 });  // the punisher
    put(s, 3, 5, { terrain: "ground" });                             // the bait
    put(s, 8, 8, { owner: "you", struct: "nest", soldiers: 6 });
    recomputeConnectivity(s);
    s.current = "ai";
    return s;
  };

  it("hard leaves the bait alone", () => {
    const s = poisonedGift();
    aiTurn(s, "ai", "hard", ctx);
    // Grabbing (3,5) empties the resource stable to its floor of 1 and the 25-stack next
    // door takes it — trading the board's best tile for its cheapest.
    expect(tile(s, 3, 4).soldiers, "stripped the resource stable for a plain tile")
      .toBeGreaterThan(1);
  });

  /** Isolate the term: the same weights with `hanging` switched off. */
  it("the evaluation prices what the opponent can take next move", () => {
    const s = poisonedGift();
    // Play the greedy capture, then ask both evaluations what they think of the result.
    aiTurn(s, "ai", "easy", ctx);
    const seeing = evaluate(s, "ai", mods, FULL);
    const blind = evaluate(s, "ai", mods, { ...FULL, hanging: 0 });
    expect(seeing).toBeLessThan(blind);
  });
});

describe("looking past its own capture", () => {
  /**
   * A trade that wins a tile now and loses a bigger one immediately after. Without
   * quiescence the search stops on the capture and calls the position good — the classic
   * horizon effect, and the reason the old deep search played worse than the shallow one.
   */
  it("declines a capture that is recaptured at a loss", () => {
    const s = blankGame("small");
    put(s, 0, 0, { owner: "ai", struct: "nest", soldiers: 8 });
    put(s, 1, 0, { owner: "ai", struct: "stable", soldiers: 20 });
    put(s, 2, 0, { owner: "you", struct: "stable", soldiers: 6 });    // takeable
    put(s, 3, 0, { owner: "you", struct: "stable", soldiers: 60 });   // recaptures
    put(s, 0, 1, { terrain: "resource" });                            // the calm alternative
    put(s, 8, 8, { owner: "you", struct: "nest", soldiers: 6 });
    recomputeConnectivity(s);
    s.current = "ai";

    aiTurn(s, "ai", "hard", ctx);
    // Taking (2,0) arrives with a handful of survivors and hands them straight back.
    expect(tile(s, 2, 0).owner).not.toBe("ai");
  });
});

describe("finishing", () => {
  it("takes the queen when the queen is takeable", () => {
    const s = blankGame("small");
    put(s, 4, 0, { owner: "ai", struct: "nest", soldiers: 60 });
    put(s, 5, 0, { owner: "you", struct: "nest", soldiers: 3 });
    put(s, 8, 8, { owner: "you", struct: "stable", soldiers: 5 });
    recomputeConnectivity(s);
    s.current = "ai";

    aiTurn(s, "ai", "hard", ctx);
    expect(s.over).toBe(true);
    expect(s.winner).toBe("ai");
  });

  it("every difficulty finds a mate in one", () => {
    for (const level of ["easy", "normal", "hard"] as const) {
      const s = blankGame("small");
      put(s, 4, 0, { owner: "ai", struct: "nest", soldiers: 60 });
      put(s, 5, 0, { owner: "you", struct: "nest", soldiers: 3 });
      put(s, 8, 8, { owner: "you", struct: "stable", soldiers: 5 });
      recomputeConnectivity(s);
      s.current = "ai";
      aiTurn(s, "ai", level, ctx);
      expect(s.winner, `${level} missed a mate in one`).toBe("ai");
    }
  });
});

describe("the Hive", () => {
  /**
   * Capturing the Hive queen multiplies BOTH attack and defence by 1.5 for the whole
   * surge — the biggest swing on the board by a wide margin. The evaluation used to score
   * the whole thing as five ordinary tiles, so the AI would wander past the centre of the
   * map rather than fight for it.
   */
  const holdingTheHive = (owner: "ai" | "you" | null, left: number) => {
    const s = blankGame("small");
    put(s, 0, 0, { owner: "ai", struct: "nest", soldiers: 20 });
    put(s, 8, 8, { owner: "you", struct: "nest", soldiers: 20 });
    recomputeConnectivity(s);
    s.hive.phase = owner ? "buff" : "awake";
    s.hive.owner = owner;
    s.hive.buffLeft = left;
    return s;
  };

  it("prices the surge, and prices it down as it runs out", () => {
    const none = evaluate(holdingTheHive(null, 0), "ai", mods, FULL);
    const fresh = evaluate(holdingTheHive("ai", 6), "ai", mods, FULL);
    const fading = evaluate(holdingTheHive("ai", 1), "ai", mods, FULL);
    expect(fresh).toBeGreaterThan(fading);
    expect(fading).toBeGreaterThan(none);
  });

  it("counts the enemy holding it as exactly as bad", () => {
    const mine = evaluate(holdingTheHive("ai", 6), "ai", mods, FULL);
    const theirs = evaluate(holdingTheHive("you", 6), "ai", mods, FULL);
    const none = evaluate(holdingTheHive(null, 0), "ai", mods, FULL);
    expect(mine - none).toBeCloseTo(none - theirs, 5);
  });

  it("means nothing to Easy, which counts material and no more", () => {
    // The levels differ in what they UNDERSTAND, not only in how far they look ahead.
    expect(evaluate(holdingTheHive("ai", 6), "ai", mods, NAIVE))
      .toBeCloseTo(evaluate(holdingTheHive(null, 0), "ai", mods, NAIVE), 5);
  });
});

describe("the ladder", () => {
  /**
   * The levels have to be different when they actually play, not only in puzzles.
   *
   * This is deliberately small — four short games on the small map — because self-play is
   * slow and the suite has to stay quick. It is a tripwire, not a measurement: `npm run
   * ladder` is the real one. It exists because the ladder has been INVERTED before, with
   * `hard` losing to `easy` while every unit test passed, and nothing in the suite noticed.
   */
  it("hard beats easy on the small board", async () => {
    const { playGame } = await import("../../../tools/arena");
    const { PROFILES } = await import("../search");
    const budgets = Object.values(PROFILES).map((p) => [p.timeBudgetMs, p.nodeBudget] as const);
    // Budgeted by NODES, not by the clock. The shipped budgets are wall-clock so a slow
    // phone thinks less — which also means a loaded CI box thinks less, and a test that
    // plays whole games off a clock is a coin flip. Nodes make the same search happen
    // every run. Cut, so the suite stays quick, but not so far that the levels converge
    // on one ply and stop being distinguishable at all.
    //
    // AND NO SINGLE GAME MAY BLOCK THE THREAD FOR A MINUTE. The search is synchronous, so
    // while a game runs the worker cannot answer the reporter — and vitest's RPC gives up
    // at sixty seconds, which failed the whole suite on a slow CI box with every test
    // passing. Two games at a sixteenth of the budget is seventeen seconds each here and
    // decides the ladder exactly as the sixth did: hard took both games at either budget.
    for (const p of Object.values(PROFILES)) {
      p.timeBudgetMs = 60_000;
      p.nodeBudget = Math.max(300, Math.round(p.nodeBudget / 16));
    }
    try {
      let hardWins = 0;
      for (let i = 0; i < 2; i++) {
        const hardIsYou = i === 0;                     // one game from each side
        const r = playGame(
          hardIsYou ? "hard" : "easy", hardIsYou ? "easy" : "hard",
          500 + i, "small", { you: "fire", ai: "leafcutter" },
        );
        if (r.winner && (r.winner === "you") === hardIsYou) hardWins++;
        // Hand the loop back between games so the worker can answer the reporter it could
        // not answer while the search had the thread.
        await new Promise(setImmediate);
      }
      // BOTH, not one of two. Combat is deterministic and the budget is nodes, so this is
      // a fixed answer rather than a sample — and "at least one" was satisfied by an AI
      // crippled to a single ply, which is exactly the regression the test is here for.
      expect(hardWins, "hard did not beat easy from both sides").toBe(2);
    } finally {
      Object.values(PROFILES).forEach((p, i) => {
        const b = budgets[i] as readonly [number, number];
        p.timeBudgetMs = b[0]; p.nodeBudget = b[1];
      });
    }
  }, 60000);
});

/**
 * AN ABILITY THAT COSTS THE TURN.
 *
 * Tunnelling lands five workers anywhere on the board — that IS the move. The AI used to
 * cast it and then still take a move, so a digging colony got two actions a turn where
 * every other species gets one. The player's screen has always ended the turn on a dig;
 * this is the other half of the same rule.
 */
describe("tunnelling", () => {
  const digger = () => {
    const s = blankGame("small", { you: "fire", ai: "ghost" });
    put(s, 6, 6, { owner: "ai", struct: "nest", soldiers: 20 });
    put(s, 5, 6, { owner: "ai", struct: "stable", soldiers: 12 });
    put(s, 4, 6, { owner: "you", struct: "stable", soldiers: 2 });
    put(s, 1, 1, { owner: "you", struct: "nest", soldiers: 10 });
    s.cooldown.ai = 0;
    recomputeConnectivity(s);
    return s;
  };

  it("digs instead of moving, never both", () => {
    const s = digger();
    const events = aiTurn(s, "ai", "normal", ctx);
    expect(events.some((e) => e.type === "tunnelDug"), "it did not dig at all").toBe(true);
    const moved = events.some((e) => e.type === "move" || e.type === "travel"
      || e.type === "combat" || e.type === "rally");
    expect(moved, "it dug AND marched — two actions in one turn").toBe(false);
  });

  it("still takes its move on a turn it cannot dig", () => {
    const s = digger();
    s.cooldown.ai = 3;                                  // recharging: no dig this turn
    const events = aiTurn(s, "ai", "normal", ctx);
    expect(events.some((e) => e.type === "tunnelDug")).toBe(false);
    expect(events.length, "it did nothing at all").toBeGreaterThan(0);
  });
});
