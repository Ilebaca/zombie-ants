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
  HATCH_COST, LARVA_MYCEL, SKIN_TIERS, TRAITS_CHAPTER, TRAIT_TIER, TRAIT_TIERS, effectText,
  itemDef, markOf, tierOdds,
} from "../platform";
import type { HatchPrize, ProfileStore, TraitItem } from "../platform";
import { SPECIES, TIERS } from "../engine";
import type { Look } from "../engine";
import { antPortrait, el, screenEl, screenHeader } from "./chrome";
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
  /** Into the colony a found skin belongs to — that is where it is worn from. */
  onColony?: (species: string) => void;
  /** Injected so a test is not a coin flip. */
  random?: () => number;
}

export function buildHatch(store: ProfileStore, opts: HatchOptions): HTMLElement {
  const root = screenEl("luckyhatch");
  /** What the last hatch produced, or null before the first one. */
  let found: HatchPrize | null = null;
  /** True while the egg is rocking: the button must not be tapped twice into one animation. */
  let busy = false;

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, {
      title: "Lucky hatch",
      sub: "Where traits and skins come from",
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
    else wrap.append(purse(), trade(), stage(), foot(), odds());

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

  /**
   * MYCELIUM BUYS A LARVA.
   *
   * The mycelium sink is FINITE and always was — the chambers, the nine colonies and the
   * granary come to about 21,865, and a player on the record this economy is tuned for has
   * bought every one of them well before the road ends. From that day the currency every
   * match pays buys nothing at all, for ever, which is a reward that has stopped being one.
   *
   * The hatch is the only sink in the game with no end, so this is where the surplus goes.
   * Priced against the LEFTOVER rather than against income (platform/exchange.ts): about a
   * larva every four days out of money that was doing nothing. A win still pays one
   * outright, so playing is never the slow way to hatch.
   *
   * It sits under the purse because it is about the purse — the plus sign beside the
   * figure spends real money, and a player holding nine thousand mycelium should not have
   * to reach the shop to find that out.
   */
  const trade = (): HTMLElement => {
    const mycel = store.get().mycel;
    const can = mycel >= LARVA_MYCEL;

    const row = el("button", "hatchtrade" + (can ? "" : " out")) as HTMLButtonElement;
    row.type = "button";
    row.id = "hatchTrade";

    const from = el("span", "ht-c");
    from.append(icon("mycel", 15), el("span", undefined, String(LARVA_MYCEL)));
    const into = el("span", "ht-c ht-to");
    into.append(icon("brood", 15), el("span", undefined, "1"));
    row.append(from, icon("next", 12), into, el("span", "ht-go", "Trade"));

    row.onclick = () => {
      if (!store.buyLarva()) return;
      render();
      opts.onChanged?.();
    };
    row.disabled = !can;
    return row;
  };

  /* --------------------------------------------------------------------- THE EGG */

  const stage = (): HTMLElement => {
    const box = el("div", "hatchstage");
    box.id = "hatchStage";

    if (found && !busy) {
      box.appendChild(found.kind === "skin" ? skinPrize(found.look) : prize(found.item));
      return box;
    }

    const egg = el("div", "hatchegg" + (busy ? " shaking" : ""));
    egg.id = "hatchEgg";
    egg.appendChild(icon("brood", 96));
    box.appendChild(egg);
    // Said once, under the egg, and only before the first hatch: after that the last
    // trait is standing there saying it better than a sentence could.
    if (!found && !busy) {
      box.appendChild(el("div", "hatchhint",
        "Every trait in the game is in here, and every colony skin."));
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

  /**
   * A SKIN CAME OUT.
   *
   * It is shown as the thing itself — the colony's own head WEARING it, in the skin's own
   * colours — because that is the whole of what a skin is, and a name over a generic mark
   * would be the one prize in this game the screen refuses to show. It does not go to the
   * inventory (a skin is not a thing you carry, it is an appearance), so the way out points
   * at the colony it belongs to, which is the only place it can be worn from.
   */
  const skinPrize = (look: Look): HTMLElement => {
    // A SKIN WEARS ITS OWN RARITY, in the game's one colour for it. It comes out of an
    // Exceptional or a Mythic roll and nothing below, so the card says which — the colour
    // is the answer here exactly as it is for a trait, and a skin that arrived in some
    // colour of its own would be the one prize outside the ladder.
    const tier = look.tier ? TIERS[look.tier] : null;
    const box = el("div", "hatchprize skin");
    box.id = "hatchPrize";
    box.style.setProperty("--tier", tier?.colour ?? "#ffd257");

    const disc = el("div", "hp-disc hp-face");
    disc.appendChild(antPortrait(look.species, 108, "hp-port", look));

    box.append(
      disc,
      el("div", "hp-tier", `${tier?.name ?? ""} skin`.trim()),
      el("div", "hp-name", look.name),
      el("div", "hp-eff", SPECIES[look.species].name),
    );

    const go = el("button", "hp-go") as HTMLButtonElement;
    go.type = "button";
    go.id = "hatchToColony";
    go.append(el("span", undefined, `Wear it on the ${SPECIES[look.species].name}`), icon("next", 13));
    go.onclick = () => opts.onColony?.(look.species);
    box.appendChild(go);
    return box;
  };

  /* -------------------------------------------------------------------- THE ODDS */

  /**
   * WHAT YOU ARE CHASING, STATED.
   *
   * A hatch that does not print its odds is asking a player to keep spending on a
   * distribution they can only guess at, and the guess is always that the good one never
   * comes. Printed, one in a hundred is a target rather than a suspicion — and it is the
   * whole reason the top tier is worth the chase.
   *
   * Five rows rather than a sentence, because the ORDER is the message: the colours run
   * from the one that turns up most to the one that almost never does, and a player reads
   * the shape of that before they read any number on it.
   */
  const odds = (): HTMLElement => {
    const box = el("div", "hatchodds");
    box.id = "hatchOdds";
    box.appendChild(el("div", "ho-h", "Chances"));
    for (const id of TRAIT_TIERS) {
      const tier = TRAIT_TIER[id];
      const row = el("div", "ho-row");
      row.style.setProperty("--tier", tier.colour);
      row.append(
        el("span", "ho-dot"),
        el("span", "ho-n", tier.name),
        el("span", "ho-p", `${trim(tierOdds(id))}%`),
      );
      box.appendChild(row);
    }
    // A skin has no chance of its own — it IS the top of this row (platform/skins.ts) —
    // so the note names the tiers rather than a second number. Printed all the same: an
    // outcome a player can get and was never told about is what this panel prevents.
    const named = SKIN_TIERS.map((t) => TIERS[t].name).join(" and ");
    box.appendChild(el("div", "ho-note",
      `${named} hatches pay a colony skin, while you still have one to find.`));
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

/** A whole number where it is one, a decimal only where the figure needs it. */
const trim = (pct: number): string =>
  pct >= 10 || Number.isInteger(pct) ? String(Math.round(pct)) : pct.toFixed(1);
