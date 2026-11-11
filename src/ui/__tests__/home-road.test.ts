import { describe, expect, it } from "vitest";
import {
  MemoryStore, ProfileStore, ROAD_STOPS, freeReward, roadKey, stopColony,
} from "../../platform";
import { avatarArt } from "../avatars";
import { colonyBanner, topBar, updateColonyBanner } from "../chrome";
import { hudIcon } from "../hud";
import { buildColonyRoad } from "../road";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const opts = { onProfile: () => {}, onShop: () => {}, onColonyRoad: () => {} };
const fill = (banner: HTMLElement): number =>
  parseFloat(banner.querySelector<HTMLElement>(".tr-fill")!.style.width);
const reward = (banner: HTMLElement): HTMLElement => banner.querySelector<HTMLElement>(".col-pay")!;
const render = (store: ProfileStore): HTMLElement =>
  topBar(store.get(), opts).querySelector<HTMLElement>("#colonyHero")!;

describe("Home checkpoint rewards", () => {
  it("shows the actual single resource icon at each checkpoint", () => {
    const banner = colonyBanner(80, () => {});
    expect(fill(banner)).toBe(80);
    expect(reward(banner).querySelectorAll("img")).toHaveLength(1);
    expect(reward(banner).querySelector("img")?.getAttribute("src")).toBe(hudIcon("mycel"));
    updateColonyBanner(banner, 102);
    expect(fill(banner)).toBe(50);
    expect(reward(banner).querySelectorAll("img")).toHaveLength(1);
    expect(reward(banner).querySelector("img")?.getAttribute("src")).toBe(hudIcon("pheromone"));
    expect(banner.dataset.rewardKey).toBe(roadKey("free", 2));
  });

  it("shows the promised avatar, then switches back to a resource at the following checkpoint", () => {
    const banner = colonyBanner(106, () => {});
    expect(fill(banner)).toBe(40);
    const avatar = freeReward(3)!.avatar!;
    expect(reward(banner).querySelectorAll("img")).toHaveLength(1);
    expect(reward(banner).querySelector("img")?.getAttribute("src")).toBe(avatarArt(avatar));
    updateColonyBanner(banner, 110);
    expect(reward(banner).querySelector("img")?.getAttribute("src")).toBe(hudIcon("pheromone"));
    expect(reward(banner).querySelector(".col-reward-avatar")).toBeNull();
  });

  it("keeps the icon and fill on the same fractional animation position", () => {
    const banner = colonyBanner(103, () => {});
    updateColonyBanner(banner, 103, 103.5);
    expect(fill(banner)).toBe(87.5);
    expect(banner.dataset.rewardKey).toBe(roadKey("free", 2));
    updateColonyBanner(banner, 104, 104);
    expect(fill(banner)).toBe(0);
    expect(banner.dataset.rewardKey).toBe(roadKey("free", 3));
    expect(reward(banner).querySelector(".col-reward-avatar")).not.toBeNull();
  });

  it("updates a claimed icon even when the troop count has not changed", () => {
    const banner = colonyBanner(80, () => {});
    updateColonyBanner(banner, 80, 80, [roadKey("free", 1)]);
    expect(fill(banner)).toBe(80);
    expect(reward(banner).classList.contains("claimed")).toBe(true);
    expect(banner.dataset.rewardClaimed).toBe("true");
    expect(reward(banner).title).toBe("Already claimed");
  });

  it("keeps mapped rewards claimed across losses, reloads and reaching the same milestone again", () => {
    const memory = new MemoryStore();
    const store = new ProfileStore(memory);
    store.update((p) => { p.colony = 104; });
    const key = roadKey("free", 2);
    expect(key).not.toBe("f2");
    expect(store.claimRoad(key)).toBe(true);
    const banked = store.get().pheromone;
    store.update((p) => { p.colony = 102; });
    const loaded = new ProfileStore(memory);
    const banner = render(loaded);
    expect(fill(banner)).toBe(50);
    expect(banner.dataset.rewardKey).toBe(key);
    expect(reward(banner).classList.contains("claimed")).toBe(true);
    const road = buildColonyRoad(loaded, () => {}, () => {});
    const card = road.querySelector<HTMLButtonElement>('.rd-prize.free[data-stop="2"]')!;
    expect(card.classList.contains("got")).toBe(true);
    expect(card.disabled).toBe(true);
    loaded.update((p) => { p.colony = 104; });
    expect(loaded.claimRoad(key)).toBe(false);
    expect(loaded.get().pheromone).toBe(banked);
  });

  it("keeps the completed road full without inventing another reward", () => {
    const last = stopColony(ROAD_STOPS);
    const banner = colonyBanner(last + 500, () => {}, [roadKey("free", ROAD_STOPS)]);
    expect(fill(banner)).toBe(100);
    expect(banner.dataset.rewardKey).toBe(roadKey("free", ROAD_STOPS));
    expect(reward(banner).classList.contains("claimed")).toBe(true);
  });

  it("disables an already-paid premium card even on an older save without a pass", () => {
    const store = new ProfileStore(new MemoryStore());
    const key = roadKey("pass", 3);
    store.update((p) => { p.roadClaimed = [key]; p.pass = false; });
    const shop = { opened: false };
    const road = buildColonyRoad(store, () => {}, () => { shop.opened = true; });
    const card = road.querySelector<HTMLButtonElement>('.rd-prize.pass[data-stop="3"]')!;
    expect(card.classList.contains("got")).toBe(true);
    expect(card.disabled).toBe(true);
    card.click();
    expect(shop.opened).toBe(false);
  });
});
