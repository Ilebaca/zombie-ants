/**
 * A COLONY'S PAGE: what it is, and what you can do to it.
 *
 * It was four grey cards of the same shape stacked down a page — a hero box, a "combat
 * profile" of bars measured against nothing, the research list, and then the trait, the
 * field notes and the ability in three more boxes with the cooldown printed in all of
 * them. Every other screen in the app had been rebuilt around one row idiom and this one
 * still read as the legacy build.
 *
 * Three things the rebuild is actually for:
 *
 * 1. RESEARCH IS THE POINT OF THE SCREEN, so it comes first and states NOW against NEXT —
 *    the Anthill's idiom (ui/anthill.ts), because a price beside "+5% attack per level"
 *    never says which level you are on or what the next one buys. The reservoir does four
 *    different things and the old summary named one; `ResearchDef.at` spells out what a
 *    given level gives THIS colony (platform/catalogue.ts).
 * 2. THE BARS ARE MEASURED AGAINST THE OTHER COLONIES. They were drawn against a made-up
 *    ceiling of 1.7, so a species at 0.90 filled half a bar and meant nothing. The track
 *    is the real span of every species in the game now, read off `SPECIES` so it can never
 *    drift, and the mark says where this one sits in it.
 * 3. THE COOLDOWN IS STATED ONCE. It was in the stat block, in a note under it and in the
 *    ability card's header, and in one of those places it read "7t → 7t", which is what an
 *    unchanged number looks like when it is printed with an arrow.
 *
 * The dead "Customize" tab is gone with them. It sold skins from the lucky hatch, which is
 * not built (CLAUDE.md §9), so it was a tab that could only ever raise a toast — the same
 * thing Settings' Sound switch was.
 */
import {
  RESEARCH_MAX, SPECIES, TIERS, abilityCooldown, looksFor, researchCost, NEUTRAL_MODS,
} from "../engine";
import type { Look, SpeciesId } from "../engine";
import {
  RESEARCH_TOTAL_MAX, RESEARCH_TRACKS, SPECIES_NOTES, TRAITS_CHAPTER, tierOf,
} from "../platform";
import type { ProfileStore, Research, ResearchDef } from "../platform";
import { SPECIES_COL } from "../render";
import { antPortrait, buyButton, effectRow, el, pips, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";
import { traitOpener } from "./traits";

export interface SpeciesPageOptions {
  species: SpeciesId;
  onBack: () => void;
  /** Open this colony's five trait slots. */
  onTraits?: () => void;
}

export function buildSpeciesPage(store: ProfileStore, opts: SpeciesPageOptions): HTMLElement {
  const root = screenEl("antup");
  const id = opts.species;
  const species = SPECIES[id];

  const render = (): void => {
    const profile = store.get();
    const research = researchOf(store, id);
    const tier = tierOf(id);
    redraw(root);

    screenHeader(root, {
      title: species.name,
      sub: "Upgrades & research",
      onBack: opts.onBack,
      backId: "aupBack",
      titleId: "aupTitle",
      subId: "aupSub",
      pheromone: profile.pheromone,
    });

    const body = el("div", "screenbody sb-top");
    const page = el("div", "spgwrap");
    page.id = "aupBody";

    // THE TRAITS RIDE IN THE HERO, as its last row.
    //
    // They were a section of their own between the hero and the research list — a
    // heading, a card, and a gap either side of it, for one row that is a summary of what
    // this colony is WEARING. Everything else in that card is a summary of what the
    // colony IS (its numbers, and how far its research has come), so the loadout belongs
    // with them; a section is for a list, and this is not one. It stays a door: the pips
    // say which five, and the row opens the bench.
    page.appendChild(hero(id, research, tier.name, tier.col, store.lookFor(id),
      traitOpener(store, id, () => opts.onTraits?.(),
        store.traitsOpen() ? null : `Chapter ${TRAITS_CHAPTER}`)));

    page.appendChild(el("div", "secthead", "Research"));
    const list = el("div", "spglist");
    for (const track of RESEARCH_TRACKS) {
      list.appendChild(trackRow(track, research[track.id], profile.pheromone));
    }
    page.appendChild(list);

    // SKINS COME AFTER RESEARCH, and they are the whole of what this screen can CHANGE
    // for free. Research is the point of the page and leads it; a look costs nothing,
    // affects nothing, and is the one thing here a player picks rather than buys.
    page.appendChild(el("div", "secthead", "Skins"));
    page.appendChild(skinRow());

    page.appendChild(el("div", "secthead", species.ability.name));
    page.appendChild(abilityCard(id, research));

    page.appendChild(el("div", "secthead", "The colony"));
    page.appendChild(loreCard(id));

    body.appendChild(page);
    root.appendChild(body);
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

  /** One research track: what it is, what you have, what the next level buys, the price. */
  const trackRow = (track: ResearchDef, level: number, purse: number): HTMLElement => {
    const maxed = level >= RESEARCH_MAX;
    // "No bonus" is not an achievement, so an untouched track does not print its NOW row
    // in the colour that means "you have this" — the same rule the Anthill's chambers follow.
    const row = el("div", "spgtrack" + (maxed ? " maxed" : "") + (level ? "" : " fresh"));
    row.dataset.track = track.id;

    const head = el("div", "spgthead");
    const mark = el("span", "spgti");
    mark.appendChild(icon(track.icon, 18));
    const title = el("div", "spgtt");
    title.append(
      el("b", "spgtn", track.name),
      el("span", "spgtl", maxed ? "MAX" : `LV ${level}/${RESEARCH_MAX}`),
    );
    head.append(mark, title);
    row.appendChild(head);
    row.appendChild(el("p", "spgtd", track.desc));

    // NOW against NEXT, on one left edge — the same comparison the Anthill's chambers make,
    // and the reason it is worth repeating: the single phrase that changed is the whole
    // reason to spend, and it is the hardest thing to find in a paragraph.
    const eff = el("div", "cheff");
    eff.appendChild(effectRow("now", "Now", track.at(level, opts.species)));
    if (!maxed) eff.appendChild(effectRow("next", "Next", track.at(level + 1, opts.species)));
    row.appendChild(eff);

    const cost = researchCost(level);
    const foot = el("div", "chfoot");
    foot.append(pips(level, RESEARCH_MAX), buyButton({
      icon: "pheromone",
      cost,
      maxed,
      affordable: purse >= cost,
      onBuy: () => {
        if (!store.buyResearch(opts.species, track.id)) return;
        render();
        toast(root, `${track.name} → Lv ${level + 1}`, "hive");
      },
    }));
    row.appendChild(foot);
    return row;
  };

  render();
  return root;
}

/* ------------------------------------------------------------------------ THE HERO */

/**
 * The colony itself: its face, its tier, and where it sits against every other colony.
 *
 * The stat bars run over the REAL span of the game's species rather than a made-up
 * ceiling, so "0.90" means something: it is read off `SPECIES`, and a balance change moves
 * the track on the same commit.
 */
function hero(
  id: SpeciesId, research: Research, tierName: string, tierCol: string, look: Look,
  traits: HTMLElement,
): HTMLElement {
  const species = SPECIES[id];
  const pal = SPECIES_COL[id];
  const box = el("div", "spghero");
  box.style.setProperty("--tc", tierCol);

  const port = antPortrait(id, 240, "spgport", look);
  port.id = "aupPort";
  box.appendChild(port);

  const who = el("div", "spgwho");
  who.appendChild(el("div", "spgtier", species.premium ? "Mythic · Premium" : tierName));
  const name = el("div", "spgname", species.name);
  name.style.color = pal[1] as string;
  who.append(name, el("div", "spgblurb", species.blurb));
  box.appendChild(who);

  const stats = el("div", "spgstats");
  stats.append(
    statBar("Attack", species.atk, species.atk * (1 + research.mandible * 0.05), "atk", tierCol),
    statBar("Defense", species.def, species.def * (1 + research.cuticle * 0.05), "def", tierCol),
  );
  box.appendChild(stats);

  // How far along the whole colony is, which the page could only say as "LV 3 / 15".
  const total = researchTotal(research);
  const done = el("div", "spgdone");
  done.append(
    el("span", "spgdone-k", "Researched"),
    el("span", "spgdone-v", `${total} of ${RESEARCH_TOTAL_MAX}`),
  );
  const track = el("div", "hl-track");
  const fill = el("span", "hl-fill");
  fill.style.width = `${Math.round((total / RESEARCH_TOTAL_MAX) * 100)}%`;
  track.appendChild(fill);
  done.appendChild(track);
  box.appendChild(done);

  // Last, and on the card's own surface rather than in a box of its own — it is the
  // fourth thing this card says about the colony, not a fourth card.
  box.appendChild(traits);
  return box;
}

/**
 * The span every colony's attack or defence falls in, read off the species table.
 *
 * Hardcoding it would go stale the first time a multiplier is retuned, and the bar would
 * quietly start lying about where a colony stands.
 */
function span(kind: "atk" | "def"): { min: number; max: number } {
  const all = Object.values(SPECIES).map((s) => (kind === "atk" ? s.atk : s.def));
  return { min: Math.min(...all), max: Math.max(...all) };
}

/** One stat: the base ghosted, the researched value filled, and the figure. */
function statBar(
  label: string, base: number, now: number, kind: "atk" | "def", colour: string,
): HTMLElement {
  const { min, max } = span(kind);
  // A little headroom below the smallest and above the largest, so the weakest colony's
  // bar is not empty and the strongest one's is not indistinguishable from full.
  const lo = min - (max - min) * 0.25;
  const at = (v: number): number => Math.max(4, Math.min(100, ((v - lo) / (max - lo)) * 100));

  const row = el("div", "spgstat");
  row.append(el("span", "spgstat-k", label));
  // The RESEARCHED length goes down first and the base sits on top of it, so what shows
  // past the end of the base is exactly what the player added. Drawn the other way round
  // the base disappears under the fill and the bar says nothing about research at all.
  const bar = el("span", "spgstat-b");
  const grown = el("span", "spgstat-f grown");
  grown.style.width = `${at(now)}%`;
  const own = el("span", "spgstat-f base");
  own.style.width = `${at(base)}%`;
  own.style.background = colour;
  bar.append(grown, own);
  row.appendChild(bar);
  row.appendChild(el("span", "spgstat-v" + (now > base ? " up" : ""), now.toFixed(2)));
  return row;
}

/* --------------------------------------------------------------------- THE ABILITY */

/**
 * The ability, in ONE place.
 *
 * Its cooldown used to be printed three times — in the stat block, in a note beneath it,
 * and in the header of the card that described it. In one of those it read "7t → 7t",
 * which is what an unchanged number looks like when it is written with an arrow: only a
 * MAXED reservoir shortens a cooldown (engine/abilities.ts), so for most of a career the
 * arrow pointed at the number it started from.
 */
function abilityCard(id: SpeciesId, research: Research): HTMLElement {
  const species = SPECIES[id];
  const cd = abilityCooldown(species.ability, { ...NEUTRAL_MODS, reservoir: research.reservoir });
  const box = el("div", "spgcard");

  const chips = el("div", "spgchips");
  chips.append(chip("clock", `${cd}-turn cooldown`, cd < species.ability.cooldown));
  if (research.reservoir > 0) {
    chips.append(chip("flask", `Potency x${(1 + 0.06 * research.reservoir).toFixed(2)}`, true));
  }
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

/** A labelled value on a shared left edge — the Anthill's comparison row. */

const researchOf = (store: ProfileStore, id: SpeciesId): Research =>
  store.get().research[id] ?? { reservoir: 0, mandible: 0, cuticle: 0 };

const researchTotal = (r: Research): number => r.reservoir + r.mandible + r.cuticle;
