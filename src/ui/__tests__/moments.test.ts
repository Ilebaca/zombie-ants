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

/** A device that only remembers what it was asked to play. */
function listener(): { cues: Cue[]; feedback: Feedback } {
  const cues: Cue[] = [];
  const feedback: Feedback = {
    play: (cue: Cue) => { cues.push(cue); },
    setMusic: (_t: Track | null) => {},
    unlock: () => {}, setSound: () => {}, setMusicEnabled: () => {},
    setHaptics: () => {}, close: () => {},
  };
  return { cues, feedback };
}

/** Play a challenge and surrender it, which is the shortest real route to a result card. */
function playAndSurrender(): { cues: Cue[]; host: HTMLElement } {
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
  // Tap through the opening descent: the action bar is inert while the camera comes down.
  host.querySelector("#cv")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  // Surrender asks twice on the same button, the way the reset row does.
  host.querySelector<HTMLButtonElement>("#bSurr")?.click();
  host.querySelector<HTMLButtonElement>("#bSurr")?.click();
  // The winner's colour washes the board before the card comes up (render/flood.ts).
  vi.advanceTimersByTime(8000);
  return { cues, host };
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
