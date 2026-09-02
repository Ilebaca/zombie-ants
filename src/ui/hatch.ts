/**
 * THE LUCKY HATCH.
 *
 * One egg in the middle of the screen, the larva you have above it, and a button under it.
 * That is deliberately the whole interface: the hatch does exactly one thing, and every
 * control that is not "hatch" is a control competing with it.
 *
 * It is the ONLY source of a trait (platform/traits.ts), which is what gives it a reason to
 * exist beyond handing out currency a player could have earned by playing. A match pays
 * mycelium and a colony; this pays the one thing there is no other way to get.
 *
 * THE MOMENT IS THE FEATURE. A roll that resolves instantly is a number changing, and a
 * collection nobody feels collecting is a spreadsheet. So the egg rocks, then the tier's
 * colour comes UP THROUGH IT before the trait is named — the colour is the answer, and it
 * arrives first, which is the whole reason the tiers have colours at all.
 */
import {
  HATCH_COST, TRAITS_CHAPTER, TRAIT_TIER, effectText, itemDef, markOf,
} from "../platform";
import type { ProfileStore, TraitItem } from "../platform";
import { el, screenEl, screenHeader } from "./chrome";
import { icon } from "./icons";

/** How long the egg rocks before it gives an answer. */
const SHAKE_MS = 900;

export interface HatchOptions {
  onBack: () => void;
  /** Straight to the larva shelf in the shop — the plus sign is not a general "go shopping". */
  onBuyLarva: () => void;
  /** Into the inventory, from the found trait. It is where the thing has just gone. */
  onInventory: () => void;
  /** Told after a hatch, so the drawer's counts and the screen behind can catch up. */
  onChanged?: () => void;
  /** Injected so a test is not a coin flip. */
  random?: () => number;
}

export function buildHatch(store: ProfileStore, opts: HatchOptions): HTMLElement {
  const root = screenEl("luckyhatch");
  /** What the last hatch produced, or null before the first one. */
  let found: TraitItem | null = null;
  /** True while the egg is rocking: the button must not be tapped twice into one animation. */
  let busy = false;

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, {
      title: "Lucky hatch",
      sub: "Where traits come from",
      onBack: opts.onBack,
      backId: "hatchBack",
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "hatchwrap");
    wrap.id = "hatchBody";

    // SHUT UNTIL TRAITS ARE, and that is not tidiness: larva buys traits and nothing
    // else, so a hatch open before the benches are would sell a player something they
    // cannot equip on any colony. A shop must never take money against a feature that
    // does not exist yet, and for this player it does not.
    if (!store.traitsOpen()) wrap.appendChild(shut());
    else wrap.append(purse(), stage(), foot());

    body.appendChild(wrap);
    root.appendChild(body);
  };

  /** The chapter, never a padlock: a number is something to play toward. */
  const shut = (): HTMLElement => {
    const box = el("div", "hatchshut");
    box.id = "hatchShut";
    const mark = el("div", "hatchegg locked");
    mark.appendChild(icon("lock", 60));
    box.append(
      mark,
      el("div", "hatchshut-h", `Opens at chapter ${TRAITS_CHAPTER}`),
      el("div", "hatchshut-p",
        "Larva hatch into traits, and traits are worn five at a time by each colony. "
        + "Both open together."),
    );
    return box;
  };

  /* ------------------------------------------------------------------- THE LARVA */

  /**
   * How many hatches you are holding, and the way to get more.
   *
   * Larva is shown HERE and nowhere else in the app: it buys exactly one thing, and a
   * number in the top bar that the top bar offers nothing to spend on is a question the
   * interface never answers.
   */
  const purse = (): HTMLElement => {
    const box = el("div", "hatchpurse");
    const mark = el("span", "hp-i");
    mark.appendChild(icon("brood", 20));
    const n = el("span", "hp-n", String(store.get().larva));
    n.id = "hatchLarva";

    const plus = el("button", "hp-plus") as HTMLButtonElement;
    plus.type = "button";
    plus.id = "hatchBuy";
    plus.setAttribute("aria-label", "Buy larva");
    plus.appendChild(icon("plus", 16));
    plus.onclick = opts.onBuyLarva;

    box.append(mark, n, el("span", "hp-k", "larva"), plus);
    return box;
  };

  /* --------------------------------------------------------------------- THE EGG */

  const stage = (): HTMLElement => {
    const box = el("div", "hatchstage");
    box.id = "hatchStage";

    if (found && !busy) {
      box.appendChild(prize(found));
      return box;
    }

    const egg = el("div", "hatchegg" + (busy ? " shaking" : ""));
    egg.id = "hatchEgg";
    egg.appendChild(icon("brood", 96));
    box.appendChild(egg);
    // Said once, under the egg, and only before the first hatch: after that the last
    // trait is standing there saying it better than a sentence could.
    if (!found && !busy) {
      box.appendChild(el("div", "hatchhint", "Every trait in the game is in here."));
    }
    return box;
  };

  /** What came out. The TIER is the loudest thing on it — that is what a hatch is for. */
  const prize = (item: TraitItem): HTMLElement => {
    const def = itemDef(item);
    const tier = TRAIT_TIER[item.tier];
    const box = el("div", "hatchprize");
    box.id = "hatchPrize";
    box.style.setProperty("--tier", tier.colour);

    const disc = el("div", "hp-disc");
    disc.appendChild(icon(def?.icon ?? "star", 54));

    const kind = el("div", "hp-eff");
    kind.appendChild(icon(def ? markOf(def.kind) : "spark", 13));
    kind.appendChild(el("span", undefined, def ? effectText(def, item.tier) : ""));

    box.append(
      disc,
      el("div", "hp-tier", tier.name),
      el("div", "hp-name", def?.name ?? "Trait"),
      kind,
    );
    // The trait has gone to the inventory, so the screen says where and offers the way.
    const go = el("button", "hp-go") as HTMLButtonElement;
    go.type = "button";
    go.id = "hatchToBag";
    go.append(el("span", undefined, "In your inventory"), icon("next", 13));
    go.onclick = opts.onInventory;
    box.appendChild(go);
    return box;
  };

  /* ------------------------------------------------------------------ THE BUTTON */

  const foot = (): HTMLElement => {
    const box = el("div", "hatchfoot");
    const larva = store.get().larva;
    const can = larva >= HATCH_COST;

    const btn = el("button", "hatchbtn" + (can ? "" : " out")) as HTMLButtonElement;
    btn.type = "button";
    btn.id = "hatchGo";
    btn.disabled = busy;
    // It never says "you cannot": it says what it costs, and the plus above is the answer.
    btn.append(
      el("span", "hb-t", busy ? "Hatching…" : "Hatch"),
      el("span", "hb-c", `${HATCH_COST} larva`),
    );
    btn.onclick = () => (can ? run() : opts.onBuyLarva());
    box.appendChild(btn);
    return box;
  };

  /**
   * Spend, roll, reveal.
   *
   * The spend and the roll are ONE call on the store (`hatch`), because those two must
   * never come apart — a hatch that spent and did not roll takes something for nothing.
   * What is here is only the drama: rock the egg, then show what was already decided.
   *
   * Re-entry is stopped by the BUTTON being disabled while the egg rocks, not by a flag
   * checked here as well — one mechanism, and the one a player can actually see.
   */
  const run = (): void => {
    const item = store.hatch(opts.random);
    if (!item) return;
    found = item;
    busy = true;
    render();
    window.setTimeout(() => {
      busy = false;
      render();
      opts.onChanged?.();
    }, SHAKE_MS);
  };

  render();
  return root;
}
