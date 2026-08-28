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
import { CHAMBERS } from "../platform";
import type { ChamberDef, ProfileStore } from "../platform";
import { buyButton, el, pips, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

export function buildAnthill(store: ProfileStore): HTMLElement {
  const root = screenEl("anthill");
  // Which chamber is standing open. It survives a re-render — buying a level must not
  // close the room the player is in the middle of digging.
  let open: string = CHAMBERS[0]?.id ?? "";

  const render = (): void => {
    const profile = store.get();
    const levelOf = (ch: ChamberDef): number => profile.hill[ch.id] ?? 0;

    root.replaceChildren();
    // No back arrow: this is a bottom-nav tab, and the nav is how the player leaves it.
    screenHeader(root, {
      title: "Anthill",
      sub: "Nest chambers & excavation",
      mycel: profile.mycel,
    });

    const body = el("div", "screenbody sb-top");
    const wrap = el("div", "hillwrap");

    const dug = CHAMBERS.reduce((n, ch) => n + levelOf(ch), 0);
    const total = CHAMBERS.reduce((n, ch) => n + ch.max, 0);
    wrap.appendChild(surface(dug, total));

    const nest = el("div", "nest");
    CHAMBERS.forEach((ch, i) => {
      nest.appendChild(level(ch, i, levelOf(ch), profile.mycel, open === ch.id, {
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
    buyButton({ icon: "🍄", cost, maxed, affordable: purse >= cost, onBuy }),
  );
  box.appendChild(foot);
  return box;
}

/** A labelled value on the panel's shared left edge. */
function effectRow(kind: "now" | "next", label: string, value: string): HTMLElement {
  const row = el("div", "che-row che-" + kind);
  row.append(el("span", "che-k", label), el("span", "che-v", value));
  return row;
}
