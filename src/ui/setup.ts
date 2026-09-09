/**
 * THE SETUP: ONE SCREEN, TWO CHOICES.
 *
 * It was three — a map picker, a colony picker and a formation picker — and the first of
 * them asked a new player to choose between 7×7, 9×9 and 13×13 before they knew what a
 * Hive was. There is one board now (`engine/config.ts`), so the map screen had nothing
 * left to ask; and what remained was two pickers of the same shape, one after the other,
 * for two facts about the same five tiles.
 *
 * So: ONE board, drawn once, with the player's own formation on it. Under it a row that
 * steps through the choice — an arrow, a name, an arrow — and under that the button that
 * moves on. Pressing it does not navigate: the SAME row starts naming colonies instead of
 * formations, the tiles on the board recolour, and the button becomes Play. The picture
 * never changes place, so the player is watching the one thing they are deciding about
 * rather than two screens of cards.
 *
 * The board shows NO ENEMY. A colony in the far corner is the only thing on the picture
 * that is not the choice being made, and at this size it reads as part of the formation.
 *
 * It MUTATES the choices it is given rather than returning a new one. The object is the
 * app's, the screen is its editor, and the tour walks the player through it a step at a
 * time — a copy handed back at the end would lose a choice the moment a step navigated.
 */
import { SPECIES, START_SHAPES, createGame, razeTile } from "../engine";
import type { MapId, ShapeId, SpeciesId } from "../engine";
import { SPECIES_ORDER } from "../platform";
import type { ProfileStore } from "../platform";
import { antHead, drawSnapshot, lookCol, setFactionColor } from "../render";
import { el, screenEl, screenHeader, setupSteps } from "./chrome";
import { icon } from "./icons";

/** What a match is built from. The setup screen is the only thing that writes it. */
export interface Choices {
  map: MapId;
  species: SpeciesId;
  shape: ShapeId;
}

export interface SetupOptions {
  /** Written in place as the player picks. */
  choices: Choices;
  profile: ProfileStore;
  /** The back arrow on the first step. */
  onBack: () => void;
  /** Play: the flow is done and the match can be found. */
  onBegin: () => void;
  /** The router's cue that a step was completed, for the guided tour. */
  onStep?: (step: Step) => void;
}

/** The two things this screen asks, in the order it asks them. */
export type Step = "shape" | "species";

const SHAPE_IDS = Object.keys(START_SHAPES) as ShapeId[];

/** Soil left around the playfield, in tiles — enough for the clearing's feathered edge. */
export const MAP_PAD_TILES = 0.9;

export function buildSetup(o: SetupOptions): HTMLElement {
  const root = screenEl("formation");
  let step: Step = "shape";

  // THE COLONIES A PLAYER MAY ACTUALLY FIELD. The old picker showed locked ones so the
  // goal was visible, and refused them with a toast — which is fine on a grid of cards a
  // player is scanning. An arrow that steps ONTO something it will then not accept is a
  // dead end, so the row walks what they own; the Antarium is where the rest are seen.
  const owned = SPECIES_ORDER.filter((id) => o.profile.isUnlocked(id));
  if (!owned.includes(o.choices.species)) o.choices.species = owned[0] as SpeciesId;
  // A fresh choice each time, exactly as the legacy build opens: the picker is not a
  // memory of the last match.
  o.choices.shape = SHAPE_IDS[0] as ShapeId;

  const head = el("div", "setuptop");
  root.appendChild(head);

  const stage = el("div", "setupstage");
  const shot = document.createElement("canvas");
  shot.id = "setupBoard";
  stage.appendChild(shot);
  root.appendChild(stage);

  const foot = el("div", "setupfoot");
  const picker = el("div", "pickrow");
  const prev = arrow("back", "Previous");
  prev.id = "pickPrev";
  const label = el("div", "pickname");
  label.id = "pickName";
  const next = arrow("next", "Next");
  next.id = "pickNext";
  picker.append(prev, label, next);

  const go = el("button", "cta");
  go.id = "setupGo";
  foot.append(picker, go);
  root.appendChild(foot);

  const draw = (): void => {
    // The whole UI takes the colony's colours — the button, the chips, the board — so the
    // recolour has to happen before the picture is drawn, not after (§ skins).
    setFactionColor("you", o.choices.species, o.profile.lookFor(o.choices.species));
    drawBoard(shot, o.choices.shape, o.choices.species);
  };

  const render = (): void => {
    head.replaceChildren();
    screenHeader(head, {
      title: step === "shape" ? "Formation" : "Colony",
      onBack: () => (step === "shape" ? o.onBack() : back()),
      backId: "setupBack",
    });
    head.appendChild(setupSteps(step === "shape" ? 0 : 1));

    label.replaceChildren();
    if (step === "species") {
      // The colony's own head beside its name, because a colony is a face in this game
      // everywhere else it is named.
      const mark = document.createElement("canvas");
      mark.width = 64; mark.height = 64;
      mark.className = "pickface";
      mark.setAttribute("aria-hidden", "true");
      const ctx = mark.getContext("2d");
      const look = o.profile.lookFor(o.choices.species);
      if (ctx) antHead(ctx, 32, 32, 29, lookCol(o.choices.species, look), look);
      label.appendChild(mark);
    }
    label.appendChild(el("span", "picktext", step === "shape"
      ? shapeName(o.choices.shape)
      : SPECIES[o.choices.species].name));
    go.textContent = step === "shape" ? "Next" : "Play";
    draw();
  };

  const cycle = (by: number): void => {
    if (step === "shape") {
      const i = SHAPE_IDS.indexOf(o.choices.shape);
      o.choices.shape = SHAPE_IDS[(i + by + SHAPE_IDS.length) % SHAPE_IDS.length] as ShapeId;
    } else {
      const i = owned.indexOf(o.choices.species);
      o.choices.species = owned[(i + by + owned.length) % owned.length] as SpeciesId;
    }
    render();
  };
  prev.onclick = () => cycle(-1);
  next.onclick = () => cycle(1);

  const back = (): void => { step = "shape"; render(); };
  go.onclick = () => {
    if (step === "shape") {
      step = "species";
      render();
      o.onStep?.("shape");
      return;
    }
    o.onStep?.("species");
    o.onBegin();
  };

  render();
  return root;
}

/** "zigzag" → "Zigzag". The ids are the names; there is no second table to keep in step. */
export const shapeName = (id: ShapeId): string => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * THE BOARD, AS THE MATCH WILL DRAW IT — with the player's five tiles and nobody else's.
 *
 * A real `GameState` through the board's own code (render/snapshot.ts), so the terrain, the
 * rocks, the resources and the Hive are where they will actually be, and a change to how a
 * nest is drawn reaches this screen on the same commit. The ENEMY is razed off it: their
 * corner is the one thing in the picture that is not the choice being made.
 */
function drawBoard(canvas: HTMLCanvasElement, shape: ShapeId, species: SpeciesId): void {
  const state = createGame({
    map: "small",
    species: { you: species, ai: species },
    shape: START_SHAPES[shape],
    // Seeded on nothing that moves, so stepping through twelve formations does not
    // reshuffle the ground under them.
    seed: 0x5eed,
  });
  for (const row of state.grid) {
    for (const t of row) {
      if (t.owner !== "ai") continue;
      razeTile(t);
      t.guard = 0;
    }
  }
  const w = window.innerWidth || 390;
  const h = window.innerHeight || 780;
  // The picture is the middle of the screen: the header and the picker take the rest, so
  // the tile is sized off whichever of the two runs out first.
  const across = state.size + 2 * MAP_PAD_TILES;
  const tile = Math.max(12, Math.floor(Math.min(w - 32, h * 0.5) / across));
  drawSnapshot(canvas, state, { tile, terrain: true, padTiles: MAP_PAD_TILES });
}

/** One of the two stepper buttons. A mark and a name, never a glyph (§10). */
function arrow(mark: string, label: string): HTMLButtonElement {
  const b = el("button", "pickarrow");
  b.appendChild(icon(mark, 20));
  b.setAttribute("aria-label", label);
  return b as HTMLButtonElement;
}

/** The enemy's formation, chosen at setup time — the engine itself stays free of randomness. */
export function rollShape(rng: () => number = Math.random): ShapeId {
  return SHAPE_IDS[Math.floor(rng() * SHAPE_IDS.length)] ?? "wedge";
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
