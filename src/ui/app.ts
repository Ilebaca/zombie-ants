/**
 * App shell: home → map → species → formation → match → result.
 *
 * Meta screens own *choices*; the engine owns rules. Nothing here reaches into a running
 * match — a match is created from the choices, handed to MatchScreen, and reported back
 * through `onExit`.
 */
import {
  MAPS, SPECIES, START_SHAPES, armyOf, createGame, ownedCount,
} from "../engine";
import type { MapId, Player, SpeciesId } from "../engine";
import type { ShapeId } from "../engine";
import { ProfileStore } from "../platform";
import { SPECIES_COL, antHead, basicLook, hexA, setFactionColor } from "../render";
import { MatchScreen } from "./match";
import "./theme.css";
import "./screens.css";
import "./home-bg.css";

type ScreenId = "home" | "map" | "species" | "formation";

const MAP_ORDER: readonly MapId[] = ["tiny", "small", "mid"];

/** Setup choices that survive between matches. */
interface Choices {
  map: MapId;
  species: SpeciesId;
  shape: ShapeId;
}

export class App {
  private screens = new Map<ScreenId, HTMLElement>();
  private match: MatchScreen | null = null;
  private overlay: HTMLElement | null = null;

  private choices: Choices;
  private profile: ProfileStore;

  constructor(private host: HTMLElement, profile = new ProfileStore()) {
    this.host.replaceChildren();
    this.profile = profile;
    // Reopen on the player's last setup, so a rematch is two taps.
    const saved = profile.get();
    this.choices = {
      map: saved.lastMap,
      species: saved.lastSpecies,
      shape: (saved.lastShape in START_SHAPES ? saved.lastShape : "wedge") as ShapeId,
    };
    setFactionColor("you", this.choices.species);
  }

  start(): void {
    this.show("home");
  }

  /* --------------------------------------------------------------------- ROUTER */

  private show(id: ScreenId): void {
    this.clearMatch();
    this.clearOverlay();
    for (const [key, el] of this.screens) el.classList.toggle("hidden", key !== id);
    if (!this.screens.has(id)) {
      const el = this.build(id);
      this.screens.set(id, el);
      this.host.appendChild(el);
    } else {
      // Rebuild on entry: the pickers reflect current choices and faction colours.
      const fresh = this.build(id);
      this.screens.get(id)?.replaceWith(fresh);
      this.screens.set(id, fresh);
    }
    for (const [key, el] of this.screens) el.classList.toggle("hidden", key !== id);
  }

  private build(id: ScreenId): HTMLElement {
    if (id === "home") return this.buildHome();
    if (id === "map") return this.buildMapSelect();
    if (id === "species") return this.buildSpeciesSelect();
    return this.buildFormationSelect();
  }

  private screen(className: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "screen " + className;
    return el;
  }

  private header(parent: HTMLElement, title: string, sub?: string, back?: () => void): void {
    const top = document.createElement("div");
    top.className = "screentop";
    if (back) {
      const b = document.createElement("button");
      b.className = "backbtn";
      b.setAttribute("aria-label", "Back");
      b.textContent = "←";
      b.onclick = back;
      top.appendChild(b);
    }
    const h = document.createElement("div");
    h.className = "screenh";
    h.textContent = title;
    top.appendChild(h);
    if (sub) {
      const s = document.createElement("div");
      s.className = "screensub";
      s.textContent = sub;
      top.appendChild(s);
    }
    parent.appendChild(top);
  }

  /* ----------------------------------------------------------------------- HOME */

  private buildHome(): HTMLElement {
    const el = this.screen("screen--home");
    const play = document.createElement("div");
    play.className = "homeplay";

    const tag = document.createElement("div");
    tag.className = "hometag";
    tag.textContent = "Spread · Surround · Consume";

    const btn = document.createElement("button");
    btn.className = "playbtn";
    btn.textContent = "PLAY";
    btn.onclick = () => this.show("map");

    const how = document.createElement("button");
    how.className = "howtolink";
    how.textContent = "📖 How to play";
    how.onclick = () => this.showRules();

    play.append(tag, btn, how);
    el.appendChild(play);
    return el;
  }

  /* ----------------------------------------------------------------- MAP SELECT */

  private buildMapSelect(): HTMLElement {
    const el = this.screen("setup-map");
    this.header(el, "Choose your map", undefined, () => this.show("home"));

    const body = document.createElement("div");
    body.className = "screenbody";
    const box = document.createElement("div");
    box.className = "setupbox";
    const grid = document.createElement("div");
    grid.className = "mappick";

    for (const id of MAP_ORDER) {
      const def = MAPS[id];
      const card = document.createElement("div");
      card.className = "mp" + (id === this.choices.map ? " on" : "");
      card.appendChild(mapThumb(def.size));
      const nm = document.createElement("div");
      nm.className = "snm";
      nm.textContent = def.name;
      card.appendChild(nm);
      card.onclick = () => {
        grid.querySelectorAll(".mp").forEach((x) => x.classList.remove("on"));
        card.classList.add("on");
        this.choices.map = id;
      };
      grid.appendChild(card);
    }

    const next = document.createElement("button");
    next.className = "cta neutral";
    next.textContent = "Next →";
    next.onclick = () => this.show("species");

    box.append(grid, next);
    body.appendChild(box);
    el.appendChild(body);
    return el;
  }

  /* ------------------------------------------------------------- SPECIES SELECT */

  private buildSpeciesSelect(): HTMLElement {
    const el = this.screen("setup-species");
    this.header(el, "Choose your species", undefined, () => this.show("map"));

    const body = document.createElement("div");
    body.className = "screenbody";
    const box = document.createElement("div");
    box.className = "setupbox";
    const slider = document.createElement("div");
    slider.className = "pickslider";

    let selectedCard: HTMLElement | null = null;

    for (const id of Object.keys(SPECIES) as SpeciesId[]) {
      const s = SPECIES[id];
      const pal = SPECIES_COL[id];
      const card = document.createElement("div");
      const chosen = id === this.choices.species;
      card.className = "sp" + (chosen ? " on" : "");

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
      mods.textContent = `⚔ ${s.atk.toFixed(2)} · 🛡 ${s.def.toFixed(2)} · 🍄 ${s.prod.toFixed(2)}`;

      const ds = document.createElement("div");
      ds.className = "ds";
      ds.textContent = s.blurb;

      const tr = document.createElement("div");
      tr.className = "tr";
      tr.style.color = pal[1];
      tr.textContent = s.trait;

      card.append(face, nm, mods, ds, tr);

      const highlight = (on: boolean): void => {
        card.classList.toggle("on", on);
        card.style.borderColor = on ? pal[0] : "";
        card.style.boxShadow = on ? `0 0 0 1px ${pal[0]} inset, 0 0 22px ${hexA(pal[1], 0.30)}` : "";
      };
      if (chosen) { highlight(true); selectedCard = card; }

      card.onclick = () => {
        slider.querySelectorAll(".sp").forEach((x) => {
          x.classList.remove("on");
          (x as HTMLElement).style.borderColor = "";
          (x as HTMLElement).style.boxShadow = "";
        });
        highlight(true);
        this.choices.species = id;
        setFactionColor("you", id);          // the whole UI takes the species' colours
        card.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      };
      slider.appendChild(card);
    }

    const next = document.createElement("button");
    next.className = "cta neutral";
    next.textContent = "Next →";
    next.onclick = () => this.show("formation");

    box.append(slider, next);
    body.appendChild(box);
    el.appendChild(body);

    // open on the species already fielded
    requestAnimationFrame(() => selectedCard?.scrollIntoView({ inline: "center", block: "nearest" }));
    return el;
  }

  /* ----------------------------------------------------------- FORMATION SELECT */

  private buildFormationSelect(): HTMLElement {
    const el = this.screen("setup-formation");
    this.header(el, "Choose your formation", undefined, () => this.show("species"));

    const body = document.createElement("div");
    body.className = "screenbody";
    const box = document.createElement("div");
    box.className = "setupbox";
    const grid = document.createElement("div");
    grid.className = "shapepick";

    for (const id of Object.keys(START_SHAPES) as ShapeId[]) {
      const cellWrap = document.createElement("div");
      cellWrap.className = "shpcell";
      const card = document.createElement("div");
      card.className = "shp" + (id === this.choices.shape ? " on" : "");
      card.appendChild(shapeThumb(START_SHAPES[id]));
      const nm = document.createElement("div");
      nm.className = "snm";
      nm.textContent = id.charAt(0).toUpperCase() + id.slice(1);
      card.onclick = () => {
        grid.querySelectorAll(".shp").forEach((x) => x.classList.remove("on"));
        card.classList.add("on");
        this.choices.shape = id;
      };
      cellWrap.append(card, nm);
      grid.appendChild(cellWrap);
    }

    const begin = document.createElement("button");
    begin.className = "cta begin";
    begin.textContent = "Begin the spread →";
    begin.onclick = () => this.startMatch();

    box.append(grid, begin);
    body.appendChild(box);
    el.appendChild(body);
    return el;
  }

  /* ---------------------------------------------------------------------- MATCH */

  private startMatch(): void {
    // "Play again" comes straight back here, so tear the old match down first — otherwise
    // its render loop and timers keep running behind the new one.
    this.clearMatch();
    const aiSpecies = rollAISpecies(this.choices.species);
    setFactionColor("you", this.choices.species);
    setFactionColor("ai", aiSpecies);

    // Anthill and research come from the profile; the AI always gets the neutral set.
    const mods = this.profile.modsFor(this.choices.species);

    const state = createGame({
      map: this.choices.map,
      species: { you: this.choices.species, ai: aiSpecies },
      shape: START_SHAPES[this.choices.shape],
      mods,
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0,
    });

    this.profile.update((p) => {
      p.lastMap = this.choices.map;
      p.lastSpecies = this.choices.species;
      p.lastShape = this.choices.shape;
    });

    for (const el of this.screens.values()) el.classList.add("hidden");

    this.match = new MatchScreen(this.host, {
      state,
      mods,
      // The same mods must drive combat, or Mandible/Cuticle research would show up in the
      // income readout but do nothing in a fight.
      ctx: { mods },
      difficulty: "normal",
      map: this.choices.map,
      onAbilityCast: (kind) => this.profile.update((p) => {
        p.stats.abilities++;
        if (kind === "tunnel") p.stats.tunnels++;
      }),
      onExit: (winner) => {
        this.profile.recordResult(winner === "you", this.choices.species);
        this.showResult(winner, {
          turns: state.turn,
          youArmy: armyOf(state, "you"),
          aiArmy: armyOf(state, "ai"),
          youTiles: ownedCount(state, "you"),
          aiTiles: ownedCount(state, "ai"),
        });
      },
    });
    this.match.start();
  }

  private clearMatch(): void {
    this.match?.destroy();
    this.match = null;
  }

  /* --------------------------------------------------------------------- RESULT */

  private showResult(winner: Player | null, recap: {
    turns: number; youArmy: number; aiArmy: number; youTiles: number; aiTiles: number;
  }): void {
    const won = winner === "you";
    const ov = document.createElement("div");
    ov.className = "overlay";

    const card = document.createElement("div");
    card.className = "card " + (won ? "win" : "lose");

    const h1 = document.createElement("h1");
    h1.textContent = won ? "Victory" : "Consumed";
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = won
      ? "The colony spreads. Their queen is yours."
      : "Your queen has fallen. The fungus takes the rest.";

    const rows = document.createElement("div");
    rows.className = "recap";
    const stat = (k: string, v: string | number): HTMLElement => {
      const d = document.createElement("div");
      d.className = "rc";
      const kk = document.createElement("span"); kk.className = "rk"; kk.textContent = k;
      const vv = document.createElement("span"); vv.className = "rv"; vv.textContent = String(v);
      d.append(kk, vv);
      return d;
    };
    rows.append(
      stat("Turns", recap.turns),
      stat("Your army", recap.youArmy),
      stat("Enemy army", recap.aiArmy),
      stat("Your tiles", recap.youTiles),
      stat("Enemy tiles", recap.aiTiles),
    );

    const again = document.createElement("button");
    again.className = "cta";
    again.textContent = "Play again";
    again.onclick = () => { this.clearOverlay(); this.startMatch(); };

    const home = document.createElement("button");
    home.className = "ghostbtn";
    home.textContent = "Back to home";
    home.onclick = () => { this.clearOverlay(); this.show("home"); };

    card.append(h1, tag, rows, again, home);
    ov.appendChild(card);
    this.host.appendChild(ov);
    this.overlay = ov;
  }

  private clearOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private showRules(): void {
    const ov = document.createElement("div");
    ov.className = "overlay";
    const card = document.createElement("div");
    card.className = "card";
    const h1 = document.createElement("h1");
    h1.textContent = "How to play";
    const rules = document.createElement("div");
    rules.className = "rules";
    rules.innerHTML = `
      <b>Goal:</b> capture the enemy <b>nest</b>. One action per turn, <b>15s</b> per move.<br><br>
      <b>Move / Attack</b> a neighbour — the tile you take becomes a producing <b>stable</b>.
      Wild grey garrisons must be beaten to pass.<br><br>
      <b>Travel</b> to a far tile to send troops across open ground. The trail behind them is a
      <b>vein</b>: it carries supply but produces nothing, and has no defence.<br><br>
      <b>Rally</b> gathers every spare soldier in the colony onto one tile.<br><br>
      A tile only produces while a chain of your tiles links it back to your nest — cut off, it
      goes dark. <span class="hv">The Hive</span> wakes mid-match: taking its queen grants a
      growth surge, but the guards hit hard.<br><br>
      Combat is fully deterministic. Count it out before you commit.`;
    const close = document.createElement("button");
    close.className = "cta";
    close.textContent = "Got it";
    close.onclick = () => this.clearOverlay();
    card.append(h1, rules, close);
    ov.appendChild(card);
    this.host.appendChild(ov);
    this.overlay = ov;
  }
}

/* ----------------------------------------------------------------------- THUMBS */

const cssVar = (n: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/** Board thumbnail: a checkerboard with each colony's starting corner marked. */
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
