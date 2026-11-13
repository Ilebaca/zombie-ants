/** Collection portraits, shared levels and species purchases. */
import { SPECIES, SPECIES_LEVEL_MAX } from "../engine";
import type { SpeciesId } from "../engine";
import {
  SPECIES_ORDER, SPECIES_UNLOCK, TIERS, tierOf,
} from "../platform";
import type { ProfileStore } from "../platform";
import { cardArt } from "./cards";
import { researchPips } from "./research";
import { powerTag } from "./power-tag";
import { showRewardReveal } from "./reward-reveal";
import { el, hudMark, redraw, resourcePrice, screenEl, screenHeader, toast } from "./chrome";

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
   * A tile carries the colony art and rarity color; levels are shown by research pips.
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

  /** The hero strip: portrait, total power, name and research progress. */
  const banner = (): HTMLElement => {
    const id = selected;
    const species = SPECIES[id];

    const box = el("div", "rbanner power-host");
    box.id = "antBanner";
    box.appendChild(tile(id));

    const info = el("div", "rb-info");
    const meta = el("div", "rb-meta");
    meta.appendChild(powerTag(store.powerFor(id).total, {context:species.name}));
    info.append(
      meta,
      el("div", "rb-name", species.name),
      el("div", "rb-tag", species.blurb),
      researchPips(levelOf(store, id)),
    );
    box.appendChild(info);
    return box;
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
      const amount = resourcePrice(price, !affordable);
      amount.classList.add("ant-price");
      btn.append(hudMark("mycel", 22), amount);
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
        showRewardReveal(root, [{ kind: "species", species: id }]);
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

    card.classList.add("power-host");
    card.append(tile(id), powerTag(store.powerFor(id).total, {compact:true,context:SPECIES[id].name}));
    // Detailed combat stats belong on the species page; the collection shows name and power.
    // The PRICE went with the veil that used to carry it. A locked tile is grey and its
    // ownership is shown by its gray art; the price is a thing to act on, so
    // it belongs on the one control that can act on it.
    card.appendChild(el("div", "cname", SPECIES[id].name));

    card.onclick = () => { selected = id; render(); };
    return card;
  };

  render();
  return root;
}

/* -------------------------------------------------------------------- SHARED */

/** Ownership is shown by tile color; every colony starts at level zero. */
export const levelOf = (store: ProfileStore, id: SpeciesId): number =>
  store.isUnlocked(id) ? store.get().research[id]?.level ?? 0 : 0;

export const LEVEL_MAX = SPECIES_LEVEL_MAX;

