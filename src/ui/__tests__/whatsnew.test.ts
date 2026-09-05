/**
 * WHAT CHANGED WHILE YOU WERE AWAY (ui/whatsnew.ts, App.showWhatsNew).
 *
 * A build goes out every few days and nothing told a returning player anything had moved.
 * Three rules carry the whole feature and every one of them is about NOT showing the card:
 * a new player never sees it, a caught-up player never sees it, and it never appears twice
 * for the same posts. A card that turns up every launch is a card people learn to dismiss
 * without reading, which costs the one build where it mattered.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  MemoryStore, NEWS, ProfileStore, TOUR_VERSION, majorSince, newsLatestAt,
} from "../../platform";
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

/** A save that has played before and has NOT seen the newest posts. */
function returning(): ProfileStore {
  const profile = new ProfileStore(new MemoryStore());
  profile.update((p) => { p.tourSeen = TOUR_VERSION; p.newsSeen = 0; });
  return profile;
}

const open = (profile: ProfileStore): HTMLElement => {
  const host = mount();
  new App(host, profile).start();
  return host;
};

describe("who sees it", () => {
  it("shows a returning player what changed", () => {
    const host = open(returning());
    const card = host.querySelector("#whatsnew");
    expect(card, "nothing was shown to a player who had been away").not.toBeNull();
    // The headline and the lead, never the body — a card that reproduces the article is
    // the feed with an extra tap in front of it.
    const shown = majorSince(0);
    expect(host.querySelectorAll(".wnrow")).toHaveLength(shown.length);
    expect(card?.textContent).toContain(shown[0]?.title ?? "");
    expect(card?.textContent).not.toContain(shown[0]?.body[0] ?? "never");
  });

  /**
   * A BRAND-NEW COLONY HAS MISSED NOTHING, and is in the middle of the tutorial besides.
   * Meeting a card about a build they have never seen is the worst possible first screen.
   */
  it("never shows it to a new colony", () => {
    const host = open(new ProfileStore(new MemoryStore()));
    expect(host.querySelector("#whatsnew"), "a new player was told what changed").toBeNull();
  });

  /**
   * A SAVE FROM BEFORE THE STAMP EXISTED can be both behind on the news AND unfinished on
   * the tutorial — its `newsSeen` is 0 because no build ever set it. The walkthrough wins:
   * a card over a tour step is a card over the one thing holding the interface.
   */
  it("waits for the tutorial rather than opening over it", () => {
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.newsSeen = 0; });     // tourSeen left at 0: never walked it
    const host = open(profile);
    expect(host.querySelector(".tourbubble"), "the tour never opened").not.toBeNull();
    expect(host.querySelector("#whatsnew"), "a card opened over the tutorial").toBeNull();
  });

  it("shows nothing to a player who is already caught up", () => {
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tourSeen = TOUR_VERSION; p.newsSeen = newsLatestAt(); });
    expect(open(profile).querySelector("#whatsnew")).toBeNull();
  });
});

describe("once, and only for what it showed", () => {
  it("does not come back on the next launch", () => {
    const profile = returning();
    const host = open(profile);
    host.querySelector<HTMLButtonElement>("#wnClose")?.click();
    expect(host.querySelector("#whatsnew"), "it stayed up after Got it").toBeNull();

    document.body.replaceChildren();
    expect(open(profile).querySelector("#whatsnew"), "it came back").toBeNull();
  });

  /** Reading the rest is being told too. A card that returns because somebody tapped the
   *  other half of it is a card that is now in the way. */
  it("does not come back after the player goes to read the rest", () => {
    const profile = returning();
    const host = open(profile);
    host.querySelector<HTMLButtonElement>("#wnAll")?.click();

    document.body.replaceChildren();
    expect(open(profile).querySelector("#whatsnew")).toBeNull();
  });

  /**
   * IT MARKS READ ONLY AS FAR AS THE NEWEST POST IT SHOWED. It carries the majors and
   * nothing else, so stamping the whole feed would clear the badge on posts it never
   * showed — the card claiming to have said something it did not.
   */
  it("leaves anything it did not show still unread", () => {
    // The table deliberately carries a NEWER post that is not major (a fixes note), which
    // is the only reason this can tell a partial mark from a full one.
    const majors = majorSince(0, 99);
    const newest = majors.reduce((n, p) => Math.max(n, p.at), 0);
    const behind = NEWS.filter((p) => p.at > newest).length;

    const profile = returning();
    const host = open(profile);
    host.querySelector<HTMLButtonElement>("#wnClose")?.click();
    expect(profile.unread(), "it marked posts read that it never showed").toBe(behind);
  });
});
