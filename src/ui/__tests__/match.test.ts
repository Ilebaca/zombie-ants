/**
 * THE AI'S MOVE MUST LAND WITH THE ANIMATION THAT SHOWS IT.
 *
 * The search runs off the main thread and its answer can arrive well before the AI is due
 * to move. Adopting the searched board the moment it arrived put the finished move on the
 * board — troops already on the far tile, in the enemy's colour — and only then played the
 * reveal that was supposed to be showing it happen. It read as the destination flashing and
 * then being animated into.
 *
 * This drives the real match screen on a fake clock and watches the BOARD, sampling it
 * between every timer step: nothing may change until the batch of events is handed over.
 */
import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import {
  createGame, defaultContext, NEUTRAL_MODS, snapshot,
} from "../../engine";
import type { EngineEvent, GameState } from "../../engine";
import { MatchScreen } from "../match";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];
});
afterEach(() => { vi.useRealTimers(); });

const sig = (s: GameState): string => JSON.stringify(snapshot(s).tiles);

interface Watch { host: HTMLElement; screen: MatchScreen; state: GameState; log: string[] }

/** A match sitting on the AI's turn, with the board sampled on every observation. */
function watch(): Watch {
  const state = createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 11 });
  state.current = "ai";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const log: string[] = [];
  const screen = new MatchScreen(host, {
    state,
    mods: { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } },
    ctx: defaultContext(),
    difficulty: "normal",
    map: "small",
    onEvents: (events: readonly EngineEvent[]) => {
      if (events.length) log.push("events");
    },
  });
  return { host, screen, state, log };
}

describe("the AI's turn", () => {
  it("does not touch the board until its move is animated", async () => {
    vi.useFakeTimers();
    const w = watch();
    const before = sig(w.state);
    w.screen.start();

    // Step forward in small slices, noting when the board first moves and when the events
    // are handed over. They have to be the same slice.
    let boardMovedAt = -1, eventsAt = -1;
    for (let t = 0; t < 40; t++) {
      await vi.advanceTimersByTimeAsync(25);
      if (boardMovedAt < 0 && sig(w.state) !== before) boardMovedAt = t;
      if (eventsAt < 0 && w.log.length) eventsAt = t;
      if (boardMovedAt >= 0 && eventsAt >= 0) break;
    }
    w.screen.destroy();

    expect(eventsAt, "the AI never took its turn").toBeGreaterThanOrEqual(0);
    expect(boardMovedAt, "the board moved before anything was animated").toBe(eventsAt);
  });

  it("still plays the turn", async () => {
    vi.useFakeTimers();
    const w = watch();
    const before = sig(w.state);
    w.screen.start();
    await vi.advanceTimersByTimeAsync(1000);
    w.screen.destroy();
    expect(sig(w.state), "the AI stood still").not.toBe(before);
  });
});
