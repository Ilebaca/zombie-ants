/**
 * The Anthill: a cross-section of the nest, dug one chamber at a time.
 *
 * It was a list. Five cards down a page, each naming a chamber and stating a number — an
 * honest table of upgrades and nothing whatever to do with an ant colony. The nest is the
 * one thing on this screen that is a PLACE, so the screen is a picture of it: a shaft going
 * down from the surface with a chamber hollowed out at each level, alternating sides the
 * way a real one branches. Tapping a chamber opens it in place; buying digs it deeper.
 *
 * The picture is DOM, not canvas, for two reasons. Each chamber is a real button, so it
 * takes a tap and a focus ring without any hit-testing of our own; and the whole screen can
 * be driven and asserted on in a jsdom test (CLAUDE.md §11), which a canvas cannot.
 *
 * Chambers are the account-wide half of progression — they apply to whatever species is
 * fielded. The screen only ever *asks* ProfileStore to spend; it never touches the numbers
 * itself, so an unaffordable tap is a no-op rather than a half-finished purchase.
 */
import { chamberCost } from "../engine";
import {
  CHAMBERS, GRANARY_MAX, TRAITS_CHAPTER, compact,
} from "../platform";
import type { ChamberDef, GranaryState, ProfileStore } from "../platform";
import { buyButton, effectRow, el, pips, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";
import { traitOpener } from "./traits";

export interface AnthillOptions {
  /** Open the anthill's five universal trait slots. */
  onTraits?: () => void;
}

export function buildAnthill(store: ProfileStore, opts: AnthillOptions = {}): HTMLElement {
  const root = screenEl("anthill");
  // Which chamber is standing open. It survives a re-render — buying a level must not
  // close the room the player is in the middle of digging.
  let open: string = GRANARY;

  const render = (): void => {
    const profile = store.get();
    const levelOf = (ch: ChamberDef): number => profile.hill[ch.id] ?? 0;

    redraw(root);
    // No back arrow: this is a bottom-nav tab, and the nav is how the player leaves it.
    screenHeader(root, {
      title: "Anthill",
      sub: "Nest chambers & excavation",
      mycel: profile.mycel,
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "hillwrap");

    const dug = CHAMBERS.reduce((n, ch) => n + levelOf(ch), profile.granary);
    const total = CHAMBERS.reduce((n, ch) => n + ch.max, GRANARY_MAX);
    wrap.appendChild(surface(dug, total));

    const nest = el("div", "nest");
    // THE GRANARY IS THE FIRST ROOM DOWN, and it is not a chamber: a chamber changes a
    // match, and this one changes the colony between matches. It shares the picture
    // because it is a room in the same nest — it just belongs to the meta layer, so it
    // has its own level, its own price and its own gate (platform/granary.ts).
    nest.appendChild(granaryRoom(store.granary(), 0, profile.mycel, open === GRANARY, {
      onOpen: () => { open = GRANARY; render(); },
      onBuy: () => {
        if (!store.buyGranary()) return;
        const lv = store.get().granary;
        render();
        toast(root, `Granary → Lv ${lv}`, "hive");
      },
    }));
    CHAMBERS.forEach((ch, i) => {
      nest.appendChild(level(ch, i + 1, levelOf(ch), profile.mycel, open === ch.id, {
        onOpen: () => { open = ch.id; render(); },
        onBuy: () => {
          const was = levelOf(ch);
          if (!store.buyChamber(ch.id)) return;
          // `open` is deliberately not touched: the only buy button on the screen is the
          // one inside the chamber that is already standing open, and re-rendering must
          // leave the player where they were rather than shutting the room they just dug.
          render();
          toast(root, `${ch.name} → Lv ${was + 1}`, "hive");
        },
      }));
    });
    wrap.appendChild(nest);

    // THE UNIVERSAL BENCH LIVES IN THE NEST, under the picture of it — these five apply
    // to whichever colony is fielded, which is exactly what a chamber does, so this is
    // the screen they belong on. It is not IN the cross-section, because a trait is not
    // a room: nothing is dug for it.
    wrap.append(el("div", "secthead", "Traits"));
    wrap.appendChild(traitOpener(store, "hill", () => opts.onTraits?.(),
      store.traitsOpen() ? null : `Chapter ${TRAITS_CHAPTER}`));

    body.appendChild(wrap);
    root.appendChild(body);
  };

  render();
  return root;
}

/**
 * The ground, and the way in.
 *
 * The shaft has to start somewhere or the first chamber floats: this is the mound and the
 * entrance hole the tunnel drops from, with the one figure the screen could never say
 * before — how far along the whole nest is.
 */
function surface(dug: number, total: number): HTMLElement {
  const top = el("div", "nest-top");

  const sky = el("div", "nest-sky");
  sky.append(el("span", "nest-mound"), el("span", "nest-mouth"));
  top.appendChild(sky);

  const sum = el("div", "nest-sum");
  sum.append(
    el("span", "nest-sum-k", "Excavated"),
    el("span", "nest-sum-v", `${dug} / ${total}`),
  );
  const track = el("div", "hl-track");
  const fill = el("span", "hl-fill");
  fill.style.width = `${Math.round((dug / total) * 100)}%`;
  track.appendChild(fill);
  sum.appendChild(track);
  top.appendChild(sum);
  return top;
}

interface RoomHandlers { onOpen: () => void; onBuy: () => void }

/**
 * One level of the nest: the shaft passing through it, and the chamber hollowed out beside.
 *
 * The side alternates so the shaft reads as a tunnel branching rather than a list with an
 * indent, and the open chamber's detail spans the whole width underneath it — a half-column
 * of comparison text would be a paragraph in a gutter.
 */
function level(
  ch: ChamberDef, index: number, lv: number, purse: number, open: boolean, on: RoomHandlers,
): HTMLElement {
  const maxed = lv >= ch.max;
  const side = index % 2 === 0 ? "left" : "right";
  const row = el("div", `nest-lvl ${side}`
    + (lv ? " dug" : " fresh") + (maxed ? " maxed" : "") + (open ? " open" : ""));
  row.dataset.chamber = ch.id;

  const spine = el("div", "nest-spine");
  spine.append(el("span", "nest-line"), el("span", "nest-node"),
    el("span", "nest-depth", String(index + 1)));

  const room = el("button", "room");
  room.type = "button";
  room.setAttribute("aria-expanded", String(open));
  const pocket = el("span", "room-pocket");
  pocket.appendChild(icon(ch.icon, 22));
  const label = el("span", "room-txt");
  label.append(
    el("b", "room-nm", ch.name),
    el("span", "room-lv", maxed ? "MAX" : `LV ${lv}/${ch.max}`),
  );
  room.append(pocket, label);
  room.onclick = on.onOpen;

  row.append(spine, room);
  if (open) row.appendChild(detail(ch, lv, purse, maxed, on.onBuy));
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
  g: GranaryState, index: number, purse: number, open: boolean, on: RoomHandlers,
): HTMLElement {
  const maxed = !g.next;
  const row = el("div", "nest-lvl left"
    + " dug" + (maxed ? " maxed" : "") + (open ? " open" : ""));
  row.dataset.chamber = GRANARY;

  const spine = el("div", "nest-spine");
  spine.append(el("span", "nest-line"), el("span", "nest-node"),
    el("span", "nest-depth", String(index + 1)));

  const room = el("button", "room");
  room.type = "button";
  room.setAttribute("aria-expanded", String(open));
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
  if (open) row.appendChild(granaryDetail(g, purse, on.onBuy));
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
