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
import { NEUTRAL_MODS, RESEARCH_MAX, SPECIES, abilityCooldown, researchCost } from "../engine";
import type { SpeciesId } from "../engine";
import {
  RESEARCH_TRACKS, RESEARCH_TOTAL_MAX, SPECIES_NOTES, SPECIES_ORDER, SPECIES_UNLOCK, TIERS, tierOf,
} from "../platform";
import type { ProfileStore, Research, ResearchTrack } from "../platform";
import { SPECIES_COL, antHead, basicLook } from "../render";
import { buyButton, el, pips, screenEl, screenHeader, toast } from "./chrome";
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
    root.replaceChildren();
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
    box.appendChild(portrait(id, 128));

    const info = el("div", "rb-info");
    info.appendChild(el("div", "rb-tier", species.premium ? "Mythic · Premium" : tier.name));
    const name = el("div", "rb-name", species.name);
    name.style.color = pal[1];
    info.append(name, el("div", "rb-tag", species.blurb));

    const meta = el("div", "rb-meta");
    meta.appendChild(el("span", "lv",
      owned ? `LV ${researchTotal(research)}/${RESEARCH_TOTAL_MAX}` : "LOCKED"));
    meta.append(
      statChip("attack", (species.atk * (1 + research.mandible * 0.05)).toFixed(2)),
      statChip("defence", (species.def * (1 + research.cuticle * 0.05)).toFixed(2)),
      el("span", undefined, `⚗️ ${cooldownOf(id, research)}t CD`),
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
      ? "⚙  Upgrade & Customize"
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
    card.appendChild(portrait(id, 112));
    card.append(
      el("div", "cname", species.name),
      el("div", "cstat",
        `${(species.atk * (1 + research.mandible * 0.05)).toFixed(2)} · ` +
        `${(species.def * (1 + research.cuticle * 0.05)).toFixed(2)}`),
    );

    if (owned) {
      const bar = el("span", "cbar");
      const fill = el("i");
      fill.style.width = `${Math.round((total / RESEARCH_TOTAL_MAX) * 100)}%`;
      bar.appendChild(fill);
      card.appendChild(bar);
    } else {
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

/* --------------------------------------------------------------- SPECIES PAGE */

export interface SpeciesPageOptions {
  species: SpeciesId;
  onBack: () => void;
}

export function buildSpeciesPage(store: ProfileStore, opts: SpeciesPageOptions): HTMLElement {
  const root = screenEl("antup");
  const id = opts.species;
  const species = SPECIES[id];

  const render = (): void => {
    const profile = store.get();
    const research = researchOf(store, id);
    const tier = tierOf(id);
    const pal = SPECIES_COL[id];
    root.replaceChildren();

    screenHeader(root, {
      title: species.name,
      sub: "Upgrades & research",
      onBack: opts.onBack,
      backId: "aupBack",
      titleId: "aupTitle",
      subId: "aupSub",
      mycel: profile.mycel,
    });

    const body = el("div", "screenbody sb-top");

    // Only the Upgrades tab has anything behind it yet: Customize sells cosmetics from the
    // lucky hatch, which is not ported. It is shown, and says so, rather than vanishing.
    const tabs = el("div", "auptabs");
    const upgrades = el("button", "auptab on", "Upgrades");
    const customize = el("button", "auptab", "Customize");
    customize.onclick = () => toast(root, "Skins and effects arrive with the lucky hatch.", "warn");
    tabs.append(upgrades, customize);
    body.appendChild(tabs);

    const page = el("div", "antscroll");
    page.id = "aupBody";

    /* Hero */
    const hero = el("div", "dhero");
    hero.style.setProperty("--tc", tier.col);
    hero.style.setProperty("--tglow", tier.glow);
    const port = portrait(id, 160);
    port.id = "aupPort";
    hero.appendChild(port);
    hero.appendChild(el("div", "dtier", species.premium ? "Mythic · Premium" : tier.name));
    const name = el("div", "dname", species.name);
    name.style.color = pal[1];
    hero.append(name, el("div", "dtag", species.blurb));
    hero.appendChild(el("div", "dlvl", `RESEARCH LV ${researchTotal(research)} / ${RESEARCH_TOTAL_MAX}`));
    page.appendChild(hero);

    /* Combat profile */
    const combat = el("div", "dcard");
    const ch = el("div", "ch");
    ch.append(el("span", undefined, "Combat profile"),
      el("span", undefined, researchTotal(research) ? "researched" : "base"));
    combat.appendChild(ch);
    combat.append(
      statRow("Attack", species.atk, species.atk * (1 + research.mandible * 0.05), tier.col),
      statRow("Defense", species.def, species.def * (1 + research.cuticle * 0.05), tier.col),
      abilityRow(research.reservoir, cooldownOf(id, research), tier.col),
    );

    const cd = cooldownOf(id, research);
    const note = el("div", "dbio");
    note.append(
      document.createTextNode(`${species.ability.name}: potency ×`),
      boldGreen((1 + 0.06 * research.reservoir).toFixed(2)),
      document.createTextNode(` · cooldown ${species.ability.cooldown}t → `),
      boldGreen(`${cd}t`),
    );
    combat.appendChild(note);
    page.appendChild(combat);

    /* Research */
    const res = el("div", "dcard");
    const rh = el("div", "ch");
    const purse = el("span", "purse");
    purse.append(iconMark("mycel", 13), el("span", undefined, String(profile.mycel)));
    rh.append(el("span", undefined, "Research"), purse);
    res.appendChild(rh);
    for (const track of RESEARCH_TRACKS) {
      res.appendChild(trackRow(track.id, track.icon, track.name, track.desc, track.effect,
        research[track.id]));
    }
    page.appendChild(res);

    /* Field notes */
    const notes = el("div", "dcard");
    notes.appendChild(el("div", "ch", "Field notes"));
    notes.appendChild(el("div", "dbio", SPECIES_NOTES[id]));
    page.appendChild(notes);

    /* Trait and ability */
    const lore = el("div", "dcard");
    lore.appendChild(el("div", "ch", "Trait"));
    const trait = el("div", "dbio", species.trait);
    trait.style.color = "var(--ink)";
    lore.appendChild(trait);
    const abh = el("div", "ch");
    abh.style.marginTop = "12px";
    abh.append(
      el("span", undefined, `Ability — ${species.ability.name}`),
      el("span", undefined, `${species.ability.cooldown}-turn CD`),
    );
    lore.append(abh, el("div", "dbio", species.ability.desc));
    page.appendChild(lore);

    body.appendChild(page);
    root.appendChild(body);
  };

  const trackRow = (
    track: ResearchTrack, icon: string, name: string, desc: string, effect: string, level: number,
  ): HTMLElement => {
    const row = el("div", "rtrack");
    const mark = el("span", "ri");
    mark.appendChild(iconMark(icon, 18));
    row.appendChild(mark);

    const info = el("div", "rb");
    info.append(
      el("div", "rn", name),
      el("div", "rd", desc),
      el("div", "re", effect),
      pips(level, RESEARCH_MAX),
    );
    row.appendChild(info);

    const cost = researchCost(level);
    row.appendChild(buyButton({
      icon: "🍄",
      cost,
      maxed: level >= RESEARCH_MAX,
      affordable: store.get().mycel >= cost,
      onBuy: () => {
        if (store.buyResearch(id, track)) {
          render();
          toast(root, `${name} → Lv ${level + 1}`, "hive");
        }
      },
    }));
    return row;
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

function boldGreen(text: string): HTMLElement {
  const b = el("b", undefined, text);
  b.style.color = "#8df06d";
  return b;
}

/** A bar with the base value ghosted behind the researched one. */
function statRow(label: string, base: number, now: number, colour: string): HTMLElement {
  const CEILING = 1.7;                       // the widest any multiplier gets, so bars compare
  const row = el("div", "srow");
  row.appendChild(el("span", "sk", label));

  const bar = el("span", "sb");
  const ghost = el("span", "sf base");
  ghost.style.width = `${Math.min(100, (base / CEILING) * 100)}%`;
  const fill = el("span", "sf");
  fill.style.width = `${Math.min(100, (now / CEILING) * 100)}%`;
  fill.style.background = colour;
  bar.append(ghost, fill);
  row.appendChild(bar);

  row.appendChild(el("span", "sv" + (now > base ? " up" : ""),
    now.toFixed(2) + (now > base ? " ▲" : "")));
  return row;
}

/** The ability row reads as a cooldown, not a multiplier, so it gets its own bar. */
function abilityRow(level: number, cooldown: number, colour: string): HTMLElement {
  const row = el("div", "srow");
  row.appendChild(el("span", "sk", "Ability"));
  const bar = el("span", "sb");
  const fill = el("span", "sf");
  fill.style.width = `${Math.round((level / RESEARCH_MAX) * 100)}%`;
  fill.style.background = colour;
  bar.appendChild(fill);
  row.appendChild(bar);
  row.appendChild(el("span", "sv" + (level ? " up" : ""), `${cooldown}t${level ? " ▲" : ""}`));
  return row;
}

/** Species portrait. Locked colonies are drawn as silhouettes by the stylesheet's veil. */
function portrait(id: SpeciesId, size: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const g = cv.getContext("2d");
  if (!g) return cv;
  antHead(g, size / 2, size / 2, size * 0.46, SPECIES_COL[id], basicLook(id));
  return cv;
}

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
