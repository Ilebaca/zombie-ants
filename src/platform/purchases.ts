/**
 * The purchase layer.
 *
 * Everything the shop can sell is described here as data, and every sale goes through a
 * `PurchaseGateway`. There are two implementations in play:
 *
 *   DemoGateway  — grants immediately, takes no money. What the web build runs, and what
 *                  makes the whole flow testable today.
 *   (later)      — RevenueCat, inside the Capacitor build. It implements this same
 *                  interface, so the shop screen and the grant code never change.
 *
 * The split matters: the shop UI must never know whether money changed hands. It asks the
 * gateway to buy a product id and applies whatever the result says was granted.
 *
 * LARVA IS SOLD NOW. It was left out for as long as the lucky hatch did not exist, because
 * nothing here may sell a currency the game cannot spend. The hatch is built, larva is what
 * feeds it, and it is the only thing larva buys.
 */
import type { SpeciesId } from "../engine";

/** What a product hands over when it completes. */
export interface Grant {
  mycel?: number;
  pheromone?: number;
  /** Hatches, one each. */
  larva?: number;
  /** Unlocks the Colony Road's pass track. */
  pass?: boolean;
  species?: SpeciesId;
}

export type ProductKind = "currency" | "bundle" | "pass" | "species";

export interface Product {
  id: string;
  kind: ProductKind;
  /**
   * Shown on the tile. Real prices come from the store at runtime once IAP is live.
   *
   * THE ID NAMES THE GRANT, and it has to stay that way: these ids are the SKUs that get
   * created in the Play Console, so `mycel.150` granting two hundred and twenty is a trap
   * waiting for whoever wires the real store up. The amounts here are priced against what
   * a player earns free — around seventy mycelium and fifty pheromone a day — so a euro
   * buys a few days and the largest bundle buys a couple of months, and no single purchase
   * is more than a fifth of everything in the game.
   */
  price: string;
  /** Icon and headline for the tile. */
  icon: string;
  title?: string;
  sub?: string;
  /** Ribbon across the corner, e.g. "MOST POPULAR". */
  ribbon?: string;
  ribbonClass?: string;
  grant: Grant;
}

/**
 * The catalogue.
 *
 * It sells only what a player can actually spend: mycelium, pheromone, larva, the Colony
 * Pass and the one premium colony. Cosmetic rolls are still left out rather than sold
 * against a feature that does not exist.
 */
export const SHOP_PRODUCTS: readonly Product[] = [
  // ---- headline bundles ------------------------------------------------------------
  {
    id: "bundle.starter", kind: "bundle", price: "€1.99", icon: "gift",
    title: "Colony Starter", sub: "A running start",
    grant: { mycel: 260, pheromone: 150 },
  },
  {
    id: "bundle.brood", kind: "bundle", price: "€4.99", icon: "brood",
    title: "Brood Bundle", sub: "Chambers & research",
    grant: { mycel: 900, pheromone: 500 },
  },
  {
    id: "bundle.hoard", kind: "bundle", price: "€9.99", icon: "crown",
    title: "Queen's Hoard", sub: "The whole anthill",
    // ON THE TILE THAT REALLY IS THE BEST VALUE. It sat on the Brood Bundle, which is 281
    // units per euro against this one's 340 — with the Colony Pass on top. The label was
    // simply false, and a false claim on a price is the kind both stores act on.
    // `purchases.test.ts` recomputes it now rather than trusting the table.
    ribbon: "BEST VALUE", ribbonClass: "best",
    grant: { mycel: 2200, pheromone: 1200, pass: true },
  },

  // ---- mycelium --------------------------------------------------------------------
  { id: "mycel.220", kind: "currency", price: "€0.99", icon: "mycel", grant: { mycel: 220 } },
  { id: "mycel.650", kind: "currency", price: "€2.49", icon: "mycel", grant: { mycel: 650 } },
  {
    id: "mycel.1500", kind: "currency", price: "€4.99", icon: "mycel",
    // NOT "MOST POPULAR", WHICH THIS GAME CANNOT KNOW. Nobody else is playing it — the
    // ladder and the friends list are generated on the device — so a popularity claim was
    // not merely unmeasured, it was about a population that does not exist. What is left
    // is arithmetic anybody can check: 301 mycelium per euro against 261 and 222.
    ribbon: "BEST VALUE", ribbonClass: "best", grant: { mycel: 1500 },
  },

  // ---- pheromone -------------------------------------------------------------------
  { id: "pher.130", kind: "currency", price: "€0.99", icon: "pheromone", grant: { pheromone: 130 } },
  { id: "pher.420", kind: "currency", price: "€2.99", icon: "pheromone", grant: { pheromone: 420 } },
  // `pher.900`, not `pher.1300`: the id said 1300 and the grant was 900. The ids are the
  // Play Console SKUs and are named for what they hand over precisely so nobody wiring up
  // the real store has to check — which is worth nothing if one of them lies.
  { id: "pher.900", kind: "currency", price: "€4.99", icon: "pheromone", grant: { pheromone: 900 } },

  // ---- larva -----------------------------------------------------------------------
  // Priced so a hatch is a real decision rather than a habit: a single is about the cost
  // of a day's free mycelium, and the pack is where the value is — which is how a bundle
  // is meant to read. Nothing else in the game grants larva, so this is the whole faucet
  // and its price is the whole of the hatch's pacing.
  { id: "larva.3", kind: "currency", price: "€0.99", icon: "brood", grant: { larva: 3 } },
  // No ribbon on this row on purpose: "MOST POPULAR" is already on the mycelium tile and
  // "BEST VALUE" on a bundle, and the same claim made twice in one shop is a claim.
  { id: "larva.10", kind: "currency", price: "€2.99", icon: "brood", grant: { larva: 10 } },
  { id: "larva.25", kind: "currency", price: "€5.99", icon: "brood", grant: { larva: 25 } },

  // ---- the things that are not currency ---------------------------------------------
  {
    id: "pass.trophy", kind: "pass", price: "€3.99", icon: "star",
    title: "Colony Pass", sub: "The road's second track",
    grant: { pass: true },
  },
  {
    id: "species.demon", kind: "species", price: "€2.99", icon: "flag",
    title: "Demon Ant", sub: "The premium colony",
    grant: { species: "demon" },
  },
];

export const productById = (id: string): Product | undefined =>
  SHOP_PRODUCTS.find((p) => p.id === id);

export interface PurchaseResult {
  ok: boolean;
  /** What to hand the player. Empty when the purchase failed or was cancelled. */
  grant?: Grant;
  /** Shown to the player when something went wrong, or when it was not a real sale. */
  note?: string;
}

/** What a restore found: the non-consumables this account has already paid for. */
export interface RestoreResult {
  ok: boolean;
  /** Everything owned, merged. Empty when nothing was found or the restore failed. */
  grant?: Grant;
  note?: string;
}

export interface PurchaseGateway {
  /** False when real purchases cannot happen here — the shop says so rather than pretending. */
  readonly live: boolean;
  buy(productId: string): Promise<PurchaseResult>;
  /**
   * PUT BACK WHAT WAS ALREADY BOUGHT, AND APPLE REQUIRES IT IN SO MANY WORDS: "you should
   * make sure you have a restore mechanism for any restorable in-app purchases".
   *
   * It applies to the NON-CONSUMABLES — the Colony Pass and the premium colony. Currency is
   * consumable and is spent, so it is not restorable and no store will hand it back; a
   * button claiming otherwise would be the shop lying about what it can do.
   *
   * It matters here more than in most games, because a colony lives in `localStorage` on
   * one device (platform/backup.ts). A player who reinstalls, or whose browser bins the
   * save, has genuinely paid for something the game can no longer see — and without this
   * their only route is a support email.
   */
  restore(): Promise<RestoreResult>;
}

/**
 * The stand-in: hands over the goods without taking payment.
 *
 * This is what the web build uses, and what the shop is developed and tested against. It
 * reports `live: false` so the screen can label itself honestly.
 */
export class DemoGateway implements PurchaseGateway {
  readonly live = false;

  async buy(productId: string): Promise<PurchaseResult> {
    const product = productById(productId);
    if (!product) return { ok: false, note: "That product is not in the catalogue." };
    return { ok: true, grant: product.grant, note: "Demo purchase — no payment was taken." };
  }

  /**
   * Nothing to restore, and it SAYS so rather than pretending to have looked.
   *
   * There is no store behind this gateway, so there is no record of a purchase anywhere to
   * find. A demo restore that quietly handed over the pass would be the one thing a restore
   * button must never do — give away what somebody else paid for.
   */
  async restore(): Promise<RestoreResult> {
    return { ok: false, note: "No purchases to restore — nothing has been charged here." };
  }
}

/**
 * THE NON-CONSUMABLES, which is what a restore is ever about.
 *
 * Derived from the catalogue rather than listed, so a second premium unlock added to
 * `SHOP_PRODUCTS` is restorable the day it ships instead of the day somebody remembers.
 */
export const RESTORABLE: readonly Product[] =
  SHOP_PRODUCTS.filter((p) => p.kind === "pass" || p.kind === "species");
