/**
 * THE SHOP, DRAWN TO THE DESIGN (Figma `Zombie Ants` → `06-07-shop 2`, node `134:158`).
 *
 * Sells only what the game can actually give: mycelium, pheromone, larva, the Colony Pass
 * and the one premium colony. Every sale goes through a `PurchaseGateway`
 * (platform/purchases.ts) — on the web that is the demo gateway, which grants without
 * charging and says so, so the screen never needs to know which gateway it is talking to.
 *
 * WHAT THE DESIGN CHANGED, and it is the same language home was given:
 * - A TILE IS A CARD on the shared `--hud-card` face, with the ledge and the gloss every
 *   other raised thing in the app wears, and a 70px PAINTING rather than a 26px glyph on
 *   a plate. The picture is the product (`ui/shelf.ts`), which is what makes a shelf read
 *   as goods instead of as a row of list rows.
 * - THE PRICE IS A GREEN BUTTON, the one bright colour on the screen, so what is for sale
 *   and what it costs are the same object.
 * - A SECTION IS ONE SMALL LABEL. It was a rule-line-title-rule header plus a grey
 *   subtitle under it — three elements and two lines for a word, repeated six times down
 *   a scroller. The label names the shelf and the shelf shows the rest.
 * - THE ORDER IS THE DESIGN'S: the gift, then larva with the odds panel directly under it
 *   (the panel is a disclosure about what a larva buys, so it belongs against the row that
 *   sells one, §LOOT BOX ODDS), then pheromone, mycelium, the bundles and the unlocks.
 * - NO BACK ARROW AND NO SUBTITLE. The shop is a deck screen reached by a tab, the way
 *   Challenges is — and Challenges has never drawn one. An arrow on a screen the bar is
 *   standing under is a second way out of a page nobody is deep inside.
 *
 * The hooks the rest of the app holds it by are unchanged: `.shopwrap` (the tour),
 * `.stile` and `.buybar` (the tests), `#shopLarva` (the hatch's plus sign) and
 * `#shopRestore` (the store-policy test).
 */
import { DAILY_GIFT, SHOP_PRODUCTS } from "../platform";
import type { ProfileStore, Product, PurchaseGateway } from "../platform";
import { el, hudMark, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";
import { buildOdds } from "./odds";
import { shelfArt } from "./shelf";
import { resourceRewards, showRewardReveal } from "./reward-reveal";

/** The design's sizes, in its own numbers: a shelf's painting and the gift's. */
const ART = 70;
const GIFT_ART = 62;

/**
 * A product's picture.
 *
 * The painted shelf if there is one, else the currency's own chrome mark — which is
 * painted too, so the fallback is a smaller version of the right thing rather than a
 * placeholder (§ ui/shelf.ts).
 */
function art(product: { id: string; icon: string }, size = ART): HTMLElement {
  const painted = shelfArt(product.id);
  if (!painted) {
    const mark = hudMark(product.icon, size);
    mark.classList.add("sh-art");
    return mark as HTMLElement;
  }
  const img = el("img", "sh-art") as HTMLImageElement;
  img.src = painted;
  img.alt = "";
  img.width = size;
  img.height = size;
  return img;
}

export function buildShop(
  store: ProfileStore, gateway: PurchaseGateway,
): HTMLElement {
  const root = screenEl("shop");
  /** Guards against a second tap while a purchase is in flight. */
  let busy = false;

  const render = (): void => {
    redraw(root);
    // Title only: no subtitle and no arrow (see the note at the head of this file).
    screenHeader(root, { title: "Shop" });

    const body = el("div", "screenbody shopbody");
    body.id = "shopBody";
    const wrap = el("div", "shopwrap");

    // A live gateway takes real money; the demo one does not. Saying which is showing is
    // the difference between a placeholder and a lie.
    if (!gateway.live) {
      const note = el("div", "passnote");
      note.appendChild(icon("flask", 15));
      note.append(
        el("span", undefined, "Test shop — purchases are granted instantly and nothing is charged."));
      wrap.appendChild(note);
    }

    wrap.appendChild(dailyGift());

    /*
     * LARVA LEADS, AND THE ODDS SIT DIRECTLY UNDER IT.
     *
     * Google Play and Apple say the same thing in almost the same words: an app offering a
     * mechanism that provides randomised virtual items for purchase must disclose the odds
     * of each outcome PRIOR TO PURCHASE. They used to be printed on the hatch, which is
     * where a player ROLLS — and the purchase is here. The design puts the panel against
     * the row that sells the roll, which is the requirement drawn rather than merely met.
     *
     * The id is on the LABEL, not on the tiles, because the hatch's plus sign scrolls
     * here: what should come into view is the shelf, not the middle of it.
     */
    const larva = label("Larva");
    larva.id = "shopLarva";
    wrap.append(larva, row(byKind("currency", "brood")));
    wrap.appendChild(buildOdds("What a larva can hatch"));

    wrap.append(label("Pheromone crystal"), row(byKind("currency", "pheromone")));
    wrap.append(label("Mycelium"), row(byKind("currency", "mycel")));
    wrap.append(label("Bundles"), row(byKind("bundle")));
    wrap.append(label("Unlocks"), row([...byKind("pass"), ...byKind("species")]));
    wrap.appendChild(restoreRow());

    body.appendChild(wrap);
    root.appendChild(body);
  };

  /**
   * A SHELF'S NAME, and nothing else.
   *
   * It was a `sechead` — a rule, a heading and a second rule — with a `secsub` grey line
   * under it: three elements and two lines of chrome for one word, six times down one
   * scroller. The design asks for a label, and the tiles under it say the rest.
   */
  const label = (title: string): HTMLElement => el("div", "sh-label", title);

  const byKind = (kind: Product["kind"], icon?: string): Product[] =>
    SHOP_PRODUCTS.filter((p) => p.kind === kind && (!icon || p.icon === icon));

  /**
   * A SHELF: three tiles across, or two where that is what the shelf holds.
   *
   * `two` is the Unlocks row in the design — a wider card carrying a title AND a line of
   * copy, which is why it is a different shape rather than a three-column row with a hole.
   */
  const row = (products: Product[]): HTMLElement => {
    const box = el("div", "tilerow" + (products.length === 2 ? " two" : ""));
    for (const p of products) box.appendChild(tile(p));
    return box;
  };

  const tile = (product: Product): HTMLElement => {
    const owned = isOwned(product);
    const cell = el("div", "stile" + (product.kind === "pass" ? " pass-product" : ""));
    cell.dataset.product = product.id;
    if (product.ribbon) {
      cell.appendChild(el("span", `ribbon ${product.ribbonClass ?? ""}`.trim(), product.ribbon));
    }

    cell.appendChild(art(product));

    // WHAT IT IS, in one line. A currency tile says the AMOUNT, because that is the whole
    // of what it sells; a pass or a colony says its name and then what it does.
    const amount = (product.grant.mycel ?? 0) + (product.grant.pheromone ?? 0)
      + (product.grant.larva ?? 0);
    cell.appendChild(el("span", "sh-name",
      product.kind === "currency" ? amount.toLocaleString() : product.title ?? ""));
    if (product.kind !== "currency" && product.sub) {
      cell.appendChild(el("span", "sh-sub", product.sub));
    }

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
        const rewards = resourceRewards(result.grant ?? {});
        if (result.grant?.species) rewards.push({ kind: "species", species: result.grant.species });
        if (rewards.length) {
          showRewardReveal(root, rewards, () => {
            if (result.note) toast(root, result.note, "warn");
          });
        } else {
          toast(root, describe(product), "hive");
          if (result.note) toast(root, result.note, "warn");
        }
      })
      .catch(() => toast(root, "The store could not be reached.", "bad"))
      .finally(() => { busy = false; });
  };

  /**
   * PUT BACK WHAT WAS ALREADY BOUGHT — and Apple requires the button in so many words:
   * "you should make sure you have a restore mechanism for any restorable in-app purchases".
   *
   * It sits under Unlocks because those are the two things it can restore. It says so, too:
   * currency is consumable and is spent, no store hands it back, and a button that implied
   * otherwise would be the shop promising something it cannot do.
   *
   * It matters here more than in most games. A colony lives in `localStorage` on one device
   * (platform/backup.ts), so a player who reinstalls has genuinely paid for something the
   * game can no longer see — and without this their only route out is a support email.
   */
  const restoreRow = (): HTMLElement => {
    const box = el("div", "restorerow");
    const go = el("button", "restorebtn") as HTMLButtonElement;
    go.type = "button";
    go.id = "shopRestore";
    go.append(icon("granary", 15), el("span", undefined, "Restore purchases"));
    go.onclick = () => restore(go);
    box.append(go, el("div", "restorenote",
      "Brings back the Colony Pass and any colony you have bought. Mycelium, pheromone crystals and "
      + "larva are spent as you use them and cannot be restored."));
    return box;
  };

  const restore = (btn: HTMLButtonElement): void => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    void gateway.restore()
      .then((result) => {
        // A restore that found nothing is not a failure — it is the commonest answer, and
        // the note the gateway wrote is the honest thing to show.
        if (!result.ok || !result.grant) {
          toast(root, result.note ?? "Nothing to restore.", "warn");
          return;
        }
        store.applyGrant(result.grant);
        render();
        toast(root, "Your purchases are back.", "hive");
      })
      .catch(() => toast(root, "The store could not be reached.", "bad"))
      .finally(() => { busy = false; btn.disabled = false; });
  };

  /**
   * THE GIFT IS ONE WIDE CARD: the chest, what it pays, and the button.
   *
   * The amounts are the two currencies' own painted marks beside their figures, which is
   * the same pair the top bar carries — a reward stated in the marks a player already
   * reads everywhere else, rather than in words only this screen uses.
   */
  const dailyGift = (): HTMLElement => {
    const ready = store.dailyGiftReady();
    const cell = el("div", "stile sh-gift");
    cell.appendChild(art({ id: "daily.gift", icon: "gift" }, GIFT_ART));

    const mid = el("div", "sh-giftmid");
    const amounts = el("div", "sh-amounts");
    for (const [mark, n] of [["pheromone", DAILY_GIFT.pheromone], ["mycel", DAILY_GIFT.mycel]] as const) {
      const one = el("span", "sh-amt");
      one.append(hudMark(mark, 26), el("b", undefined, String(n)));
      amounts.appendChild(one);
    }

    const btn = el("button", "buybar " + (ready ? "free" : "off"), ready ? "FREE" : hoursLeft());
    /*
     * AND THE BUTTON IS WHAT NAMES IT. The design's card is a chest, two amounts and the
     * word FREE — no title anywhere on it, which is right on the glass (a chest beside two
     * currency marks is not ambiguous) and leaves the one CONTROL saying "FREE" and
     * nothing else. `title`/`aria-label` carry the name, which is the rule every other
     * unlabelled mark in this app follows (§ EVERY CONTROL SAYS WHAT IT IS) — and it is
     * the hook the test holds the card by, now that no text does.
     */
    btn.title = "Daily gift";
    btn.setAttribute("aria-label", "Daily gift");
    btn.disabled = !ready;
    if (ready) {
      btn.onclick = () => {
        if (store.claimDailyGift()) {
          render();
          showRewardReveal(root, resourceRewards(DAILY_GIFT));
        }
      };
    }
    mid.append(amounts, btn);
    cell.appendChild(mid);
    return cell;
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

/**
 * What the player just received, in the words the toast uses.
 *
 * Named, not glyphed. The two currencies were a mushroom and a test tube typed into the
 * string — and a toast is one line of text with no room to teach what a glyph means
 * (PROJECT_GUIDE.md §10: currency in words, not glyphs).
 */
function describe(product: Product): string {
  const parts = [
    product.grant.mycel ? `+${product.grant.mycel} mycelium` : "",
    product.grant.pheromone ? `+${product.grant.pheromone} pheromone crystals` : "",
    product.grant.larva ? `+${product.grant.larva} larva` : "",
    product.grant.pass ? "Colony Pass unlocked" : "",
    product.grant.species ? `${product.title ?? "Colony"} unlocked` : "",
  ].filter(Boolean);
  return parts.join("  ");
}
