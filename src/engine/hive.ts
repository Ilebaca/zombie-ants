import {
  HIVE_COOLDOWN, HIVE_GROW_EVERY, HIVE_GUARD_BASE, HIVE_GUARD_STEP, HIVE_LEVEL_GROWTH,
  HIVE_QUEEN_BASE, HIVE_QUEEN_STEP,
} from "./config";
import { allTiles } from "./board";
import type { Coord, EngineEvent, GameState, Player, Tile } from "./types";

/**
 * THE HIVE — the map's shared objective and its clock.
 *
 * A five-tile plus-shape at the centre: a Queen and four guards. She grows stronger the
 * longer she is ignored, so turtling is punished and capture timing is a real decision.
 * Each capture raises her level, making the next one a bigger swing.
 */

/**
 * Do the five tiles behave as THE HIVE right now? Only while she is neutral and standing.
 *
 * Dead — between a surge lapsing and her growing back — they are bare ground with no
 * garrison. The combat path used to recognise them by terrain regardless, so attacking the
 * empty middle tile beat a garrison of zero and handed out a full surge from a corpse.
 *
 * Held during a surge, they are ordinary tiles of whoever holds them. They can be fought for
 * like any others, but taking them does not hand the growth over: once a colony has her the
 * surge is theirs for its full length, or the reward for cracking a garrison of eighty was
 * one turn of production before somebody standing nearby walked in and took it off them.
 */
export const queenIsTakeable = (state: GameState): boolean =>
  state.hive.phase === "dormant" || state.hive.phase === "awake";

/**
 * How long a surge runs, and how long the queen stays dead afterwards.
 *
 * Both stretch by a turn per level. A level-3 queen costs far more to crack than a level-1
 * one, so the swing she pays out has to grow with her — and the gap before she returns has
 * to grow too, or the board spends more and more of the match with a surge running on it.
 */
export const surgeTurns = (state: GameState): number =>
  state.limits.buffTurns + (state.hive.level - 1);
export const surgeCooldown = (state: GameState): number =>
  HIVE_COOLDOWN + (state.hive.level - 1);

export function hiveCells(state: GameState): Tile[] {
  return allTiles(state).filter((t) => t.terrain === "hiveQ" || t.terrain === "hiveG");
}

/** Growth surge multiplier granted to whoever holds the queen. Escalates with hive level. */
export const hiveBuffMultiplier = (state: GameState): number => state.hive.level + 1;

/**
 * Set the neutral hive garrison. Dormant is 1.5× tougher than awake — hard, but never
 * impossible for an early all-in.
 *
 * The level MULTIPLIES the whole garrison, growth step included, and `awokeTurn` survives a
 * respawn. Both are needed for the one property that matters: a queen must never come back
 * weaker than the one that was just beaten. With a flat per-level bonus and a growth clock
 * that restarted on respawn, a long-ignored level-1 queen (16 + many steps) outclassed the
 * level-2 queen who replaced her (25), so capturing her made the Hive EASIER.
 */
export function setHiveDefence(state: GameState): void {
  for (const t of hiveCells(state)) {
    if (t.owner !== null) continue;
    t.soldiers = Math.max(1, hiveGarrison(state, t.terrain === "hiveQ"));
  }
}

/** What one neutral hive tile is worth right now. */
export function hiveGarrison(state: GameState, queen: boolean): number {
  const elapsed = state.hive.awokeTurn !== null ? Math.max(0, state.turn - state.hive.awokeTurn) : 0;
  const step = Math.floor(elapsed / HIVE_GROW_EVERY);
  const base = queen
    ? HIVE_QUEEN_BASE + step * HIVE_QUEEN_STEP
    : HIVE_GUARD_BASE + step * HIVE_GUARD_STEP;
  const level = Math.pow(HIVE_LEVEL_GROWTH, state.hive.level - 1);
  const dormant = state.hive.phase === "dormant" ? 1.5 : 1;
  return Math.round(base * level * dormant);
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
    if (state.hive.buffLeft <= 0) endSurge(state, events);
    return events;                       // the tick that ends a surge does not also spend
  }                                      // the first turn of the wait that follows it
  // The dead queen's own clock. She belongs to nobody while she is gone, so it runs once
  // per ROUND rather than once per side — tied to a player it would halve the wait.
  if (state.hive.phase === "cooling" && p === "you") {
    state.hive.coolLeft--;
    if (state.hive.coolLeft <= 0) respawnHive(state, events);
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
  state.hive.buffLeft = surgeTurns(state);

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

/**
 * The surge lapses: the five tiles are the capturing colony's only for as long as it runs.
 *
 * They go back to bare ground here, and the queen is simply GONE — no garrison to fight,
 * nothing to capture — until she grows back. That gap is the point. Without it a colony
 * could ride a surge and walk straight onto a fresh queen the moment it lapsed, which
 * turns the Hive from a contest into a tap.
 */
export function endSurge(state: GameState, events: EngineEvent[] = []): EngineEvent[] {
  state.hive.phase = "cooling";
  state.hive.owner = null;
  state.hive.buffLeft = 0;
  state.hive.coolLeft = surgeCooldown(state);

  absorbGarrisons(state);
  for (const t of hiveCells(state)) {
    t.owner = null;
    t.struct = null;
    t.soldiers = 0;
    t.tunnel = false;
  }
  events.push({ type: "hiveSurgeEnded", level: state.hive.level });
  return events;
}

/**
 * The queen grows back on the empty ground, one level stronger.
 *
 * `awokeTurn` is deliberately NOT reset: the growth clock runs from the hive's first waking
 * for the whole match, which together with the level multiplier guarantees she returns
 * stronger than she fell (see `setHiveDefence`).
 */
export function respawnHive(state: GameState, events: EngineEvent[] = []): EngineEvent[] {
  state.hive.level++;
  state.hive.phase = "awake";
  state.hive.owner = null;
  state.hive.buffLeft = 0;
  state.hive.coolLeft = 0;

  // Anything camped on the bare ground waiting for her is eaten too, on top of whatever was
  // banked when the surge lapsed. Sitting on the hive through the cooldown does not deny the
  // respawn — it feeds it.
  absorbGarrisons(state);
  for (const t of hiveCells(state)) {
    t.owner = null;
    t.struct = null;
    t.soldiers = 0;
    t.tunnel = false;
  }
  setHiveDefence(state);
  spendBanked(state);
  events.push({ type: "hiveRespawn", level: state.hive.level });
  return events;
}

/** Take everything standing on the five tiles into the pool the next queen comes back with. */
function absorbGarrisons(state: GameState): void {
  for (const t of hiveCells(state)) {
    if (t.soldiers > 0) state.hive.banked += t.soldiers;
  }
}

/**
 * Hand the banked soldiers to the fresh garrison, split in proportion to what each tile is
 * already worth — so the pool keeps the plus-shape's own balance instead of turning a guard
 * into the strongest tile on the board. Rounding down leaves a remainder, which goes to the
 * queen; she is the tile that has to be beaten.
 */
function spendBanked(state: GameState): void {
  const pool = state.hive.banked;
  state.hive.banked = 0;
  if (pool <= 0) return;

  const cells = hiveCells(state);
  const total = cells.reduce((n, t) => n + t.soldiers, 0);
  if (total <= 0) return;

  let handed = 0;
  for (const t of cells) {
    if (t.terrain === "hiveQ") continue;
    const share = Math.floor(pool * (t.soldiers / total));
    t.soldiers += share;
    handed += share;
  }
  const queen = cells.find((t) => t.terrain === "hiveQ");
  if (queen) queen.soldiers += pool - handed;
}
