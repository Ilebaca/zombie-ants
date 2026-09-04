/**
 * THE HARDWARE BACK BUTTON (platform/back.ts, App.goBack).
 *
 * In an Android WebView there is no history to go back through, so the shell's own answer
 * to a press is to CLOSE THE APP — anywhere, including mid-match. What is asserted here is
 * the two halves of the rule that replaces it: every screen with something above it goes
 * up one, and the home screen with nothing over it still LEAVES. An app that swallows
 * every press is the more annoying of the two failures.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION } from "../../platform";
import { App } from "../app";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });
afterEach(() => { vi.useRealTimers(); });

function open(): { host: HTMLElement; app: App } {
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  const profile = new ProfileStore(new MemoryStore());
  profile.update((p) => { p.tourSeen = TOUR_VERSION; });
  const app = new App(host, profile);
  app.start();
  return { host, app };
}

/**
 * Whichever page is over the deck, by its id.
 *
 * By the `hidden` class rather than by anything measured: jsdom has no layout, so every
 * element on the page reports the same zero box and `offsetParent` is always null.
 */
const showing = (host: HTMLElement): string[] =>
  Array.from(host.querySelectorAll<HTMLElement>(".screen"))
    .filter((el) => !el.classList.contains("hidden") && !el.closest(".deck"))
    .map((el) => el.id);

describe("going up one", () => {
  /** The only press that closes the app, and it has to stay that way. */
  it("says no on the home screen with nothing over it", () => {
    const { app } = open();
    expect(app.goBack()).toBe(false);
    app.destroy();
  });

  it("comes back to home from another deck screen", () => {
    const { host, app } = open();
    host.querySelector<HTMLButtonElement>("[data-nav='shop']")?.click();
    expect(app.goBack()).toBe(true);
    expect(app.goBack(), "it did not actually land on home").toBe(false);
    app.destroy();
  });

  /**
   * A PAGE GOES WHERE ITS OWN BACK BUTTON GOES. Pressing the one the player can see is
   * the whole rule — a second table of which screen sits above which would be a second
   * answer to a question the screens already answer, and the one that goes stale.
   */
  it("presses the screen's own back button on a page over the deck", () => {
    const { host, app } = open();
    host.querySelector<HTMLButtonElement>("#howToBtn")?.click();
    expect(showing(host)).toContain("rules");
    expect(app.goBack()).toBe(true);
    expect(showing(host)).not.toContain("rules");
    app.destroy();
  });

  it("closes the drawer rather than the app", () => {
    const { host, app } = open();
    host.querySelector<HTMLButtonElement>(".settingsfab")?.click();
    expect(app.goBack()).toBe(true);
    // And now it is back to being the home screen with nothing over it.
    expect(app.goBack()).toBe(false);
    app.destroy();
  });

  /**
   * A MATCH GOES HOME RATHER THAN NOWHERE, and it only can because a match survives being
   * left now: it is written down after every move and waiting on home (§suspend).
   */
  it("leaves a match without closing the app, and without ending it", () => {
    vi.useFakeTimers();
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tourSeen = TOUR_VERSION; });
    const app = new App(host, profile);
    app.start();
    const colony = profile.get().colony;

    host.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
    host.querySelector<HTMLButtonElement>(".challplay")?.click();
    expect(host.querySelector("#cv"), "no match opened").not.toBeNull();

    expect(app.goBack()).toBe(true);
    expect(host.querySelector("#cv"), "the match was still on screen").toBeNull();
    // WALKING AWAY IS NOT A DEFEAT. No result card, and nothing paid or taken — the match
    // is waiting on home instead (§suspend).
    expect(host.querySelector(".resultcard"), "it was settled as a loss").toBeNull();
    expect(profile.get().colony, "the colony moved for a match nobody finished").toBe(colony);
    app.destroy();
  });

  /**
   * NOT A BACK-BUTTON RULE, but found by pressing one: a CHALLENGE goes straight to
   * `startMatch` from the Challenges tab rather than through the setup flow, so the deck
   * was left on screen UNDER the board — and `.challist` sat on top of the action bar,
   * which made End turn, the ability and Surrender unpressable. Measured in a browser
   * (`elementFromPoint` at the centre of End turn returned the challenge list); jsdom has
   * no layout, so what is asserted here is the cause rather than the hit test.
   */
  it("hides the deck under a match started from a deck screen", () => {
    vi.useFakeTimers();
    const { host } = open();
    host.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
    host.querySelector<HTMLButtonElement>(".challplay")?.click();

    // The deck hides with the app's own `hidden` class, not the DOM attribute.
    const deck = host.querySelector<HTMLElement>(".deck");
    expect(host.querySelector("#cv"), "no match opened").not.toBeNull();
    expect(deck?.classList.contains("hidden"),
      "the deck was left on screen under the board").toBe(true);
  });

  /**
   * THE TOUR IS A GATE OVER EVERYTHING. Closing the app is not the answer to a step
   * somebody is halfway through reading.
   */
  it("is swallowed while the tutorial is up", () => {
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    const app = new App(host, new ProfileStore(new MemoryStore()));
    app.start();
    expect(host.querySelector(".tourbubble"), "the tour never opened").not.toBeNull();
    expect(app.goBack()).toBe(true);
    expect(host.querySelector(".tourbubble"), "the tour was closed by it").not.toBeNull();
    app.destroy();
  });
});
