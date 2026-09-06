/**
 * EVERY CONTROL HAS TO SAY WHAT IT IS.
 *
 * This app is drawn: the chrome is a family of unlabelled SVG marks and half the pictures
 * in it are canvases, which carry no text at all. So the ordinary failure here is not a
 * missing feature — it is a button that reads out as "button" and a picture that reads out
 * as "graphic", and neither shows up in any other test or on any screen.
 *
 * Two rules, and the second is the one that gets argued about:
 *
 *  - a BUTTON must have a name: its own text, or `aria-label`, or `title`.
 *  - a CANVAS must either carry a name or be explicitly `aria-hidden`. Silence is the right
 *    answer for most of them — a colony's portrait sits inside a row that is already named,
 *    and the manual's figures illustrate a numbered rule written out in words beside them.
 *    An unlabelled graphic announced as "graphic" is worse than one that says nothing, and
 *    a made-up label is worse than both.
 *
 * It walks the real app the way a player does, because a screen built directly is a screen
 * whose chrome never ran.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION } from "../../platform";
import { App } from "../app";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

const hasName = (el: Element): boolean =>
  !!(el.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("title")
     || el.getAttribute("aria-labelledby"));

/** A colony far enough along that every screen has something on it. */
function open(): { host: HTMLElement; app: App } {
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  const profile = new ProfileStore(new MemoryStore());
  profile.update((p) => {
    p.tourSeen = TOUR_VERSION;
    p.colony = 2_000_000;
    p.mycel = 9999;
    p.pheromone = 9999;
    p.larva = 9;
  });
  const app = new App(host, profile);
  app.start();
  return { host, app };
}

/** Everything on screen that a screen reader would meet, and whether it says anything. */
function unnamed(host: HTMLElement): string[] {
  const bad: string[] = [];
  for (const b of Array.from(host.querySelectorAll("button"))) {
    if (!hasName(b)) bad.push(`button .${b.className}#${b.id}`);
  }
  for (const c of Array.from(host.querySelectorAll("canvas"))) {
    if (c.getAttribute("aria-hidden") !== "true" && !hasName(c)) {
      bad.push(`canvas .${c.className}#${c.id}`);
    }
  }
  return [...new Set(bad)];
}

describe("everything on screen says what it is", () => {
  it("names every control on the five deck screens", () => {
    const { host, app } = open();
    expect(unnamed(host), "home").toEqual([]);
    for (const tab of ["shop", "anthill", "antarium", "challenges"]) {
      host.querySelector<HTMLButtonElement>(`[data-nav='${tab}']`)?.click();
      expect(unnamed(host), tab).toEqual([]);
    }
    app.destroy();
  });

  it("names every control behind the drawer", () => {
    const { host, app } = open();
    host.querySelector<HTMLButtonElement>(".settingsfab")?.click();
    expect(unnamed(host), "the drawer itself").toEqual([]);

    // Whatever the drawer offers, opened in turn — by walking its own rows rather than a
    // list of ids here, which would go stale the first time an entry was added.
    const rows = Array.from(host.querySelectorAll<HTMLButtonElement>(".menu button"));
    for (let i = 0; i < rows.length; i++) {
      host.querySelector<HTMLButtonElement>(".settingsfab")?.click();
      const again = Array.from(host.querySelectorAll<HTMLButtonElement>(".menu button"));
      const row = again[i];
      if (!row) continue;
      const label = row.textContent?.trim() ?? String(i);
      row.click();
      expect(unnamed(host), label).toEqual([]);
    }
    app.destroy();
  });

  it("names the manual and the board", () => {
    vi.useFakeTimers();
    const { host, app } = open();
    host.querySelector<HTMLButtonElement>("#howToBtn")?.click();
    expect(unnamed(host), "how to play").toEqual([]);

    host.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
    host.querySelector<HTMLButtonElement>(".challplay")?.click();
    expect(host.querySelector("#cv"), "no board opened").not.toBeNull();
    expect(unnamed(host), "the match").toEqual([]);
    app.destroy();
    vi.useRealTimers();
  });

  /**
   * THE BOARD IS NOT DECORATION. Everything else drawn in this app illustrates words that
   * are already on the screen; the board IS the screen, so it is the one canvas that has to
   * carry a name rather than be hidden.
   */
  it("gives the board itself a name rather than hiding it", () => {
    vi.useFakeTimers();
    const { host, app } = open();
    host.querySelector<HTMLButtonElement>("[data-nav='challenges']")?.click();
    host.querySelector<HTMLButtonElement>(".challplay")?.click();
    const board = host.querySelector("#cv");
    expect(board?.getAttribute("aria-hidden")).not.toBe("true");
    expect(board?.getAttribute("aria-label")).toMatch(/board/i);
    app.destroy();
    vi.useRealTimers();
  });
});
