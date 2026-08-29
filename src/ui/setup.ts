/**
 * THE SETUP FLOW: map, then colony, then formation.
 *
 * Three screens that do one thing between them — fill in a `Choices` and hand it back. They
 * were methods on `App`, which made the shell a thousand-line file that was router,
 * screen-builder and match-wiring at once; here they are plain functions over the choices
 * object, so each is buildable and assertable on its own.
 *
 * They MUTATE the choices they are given rather than returning a new one. The object is the
 * app's, the screens are its editors, and the tour walks the player through them one tap at
 * a time — a copy handed back at the end would lose a choice the moment a step navigated.
 */
import { MAPS, SPECIES, START_SHAPES, createGame, razeTile } from "../engine";
import type { MapId, ShapeId, SpeciesId } from "../engine";
import { SPECIES_ORDER } from "../platform";
import type { ProfileStore } from "../platform";
import {
  SPECIES_COL, antHead, basicLook, drawSnapshot, hexA, setFactionColor,
} from "../render";
import { screenEl, screenHeader, setupSteps, toast } from "./chrome";
import { Deck } from "./deck";

/** What a match is built from. The setup screens are the only things that write it. */
export interface Choices {
  map: MapId;
  species: SpeciesId;
  shape: ShapeId;
}

export interface SetupOptions {
  /** Written in place as the player picks. */
  choices: Choices;
  profile: ProfileStore;
  /** The back arrow, and the button that moves the flow on. */
  onBack: () => void;
  onNext: () => void;
  /** Only the formation screen uses this: it is the button that starts the match. */
  onBegin: () => void;
}

/** The three maps, in the order the picker lists them. */
const MAP_ORDER: readonly MapId[] = ["tiny", "small", "mid"];

/* ----------------------------------------------------------------- MAP SELECT */

/**
 * THE MAP PICKER IS THE MAP.
 *
 * It was three cards on a page, each with a thumbnail of coloured squares — a diagram of a
 * board rather than a board. What a player is choosing between is a PLACE, and the game can
 * already draw it: every slide here is a real `GameState` for that map, at its opening
 * position, drawn by the board's own code (render/snapshot.ts). The gems, the rocks, the
 * water, the Hive and both colonies are where they will actually be.
 *
 * So the picture fills the screen and everything else floats on it, and choosing is
 * dragging from one map to the next — the same strip the home screens ride (ui/deck.ts),
 * because the gesture handling there is the expensive part and this is the same object.
 */
export function buildMapSelect(o: SetupOptions): HTMLElement {
  const el = screenEl("mapsel");
  const stage = document.createElement("div");
  stage.className = "mapstage";

  const name = document.createElement("div");
  name.className = "mapname";
  const meta = document.createElement("div");
  meta.className = "mapmeta";
  const dots = document.createElement("div");
  dots.className = "mapdots";
  const pips = MAP_ORDER.map(() => {
    const pip = document.createElement("i");
    dots.appendChild(pip);
    return pip;
  });

  const show = (id: MapId): void => {
    const def = MAPS[id];
    o.choices.map = id;
    name.textContent = def.name;
    // Not how big the board is — what a player actually chooses between is how long the
    // match runs and when the Hive wakes up in it.
    meta.textContent = `Hive wakes turn ${def.awakenTurn} · about ${def.turnLimit} turns`;
    pips.forEach((pip, i) => pip.classList.toggle("on", MAP_ORDER[i] === id));
  };

  const deck = new Deck<MapId>(
    MAP_ORDER,
    (id) => mapSlide(id, o.choices.species),
    show,
    { className: "mapdeck", id: "mapDeck" },
  );
  stage.appendChild(deck.el);

  // EVERYTHING ELSE FLOATS. One layer over the picture, so the map is the screen and the
  // controls are on it rather than beside it.
  const chrome = document.createElement("div");
  chrome.className = "mapchrome";
  // Header and step dots are ONE block at the top. Left as separate children of a
  // space-between column they were three things spread down the screen, which put the
  // three dots across the middle of the map.
  const top = document.createElement("div");
  top.className = "maptop";
  screenHeader(top, { title: "Choose your map", onBack: o.onBack, backId: "mapBack" });
  top.appendChild(setupSteps(0));
  chrome.appendChild(top);

  const foot = document.createElement("div");
  foot.className = "mapfoot";
  // The dots say there are three; nothing on the screen says how to reach the other two.
  // A strip you drag has no affordance of its own, so it is written down once.
  const hint = document.createElement("div");
  hint.className = "maphint";
  hint.textContent = "Swipe to choose your map";
  const next = document.createElement("button");
  next.className = "cta";
  next.id = "mapNext";
  next.textContent = "Next";
  next.onclick = o.onNext;
  foot.append(name, meta, dots, hint, next);
  chrome.appendChild(foot);

  stage.appendChild(chrome);
  el.appendChild(stage);

  deck.goTo(MAP_ORDER.includes(o.choices.map) ? o.choices.map : "tiny", false);
  return el;
}

/** Soil left around the playfield, in tiles. Enough for the clearing's feathered edge to
 *  finish inside the picture — cropped at the last tile it ends on a hard line. */
export const MAP_PAD_TILES = 0.9;

/**
 * One map, drawn as the game will draw it: the PLAYFIELD, and a hair of ground round it.
 *
 * FIT, not cover. Sizing the tile off the longer side filled the screen with the middle of
 * a 13×13 board — which is a texture, not a map, and the player is choosing between the
 * shapes of three places.
 *
 * And the picture stops just outside the tiles rather than bleeding to the edges. Ground
 * carried to the corners of the screen made every map the same picture of undergrowth with
 * a different board somewhere in it; a plate the size of the board is the board.
 *
 * A bigger map therefore draws SMALLER tiles, which is the honest comparison: Gauntlet
 * really is thirteen squares of the same board Skirmish gets seven of.
 */
function mapSlide(id: MapId, species: SpeciesId): HTMLElement {
  const slide = document.createElement("div");
  slide.className = "mapshot";
  const canvas = document.createElement("canvas");

  const w = window.innerWidth || 390;
  const h = window.innerHeight || 780;
  const size = MAPS[id].size;
  // The opening position of a real match on this map: both colonies placed, the terrain
  // generated, the Hive where it will be. Seeded on the map so it is the same every time.
  const state = createGame({
    map: id,
    species: { you: species, ai: species === "fire" ? "ghost" : "fire" },
    seed: 0x5eed ^ size,
  });
  // The chrome sits over the top and bottom, so the clear middle is what the WHOLE picture
  // has to fit inside — padding included, or a padded 13×13 runs under the footer wash.
  const across = size + 2 * MAP_PAD_TILES;
  const tile = Math.floor(Math.min(w - 40, h * 0.5) / across);
  drawSnapshot(canvas, state, {
    tile,
    // The REAL ground, scenery and all — this is meant to read as a screenshot of the map,
    // and the grass, stones and logs are most of what one map looks like next to another.
    terrain: true,
    padTiles: MAP_PAD_TILES,
  });
  slide.appendChild(canvas);
  return slide;
}

/* ------------------------------------------------------------- SPECIES SELECT */

export function buildSpeciesSelect(o: SetupOptions): HTMLElement {
  const root = screenEl("start");
  screenHeader(root, { title: "Choose your species", onBack: o.onBack, backId: "specBack" });
  root.appendChild(setupSteps(1));

  const body = document.createElement("div");
  body.className = "screenbody";
  const box = document.createElement("div");
  box.className = "setupbox";
  const slider = document.createElement("div");
  slider.className = "pickslider";
  slider.id = "pick";

  let selectedCard: HTMLElement | null = null;

  for (const id of SPECIES_ORDER) {
    const s = SPECIES[id];
    const pal = SPECIES_COL[id];
    // Locked colonies stay on the slider so the player can read what they are working
    // toward — they just cannot be fielded until the Antarium sells them.
    const owned = o.profile.isUnlocked(id);
    const card = document.createElement("div");
    const chosen = id === o.choices.species;
    card.className = "sp" + (chosen ? " on" : "") + (owned ? "" : " splock");

    const face = document.createElement("div");
    face.className = "face";
    const fc = document.createElement("canvas");
    fc.width = 96; fc.height = 96;
    const fx = fc.getContext("2d");
    if (fx) antHead(fx, 48, 48, 44, pal, basicLook(id));
    face.appendChild(fc);

    const nm = document.createElement("div");
    nm.className = "nm";
    nm.style.color = pal[1];
    nm.textContent = s.name;
    if (s.premium) {
      const prem = document.createElement("span");
      prem.className = "prem";
      prem.textContent = "PREMIUM";
      nm.appendChild(prem);
    }

    const mods = document.createElement("div");
    mods.className = "mods";
    mods.textContent = `⚔ ${s.atk.toFixed(1)} · 🛡 ${s.def.toFixed(1)}`;

    const ds = document.createElement("div");
    ds.className = "ds";
    ds.textContent = s.blurb;

    const tr = document.createElement("div");
    tr.className = "tr";
    tr.style.color = pal[1];
    tr.textContent = s.trait;

    card.append(face, nm, mods, ds, tr);
    if (!owned) {
      const lock = document.createElement("div");
      lock.className = "splockmsg";
      lock.textContent = "🔒 Unlock in the Antarium";
      card.appendChild(lock);
    }

    const highlight = (on: boolean): void => {
      card.classList.toggle("on", on);
      card.style.borderColor = on ? pal[0] : "";
      card.style.boxShadow = on ? `0 0 0 1px ${pal[0]} inset, 0 0 22px ${hexA(pal[1], 0.30)}` : "";
    };
    if (chosen) { highlight(true); selectedCard = card; }

    card.onclick = () => {
      if (!owned) {
        toast(root, `${s.name} is locked — unlock it in the Antarium.`, "bad");
        return;
      }
      slider.querySelectorAll(".sp").forEach((x) => {
        x.classList.remove("on");
        (x as HTMLElement).style.borderColor = "";
        (x as HTMLElement).style.boxShadow = "";
      });
      highlight(true);
      o.choices.species = id;
      setFactionColor("you", id);          // the whole UI takes the species' colours
      card.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    };
    slider.appendChild(card);
  }

  const next = document.createElement("button");
  next.className = "cta";
  next.id = "toFormation";
  next.textContent = "Next";
  next.onclick = o.onNext;

  box.append(slider, next);
  body.appendChild(box);
  root.appendChild(body);

  // open on the species already fielded
  // Guarded: jsdom has no scrollIntoView, and a screen must survive a DOM that is
  // missing a convenience exactly as it survives a canvas with no context.
  requestAnimationFrame(() => selectedCard?.scrollIntoView?.({ inline: "center", block: "nearest" }));
  return root;
}

/* ----------------------------------------------------------- FORMATION SELECT */

export function buildFormationSelect(o: SetupOptions): HTMLElement {
  const el = screenEl("formation");
  screenHeader(el, { title: "Choose your formation", onBack: o.onBack, backId: "formBack" });
  el.appendChild(setupSteps(2));

  const body = document.createElement("div");
  body.className = "screenbody";
  const box = document.createElement("div");
  box.className = "setupbox";
  const grid = document.createElement("div");
  grid.className = "shapepick";
  grid.id = "shapePick";

  // The legacy picker always opens on the first formation rather than the saved one.
  const first = (Object.keys(START_SHAPES) as ShapeId[])[0] as ShapeId;
  o.choices.shape = first;
  for (const id of Object.keys(START_SHAPES) as ShapeId[]) {
    const cellWrap = document.createElement("div");
    cellWrap.className = "shpcell";
    const card = document.createElement("div");
    card.className = "shp" + (id === first ? " on" : "");
    card.appendChild(shapePreview(id, o.choices.species));
    const nm = document.createElement("div");
    nm.className = "snm";
    nm.textContent = id.charAt(0).toUpperCase() + id.slice(1);
    card.onclick = () => {
      grid.querySelectorAll(".shp").forEach((x) => x.classList.remove("on"));
      card.classList.add("on");
      o.choices.shape = id;
    };
    cellWrap.append(card, nm);
    grid.appendChild(cellWrap);
  }

  const begin = document.createElement("button");
  begin.className = "cta";
  begin.id = "begin";
  begin.textContent = "Begin the spread";
  begin.onclick = o.onBegin;

  box.append(grid, begin);
  body.appendChild(box);
  el.appendChild(body);
  return el;
}

/** The enemy's formation, chosen at setup time — the engine itself stays free of randomness. */
export function rollShape(rng: () => number = Math.random): ShapeId {
  const keys = Object.keys(START_SHAPES) as ShapeId[];
  return keys[Math.floor(rng() * keys.length)] ?? "wedge";
}

/**
 * The AI fields a species different from yours, weighted toward combat power so it stays a
 * consistent threat — but every non-premium species can still turn up. Setup-time only:
 * the engine itself stays free of randomness (CLAUDE.md §4.1).
 */
export function rollAISpecies(yours: SpeciesId, rng: () => number = Math.random): SpeciesId {
  const pool = (Object.keys(SPECIES) as SpeciesId[])
    .filter((k) => k !== yours && !SPECIES[k].premium);
  if (!pool.length) return yours;
  const weight = (k: SpeciesId): number => 0.5 + SPECIES[k].atk * SPECIES[k].def;
  const total = pool.reduce((s, k) => s + weight(k), 0);
  let roll = rng() * total;
  for (const k of pool) {
    roll -= weight(k);
    if (roll <= 0) return k;
  }
  return pool[pool.length - 1] as SpeciesId;
}

/**
 * A FORMATION, as the board will actually show it.
 *
 * It was five rounded squares on a 72px canvas — a diagram of a shape, which told a player
 * nothing about what they were about to look at. This builds a real game with that
 * formation and windows onto the player's own corner, so the picture has the nest, the
 * garrison counts, the outline and the ground exactly as the match will draw them.
 */
function shapePreview(id: ShapeId, species: SpeciesId): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const state = createGame({
    map: "tiny",
    species: { you: species, ai: species },
    shape: START_SHAPES[id],
    seed: 0xf0f,
  });
  // ONLY the formation. A real map puts the Hive in the middle, wild garrisons about and
  // rocks wherever the generator liked, and a two-inch picture of five tiles with all of
  // that behind it is a picture of the map. Everything that is not the player's own colony
  // goes, so the twelve cards differ by the only thing being chosen.
  for (const row of state.grid) {
    for (const t of row) {
      if (t.owner === "you") continue;
      razeTile(t);
      t.guard = 0;
      t.terrain = "ground";
    }
  }
  // The player's corner is the bottom-left, and no formation reaches more than five tiles
  // from it — so a five-square window holds every one of the twelve.
  const size = state.size;
  // The card decides the width; the picture is square, so the stylesheet sizes it.
  drawSnapshot(canvas, state, {
    tile: 26, view: { c: 0, r: size - 5, cols: 5, rows: 5 }, fluid: true,
  });
  return canvas;
}
