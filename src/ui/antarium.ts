/**
 * The Antarium: the collection, and per-species research.
 *
 * Two screens, exactly as the legacy build lays them out:
 *   #antarium — a banner for the selected colony, one call-to-action, and the collection
 *               grouped by rarity tier.
 *   #antup    — that colony's page: combat profile, three research tracks, notes and trait.
 *
 * Class names come from the ported stylesheet (src/ui/game.css) and are load-bearing.
 * Research is per species (CLAUDE.md §11), so levelling Fire buys nothing for Ghost.
 *
 * Nothing here computes a modifier. `ProfileStore.modsFor` stays the only source of
 * PlayerMods; this screen reads levels and prices, and asks the store to spend.
 */
import { NEUTRAL_MODS, SPECIES, abilityCooldown } from "../engine";
import type { SpeciesId } from "../engine";
import {
  RESEARCH_TOTAL_MAX, SPECIES_ORDER, SPECIES_UNLOCK, TIERS, tierOf,
} from "../platform";
import type { ProfileStore, Research } from "../platform";
import { SPECIES_COL } from "../render";
import { antPortrait, el, redraw, screenEl, screenHeader, toast } from "./chrome";
import { icon } from "./icons";

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
    const profile = store.get();
    redraw(root);
    // No back arrow: this is a bottom-nav tab, and the nav is how the player leaves it.
    screenHeader(root, {
      title: "Antarium",
      sub: "Collection & research",
      mycel: profile.mycel,
    });

    const body = el("div", "screenbody sb-top");
    body.append(banner(), cta(), grid());
    root.appendChild(body);
  };

  /** The hero strip: portrait, tier, name, blurb and the researched combat numbers. */
  const banner = (): HTMLElement => {
    const id = selected;
    const species = SPECIES[id];
    const pal = SPECIES_COL[id];
    const tier = tierOf(id);
    const research = researchOf(store, id);
    const owned = store.isUnlocked(id);

    const box = el("div", "rbanner");
    box.id = "antBanner";
    box.style.setProperty("--tc", tier.col);
    box.style.setProperty("--tglow", tier.glow);
    box.appendChild(antPortrait(id, 128));

    const info = el("div", "rb-info");
    info.appendChild(el("div", "rb-tier", species.premium ? "Mythic · Premium" : tier.name));
    // THE LEVEL RIDES WITH THE NAME, hard right.
    //
    // It used to lead the chip row, where it was the widest thing in it and pushed the
    // cooldown onto a second line — four chips wrapping 3 + 1, which reads as a row that
    // did not fit rather than as one that was laid out. It is also not the same KIND of
    // fact as the other three: attack, defence and cooldown are what the colony DOES, and
    // the level is how far this player has taken it. Moved up, the three that belong
    // together sit on one line.
    const nameline = el("div", "rb-nl");
    const name = el("div", "rb-name", species.name);
    name.style.color = pal[1];
    nameline.append(name, el("span", "lv",
      owned ? `LV ${researchTotal(research)}/${RESEARCH_TOTAL_MAX}` : "LOCKED"));
    info.append(nameline, el("div", "rb-tag", species.blurb));

    const meta = el("div", "rb-meta");
    meta.append(
      statChip("attack", (species.atk * (1 + research.mandible * 0.05)).toFixed(2)),
      statChip("defence", (species.def * (1 + research.cuticle * 0.05)).toFixed(2)),
      // "CD" is what the clock mark already says, and the two together did not fit the
      // line. The colony's own page spells the cooldown out in words.
      statChip("clock", `${cooldownOf(id, research)}t`),
    );
    info.appendChild(meta);
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

    const btn = el("button", "cta antcta" + (owned ? "" : " locked"));
    btn.id = "antCTA";
    btn.textContent = owned
      ? "Upgrade & research"
      : affordable ? `Unlock ${species.name} · ${price} mycelium` : `Locked · needs ${price} mycelium`;

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

      const head = el("div", "tierhead");
      head.style.color = tier.col;
      head.append(
        el("span", "tl", tier.name),
        el("span", "tline"),
        el("span", "tc", `${ids.filter((id) => store.isUnlocked(id)).length}/${ids.length}`),
      );
      wrap.appendChild(head);

      const cards = el("div", "cgrid");
      for (const id of ids) cards.appendChild(collectionCard(id, tier.col, tier.glow));
      wrap.appendChild(cards);
    }
    return wrap;
  };

  const collectionCard = (id: SpeciesId, col: string, glow: string): HTMLElement => {
    const species = SPECIES[id];
    const owned = store.isUnlocked(id);
    const research = researchOf(store, id);
    const total = researchTotal(research);

    const card = el("div",
      ["ccard", owned ? "" : "locked", species.premium ? "prem" : "", id === selected ? "sel" : ""]
        .filter(Boolean).join(" "));
    card.dataset.ant = id;
    card.style.setProperty("--tc", col);
    card.style.setProperty("--tglow", glow);

    if (owned) card.appendChild(el("span", "clv", `LV ${total}`));
    card.appendChild(antPortrait(id, 112));
    card.append(
      el("div", "cname", species.name),
      el("div", "cstat",
        `${(species.atk * (1 + research.mandible * 0.05)).toFixed(2)} · ` +
        `${(species.def * (1 + research.cuticle * 0.05)).toFixed(2)}`),
    );

    // The research bar only appears once there IS research. At level nothing it is an
    // empty grey rule under the two numbers, which reads as a divider nobody drew on
    // purpose — and the card already says "LV 0" a line above it.
    if (owned && total > 0) {
      const bar = el("span", "cbar");
      const fill = el("i");
      fill.style.width = `${Math.round((total / RESEARCH_TOTAL_MAX) * 100)}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
    }
    if (!owned) {
      const veil = el("div", "cveil");
      const shut = el("span", "cl");
      shut.appendChild(iconMark("lock", 18));
      const price = el("span", "cc");
      price.append(iconMark("mycel", 13), el("span", undefined, String(SPECIES_UNLOCK[id])));
      veil.append(shut, price);
      card.appendChild(veil);
    }

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

/** Cooldown after research. Only a maxed reservoir shortens it (engine/abilities.ts). */
const cooldownOf = (id: SpeciesId, r: Research): number =>
  abilityCooldown(SPECIES[id].ability, { ...NEUTRAL_MODS, reservoir: r.reservoir });

/** Species portrait. Locked colonies are drawn as silhouettes by the stylesheet's veil. */
/** A mark from the icon family; `iconMark` because `icon` is a parameter name in here. */
function iconMark(name: string, size: number): SVGSVGElement {
  return icon(name, size);
}

/** One species stat: a mark and a number, in the pill the stylesheet already draws. */
function statChip(mark: string, value: string): HTMLElement {
  const chip = el("span", "statchip");
  chip.append(icon(mark, 13), el("span", undefined, value));
  return chip;
}
