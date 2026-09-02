/**
 * WHAT HAPPENED IN THE LAST TWENTY MATCHES.
 *
 * The career counted games and wins and remembered not one of them. This is which ones —
 * and, where it fits, the match as DATA so it can be watched back.
 *
 * The rule worth guarding is what happens when a record is too long to keep: the entry is
 * kept WITHOUT it. A truncated record replays to a board the match never reached, which
 * would show a match ending in a way it did not — worse than offering no replay at all.
 */
import { describe, expect, it } from "vitest";
import {
  HISTORY_MAX, RECORD_MAX_MOVES, addToHistory, canReplay, fitRecord, outcomeOf,
} from "../history";
import type { MatchLog } from "../history";
import { MemoryStore } from "../storage";
import { ProfileStore } from "../profile";
import type { MatchSetup, Move } from "../../engine";

const setup: MatchSetup = { map: "small", species: { you: "fire", ai: "ghost" }, seed: 7 };

const log = (over: Partial<MatchLog> = {}): MatchLog => ({
  id: "m:1", at: 1_000, map: "small", you: "fire", foe: "ghost", foeName: "Vela",
  human: true, winner: "you", reason: "nest", turns: 30, playedMs: 120_000,
  colonyBefore: 100, colonyAfter: 140, ...over,
});

const moves = (n: number): Move[] => Array.from({ length: n }, () => ({ do: "end" as const }));

describe("keeping a history", () => {
  it("puts the newest first and caps the list", () => {
    let history: MatchLog[] = [];
    for (let i = 0; i < HISTORY_MAX + 6; i++) {
      history = addToHistory(history, log({ id: `m:${i}`, at: i }));
    }
    expect(history.length).toBe(HISTORY_MAX);
    expect(history[0]?.id, "the newest match is not at the top").toBe(`m:${HISTORY_MAX + 5}`);
  });

  it("does not list the same match twice", () => {
    const once = addToHistory([], log());
    expect(addToHistory(once, log()).length).toBe(1);
  });

  /**
   * A LONG MATCH IS KEPT AS FACTS, NOT AS A BROKEN RECORD. `localStorage` holds a few
   * megabytes for everything the game knows, and a marathon is both the least worth
   * watching back and the most likely to push something else out.
   */
  it("drops the moves of a match too long to store, and keeps the match", () => {
    const long = fitRecord(log({ record: { setup, moves: moves(RECORD_MAX_MOVES + 1) } }));
    expect(long.record, "a huge record was stored anyway").toBeUndefined();
    expect(long.turns, "the match itself was thrown away with its moves").toBe(30);
    expect(canReplay(long)).toBe(false);
  });

  it("keeps one that fits", () => {
    const short = fitRecord(log({ record: { setup, moves: moves(4) } }));
    expect(short.record?.moves.length).toBe(4);
    expect(canReplay(short)).toBe(true);
  });

  /**
   * A record with no moves in it is not something to watch. A real match always has at
   * least the hand-overs, so this only arrives from storage — an edited save, or one from
   * another build — and offering a Watch button on it opens a player that shows the
   * opening board and then nothing, which is indistinguishable from a broken one.
   */
  it("does not offer a replay of nothing", () => {
    expect(canReplay(log({ record: { setup, moves: [] } }))).toBe(false);
  });

  /** ...and never a HALF record, which would replay to a board the match never reached. */
  it("never stores a truncated record", () => {
    const long = fitRecord(log({ record: { setup, moves: moves(RECORD_MAX_MOVES + 200) } }));
    expect(long.record).toBeUndefined();
  });

  it("says how a match went", () => {
    expect(outcomeOf(log({ winner: "you" }))).toBe("won");
    expect(outcomeOf(log({ winner: "ai" }))).toBe("lost");
    expect(outcomeOf(log({ winner: null }))).toBe("drawn");
  });
});

describe("history on the profile", () => {
  it("remembers a match across a reload", () => {
    const kv = new MemoryStore();
    new ProfileStore(kv).rememberMatch(log());
    expect(new ProfileStore(kv).history[0]?.foeName).toBe("Vela");
  });

  /**
   * A malformed RECORD loses the replay, not the match. The facts are what the list reads,
   * and deleting a row because its move list went bad would erase a match the player
   * remembers playing.
   */
  it("keeps the entry when its record is unreadable", () => {
    const kv = new MemoryStore();
    kv.set("zombie-ants.profile", JSON.stringify({
      playerId: "ZA-4K7M-9QX2",
      history: [{ ...log(), record: "not a record" }],
    }));
    const kept = new ProfileStore(kv).history;
    expect(kept.length, "the match was thrown away with its record").toBe(1);
    expect(canReplay(kept[0] as MatchLog)).toBe(false);
  });

  it("throws away an entry it cannot read at all", () => {
    const kv = new MemoryStore();
    kv.set("zombie-ants.profile", JSON.stringify({
      playerId: "ZA-4K7M-9QX2",
      history: [log(), { ...log(), id: "m:2", map: "nowhere" }, "nonsense"],
    }));
    expect(new ProfileStore(kv).history.map((h) => h.id)).toEqual(["m:1"]);
  });
});
