/**
 * THE SHOP.
 *
 * The one screen that will one day take real money, and it had no test at all. What matters
 * here is not the layout but the four things that can cost a player something: a purchase
 * must grant exactly what it promised, a failed one must grant nothing, a double tap must
 * not buy twice, and something already owned must not be sold again.
 *
 * The gateway is the seam (platform/purchases.ts), so every case is reachable by handing
 * the screen a gateway that behaves that way — which is also the proof that swapping in
 * RevenueCat needs no change here.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DAILY_GIFT, DemoGateway, MemoryStore, ProfileStore, SHOP_PRODUCTS, productById,
} from "../../platform";
import type { PurchaseGateway, PurchaseResult } from "../../platform";
import { buildShop } from "../shop";

HTMLCanvasElement.prototype.getContext = (() => null) as HTMLCanvasElement["getContext"];

const store = (): ProfileStore => new ProfileStore(new MemoryStore());

/** A gateway that answers however a test needs, and records what it was asked for. */
const gateway = (answer: (id: string) => PurchaseResult, live = false): {
  gw: PurchaseGateway; asked: string[];
} => {
  const asked: string[] = [];
  return {
    asked,
    gw: { live, buy: (id: string) => { asked.push(id); return Promise.resolve(answer(id)); } },
  };
};

const build = (s: ProfileStore, gw: PurchaseGateway): HTMLElement => {
  const root = buildShop(s, gw, () => {});
  document.body.replaceChildren(root);
  return root;
};

/**
 * The tile whose text names this product, and the button on it.
 *
 * Matched on the NAME, never on the price: a tile that has been bought reads "Owned" where
 * the price was, and the test that checks exactly that could not then find it again.
 */
const tileFor = (root: HTMLElement, id: string): HTMLElement | null => {
  const product = productById(id);
  if (!product) return null;
  const label = product.title
    ?? (product.grant.mycel ?? product.grant.pheromone ?? 0).toLocaleString();
  return Array.from(root.querySelectorAll<HTMLElement>(".stile"))
    .find((t) => t.textContent?.includes(label)) ?? null;
};
const buyIn = (root: HTMLElement, id: string): HTMLButtonElement | null =>
  tileFor(root, id)?.querySelector<HTMLButtonElement>(".buybar") ?? null;

describe("the shop's shelves", () => {
  it("lists every product it is allowed to sell", () => {
    const root = build(store(), new DemoGateway());
    expect(root.querySelectorAll(".stile").length).toBe(SHOP_PRODUCTS.length + 1); // + the gift
  });

  // The legacy build sells larva and cosmetic rolls. Neither is ported, and taking money
  // against a feature that does not exist is the one thing a shop must never do.
  it("sells nothing the game cannot actually give", () => {
    for (const p of SHOP_PRODUCTS) {
      const gives = p.grant.mycel || p.grant.pheromone || p.grant.pass || p.grant.species;
      expect(gives, `${p.id} grants nothing`).toBeTruthy();
    }
    expect(SHOP_PRODUCTS.some((p) => /larva|hatch|skin/i.test(p.id))).toBe(false);
  });

  /** A demo gateway grants without charging. Not saying so would be a lie, not a stub. */
  it("says plainly when the shop is not live", () => {
    expect(build(store(), new DemoGateway()).textContent).toMatch(/test shop/i);
    const { gw } = gateway(() => ({ ok: true }), true);
    expect(build(store(), gw).textContent).not.toMatch(/test shop/i);
  });
});

describe("buying", () => {
  it("grants exactly what the product promised", async () => {
    const s = store();
    const { gw } = gateway((id) => ({ ok: true, grant: productById(id)?.grant }));
    const root = build(s, gw);
    const product = productById("mycel.400")!;
    buyIn(root, "mycel.400")?.click();
    await vi.waitFor(() => expect(s.get().mycel).toBe(product.grant.mycel));
  });

  /**
   * `ok` is the answer, and the grant beside it is not.
   *
   * The refusal deliberately carries a grant: a gateway that says no while handing back
   * goods is exactly the shape a broken or hostile one takes, and a screen that reads the
   * grant instead of the verdict pays out on it. Refusing with an empty result proves
   * nothing — the screen would have granted nothing either way.
   */
  it("grants nothing when the gateway refuses, whatever it hands back", async () => {
    const s = store();
    const { gw } = gateway((id) => ({
      ok: false, note: "Payment declined", grant: productById(id)?.grant,
    }));
    const root = build(s, gw);
    buyIn(root, "mycel.400")?.click();
    await vi.waitFor(() => expect(root.textContent).toContain("Payment declined"));
    expect(s.get().mycel, "a refused purchase paid out").toBe(0);
  });

  it("grants nothing when the gateway throws", async () => {
    const s = store();
    const gw: PurchaseGateway = { live: false, buy: () => Promise.reject(new Error("offline")) };
    const root = build(s, gw);
    buyIn(root, "mycel.400")?.click();
    await vi.waitFor(() => expect(root.textContent).toMatch(/could not be reached/i));
    expect(s.get().mycel).toBe(0);
  });

  /** A second tap while the first is still in flight must not buy the thing twice. */
  it("takes one purchase per tap, however fast the taps are", async () => {
    const s = store();
    let release: (r: PurchaseResult) => void = () => {};
    const asked: string[] = [];
    const gw: PurchaseGateway = {
      live: false,
      buy: (id) => { asked.push(id); return new Promise<PurchaseResult>((r) => { release = r; }); },
    };
    const root = build(s, gw);
    buyIn(root, "mycel.400")?.click();
    buyIn(root, "mycel.400")?.click();
    buyIn(root, "mycel.400")?.click();
    expect(asked.length, "a double tap reached the gateway twice").toBe(1);
    release({ ok: true, grant: productById("mycel.400")?.grant });
    await vi.waitFor(() => expect(s.get().mycel).toBeGreaterThan(0));
  });

  it("unlocks the pass, and then stops selling it", async () => {
    const s = store();
    const { gw } = gateway((id) => ({ ok: true, grant: productById(id)?.grant }));
    const root = build(s, gw);
    buyIn(root, "pass.trophy")?.click();
    await vi.waitFor(() => expect(s.get().pass).toBe(true));
    const again = buyIn(root, "pass.trophy");
    expect(again?.textContent).toBe("Owned");
    expect(again?.disabled).toBe(true);
  });

  it("unlocks the premium colony, and then stops selling it", async () => {
    const s = store();
    const { gw } = gateway((id) => ({ ok: true, grant: productById(id)?.grant }));
    const root = build(s, gw);
    buyIn(root, "species.demon")?.click();
    await vi.waitFor(() => expect(s.isUnlocked("demon")).toBe(true));
    expect(buyIn(root, "species.demon")?.disabled).toBe(true);
  });
});

describe("the daily gift", () => {
  const giftButton = (root: HTMLElement): HTMLButtonElement | null =>
    Array.from(root.querySelectorAll<HTMLElement>(".stile"))
      .find((t) => t.textContent?.includes("Daily gift"))
      ?.querySelector<HTMLButtonElement>(".buybar") ?? null;

  it("is free the first time and pays both currencies", () => {
    const s = store();
    const root = build(s, new DemoGateway());
    expect(giftButton(root)?.textContent).toBe("FREE");
    giftButton(root)?.click();
    expect(s.get().mycel).toBe(DAILY_GIFT.mycel);
    expect(s.get().pheromone).toBe(DAILY_GIFT.pheromone);
  });

  it("counts down instead of paying again", () => {
    const s = store();
    const root = build(s, new DemoGateway());
    giftButton(root)?.click();
    const btn = giftButton(root);
    expect(btn?.disabled).toBe(true);
    expect(btn?.textContent).toMatch(/^\d+h \d+m$/);
    btn?.click();
    expect(s.get().mycel, "the gift paid twice in one day").toBe(DAILY_GIFT.mycel);
  });
});
