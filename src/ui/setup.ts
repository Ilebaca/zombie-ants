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
import type { Look, MapId, ShapeId, SpeciesId } from "../engine";
import { SPECIES_ORDER, chapterOf } from "../platform";
import type { ProfileStore } from "../platform";
import { groundFor } from "./regions";
import { antHead, drawSnapshot, groundReady, lookCol, setFactionColor } from "../render";
import { coverFor } from "./covers";
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

/** `.screen`'s own inset, which the stage does not add to (skin.css). */
const GUTTER_PX = 16;
/**
 * The header above the picture and the picker + PLAY below it. A measured constant rather
 * than a reading, because the board is drawn while the screen is still being built and has
 * no layout to measure; it only has to be near enough that the picture never outgrows the
 * room, which the bottom-aligned stage then takes up from below.
 */
const CHROME_PX = 330;
/**
 * A ceiling, for a tablet. Left to the width alone the board grows past the reading column
 * the name and the button underneath it are held to, and a picture wider than its own
 * controls reads as two screens stacked.
 */
const MAX_BOARD_PX = 520;

export function buildSetup(o: SetupOptions): HTMLElement {
  const root = screenEl("formation");
  let step: Step = "shape";

  // THE COLONIES A PLAYER MAY ACTUALLY FIELD. The old picker showed locked ones so the
  // goal was visible, and refused them with a toast — which is fine on a grid of cards a
  // player is scanning. An arrow that steps ONTO something it will then not accept is a
  // dead end, so the row walks what they own; the Antarium is where the rest are seen.
  const owned = SPECIES_ORDER.filter((id) => o.profile.isUnlocked(id));
  if (!owned.includes(o.choices.species)) o.choices.species = owned[0] as SpeciesId;
  // THE PICKER OPENS ON THE LAST PICK. It used to reset to the first formation every time,
  // which meant a player with a favourite re-stepped to it before every single match. The
  // choice is carried on the profile (`lastShape`/`lastSpecies`, written when a match
  // starts), so all this screen does is refuse one the build no longer has.
  if (!SHAPE_IDS.includes(o.choices.shape)) o.choices.shape = SHAPE_IDS[0] as ShapeId;

  const head = el("div", "setuptop");
  root.appendChild(head);

  const stage = el("div", "setupstage");
  const shot = document.createElement("canvas");
  shot.id = "setupBoard";
  stage.appendChild(shot);
  // THE COLONY STEP SHOWS THE COLONY, NOT THE BOARD. The second step recoloured the same
  // picture and stepped the name under it, so the thing the player was choosing — which
  // ant — was a word and a tint on a map. It is the colony's own painting now, and the
  // paintings SLIDE: a rail of all of them, moved one across per press, so stepping
  // through reads as walking down a row rather than as one picture being swapped.
  const reel = el("div", "coverslide");
  reel.id = "setupReel";
  const rail = el("div", "coverrail");
  for (const id of owned) rail.appendChild(coverPane(id, o.profile.lookFor(id)));
  reel.appendChild(rail);
  stage.appendChild(reel);
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
    // Which of the two pictures the stage is showing. Both stay in the DOM: the rail has
    // to keep its position so stepping back to the colony lands where it was left, and
    // rebuilding it per press would restart the slide from a standing start every time.
    const picking = step === "species";
    reel.classList.toggle("on", picking);
    shot.classList.toggle("off", picking);
    rail.style.transform = `translate3d(${-100 * Math.max(0, owned.indexOf(o.choices.species))}%,0,0)`;
    // THE GROUND THE MATCH WILL BE PLAYED ON, not a generic one: the player is choosing a
    // formation FOR a place, and the region is decided by the chapter they are standing on
    // (§ THE BOARD'S GROUND IS PAINTED PER REGION). The lookup is done HERE because the
    // renderer may not read the progression layer — what crosses is a url.
    const art = groundFor(chapterOf(o.profile.get().colony));
    drawBoard(shot, o.choices.shape, o.choices.species, art);
    // A STILL IS DRAWN ONCE, and the picture is a file that lands a beat later — so
    // without this the screen keeps the drawn ground for ever while the match it opens
    // plays on the painting. The redraw reads the choices LIVE, or a picture arriving
    // after the player has stepped on would put the previous formation back.
    //
    // THE REDRAW IS WHY THIS SCREEN USED TO BLINK, and the fix is not here. Opening it
    // for the first time showed one frame of the game's own DRAWN forest floor and then
    // the region — reported exactly that way. WAITING for the picture instead was tried
    // and is worse: an image element that never fires either event (jsdom, and any
    // browser that simply never answers) leaves the board blank for ever, and a blank
    // square reads as broken where a redraw reads as loading. So the picture is asked
    // for a screen EARLIER, on home (`App.renderHome`), and by the time PLAY is pressed
    // it is already in hand — the first draw gets it and there is nothing to redraw.
    void groundReady(art).then(() => {
      if (shot.isConnected) drawBoard(shot, o.choices.shape, o.choices.species, art);
    });
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
    // NO HEAD BESIDE THE NAME. It was there because a colony is a face everywhere else it
    // is named — but the picture above the name is now that colony, at the size the art
    // was painted for, so the little drawn head was the same fact twice on one line and
    // the smaller of the two.
    label.appendChild(el("span", "picktext", step === "shape"
      ? shapeName(o.choices.shape)
      : SPECIES[o.choices.species].name));
    go.textContent = step === "shape" ? "Next" : "Play";
    // A DEAD ARROW HAS TO LOOK DEAD. Clamping without this is a control that answers a
    // press by doing nothing, which is the one thing this app keeps being bitten by —
    // from the outside it is indistinguishable from a button that has stopped working.
    const list = step === "shape" ? (SHAPE_IDS as string[]) : (owned as string[]);
    const at = list.indexOf(step === "shape" ? o.choices.shape : o.choices.species);
    prev.disabled = at <= 0;
    next.disabled = at >= list.length - 1;
    draw();
  };

  /**
   * THE PICKER STOPS AT BOTH ENDS; it does not wrap.
   *
   * It used to, and with the colony step drawn as a RAIL that is the one place wrapping
   * cannot work: going past the last colony slid the whole row backwards across every
   * other one to reach the first, which reads as the screen throwing the player back to
   * the start rather than as one more step. Clamping is also what lets the arrow at the
   * end go DEAD and SAY SO — a wrapping picker has no ends, so it can never tell you
   * that you have seen everything.
   *
   * BOTH steps stop, not just the colony one. They are the same two arrows in the same
   * place on one screen, and an arrow that wraps on the formation and stops on the
   * colony is two behaviours to learn for one control.
   *
   * THE DISABLED ARROW IS THE MECHANISM, not a second one. A first version also clamped
   * the index in here, and the mutation that turned that clamp back into a wrap passed
   * every test — because a disabled button cannot be pressed, so the clamp was
   * unreachable code dressed as a rule (§ the ability card: one mechanism, and the one a
   * player can see). What is left is a FALLBACK: a press that got through anyway leaves
   * the choice where it was, rather than stepping off the end of the list.
   */
  const cycle = (by: number): void => {
    if (step === "shape") {
      const i = SHAPE_IDS.indexOf(o.choices.shape);
      o.choices.shape = SHAPE_IDS[i + by] ?? o.choices.shape;
    } else {
      const i = owned.indexOf(o.choices.species);
      o.choices.species = owned[i + by] ?? o.choices.species;
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
function drawBoard(
  canvas: HTMLCanvasElement, shape: ShapeId, species: SpeciesId, art: string,
): void {
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
  // The picture is the middle of the screen, and it is sized against what is ACTUALLY
  // left: the screen's own 16px gutter either side, and the header and the picker row
  // above and below it. Sized off a fraction of the viewport instead, the board came out
  // wider than the box it is centred in — and a picture wider than its column does not
  // centre, it overflows to the right and is clipped there.
  const across = state.size + 2 * MAP_PAD_TILES;
  const room = Math.min(w - GUTTER_PX * 2, h - CHROME_PX, MAX_BOARD_PX);
  const tile = Math.max(12, Math.floor(room / across));
  drawSnapshot(canvas, state, { tile, terrain: true, art, padTiles: MAP_PAD_TILES });
}

/**
 * ONE COLONY ON THE RAIL.
 *
 * A COLONY WITHOUT A PAINTING KEEPS ITS DRAWN HEAD, in a pane of the same shape — the
 * same rule the species page's cover follows, and the reason the structure could land
 * before the art did. A pane that simply vanished would leave a hole in the rail and put
 * every colony after it one place out, which is the one thing a slider must not do.
 */
function coverPane(id: SpeciesId, look: Look): HTMLElement {
  const pane = el("div", "coverpane");
  const art = coverFor(id);
  if (art) {
    const img = document.createElement("img");
    img.src = art;
    img.className = "coverimg";
    // The NAME is written directly under the rail, so the picture repeating it would be
    // the same thing said twice to a screen reader (§ EVERY CONTROL SAYS WHAT IT IS).
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    pane.appendChild(img);
  } else {
    pane.classList.add("plain");
    const mark = document.createElement("canvas");
    mark.width = 320; mark.height = 320;
    mark.className = "coverhead";
    mark.setAttribute("aria-hidden", "true");
    const ctx = mark.getContext("2d");
    if (ctx) antHead(ctx, 160, 160, 145, lookCol(id, look), look);
    pane.appendChild(mark);
  }
  return pane;
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
