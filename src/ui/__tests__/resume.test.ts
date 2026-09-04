/**
 * A MATCH SURVIVES THE APP BEING CLOSED (platform/suspend.ts, the band on home).
 *
 * The failure this exists for is the whole point of it and it is silent: a phone call, a
 * low battery, a swipe away — and twenty minutes of play was gone, with the colony unpaid.
 * So the assertions here are end-to-end on purpose. A real App plays some of a match, is
 * thrown away the way a killed process throws one away, and a second App built on the SAME
 * SAVE has to offer it and land back on the same board.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { MemoryStore, ProfileStore, SuspendStore, TOUR_VERSION, suspendKey, PROFILE_KEY } from "../../platform";
import { App } from "../app";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });
afterEach(() => { vi.useRealTimers(); });

const mount = (): HTMLElement => {
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  return host;
};

/** A save that has seen the tour, so the app opens on home rather than on the walkthrough. */
function played(store: MemoryStore): ProfileStore {
  const profile = new ProfileStore(store);
  profile.update((p) => { p.tourSeen = TOUR_VERSION; });
  return profile;
}

/**
 * Play a couple of turns of a real match.
 *
 * Through a CHALLENGE rather than the ordinary flow, and that is a shortcut worth naming:
 * an ordinary match goes through the opponent search, which is a deliberate five-second
 * wait with a reel spinning on a timer (ui/matchmaking.ts). Driving that on a fake clock
 * is five thousand timer steps for a screen this file is not about. A challenge opens the
 * same board through the same `startMatch`, and it also proves the challenge latch
 * survives a suspension.
 */
function playSome(host: HTMLElement): void {
  host.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
  host.querySelector<HTMLButtonElement>(".challplay")?.click();
  // Tap through the opening descent, then hand the turn over twice.
  host.querySelector("#cv")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  for (let i = 0; i < 2; i++) {
    host.querySelector<HTMLButtonElement>("#bEnd")?.click();
    vi.advanceTimersByTime(6000);
  }
}

describe("closing the app mid-match", () => {
  it("writes the match down and offers it back on home", () => {
    vi.useFakeTimers();
    const store = new MemoryStore();
    const host = mount();
    new App(host, played(store)).start();
    playSome(host);

    // The process dies here. Nothing tidies up; the save is all that survives.
    const saved = new SuspendStore(store, PROFILE_KEY).peek();
    expect(saved, "nothing was written down").not.toBeNull();
    expect(saved?.moves.length, "no moves were kept").toBeGreaterThan(0);

    document.body.replaceChildren();
    const again = mount();
    new App(again, played(store)).start();
    const band = again.querySelector("#resumeBand");
    expect(band, "the waiting match was not offered").not.toBeNull();
    // It says WHERE it was left: a button that only says "resume" is one a player presses
    // to find out what it is.
    expect(band?.textContent).toMatch(/turn \d/);
  });

  it("lands back on the board it was left on", () => {
    vi.useFakeTimers();
    const store = new MemoryStore();
    const host = mount();
    new App(host, played(store)).start();
    playSome(host);
    const left = new SuspendStore(store, PROFILE_KEY).peek();

    document.body.replaceChildren();
    const again = mount();
    new App(again, played(store)).start();
    again.querySelector<HTMLButtonElement>("#resumeGo")?.click();

    expect(again.querySelector("#cv"), "the match did not open").not.toBeNull();
    // The record carries on from the moves that got the board here rather than restarting.
    const now = new SuspendStore(store, PROFILE_KEY).peek();
    expect(now?.moves.length).toBeGreaterThanOrEqual(left?.moves.length ?? 0);
    expect(now?.setup.seed, "a different board was opened").toBe(left?.setup.seed);
  });

  /**
   * ABANDONING ASKS TWICE, ON THE SAME BUTTON — the pattern the reset row and removing a
   * friend already use. Throwing a match away costs everything it would have paid.
   */
  it("does not abandon the match on one tap", () => {
    vi.useFakeTimers();
    const store = new MemoryStore();
    const host = mount();
    new App(host, played(store)).start();
    playSome(host);

    document.body.replaceChildren();
    const again = mount();
    new App(again, played(store)).start();
    const drop = again.querySelector<HTMLButtonElement>("#resumeDrop");
    drop?.click();
    expect(new SuspendStore(store, PROFILE_KEY).peek(), "one tap threw the match away")
      .not.toBeNull();
    drop?.click();
    expect(new SuspendStore(store, PROFILE_KEY).peek()).toBeNull();
    expect(again.querySelector("#resumeBand"), "the band stayed after abandoning").toBeNull();
  });

  /**
   * A NEW MATCH REPLACES THE WAITING ONE, and it does so the moment it opens rather than
   * on its first move — otherwise an app closed on turn one reopens offering the match
   * before this one, on a board the player has already walked away from.
   */
  it("drops the waiting match the moment a new one opens", () => {
    vi.useFakeTimers();
    const store = new MemoryStore();
    const host = mount();
    new App(host, played(store)).start();
    playSome(host);
    expect(new SuspendStore(store, PROFILE_KEY).peek()).not.toBeNull();

    // Another match, closed before a single move is played.
    document.body.replaceChildren();
    const again = mount();
    new App(again, played(store)).start();
    again.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
    again.querySelector<HTMLButtonElement>(".challplay")?.click();

    expect(new SuspendStore(store, PROFILE_KEY).peek(),
      "the match before this one was still on offer").toBeNull();
  });

  /** A save with no match waiting shows nothing: a band that is always there is noise. */
  it("shows nothing when no match is waiting", () => {
    const host = mount();
    new App(host, played(new MemoryStore())).start();
    expect(host.querySelector("#resumeBand")).toBeNull();
  });

  /**
   * THE TUTORIAL IS NEVER SUSPENDED. It is a walkthrough with an overlay counting through
   * it, and half of one is not something to hand back to anybody.
   */
  it("does not write down the first-run walkthrough", () => {
    vi.useFakeTimers();
    const store = new MemoryStore();
    const host = mount();
    // A fresh profile: the app opens straight into the tour and its arranged match.
    new App(host, new ProfileStore(store)).start();
    for (let i = 0; i < 30; i++) {
      const next = host.querySelector<HTMLButtonElement>("#tourNext");
      if (!next) break;
      next.click();
      vi.advanceTimersByTime(500);
    }
    expect(store.get(suspendKey(PROFILE_KEY)), "the tutorial was suspended").toBeNull();
  });
});
