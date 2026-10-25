/**
 * A MATCH, REMEMBERED AND WATCHED BACK.
 *
 * The test that matters here is the round trip: a match played through the REAL screen,
 * recorded as it went, and then replayed from those moves alone onto the same board. If
 * that ever stops working every replay is a lie about a match somebody played, and it
 * would break silently — the list would still show the row, and opening it would show a
 * different game.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  MemoryStore, ProfileStore, TOUR_VERSION, canReplay,
} from "../../platform";
import type { MatchLog } from "../../platform";
import type { MatchSetup, Move } from "../../engine";
import { buildHistory, ReplayScreen } from "../history";
import { groundFor } from "../regions";

/**
 * The real renderer, with every set of options it is built with kept.
 *
 * A replay has to be dressed in the ground the match was played on, and the only place
 * that is observable is the argument it is handed — so this wraps the class rather than
 * replacing it, and every other test in the file still drives the real thing.
 */
const spy = vi.hoisted(() => ({ built: [] as Array<{ ground?: string | null }> }));
vi.mock("../../render", async (orig) => {
  const real = await orig<typeof import("../../render")>();
  class Watched extends real.BoardRenderer {
    constructor(...args: ConstructorParameters<typeof real.BoardRenderer>) {
      super(...args);
      spy.built.push(args[2] ?? {});
    }
  }
  return { ...real, BoardRenderer: Watched };
});

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); spy.built.length = 0; });

const setup: MatchSetup = { map: "small", species: { you: "fire", ai: "ghost" }, seed: 31 };

function store(logs: MatchLog[] = []): ProfileStore {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.tourSeen = TOUR_VERSION; p.history = logs; });
  return s;
}

const log = (over: Partial<MatchLog> = {}): MatchLog => ({
  id: "m:1", at: 1_000, map: "small", you: "fire", foe: "ghost", foeName: "Vela",
  human: true, winner: "you", reason: "nest", turns: 12, playedMs: 90_000,
  colonyBefore: 100, colonyAfter: 140, ...over,
});

describe("the list", () => {
  it("says what happened, and what it paid", () => {
    const root = buildHistory(store([log()]), () => {}, () => {});
    const row = root.querySelector(".histrow");
    expect(row?.textContent).toContain("Vela");
    expect(row?.textContent, "the row does not say what the match paid").toContain("+40");
    expect(row?.textContent).toContain("Corridor");
  });

  it("has something to say when there is nothing yet", () => {
    const root = buildHistory(store(), () => {}, () => {});
    expect(root.querySelector(".histrow")).toBeNull();
    expect(root.querySelector(".histempty")).toBeTruthy();
  });

  /**
   * A ROW WITH NO MOVES IS NOT A DOOR. The facts are the point of the list, so a match too
   * long to keep the moves for is still listed — it just does not offer a replay it cannot
   * give, which is the difference between a quiet row and a dead button.
   */
  it("only opens the matches it can actually replay", () => {
    let opened = 0;
    const rows = [log({ id: "m:a" }), log({ id: "m:b", record: { setup, moves: [{ do: "end" }] } })];
    const root = buildHistory(store(rows), () => {}, () => { opened++; });
    const [noReplay, withReplay] = Array.from(root.querySelectorAll<HTMLButtonElement>(".histrow"));

    expect(noReplay?.classList.contains("noreplay")).toBe(true);
    noReplay?.click();
    expect(opened, "a match with no moves offered a replay").toBe(0);
    withReplay?.click();
    expect(opened).toBe(1);
  });
});

describe("watching one back", () => {
  /** Every move applied lands on the board, in order, exactly as it did the first time. */
  it("replays the moves onto the board", () => {
    const moves: Move[] = [{ do: "end" }, { do: "end" }, { do: "end" }];
    const screen = new ReplayScreen(document.body, {
      log: log({ record: { setup, moves } }),
      onBack: () => {},
    });
    const step = document.querySelector<HTMLButtonElement>(".replaybtn.ghost");
    expect(document.querySelector(".replayturn")?.textContent).toContain("3 to go");
    step?.click();
    step?.click();
    expect(document.querySelector(".replayturn")?.textContent).toContain("1 to go");
    screen.destroy();
  });

  it("stops at the end rather than running off it", () => {
    const screen = new ReplayScreen(document.body, {
      log: log({ record: { setup, moves: [{ do: "end" }] } }),
      onBack: () => {},
    });
    const step = document.querySelector<HTMLButtonElement>(".replaybtn.ghost");
    for (let i = 0; i < 8; i++) step?.click();
    expect(screen.done).toBe(true);
    screen.destroy();
  });

  /**
   * "Again" has to go back to the OPENING, and the engine has no undo — the board is
   * rebuilt from the setup and folded onto the one the renderer is holding. Without that
   * fold, pressing Again on a finished replay runs the moves onto a board that is already
   * at the end of them: every one is refused and the player watches a still picture.
   */
  it("plays a finished replay again from the first turn", () => {
    const moves: Move[] = [{ do: "end" }, { do: "end" }, { do: "end" }];
    const screen = new ReplayScreen(document.body, {
      log: log({ record: { setup, moves } }),
      onBack: () => {},
    });
    const step = document.querySelector<HTMLButtonElement>(".replaybtn.ghost");
    for (let i = 0; i < moves.length; i++) step?.click();
    expect(screen.done).toBe(true);
    const ended = document.querySelector(".replayturn")?.textContent;

    // Play, on a finished replay, is Again.
    const play = document.querySelector<HTMLButtonElement>(".replaybtn:not(.ghost)");
    play?.click();
    play?.click();  // ...and paused again, so the interval cannot move it under the test.
    expect(screen.done, "did not go back to the start").toBe(false);
    expect(document.querySelector(".replayturn")?.textContent).toContain("3 to go");
    // The TURN is what says the board went back too, not only the counter: without the
    // fold the moves would be replayed onto the position they already reached.
    expect(document.querySelector(".replayturn")?.textContent).toContain("Turn 1");
    expect(document.querySelector(".replayturn")?.textContent).not.toBe(ended);
    screen.destroy();
  });

  /**
   * A record that will not replay is a bug in the RECORDING, not in the watching — so it
   * stops where it stopped rather than carrying on onto a board that has diverged, which
   * would show a game nobody played and call it a replay.
   */
  it("stops on a move the board refuses", () => {
    const moves: Move[] = [
      { do: "end" },
      { do: "move", from: { c: 99, r: 99 }, to: { c: 0, r: 0 } },
      { do: "end" },
    ];
    const screen = new ReplayScreen(document.body, {
      log: log({ record: { setup, moves } }),
      onBack: () => {},
    });
    const step = document.querySelector<HTMLButtonElement>(".replaybtn.ghost");
    const turn = (): string => document.querySelector(".replayturn")?.textContent ?? "";
    step?.click();
    const afterFirst = turn();
    step?.click();
    step?.click();
    expect(turn(), "carried on past a move the engine refused").toBe(afterFirst);
    // And it STAYS stopped rather than sitting there re-trying the same move: the replay
    // is over, so the control says Again rather than Play.
    expect(screen.done, "a refusal that another tap walks straight past").toBe(true);

    // Again still works — a broken record is not a broken screen.
    document.querySelector<HTMLButtonElement>(".replaybtn:not(.ghost)")?.click();
    document.querySelector<HTMLButtonElement>(".replaybtn:not(.ghost)")?.click();
    expect(screen.done, "would not play again after a refusal").toBe(false);
    step?.click();
    expect(turn()).toBe(afterFirst);
    screen.destroy();
  });

  it("takes itself off the page when it is closed", () => {
    const screen = new ReplayScreen(document.body, {
      log: log({ record: { setup, moves: [{ do: "end" }] } }),
      onBack: () => {},
    });
    expect(document.querySelector("#replay")).toBeTruthy();
    screen.destroy();
    expect(document.querySelector("#replay"), "a closed replay stayed on the page").toBeNull();
  });
});

describe("what a replay rests on", () => {
  /**
   * The round trip itself — that a recorded match rebuilds the board it was played on —
   * is proved in `engine/__tests__/protocol.test.ts`, on a real match played to a finish.
   * It is not repeated here: a second, weaker copy of a test is a second thing to keep in
   * step, and this screen's job is showing a replay rather than proving one.
   *
   * What belongs here is the gate: whether an entry can be watched back at all.
   */
  it("knows which entries carry a record at all", () => {
    expect(canReplay(log())).toBe(false);
    expect(canReplay(log({ record: { setup, moves: [{ do: "end" }] } }))).toBe(true);
  });
});

/**
 * THE GROUND IT WAS PLAYED ON.
 *
 * The replay was given no picture at all, so every match in the list was watched back on
 * the game's own DRAWN forest floor however far down the road it had actually been
 * fought — reported as "playback shows old map". The chapter comes off the colony the
 * match OPENED with, which is what the road said at the time.
 */
describe("the ground a replay is watched on", () => {
  const groundOf = (colonyBefore: number): string | null | undefined => {
    const screen = new ReplayScreen(document.body, {
      log: log({ colonyBefore, record: { setup, moves: [{ do: "end" }] } }),
      onBack: () => {},
    });
    const opts = spy.built.at(-1);
    screen.destroy();
    return opts?.ground;
  };

  it("is the region the match was played in, not the drawn floor", () => {
    expect(groundOf(100), "the replay was handed no picture").toBeTruthy();
  });

  /**
   * Two matches a road apart must not be watched on one ground. This is what fails if the
   * chapter is read off anything constant — today's colony, or the first rung.
   */
  it("is a different picture for a match played a road apart", () => {
    expect(groundOf(4_000_000)).not.toBe(groundOf(100));
  });

  /** And it is the SAME picture the rest of the app would serve that chapter. */
  it("agrees with the region lookup every other screen uses", () => {
    expect(groundOf(4_000_000)).toBe(groundFor(50));
  });
});
