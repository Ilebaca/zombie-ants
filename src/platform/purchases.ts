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
 * NOTE ON LARVA: the legacy build sells larva for the lucky hatch, which is not ported.
 * Nothing here sells a currency the game cannot spend — see SHOP_PRODUCTS.
 */
import type { SpeciesId } from "../engine";

/** What a product hands over when it completes. */
export interface Grant {
  mycel?: number;
  pheromone?: number;
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
 * Deliberately narrower than the legacy build's: it sells only what a player can actually
 * spend today — mycelium, pheromone, the Colony Pass and the one premium colony. Larva
 * packs and cosmetic rolls are left out rather than sold against a feature that does not
 * exist yet.
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
    ribbon: "BEST VALUE", ribbonClass: "best",
    grant: { mycel: 900, pheromone: 500 },
  },
  {
    id: "bundle.hoard", kind: "bundle", price: "€9.99", icon: "crown",
    title: "Queen's Hoard", sub: "The whole anthill",
    grant: { mycel: 2200, pheromone: 1200, pass: true },
  },

  // ---- mycelium --------------------------------------------------------------------
  { id: "mycel.220", kind: "currency", price: "€0.99", icon: "mycel", grant: { mycel: 220 } },
  { id: "mycel.650", kind: "currency", price: "€2.49", icon: "mycel", grant: { mycel: 650 } },
  {
    id: "mycel.1500", kind: "currency", price: "€4.99", icon: "mycel",
    ribbon: "MOST POPULAR", ribbonClass: "best", grant: { mycel: 1500 },
  },

  // ---- pheromone -------------------------------------------------------------------
  { id: "pher.130", kind: "currency", price: "€0.99", icon: "pheromone", grant: { pheromone: 130 } },
  { id: "pher.420", kind: "currency", price: "€2.99", icon: "pheromone", grant: { pheromone: 420 } },
  { id: "pher.1300", kind: "currency", price: "€4.99", icon: "pheromone", grant: { pheromone: 900 } },

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

export interface PurchaseGateway {
  /** False when real purchases cannot happen here — the shop says so rather than pretending. */
  readonly live: boolean;
  buy(productId: string): Promise<PurchaseResult>;
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
}
