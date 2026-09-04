/**
 * A MATCH THAT WAS INTERRUPTED (platform/suspend.ts).
 *
 * The whole feature rests on one property — the engine is pure and seeded, so a setup plus
 * a list of moves IS the board — and on one refusal: a record that will not replay must
 * never be resumed onto a board the match never reached. A player cannot tell that has
 * happened, which is what makes it worse than simply losing the match.
 */
import { describe, expect, it } from "vitest";
import { SuspendStore, suspendKey } from "../suspend";
import type { SuspendDifficulty, Suspended } from "../suspend";
import { MemoryStore } from "../storage";
import { PROFILE_KEY } from "../profile";
import type { Difficulty } from "../../ai/search";
import { START_SHAPES, applyMove, createGame, defaultContext } from "../../engine";
// Tests may reach across a layer; nothing else in `platform/` may (CLAUDE.md §3).
import { aiTurn } from "../../ai/search";
import type { MatchSetup, Move } from "../../engine";

const SETUP: MatchSetup = {
  map: "tiny",
  species: { you: "fire", ai: "carpenter" },
  seed: 12345,
  shape: START_SHAPES.wedge,
  aiShape: START_SHAPES.wedge,
};

const held = (moves: Move[], over: Partial<Suspended> = {}): Suspended => ({
  setup: SETUP,
  moves,
  playedMs: 90_000,
  queens: 1,
  turn: 3,
  difficulty: "hard",
  at: 1_700_000_000_000,
  ...over,
});

/** The moves a real board actually accepts, so a fixture cannot drift from the rules. */
function realMoves(count: number): Move[] {
  const state = createGame({
    map: SETUP.map, species: SETUP.species, seed: SETUP.seed,
    shape: SETUP.shape, aiShape: SETUP.aiShape,
  });
  const out: Move[] = [];
  for (let i = 0; i < count; i++) {
    const move: Move = { do: "end" };
    const result = applyMove(state, state.current, move);
    expect(result.ok).toBe(true);
    out.push(move);
  }
  return out;
}

const fresh = (): { store: MemoryStore; sus: SuspendStore } => {
  const store = new MemoryStore();
  return { store, sus: new SuspendStore(store, PROFILE_KEY) };
};

describe("where it lives", () => {
  /**
   * BESIDE THE SAVE, NEVER INSIDE IT. A record runs to hundreds of moves and the backup
   * code is a string somebody copies into a message — which is exactly why the history
   * records were taken out of it (platform/backup.ts).
   */
  it("writes to its own key, leaving the profile's untouched", () => {
    const { store, sus } = fresh();
    store.set(PROFILE_KEY, '{"name":"Ridgeback"}');
    sus.save(held(realMoves(2)));

    expect(store.get(PROFILE_KEY)).toBe('{"name":"Ridgeback"}');
    expect(store.get(suspendKey(PROFILE_KEY))).toContain('"moves"');
  });

  /** Each account has its own key, so two colonies on one phone cannot resume into each
   *  other's match. */
  it("keys off the save it belongs to", () => {
    expect(suspendKey("zombie-ants.profile.a2"))
      .not.toBe(suspendKey("zombie-ants.profile"));
  });
});

describe("picking it back up", () => {
  it("rebuilds the exact board the moves lead to", () => {
    const { sus } = fresh();
    const moves = realMoves(4);
    sus.save(held(moves));

    const back = sus.resume();
    expect(back).not.toBeNull();
    // Two hand-overs each: the counter moves when the PLAYER's turn begins.
    expect(back?.state.turn).toBe(3);
    expect(back?.moves).toHaveLength(4);
    expect(back?.playedMs).toBe(90_000);
    expect(back?.queens).toBe(1);
    expect(back?.difficulty).toBe("hard");
  });

  it("gives nothing back when there is nothing waiting", () => {
    expect(fresh().sus.resume()).toBeNull();
  });

  /**
   * THE REFUSAL THIS FILE EXISTS FOR. A record with a move the board will not take cannot
   * be resumed onto anything honest, so it is dropped whole rather than applied as far as
   * it goes — the same rule the history replay follows.
   */
  it("drops a record that will not replay rather than resuming half of it", () => {
    const { store, sus } = fresh();
    // A move by the wrong player at the wrong time: `applyMove` refuses it (§9b).
    const moves: Move[] = [{ do: "end" }, { do: "rally", to: { c: 0, r: 0 } }];
    sus.save(held(moves));

    expect(sus.resume()).toBeNull();
    expect(store.get(suspendKey(PROFILE_KEY))).toBeNull();
  });

  /**
   * A DECIDED MATCH IS NOT A SUSPENDED ONE — it was settled when it ended, and offering it
   * again would pay for it twice. It is reachable: the record is rewritten on the move that
   * WINS, and the app is cleared of it a moment later when the result card goes up, so a
   * process killed in that gap leaves a finished match on disk.
   *
   * The record has to be a real one, and the only way to get a real finished record is for
   * somebody to actually finish a match — so the AI plays one against a side that only
   * hands the turn back. It takes a couple of seconds and it is deterministic: the engine
   * is seeded and the search has no randomness, so this is the same 71-turn game every run.
   */
  it("drops a match that is already over", () => {
    const { sus } = fresh();
    const state = createGame({
      map: SETUP.map, species: SETUP.species, seed: SETUP.seed,
      shape: SETUP.shape, aiShape: SETUP.aiShape,
    });
    const ctx = defaultContext();
    const moves: Move[] = [];
    for (let i = 0; i < 300 && !state.over; i++) {
      if (state.current === "you") aiTurn(state, "you", "normal", ctx, moves);
      const move: Move = { do: "end" };
      if (!applyMove(state, state.current, move).ok) break;
      moves.push(move);
    }
    expect(state.over).toBe(true);         // the fixture is only worth anything if it ended

    sus.save(held(moves));
    expect(sus.resume()).toBeNull();
  }, 30_000);

  /**
   * A SAVE OUTLIVES THE CODE THAT WROTE IT (CLAUDE.md §12), and this one is reachable by
   * hand. Anything malformed gives nothing back rather than a half-built match.
   */
  it("refuses rubbish rather than trusting it", () => {
    for (const bad of ["", "not json", "null", "[]", '{"moves":[]}', '{"setup":{}}']) {
      const { store, sus } = fresh();
      store.set(suspendKey(PROFILE_KEY), bad);
      expect(sus.peek()).toBeNull();
    }
  });

  it("falls back to a sane difficulty rather than one the game has no player for", () => {
    const { store, sus } = fresh();
    store.set(suspendKey(PROFILE_KEY), JSON.stringify({
      ...held([]), difficulty: "impossible",
    }));
    expect(sus.peek()?.difficulty).toBe("normal");
  });
});

describe("putting it down", () => {
  it("keeps one, not a list: a second save replaces the first", () => {
    const { sus } = fresh();
    sus.save(held(realMoves(2), { turn: 2 }));
    sus.save(held(realMoves(4), { turn: 3 }));
    expect(sus.peek()?.turn).toBe(3);
    expect(sus.peek()?.moves).toHaveLength(4);
  });

  it("clears", () => {
    const { sus } = fresh();
    sus.save(held(realMoves(2)));
    sus.clear();
    expect(sus.peek()).toBeNull();
  });
});

/**
 * `platform/` may not import `ai/` (CLAUDE.md §3), so the three difficulties are spelled
 * out in `suspend.ts` rather than imported. This is what stops the two drifting: a fourth
 * level added to the AI and not to the record would silently resume every match against
 * the wrong opponent.
 */
describe("the difficulty list", () => {
  it("is the same three the AI has", () => {
    const mirrored: SuspendDifficulty[] = ["easy", "normal", "hard"];
    const real: Difficulty[] = ["easy", "normal", "hard"];
    // Each list assignable to the other: neither may gain a level the other does not have.
    const a: Difficulty[] = mirrored;
    const b: SuspendDifficulty[] = real;
    expect(a).toEqual(b);
  });
});
