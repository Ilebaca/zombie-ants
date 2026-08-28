/**
 * FIRST RUN.
 *
 * The tour is the one thing in the app that must appear by itself, exactly once, and hold
 * the match still while it is up. All three of those are asserted here: the app raises it
 * on a fresh profile and not on a used one, skipping settles it for good, and a match with
 * the tour running does not let the turn clock take the turn away from someone reading.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { arrangeTutorial, createGame, defaultContext, NEUTRAL_MODS } from "../../engine";
import { MemoryStore, ProfileStore, TOUR_VERSION } from "../../platform";
import { App } from "../app";
import { normalise } from "../../platform";
import { MatchScreen } from "../match";
import { Tour } from "../tour";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });
afterEach(() => { vi.useRealTimers(); });

const mount = (): HTMLElement => {
  const host = document.createElement("div");
  host.id = "app";
  document.body.appendChild(host);
  return host;
};

/** Walk the meta tour to the step with this id, pressing whatever each one offers. */
function walkTo(host: HTMLElement, id: string): string {
  for (let i = 0; i < 20; i++) {
    const count = host.querySelector(".tourcount")?.textContent ?? "";
    const text = host.querySelector(".tourbubble")?.textContent ?? "";
    if (text.includes(id)) return count;
    const next = host.querySelector<HTMLButtonElement>("#tourNext");
    if (!next) return count;
    next.click();
  }
  return "";
}

describe("counting the whole tutorial", () => {
  /**
   * ONE WALK, COUNTED THROUGH. The tutorial is two runs — the meta screens, then the first
   * turn — and each counting from one said they were two different tutorials, with the
   * first ending on "12 / 12" at the button that starts the second.
   */
  it("counts the match half in from the start", () => {
    const host = mount();
    new App(host, new ProfileStore(new MemoryStore())).start();
    const total = Number((host.querySelector(".tourcount")?.textContent ?? "").split("/")[1]);
    expect(host.querySelector(".tourcount")?.textContent?.trim()).toBe(`1 / ${total}`);
    expect(total, "the counter stopped at the meta walk")
      .toBeGreaterThan(MatchScreen.TOUR_STEPS + 1);
  });
});

describe("the button that starts the setup flow", () => {
  /**
   * A SIGNAL, NOT A TAP. Advancing on the tap itself marched the tour on to "pick a board"
   * whether or not the button had actually opened one — and when it had not, the tutorial
   * sat asking for a screen that was never coming, with nothing but Skip.
   */
  it("waits for the screen to open, not for the press", () => {
    const host = mount();
    new App(host, new ProfileStore(new MemoryStore())).start();
    const at = walkTo(host, "Into a match");
    expect(at, "never reached the PLAY step").not.toBe("");

    // A press the app did not act on: the tour must be exactly where it was.
    const play = host.querySelector<HTMLButtonElement>("#goPlay") as HTMLButtonElement;
    const real = play.onclick;
    play.onclick = null;
    play.click();
    expect(host.querySelector(".tourcount")?.textContent, "the tour walked off without the app")
      .toBe(at);

    // ...and the real press moves it on, because the setup screen actually opened.
    play.onclick = real;
    play.click();
    expect(host.querySelector(".tourcount")?.textContent, "the tour did not follow the app")
      .not.toBe(at);
    expect(host.querySelector("#mapsel"), "the setup flow never opened").not.toBeNull();
  });
});

describe("the first-run tour", () => {
  it("opens on a fresh profile", () => {
    const host = mount();
    new App(host, new ProfileStore(new MemoryStore())).start();
    const bubble = host.querySelector(".tourbubble");
    expect(bubble, "a new player got no tour").not.toBeNull();
    expect(bubble?.textContent).toContain("Welcome");
  });

  it("stays away once it has been seen", () => {
    const host = mount();
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tourSeen = TOUR_VERSION; });
    new App(host, profile).start();
    expect(host.querySelector(".tourwrap")).toBeNull();
  });

  /**
   * The build before this one wrote `tutorialDone: true` for three coaching toasts that no
   * longer exist. Honouring that flag hid the real walkthrough from everyone who had ever
   * started a match — which is exactly how it was found.
   */
  it("still runs for a save from before the tour existed", () => {
    const store = new MemoryStore();
    store.set("zombie-ants.profile", JSON.stringify({ mycel: 500, trophies: 90, tutorialDone: true }));
    expect(normalise(JSON.parse(store.get("zombie-ants.profile") as string)).tourSeen).toBe(0);

    const host = mount();
    new App(host, new ProfileStore(store)).start();
    expect(host.querySelector(".tourbubble"), "an existing player was skipped over").not.toBeNull();
  });

  it("does not come back after a skip", () => {
    const host = mount();
    const profile = new ProfileStore(new MemoryStore());
    new App(host, profile).start();
    host.querySelector<HTMLButtonElement>("#tourSkip")?.click();

    expect(host.querySelector(".tourwrap")).toBeNull();
    expect(profile.get().tourSeen, "a skip did not settle it").toBe(TOUR_VERSION);

    // A second launch on the same profile is a returning player.
    const again = mount();
    new App(again, profile).start();
    expect(again.querySelector(".tourwrap")).toBeNull();
  });

  it("can be replayed from settings", () => {
    const host = mount();
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tourSeen = TOUR_VERSION; });
    const app = new App(host, profile);
    app.start();

    host.querySelector<HTMLButtonElement>("#mainNav .navitem[data-nav='home']");
    // Walk to settings the way the player does: the menu, then Settings.
    host.querySelector<HTMLButtonElement>(".settingsfab")?.click();
    const settings = Array.from(host.querySelectorAll<HTMLElement>(".menuitem"))
      .find((b) => b.textContent?.includes("Settings"));
    settings?.click();
    host.querySelector<HTMLButtonElement>("#setTutorial")?.click();

    expect(host.querySelector(".tourbubble")?.textContent).toContain("Welcome");
  });
});

describe("a match with the tour up", () => {
  const running = (): { state: ReturnType<typeof createGame>; screen: MatchScreen; host: HTMLElement } => {
    const host = mount();
    const state = createGame({ map: "small", species: { you: "fire", ai: "fire" }, seed: 7 });
    arrangeTutorial(state);
    const screen = new MatchScreen(host, {
      state,
      mods: { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } },
      ctx: defaultContext(),
      difficulty: "easy",
      map: "small",
      tutorial: true,
      tour: new Tour(host),
    });
    return { state, screen, host };
  };

  /**
   * The camera comes down through the canopy before the turn begins (render/intro.ts), and
   * the tour waits for it. A tap cuts it short, which is what a player does — and doing it
   * that way keeps these tests about the tour rather than about the opening's length.
   */
  const opened = (host: HTMLElement): void => {
    host.querySelector("canvas")?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  };

  /**
   * `MatchScreen.TOUR_STEPS` is what the meta half puts on its counter before this screen
   * exists, so it has to match the list this screen actually builds — for every species,
   * since the ability step is a different step for a digging colony.
   */
  it("has as many steps as the meta walk was told to expect", () => {
    for (const you of ["fire", "carpenter"] as const) {
      const host = mount();
      const tour = new Tour(host);
      const state = createGame({ map: "small", species: { you, ai: "fire" }, seed: 7 });
      arrangeTutorial(state);
      const screen = new MatchScreen(host, {
        state,
        mods: { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } },
        ctx: defaultContext(),
        difficulty: "easy",
        map: "small",
        tutorial: true,
        tour,
        tourFrom: 12,
      });
      screen.start();
      opened(host);
      expect(tour.length, `the match walk is a different length on ${you}`)
        .toBe(MatchScreen.TOUR_STEPS);
      expect(host.querySelector(".tourcount")?.textContent?.trim(), `on ${you}`)
        .toBe(`13 / ${12 + MatchScreen.TOUR_STEPS}`);
      screen.destroy();
    }
  });

  it("holds the turn while a step is showing", async () => {
    vi.useFakeTimers();
    const { state, screen, host } = running();
    screen.start();
    opened(host);
    expect(host.querySelector(".tourbubble"), "the match tour never opened").not.toBeNull();

    // Well past the 15-second move clock: a player reading a step must not be timed out.
    // `current` is no use here — a turn that ran away and came back is "you" again. The
    // turn NUMBER is what says the match stood still.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.turn, "the clock took the turn during the tutorial").toBe(1);
    expect(state.current).toBe("you");
    screen.destroy();
  });

  /**
   * A step's `enter` picks a tile up for the player, and the step opens the moment the
   * previous deed resolves — which is in the MIDDLE of the handler that resolved it.
   * `onAbility` clears the selection after consuming its events and a rally puts the mode
   * back the same way, so a step opened inside the batch had the tile taken straight back
   * out of its hand and the walkthrough stalled on a board it could not act from.
   */
  it("does not open the next step until the action that ended this one is finished", () => {
    const { screen, host } = running();
    screen.start();
    opened(host);
    const tour = (screen as unknown as { opts: { tour: Tour } }).opts.tour;

    host.querySelector<HTMLButtonElement>("#tourNext")?.click();   // past the opening line
    tour.signal("select");
    expect(tour.step?.id, "expected to be waiting on a move").toBe("move");

    (screen as unknown as { consume: (e: unknown[]) => void }).consume(
      [{ type: "move", from: { c: 0, r: 0 }, to: { c: 0, r: 1 }, owner: "you", count: 2 }],
    );
    expect(tour.step?.id, "the step advanced inside the batch that ended it").toBe("move");

    return Promise.resolve().then(() => {
      expect(tour.step?.id, "the step never advanced at all").toBe("attack");
      screen.destroy();
    });
  });

  it("starts the clock once the tour is out of the way", async () => {
    vi.useFakeTimers();
    const { state, screen, host } = running();
    screen.start();
    opened(host);
    host.querySelector<HTMLButtonElement>("#tourSkip")?.click();
    expect(host.querySelector(".tourwrap")).toBeNull();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.turn, "the match never resumed").toBeGreaterThan(1);
    screen.destroy();
  });
});
