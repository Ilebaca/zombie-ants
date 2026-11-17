/**
 * Trait slots open an anchored collection picker, then a separate detail dialog.
 * Browsing never changes a loadout; only Equip or Remove writes to the store.
 */
import { groupSections } from "./groups";
import {
  ATK_CAP, DEF_CAP, FUSE_DEALS, LUCK_CAP, SPECIES_ORDER,
  TRAIT_TIER, effectFigure, effectText, fitsScope, itemDef, scopeName, slotChapter,
} from "../platform";
import type { ProfileStore, TraitItem, TraitScope } from "../platform";
import { buyButton, el, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";
import { traitEmblem, traitSocket } from "./trait-emblem";
import { mountTraitPicker, traitPopupHost } from "./trait-popovers";

export interface TraitSlotsOptions {
  scope: TraitScope;
  /** Species pages show individual slots below the upgrade panel. */
  standalone?: boolean;
  onChanged?: (change: "equip" | "remove") => void;
}

export function buildTraitSlots(store: ProfileStore, opts: TraitSlotsOptions): HTMLElement {
  const root = el("div", "trait-slots");
  root.classList.toggle("trait-slots--standalone", !!opts.standalone);
  root.id = opts.scope === "hill" ? "hillTraits" : "spgTraits";
  let unmountPicker = (): void => {};
  const { scope } = opts;
  let selectedSlot: number | null = null;
  let detail: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;

  const closeDetail = (): void => {
    if (!detail) return;
    detail.remove();
    detail = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  };

  const closePicker = (): void => {
    closeDetail();
    if (selectedSlot === null) return;
    const slot = selectedSlot;
    selectedSlot = null;
    render();
    root.querySelector<HTMLButtonElement>(`.trait-slot-row [data-slot="${slot}"]`)?.focus({ preventScroll: true });
  };

  const changed = (change: "equip" | "remove"): void => {
    closeDetail();
    selectedSlot = null;
    render();
    opts.onChanged?.(change);
  };

  const openDetail = (item: TraitItem, source: HTMLElement): void => {
    closeDetail();
    returnFocus = source;
    const def = itemDef(item);
    const tier = TRAIT_TIER[item.tier];
    const worn = selectedSlot !== null && store.bench(scope)[selectedSlot]?.uid === item.uid;
    const compatible = fitsScope(item, scope);
    const layer = el("div", "trait-detail-layer");
    const card = el("section", "trait-detail");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "traitDetailName");
    card.setAttribute("aria-describedby", "traitDetailEffect");
    card.style.setProperty("--tier", tier.colour);

    const close = el("button", "action-button secondary trait-detail-close") as HTMLButtonElement;
    close.type = "button";
    close.setAttribute("aria-label", "Close trait details");
    close.appendChild(icon("cross", 16));
    close.onclick = event => { event.stopPropagation(); closeDetail(); };

    const emblem = el("div", "trait-detail-emblem");
    emblem.appendChild(traitEmblem(def?.kind ?? "attack", item.tier));
    const name = el("h2", "trait-detail-name", def?.name ?? "Trait");
    name.id = "traitDetailName";
    const effect = el("p", "trait-detail-effect", def ? effectText(def, item.tier) : "");
    effect.id = "traitDetailEffect";
    const owner = Object.entries(store.get().wearing).find(([, slots]) => slots.includes(item.uid))?.[0] as TraitScope | undefined;
    card.append(
      close, el("div", "trait-detail-tier", tier.name), emblem, name, effect,
      el("p", "trait-detail-note", def?.note ?? ""),
      el("p", "trait-detail-scope", owner && !worn ? `Moves from ${scopeName(owner)} when equipped` : "Usable on any ant or the anthill"),
    );

    const equip = el("button", "action-button trait-detail-equip", worn ? "Equipped" : "Equip") as HTMLButtonElement;
    equip.type = "button";
    equip.disabled = !compatible || worn || selectedSlot === null;
    equip.onclick = event => {
      event.stopPropagation();
      if (selectedSlot === null || !store.equipTrait(scope, item.uid, selectedSlot)) return;
      changed("equip");
    };
    card.appendChild(equip);
    layer.appendChild(card);
    // A tap on the card or its backdrop dismisses it; the action buttons handle their own taps.
    layer.onclick = event => { event.stopPropagation(); closeDetail(); };
    layer.onkeydown = event => {
      if (event.key !== "Tab") return;
      const first = close, last = equip.disabled ? close : equip;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    detail = layer;
    layer.addEventListener("dismiss-trait-popup", closeDetail);
    traitPopupHost(root).appendChild(layer);
    close.focus({ preventScroll: true });
  };

  const picker = (): HTMLElement => {
    const panel = el("section", "trait-picker");
    panel.id = `traitPicker-${scope}`;
    panel.setAttribute("aria-label", "Choose a trait");
    panel.style.setProperty("--trait-arrow", `${10 + (selectedSlot ?? 0) * 20}%`);
    const head = el("div", "trait-picker-head");
    head.append(el("span", undefined, "Your traits"), el("span", "trait-picker-count", String(store.bag.length)));
    panel.appendChild(head);
    const list = el("div", "trgrid trait-picker-grid");
    list.classList.add("trait-picker-grid");
    const worn = new Set(Object.values(store.get().wearing).flat().filter(Boolean));
    const items = [...store.bag].sort((a, b) => Number(fitsScope(b, scope)) - Number(fitsScope(a, scope)));
    for (const item of items) {
      const cell = readOnlyTile(item, () => openDetail(item, cell));
      cell.classList.toggle("worn", worn.has(item.uid));
      cell.classList.toggle("other-scope", !fitsScope(item, scope));
      list.appendChild(cell);
    }
    if (items.length) panel.appendChild(list);
    else panel.appendChild(locked("Nothing found yet", "Find traits on the Colony Road and in the lucky hatch."));
    if (selectedSlot !== null && store.bench(scope)[selectedSlot]) {
      const remove = el("button", "action-button secondary trait-picker-remove", "Remove trait") as HTMLButtonElement;
      remove.type = "button";
      remove.onclick = () => {
        if (selectedSlot !== null && store.unequipTrait(scope, selectedSlot)) changed("remove");
      };
      panel.appendChild(remove);
    }
    return panel;
  };

  const slotRow = (): HTMLElement => {
    const row = el("div", "trgrid");
    row.classList.add("trait-slot-row");
    store.bench(scope).forEach((item, i) => {
      if (i >= store.slotsOpen()) {
        const shut = el("span", "trtile shut");
        shut.dataset.slot = String(i);
        shut.append(traitSocket(), icon("lock", 15), el("span", "trtile-ch", `CH ${slotChapter(i)}`));
        shut.title = `Opens at chapter ${slotChapter(i)}`;
        shut.setAttribute("aria-label", shut.title);
        row.appendChild(shut);
        return;
      }
      const select = (): void => {
        if (selectedSlot === i) { closePicker(); return; }
        closeDetail();
        selectedSlot = i;
        render();
        root.querySelector<HTMLButtonElement>(`.trait-slot-row [data-slot="${i}"]`)?.focus({ preventScroll: true });
      };
      const cell = item ? readOnlyTile(item, select) : el("button", "trtile empty") as HTMLButtonElement;
      cell.type = "button";
      if (!item) {
        cell.append(traitSocket(), icon("plus", 18));
        cell.setAttribute("aria-label", `Empty slot ${i + 1}`);
        cell.onclick = select;
      }
      cell.classList.toggle("worn", !!item);
      cell.classList.toggle("armed", selectedSlot === i);
      cell.dataset.slot = String(i);
      cell.setAttribute("aria-expanded", String(selectedSlot === i));
      if (selectedSlot === i) cell.setAttribute("aria-controls", `traitPicker-${scope}`);
      row.appendChild(cell);
    });
    return row;
  };

  const totalsBox = (): HTMLElement => {
    const t = store.benchTotals(scope), box = el("div", "trtotals");
    box.append(
      totalCell("attack", "Attack", t.atkPct, ATK_CAP),
      totalCell("defence", "Defence", t.defPct, DEF_CAP),
      totalCell("clock", "CDR chance", t.luckPct, LUCK_CAP),
    );
    return box;
  };

  const totalCell = (mark: string, label: string, value: number, cap: number): HTMLElement => {
    const cell = el("div", "trtotal" + (value >= cap ? " capped" : ""));
    const head = el("div", "trtotal-k");
    head.append(icon(mark, 13), el("span", undefined, label));
    cell.append(head, el("div", "trtotal-v", `${value}%`), el("div", "trtotal-c", `max ${cap}%`));
    return cell;
  };

  const render = (): void => {
    unmountPicker();
    unmountPicker = () => {};
    root.replaceChildren();
    const heading = el("div", "trait-slots-head");
    heading.append(el("span", undefined, "Traits"), el("span", "trait-slots-count",
      `${store.bench(scope).slice(0, store.slotsOpen()).filter(Boolean).length} / ${store.slotsOpen()}`));
    const row = slotRow();
    if (opts.standalone) {
      root.setAttribute("aria-label", "Traits");
      root.appendChild(row);
    } else root.append(heading, row, totalsBox());
    if (selectedSlot !== null) {
      const panel = picker();
      panel.addEventListener("dismiss-trait-popup", closePicker);
      unmountPicker = mountTraitPicker(root, row, selectedSlot, panel, closePicker);
    }
  };

  render();
  return root;
}

/* ==================================================================== INVENTORY */

/** One shared inventory; items open a choice of loadout. */
export interface InventoryOptions {
  onBack: () => void;
  /** Open the chosen loadout to select an equipment slot. */
  onOpen: (scope: TraitScope) => void;
}

export function buildInventory(store: ProfileStore, opts: InventoryOptions): HTMLElement {
  const root = screenEl("inventory");
  let unmountPicker = (): void => {};
  const closePicker = (): void => { unmountPicker(); unmountPicker = () => {}; };
  const openItem = (item: TraitItem, source: HTMLElement, grid: HTMLElement): void => {
    closePicker();
    const def = itemDef(item);
    if (!def) return;
    const tier = TRAIT_TIER[item.tier];
    const panel = el("section", "trait-picker inventory-picker");
    panel.setAttribute("aria-label", "Choose a loadout");
    panel.style.setProperty("--tier", tier.colour);
    panel.append(el("div", "trait-picker-head", `${tier.name} ${def.name}`),
      el("div", "trait-detail-effect", effectText(def, item.tier)));
    const destinations = el("div", "inventory-destinations");
    for (const scope of ["hill", ...SPECIES_ORDER.filter(id => store.get().unlocked.includes(id))] as TraitScope[]) {
      const button = el("button", "action-button secondary", scopeName(scope)) as HTMLButtonElement;
      button.type = "button";
      button.dataset.loadout = scope;
      button.onclick = () => { closePicker(); opts.onOpen(scope); };
      destinations.appendChild(button);
    }
    panel.append(el("div", "trait-detail-scope", "Choose where to equip"), destinations);
    panel.addEventListener("dismiss-trait-popup", closePicker);
    unmountPicker = mountTraitPicker(root, grid, 0, panel, closePicker, source);
    destinations.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  };

  const render = (): void => {
    closePicker();
    redraw(root);
    screenHeader(root, {
      title: "Inventory", onBack: opts.onBack,
      backId: "invBack",
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "trwrap");
    wrap.id = "invBody";

    const fuse = fuseBox();
    if (fuse) wrap.appendChild(fuse);

    const grid = el("div", "inventory-grid");
    grid.setAttribute("aria-label", "Inventory slots");
    const bag = store.bag;
    const capacity = Math.max(25, Math.ceil((bag.length + 1) / 5) * 5);
    for (let i = 0; i < capacity; i++) {
      const item = bag[i];
      if (item) {
        const cell = readOnlyTile(item, () => openItem(item, cell, grid));
        cell.classList.add("inventory-slot");
        grid.appendChild(cell);
      } else {
        const empty = el("div", "inventory-slot inventory-slot--empty");
        empty.setAttribute("aria-hidden", "true");
        grid.appendChild(empty);
      }
    }
    wrap.appendChild(grid);

    body.appendChild(wrap);
    root.appendChild(body);
    groupSections(root);
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
    box.appendChild(el("div", "fb-h", "Fuse spares"));
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
    // wherever it is read (PROJECT_GUIDE.md §7: one function owns a rule).
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
  mark.appendChild(traitEmblem(def?.kind ?? "attack", item.tier));
  const foot = el("span", "trtile-f");
  foot.appendChild(el("span", "trtile-v", def ? effectFigure(def, item.tier) : ""));

  cell.append(mark, foot);
  const label = def ? `${def.name} · ${tier.name} · ${effectText(def, item.tier)}` : tier.name;
  cell.title = label;
  cell.setAttribute("aria-label", label);
  cell.onclick = onTap;
  return cell;
}

/** A screen with nothing on it has to say WHY, or it reads as one that failed to load. */
function locked(head: string, note: string): HTMLElement {
  const box = el("div", "trempty");
  box.append(el("div", "trempty-h", head), el("div", "trempty-p", note));
  return box;
}

