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
    opened(w);

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
    opened(w);
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
    opened(w);
    await vi.advanceTimersByTimeAsync(6000);
    w.screen.destroy();
    expect(sig(w.state), "the AI stood still").not.toBe(before);
  });
});

/**
 * The camera comes down through the canopy before the turn begins (render/intro.ts). A tap
 * cuts it short, which is what a player does — and it keeps these tests about the AI.
 */
const opened = (w: Watch): void => {
  w.host.querySelector("canvas")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
};

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
/**
 * THE MATCH CLOCK. It lives in the screen and not the engine, and it has to: the engine is
 * pure and seeded so the same moves replay identically, and a real clock is the one input
 * that never does. It is a fact ABOUT the match, reported when it is over.
 */
describe("how long the match took", () => {
  it("counts from the hand-over to the moment it is decided, and stops", async () => {
    vi.useFakeTimers();
    const now = vi.spyOn(performance, "now");
    const w = watch();
    w.state.current = "you";

    now.mockReturnValue(1000);
    w.screen.start();
    // The descent is not counted: it plays the same length every match and nothing can be
    // done during it, so charging the player for it puts the same seconds on every card.
    // Time has to have PASSED for that to mean anything, hence the second reading.
    now.mockReturnValue(4000);
    expect(w.screen.playedMs, "the clock ran before the turn did").toBe(0);

    await vi.advanceTimersByTimeAsync(3000);          // through the opening
    now.mockReturnValue(9000);
    expect(w.screen.playedMs, "the clock did not start").toBeGreaterThan(0);

    let reported = -1;
    (w.screen as unknown as { opts: { onExit: (a: unknown, b: unknown, c: number) => void } })
      .opts.onExit = (_a, _b, played) => { reported = played; };

    quit(w);
    now.mockReturnValue(60_000);                      // the card sits on screen a while
    await vi.advanceTimersByTimeAsync(6000);
    expect(reported, "the clock was still running with the match over").toBeLessThan(20_000);
    expect(reported, "nothing was reported at all").toBeGreaterThan(0);
    w.screen.destroy();
    now.mockRestore();
  });
});

describe("the end of a match", () => {
  it("plays the winner's wash before the result card", async () => {
    vi.useFakeTimers();
    const w = watch();
    w.state.current = "you";
    w.screen.start();
    opened(w);

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
    opened(w);
    quit(w);
    w.screen.destroy();
    await vi.advanceTimersByTimeAsync(4000);
    expect(w.exits).toBe(0);
  });
});

/**
 * THE OPENING HOLDS THE TURN.
 *
 * The camera comes down through the canopy and the colonies grow out of their nests before
 * anything can be played (render/intro.ts). The clock must not be running under it — and a
 * tap must cut it short, because sitting through the same descent every match is the
 * fastest way to make an animation hated.
 */
describe("the opening", () => {
  /**
   * The AI's own pause is one to four seconds, so a still board proves nothing inside the
   * opening. The turn CLOCK does: it only starts ticking at `beginTurn`, so the bar sits at
   * full width for the whole descent and can be at nothing else a few seconds later.
   *
   * Watched on the PLAYER's turn, deliberately. The bar snaps back to full at every
   * hand-over, so on the AI's turn a move landing inside the window resets it and the test
   * reads "never started" — flaky on the AI's own random pause, which is nothing to do with
   * what is being checked here.
   */
  const clock = (w: Watch): string =>
    (w.host.querySelector<HTMLElement>("#timeFill"))?.style.transform ?? "";

  it("holds the turn until the camera has landed", async () => {
    vi.useFakeTimers();
    const w = watch();
    w.state.current = "you";
    w.screen.start();
    expect(clock(w), "the clock was running before the descent was").toBe("scaleX(1)");

    await vi.advanceTimersByTimeAsync(1200);            // still coming down
    expect(clock(w), "the match began under the canopy").toBe("scaleX(1)");

    await vi.advanceTimersByTimeAsync(4000);
    expect(clock(w), "the match never began at all").not.toBe("scaleX(1)");
    w.screen.destroy();
  });

  /**
   * THE FOOTER HAS TO BE ITS FINAL SIZE BEFORE THE FIRST FRAME IS DRAWN. The ability
   * button's label is one line in the markup and two once it names the ability and its
   * cooldown — so filling it in at the first turn grew the footer, which shrank the canvas,
   * which fired the ResizeObserver, which re-measured the board and re-baked its scenery.
   * A blink at the exact moment the opening handed over, with different ground behind it.
   */
  it("dresses the controls before the camera comes down, not after", () => {
    vi.useFakeTimers();
    const w = watch();
    w.screen.start();
    // Two steps, not "#bAbility .lb": a scoped descendant query off an id is answered from
    // the DOCUMENT's id map, so a torn-down screen still sitting in the body can win it.
    const button = w.host.querySelector<HTMLElement>("#bAbility");
    const label = button?.querySelector(".lb")?.textContent ?? "";
    expect(label, "the ability button was still wearing its placeholder").not.toBe("Ability");
    expect(label.length, "the label grew after the opening had started").toBeGreaterThan(6);
    w.screen.destroy();
  });

  it("is cut short by a tap", async () => {
    vi.useFakeTimers();
    const w = watch();
    const before = sig(w.state);
    w.screen.start();
    opened(w);
    // The AI sits on its move for one to four seconds. Without the skip the opening would
    // put another two and a bit on top of that, and this would still be the board it was.
    await vi.advanceTimersByTimeAsync(5000);
    expect(sig(w.state), "the tap did not get the match going").not.toBe(before);
    w.screen.destroy();
  });
});
