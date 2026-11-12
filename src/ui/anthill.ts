/**
 * Anthill upgrades beneath a full-width illustrated cover.
 * The title, purse and excavation progress scroll with the page.
 * Purchases always go through ProfileStore; render never changes progression.
 */
import { groupSections } from "./groups";
import { chamberCost } from "../engine";
import {
  CHAMBERS, GRANARY_MAX, compact,
} from "../platform";
import type { ChamberDef, GranaryState, ProfileStore } from "../platform";
import { buyButton, effectRow, el, pips, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";
import { buildTraitSlots } from "./traits";
import { anthillCover, chamberArt } from "./anthill-art";
import { mountAnthillPopup } from "./anthill-popover";
import { mountAnthillTunnels } from "./anthill-tunnels";

export function buildAnthill(store: ProfileStore): HTMLElement {
  const root = screenEl("anthill");
  let selected: string | null = null;
  let unmountPopup = (): void => {};
  let unmountTunnels = (): void => {};

  const markSelection = (): void => {
    for (const row of root.querySelectorAll<HTMLElement>(".nest-lvl")) {
      const active = row.dataset.chamber === selected;
      row.classList.toggle("open", active);
      const button = row.querySelector<HTMLButtonElement>(".room");
      button?.setAttribute("aria-expanded", String(active));
      if (active) button?.setAttribute("aria-controls", "hillChamberPopup");
      else button?.removeAttribute("aria-controls");
    }
  };

  const close = (): void => {
    const target = selected;
    selected = null;
    unmountPopup();
    unmountPopup = () => {};
    markSelection();
    root.querySelector<HTMLButtonElement>(`[data-chamber="${target}"] .room`)?.focus({ preventScroll: true });
  };

  const openDetails = (id: string, makeSpace = true): void => {
    unmountPopup();
    selected = id;
    markSelection();
    const anchor = root.querySelector<HTMLButtonElement>(`[data-chamber="${id}"] .room`);
    if (!anchor) { close(); return; }
    const profile = store.get();
    const chamber = CHAMBERS.find(ch => ch.id === id);
    const name = id === GRANARY ? "Granary" : chamber?.name;
    if (!name) { close(); return; }

    const panel = el("section", "hill-popup");
    panel.id = "hillChamberPopup";
    panel.dataset.chamber = id;
    panel.classList.toggle("fresh", !!chamber && !(profile.hill[chamber.id] ?? 0));
    panel.classList.toggle("maxed", !!chamber && (profile.hill[chamber.id] ?? 0) >= chamber.max);
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "hillPopupName");
    const header = el("div", "hill-popup-head");
    const title = el("h2", "hill-popup-name", name);
    title.id = "hillPopupName";
    const dismiss = el("button", "action-button secondary hill-popup-close");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Close chamber details");
    dismiss.appendChild(icon("cross", 16));
    dismiss.onclick = close;
    header.append(title, dismiss);
    const content = el("div", "hill-popup-content");

    if (id === GRANARY) {
      content.appendChild(granaryDetail(store.granary(), profile.mycel, () => {
        if (!store.buyGranary()) return;
        render();
        toast(root, `Granary → Lv ${store.get().granary}`, "hive");
      }));
    } else if (chamber) {
      const lv = profile.hill[chamber.id] ?? 0;
      content.appendChild(detail(chamber, lv, profile.mycel, lv >= chamber.max, () => {
        if (!store.buyChamber(chamber.id)) return;
        render();
        toast(root, `${chamber.name} → Lv ${store.get().hill[chamber.id] ?? 0}`, "hive");
      }));
    }
    panel.append(header, content);
    panel.addEventListener("dismiss-anthill-popup", close);
    unmountPopup = mountAnthillPopup(root, anchor, panel, close, makeSpace);
    if (makeSpace) dismiss.focus({ preventScroll: true });
  };

  const toggle = (id: string): void => {
    if (selected === id) close();
    else openDetails(id);
  };

  const render = (): void => {
    unmountPopup();
    unmountTunnels();
    const profile = store.get();
    const levelOf = (ch: ChamberDef): number => profile.hill[ch.id] ?? 0;
    redraw(root);
    const dug = CHAMBERS.reduce((n, ch) => n + levelOf(ch), profile.granary);
    const total = CHAMBERS.reduce((n, ch) => n + ch.max, GRANARY_MAX);
    const cover = el("div", "hill-cover");
    const art = el("img", "hill-cover-art");
    art.src = anthillCover;
    art.alt = "";
    art.decoding = "async";
    art.fetchPriority = "high";
    cover.appendChild(art);
    screenHeader(cover, { title: "Anthill", mycel: profile.mycel });
    const progress = surface(dug, total);
    cover.appendChild(progress);
    root.appendChild(cover);

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "hillwrap");
    const nest = el("div", "nest");
    nest.appendChild(granaryRoom(store.granary(), {
      onOpen: () => toggle(GRANARY),
    }));
    CHAMBERS.forEach((ch, i) => {
      nest.appendChild(level(ch, i + 1, levelOf(ch), {
        onOpen: () => toggle(ch.id),
      }));
    });
    wrap.append(nest, buildTraitSlots(store, { scope: "hill" }));
    body.appendChild(wrap);
    root.appendChild(body);
    groupSections(root);
    unmountTunnels = mountAnthillTunnels(root, progress, nest);
    markSelection();
    if (selected) openDetails(selected, false);
  };

  render();
  return root;
}

/** The same excavation count and progress, over the cover instead of a drawn mound. */
function surface(dug: number, total: number): HTMLElement {
  const sum = el("div", "nest-sum");
  sum.append(
    el("span", "nest-sum-k", "Excavated"),
    el("span", "nest-sum-v", `${dug} / ${total}`),
  );
  const track = el("div", "hl-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Excavated");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(total));
  track.setAttribute("aria-valuenow", String(dug));
  const fill = el("span", "hl-fill");
  fill.style.width = `${Math.round((dug / total) * 100)}%`;
  track.appendChild(fill);
  sum.appendChild(track);
  return sum;
}

interface RoomHandlers { onOpen: () => void }

/**
 * One level of the nest: the shaft passing through it, and the chamber hollowed out beside.
 *
 * The side alternates so the shaft reads as a tunnel branching rather than a list with an
 * indent, and the open chamber's detail spans the whole width underneath it — a half-column
 * of comparison text would be a paragraph in a gutter.
 */
function level(
  ch: ChamberDef, index: number, lv: number, on: RoomHandlers,
): HTMLElement {
  const maxed = lv >= ch.max;
  const side = index % 2 === 0 ? "left" : "right";
  const row = el("div", `nest-lvl ${side}`
    + (lv ? " dug" : " fresh") + (maxed ? " maxed" : ""));
  row.dataset.chamber = ch.id;

  const spine = el("div", "nest-spine");
  // Preserve the existing row sizing; one SVG behind the rooms draws the tunnels.
  spine.setAttribute("aria-hidden", "true");

  const room = el("button", "room");
  room.type = "button";
  room.setAttribute("aria-expanded", "false");
  room.setAttribute("aria-haspopup", "dialog");
  const pocket = el("span", "room-pocket");
  const art = chamberArt[ch.id];
  if (art) {
    const img = el("img", "room-art");
    img.src = art;
    img.alt = "";
    img.decoding = "async";
    img.width = 48;
    img.height = 48;
    pocket.appendChild(img);
  } else {
    pocket.appendChild(icon(ch.icon, 22));
  }
  const label = el("span", "room-txt");
  label.append(
    el("b", "room-nm", ch.name),
    el("span", "room-lv", maxed ? "MAX" : `LV ${lv}/${ch.max}`),
  );
  room.append(pocket, label);
  room.onclick = on.onOpen;

  row.append(spine, room);
  return row;
}

/** What this chamber is, what it does now, what the next level buys, and the price. */
function detail(
  ch: ChamberDef, lv: number, purse: number, maxed: boolean, onBuy: () => void,
): HTMLElement {
  const cost = chamberCost(lv);
  const box = el("div", "room-open");
  box.appendChild(el("div", "chdesc", ch.desc));

  /*
   * The reason to spend, stated as a comparison rather than a sentence. Both rows carry
   * the whole phrase deliberately: they sit on one left edge, so the repetition is what
   * makes the single word that changed impossible to miss.
   */
  const eff = el("div", "cheff");
  eff.appendChild(effectRow("now", "Now", lv ? ch.effect(lv) : "Not excavated"));
  if (!maxed) eff.appendChild(effectRow("next", "Next", ch.effect(lv + 1)));
  box.appendChild(eff);

  const foot = el("div", "chfoot");
  foot.append(
    pips(lv, ch.max),
    buyButton({ icon: "mycel", cost, maxed, affordable: purse >= cost, onBuy }),
  );
  box.appendChild(foot);
  return box;
}

/** A labelled value on the panel's shared left edge. */

/* ------------------------------------------------------------------ THE GRANARY */

/** The open-state key for the granary. It has no ChamberId — it is not a chamber. */
const GRANARY = "granary";

const GRANARY_DESC =
  "Harvester workers carry seed back around the clock and store it underground. "
  + "The brood eats whether or not the colony is at war, so the colony grows between matches.";

/**
 * Troops an hour, at a size that runs from a third of one to thousands.
 *
 * A fraction has to survive being written down or the first level reads as "+0/h" and
 * looks broken; past ten troops the decimal is noise and the figure needs compacting like
 * every other colony number does.
 */
export const perHour = (rate: number): string =>
  rate >= 10 ? compact(Math.round(rate)) : rate.toFixed(1);

/**
 * What a level is worth, in the player's own terms.
 *
 * The rate is DERIVED from what a victory pays (platform/granary.ts) — that is how it stays
 * honest at every colony size — but that is our reference, not the player's. They are told
 * what comes in per hour and what that adds up to in a day; a rate expressed in wins would
 * be asking them to price one thing in another.
 */
/**
 * What a level is worth, in the two numbers it actually moves.
 *
 * It used to read "+0.5 troops/hour · 12 a day", and the day figure was the rate times
 * twenty-four — which is only true for somebody who empties the store every time it
 * fills. What a player really carries in is one FULL STORE, so that is the second number,
 * with the hours it takes to fill beside it. Most of what a level buys now is that store
 * (granary.ts), so a comparison that omitted it would omit the reason to buy.
 */
const rateLine = (rate: number, lid: number): string =>
  `+${perHour(rate)} troops/hour · ${compact(Math.floor(rate * lid))} a full store (${lid}h)`;

/**
 * The granary, drawn as a room in the same nest.
 *
 * It carries a chapter gate as well as a price, which no chamber does: mycelium alone
 * could be saved on day one, and the passive rate must not run ahead of the colony that
 * is meant to be earning it.
 */
function granaryRoom(
  g: GranaryState, on: RoomHandlers,
): HTMLElement {
  const maxed = !g.next;
  const row = el("div", "nest-lvl left"
    + " dug" + (maxed ? " maxed" : ""));
  row.dataset.chamber = GRANARY;

  const spine = el("div", "nest-spine");
  // Preserve the existing row sizing; one SVG behind the rooms draws the tunnels.
  spine.setAttribute("aria-hidden", "true");

  const room = el("button", "room");
  room.type = "button";
  room.setAttribute("aria-expanded", "false");
  room.setAttribute("aria-haspopup", "dialog");
  const pocket = el("span", "room-pocket");
  pocket.appendChild(icon("granary", 22));
  const label = el("span", "room-txt");
  label.append(
    el("b", "room-nm", "Granary"),
    el("span", "room-lv", maxed ? "MAX" : `LV ${g.level}/${GRANARY_MAX}`),
  );
  room.append(pocket, label);
  room.onclick = on.onOpen;

  row.append(spine, room);
  return row;
}

function granaryDetail(g: GranaryState, purse: number, onBuy: () => void): HTMLElement {
  const box = el("div", "room-open");
  box.appendChild(el("div", "chdesc", GRANARY_DESC));

  const eff = el("div", "cheff");
  eff.appendChild(effectRow("now", "Now", rateLine(g.rate, g.def.lid)));
  if (g.next) {
    eff.appendChild(effectRow("next", "Next",
      rateLine(g.rate * (g.def.hours / g.next.hours), g.next.lid)));
  }
  box.appendChild(eff);

  // What is standing in the store, and the lid on it. The number is read-only here: it is
  // collected on the home screen, which is the one screen a player always passes through.
  const store = el("div", "gstore");
  store.append(
    el("span", "gstore-k", `Store · holds ${g.def.lid}h`),
    el("span", "gstore-v", `${compact(g.stored)} / ${compact(g.full)}`),
  );
  const track = el("div", "hl-track");
  const fill = el("span", "hl-fill");
  fill.style.width = `${g.full > 0 ? Math.round(Math.min(1, g.stored / g.full) * 100) : 0}%`;
  track.appendChild(fill);
  store.appendChild(track);
  box.appendChild(store);

  const foot = el("div", "chfoot");
  const locked = !!g.next && g.chapter < g.next.chapter;
  foot.append(
    pips(g.level, GRANARY_MAX),
    // A level the road has not reached says WHEN, not "you cannot afford it": the price is
    // not the thing standing in the way, and showing it as unaffordable would be a lie.
    locked && g.next
      ? el("span", "glock", `Chapter ${g.next.chapter}`)
      : buyButton({
        icon: "mycel",
        cost: g.next?.cost ?? 0,
        maxed: !g.next,
        affordable: !!g.next && purse >= g.next.cost,
        onBuy,
      }),
  );
  box.appendChild(foot);
  return box;
}
