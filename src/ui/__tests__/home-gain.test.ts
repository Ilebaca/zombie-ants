import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, ProfileStore, TOUR_VERSION } from "../../platform";
import { HomeGainAnimation } from "../home-gain";
import { topBar } from "../chrome";
import { App } from "../app";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

let frames: Map<number, FrameRequestCallback>;
let serial = 0;
const animations: HomeGainAnimation[] = [];
const apps: App[] = [];

beforeEach(() => {
  document.body.replaceChildren();
  frames = new Map();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.set(++serial, fn);
    return serial;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const number = this.classList.contains("col-n");
    const play = this.id === "goPlay";
    return { x: 0, y: 0, left: 0, top: play ? 680 : number ? 100 : 0,
      width: number ? 50 : 390, height: number ? 40 : play ? 60 : 844,
      right: 390, bottom: 844, toJSON: () => ({}) } as DOMRect;
  });
});

afterEach(() => {
  apps.splice(0).forEach((app) => app.destroy());
  animations.splice(0).forEach((animation) => animation.cancel());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function step(now: number): void {
  const batch = Array.from(frames.values());
  frames.clear();
  batch.forEach((fn) => fn(now));
}

function fixture() {
  const store = new ProfileStore(new MemoryStore());
  store.update((p) => {
    p.colony = 60;
    p.pendingHomeGain = { from: 52, amount: 8 };
    p.tourSeen = TOUR_VERSION;
  });
  const animation = new HomeGainAnimation();
  animations.push(animation);
  const root = document.createElement("section");
  root.id = "home";
  root.appendChild(topBar({ ...store.get(), colony: animation.displayedColony(store) }, {
    onProfile: () => {}, onShop: () => {}, onColonyRoad: () => {},
  }));
  const play = document.createElement("button");
  play.id = "goPlay";
  root.appendChild(play);
  document.body.appendChild(root);
  return { store, animation, root, number: () => Number(root.querySelector("#colonyHero")?.getAttribute("data-colony")) };
}

describe("Home match reward presentation", () => {
  it("flies multiple swords from Play and counts only as they arrive, without crediting twice", () => {
    const { store, animation, root, number } = fixture();
    const before = structuredClone(store.get());
    animation.start(root, store, () => true);
    expect(number()).toBe(52);
    step(0); step(200);
    expect(root.querySelectorAll(".home-gain-unit").length).toBeGreaterThan(1);
    expect(root.querySelectorAll(".home-gain-unit .hudmark").length).toBeGreaterThan(1);
    step(900);
    expect(number()).toBe(52);
    step(990);
    expect(number()).toBeGreaterThan(52);
    expect(number()).toBeLessThan(60);
    step(2200);
    expect(number()).toBe(60);
    expect(root.querySelector(".home-gain")).toBeNull();
    expect(store.get()).toEqual({ ...before, pendingHomeGain: null });
    animation.start(root, store, () => true);
    step(2400);
    expect(root.querySelector(".home-gain")).toBeNull();
  });

  it("retains only unshown units across navigation, reload and a later Home visit", () => {
    const { store, animation, root, number } = fixture();
    let visible = true;
    animation.start(root, store, () => visible);
    step(0); step(200); step(1100);
    const partial = number();
    expect(partial).toBeGreaterThan(52);
    expect(partial).toBeLessThan(60);
    visible = false;
    step(1120);
    expect(root.querySelector(".home-gain")).toBeNull();
    const reloaded = new ProfileStore(store.slot.store, store.slot.key);
    expect(reloaded.get().pendingHomeGain?.amount).toBe(60 - partial);
    expect(animation.displayedColony(reloaded)).toBe(partial);
    animation.start(root, reloaded, () => true);
    step(1200); step(1400); step(3500);
    expect(number()).toBe(60);
    expect(reloaded.get().pendingHomeGain).toBeNull();
  });

  it("waits offscreen and respects reduced motion", () => {
    const { store, animation, root, number } = fixture();
    animation.start(root, store, () => false);
    step(0); step(200);
    expect(root.querySelector(".home-gain")).toBeNull();
    expect(store.get().pendingHomeGain?.amount).toBe(8);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    animation.start(root, store, () => true);
    step(300); step(500);
    expect(number()).toBe(60);
    expect(root.querySelector(".home-gain")).toBeNull();
    expect(store.get().pendingHomeGain).toBeNull();
  });

  it("does not consume winnings behind the launch cover", () => {
    const { store, animation, root, number } = fixture();
    const splash = document.createElement("div");
    splash.id = "splash";
    document.body.appendChild(splash);
    animation.start(root, store, () => true);
    step(0); step(3000);
    expect(number()).toBe(52);
    expect(root.querySelector(".home-gain")).toBeNull();
    expect(store.get().pendingHomeGain?.amount).toBe(8);
    splash.remove();
    step(3100); step(3300); step(5500);
    expect(number()).toBe(60);
    expect(store.get().pendingHomeGain).toBeNull();
  });

  it("bounds particle work for a large reward and includes other credited earnings", () => {
    const { store, animation, root, number } = fixture();
    store.update((p) => { p.colony = 1_000_000; p.pendingHomeGain = { from: 40, amount: 999_960 }; });
    animation.start(root, store, () => true);
    step(0); step(200);
    expect(root.querySelectorAll(".home-gain-unit").length).toBeLessThanOrEqual(12);
    store.update((p) => { p.colony += 10; });
    step(210);
    expect(number()).toBe(50);
    step(3000);
    expect(number()).toBe(1_000_010);
    expect(store.get().colony).toBe(1_000_010);
  });

  it("does not carry one colony's presentation into another colony", () => {
    const { store, animation, root } = fixture();
    animation.start(root, store, () => true);
    step(0); step(200);
    const other = new ProfileStore(new MemoryStore());
    animation.start(root, other, () => true);
    expect(root.querySelector(".home-gain")).toBeNull();
    expect(animation.displayedColony(other)).toBe(other.get().colony);
    expect(other.get().pendingHomeGain).toBeNull();
    expect(store.get().pendingHomeGain?.amount).toBe(8);
  });

  it("the App resumes pending winnings only on Home, even after visiting another tab", () => {
    const { store, root } = fixture();
    root.remove();
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    const app = new App(host, store);
    apps.push(app);
    app.start();
    host.querySelector<HTMLButtonElement>('.navitem[data-nav="anthill"]')!.click();
    step(0); step(200);
    expect(host.querySelector(".home-gain")).toBeNull();
    expect(store.get().pendingHomeGain?.amount).toBe(8);
    host.querySelector<HTMLButtonElement>('.navitem[data-nav="home"]')!.click();
    step(300); step(500);
    expect(host.querySelectorAll(".home-gain-unit").length).toBeGreaterThan(1);
    step(2600);
    expect(host.querySelector("#colonyHero")?.getAttribute("data-colony")).toBe("60");
    expect(store.get().pendingHomeGain).toBeNull();
  });
});
