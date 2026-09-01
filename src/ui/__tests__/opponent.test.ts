/**
 * PLAYING SOMEBODY WHO IS NOT HERE.
 *
 * The match screen had no seam for this at all: it asked the local search directly, so a
 * turn arriving from another player had nowhere to enter. These tests prove the seam is
 * real by driving a turn through it WITHOUT any AI — a canned list of moves lands on the
 * board, is animated and hands back exactly as a searched turn does.
 *
 * That is the whole point of the shape: there is one landing path, so a remote match
 * cannot drift away from a local one.
 */
import { describe, expect, it } from "vitest";
import { openingBoard, snapshot } from "../../engine";
import type { GameState, Move } from "../../engine";
import { NEUTRAL_MODS, defaultContext } from "../../engine";
import { RemoteOpponent, AiOpponent } from "../opponent";

const MODS = { you: NEUTRAL_MODS, ai: NEUTRAL_MODS };
const board = (): GameState => openingBoard({
  map: "small", species: { you: "fire", ai: "ghost" }, seed: 99,
});

/** Hand the turn to the enemy, so it is their move to make. */
function enemyToPlay(): GameState {
  const state = board();
  state.current = "ai";
  return state;
}

/** A legal move for the enemy from wherever their colony starts. */
function anEnemyMove(state: GameState): Move {
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.owner !== "ai") continue;
      for (const [dc, dr] of [[-1, 0], [0, -1], [1, 0], [0, 1]] as const) {
        const to = { c: tile.c + dc, r: tile.r + dr };
        const cell = state.grid[to.r]?.[to.c];
        if (cell && !cell.owner && cell.terrain !== "blocked") {
          return { do: "move", from: { c: tile.c, r: tile.r }, to };
        }
      }
    }
  }
  throw new Error("the enemy has nowhere to go");
}

describe("a turn that arrives from somewhere else", () => {
  it("lands on the board, and reports what happened", async () => {
    const live = enemyToPlay();
    const move = anEnemyMove(live);
    const remote = new RemoteOpponent("ai", async () => [move, { do: "end" }], MODS, defaultContext());

    const before = snapshot(live);
    const thought = await remote.takeTurn(live, new AbortController().signal);

    expect(thought, "a turn that arrived produced nothing").toBeTruthy();
    expect(thought?.events.length, "the move produced no events").toBeGreaterThan(0);
    // The LIVE board is untouched: the screen adopts the returned one when it animates it,
    // which is what keeps the move from appearing before the reveal that shows it.
    expect(snapshot(live), "a remote turn changed the board before it was animated")
      .toEqual(before);
    expect(thought?.next.current, "the turn was not handed back").toBe("you");
  });

  /**
   * A MOVE THAT COULD NOT HAVE HAPPENED STOPS THE TURN. Playing the rest of it onto a
   * board that has already diverged would put the two players on different boards, which
   * is worse than a stall — and it is exactly what a cheating client would be trying for.
   */
  it("stops at a move it will not accept", async () => {
    const live = enemyToPlay();
    const good = anEnemyMove(live);
    const bad: Move = { do: "move", from: { c: 0, r: 0 }, to: { c: 5, r: 5 } };
    const remote = new RemoteOpponent(
      "ai", async () => [good, bad, { do: "end" }], MODS, defaultContext(),
    );
    const thought = await remote.takeTurn(live, new AbortController().signal);
    expect(thought?.next.current, "the turn ran on past a move that was refused").toBe("ai");
  });

  /** Nobody answered. The screen drops a null, exactly as it drops a late search. */
  it("gives back nothing when the other player never answers", async () => {
    const remote = new RemoteOpponent(
      "ai", () => Promise.reject(new Error("gone")), MODS, defaultContext(),
    );
    await expect(remote.takeTurn(enemyToPlay(), new AbortController().signal)).resolves.toBeNull();
  });

  it("gives back nothing when the match was left", async () => {
    const abort = new AbortController();
    const remote = new RemoteOpponent("ai", async () => { abort.abort(); return []; }, MODS, defaultContext());
    await expect(remote.takeTurn(enemyToPlay(), abort.signal)).resolves.toBeNull();
  });
});

describe("the opponent this game ships with", () => {
  /** The local search still answers through the same seam, or every match is broken. */
  it("still plays a turn, on a copy", async () => {
    const live = enemyToPlay();
    const before = snapshot(live);
    const ai = new AiOpponent("ai", "easy", defaultContext());
    const thought = await ai.takeTurn(live, new AbortController().signal);
    ai.dispose();

    expect(thought, "the AI answered nothing").toBeTruthy();
    expect(thought?.events.length, "the AI did nothing at all on its turn").toBeGreaterThan(0);
    // The same contract the remote source keeps: the live board is untouched until the
    // screen adopts the returned one alongside the animation.
    expect(snapshot(live), "the AI moved the live board instead of a copy").toEqual(before);
  });
});
