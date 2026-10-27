/**
 * WHERE A SCREEN IS REACHED FROM.
 *
 * Two routes swapped places, asked for directly: HOW TO PLAY moved off home's artwork
 * into the drawer, and the LUCKY HATCH came out of the drawer onto a button under the
 * Daily one. Neither screen changed at all — only the way in — and that is exactly the
 * kind of change nothing else in the suite would notice, because every other test opens
 * these screens through the router rather than through the app.
 *
 * What is held here is that each has EXACTLY ONE way in and it is the one intended: a
 * screen reachable from both is two places to keep in step, and one reachable from
 * neither is a screen nobody can get to with every unit test still green.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION } from "../../platform";
import { App } from "../app";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

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

/** The page over the deck, by id — jsdom has no layout, so it is read off `hidden`. */
const showing = (host: HTMLElement): string[] =>
  Array.from(host.querySelectorAll<HTMLElement>(".screen"))
    .filter((el) => !el.classList.contains("hidden") && !el.closest(".deck"))
    .map((el) => el.id);

const drawer = (host: HTMLElement): void => {
  host.querySelector<HTMLButtonElement>(".settingsfab")?.click();
};

describe("how to play", () => {
  it("is in the drawer", () => {
    const { host, app } = open();
    drawer(host);
    const row = host.querySelector<HTMLButtonElement>(".menuitem[data-go='rules']");
    expect(row, "the manual has no way in at all").toBeTruthy();
    row?.click();
    expect(showing(host)).toContain("rules");
    app.destroy();
  });

  /**
   * And NOT on home. It was the one control in this app written straight onto a picture,
   * which is why it needed dark ink and a halo to be legible at all (§ CONTRAST).
   */
  it("is no longer written on the artwork", () => {
    const { host, app } = open();
    expect(host.querySelector(".howtolink"), "home still writes it on the picture")
      .toBeNull();
    app.destroy();
  });
});

describe("the lucky hatch", () => {
  it("is a button on home, under the daily one", () => {
    const { host, app } = open();
    const fabs = Array.from(host.querySelectorAll<HTMLElement>(".settingsfab, .dailyfab"));
    const hatch = host.querySelector<HTMLButtonElement>(".hatchfab");
    expect(hatch, "the hatch has no button on home").toBeTruthy();
    // UNDER the daily, which on a stack laid out in DOM order is after it.
    expect(fabs.indexOf(hatch as HTMLElement), "the hatch is not under the daily")
      .toBe(fabs.length - 1);
    hatch?.click();
    expect(showing(host)).toContain("luckyhatch");
    app.destroy();
  });

  it("is off the drawer", () => {
    const { host, app } = open();
    drawer(host);
    expect(host.querySelector(".menuitem[data-go='luckyhatch']"),
      "the drawer still carries it as well").toBeNull();
    app.destroy();
  });

  /**
   * It is shown BEFORE chapter 10, when the screen behind it is still shut — that screen
   * names the chapter rather than drawing a padlock, and a button that only appears once
   * a feature is open is one nobody knows is coming.
   */
  it("is offered to a colony that cannot use it yet", () => {
    const { host, app } = open();
    expect(host.querySelector(".hatchfab"), "a new colony is not told the hatch exists")
      .toBeTruthy();
    app.destroy();
  });
});
