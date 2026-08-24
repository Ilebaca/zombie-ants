/**
 * FIRST RUN.
 *
 * The tour is the one thing in the app that must appear by itself, exactly once, and hold
 * the match still while it is up. All three of those are asserted here: the app raises it
 * on a fresh profile and not on a used one, skipping settles it for good, and a match with
 * the tour running does not let the turn clock take the turn away from someone reading.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createGame, defaultContext, NEUTRAL_MODS } from "../../engine";
import { MemoryStore, ProfileStore } from "../../platform";
import { App } from "../app";
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
    profile.update((p) => { p.tutorialDone = true; });
    new App(host, profile).start();
    expect(host.querySelector(".tourwrap")).toBeNull();
  });

  it("does not come back after a skip", () => {
    const host = mount();
    const profile = new ProfileStore(new MemoryStore());
    new App(host, profile).start();
    host.querySelector<HTMLButtonElement>("#tourSkip")?.click();

    expect(host.querySelector(".tourwrap")).toBeNull();
    expect(profile.get().tutorialDone, "a skip did not settle it").toBe(true);

    // A second launch on the same profile is a returning player.
    const again = mount();
    new App(again, profile).start();
    expect(again.querySelector(".tourwrap")).toBeNull();
  });

  it("can be replayed from settings", () => {
    const host = mount();
    const profile = new ProfileStore(new MemoryStore());
    profile.update((p) => { p.tutorialDone = true; });
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

  it("holds the turn while a step is showing", async () => {
    vi.useFakeTimers();
    const { state, screen, host } = running();
    screen.start();
    expect(host.querySelector(".tourbubble"), "the match tour never opened").not.toBeNull();

    // Well past the 15-second move clock: a player reading a step must not be timed out.
    // `current` is no use here — a turn that ran away and came back is "you" again. The
    // turn NUMBER is what says the match stood still.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.turn, "the clock took the turn during the tutorial").toBe(1);
    expect(state.current).toBe("you");
    screen.destroy();
  });

  it("starts the clock once the tour is out of the way", async () => {
    vi.useFakeTimers();
    const { state, screen, host } = running();
    screen.start();
    host.querySelector<HTMLButtonElement>("#tourSkip")?.click();
    expect(host.querySelector(".tourwrap")).toBeNull();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.turn, "the match never resumed").toBeGreaterThan(1);
    screen.destroy();
  });
});
