import { MAPS, START_SOLDIERS } from "./config";
import type { MapId } from "./config";
import { allTiles, makeGrid, nestTile, otherPlayer, tileAt } from "./board";
import { recomputeConnectivity } from "./connectivity";
import { setHiveDefence, hiveTick } from "./hive";
import { runProduction } from "./production";
import { tickEffects } from "./effects";
import { speciesOf } from "./species";
import { NEUTRAL_MODS } from "./types";
import type {
  EngineEvent, GameState, Grid, Player, PlayerMods, SpeciesId, Tile,
} from "./types";

export interface NewGameOptions {
  map: MapId;
  species: Record<Player, SpeciesId>;
  /** Five-tile starting shape, as offsets from the corner anchor. */
  shape?: ReadonlyArray<readonly [number, number]>;
  mods?: Record<Player, PlayerMods>;
  /** Seeds ability scatter. The same seed and moves replay identically. */
  seed?: number;
}

/** The 12 starting formations. Every one is exactly five tiles (CLAUDE.md §5). */
export const START_SHAPES = {
  wedge:  [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0]],
  line:   [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
  hook:   [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],
  arrow:  [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
  zigzag: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]],
  column: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  corner: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  tower:  [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0]],
  fan:    [[0, 0], [1, 0], [0, 1], [0, 2], [1, 2]],
  step:   [[0, 0], [1, 0], [2, 0], [2, 1], [1, 1]],
  claw:   [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]],
  spire:  [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]],
} as const satisfies Record<string, ReadonlyArray<readonly [number, number]>>;

export type ShapeId = keyof typeof START_SHAPES;

export function createGame(opts: NewGameOptions): GameState {
  const def = MAPS[opts.map];
  const grid: Grid = makeGrid(def.size);

  const state: GameState = {
    grid,
    size: def.size,
    turn: 1,
    current: "you",
    over: false,
    winner: null,
    hive: { phase: "dormant", level: 1, owner: null, buffLeft: 0, awokeTurn: null },
    effects: [],
    species: { ...opts.species },
    cooldown: {
      you: speciesOf(opts.species.you).ability.startSpent ? speciesOf(opts.species.you).ability.cooldown : 0,
      ai: speciesOf(opts.species.ai).ability.startSpent ? speciesOf(opts.species.ai).ability.cooldown : 0,
    },
    shield: { you: 0, ai: 0 },
    cloak: { you: 0, ai: 0 },
    conn: { you: new Set(), ai: new Set() },
    limits: { awakenTurn: def.awakenTurn, turnLimit: def.turnLimit, buffTurns: def.buffTurns },
    rng: (opts.seed ?? 0x9e3779b9) | 0,
  };

  const shape = opts.shape ?? START_SHAPES.wedge;
  buildMap(state, reservedCells(state.size, shape));
  const mods = opts.mods ?? { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
  placeStart(state, "you", shape, mods.you);
  placeStart(state, "ai", shape, mods.ai);

  setHiveDefence(state);
  recomputeConnectivity(state);
  return state;
}

/**
 * Cells both colonies will start on. Terrain generation must leave these alone, or a
 * rock can swallow a starting tile and a colony begins a tile short (CLAUDE.md §5).
 */
function reservedCells(size: number, shape: ReadonlyArray<readonly [number, number]>): Set<string> {
  const out = new Set<string>();
  for (const [dc, dr] of shape) {
    out.add(`${dc},${dr}`);                                  // "you" corner
    out.add(`${size - 1 - dc},${size - 1 - dr}`);            // mirrored "ai" corner
  }
  return out;
}

/** Hive plus-shape at the exact centre, plus symmetric resources, guards and rocks. */
function buildMap(state: GameState, reserved: Set<string>): void {
  const n = state.size;
  const mid = Math.floor(n / 2);

  const set = (c: number, r: number, fn: (t: Tile) => void): void => {
    const t = tileAt(state, c, r);
    if (t) fn(t);
  };
  const setFree = (c: number, r: number, fn: (t: Tile) => void): void => {
    if (reserved.has(`${c},${r}`)) return;    // never overwrite a starting cell
    set(c, r, fn);
  };

  set(mid, mid, (t) => { t.terrain = "hiveQ"; });
  set(mid - 1, mid, (t) => { t.terrain = "hiveG"; });
  set(mid + 1, mid, (t) => { t.terrain = "hiveG"; });
  set(mid, mid - 1, (t) => { t.terrain = "hiveG"; });
  set(mid, mid + 1, (t) => { t.terrain = "hiveG"; });

  // Resources placed mirror-symmetrically, most behind a wild garrison.
  const inset = Math.max(1, Math.floor(n / 4));
  const spots: Array<[number, number]> = [
    [inset, mid], [n - 1 - inset, mid],
    [mid, inset], [mid, n - 1 - inset],
  ];
  for (const [c, r] of spots) {
    setFree(c, r, (t) => { if (t.terrain === "ground") { t.terrain = "resource"; t.guard = 4 + Math.floor(n / 3); } });
  }

  // Rock blockers create lanes. Mirrored so neither side gets a geometric edge.
  const rocks: Array<[number, number]> = n >= 9
    ? [[inset, inset], [n - 1 - inset, n - 1 - inset], [n - 1 - inset, inset], [inset, n - 1 - inset]]
    : [];
  for (const [c, r] of rocks) setFree(c, r, (t) => { if (t.terrain === "ground") t.terrain = "blocked"; });
}

/**
 * Place a colony's five starting tiles: a nest plus four stables.
 * ALWAYS exactly five — no upgrade may add more (CLAUDE.md §5).
 */
function placeStart(
  state: GameState, p: Player,
  shape: ReadonlyArray<readonly [number, number]>,
  mods: PlayerMods,
): void {
  const n = state.size;
  const topLeft = p === "you";
  let placed = 0;

  shape.forEach(([dc, dr], i) => {
    const c = topLeft ? dc : n - 1 - dc;
    const r = topLeft ? dr : n - 1 - dr;
    const t = tileAt(state, c, r);
    if (!t || t.terrain === "blocked" || t.terrain === "hiveQ" || t.terrain === "hiveG") return;
    t.owner = p;
    if (i === 0) {
      t.struct = "nest";
      t.soldiers = START_SOLDIERS.nest + mods.royal;   // Royal Chamber: +1 per level
    } else {
      t.struct = "stable";
      t.soldiers = START_SOLDIERS.stable;
    }
    t.guard = 0;
    placed++;
  });

  if (placed === 0) throw new Error(`could not place starting colony for ${p}`);
}

/* --------------------------------------------------------------------- TURN FLOW */

/** Begin `state.current`'s turn: effects, cooldowns, hive, then production. */
export function startTurn(state: GameState, mods: Record<Player, PlayerMods>): EngineEvent[] {
  const events: EngineEvent[] = [];
  const p = state.current;

  tickEffects(state, p, mods[p], events);
  if (state.cooldown[p] > 0) state.cooldown[p]--;
  if (state.shield[p] > 0) state.shield[p]--;
  if (state.cloak[p] > 0) state.cloak[p]--;
  hiveTick(state, p, events);
  runProduction(state, p, mods[p], events);
  return events;
}

/** Hand over to the other player. A full round = both players moved. */
export function endTurn(state: GameState, mods: Record<Player, PlayerMods>): EngineEvent[] {
  if (state.over) return [];
  state.current = otherPlayer(state.current);
  if (state.current === "you") state.turn++;

  if (state.turn > state.limits.turnLimit) {
    // The fungus blooms: the larger colony consumes the smaller.
    const you = allTiles(state).filter((t) => t.owner === "you").length;
    const ai = allTiles(state).filter((t) => t.owner === "ai").length;
    const winner: Player = you >= ai ? "you" : "ai";
    state.over = true; state.winner = winner;
    return [{ type: "gameOver", winner, reason: "turnLimit" }];
  }
  return startTurn(state, mods);
}

export function surrender(state: GameState, p: Player): EngineEvent[] {
  state.over = true;
  state.winner = otherPlayer(p);
  return [{ type: "gameOver", winner: state.winner, reason: "surrender" }];
}

/**
 * Stop the match because a scenario objective was met or missed.
 *
 * The engine does not know what the objective was — that is the shell's business — but
 * ending a match is a state change, so it belongs here rather than in the view, where a
 * half-ended match could keep taking input.
 */
export function endByObjective(state: GameState, winner: Player): EngineEvent[] {
  if (state.over) return [];
  state.over = true;
  state.winner = winner;
  return [{ type: "gameOver", winner, reason: "objective" }];
}

/* ----------------------------------------------------- SNAPSHOT / RESTORE (for AI) */

export interface Snapshot {
  tiles: Tile[];
  turn: number;
  current: Player;
  over: boolean;
  winner: Player | null;
  hive: GameState["hive"];
  effects: GameState["effects"];
  cooldown: GameState["cooldown"];
  shield: GameState["shield"];
  cloak: GameState["cloak"];
  conn: { you: Set<string>; ai: Set<string> };
  /** Without this, a simulated ability would advance the real match's scatter stream. */
  rng: number;
}

/**
 * Cheap deep copy of everything an action can mutate. The AI applies a move, scores the
 * result, then restores — so search never leaks into the real game.
 */
export function snapshot(state: GameState): Snapshot {
  return {
    tiles: allTiles(state).map((t) => ({ ...t })),
    turn: state.turn,
    current: state.current,
    over: state.over,
    winner: state.winner,
    hive: { ...state.hive },
    effects: state.effects.map((e) => ({ ...e })),
    cooldown: { ...state.cooldown },
    shield: { ...state.shield },
    cloak: { ...state.cloak },
    conn: { you: new Set(state.conn.you), ai: new Set(state.conn.ai) },
    rng: state.rng,
  };
}

export function restore(state: GameState, snap: Snapshot): void {
  let i = 0;
  for (const row of state.grid) {
    for (let c = 0; c < row.length; c++) {
      const saved = snap.tiles[i++];
      if (saved) row[c] = { ...saved };
    }
  }
  state.turn = snap.turn;
  state.current = snap.current;
  state.over = snap.over;
  state.winner = snap.winner;
  state.hive = { ...snap.hive };
  state.effects = snap.effects.map((e) => ({ ...e }));
  state.cooldown = { ...snap.cooldown };
  state.shield = { ...snap.shield };
  state.cloak = { ...snap.cloak };
  state.conn = { you: new Set(snap.conn.you), ai: new Set(snap.conn.ai) };
  state.rng = snap.rng;
}

export { nestTile };
