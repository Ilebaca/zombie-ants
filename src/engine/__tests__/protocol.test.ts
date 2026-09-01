/**
 * THE WIRE FORMAT, AND WHY IT CAN BE TRUSTED.
 *
 * Two things are being proved here, and neither needs a server to prove.
 *
 * The first is DETERMINISM PAYING OFF: a setup plus a list of moves rebuilds exactly the
 * board those moves were played on. That is the property that makes async multiplayer
 * cheap in this game — no board ever crosses the wire, and a server can check a result it
 * never watched by replaying it.
 *
 * The second is that `applyMove` REFUSES. Every action function in the engine was written
 * for a screen that only ever offers legal taps, so none of them ask whose turn it is and
 * `moveOrAttack` reads the attacker off the tile it was handed — pass it an enemy tile and
 * it marches the enemy's army. A server takes moves from a stranger's phone. These tests
 * are the difference between those two worlds.
 */
import { describe, expect, it } from "vitest";
import {
  applyMove, createGame, endTurn, openingBoard, replayMatch, snapshot,
} from "../index";
import type { MatchSetup, Move } from "../index";

const setup = (): MatchSetup => ({
  map: "small",
  species: { you: "fire", ai: "ghost" },
  seed: 12345,
});

/** Somewhere the player can legally go from the tile they start on. */
function firstLegalMove(state: ReturnType<typeof createGame>): Move {
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.owner !== "you") continue;
      const from = { c: tile.c, r: tile.r };
      for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const to = { c: tile.c + dir[0], r: tile.r + dir[1] };
        const probe = openingBoard(setup());
        if (applyMove(probe, "you", { do: "move", from, to }).ok) {
          return { do: "move", from, to };
        }
      }
    }
  }
  throw new Error("the opening position has no legal move");
}

describe("rebuilding a match from its moves", () => {
  /**
   * THE WHOLE POINT. If this ever stops being true, nothing else about server-side
   * verification or replays works — and the way it would stop is somebody reaching for
   * `Math.random` inside the engine (CLAUDE.md §4.1).
   */
  it("lands on the same board the moves were played on", () => {
    const played = openingBoard(setup());
    const moves: Move[] = [];
    // A handful of turns of real play: a move, then hand over, both sides.
    for (let i = 0; i < 6; i++) {
      const move = firstLegalMove(played);
      if (applyMove(played, played.current, move).ok) moves.push(move);
      applyMove(played, played.current, { do: "end" });
      moves.push({ do: "end" });
    }

    const rebuilt = replayMatch({ setup: setup(), moves });
    expect(rebuilt.refused, "a move that really happened was refused on replay").toBeNull();
    expect(rebuilt.applied).toBe(moves.length);
    expect(snapshot(rebuilt.state), "the rebuilt board is not the board that was played")
      .toEqual(snapshot(played));
  });

  /** A different seed is a different match, or the seed is not doing anything. */
  it("depends on the seed", () => {
    const a = openingBoard({ ...setup(), seed: 1 });
    const b = openingBoard({ ...setup(), seed: 2 });
    expect(a.rng).not.toBe(b.rng);
  });

  it("stops at the first move that could not have happened, and says so", () => {
    const moves: Move[] = [
      { do: "end" },
      { do: "move", from: { c: 99, r: 99 }, to: { c: 98, r: 99 } },
      { do: "end" },
    ];
    const out = replayMatch({ setup: setup(), moves });
    expect(out.applied, "a bad move was let through").toBe(1);
    expect(out.refused).toBe("no-such-tile");
  });
});

describe("refusing a move a client should not have sent", () => {
  it("will not let a player move out of turn", () => {
    const state = openingBoard(setup());
    expect(state.current).toBe("you");
    const move = firstLegalMove(state);
    expect(applyMove(state, "ai", move)).toEqual({ ok: false, why: "not-your-turn" });
  });

  /**
   * THE ONE THAT MATTERS MOST. `moveOrAttack` takes the attacker from the source tile, so
   * handed an enemy tile it moves the enemy's army — there is no guard inside it, because
   * the screen never asks for one. Without this check a client could play its opponent's
   * turn for them.
   */
  it("will not let a player move somebody else's tiles", () => {
    const state = openingBoard(setup());
    for (const row of state.grid) {
      for (const tile of row) {
        if (tile.owner !== "ai") continue;
        const from = { c: tile.c, r: tile.r };
        const to = { c: tile.c - 1, r: tile.r };
        expect(applyMove(state, "you", { do: "move", from, to }))
          .toEqual({ ok: false, why: "not-your-tile" });
        return;
      }
    }
    throw new Error("the opening position has no enemy tile");
  });

  it("will not let a player reach a tile they cannot reach", () => {
    const state = openingBoard(setup());
    const move = firstLegalMove(state);
    const far = { do: "move", from: move.do === "move" ? move.from : { c: 0, r: 0 },
                  to: { c: state.size - 1, r: state.size - 1 } } as const;
    expect(applyMove(state, "you", far).ok, "a move across the whole board was allowed").toBe(false);
  });

  it("will not rally onto ground the player does not hold", () => {
    const state = openingBoard(setup());
    expect(applyMove(state, "you", { do: "rally", to: { c: state.size - 1, r: 0 } }))
      .toEqual({ ok: false, why: "illegal-target" });
  });

  /**
   * An action that produced nothing did NOT happen. The engine says no with an empty event
   * list (CLAUDE.md §5), and reporting that as a success would let a client spend its
   * opponent's clock on moves that change nothing.
   */
  it("refuses an action that changed nothing", () => {
    const state = openingBoard(setup());
    // An ability still on cooldown produces no events, and the cooldown must not be spent
    // by the attempt. A client spamming this would otherwise burn its opponent's clock
    // with moves the board never felt.
    state.cooldown.you = 3;
    expect(applyMove(state, "you", { do: "ability" }))
      .toEqual({ ok: false, why: "nothing-happened" });
    expect(state.cooldown.you, "a refused cast spent the cooldown").toBe(3);
  });

  it("refuses everything once the match is over", () => {
    const state = openingBoard(setup());
    state.over = true;
    expect(applyMove(state, "you", { do: "end" })).toEqual({ ok: false, why: "match-over" });
  });

  /** Handing the turn over is always legal, and it is what the clock runs out into. */
  it("always allows the turn to be handed over", () => {
    const state = openingBoard(setup());
    const before = state.turn;
    expect(applyMove(state, "you", { do: "end" }).ok).toBe(true);
    expect(state.current).toBe("ai");
    expect(endTurn).toBeTypeOf("function");
    expect(state.turn).toBe(before);
  });
});
