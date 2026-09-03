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
  ATK_CAP, DEF_CAP, FUSE_DEALS, LUCK_CAP, SPECIES_ORDER, TRAITS_CHAPTER, TRAIT_SLOTS,
  TRAIT_TIER, effectFigure, effectText, fitsScope, itemDef, markOf, scopeName, slotChapter,
} from "../platform";
import type { ProfileStore, TraitItem, TraitScope } from "../platform";
import { buyButton, el, redraw, screenEl, screenHeader, toast } from "./chrome";
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
    redraw(root);
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
    // The heading counts against what is OPEN, not against five. "2 / 5" on a bench with
    // two slots reads as three empty ones the player cannot see.
    const open = store.slotsOpen();
    wrap.append(el("div", "secthead", `Equipped  ${bench.filter(Boolean).length} / ${open}`));
    wrap.appendChild(slotRow(bench, open));
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

  const slotRow = (bench: (TraitItem | null)[], open: number): HTMLElement => {
    const row = el("div", "trgrid");
    row.id = "trWorn";
    bench.forEach((item, i) => {
      // A SLOT THE ROAD HAS NOT OPENED IS DRAWN, and it names its chapter. Five squares
      // with two live is the shape of the bench a player is working toward; two squares
      // is a bench that looks finished. A number is something to play toward, where a
      // padlock only says you cannot — the same rule the granary's levels follow.
      if (i >= open) {
        const shut = el("span", "trtile shut");
        shut.dataset.slot = String(i);
        shut.append(icon("lock", 15), el("span", "trtile-ch", `CH ${slotChapter(i)}`));
        shut.title = `Opens at chapter ${slotChapter(i)}`;
        shut.setAttribute("aria-label", shut.title);
        row.appendChild(shut);
        return;
      }
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

/* ==================================================================== INVENTORY */

/**
 * EVERYTHING FOUND, IN ONE PLACE.
 *
 * The benches show only what fits THEM — a colony's five and the anthill's — so without
 * this there is nowhere in the app that shows a collection AS a collection: a player with
 * forty traits spread over ten benches could never see forty of anything.
 *
 * It is grouped by bench rather than by tier, because "where does this go" is the question
 * a collection raises and "what colour is it" is not — and every group is a DOOR into the
 * bench it names, so seeing something you are not using and going to use it is one tap.
 */
export interface InventoryOptions {
  onBack: () => void;
  /** Open the bench a tile belongs to. */
  onOpen: (scope: TraitScope) => void;
}

export function buildInventory(store: ProfileStore, opts: InventoryOptions): HTMLElement {
  const root = screenEl("inventory");

  const render = (): void => {
    redraw(root);
    screenHeader(root, {
      title: "Inventory",
      sub: "Every trait you have found",
      onBack: opts.onBack,
      backId: "invBack",
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "trwrap");
    wrap.id = "invBody";

    // Locked, and it says the chapter rather than showing a padlock — the same thing the
    // bench openers do, because it is the same gate.
    if (!store.traitsOpen()) {
      wrap.appendChild(locked(`Traits open at chapter ${TRAITS_CHAPTER}.`,
        "They are found in the lucky hatch, and worn five at a time by each colony."));
      body.appendChild(wrap);
      root.appendChild(body);
      return;
    }

    const bag = store.bag;
    if (bag.length === 0) {
      wrap.appendChild(locked("Nothing found yet",
        "Traits come from the lucky hatch. Each colony wears five, and the anthill wears five more."));
      body.appendChild(wrap);
      root.appendChild(body);
      return;
    }

    const fuse = fuseBox();
    if (fuse) wrap.appendChild(fuse);

    const benches: TraitScope[] = ["hill", ...SPECIES_ORDER];
    for (const scope of benches) {
      const mine = bag.filter((i) => fitsScope(i, scope));
      if (mine.length === 0) continue;
      const worn = new Set(store.bench(scope).flatMap((i) => (i ? [i.uid] : [])));

      const head = el("button", "invhead") as HTMLButtonElement;
      head.type = "button";
      head.dataset.scope = scope;
      head.append(
        el("span", "invhead-t", scopeName(scope)),
        el("span", "invhead-c", `${worn.size} / ${TRAIT_SLOTS} worn · ${mine.length} held`),
        icon("next", 13),
      );
      head.onclick = () => opts.onOpen(scope);

      const grid = el("div", "trgrid");
      grid.dataset.scope = scope;
      for (const item of mine) {
        // A tile here does not equip: it belongs to a bench, and which slot it should go
        // in is a decision that needs the bench in front of you. Tapping it takes you there.
        const cell = readOnlyTile(item, () => opts.onOpen(scope));
        if (worn.has(item.uid)) cell.classList.add("worn");
        grid.appendChild(cell);
      }
      wrap.append(head, grid);
    }

    body.appendChild(wrap);
    root.appendChild(body);
  };

  /**
   * WHAT THE DUPLICATES ARE FOR.
   *
   * The hatch pays a Common six times in ten for ever, so a collection that has been
   * running a while is mostly spares pressing against the bag's ceiling with nothing to do
   * but be thrown away. Three of one rarity and some pheromone make one of the next
   * (platform/exchange.ts) — which is also where pheromone goes once every research level
   * on every colony is bought, and on the tuned record that happens well inside the road.
   *
   * It sits ABOVE the collection rather than under it. A control at the foot of a list
   * forty tiles long is a control nobody scrolls to, and this is an action ON that list.
   *
   * A ROW APPEARS WHEN THE FUEL IS HELD, and is priced whether or not the pheromone is.
   * Those two are different questions: what you hold is what makes the trade possible at
   * all, and the price is what makes it possible today. Showing all four rows for ever
   * would be a panel that mostly says no.
   */
  const fuseBox = (): HTMLElement | null => {
    const live = FUSE_DEALS.filter((d) => store.spares(d.from).length >= d.fuel);
    if (!live.length) return null;

    const box = el("div", "fusebox");
    box.id = "fuseBox";
    box.append(
      el("div", "fb-h", "Fuse spares"),
      el("div", "fb-p",
        "Three spares of one rarity make one of the next. Traits you are wearing are never spent."),
    );
    for (const deal of live) box.appendChild(fuseRow(deal));
    return box;
  };

  const fuseRow = (deal: typeof FUSE_DEALS[number]): HTMLElement => {
    const from = TRAIT_TIER[deal.from];
    const into = TRAIT_TIER[deal.into];
    const spare = store.spares(deal.from).length;

    const row = el("div", "fb-row");
    row.dataset.tier = deal.from;

    // THE TRADE ON ONE LINE AND WHAT IT COSTS YOU ON THE NEXT. Laid out across a single
    // row, "5 spare" was the column that gave — it wrapped to two lines on the widest
    // trade and not on the others, so two rows of the same panel were different heights.
    const trade = el("div", "fb-trade");
    trade.append(
      tierPip(from.colour, `${deal.fuel} ${from.name}`),
      icon("next", 12),
      tierPip(into.colour, `1 ${into.name}`),
    );
    row.append(trade, el("div", "fb-sp", `${spare} spare held`));

    // The same gold button every other purchase in the app uses, so a price is a price
    // wherever it is read (CLAUDE.md §7: one function owns a rule).
    const go = buyButton({
      icon: "pheromone",
      cost: deal.pheromone,
      maxed: false,
      affordable: store.canFuse(deal.from),
      onBuy: () => {
        const made = store.fuse(deal.from);
        if (!made) return;
        const def = itemDef(made);
        render();
        toast(root, `${into.name} ${def?.name ?? "trait"}`, "hive");
      },
    });
    go.dataset.fuse = deal.from;
    row.appendChild(go);
    return row;
  };

  render();
  return root;
}

/** A tier's dot and its name — the one way a rarity is written anywhere in the app. */
function tierPip(colour: string, text: string): HTMLElement {
  const pip = el("span", "fb-n");
  pip.style.setProperty("--tier", colour);
  pip.append(el("span", "fb-dot"), el("span", undefined, text));
  return pip;
}

/** A tile that opens a bench rather than filling one. Same square, everywhere. */
function readOnlyTile(item: TraitItem, onTap: () => void): HTMLButtonElement {
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
}

/**
 * The five slots at a glance: the same square as the bench's, small enough to sit on a row.
 *
 * A `span` rather than a `button`, because the whole row is already the button — a control
 * inside a control is a tap that lands on neither. The name still rides on `title` and
 * `aria-label`, exactly as it does on the full-size tile.
 */
function miniBench(worn: readonly (TraitItem | null)[], open: number): HTMLElement {
  const row = el("div", "tropen-slots");
  worn.forEach((item, i) => {
    // Slots the road has not opened are drawn too, so the row is the same five squares
    // the bench is — just plainly not all live yet.
    if (i >= open) {
      row.appendChild(el("span", "tropen-slot shut"));
      return;
    }
    if (!item) {
      row.appendChild(el("span", "tropen-slot empty"));
      return;
    }
    const def = itemDef(item);
    const tier = TRAIT_TIER[item.tier];
    const cell = el("span", "tropen-slot filled");
    cell.style.setProperty("--tier", tier.colour);
    const mark = el("span", "tropen-slot-i");
    mark.appendChild(icon(def?.icon ?? "star", 16));
    cell.append(mark, el("span", "tropen-slot-v", def ? effectFigure(def, item.tier) : ""));
    const label = def ? `${def.name} · ${tier.name} · ${effectText(def, item.tier)}` : tier.name;
    cell.title = label;
    cell.setAttribute("aria-label", label);
    row.appendChild(cell);
  });
  return row;
}

/** A screen with nothing on it has to say WHY, or it reads as one that failed to load. */
function locked(head: string, note: string): HTMLElement {
  const box = el("div", "trempty");
  box.append(el("div", "trempty-h", head), el("div", "trempty-p", note));
  return box;
}

/**
 * THE ROW THAT OPENS IT, shown on the species page and in the anthill.
 *
 * IT SHOWS THE TRAITS THEMSELVES, not a count and not a row of dashes.
 *
 * "3 / 5" says how many and nothing about WHICH, and which is the whole of what a player
 * checks before a match. The dashes it carried before were only half a step from that: a
 * lit pip in the tier's colour said a rare one was worn SOMEWHERE, and nothing about what
 * it did. So the row carries the same square the bench does, shrunk — the trait's own
 * mark in its tier's colour with what it is worth under it — and an empty slot is drawn
 * as an empty slot rather than left out, because five squares with two filled is a
 * loadout and two squares is a list.
 *
 * The line above them still states the state, so a bench with nothing on it says so in
 * words as well as in five empty squares. A locked bench says the chapter, never a
 * padlock: a number is something to play toward.
 */
export function traitOpener(
  store: ProfileStore, scope: TraitScope, onOpen: () => void, locked: string | null,
): HTMLElement {
  const row = el("button", "tropen" + (locked ? " locked" : "")) as HTMLButtonElement;
  row.type = "button";
  row.id = scope === "hill" ? "hillTraits" : "spgTraits";

  const worn = locked ? [] : store.bench(scope);
  const on = worn.filter(Boolean).length;
  const open = locked ? 0 : store.slotsOpen();

  const mid = el("div", "tropen-mid");
  const top = el("div", "tropen-top");
  // The row sits under a heading that already says "Traits", so repeating the word here
  // would be the only text on it and would say nothing. It states the STATE instead.
  top.append(el("span", "tropen-t",
    locked ? "Traits" : on ? `${on} of ${open} equipped` : "No traits equipped"));
  if (locked) top.append(el("span", "tropen-c", locked));
  mid.appendChild(top);

  if (!locked) mid.appendChild(miniBench(worn, open));

  const slot = el("span", "tropen-i");
  slot.appendChild(icon(locked ? "lock" : "star", 18));
  row.append(slot, mid);
  // No chevron while it is locked: an arrow into a door that does not open is the row
  // promising something the tap will not deliver.
  if (!locked) { row.appendChild(icon("next", 14)); row.onclick = onOpen; }
  return row;
}
