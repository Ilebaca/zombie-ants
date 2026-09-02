/**
 * THE TRAIT BENCH — five slots, and everything you have found underneath them.
 *
 * One screen does both halves on purpose. A separate inventory would mean walking away
 * from the slots to look at the thing you are choosing FOR them, and back again to see
 * whether it helped; here the totals sit between the two, so slotting something and
 * watching the number move is one gesture in one place.
 *
 * It is the same screen for a colony's five and for the anthill's five — a bench is a
 * bench, and two screens that differ only in which pool they draw from would be two
 * places to fix everything. `scope` is the whole difference.
 *
 * WHAT IT SHOWS THAT THE NUMBERS ALONE DO NOT: the CAP. A player stacking attack traits
 * has to be able to see the ceiling before they hit it, or the fifth one silently doing
 * nothing reads as a bug in the game rather than as a rule of it.
 */
import { SPECIES } from "../engine";
import {
  ATK_CAP, DEF_CAP, LUCK_CAP, TRAIT_SLOTS, TRAIT_TIER, effectFigure, effectText, itemDef,
  markOf, scopeName,
} from "../platform";
import type { ProfileStore, TraitItem, TraitScope } from "../platform";
import { el, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export interface TraitBenchOptions {
  scope: TraitScope;
  onBack: () => void;
  /** Told after any change, so the screen behind can redraw its own trait row. */
  onChanged?: () => void;
}

export function buildTraitBench(store: ProfileStore, opts: TraitBenchOptions): HTMLElement {
  const root = screenEl("traits");
  const { scope } = opts;

  /**
   * The slot a tap from the bag will fill.
   *
   * `null` means "the first free one", which is what an empty bench wants — a player
   * filling five slots in a row should not have to aim at each. Tapping a slot ARMS it,
   * so replacing one particular trait is also two taps rather than a remove and an add.
   */
  let armed: number | null = null;

  const render = (): void => {
    root.replaceChildren();
    screenHeader(root, {
      title: scopeName(scope),
      sub: "Traits",
      onBack: opts.onBack,
      backId: "trBack",
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "trwrap");
    wrap.id = "trBody";

    const bench = store.bench(scope);
    wrap.append(el("div", "secthead", `Equipped  ${bench.filter(Boolean).length} / ${TRAIT_SLOTS}`));
    wrap.appendChild(slotRow(bench));
    wrap.appendChild(totalsBox());

    const spare = store.spare(scope);
    wrap.append(el("div", "secthead", `Inventory  ${spare.length}`));
    if (spare.length === 0) wrap.appendChild(emptyBag());
    else {
      const list = el("div", "trgrid");
      list.id = "trBag";
      for (const item of spare) list.appendChild(bagTile(item));
      wrap.appendChild(list);
    }

    body.appendChild(wrap);
    root.appendChild(body);
  };

  const changed = (): void => { render(); opts.onChanged?.(); };

  /* --------------------------------------------------------------- THE SLOTS */

  const slotRow = (bench: (TraitItem | null)[]): HTMLElement => {
    const row = el("div", "trgrid");
    row.id = "trWorn";
    bench.forEach((item, i) => {
      if (item) {
        const cell = tile(item, () => { store.unequipTrait(scope, i); armed = null; changed(); });
        cell.classList.add("worn");
        cell.dataset.slot = String(i);
        row.appendChild(cell);
        return;
      }
      const cell = el("button", "trtile empty" + (armed === i ? " armed" : "")) as HTMLButtonElement;
      cell.type = "button";
      cell.dataset.slot = String(i);
      cell.appendChild(icon("plus", 18));
      cell.setAttribute("aria-label", `Empty slot ${i + 1}`);
      // Arming toggles: an accidental tap would otherwise leave the screen in a state
      // with no way out but the back button.
      cell.onclick = () => { armed = armed === i ? null : i; render(); };
      row.appendChild(cell);
    });
    return row;
  };

  /**
   * ONE SQUARE, AND IT IS THE SAME SQUARE IN BOTH HALVES.
   *
   * A worn trait and a spare one are the same object, so they are drawn the same: the
   * trait's own mark in its tier's colour, and under it the kind — sword, shield or
   * clock — with what it is worth. That is the whole tile. A name and a line of biology
   * would not survive being five across on a phone, and five across is what makes an
   * inventory something you can take in at a glance instead of scroll through.
   *
   * The name is still there for anything that reads the page rather than looks at it:
   * `title` for a pointer, `aria-label` for a screen reader.
   */
  const tile = (item: TraitItem, onTap: () => void): HTMLButtonElement => {
    const def = itemDef(item);
    const tier = TRAIT_TIER[item.tier];
    const cell = el("button", "trtile filled") as HTMLButtonElement;
    cell.type = "button";
    cell.dataset.uid = item.uid;
    cell.style.setProperty("--tier", tier.colour);

    const mark = el("span", "trtile-i");
    mark.appendChild(icon(def?.icon ?? "star", 22));

    const foot = el("span", "trtile-f");
    foot.appendChild(icon(def ? markOf(def.kind) : "spark", 11));
    foot.appendChild(el("span", "trtile-v", def ? effectFigure(def, item.tier) : ""));

    cell.append(mark, foot);
    const label = def ? `${def.name} · ${tier.name} · ${effectText(def, item.tier)}` : tier.name;
    cell.title = label;
    cell.setAttribute("aria-label", label);
    cell.onclick = onTap;
    return cell;
  };

  /* -------------------------------------------------------------- THE TOTALS */

  /**
   * What this bench is worth, and what the ceiling is.
   *
   * The cap is printed beside every figure rather than only when it is reached: a limit
   * a player discovers by watching a number stop moving reads as a bug.
   */
  const totalsBox = (): HTMLElement => {
    const t = store.benchTotals(scope);
    const box = el("div", "trtotals");
    box.append(
      totalCell("attack", "Attack", t.atkPct, ATK_CAP),
      totalCell("defence", "Defence", t.defPct, DEF_CAP),
      // "Cooldown", not "−1 cooldown": the label wrapped onto two lines in a
      // three-across row and pushed that one cell taller than its neighbours.
      totalCell("clock", "Cooldown", t.luckPct, LUCK_CAP),
    );
    return box;
  };

  const totalCell = (mark: string, label: string, value: number, cap: number): HTMLElement => {
    const cell = el("div", "trtotal" + (value >= cap ? " capped" : ""));
    const head = el("div", "trtotal-k");
    head.appendChild(icon(mark, 13));
    head.appendChild(el("span", undefined, label));
    cell.append(head, el("div", "trtotal-v", `${value}%`), el("div", "trtotal-c", `max ${cap}%`));
    return cell;
  };

  /* ----------------------------------------------------------- THE INVENTORY */

  const bagTile = (item: TraitItem): HTMLElement => tile(item, () => {
    // `armed` is a slot the player pointed at; without one it goes in the first gap.
    const ok = store.equipTrait(scope, item.uid, armed ?? undefined);
    armed = null;
    if (!ok) { toast(root, "No room — take one off first", "bad"); render(); return; }
    changed();
  });

  const emptyBag = (): HTMLElement => {
    const box = el("div", "trempty");
    box.append(
      el("div", "trempty-h", "Nothing to fit here yet"),
      // THE LUCKY HATCH IS THE ONLY SOURCE, and that is the design rather than a gap:
      // a match pays mycelium and a colony, and the hatch pays the one thing there is no
      // other way to get. Said here plainly, because an empty screen that does not say
      // where the things come from reads as broken.
      el("div", "trempty-p", scope === "hill"
        ? "Universal traits come from the lucky hatch. They work for every colony."
        : `${SPECIES[scope].name} traits come from the lucky hatch.`),
    );
    return box;
  };

  render();
  return root;
}

/**
 * THE ROW THAT OPENS IT, shown on the species page and in the anthill.
 *
 * It carries the five slots in miniature rather than a count, because "3 / 5" says how
 * many and nothing about WHICH — and which is the whole of what a player wants to check
 * before a match. A locked bench says the chapter, never a padlock: a number is something
 * to play toward.
 */
export function traitOpener(
  store: ProfileStore, scope: TraitScope, onOpen: () => void, locked: string | null,
): HTMLElement {
  const row = el("button", "tropen" + (locked ? " locked" : "")) as HTMLButtonElement;
  row.type = "button";
  row.id = scope === "hill" ? "hillTraits" : "spgTraits";

  const worn = locked ? [] : store.bench(scope);
  const on = worn.filter(Boolean).length;

  const mid = el("div", "tropen-mid");
  const top = el("div", "tropen-top");
  // The row sits under a heading that already says "Traits", so repeating the word here
  // would be the only text on it and would say nothing. It states the STATE instead.
  top.append(el("span", "tropen-t",
    locked ? "Traits" : on ? `${on} of ${TRAIT_SLOTS} equipped` : "No traits equipped"));
  if (locked) top.append(el("span", "tropen-c", locked));
  mid.appendChild(top);

  if (!locked) {
    const pips = el("div", "tropen-pips");
    for (const item of worn) {
      const pip = el("span", "tropen-pip" + (item ? " on" : ""));
      if (item) pip.style.setProperty("--tier", TRAIT_TIER[item.tier].colour);
      pips.appendChild(pip);
    }
    mid.appendChild(pips);
  }

  const slot = el("span", "tropen-i");
  slot.appendChild(icon(locked ? "lock" : "star", 18));
  row.append(slot, mid);
  // No chevron while it is locked: an arrow into a door that does not open is the row
  // promising something the tap will not deliver.
  if (!locked) { row.appendChild(icon("next", 14)); row.onclick = onOpen; }
  return row;
}
