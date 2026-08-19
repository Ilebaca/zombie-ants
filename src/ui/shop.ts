/**
 * The shop.
 *
 * Sells only what the game can actually give: mycelium, pheromone, the Trophy Pass and the
 * one premium colony. The legacy build also sells larva and cosmetic rolls; neither the
 * lucky hatch nor the cosmetics pool is ported, so those tiles are not here rather than
 * taking money against a feature that does not exist.
 *
 * Every sale goes through a PurchaseGateway (platform/purchases.ts). On the web that is the
 * demo gateway, which grants without charging and says so — the screen never needs to know
 * which gateway it is talking to.
 *
 * Markup is the legacy build's (shopwrap → sechead → tilerow → stile → buybar).
 */
import { DAILY_GIFT, SHOP_PRODUCTS } from "../platform";
import type { ProfileStore, Product, PurchaseGateway } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";

export function buildShop(
  store: ProfileStore, gateway: PurchaseGateway, onBack: () => void,
): HTMLElement {
  const root = screenEl("shop");
  /** Guards against a second tap while a purchase is in flight. */
  let busy = false;

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, { title: "Shop", sub: "Bundles, currency & the pass", onBack });

    const body = el("div", "screenbody shopbody");
    body.id = "shopBody";
    const wrap = el("div", "shopwrap");

    // A live gateway takes real money; the demo one does not. Saying which is showing is
    // the difference between a placeholder and a lie.
    if (!gateway.live) {
      const note = el("div", "passnote");
      note.append(el("span", undefined, "🧪"),
        el("span", undefined, "Test shop — purchases are granted instantly and nothing is charged."));
      wrap.appendChild(note);
    }

    wrap.appendChild(dailyGift());

    wrap.append(...section("Bundles"), row(byKind("bundle")));
    wrap.append(...section("Mycelium", "Chambers, research and colonies"), row(byKind("currency", "🍄")));
    wrap.append(...section("Pheromone dust", "Spent in the shop and on the road"), row(byKind("currency", "🧪")));
    wrap.append(...section("Unlocks"), row([...byKind("pass"), ...byKind("species")]));

    body.appendChild(wrap);
    root.appendChild(body);
  };

  const section = (title: string, sub?: string): HTMLElement[] => {
    const head = el("div", "sechead");
    head.append(el("span", "l"), el("h3", undefined, title), el("span", "l"));
    return sub ? [head, el("div", "secsub", sub)] : [head];
  };

  const byKind = (kind: Product["kind"], icon?: string): Product[] =>
    SHOP_PRODUCTS.filter((p) => p.kind === kind && (!icon || p.icon === icon));

  const row = (products: Product[]): HTMLElement => {
    const box = el("div", "tilerow" + (products.length === 2 ? " two" : ""));
    for (const p of products) box.appendChild(tile(p));
    return box;
  };

  const tile = (product: Product): HTMLElement => {
    const owned = isOwned(product);
    const cell = el("div", "stile");
    if (product.ribbon) {
      cell.appendChild(el("span", `ribbon ${product.ribbonClass ?? ""}`.trim(), product.ribbon));
    }

    const art = el("div", "art");
    art.appendChild(el("span", "ic", product.icon));
    const amount = (product.grant.mycel ?? 0) + (product.grant.pheromone ?? 0);
    if (product.kind === "currency") {
      art.appendChild(el("span", "amt", amount.toLocaleString()));
    } else {
      art.append(
        el("span", "amt", product.title ?? ""),
        el("span", "sub", product.sub ?? ""),
      );
    }
    cell.appendChild(art);

    const buy = el("button", "buybar" + (owned ? " off" : ""), owned ? "Owned" : product.price);
    buy.disabled = owned;
    if (!owned) buy.onclick = () => purchase(product);
    cell.appendChild(buy);
    return cell;
  };

  /** A pass or a colony you already hold is not for sale twice. */
  const isOwned = (product: Product): boolean => {
    const profile = store.get();
    if (product.grant.pass && product.kind === "pass") return profile.pass;
    if (product.grant.species) return profile.unlocked.includes(product.grant.species);
    return false;
  };

  const purchase = (product: Product): void => {
    if (busy) return;
    busy = true;
    void gateway.buy(product.id)
      .then((result) => {
        if (!result.ok) {
          toast(root, result.note ?? "That purchase did not go through.", "bad");
          return;
        }
        if (result.grant) store.applyGrant(result.grant);
        render();
        toast(root, describe(product), "hive");
        if (result.note) toast(root, result.note, "warn");
      })
      .catch(() => toast(root, "The store could not be reached.", "bad"))
      .finally(() => { busy = false; });
  };

  const dailyGift = (): HTMLElement => {
    const ready = store.dailyGiftReady();
    const cell = el("div", "stile");
    const art = el("div", "art");
    art.append(
      el("span", "ic", "🎁"),
      el("span", "amt", `${DAILY_GIFT.mycel} 🍄 + ${DAILY_GIFT.pheromone} 🧪`),
      el("span", "sub", "Daily gift"),
    );
    cell.appendChild(art);

    const btn = el("button", "buybar " + (ready ? "free" : "off"), ready ? "FREE" : hoursLeft());
    btn.disabled = !ready;
    if (ready) {
      btn.onclick = () => {
        if (store.claimDailyGift()) {
          render();
          toast(root, `Daily gift: +${DAILY_GIFT.mycel} 🍄  +${DAILY_GIFT.pheromone} 🧪`, "good");
        }
      };
    }
    cell.appendChild(btn);

    // On its own row, full width: a half-width tile with nothing beside it reads as a gap.
    const solo = el("div", "tilerow");
    solo.style.gridTemplateColumns = "1fr";
    solo.appendChild(cell);
    return solo;
  };

  const hoursLeft = (): string => {
    const ms = 864e5 - (Date.now() - store.get().freeAt);
    const h = Math.max(0, Math.floor(ms / 36e5));
    const m = Math.max(0, Math.floor((ms % 36e5) / 6e4));
    return `${h}h ${m}m`;
  };

  render();
  return root;
}

/** What the player just received, in the words the toast uses. */
function describe(product: Product): string {
  const parts = [
    product.grant.mycel ? `+${product.grant.mycel} 🍄` : "",
    product.grant.pheromone ? `+${product.grant.pheromone} 🧪` : "",
    product.grant.pass ? "Trophy Pass unlocked" : "",
    product.grant.species ? `${product.title ?? "Colony"} unlocked` : "",
  ].filter(Boolean);
  return parts.join("  ");
}
