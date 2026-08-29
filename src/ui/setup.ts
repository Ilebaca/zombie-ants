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
import { MAPS, SPECIES, START_SHAPES } from "../engine";
import type { MapId, ShapeId, SpeciesId } from "../engine";
import { SPECIES_ORDER } from "../platform";
import type { ProfileStore } from "../platform";
import { SPECIES_COL, antHead, basicLook, hexA, setFactionColor } from "../render";
import { screenEl, screenHeader, setupSteps, toast } from "./chrome";

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

export function buildMapSelect(o: SetupOptions): HTMLElement {
  const el = screenEl("mapsel");
  screenHeader(el, { title: "Choose your map", onBack: o.onBack, backId: "mapBack" });
  el.appendChild(setupSteps(0));

  const body = document.createElement("div");
  body.className = "screenbody";
  const box = document.createElement("div");
  box.className = "setupbox";
  const grid = document.createElement("div");
  grid.className = "mappick";
  grid.id = "mapPick";

  for (const id of MAP_ORDER) {
    const def = MAPS[id];
    const card = document.createElement("div");
    card.className = "mp" + (id === o.choices.map ? " on" : "");
    card.appendChild(mapThumb(def.size));
    const words = document.createElement("div");
    words.className = "mpwords";
    const nm = document.createElement("div");
    nm.className = "snm";
    nm.textContent = def.name;
    // The card said only how big the board is. What a player actually chooses between is
    // how long the match runs and when the Hive wakes up in it.
    const meta = document.createElement("div");
    meta.className = "mpmeta";
    meta.textContent = `Hive wakes turn ${def.awakenTurn} · about ${def.turnLimit} turns`;
    words.append(nm, meta);
    card.appendChild(words);
    card.onclick = () => {
      grid.querySelectorAll(".mp").forEach((x) => x.classList.remove("on"));
      card.classList.add("on");
      o.choices.map = id;
    };
    grid.appendChild(card);
  }

  const next = document.createElement("button");
  next.className = "cta";
  next.id = "mapNext";
  next.textContent = "Next →";
  next.onclick = o.onNext;

  box.append(grid, next);
  body.appendChild(box);
  el.appendChild(body);
  return el;
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
  next.textContent = "Next →";
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
    card.appendChild(shapeThumb(START_SHAPES[id]));
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
  begin.textContent = "Begin the spread →";
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

const cssVar = (n: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function mapThumb(n: number): HTMLCanvasElement {
  const SZ = 58;
  const cv = document.createElement("canvas");
  cv.width = SZ; cv.height = SZ;
  const g = cv.getContext("2d");
  if (!g) return cv;
  const cell = SZ / n;

  g.fillStyle = "rgba(255,255,255,.04)";
  g.fillRect(0, 0, SZ, SZ);
  g.fillStyle = cssVar("--line");
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if ((r + c) % 2 === 0) { g.globalAlpha = 0.6; g.fillRect(c * cell, r * cell, cell, cell); }
    }
  }
  g.globalAlpha = 1;

  // Gauntlet's two water bites, so the thumbnail shows why that map plays differently.
  if (n === 13) {
    g.fillStyle = "#2f6fb0";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const left = c * c + (r - 6) * (r - 6);
        const right = (c - (n - 1)) * (c - (n - 1)) + (r - 6) * (r - 6);
        if (left <= 9 || right <= 9) g.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  const b = Math.max(cell * 2, 8);
  g.fillStyle = cssVar("--you-glow"); g.fillRect(0, SZ - b, b, b);        // your corner
  g.fillStyle = cssVar("--ai-glow"); g.fillRect(SZ - b, 0, b, b);         // enemy corner
  return cv;
}

/** Formation thumbnail, drawn hugging the bottom-left as it sits in the player's corner. */
function shapeThumb(cells: ReadonlyArray<readonly [number, number]>): HTMLCanvasElement {
  const SZ = 72;
  const cv = document.createElement("canvas");
  cv.width = SZ; cv.height = SZ;
  const g = cv.getContext("2d");
  if (!g) return cv;
  const cell = SZ / 5, r = 3;

  cells.forEach(([lc, lr], idx) => {
    const x = lc * cell, y = (SZ - cell) - lr * cell;
    g.fillStyle = idx === 0 ? cssVar("--you-glow") : cssVar("--you");   // cell 0 is the nest
    g.globalAlpha = idx === 0 ? 1 : 0.85;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + cell, y, x + cell, y + cell, r);
    g.arcTo(x + cell, y + cell, x, y + cell, r);
    g.arcTo(x, y + cell, x, y, r);
    g.arcTo(x, y, x + cell, y, r);
    g.closePath(); g.fill();
    g.globalAlpha = 1;
  });
  return cv;
}
