/**
 * Trait slots open an anchored collection picker, then a separate detail dialog.
 * Browsing never changes a loadout; only Equip or Remove writes to the store.
 */
import { groupSections } from "./groups";
import {
  ATK_CAP, DEF_CAP, FUSE_DEALS, LUCK_CAP, SPECIES_ORDER,
  TRAIT_TIER, effectFigure, effectText, fitsScope, itemDef, markOf, scopeName, slotChapter,
} from "../platform";
import type { ProfileStore, TraitItem, TraitScope } from "../platform";
import { buyButton, el, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";
import { mountTraitPicker, traitPopupHost } from "./trait-popovers";

export interface TraitSlotsOptions {
  scope: TraitScope;
  onChanged?: (change: "equip" | "remove") => void;
}

export function buildTraitSlots(store: ProfileStore, opts: TraitSlotsOptions): HTMLElement {
  const root = el("div", "trait-slots");
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
    emblem.appendChild(icon(def?.icon ?? "star", 64));
    const name = el("h2", "trait-detail-name", def?.name ?? "Trait");
    name.id = "traitDetailName";
    const effect = el("p", "trait-detail-effect", def ? effectText(def, item.tier) : "");
    effect.id = "traitDetailEffect";
    const owner = Object.entries(store.get().wearing).find(([, slots]) => slots.includes(item.uid))?.[0] as TraitScope | undefined;
    card.append(
      close, el("div", "trait-detail-tier", tier.name), emblem, name, effect,
      el("p", "trait-detail-note", def?.note ?? ""),
      el("p", "trait-detail-scope", !compatible ? `${def ? scopeName(def.species ?? "hill") : "Species"} trait · Anthill uses universal traits` : owner && !worn ? `Moves from ${scopeName(owner)} when equipped` : "Usable at any species level"),
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
        shut.append(icon("lock", 15), el("span", "trtile-ch", `CH ${slotChapter(i)}`));
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
        cell.appendChild(icon("plus", 18));
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
      totalCell("clock", "Cooldown", t.luckPct, LUCK_CAP),
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
    root.append(heading, row, totalsBox());
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
      title: "Inventory", onBack: opts.onBack,
      backId: "invBack",
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "trwrap");
    wrap.id = "invBody";

    const bag = store.bag;
    if (bag.length === 0) {
      wrap.appendChild(locked("Nothing found yet",
        "Traits come from the Colony Road and the lucky hatch. Equip them on a colony or your anthill."));
      body.appendChild(wrap);
      root.appendChild(body);
      groupSections(root);
      return;
    }

    const fuse = fuseBox();
    if (fuse) wrap.appendChild(fuse);

    const benches: TraitScope[] = ["hill", ...SPECIES_ORDER];
    for (const scope of benches) {
      const mine = bag.filter((i) => itemDef(i)?.species === (scope === "hill" ? null : scope));
      if (mine.length === 0) continue;
      const equipped = new Set(Object.values(store.get().wearing).flat().filter(Boolean));
      const worn = new Set(mine.filter(item => equipped.has(item.uid)).map(item => item.uid));

      const head = el("button", "invhead") as HTMLButtonElement;
      head.type = "button";
      head.dataset.scope = scope;
      head.append(
        el("span", "invhead-t", scopeName(scope)),
        el("span", "invhead-c", `${worn.size} equipped · ${mine.length} held`),
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

/** A screen with nothing on it has to say WHY, or it reads as one that failed to load. */
function locked(head: string, note: string): HTMLElement {
  const box = el("div", "trempty");
  box.append(el("div", "trempty-h", head), el("div", "trempty-p", note));
  return box;
}

