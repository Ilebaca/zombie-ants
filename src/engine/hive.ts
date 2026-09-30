import {
  HIVE_COOLDOWN, HIVE_GROW_EVERY, HIVE_GUARD_BASE, HIVE_GUARD_STEP, HIVE_LEVEL_GROWTH,
  HIVE_QUEEN_BASE, HIVE_QUEEN_STEP,
} from "./config";
import { allTiles } from "./board";
import { defenceMultiplier, fight, flatDefence } from "./combat";
import { NEUTRAL_MODS } from "./types";
import type { Coord, EngineEvent, GameState, Player, PlayerMods, Tile } from "./types";

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
const surgeTurns = (state: GameState): number =>
  state.limits.buffTurns + (state.hive.level - 1);
const surgeCooldown = (state: GameState): number =>
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
export const hiveGarrison = (state: GameState, queen: boolean): number =>
  garrisonAt(state, queen, state.hive.level);

/**
 * The same sum at an arbitrary LEVEL, which the respawn needs: she has to know what she is
 * coming back with before she is back, so she can fight for ground a colony is standing on
 * with exactly the garrison that would otherwise have stood there.
 */
function garrisonAt(state: GameState, queen: boolean, level: number): number {
  const elapsed = state.hive.awokeTurn !== null ? Math.max(0, state.turn - state.hive.awokeTurn) : 0;
  const step = Math.floor(elapsed / HIVE_GROW_EVERY);
  const base = queen
    ? HIVE_QUEEN_BASE + step * HIVE_QUEEN_STEP
    : HIVE_GUARD_BASE + step * HIVE_GUARD_STEP;
  const grown = Math.pow(HIVE_LEVEL_GROWTH, level - 1);
  const dormant = state.hive.phase === "dormant" ? 1.5 : 1;
  return Math.round(base * grown * dormant);
}

/** Advance hive state at the start of `p`'s turn. */
export function hiveTick(
  state: GameState, p: Player, events: EngineEvent[] = [], mods?: Record<Player, PlayerMods>,
): EngineEvent[] {
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
    if (state.hive.coolLeft <= 0) respawnHive(state, events, mods);
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
 * The queen grows back — and she FIGHTS FOR ANY OF HER FIVE TILES SOMEBODY IS STANDING ON.
 *
 * Camping on the grave used to be answered by the camper simply being eaten: the garrison
 * was banked into the fresh queen and the tile handed over, whatever was standing there.
 * That is the one thing on this board that took a tile off a colony without a fight, and it
 * was reported as exactly that. Each contested tile is resolved through `fight()` now, with
 * the queen attacking with the garrison that would have stood there and the colony
 * defending as it defends anything — so a big enough camp HOLDS its ground, and one that
 * loses leaves the queen with only what she has left, the same arithmetic as any attack.
 *
 * HER OWN TILE IS THE ONE THAT DECIDES. A colony that survives on the middle tile has
 * DENIED the respawn: she stays dead and comes back at it next round rather than the board
 * spending the rest of the match with a queen who is awake and not there. Nothing else
 * moves in an attempt she loses — the four guards are hers to grow back around, and only
 * once she is standing on her own ground again.
 *
 * `awokeTurn` is deliberately NOT reset: the growth clock runs from the hive's first waking
 * for the whole match, which together with the level multiplier guarantees she returns
 * stronger than she fell (see `setHiveDefence`).
 */
export function respawnHive(
  state: GameState, events: EngineEvent[] = [], mods?: Record<Player, PlayerMods>,
): EngineEvent[] {
  const cells = hiveCells(state);
  const queen = cells.find((t) => t.terrain === "hiveQ");
  const level = state.hive.level + 1;
  // Worked out BEFORE anything is resolved: a tile she has to fight for attacks with
  // exactly what it would have been garrisoned with had nobody been standing there.
  const force = returningForce(state, cells, level);
  const stormed: Array<{ at: Coord; owner: Player; taken: boolean }> = [];
  const settle = (t: Tile): void => {
    const left = t.owner ? t.soldiers : (force.get(t) ?? 1);   // read before the tile clears
    t.owner = null;
    t.struct = null;
    t.guard = 0;
    t.tunnel = false;
    t.soldiers = Math.max(1, left);
  };

  // HER OWN TILE DECIDES. Lose it and nothing else moves: she is still dead, the pool she
  // was going to spend goes back, and she comes at it again next round.
  if (queen?.owner && !storm(state, queen, force.get(queen) ?? 1, mods, stormed)) {
    state.hive.banked = [...force.values()].reduce((n, v) => n + v, 0);
    state.hive.coolLeft = 1;
    events.push({ type: "hiveRespawn", level: state.hive.level, stormed });
    return events;
  }

  state.hive.level = level;
  state.hive.phase = "awake";
  state.hive.owner = null;
  state.hive.buffLeft = 0;
  state.hive.coolLeft = 0;

  if (queen) settle(queen);
  for (const t of cells) {
    if (t === queen) continue;
    // A camp that holds keeps the ground AND its structure — she simply did not retake it.
    if (t.owner && !storm(state, t, force.get(t) ?? 1, mods, stormed)) continue;
    settle(t);
  }
  events.push({ type: "hiveRespawn", level: state.hive.level, stormed });
  return events;
}

/**
 * One contested tile. True when the hive took it, and the tile is left holding whatever
 * survived either way — a defender that held keeps its ground and its structure.
 *
 * She attacks as the neutral hive does everything else: no species, no research, no traits.
 */
function storm(
  state: GameState, t: Tile, force: number, mods: Record<Player, PlayerMods> | undefined,
  stormed: Array<{ at: Coord; owner: Player; taken: boolean }>,
): boolean {
  const holder = t.owner as Player;
  const m = mods?.[holder] ?? NEUTRAL_MODS;
  const res = fight(force, 1, t.soldiers, defenceMultiplier(state, holder, m), flatDefence(state, t, m));
  t.soldiers = res.survivors;
  stormed.push({ at: { c: t.c, r: t.r }, owner: holder, taken: res.winner === "atk" });
  return res.winner === "atk";
}

/**
 * What each of the five tiles comes back with: its own strength at the level she is
 * returning at, plus its share of the pool banked when the surge lapsed — split in
 * proportion to what each tile is already worth, so the pool keeps the plus-shape's own
 * balance instead of turning a guard into the strongest tile on the board. Rounding down
 * leaves a remainder, which goes to the queen; she is the tile that has to be beaten.
 */
function returningForce(state: GameState, cells: readonly Tile[], level: number): Map<Tile, number> {
  const force = new Map<Tile, number>();
  for (const t of cells) force.set(t, Math.max(1, garrisonAt(state, t.terrain === "hiveQ", level)));

  const pool = state.hive.banked;
  state.hive.banked = 0;
  if (pool <= 0) return force;

  const total = [...force.values()].reduce((n, v) => n + v, 0);
  if (total <= 0) return force;

  let handed = 0;
  for (const t of cells) {
    if (t.terrain === "hiveQ") continue;
    const share = Math.floor(pool * ((force.get(t) ?? 0) / total));
    force.set(t, (force.get(t) ?? 0) + share);
    handed += share;
  }
  const queen = cells.find((t) => t.terrain === "hiveQ");
  if (queen) force.set(queen, (force.get(queen) ?? 0) + pool - handed);
  return force;
}

/** Take everything standing on the five tiles into the pool the next queen comes back with. */
function absorbGarrisons(state: GameState): void {
  for (const t of hiveCells(state)) {
    if (t.soldiers > 0) state.hive.banked += t.soldiers;
  }
}
