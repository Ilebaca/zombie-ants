import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAccounts, MemoryStore, ProfileStore, SilentFeedback, TOUR_VERSION } from "../../platform";
import { App } from "../app";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const apps: App[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.destroy();
  document.body.replaceChildren();
});

describe("crystal receipts", () => {
  it("notifies once after persistence for a real gain, never for spending or other currencies", () => {
    const memory = new MemoryStore(), store = new ProfileStore(memory);
    const heard: number[] = [];
    const off = store.onCrystalCollected(() => {
      heard.push(new ProfileStore(memory).get().pheromone);
    });
    expect(heard).toEqual([]);
    store.update(p => { p.mycel += 60; p.larva += 1; p.colony += 10; });
    store.update(p => { p.pheromone += 100; });
    store.update(p => { p.pheromone -= 20; });
    store.update(p => { p.pheromone += 0; });
    expect(heard).toEqual([100]);
    off();
    store.update(p => { p.pheromone += 1; });
    expect(heard).toEqual([100]);
  });

  it("does not replay old balances on restore or reward claims that are refused", () => {
    const store = new ProfileStore(new MemoryStore());
    const collected = vi.fn();
    store.onCrystalCollected(collected);
    store.restore({...store.get(), pheromone: 500});
    expect(collected).not.toHaveBeenCalled();
    expect(store.claimDailyGift(1_000_000_000)).toBe(true);
    expect(collected).toHaveBeenCalledTimes(1);
    expect(store.claimDailyGift(1_000_000_000)).toBe(false);
    expect(store.claimRoad("not-a-stop")).toBe(false);
    expect(collected).toHaveBeenCalledTimes(1);
    const off = store.onCrystalCollected(() => { throw new Error("speaker unavailable"); });
    expect(() => store.update(p => { p.pheromone += 1; })).not.toThrow();
    off();
  });

  it("connects the receipt to feedback only while the app owns the profile", () => {
    const store = new ProfileStore(new MemoryStore());
    store.update(p => { p.tourSeen = TOUR_VERSION; p.guardSeen = true; });
    const feedback = new SilentFeedback(), play = vi.spyOn(feedback, "play");
    const host = document.createElement("div"); host.id = "app";
    document.body.replaceChildren(host);
    const app = new App(host, store, new LocalAccounts(new MemoryStore()), feedback);
    apps.push(app); app.start();
    expect(play).not.toHaveBeenCalledWith("crystalCollect");
    store.claimDailyGift(1_000_000_000);
    expect(play.mock.calls.filter(([cue])=>cue==="crystalCollect")).toHaveLength(1);
    store.update(p=>{p.mycel+=20; p.pheromone-=10;});
    expect(play.mock.calls.filter(([cue])=>cue==="crystalCollect")).toHaveLength(1);
    app.destroy(); apps.splice(apps.indexOf(app),1);
    store.update(p=>{p.pheromone+=10;});
    expect(play.mock.calls.filter(([cue])=>cue==="crystalCollect")).toHaveLength(1);
  });
});
