/** Species upgrades: ten shared levels, combat stats and a single trait row. */
import { groupSections } from "./groups";
import {
  SPECIES_LEVEL_MAX, RESEARCH_STAT_CAP, COOLDOWN_CHANCE_CAP, SPECIES, TIERS,
  looksFor, researchCost, researchedStats,
} from "../engine";
import type { Look, SpeciesId } from "../engine";
import {
  SPECIES_NOTES, tierOf,
} from "../platform";
import type { ProfileStore } from "../platform";
import { SPECIES_COL } from "../render";
import { antPortrait, buyButton, el, redraw, screenEl, screenHeader, toast } from "./chrome";
import { researchPips } from "./research";
import { abilityArtFor } from "./abilityart";
import { coverFor } from "./covers";
import { icon } from "./icons";
import { buildTraitSlots } from "./traits";

export interface SpeciesPageOptions {
  species: SpeciesId;
  onBack: () => void;
  /** Open this colony's five trait slots. */
}

export function buildSpeciesPage(store: ProfileStore, opts: SpeciesPageOptions): HTMLElement {
  const root = screenEl("antup");
  const id = opts.species;
  const species = SPECIES[id];

  const render = (): void => {
    const profile = store.get();
    const level = profile.research[id]?.level ?? 0;
    const tier = tierOf(id);
    redraw(root);

    screenHeader(root, {
      title: species.name, onBack: opts.onBack,
      backId: "aupBack",
      titleId: "aupTitle",
      pheromone: profile.pheromone,
    });

    const body = el("div", "screenbody sb-top");
    const page = el("div", "spgwrap");
    page.id = "aupBody";

    // THE COVER LEADS THE PAGE. This screen is where a colony is bought, researched and
    // dressed, and until now it opened on the same 240px head that marks a row in a list.
    // A painting of the animal says what the colony IS in the time it takes to look at
    // it, which is the one thing a stat bar cannot do.
    page.appendChild(cover(id, store.lookFor(id)));

    const maxed = level >= SPECIES_LEVEL_MAX;
    const cost = researchCost(level);
    const upgrade = buyButton({
      icon: "pheromone", cost, maxed,
      affordable: store.isUnlocked(id) && profile.pheromone >= cost,
      onBuy: () => {
        if (!store.buyResearch(id)) return;
        render();
        toast(root, `${species.name} → Lv ${level + 1}`, "hive");
      },
    });
    upgrade.id = "spgUpgrade";
    upgrade.classList.add("spgupgrade");
    if (!maxed) {
      upgrade.prepend(el("span", "spgupgrade-label", "Upgrade"));
      upgrade.setAttribute("aria-label", `Upgrade ${species.name} to level ${level + 1} for ${cost} pheromone crystals`);
    }
    page.appendChild(hero(id, level, tier.name, tier.col, upgrade,
      buildTraitSlots(store, { scope: id })));

    // SKINS COME AFTER RESEARCH, and they are the whole of what this screen can CHANGE
    // for free. Research is the point of the page and leads it; a look costs nothing,
    // affects nothing, and is the one thing here a player picks rather than buys.
    page.appendChild(el("div", "secthead", "Skins"));
    page.appendChild(skinRow());

    page.appendChild(el("div", "secthead", species.ability.name));
    page.appendChild(abilityCard(id));

    page.appendChild(el("div", "secthead", "The colony"));
    page.appendChild(loreCard(id));

    body.appendChild(page);
    root.appendChild(body);
    groupSections(root);
  };

  /**
   * THE THREE LOOKS, AS THE THINGS THEY ARE.
   *
   * Each is the colony's own head drawn WEARING it, in that look's own colours — a skin
   * shown as a name over a generic mark would be the one prize in this game the screen
   * refuses to show. The basic look is always there and always wearable, so a player can
   * put a skin back; a locked one is drawn all the same, greyed, because seeing the two
   * you have not found is the reason to keep opening the hatch.
   *
   * Choosing is a tap, and it takes effect everywhere at once — the board, the pickers,
   * the plates beside the nest — because `ProfileStore.lookFor` is the single answer to
   * "what does this colony look like".
   */
  const skinRow = (): HTMLElement => {
    const worn = store.lookFor(id);
    const row = el("div", "skinrow");
    row.id = "spgSkins";

    for (const look of looksFor(id)) {
      const basic = look.id === looksFor(id)[0]?.id;
      const owned = basic || store.hasSkin(look.id);
      const on = look.id === worn.id;

      const card = el("button", "skincard"
        + (on ? " on" : "") + (owned ? "" : " locked")
        + (look.tier ? " tiered" : "")) as HTMLButtonElement;
      card.type = "button";
      card.dataset.look = look.id;
      card.disabled = !owned;

      // The card carries the look's RARITY, in the game's one colour for it — a skin is
      // Exceptional or Mythic and nothing below, and a locked card that does not say which
      // is a chase with no idea how long it is.
      const tier = look.tier ? TIERS[look.tier] : null;
      if (tier) card.style.setProperty("--tier", tier.colour);

      const face = el("span", "skincard-p");
      face.appendChild(antPortrait(id, 96, "skincard-c", look));
      card.append(face, el("span", "skincard-n", look.name));
      if (tier) card.appendChild(el("span", "skincard-t", tier.name));
      // The state is written, never left to the border alone: "on" and "owned but not
      // worn" are one hairline apart, and the difference is the whole of what the row says.
      card.append(el("span", "skincard-s", on ? "Worn" : owned ? "Wear" : "Locked"));

      if (owned) card.onclick = () => { store.wearSkin(id, look.id); render(); };
      row.appendChild(card);
    }
    return row;
  };

  render();
  return root;
}

/* ------------------------------------------------------------------------ THE HERO */

/**
 * THE PAINTING AT THE TOP, or the colony's own head while it is still to be painted.
 *
 * The BOX is the same either way — one ratio, stated once in `skin.css` and matching the
 * size the paintings are delivered at — so the page has the same shape on every colony
 * and a cover landing later moves nothing. `ui/covers.ts` is the table.
 *
 * The fallback is a CANVAS rather than a grey rectangle: the head is drawn by the same
 * code the board draws it with, wearing whatever look this colony has on, so a page with
 * no painting is still a picture of the right colony rather than a hole where one goes.
 */
function cover(id: SpeciesId, look: Look): HTMLElement {
  const box = el("div", "spgcover");
  box.id = "aupCover";
  const art = coverFor(id);
  if (art) {
    const img = document.createElement("img");
    img.src = art;
    img.className = "spgcover-img";
    // Named, because it is the one picture on this screen that is not beside the words
    // it illustrates — the colony's name is in the header above it, not next to it.
    img.alt = `${SPECIES[id].name}`;
    // It is the first thing on the page and the page is reached by a tap, so it is
    // already in the viewport: loading it lazily would show the plate and then swap.
    img.decoding = "async";
    box.appendChild(img);
  } else {
    box.classList.add("plain");
    box.appendChild(antPortrait(id, 320, "spgcover-head", look));
  }
  return box;
}

function hero(
  id: SpeciesId, level: number, tierName: string, tierCol: string,
  upgrade: HTMLElement, traits: HTMLElement,
): HTMLElement {
  const species = SPECIES[id];
  const pal = SPECIES_COL[id];
  const box = el("div", "spghero");
  box.style.setProperty("--tc", tierCol);

  const who = el("div", "spgwho");
  who.appendChild(el("div", "spgtier", species.premium ? "Mythic · Premium" : tierName));
  const name = el("div", "spgname", species.name);
  name.style.color = pal[1] as string;
  who.append(name, el("div", "spgblurb", species.blurb));
  box.appendChild(who);

  const done = el("div", "spgdone");
  done.append(
    el("span", "spgdone-k", "Level"),
    el("span", "spgdone-v", `${level} / ${SPECIES_LEVEL_MAX}`),
    researchPips(level),
  );
  box.appendChild(done);

  const now = researchedStats(id, level);
  const stats = el("div", "spgstats");
  stats.append(
    statBar("Attack", species.atk, now.attack, statRange("atk"), tierCol),
    statBar("Defense", species.def, now.defence, statRange("def"), tierCol),
    statBar("Cooldown", 0, now.cooldown, { min: 0, max: COOLDOWN_CHANCE_CAP }, tierCol, true),
  );
  box.append(stats, el("p", "spgcooldown-note",
    "Chance each turn to reduce ability cooldown by one extra turn."), upgrade, traits);
  return box;
}

/** Every species shares the same attack/defence scale, including research headroom. */
function statRange(kind: "atk" | "def"): { min: number; max: number } {
  const values = Object.values(SPECIES).map((s) => s[kind]);
  const min = Math.min(...values);
  const max = Math.max(...values) * (1 + RESEARCH_STAT_CAP);
  return { min: min - (max - min) * 0.25, max };
}

/** Base and upgraded value share a bounded scale. Cooldown shows its 0–10% range. */
function statBar(
  label: string, base: number, now: number, range: { min: number; max: number },
  colour: string, percent = false,
): HTMLElement {
  const at = (value: number): number =>
    Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100));
  const row = el("div", "spgstat");
  row.dataset.stat = percent ? "cooldown" : label.toLowerCase();
  row.append(el("span", "spgstat-k", label));
  const bar = el("span", "spgstat-b");
  const grown = el("span", "spgstat-f grown");
  grown.style.width = `${at(now)}%`;
  const own = el("span", "spgstat-f base");
  own.style.width = `${at(base)}%`;
  own.style.background = colour;
  bar.append(grown, own);
  row.append(bar, el("span", "spgstat-v" + (now > base ? " up" : ""),
    percent ? `${now}%` : now.toFixed(2)));
  return row;
}

/* --------------------------------------------------------------------- THE ABILITY */

/** Base ability rules; the level-based recharge chance is shown with the stats. */
function abilityCard(id: SpeciesId): HTMLElement {
  const species = SPECIES[id];
  const cd = species.ability.cooldown;
  const box = el("div", "spgcard");

  // The painting leads, because it is what tells eight cards apart before any of them is
  // read. It is decorative: the ability's NAME is the heading above this card and its
  // rule is the sentence below, so an alt text here would announce the same thing twice.
  const art = abilityArtFor(species.ability);
  if (art) {
    const img = document.createElement("img");
    img.src = art;
    img.className = "spgability-art";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    box.classList.add("painted");
    box.appendChild(img);
  }

  const chips = el("div", "spgchips");
  chips.append(chip("clock", `${cd}-turn cooldown`, false));
  box.appendChild(chips);
  box.appendChild(el("p", "spgtext", species.ability.desc));
  return box;
}

/** Trait and biology in one card: they are both "what this ant is", not two subjects. */
function loreCard(id: SpeciesId): HTMLElement {
  const box = el("div", "spgcard");
  // "Signature", not "Trait": there are equippable Traits on this page now, and one
  // word for two different things on one screen is the screen contradicting itself.
  box.appendChild(el("div", "spglabel", "Signature"));
  box.appendChild(el("p", "spgtrait", SPECIES[id].trait));
  box.appendChild(el("div", "spglabel", "In the field"));
  box.appendChild(el("p", "spgtext", SPECIES_NOTES[id]));
  return box;
}

/* ---------------------------------------------------------------------- THE PIECES */

/** A mark and a value. `lit` when research has moved it off its base. */
function chip(mark: string, text: string, lit: boolean): HTMLElement {
  const box = el("span", "spgchip" + (lit ? " lit" : ""));
  box.append(icon(mark, 13), el("span", undefined, text));
  return box;
}

