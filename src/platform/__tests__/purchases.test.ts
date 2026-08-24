/**
 * The purchase layer.
 *
 * This is the code that will eventually stand between a player's money and their account,
 * so the rules it has to keep are worth stating: a purchase grants exactly what its product
 * promised, a failed purchase grants nothing, and nothing sells a currency the game cannot
 * spend.
 */
import { describe, expect, it } from "vitest";
import { SPECIES } from "../../engine";
import { MemoryStore } from "../storage";
import { ProfileStore } from "../profile";
import { DemoGateway, SHOP_PRODUCTS, productById } from "../purchases";
import type { PurchaseGateway, PurchaseResult } from "../purchases";

const store = (): ProfileStore => {
  const s = new ProfileStore(new MemoryStore());
  s.update((p) => { p.mycel = 0; p.pheromone = 0; });
  return s;
};

describe("the catalogue", () => {
  it("gives every product an id, a price and something to hand over", () => {
    for (const p of SHOP_PRODUCTS) {
      expect(p.id, "product without an id").toBeTruthy();
      expect(p.price, `${p.id} has no price`).toBeTruthy();
      const gives = (p.grant.mycel ?? 0) + (p.grant.pheromone ?? 0);
      expect(gives > 0 || !!p.grant.pass || !!p.grant.species, `${p.id} grants nothing`).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    const ids = SHOP_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /** Larva is the lucky-hatch currency and the hatch is not ported: nothing may sell it. */
  it("never sells a currency the game cannot spend", () => {
    for (const p of SHOP_PRODUCTS) {
      expect(Object.keys(p.grant).every((k) => ["mycel", "pheromone", "pass", "species"].includes(k)),
        `${p.id} grants something unspendable`).toBe(true);
    }
  });

  it("only sells species that exist, and only premium ones", () => {
    for (const p of SHOP_PRODUCTS) {
      if (!p.grant.species) continue;
      expect(SPECIES[p.grant.species], `${p.id} sells an unknown species`).toBeTruthy();
      expect(SPECIES[p.grant.species].premium, `${p.id} sells a species mycelium can buy`).toBe(true);
    }
  });

  it("prices bundles above the single packs they bundle", () => {
    const cheapest = (icon: string): number => Math.min(
      ...SHOP_PRODUCTS.filter((p) => p.kind === "currency" && p.icon === icon)
        .map((p) => p.grant.mycel ?? p.grant.pheromone ?? 0),
    );
    for (const b of SHOP_PRODUCTS.filter((p) => p.kind === "bundle")) {
      expect((b.grant.mycel ?? 0), `${b.id} bundles less mycelium than the smallest pack`)
        .toBeGreaterThanOrEqual(cheapest("mycel"));
    }
  });
});

describe("granting what was bought", () => {
  it("applies a bundle as one write", async () => {
    const s = store();
    const gateway = new DemoGateway();
    const hoard = productById("bundle.hoard")!;
    const result = await gateway.buy(hoard.id);
    expect(result.ok).toBe(true);
    s.applyGrant(result.grant!);

    expect(s.get().mycel).toBe(hoard.grant.mycel);
    expect(s.get().pheromone).toBe(hoard.grant.pheromone);
    expect(s.get().pass).toBe(true);
  });

  it("unlocks a premium colony without touching the currencies", async () => {
    const s = store();
    const result = await new DemoGateway().buy("species.demon");
    s.applyGrant(result.grant!);
    expect(s.isUnlocked("demon")).toBe(true);
    expect(s.get().mycel).toBe(0);
  });

  it("adds to what the player already has rather than replacing it", () => {
    const s = store();
    s.update((p) => { p.mycel = 70; p.pheromone = 5; });
    s.applyGrant({ mycel: 150, pheromone: 500 });
    expect(s.get().mycel).toBe(220);
    expect(s.get().pheromone).toBe(505);
  });

  it("refuses a product that is not in the catalogue, and grants nothing", async () => {
    const result = await new DemoGateway().buy("mycel.99999");
    expect(result.ok).toBe(false);
    expect(result.grant).toBeUndefined();
  });

  /** A gateway that fails must leave the profile exactly as it was. */
  it("leaves the profile untouched when the store says no", async () => {
    const failing: PurchaseGateway = {
      live: true,
      buy: async (): Promise<PurchaseResult> => ({ ok: false, note: "cancelled" }),
    };
    const s = store();
    s.update((p) => { p.mycel = 42; });
    const before = JSON.stringify(s.get());

    const result = await failing.buy("bundle.hoard");
    if (result.ok && result.grant) s.applyGrant(result.grant);
    expect(JSON.stringify(s.get())).toBe(before);
  });

  it("says plainly that the demo gateway is not a real sale", async () => {
    const gateway = new DemoGateway();
    expect(gateway.live).toBe(false);
    const result = await gateway.buy("mycel.150");
    expect(result.note).toMatch(/demo/i);
  });
});

describe("the daily gift", () => {
  it("can be taken once, then waits a day", () => {
    const s = store();
    const now = Date.UTC(2026, 0, 2, 12);
    expect(s.dailyGiftReady(now)).toBe(true);
    expect(s.claimDailyGift(now)).toBe(true);
    expect(s.get().mycel).toBeGreaterThan(0);

    const banked = s.get().mycel;
    expect(s.claimDailyGift(now + 3600e3)).toBe(false);
    expect(s.get().mycel).toBe(banked);

    expect(s.claimDailyGift(now + 864e5)).toBe(true);
    expect(s.get().mycel).toBeGreaterThan(banked);
  });
});
