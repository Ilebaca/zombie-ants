import {
  allTiles, armyOf, distance, isHiveTerrain, neighbours, nestTile, otherPlayer,
  attackMultiplier, defenceMultiplier, fight, flatDefence, guardDefence,
  isConnected, moveOrAttack, keepOn, blockedByEnemyLeaf,
  snapshot, restore, PROD,
} from "../engine";
import type {
  ActionContext, Coord, GameState, Player, PlayerMods, Tile,
} from "../engine";

/**
 * LOOKAHEAD AI
 *
 * Because combat is fully deterministic, simulating the future is exact — the AI can play
 * a move, see the opponent's best reply, and undo it perfectly. Difficulty is search depth.
 *
 * The engine returns events and never animates, so search needs no "am I simulating?" flag.
 */

export type Difficulty = "easy" | "normal" | "hard";

export const DEPTH: Record<Difficulty, number> = { easy: 1, normal: 2, hard: 3 };

export interface Candidate { from: Coord; to: Coord; score: number }

/** How many candidates to expand per side per ply. Keeps the tree fast. */
const BRANCHING = 6;

/**
 * Score the board from the AI's perspective. Positive = good for the AI.
 * Weighs territory, army, income, resources, nest safety and forward pressure.
 */
export function evaluate(state: GameState, me: Player, mods: Record<Player, PlayerMods>): number {
  const opp = otherPlayer(me);

  if (state.over) return state.winner === me ? 1e7 : -1e7;
  const myNest = nestTile(state, me);
  const oppNest = nestTile(state, opp);
  if (!myNest) return -1e7;
  if (!oppNest) return 1e7;

  let myTiles = 0, oppTiles = 0, myIncome = 0, oppIncome = 0, myRes = 0, oppRes = 0;
  for (const t of allTiles(state)) {
    if (!t.owner || !isConnected(state, t)) continue;
    const producing = t.struct === "stable" || t.struct === "nest";
    const output = t.terrain === "resource" ? PROD.resourceStable : PROD.stable;
    if (t.owner === me) {
      myTiles++; if (t.terrain === "resource") myRes++; if (producing) myIncome += output;
    } else if (t.owner === opp) {
      oppTiles++; if (t.terrain === "resource") oppRes++; if (producing) oppIncome += output;
    }
  }

  let score = (myTiles - oppTiles) * 10
    + (armyOf(state, me) - armyOf(state, opp)) * 1.2
    + (myIncome - oppIncome) * 7
    + (myRes - oppRes) * 10;

  // Nest safety dominates: losing the queen ends the game outright.
  const threat = Math.max(0, ...neighbours(state, myNest).filter((n) => n.owner === opp).map((n) => n.soldiers));
  const pressure = Math.max(0, ...neighbours(state, oppNest).filter((n) => n.owner === me).map((n) => n.soldiers));
  score += pressure * 3 - threat * 4;
  if (myNest.soldiers < threat) score -= 220;

  // Encourage pushing the army toward the enemy queen rather than idling at home.
  let nearest = 99;
  for (const t of allTiles(state)) {
    if (t.owner === me && t.soldiers >= 3) nearest = Math.min(nearest, distance(t, oppNest));
  }
  score -= nearest * 1.5;
  return score;
}

/** Generate and rank the plausible moves for `p`. Symmetric — used for both sides. */
export function generateMoves(
  state: GameState, p: Player, ctx: ActionContext, limit = BRANCHING,
): Candidate[] {
  const opp = otherPlayer(p);
  const oppNest = nestTile(state, opp);
  const out: Candidate[] = [];

  for (const src of allTiles(state)) {
    if (src.owner !== p || !isConnected(state, src)) continue;
    const commit = src.soldiers - keepOn(src);
    if (commit < 1) continue;
    const srcDist = oppNest ? distance(src, oppNest) : 0;

    for (const n of neighbours(state, src)) {
      if (n.owner === p || n.terrain === "blocked" || blockedByEnemyLeaf(state, n, p)) continue;
      // A cloaked enemy tile looks empty — the AI must not cheat by seeing through it.
      const apparentOwner = n.owner === opp && n.hidden ? null : n.owner;
      const forward = oppNest ? Math.max(0, srcDist - distance(n, oppNest)) : 0;
      let score = -1;

      if (apparentOwner === opp && n.struct === "vein") {
        // Enemy trails are free to take and collapse everything downstream.
        score = 42 + forward * 3;
      } else if (apparentOwner === opp) {
        const res = fight(commit, attackMultiplier(state, p, ctx.mods[p]),
          n.soldiers, defenceMultiplier(state, opp, ctx.mods[opp]), flatDefence(state, n, ctx.mods[opp]));
        if (res.winner === "atk") {
          score = 72 + (n.struct === "nest" ? 99999 : 0) + (n.struct === "stable" ? 20 : 6)
            + (n.terrain === "resource" ? 30 : 0) + forward * 6;
        }
      } else if (!apparentOwner && n.guard > 0 && !isHiveTerrain(n)) {
        const res = fight(commit, attackMultiplier(state, p, ctx.mods[p]), n.guard, 1.0, guardDefence());
        // A defended resource pays its cost back in about two turns.
        if (res.winner === "atk") score = (n.terrain === "resource" ? 55 : 8) + forward * 5;
      } else if (!apparentOwner && !isHiveTerrain(n)) {
        score = (n.terrain === "resource" ? 48 : 11) + forward * 6;
      } else if (isHiveTerrain(n)) {
        const res = fight(commit, attackMultiplier(state, p, ctx.mods[p]), n.soldiers, 1, 0);
        if (res.winner === "atk") score = n.terrain === "hiveQ" ? 220 : 90;
      }

      if (score > 0) out.push({ from: { c: src.c, r: src.r }, to: { c: n.c, r: n.r }, score });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/** Negamax: value of the position for the side to move. */
function negamax(
  state: GameState, turn: Player, depth: number,
  me: Player, ctx: ActionContext,
): number {
  const sign = turn === me ? 1 : -1;
  if (state.over || depth <= 0) return sign * evaluate(state, me, ctx.mods);

  const moves = generateMoves(state, turn, ctx);
  if (!moves.length) return sign * evaluate(state, me, ctx.mods);

  let best = -Infinity;
  for (const m of moves) {
    const snap = snapshot(state);
    const prevCurrent = state.current;
    state.current = turn;
    moveOrAttack(state, m.from, m.to, ctx);
    const value = -negamax(state, otherPlayer(turn), depth - 1, me, ctx);
    state.current = prevCurrent;
    restore(state, snap);
    if (value > best) best = value;
  }
  return best;
}

export interface Decision { move: Candidate | null; value: number }

/** Choose the AI's move by searching each candidate to the given depth. */
export function chooseMove(
  state: GameState, me: Player, difficulty: Difficulty, ctx: ActionContext,
): Decision {
  const depth = DEPTH[difficulty];
  const candidates = generateMoves(state, me, ctx);
  if (!candidates.length) return { move: null, value: evaluate(state, me, ctx.mods) };

  // Easy plays the top heuristic move without looking ahead.
  if (depth <= 1) return { move: candidates[0] ?? null, value: candidates[0]?.score ?? 0 };

  let best: Candidate | null = null;
  let bestValue = -Infinity;
  const opp = otherPlayer(me);

  for (const m of candidates) {
    const snap = snapshot(state);
    const prevCurrent = state.current;
    state.current = me;
    moveOrAttack(state, m.from, m.to, ctx);
    const value = state.over ? evaluate(state, me, ctx.mods) : -negamax(state, opp, depth - 1, me, ctx);
    state.current = prevCurrent;
    restore(state, snap);
    if (value > bestValue) { bestValue = value; best = m; }
  }
  return { move: best, value: bestValue };
}

/**
 * Full AI turn: defensive reflexes first (they are cheap and must never be searched away),
 * then the lookahead choice.
 */
export function aiTurn(
  state: GameState, me: Player, difficulty: Difficulty, ctx: ActionContext,
): boolean {
  if (state.over) return false;
  const opp = otherPlayer(me);
  const myNest = nestTile(state, me);

  // Reflex 1 — the nest is life. Reinforce it before considering offence.
  if (myNest) {
    let threat = 0;
    for (const t of allTiles(state)) {
      if (t.owner === opp && distance(t, myNest) <= 2) threat = Math.max(threat, t.soldiers);
    }
    if (threat > 0 && myNest.soldiers < threat + 2) {
      const feeder = neighbours(state, myNest)
        .filter((n) => n.owner === me && n.soldiers >= 2)
        .sort((a, b) => b.soldiers - a.soldiers)[0];
      if (feeder) {
        state.current = me;
        moveOrAttack(state, { c: feeder.c, r: feeder.r }, { c: myNest.c, r: myNest.r }, ctx);
        return true;
      }
    }
  }

  // Reflex 2 — garrison a vein whose loss would cut the colony in half.
  for (const v of allTiles(state)) {
    if (v.owner !== me || v.struct !== "vein") continue;
    if (!neighbours(state, v).some((n) => n.owner === opp && n.soldiers > 1)) continue;
    if (!isCriticalVein(state, v, me)) continue;
    const feeder = neighbours(state, v)
      .filter((n) => n.owner === me && n.soldiers >= 2)
      .sort((a, b) => b.soldiers - a.soldiers)[0];
    if (feeder) {
      state.current = me;
      moveOrAttack(state, { c: feeder.c, r: feeder.r }, { c: v.c, r: v.r }, ctx);
      return true;
    }
  }

  const decision = chooseMove(state, me, difficulty, ctx);
  if (!decision.move) return false;
  state.current = me;
  moveOrAttack(state, decision.move.from, decision.move.to, ctx);
  return true;
}

/** Would losing this vein disconnect more than just the vein itself? */
function isCriticalVein(state: GameState, v: Tile, owner: Player): boolean {
  const before = state.conn[owner].size;
  const saved = v.owner;
  v.owner = null;
  const after = countConnected(state, owner);
  v.owner = saved;
  return before - after > 1;
}

function countConnected(state: GameState, p: Player): number {
  const nest = nestTile(state, p);
  if (!nest) return 0;
  const seen = new Set<string>([`${nest.c},${nest.r}`]);
  const stack: Tile[] = [nest];
  for (const t of allTiles(state)) {
    if (t.owner === p && t.tunnel) { const k = `${t.c},${t.r}`; if (!seen.has(k)) { seen.add(k); stack.push(t); } }
  }
  while (stack.length) {
    const t = stack.pop() as Tile;
    for (const n of neighbours(state, t)) {
      if (n.owner !== p) continue;
      const k = `${n.c},${n.r}`;
      if (!seen.has(k)) { seen.add(k); stack.push(n); }
    }
  }
  return seen.size;
}
