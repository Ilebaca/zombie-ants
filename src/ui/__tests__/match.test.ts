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

interface Watch {
  host: HTMLElement; screen: MatchScreen; state: GameState; log: string[]; exits: number;
}

/** A match sitting on the AI's turn, with the board sampled on every observation. */
function watch(): Watch {
  const state = createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 11 });
  state.current = "ai";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const log: string[] = [];
  // `screen` is filled in the moment the constructor returns; onExit cannot fire before.
  const w: Partial<Watch> & Omit<Watch, "screen"> = { host, state, log, exits: 0 };
  const screen = new MatchScreen(host, {
    state,
    mods: { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } },
    ctx: defaultContext(),
    difficulty: "normal",
    map: "small",
    onEvents: (events: readonly EngineEvent[]) => {
      if (events.length) log.push("events");
    },
    onExit: () => { w.exits++; },
  });
  w.screen = screen;
  return w as Watch;
}

describe("the AI's turn", () => {
  it("does not touch the board until its move is animated", async () => {
    vi.useFakeTimers();
    const w = watch();
    const before = sig(w.state);
    w.screen.start();

    // Step forward in small slices, noting when the board first moves and when the events
    // are handed over. They have to be the same slice.
    // The AI sits on its move for a second to four before playing, so the sampling has to
    // run past the longest of those.
    let boardMovedAt = -1, eventsAt = -1;
    for (let t = 0; t < 240; t++) {
      await vi.advanceTimersByTimeAsync(25);
      if (boardMovedAt < 0 && sig(w.state) !== before) boardMovedAt = t;
      if (eventsAt < 0 && w.log.length) eventsAt = t;
      if (boardMovedAt >= 0 && eventsAt >= 0) break;
    }
    w.screen.destroy();

    expect(eventsAt, "the AI never took its turn").toBeGreaterThanOrEqual(0);
    expect(boardMovedAt, "the board moved before anything was animated").toBe(eventsAt);
  });

  /**
   * An answer that lands the instant the turn flips reads as a machine, not an opponent.
   * The search finishes in a few milliseconds on this board, so without the pause the move
   * would already be on the board here.
   */
  it("sits on its move rather than answering instantly", async () => {
    vi.useFakeTimers();
    const w = watch();
    const before = sig(w.state);
    w.screen.start();
    await vi.advanceTimersByTimeAsync(900);
    const still = sig(w.state);
    w.screen.destroy();
    expect(still, "the AI answered before it had thought").toBe(before);
  });

  it("still plays the turn", async () => {
    vi.useFakeTimers();
    const w = watch();
    const before = sig(w.state);
    w.screen.start();
    await vi.advanceTimersByTimeAsync(6000);
    w.screen.destroy();
    expect(sig(w.state), "the AI stood still").not.toBe(before);
  });
});

/** Ends the match the way the player does: surrender takes two taps. */
const quit = (w: Watch): void => {
  const button = w.host.querySelector<HTMLButtonElement>("#bSurr");
  button?.click();
  button?.click();
};

/**
 * THE FINALE HOLDS THE CARD BACK.
 *
 * A popup over a board frozen mid-fight told the player it was over without ever showing
 * it. The winner takes the whole board first (render/flood.ts), and the result card waits
 * for that — so `onExit` must not fire in the same tick the match ends.
 */
describe("the end of a match", () => {
  it("plays the winner's wash before the result card", async () => {
    vi.useFakeTimers();
    const w = watch();
    w.state.current = "you";
    w.screen.start();

    quit(w);
    expect(w.state.over, "the surrender did not take").toBe(true);
    expect(w.exits, "the card came up over a board still mid-fight").toBe(0);

    await vi.advanceTimersByTimeAsync(400);
    expect(w.exits, "the wash was not given time to play").toBe(0);

    await vi.advanceTimersByTimeAsync(4000);
    expect(w.exits, "the card never came up").toBe(1);
    w.screen.destroy();
  });

  /** The screen going away mid-wash must not hand a card to a match nobody is watching. */
  it("drops the card if the screen is torn down mid-wash", async () => {
    vi.useFakeTimers();
    const w = watch();
    w.state.current = "you";
    w.screen.start();
    quit(w);
    w.screen.destroy();
    await vi.advanceTimersByTimeAsync(4000);
    expect(w.exits).toBe(0);
  });
});
