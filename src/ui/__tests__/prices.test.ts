import { afterEach, describe, expect, it, vi } from "vitest";
import { HATCH_COST, LARVA_MYCEL, MemoryStore, ProfileStore } from "../../platform";
import { buyButton } from "../chrome";
import { buildHatch } from "../hatch";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const profile = (mycel: number, larva: number): ProfileStore => {
  const store = new ProfileStore(new MemoryStore());
  store.update(p => { p.mycel = mycel; p.larva = larva; });
  return store;
};
const hatch = (store: ProfileStore): HTMLElement => {
  const root = buildHatch(store, { onBack: () => {}, onBuyLarva: () => {}, onInventory: () => {} });
  document.body.appendChild(root);
  return root;
};
const warned = (root: HTMLElement, selector: string): boolean =>
  !!root.querySelector(selector + " .resource-price.shortfall");

describe("resource price warnings", () => {
  it("separates a missing balance from MAX and non-price locks", () => {
    const opts = { icon:"mycel", cost:100, maxed:false, onBuy:()=>{} };
    expect(buyButton({...opts, affordable:false}).querySelector(".shortfall")?.textContent).toBe("100");
    expect(buyButton({...opts, affordable:true}).querySelector(".shortfall")).toBeNull();
    expect(buyButton({...opts, affordable:false, insufficient:false}).querySelector(".shortfall")).toBeNull();
    const max = buyButton({...opts, affordable:false, maxed:true});
    expect(max.textContent).toBe("MAX");
    expect(max.querySelector(".resource-price")).toBeNull();
  });

  it("warns only for hatch amounts the current larva balance cannot cover", () => {
    for (const [count, one, ten] of [[0,true,true], [HATCH_COST,false,true], [HATCH_COST*10,false,false]] as const) {
      const root = hatch(profile(LARVA_MYCEL, count));
      expect(warned(root, "#hatchGo")).toBe(one);
      expect(warned(root, "#hatchGo10")).toBe(ten);
      expect(root.querySelector("#hatchGo .hb-c")?.textContent).toBe(HATCH_COST + " larva");
      root.remove();
    }
  });

  it("refreshes the trade warning and hatch price after exchanging the last mycelium", () => {
    const store = profile(LARVA_MYCEL, 0);
    const root = hatch(store);
    expect(warned(root, "#hatchTrade")).toBe(false);
    root.querySelector<HTMLButtonElement>("#hatchTrade")?.click();
    expect(store.get().mycel).toBe(0);
    expect(store.get().larva).toBe(1);
    expect(warned(root, "#hatchTrade")).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("#hatchTrade")?.disabled).toBe(true);
    expect(warned(root, "#hatchGo")).toBe(false);
    expect(warned(root, "#hatchGo10")).toBe(true);
  });

  it("does not warn about the larva already spent during the hatching hold", () => {
    vi.useFakeTimers();
    const store = profile(0, HATCH_COST);
    const root = hatch(store);
    root.querySelector<HTMLButtonElement>("#hatchGo")?.click();
    expect(store.get().larva).toBe(0);
    expect(root.querySelector<HTMLButtonElement>("#hatchGo")?.disabled).toBe(true);
    expect(warned(root, "#hatchGo")).toBe(false);
    expect(warned(root, "#hatchGo10")).toBe(false);
  });
});
