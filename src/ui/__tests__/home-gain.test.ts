import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, ProfileStore, ROAD_CHAPTER_STOPS, TOUR_VERSION, chapterOf, roadKey, stopColony } from "../../platform";
import { backdropFor } from "../backdrops";
import { HomeGainAnimation } from "../home-gain";
import { topBar, updateColonyBanner } from "../chrome";
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
  it("counts collected units with a quick hop on each number change and a synchronized fill", () => {
    const { store, animation, root, number } = fixture();
    store.update((p) => { p.pendingHomeGain = { from: 52, amount: 8, source: "granary" }; });
    animation.start(root, store, () => true);
    step(0);
    expect(number()).toBe(52);
    step(80);
    expect(number()).toBe(53);
    step(96);
    expect(root.querySelector<HTMLElement>(".col-n")!.style.transform).toContain("translateY(-");
    step(145);
    expect(root.querySelector<HTMLElement>(".col-n")!.style.transform).toBe("");
    step(160);
    expect(number()).toBe(54);
    step(176);
    expect(root.querySelector<HTMLElement>(".col-n")!.style.transform).toContain("translateY(-");
    step(600);
    expect(number()).toBe(60);
    expect(root.querySelector<HTMLElement>("#colonyHero")!.dataset.progressColony).toBe("60");
    expect(root.querySelector(".home-gain")).toBeNull();
    step(700);
    expect(store.get().colony).toBe(60);
    expect(store.get().pendingHomeGain).toBeNull();
    expect(root.querySelector<HTMLElement>(".col-n")!.style.transform).toBe("");
  });

  it("changes chapter artwork immediately on collection without replacing Home", () => {
    const store = new ProfileStore(new MemoryStore());
    const edge = stopColony(10 * ROAD_CHAPTER_STOPS);
    store.update((p) => {
      p.colony = edge - 1;
      p.tourSeen = TOUR_VERSION;
      p.granaryAt = Date.now() - 7 * 3_600_000;
    });
    expect(store.granary().stored).toBeGreaterThan(0);
    const host = document.createElement("div");
    host.id = "app";
    document.body.appendChild(host);
    const app = new App(host, store);
    apps.push(app);
    app.start();
    const root = host.querySelector<HTMLElement>("#home")!;
    const before = store.get().colony;
    const chapter = chapterOf(before);
    expect(root.style.backgroundImage).toContain(backdropFor(chapter));
    root.querySelector<HTMLButtonElement>("#granaryPill")!.click();
    const nextChapter = chapterOf(store.get().colony);
    expect(nextChapter).toBeGreaterThan(chapter);
    expect(host.querySelector("#home")).toBe(root);
    expect(root.dataset.chapter).toBe(String(nextChapter));
    expect(root.style.backgroundImage).toContain(backdropFor(nextChapter));
    expect(Number(root.querySelector<HTMLElement>("#colonyHero")!.dataset.colony)).toBe(before);
    expect(host.querySelector(".reward-reveal")).toBeNull();
    step(0); step(100);
    const partial = Number(root.querySelector<HTMLElement>("#colonyHero")!.dataset.colony);
    expect(partial).toBeGreaterThan(before);
    expect(partial).toBeLessThan(store.get().colony);
    step(2000);
    expect(Number(root.querySelector<HTMLElement>("#colonyHero")!.dataset.colony)).toBe(store.get().colony);
    expect(store.get().pendingHomeGain).toBeNull();
  });

  it("keeps an interrupted collection in count mode across a reload", () => {
    const { store, animation, root, number } = fixture();
    store.update((p) => { p.pendingHomeGain = { from: 52, amount: 8, source: "granary" }; });
    animation.start(root, store, () => true);
    step(0); step(160);
    const partial = number();
    animation.cancel();
    const restored = new ProfileStore(store.slot.store, store.slot.key);
    expect(restored.get().pendingHomeGain).toEqual({ from: partial, amount: 60 - partial, source: "granary" });
    animation.start(root, restored, () => true);
    step(800); step(2800);
    expect(number()).toBe(60);
    expect(root.querySelector(".home-gain")).toBeNull();
    expect(restored.get().pendingHomeGain).toBeNull();
  });

  it("fills smoothly on the count's clock and finishes on the same frame", () => {
    const { store, animation, root, number } = fixture();
    const banner = root.querySelector<HTMLElement>("#colonyHero")!;
    const fill = (): number => parseFloat(banner.querySelector<HTMLElement>(".tr-fill")!.style.width);
    const initial = fill();
    const expected = topBar(store.get(), {
      onProfile: () => {}, onShop: () => {}, onColonyRoad: () => {},
    });
    const final = parseFloat(expected.querySelector<HTMLElement>(".tr-fill")!.style.width);
    animation.start(root, store, () => true);
    step(0); step(200); step(900);
    expect(number()).toBe(52);
    expect(fill()).toBe(initial);
    step(930);
    const first = fill();
    expect(first).toBeGreaterThan(initial);
    expect(number()).toBe(52);
    step(940);
    expect(fill()).toBeGreaterThan(first);
    expect(number()).toBe(52);
    // Sample through every impact, including the final packet settling.
    for (let now = 950; now <= 1600; now += 10) {
      step(now);
      if (number() < 60) {
        expect(Number(banner.dataset.progressColony)).toBeLessThan(60);
        expect(fill()).toBeLessThanOrEqual(final);
      } else {
        expect(fill()).toBe(final);
        break;
      }
    }
    expect(number()).toBe(60);
    expect(fill()).toBe(final);
    step(2200);
    expect(store.get().pendingHomeGain).toBeNull();
    expect(store.get().colony).toBe(60);
  });

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
    step(1030);
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

it("crosses checkpoint boundaries on the count-up clock while retaining paid reward states", () => {
  const { store, animation, root } = fixture();
  const first = roadKey("free", 1), second = roadKey("free", 2);
  store.update((p) => {
    p.colony = 106;
    p.pendingHomeGain = { from: 99, amount: 7 };
    p.roadClaimed = [first, second];
  });
  const banner = root.querySelector<HTMLElement>("#colonyHero")!;
  updateColonyBanner(banner, 99, 99, store.get().roadClaimed);
  animation.start(root, store, () => true);
  let sawSecond = false, sawThird = false;
  for (let now = 0; now <= 2200; now += 10) {
    step(now);
    const pay = banner.querySelector<HTMLElement>(".col-pay")!;
    if (banner.dataset.rewardKey === second) {
      sawSecond = true;
      expect(pay.classList.contains("claimed")).toBe(true);
    }
    if (banner.dataset.rewardKey === roadKey("free", 3)) {
      sawThird = true;
      expect(pay.classList.contains("claimed")).toBe(false);
      expect(pay.querySelector(".col-reward-avatar")).not.toBeNull();
    }
  }
  expect(sawSecond).toBe(true);
  expect(sawThird).toBe(true);
  expect(parseFloat(banner.querySelector<HTMLElement>(".tr-fill")!.style.width)).toBe(40);
  expect(store.get().roadClaimed).toEqual([first, second]);
  expect(store.get().pendingHomeGain).toBeNull();
});
