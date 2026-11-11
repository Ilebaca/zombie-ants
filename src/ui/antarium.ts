/**
 * The Antarium: the collection, and the way into per-species research.
 *
 * DRAWN TO A DESIGN (Figma `Zombie Ants` → node `134:305`), the third screen handed over
 * finished rather than described — after home and the shop — and built from the same
 * shared language they are (`:root` in `skin.css`). What that language could not already
 * supply is the one thing this screen is about: a colony is a TILE OF ITS RARITY'S
 * COLOUR, big enough to read across a grid, which is `TierDef.fill` (engine/tiers.ts).
 *
 * THE LEVEL IS A BADGE IN THE TILE'S CORNER, and it says whether the colony is YOURS
 * before it says anything else: 0 on a colony you do not own, 1 the moment you buy one,
 * and a rung per research level after that. A locked tile is grey, which is the same
 * sentence said in colour.
 *
 * Class names that come from the ported stylesheet (src/ui/game.css) are load-bearing;
 * the ones added here are dressed at the foot of `skin.css`.
 *
 * Nothing here computes a modifier. `ProfileStore.modsFor` stays the only source of
 * PlayerMods; this screen reads levels and prices, and asks the store to spend.
 */
import { SPECIES } from "../engine";
import type { SpeciesId } from "../engine";
import {
  RESEARCH_TOTAL_MAX, SPECIES_ORDER, SPECIES_UNLOCK, TIERS, tierOf,
} from "../platform";
import type { ProfileStore, Research } from "../platform";
import { cardArt } from "./cards";
import { el, hudMark, redraw, screenEl, screenHeader, toast } from "./chrome";

export interface AntariumOptions {
  /** Opens the per-species page. The app router owns which screen is showing. */
  onOpenSpecies: (id: SpeciesId) => void;
}

/* ------------------------------------------------------------------ COLLECTION */

export function buildAntarium(store: ProfileStore, opts: AntariumOptions): HTMLElement {
  const root = screenEl("antarium");
  /** The colony the banner is describing — the one the player last tapped. */
  let selected: SpeciesId = store.get().lastSpecies;

  const render = (): void => {
    redraw(root);
    // This page spends mycelium; the shared header chip shows the current balance.
    screenHeader(root, { title: "Antarium", mycel: store.get().mycel });

    const body = el("div", "screenbody sb-top");
    body.append(banner(), cta(), grid());
    root.appendChild(body);
  };

  /**
   * THE TILE IS THE COLONY: its rarity's colour, the level in the corner, and the picture
   * on top once there is one.
   *
   * `cardArt` supplies the collection portraits from `src/ui/cards/`; colonies without
   * artwork keep their rarity colour. Locked portraits are desaturated by the same
   * tile state that supplies their grey background.
   */
  const tile = (id: SpeciesId): HTMLElement => {
    const owned = store.isUnlocked(id);
    const box = el("div", "an-tile" + (owned ? "" : " locked"));
    // A LOCKED TILE TAKES NO FILL AT ALL rather than being painted grey here: the
    // stylesheet's `.locked` rule is what greys it, so there is one place that decides
    // what "you do not own this" looks like.
    if (owned) box.style.setProperty("--fill", tierOf(id).fill);
    box.appendChild(el("span", "an-lv", String(levelOf(store, id))));

    const art = cardArt(id);
    if (art) {
      const img = document.createElement("img");
      img.className = "an-art";
      img.src = art;
      // Silent: the tile always sits inside something already naming the colony — the
      // banner's own name line, or the card's name underneath it.
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      box.appendChild(img);
    }
    return box;
  };

  /** The hero strip: the colony's tile, its two numbers, its name and its research. */
  const banner = (): HTMLElement => {
    const id = selected;
    const species = SPECIES[id];
    const research = researchOf(store, id);

    const box = el("div", "rbanner");
    box.id = "antBanner";
    box.appendChild(tile(id));

    const info = el("div", "rb-info");
    // THE TWO NUMBERS LEAD, because they are what the colony IS. The rarity word that
    // used to sit here is gone: the tile under it is painted in that rarity's colour and
    // the section the card sits in is headed with its name, so a third saying was the
    // same fact written three ways on one screen.
    const meta = el("div", "rb-meta");
    meta.append(
      statChip("attack", (species.atk * (1 + research.mandible * 0.05)).toFixed(2)),
      statChip("defence", (species.def * (1 + research.cuticle * 0.05)).toFixed(2)),
    );
    info.append(
      meta,
      el("div", "rb-name", species.name),
      el("div", "rb-tag", species.blurb),
      segments(levelOf(store, id)),
    );
    box.appendChild(info);
    return box;
  };

  /**
   * THE LEVEL AS RUNGS, one per level the colony can reach.
   *
   * It is the SAME number the badge carries, drawn long instead of short — so a colony
   * on 16 has sixteen lit squares and one that was bought this minute has one. It was
   * research-out-of-fifteen for a day, which meant the badge said 1 over a bar with
   * nothing in it; two readings of one thing that did not agree.
   *
   * The count is `LEVEL_MAX`, never a number written down here — the design drew ten and
   * the ladder is sixteen, and a bar that disagrees with the screen it opens is the app
   * lying about how far there is to go. They share the row's width, so retuning the
   * research tree moves the rungs rather than overflowing them.
   */
  const segments = (done: number): HTMLElement => {
    const bar = el("div", "rb-seg");
    for (let i = 0; i < LEVEL_MAX; i++) {
      bar.appendChild(el("span", "rb-pip" + (i < done ? " on" : "")));
    }
    return bar;
  };

  /**
   * One button under the banner. It either opens the colony's page or buys it — and when
   * the player cannot afford it, it still names the price rather than going blank.
   */
  const cta = (): HTMLElement => {
    const id = selected;
    const species = SPECIES[id];
    const owned = store.isUnlocked(id);
    const price = SPECIES_UNLOCK[id];
    const affordable = store.get().mycel >= price;
    // A slab that cannot do anything darkens its FILL rather than staying green and
    // refusing — the same rule the shop's sold-out price follows.
    const dead = !owned && (species.premium || !affordable);

    const btn = el("button", "cta antcta" + (owned ? "" : " locked") + (dead ? " off" : ""));
    btn.id = "antCTA";
    btn.disabled = dead;
    if (owned) {
      btn.textContent = "Upgrade & research";
    } else {
      btn.append(hudMark("mycel", 22), el("span", "ant-price", String(price)));
      btn.setAttribute("aria-label", `Unlock ${species.name} for ${price} mycelium`);
    }

    btn.onclick = () => {
      if (owned) { opts.onOpenSpecies(id); return; }
      // Premium colonies are a shop purchase (roadmap step 5); soft currency must not
      // reach them however much of it the player has.
      if (species.premium) { toast(root, `${species.name} arrives with the shop.`, "warn"); return; }
      if (!affordable) { toast(root, "Not enough mycel — win matches to earn more.", "warn"); return; }
      if (store.unlockSpecies(id)) {
        render();
        toast(root, `${species.name} joined your colony`, "hive");
      }
    };
    return btn;
  };

  /** The collection, one block per rarity tier. */
  const grid = (): HTMLElement => {
    const wrap = el("div", "antscroll");
    wrap.id = "antGrid";

    for (const tier of TIERS) {
      const ids = SPECIES_ORDER.filter((id) => tierOf(id).k === tier.k);
      if (!ids.length) continue;

      // THE HEADING IS NOT PAINTED IN THE TIER'S COLOUR. Every tile under it already is,
      // in a far larger area — and a rule drawn between the name and the count, which the
      // legacy heading carried, is a third mark on a line that is two short words.
      const head = el("div", "tierhead");
      head.append(
        el("span", "tl", tier.name),
        el("span", "tc", `${ids.filter((id) => store.isUnlocked(id)).length}/${ids.length}`),
      );
      const cards = el("div", "cgrid");
      for (const id of ids) cards.appendChild(collectionCard(id));

      // A HEADING AND ITS GRID ARE ONE BLOCK. Left as siblings of the scroller they sat
      // on its single gap, so the space above a heading and the space under it were the
      // same — which reads as a label floating between two rows rather than as the name
      // of the one below it.
      const group = el("div", "tiergrp");
      group.append(head, cards);
      wrap.appendChild(group);
    }
    return wrap;
  };

  const collectionCard = (id: SpeciesId): HTMLElement => {
    const owned = store.isUnlocked(id);
    const card = el("div",
      ["ccard", owned ? "" : "locked", SPECIES[id].premium ? "prem" : "",
        id === selected ? "sel" : ""].filter(Boolean).join(" "));
    card.dataset.ant = id;

    card.appendChild(tile(id));
    // THE NAME AND NOTHING UNDER IT. The card used to carry the colony's attack and
    // defence as a bare pair — "0.86 · 0.87" — which is two numbers with no label, no
    // scale and nothing to compare them against, and reads as some kind of level rather
    // than as a stat. Both figures are a tap away as LABELLED chips on the banner above,
    // and the colony's own page draws them as bars measured against every other colony.
    //
    // The PRICE went with the veil that used to carry it. A locked tile is grey and its
    // level is 0, which is what says it is not yours; the price is a thing to act on, so
    // it belongs on the one control that can act on it.
    card.appendChild(el("div", "cname", SPECIES[id].name));

    card.onclick = () => { selected = id; render(); };
    return card;
  };

  render();
  return root;
}

/* -------------------------------------------------------------------- SHARED */

const researchOf = (store: ProfileStore, id: SpeciesId): Research =>
  store.get().research[id] ?? { reservoir: 0, mandible: 0, cuticle: 0 };

const researchTotal = (r: Research): number => r.reservoir + r.mandible + r.cuticle;

/**
 * THE NUMBER IN THE TILE'S CORNER.
 *
 * Zero means "not yours" and nothing else, which is why it is the one value a colony you
 * own can never show: buying one is itself the first level. Everything after that is a
 * research level, so the badge and the banner's rungs are two views of one number rather
 * than two numbers that can drift.
 */
export const levelOf = (store: ProfileStore, id: SpeciesId): number =>
  store.isUnlocked(id) ? 1 + researchTotal(researchOf(store, id)) : 0;

/**
 * The top of that ladder: every research level, plus the one for owning the colony.
 *
 * DERIVED, never typed. It is what the banner draws a square for, so a retune of the
 * research tree moves the bar and the badge's ceiling together — written out, the bar
 * would quietly stop one short of a level the player can actually reach.
 */
export const LEVEL_MAX = 1 + RESEARCH_TOTAL_MAX;

/** One species stat: a mark and a number, in the pill the stylesheet draws. */
function statChip(mark: string, value: string): HTMLElement {
  const chip = el("span", "statchip");
  chip.append(hudMark(mark, 14), el("span", undefined, value));
  return chip;
}
