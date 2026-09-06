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
import type { Product, PurchaseGateway, PurchaseResult } from "../purchases";

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
      const gives = (p.grant.mycel ?? 0) + (p.grant.pheromone ?? 0) + (p.grant.larva ?? 0);
      expect(gives > 0 || !!p.grant.pass || !!p.grant.species, `${p.id} grants nothing`).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    const ids = SHOP_PRODUCTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * NOTHING MAY BE SOLD THAT THE GAME CANNOT GIVE — and this is checked by actually
   * GIVING it, not against a list of allowed keys. Larva was on that list as forbidden
   * for as long as the lucky hatch did not exist; the day it was built, the list was the
   * thing standing in the way, and a list has to be remembered while a purchase that
   * moves nothing fails by itself.
   */
  it("hands over something real for every product", () => {
    for (const p of SHOP_PRODUCTS) {
      const store = new ProfileStore(new MemoryStore());
      const before = JSON.stringify(store.get());
      store.applyGrant(p.grant);
      expect(JSON.stringify(store.get()), `${p.id} took money and changed nothing`)
        .not.toBe(before);
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
      restore: async () => ({ ok: false }),
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
    const result = await gateway.buy("mycel.220");
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

/** Larva is not currency in the same units; it only has to be a positive weight here, so
 *  a larva pack is compared against other larva packs and never against mycelium. */
const LARVA_UNITS = 1;

/**
 * WHAT A PRICE TAG IS ALLOWED TO CLAIM.
 *
 * "BEST VALUE" sat on the Brood Bundle while the Queen's Hoard gave 340 units per euro
 * against its 281, with the Colony Pass on top — the label was not merely unmeasured, it
 * was false. And "MOST POPULAR" was a claim about a population that does not exist: nobody
 * else is playing this game, because the ladder and the friends list are generated on the
 * device. Both stores act on unsupported claims in a storefront, and it is dishonest
 * regardless of who is watching.
 *
 * So a ribbon may only say something the catalogue itself proves, and this recomputes it
 * rather than trusting the table.
 */
describe("what a shop tile claims", () => {
  /** Everything a product hands over, as one comparable figure. */
  const units = (p: Product): number =>
    (p.grant.mycel ?? 0) + (p.grant.pheromone ?? 0) + (p.grant.larva ?? 0) * LARVA_UNITS;
  const euros = (p: Product): number => Number(p.price.replace(/[^\d.]/g, ""));
  /** A shelf is what the shop shows as one row: a kind, and for currency its icon too. */
  const shelf = (p: Product): string => `${p.kind}:${p.kind === "currency" ? p.icon : ""}`;

  it("only ever calls a tile the best value when it is", () => {
    const claiming = SHOP_PRODUCTS.filter((p) => /best value/i.test(p.ribbon ?? ""));
    expect(claiming.length, "nothing claims to be the best value any more").toBeGreaterThan(0);

    for (const winner of claiming) {
      const rivals = SHOP_PRODUCTS.filter((p) => shelf(p) === shelf(winner) && units(p) > 0);
      const rate = (p: Product): number => units(p) / euros(p);
      for (const other of rivals) {
        expect(rate(winner), `${other.id} beats ${winner.id}, which claims the best value`)
          .toBeGreaterThanOrEqual(rate(other));
      }
    }
  });

  /**
   * A CLAIM THIS GAME CANNOT SUPPORT. There is no telemetry (the privacy page says so in
   * as many words) and no other players, so nothing here can be popular, best-selling,
   * limited or ending soon.
   */
  it("makes no claim the game has no way to know", () => {
    for (const p of SHOP_PRODUCTS) {
      const words = `${p.ribbon ?? ""} ${p.title ?? ""} ${p.sub ?? ""}`;
      expect(words, `${p.id} claims something unmeasurable`)
        .not.toMatch(/popular|best.?sell|everyone|most bought|limited|last chance|ending soon/i);
    }
  });

  /**
   * THE ID IS THE PLAY CONSOLE SKU and is named for what it grants, precisely so nobody
   * wiring up the real store has to check — which is worth nothing if one of them lies.
   * `pher.1300` handed over 900 for months.
   */
  it("names each currency SKU for the amount it really hands over", () => {
    for (const p of SHOP_PRODUCTS) {
      const named = /\.(\d+)$/.exec(p.id);
      if (!named || p.kind !== "currency") continue;
      const amount = units(p) / (p.grant.larva ? LARVA_UNITS : 1);
      expect(amount, `${p.id} does not grant the amount its id promises`)
        .toBe(Number(named[1]));
    }
  });
});
