/**
 * THE END OF A MATCH, HEARD FROM OUTSIDE.
 *
 * `MatchScreen.finish()` plays `win` or `lose` as the winner's colour starts across the
 * board, and every test of that lives inside the match screen. What is held here is the
 * whole path a player actually takes — open a challenge, surrender, get a card — because
 * the cue is one line inside a method reachable from three places, and the way it breaks
 * is not that it stops working but that the app stops reaching it.
 *
 * And that it is played on the RIGHT SIDE. A fanfare after a defeat is worse than silence.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION } from "../../platform";
import type { Cue, Feedback, Track } from "../../platform";
import { App } from "../app";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });
afterEach(() => { vi.useRealTimers(); });

/** A device that only remembers what it was asked to play, and what bed it was asked for. */
function listener(): { cues: Cue[]; music: (Track | null)[]; feedback: Feedback } {
  const cues: Cue[] = [];
  const music: (Track | null)[] = [];
  const feedback: Feedback = {
    play: (cue: Cue) => { cues.push(cue); },
    setMusic: (t: Track | null) => { music.push(t); },
    unlock: () => {}, setSound: () => {}, setMusicEnabled: () => {},
    setHaptics: () => {}, close: () => {},
  };
  return { cues, music, feedback };
}

/** Play a challenge and surrender it, which is the shortest real route to a result card. */
function playAndSurrender(): { cues: Cue[]; music: (Track | null)[]; host: HTMLElement } {
  vi.useFakeTimers();
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  const profile = new ProfileStore(new MemoryStore());
  profile.update((p) => { p.tourSeen = TOUR_VERSION; });
  const { cues, music, feedback } = listener();
  new App(host, profile, undefined, feedback).start();

  host.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
  host.querySelector<HTMLButtonElement>(".challplay")?.click();
  // Tap through the opening descent: the action bar is inert while the camera comes down.
  host.querySelector("#cv")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  // Surrender asks twice on the same button, the way the reset row does.
  host.querySelector<HTMLButtonElement>("#bSurr")?.click();
  host.querySelector<HTMLButtonElement>("#bSurr")?.click();
  // The winner's colour washes the board before the card comes up (render/flood.ts).
  vi.advanceTimersByTime(8000);
  return { cues, music, host };
}

describe("the end of a match", () => {
  it("sounds, and sounds like a defeat when it is one", () => {
    const { cues, host } = playAndSurrender();
    expect(host.querySelector("#over"), "no result card came up").not.toBeNull();
    expect(cues, "the card arrived in silence").toContain("lose");
    expect(cues, "a surrender played the victory cue").not.toContain("win");
  });

  /**
   * NOTHING SOUNDS WHILE THE MATCH IS STILL BEING PLAYED. The cue belongs to the moment it
   * is decided; a board that announced a result on the way to one would be lying.
   *
   * The wash the cue rides on has no length in jsdom — there is no canvas to draw it into
   * — so the card and the sound land in the same tick here. Their ORDER is the match
   * screen's business and is tested there; this only holds that neither happens early.
   */
  /**
   * THE WAR BED STOPS WHERE THE MATCH DOES. It used to play on under the result card, so
   * the fanfare landed on top of a drum kit — two pieces of music at once, on the one
   * moment the whole match was played for.
   */
  it("stops the match music when the match is decided", () => {
    const { music } = playAndSurrender();
    expect(music, "the board never got its own bed").toContain("match");
    expect(music[music.length - 1], "the war bed played on under the card").not.toBe("match");
    expect(music, "the bed was never stopped").toContain(null);
  });

  it("puts the menu bed back on the way home", () => {
    const { music, host } = playAndSurrender();
    host.querySelector<HTMLButtonElement>("#overHome")?.click();
    expect(music[music.length - 1]).toBe("menu");
  });

  /**
   * AND THE WAR BED COMES BACK FOR THE NEXT MATCH. Asking for it before the old match was
   * torn down was the bug: `clearMatch` puts the MENU bed back, so "Play again" ran a whole
   * match under menu music. Order, not idempotency.
   */
  it("plays the war bed again when the next match starts", async () => {
    const { music, host } = playAndSurrender();
    host.querySelector<HTMLButtonElement>("#again")?.click();
    // Play again goes through the opponent search, which really waits (platform/matchmaking).
    await vi.advanceTimersByTimeAsync(9000);
    expect(music[music.length - 1], "the rematch is playing menu music").toBe("match");
  });

  it("says nothing until the match is decided", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tourSeen = TOUR_VERSION; });
    const { cues, feedback } = listener();
    new App(host, profile, undefined, feedback).start();

    host.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
    host.querySelector<HTMLButtonElement>(".challplay")?.click();
    host.querySelector("#cv")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    // The board is up and nothing is decided: the match must not be announcing anything.
    expect(cues, "it sounded while the match was still being played").not.toContain("lose");
    expect(cues).not.toContain("win");

    host.querySelector<HTMLButtonElement>("#bSurr")?.click();
    host.querySelector<HTMLButtonElement>("#bSurr")?.click();
    vi.advanceTimersByTime(8000);
    expect(host.querySelector("#over")).not.toBeNull();
    expect(cues).toContain("lose");
  });
});
