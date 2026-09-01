/**
 * WHO DECIDES WHO WON.
 *
 * The verification a server will run, written and tested before there is a server —
 * because it is pure, it belongs to the game rather than to a backend, and a bug in it is
 * far cheaper to find here than in production.
 *
 * What it rests on is the engine being seeded and pure: a setup plus a list of moves
 * rebuilds the exact board both players saw, so nobody has to be TOLD who won.
 */
import { describe, expect, it } from "vitest";
import { LocalResults, verify } from "../results";
import type { MatchOutcome } from "../results";
import { actionTargets, applyMove, openingBoard } from "../../engine";
import type { MatchSetup, Move } from "../../engine";

const setup: MatchSetup = {
  map: "tiny",
  species: { you: "fire", ai: "ghost" },
  seed: 1,
};

/**
 * A REAL, FINISHED MATCH, kept as moves.
 *
 * Random legal play rather than good play: what is being tested is that a record
 * reproduces whatever happened, not that anybody played well. Passing would never do —
 * there is no turn limit in this game (CLAUDE.md §4.8), so two players handing the turn
 * back and forth go on for ever and the match never ends.
 */
function playedOut(): { moves: Move[]; winner: "you" | "ai" } {
  const state = openingBoard(setup);
  const moves: Move[] = [];
  let rng = 1;
  const rand = (): number => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 4294967296);

  for (let i = 0; i < 20_000 && !state.over; i++) {
    const options: Move[] = [];
    for (const row of state.grid) {
      for (const tile of row) {
        if (tile.owner !== state.current) continue;
        for (const to of actionTargets(state, tile)) {
          options.push({ do: "move", from: { c: tile.c, r: tile.r }, to });
        }
      }
    }
    const pick: Move = options.length > 0 && rand() < 0.75
      ? (options[Math.floor(rand() * options.length)] as Move)
      : { do: "end" };
    const move = applyMove(state, state.current, pick).ok ? pick : { do: "end" as const };
    if (move !== pick) applyMove(state, state.current, move);
    moves.push(move);
  }
  if (!state.winner) throw new Error("random play never finished a match");
  return { moves, winner: state.winner };
}

const outcome = (over: Partial<MatchOutcome> = {}): MatchOutcome => ({
  winner: "you", turns: 10, playedMs: 60_000, queens: 0, byNest: false, ...over,
});

describe("checking a result against the moves that produced it", () => {
  /** A match with no record is nothing to check — a tutorial has nobody to prove it to. */
  it("accepts a match that came with no record", async () => {
    await expect(new LocalResults().submit(outcome())).resolves.toEqual({ accepted: true });
  });

  it("refuses a record containing a move that could not have happened", () => {
    const moves: Move[] = [{ do: "move", from: { c: 99, r: 99 }, to: { c: 0, r: 0 } }];
    expect(verify(outcome({ record: { setup, moves } })))
      .toEqual({ accepted: false, why: "disagrees" });
  });

  /**
   * THE FORGERY THIS IS FOR. A record of a match nobody won, submitted with a winner on
   * it, is exactly what a client claiming a victory it did not earn would look like.
   */
  it("refuses a winner claimed off a match that never ended", () => {
    const moves: Move[] = [{ do: "end" }, { do: "end" }];
    expect(verify(outcome({ winner: "you", record: { setup, moves } })))
      .toEqual({ accepted: false, why: "disagrees" });
  });

  it("accepts an unfinished record that claims nobody won", () => {
    const moves: Move[] = [{ do: "end" }, { do: "end" }];
    expect(verify(outcome({ winner: null, record: { setup, moves } }))).toEqual({ accepted: true });
  });

  /** ...and the honest case: a real match, replayed, agreeing with itself. */
  it("accepts a result the moves really produce", () => {
    const { moves, winner } = playedOut();
    expect(verify(outcome({ winner, record: { setup, moves } }))).toEqual({ accepted: true });
  });

  it("refuses the same record with the winner swapped", () => {
    const { moves, winner } = playedOut();
    const lie = winner === "you" ? "ai" : "you";
    expect(verify(outcome({ winner: lie, record: { setup, moves } })))
      .toEqual({ accepted: false, why: "disagrees" });
  });

  /**
   * A GENUINE WIN WITH SOMETHING APPENDED. This is the case the "refused move" check is
   * really for: the record replays to the right winner, so the comparison at the end would
   * wave it through — but it also contains a move that could not have happened, and a
   * record that can carry arbitrary extra moves can carry anything.
   */
  it("refuses a real win with a junk move appended", () => {
    const { moves, winner } = playedOut();
    const tampered = [...moves, { do: "move", from: { c: 99, r: 99 }, to: { c: 0, r: 0 } } as Move];
    expect(verify(outcome({ winner, record: { setup, moves: tampered } })))
      .toEqual({ accepted: false, why: "disagrees" });
  });

  it("says so when there is nothing to verify against", () => {
    expect(verify(outcome())).toEqual({ accepted: false, why: "unverifiable" });
  });
});
