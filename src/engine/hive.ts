import { HIVE_GROW_EVERY } from "./config";
import { allTiles } from "./board";
import type { Coord, EngineEvent, GameState, Player, Tile } from "./types";

/**
 * THE HIVE — the map's shared objective and its clock.
 *
 * A five-tile plus-shape at the centre: a Queen and four guards. She grows stronger the
 * longer she is ignored, so turtling is punished and capture timing is a real decision.
 * Each capture raises her level, making the next one a bigger swing.
 */

export function hiveCells(state: GameState): Tile[] {
  return allTiles(state).filter((t) => t.terrain === "hiveQ" || t.terrain === "hiveG");
}

/** Growth surge multiplier granted to whoever holds the queen. Escalates with hive level. */
export const hiveBuffMultiplier = (state: GameState): number => state.hive.level + 1;

/**
 * Set the neutral hive garrison. Dormant is 1.5× tougher than awake — hard, but never
 * impossible for an early all-in.
 */
export function setHiveDefence(state: GameState): void {
  const L = state.hive.level;
  const elapsed = state.hive.awokeTurn !== null ? Math.max(0, state.turn - state.hive.awokeTurn) : 0;
  const step = Math.floor(elapsed / HIVE_GROW_EVERY);

  const queen = 16 + (L - 1) * 9 + step * 6;
  const guard = 9 + (L - 1) * 5 + step * 3;
  const mult = state.hive.phase === "dormant" ? 1.5 : 1;

  for (const t of hiveCells(state)) {
    if (t.owner !== null) continue;
    if (t.terrain === "hiveQ") t.soldiers = Math.max(1, Math.round(queen * mult));
    if (t.terrain === "hiveG") t.soldiers = Math.max(1, Math.round(guard * mult));
  }
}

/** Advance hive state at the start of `p`'s turn. */
export function hiveTick(state: GameState, p: Player, events: EngineEvent[] = []): EngineEvent[] {
  if (state.turn >= state.limits.awakenTurn && state.hive.phase === "dormant") {
    state.hive.phase = "awake";
    state.hive.awokeTurn = state.turn;
    setHiveDefence(state);
    events.push({ type: "hiveAwake" });
  }
  if (state.hive.phase === "buff" && state.hive.owner === p) {
    state.hive.buffLeft--;
    if (state.hive.buffLeft <= 0) respawnHive(state, events);
  }
  return events;
}

/**
 * The capturer holds all five hive tiles as STABLES for the surge.
 * They must be stables, not veins — as veins the pruner deleted them and they could not
 * be selected (CLAUDE.md §5).
 */
export function captureQueen(state: GameState, p: Player, events: EngineEvent[] = []): EngineEvent[] {
  state.hive.phase = "buff";
  state.hive.owner = p;
  state.hive.buffLeft = state.limits.buffTurns;

  const cells: Coord[] = [];
  for (const t of hiveCells(state)) {
    t.owner = p;
    t.soldiers = Math.max(t.soldiers, 1);
    t.struct = "stable";
    t.tunnel = false;
    cells.push({ c: t.c, r: t.r });
  }
  // The tiles ride along on the event: taking the queen changes five of them at once and
  // emits no `capture` for any of them, so without this the whole hive snapped to its new
  // colour with no reveal while every other capture in the game fills tile by tile.
  events.push({ type: "hiveCaptured", owner: p, level: state.hive.level, cells });
  return events;
}

/** When the surge ends the hive resets to neutral, one level stronger. */
export function respawnHive(state: GameState, events: EngineEvent[] = []): EngineEvent[] {
  state.hive.level++;
  state.hive.phase = "awake";
  state.hive.owner = null;
  state.hive.buffLeft = 0;
  state.hive.awokeTurn = state.turn;

  for (const t of hiveCells(state)) {
    t.owner = null;
    t.struct = null;
    t.soldiers = 0;
  }
  setHiveDefence(state);
  events.push({ type: "hiveRespawn", level: state.hive.level });
  return events;
}
