import { MAPS, START_SOLDIERS } from "./config";
import type { MapId } from "./config";
import { allTiles, makeGrid, nestTile, otherPlayer, tileAt } from "./board";
import { pruneAllVeins, recomputeConnectivity } from "./connectivity";
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
  /** The enemy's formation. Defaults to yours, so a mirrored start stays available. */
  aiShape?: ReadonlyArray<readonly [number, number]>;
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
    hive: { phase: "dormant", level: 1, owner: null, buffLeft: 0, coolLeft: 0, awokeTurn: null },
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
  const aiShape = opts.aiShape ?? shape;
  buildMap(state, reservedCells(state.size, shape, aiShape));
  const mods = opts.mods ?? { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } };
  placeStart(state, "you", shape, mods.you);
  placeStart(state, "ai", aiShape, mods.ai);

  setHiveDefence(state);
  recomputeConnectivity(state);
  return state;
}

/**
 * Cells both colonies will start on. Terrain generation must leave these alone, or a
 * rock can swallow a starting tile and a colony begins a tile short (CLAUDE.md §5).
 */
function reservedCells(
  size: number,
  shape: ReadonlyArray<readonly [number, number]>,
  aiShape: ReadonlyArray<readonly [number, number]>,
): Set<string> {
  const out = new Set<string>();
  for (const [dc, dr] of shape) {
    const you = startCell(size, "you", dc, dr);
    out.add(`${you.c},${you.r}`);
  }
  for (const [dc, dr] of aiShape) {
    const ai = startCell(size, "ai", dc, dr);
    out.add(`${ai.c},${ai.r}`);
  }
  return out;
}

/**
 * Where a formation cell lands for each colony.
 *
 * YOU hold the BOTTOM-LEFT corner and the enemy the TOP-RIGHT — the two ends of the
 * board's leading diagonal. Every map is symmetric under a 180° rotation about the centre
 * ((c,r) → (N-1-c, N-1-r)), which maps one corner exactly onto the other, so neither side
 * gets better ground. `onEnemyHalf` splits the board along that same diagonal.
 */
function startCell(
  size: number, p: Player, dc: number, dr: number,
): { c: number; r: number } {
  return p === "you"
    ? { c: dc, r: size - 1 - dr }
    : { c: size - 1 - dc, r: dr };
}

/**
 * The three maps, laid out cell by cell exactly as the legacy build authors them.
 *
 * They are hand-placed rather than generated: each one is a specific piece of level design
 * — where the lanes are, which resource is worth fighting for, where the wild garrisons sit
 * — and a generator produced bland, samey boards instead.
 */
function buildMap(state: GameState, reserved: Set<string>): void {
  const n = state.size;

  const set = (c: number, r: number, fn: (t: Tile) => void): void => {
    const t = tileAt(state, c, r);
    if (t) fn(t);
  };
  const setFree = (c: number, r: number, fn: (t: Tile) => void): void => {
    if (reserved.has(`${c},${r}`)) return;    // never overwrite a starting cell
    set(c, r, fn);
  };
  const hive = (c: number, r: number): void => {
    set(c, r, (t) => { t.terrain = "hiveQ"; });
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      set(c + dc, r + dr, (t) => { t.terrain = "hiveG"; });
    }
  };
  const resource = (c: number, r: number, guard: number): void => {
    setFree(c, r, (t) => { t.terrain = "resource"; t.guard = guard; });
  };
  const wild = (c: number, r: number, guard: number): void => {
    setFree(c, r, (t) => { t.guard = guard; });
  };
  const rock = (c: number, r: number): void => {
    setFree(c, r, (t) => { t.terrain = "blocked"; });
  };

  if (n === 7) {
    // Skirmish — a tight duel: everyone meets in the middle within a few turns.
    hive(3, 3);
    resource(1, 3, 5); resource(5, 3, 5);          // one contested resource each side
    wild(3, 1, 4); wild(3, 5, 4);                  // a wild garrison on each flank
    rock(1, 1); rock(5, 5);                        // lanes instead of an open square
    return;
  }

  if (n === 13) {
    // Gauntlet — two side lakes funnel everyone through the Queen's channel.
    hive(6, 6);
    resource(3, 2, 5); resource(9, 10, 5);         // corner resources
    resource(6, 2, 4); resource(6, 10, 4);         // top and bottom lanes
    resource(4, 6, 6); resource(8, 6, 6);          // flanking the Queen's channel
    // Lakes last, and only over open ground: a semicircle bulging in from each side wall.
    const R = 3, cr = 6;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const t = tileAt(state, c, r);
        if (!t || t.terrain !== "ground") continue;
        const left = c * c + (r - cr) * (r - cr);
        const right = (c - (n - 1)) * (c - (n - 1)) + (r - cr) * (r - cr);
        if (left <= R * R || right <= R * R) rock(c, r);
      }
    }
    return;
  }

  // Corridor (9×9) — the original board.
  hive(4, 4);
  rock(2, 3); rock(6, 5); rock(6, 3); rock(2, 5);
  resource(1, 3, 6); resource(7, 5, 6);            // the defended pair
  resource(5, 1, 0); resource(3, 7, 0);            // and two open ones
  wild(5, 3, 4); wild(3, 5, 4);                    // wild ant colonies
}

/**
 * Place a colony's five starting tiles: a nest plus four stables.
 * ALWAYS exactly five — no upgrade may add more (CLAUDE.md §5), so the cells are forced to
 * open ground rather than skipped when terrain got there first.
 */
function placeStart(
  state: GameState, p: Player,
  shape: ReadonlyArray<readonly [number, number]>,
  mods: PlayerMods,
): void {
  const n = state.size;
  let placed = 0;

  shape.forEach(([dc, dr], i) => {
    const { c, r } = startCell(n, p, dc, dr);
    const t = tileAt(state, c, r);
    if (!t) return;
    t.terrain = "ground";
    t.owner = p;
    t.guard = 0;
    if (i === 0) {
      t.struct = "nest";
      t.soldiers = START_SOLDIERS.nest + mods.royal;   // Royal Chamber: +1 per level
    } else {
      t.struct = "stable";
      t.soldiers = START_SOLDIERS.stable;
    }
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
  // Effects break structure — venom eats a trail, fire wipes a tile — so the colony has to
  // be re-examined before anything else in the turn reads it. Trails that lost an anchor
  // prune, then supply lines are rebuilt, so a colony severed by the barrage goes inactive
  // in the same tick it was cut rather than on the next action (CLAUDE.md §4.2).
  pruneAllVeins(state, events);
  recomputeConnectivity(state);
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

  /*
   * NO TURN LIMIT (CLAUDE.md §4.8).
   *
   * The clock used to run out and hand the match to whoever held more ground. That decided
   * games nobody had won — a player ahead on territory could simply stop playing, and one
   * behind had no way back however the position stood. A match ends when a queen falls and
   * only then, so `limits.turnLimit` is now just the length a match is EXPECTED to run:
   * the AI prices income against it, and the measurement tools adjudicate there so their
   * numbers stay comparable. Neither is a rule of the game.
   */
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
