/**
 * KEEPING THE PLAYER'S PLACE ACROSS A REBUILD.
 *
 * Every progression screen redraws itself in place after a tap, by throwing the whole
 * screen away and building a new one. That is the right shape — one function decides what
 * the screen looks like — and it cost the SCROLL: a new element starts at the top, so
 * buying the fifth chamber down a long nest snapped the player back to the mound. It reads
 * as the app losing your place, and that is exactly how it was reported.
 *
 * jsdom has no layout, so `scrollTop` here is a number that is stored rather than one that
 * is clamped to a real scroll height. That is enough to hold the RULE: what was read
 * before the rebuild is written back after it.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryStore, ProfileStore } from "../../platform";
import { el, redraw } from "../chrome";
import { buildAnthill } from "../anthill";
import { buildSpeciesPage } from "../species";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

beforeEach(() => { document.body.replaceChildren(); });

/** Let the restore's microtask run. */
const settle = (): Promise<void> => Promise.resolve();

describe("redraw", () => {
  it("puts the screen back where it was", async () => {
    const root = el("div");
    const build = (): void => {
      const scroller = el("div", "wrap");
      scroller.id = "body";
      root.appendChild(scroller);
    };
    build();
    const scroller = (): HTMLElement | null => root.querySelector("#body");
    scroller()!.scrollTop = 420;

    redraw(root);
    build();
    await settle();
    expect(scroller()?.scrollTop, "the rebuilt screen started at the top").toBe(420);
  });

  it("finds the scroller again by its classes when it has no id", async () => {
    const root = el("div");
    const build = (): void => { root.appendChild(el("div", "hillwrap deep")); };
    build();
    root.querySelector<HTMLElement>(".hillwrap")!.scrollTop = 120;
    redraw(root);
    build();
    await settle();
    expect(root.querySelector<HTMLElement>(".hillwrap")?.scrollTop).toBe(120);
  });

  it("empties the screen, which is what it is for", () => {
    const root = el("div");
    root.appendChild(el("div", "wrap"));
    redraw(root);
    expect(root.children.length).toBe(0);
  });

  it("does nothing when nothing was scrolled", async () => {
    const root = el("div");
    root.appendChild(el("div", "wrap"));
    redraw(root);
    root.appendChild(el("div", "wrap"));
    await settle();
    expect(root.querySelector<HTMLElement>(".wrap")?.scrollTop).toBe(0);
  });

  /** A screen torn down between the redraw and the microtask must not throw. */
  it("survives the screen being thrown away before it can restore", async () => {
    const root = el("div");
    const scroller = el("div", "wrap");
    root.appendChild(scroller);
    scroller.scrollTop = 50;
    redraw(root);
    await settle();
    expect(root.children.length).toBe(0);
  });
});

/**
 * ...and the same thing through two real screens, because the helper being right is only
 * half of it: every screen that rebuilds itself has to actually call it.
 */
describe("the screens that rebuild themselves", () => {
  const store = (): ProfileStore => {
    const s = new ProfileStore(new MemoryStore());
    s.update((p) => { p.mycel = 90_000; p.colony = 2_000_000; });
    return s;
  };

  it("keeps the anthill where it was when a chamber is dug", async () => {
    const s = store();
    const root = buildAnthill(s);
    document.body.replaceChildren(root);
    const wrap = (): HTMLElement | null => root.querySelector(".hillwrap");
    wrap()!.scrollTop = 300;

    // Open a chamber and buy a level — both redraw the whole screen.
    root.querySelectorAll<HTMLButtonElement>(".hillcut, .chamber, button")[3]?.click();
    await settle();
    expect(wrap()?.scrollTop, "digging sent the player back to the mound").toBe(300);
  });

  it("keeps a colony's page where it was when research is bought", async () => {
    const s = store();
    const root = buildSpeciesPage(s, { species: "fire", onBack: () => {} });
    document.body.replaceChildren(root);
    const wrap = (): HTMLElement | null => root.querySelector(".spgwrap");
    wrap()!.scrollTop = 260;

    const buy = root.querySelector<HTMLButtonElement>(".spgtrack button");
    expect(buy, "no way to buy a research level").toBeTruthy();
    buy?.click();
    await settle();
    expect(wrap()?.scrollTop, "buying research jumped back to the top").toBe(260);
  });
});
