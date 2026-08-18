/**
 * The Antarium: the collection, and per-species research.
 *
 * Two views in one screen. The grid shows all nine colonies — owned, buyable and premium —
 * and tapping one opens its page: combat profile, three research tracks, ability and field
 * notes. Research is per species (CLAUDE.md §11), so levelling Fire buys nothing for Ghost,
 * and the page always states which colony the numbers belong to.
 *
 * Nothing here computes a modifier. `ProfileStore.modsFor` stays the only source of
 * PlayerMods; this screen reads levels and prices, and asks the store to spend.
 */
import { NEUTRAL_MODS, RESEARCH_MAX, SPECIES, abilityCooldown, researchCost } from "../engine";
import type { SpeciesId } from "../engine";
import {
  RESEARCH_TRACKS, RESEARCH_TOTAL_MAX, SPECIES_NOTES, SPECIES_ORDER, SPECIES_UNLOCK,
} from "../platform";
import type { ProfileStore, Research, ResearchTrack } from "../platform";
import { SPECIES_COL, antHead, basicLook, hexA } from "../render";
import { buyButton, card, el, pips, screenEl, screenHeader, toast } from "./chrome";

export interface AntariumOptions {
  /** Called with the species the player chose to field, if they tapped "Field this colony". */
  onField?: (id: SpeciesId) => void;
  onBack: () => void;
}

export function buildAntarium(store: ProfileStore, opts: AntariumOptions): HTMLElement {
  const root = screenEl("screen--meta");
  let selected: SpeciesId | null = null;

  const render = (): void => {
    root.replaceChildren();
    if (selected) renderDetail(selected);
    else renderGrid();
  };

  /* ------------------------------------------------------------------ GRID */

  const renderGrid = (): void => {
    const profile = store.get();
    screenHeader(root, {
      title: "Antarium",
      sub: "Collection & research",
      onBack: opts.onBack,
      profile,
    });

    const body = el("div", "screenbody metabody");
    const grid = el("div", "antgrid");

    for (const id of SPECIES_ORDER) {
      const species = SPECIES[id];
      const pal = SPECIES_COL[id];
      const owned = store.isUnlocked(id);
      const price = SPECIES_UNLOCK[id];

      const cell = el("div", "antcell" + (owned ? " owned" : " locked"));
      cell.style.borderColor = owned ? pal[0] : "";

      const face = el("div", "antface");
      face.appendChild(portrait(id, 84, owned));
      cell.appendChild(face);

      const name = el("div", "antnm", species.name);
      name.style.color = owned ? pal[1] : "";
      cell.appendChild(name);

      // A locked colony still shows its price or its gate, so the grid doubles as the
      // shopping list. Premium is a shop purchase, not a mycelium one.
      const tag = el("div", "anttag");
      if (owned) tag.textContent = `Research ${researchTotal(profile.research[id])}/${RESEARCH_TOTAL_MAX}`;
      else if (species.premium) tag.textContent = "PREMIUM";
      else tag.textContent = `🍄 ${price}`;
      if (!owned && species.premium) tag.classList.add("prem");
      cell.appendChild(tag);

      cell.onclick = () => { selected = id; render(); };
      grid.appendChild(cell);
    }

    body.appendChild(grid);
    root.appendChild(body);
  };

  /* ---------------------------------------------------------------- DETAIL */

  const renderDetail = (id: SpeciesId): void => {
    const profile = store.get();
    const species = SPECIES[id];
    const pal = SPECIES_COL[id];
    const owned = store.isUnlocked(id);
    const research = profile.research[id] ?? { reservoir: 0, mandible: 0, cuticle: 0 };

    screenHeader(root, {
      title: species.name,
      sub: owned ? "Upgrades & research" : "Locked colony",
      onBack: () => { selected = null; render(); },
      profile,
    });

    const body = el("div", "screenbody metabody");

    /* Hero: portrait, blurb, research total. */
    const hero = el("div", "anthero");
    hero.style.setProperty("--tc", pal[0]);
    hero.style.boxShadow = `0 0 40px ${hexA(pal[1], 0.18)} inset`;
    hero.appendChild(portrait(id, 132, true));
    hero.appendChild(el("div", "herotag", species.blurb));
    const lvl = el("div", "herolvl",
      owned ? `RESEARCH LV ${researchTotal(research)} / ${RESEARCH_TOTAL_MAX}` : "NOT YET IN THE COLLECTION");
    lvl.style.color = pal[1];
    hero.appendChild(lvl);
    body.appendChild(hero);

    /* Combat profile: base value against researched value, on the same bar. */
    const profileCard = card("Combat profile", researchTotal(research) ? "researched" : "base");
    profileCard.body.append(
      statRow("Attack", species.atk, species.atk * (1 + research.mandible * 0.05), pal[0]),
      statRow("Defence", species.def, species.def * (1 + research.cuticle * 0.05), pal[0]),
      statRow("Production", species.prod, species.prod, pal[0]),
    );
    const cd = abilityCooldown(species.ability, { ...NEUTRAL_MODS, reservoir: research.reservoir });
    const cdLine = el("div", "mcnote");
    cdLine.textContent = cd < species.ability.cooldown
      ? `${species.ability.name}: cooldown ${species.ability.cooldown}t → ${cd}t`
      : `${species.ability.name}: ${species.ability.cooldown}t cooldown` +
        ` · drops to ${species.ability.cooldown - 1}t at reservoir Lv ${RESEARCH_MAX}`;
    profileCard.body.appendChild(cdLine);
    body.appendChild(profileCard.root);

    /* Research, or the unlock offer if the colony is not owned yet. */
    if (owned) {
      const res = card("Research", `🧪 ${profile.pheromone}`);
      for (const track of RESEARCH_TRACKS) {
        res.body.appendChild(trackRow(track.id, track.icon, track.name, track.desc, track.effect,
          research[track.id], id));
      }
      body.appendChild(res.root);
    } else {
      body.appendChild(unlockCard(id));
    }

    /* Trait, ability and the real biology behind them. */
    const lore = card("Trait");
    const trait = el("div", "mcnote", species.trait);
    trait.style.color = pal[1];
    lore.body.appendChild(trait);
    lore.body.appendChild(el("div", "mcsub", `${species.ability.name} — ${species.ability.cooldown}-turn cooldown`));
    lore.body.appendChild(el("div", "mcnote", species.ability.desc));
    body.appendChild(lore.root);

    const notes = card("Field notes");
    notes.body.appendChild(el("div", "mcnote", SPECIES_NOTES[id]));
    body.appendChild(notes.root);

    if (owned && opts.onField) {
      const field = el("button", "cta", `Field the ${species.name}`);
      field.style.background = `linear-gradient(180deg, ${pal[1]}, ${pal[0]})`;
      field.onclick = () => opts.onField?.(id);
      body.appendChild(field);
    }

    root.appendChild(body);
  };

  /* ------------------------------------------------------------- FRAGMENTS */

  const trackRow = (
    track: ResearchTrack, icon: string, name: string, desc: string, effect: string,
    level: number, species: SpeciesId,
  ): HTMLElement => {
    const row = el("div", "rtrack");
    row.appendChild(el("span", "ri", icon));

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
      icon: "🧪",
      cost,
      maxed: level >= RESEARCH_MAX,
      affordable: store.get().pheromone >= cost,
      onBuy: () => {
        if (store.buyResearch(species, track)) {
          render();
          toast(root, `${name} → Lv ${level + 1}`, "hive");
        }
      },
    }));
    return row;
  };

  const unlockCard = (id: SpeciesId): HTMLElement => {
    const species = SPECIES[id];
    const price = SPECIES_UNLOCK[id];
    const box = card("Unlock", species.premium ? "premium colony" : `🍄 ${store.get().mycel}`);

    if (species.premium) {
      // Premium colonies are a shop purchase (roadmap step 5). Saying so is better than a
      // greyed button with no explanation.
      box.body.appendChild(el("div", "mcnote",
        "A premium colony. It arrives with the shop — soft currency cannot buy it."));
      const soon = el("button", "buybtn off", "In the shop");
      soon.disabled = true;
      box.body.appendChild(soon);
      return box.root;
    }

    box.body.appendChild(el("div", "mcnote",
      `Add the ${species.name} to your collection and research it separately from the rest.`));
    box.body.appendChild(buyButton({
      icon: "🍄",
      cost: price,
      maxed: false,
      affordable: store.get().mycel >= price,
      onBuy: () => {
        if (store.unlockSpecies(id)) {
          render();
          toast(root, `${species.name} joins the collection.`, "good");
        }
      },
    }));
    return box.root;
  };

  render();
  return root;
}

/* -------------------------------------------------------------------- BITS */

const researchTotal = (r: Research | undefined): number =>
  (r?.reservoir ?? 0) + (r?.mandible ?? 0) + (r?.cuticle ?? 0);

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

  const value = el("span", "sv" + (now > base ? " up" : ""), now.toFixed(2) + (now > base ? " ▲" : ""));
  row.appendChild(value);
  return row;
}

/** Species portrait. Locked colonies are drawn as silhouettes. */
function portrait(id: SpeciesId, size: number, owned: boolean): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  cv.style.width = `${size}px`;
  cv.style.height = `${size}px`;
  const g = cv.getContext("2d");
  if (!g) return cv;
  if (!owned) g.globalAlpha = 0.28;
  antHead(g, size / 2, size / 2, size * 0.46, SPECIES_COL[id], basicLook(id));
  return cv;
}
