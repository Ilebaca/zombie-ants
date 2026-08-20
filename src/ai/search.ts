import {
  allTiles, distance, isHiveTerrain, neighbours, nestTile, otherPlayer,
  attackMultiplier, defenceMultiplier, fight, flatDefence,
  moveOrAttack,
  snapshot, restore,
  abilityOf, abilityReady, activateAbility, frontline, onEnemyHalf,
} from "../engine";
import type {
  ActionContext, Coord, EngineEvent, GameState, Player, PlayerMods, Tile,
} from "../engine";
import { FULL, NAIVE, WIN, evaluate as evaluateWith } from "./evaluate";
import type { EvalWeights } from "./evaluate";
import { applyAction, generate, isCapture } from "./moves";
import type { Action, Candidate, GenOptions } from "./moves";

export { evaluate as evaluateBoard } from "./evaluate";
export type { Action, Candidate } from "./moves";

/**
 * LOOKAHEAD AI
 *
 * Because combat is fully deterministic, simulating the future is exact — the AI can play
 * a move, see the opponent's best reply, and undo it perfectly. The engine returns events
 * and never animates, so search needs no "am I simulating?" flag (CLAUDE.md §3).
 *
 * The three difficulties are three DIFFERENT PLAYERS, not one player at three depths:
 * they see different amounts of the board, know different actions, and search to different
 * horizons. That is what makes them tell apart across a match rather than on a spreadsheet.
 */

export type Difficulty = "easy" | "normal" | "hard";

export interface Profile {
  /** Plies of full-width search. One ply = one action by one side. */
  depth: number;
  /** Candidates expanded per position. */
  branching: number;
  /** Keep searching captures past the horizon so an exchange is never judged half-done. */
  quiescence: boolean;
  gen: Omit<GenOptions, "limit">;
  weights: EvalWeights;
  /** Compare casting against not casting instead of using the cheap trigger. */
  searchAbility: boolean;

  /** Hard stop so a big board can never freeze the turn. */
  nodeBudget: number;
  /** Wall-clock stop, so a slow phone degrades by thinking less rather than by stuttering. */
  timeBudgetMs: number;
}

export const PROFILES: Record<Difficulty, Profile> = {
  /**
   * A beginner. One ply, no idea what is hanging, and it never masses an army — it cannot
   * reinforce, so with a floor of one soldier per tile it fights every battle with whatever
   * one tile happens to hold. It takes what is in front of it and loses it again.
   */
  easy: {
    depth: 1,
    branching: 4,
    quiescence: false,
    gen: { travel: false, rally: false, reinforce: false, veinGuard: false },
    weights: NAIVE,
    searchAbility: false,
    nodeBudget: 400,
    timeBudgetMs: 30,
  },
  /**
   * A solid club player. Real search, sees hanging tiles, builds a fist and sends it
   * somewhere — but with a three-ply horizon it can still be out-planned.
   */
  normal: {
    depth: 3,
    branching: 8,
    quiescence: true,
    gen: { travel: true, rally: false, reinforce: true, veinGuard: true },
    weights: FULL,
    searchAbility: false,
    nodeBudget: 6000,
    timeBudgetMs: 120,
  },
  /**
   * Meant to be beaten only by playing well. Iterative deepening to eight plies with
   * alpha-beta and killer-move ordering, quiescence over every exchange, the whole action
   * set including rally, and its ability is chosen by search rather than a rule of thumb.
   */
  hard: {
    depth: 8,
    branching: 10,
    quiescence: true,
    gen: { travel: true, rally: true, reinforce: true, veinGuard: true },
    weights: FULL,
    searchAbility: true,
    nodeBudget: 30000,
    timeBudgetMs: 320,
  },
};

/** Kept for the tests and callers that still speak in depths. */
export const DEPTH: Record<Difficulty, number> = {
  easy: PROFILES.easy.depth, normal: PROFILES.normal.depth, hard: PROFILES.hard.depth,
};

/* ------------------------------------------------------------------ EVALUATION */

/** Score the board from the AI's perspective, with the full weight set. */
export function evaluate(
  state: GameState, me: Player, mods: Record<Player, PlayerMods>,
): number {
  return evaluateWith(state, me, mods, FULL);
}

/* -------------------------------------------------------------------- SEARCH */

interface Ctx {
  ctx: ActionContext;
  me: Player;
  profile: Profile;
  nodes: number;
  deadline: number;
  /** Next node count at which the clock is worth reading. */
  checkAt: number;
  /** Latched once the budget is gone, so every frame of the search unwinds immediately. */
  out: boolean;
  /** One killer action per ply: a refutation that cut off a sibling is likely to again. */
  killers: Array<Action | null>;
}

/**
 * Out of budget?
 *
 * The node count keeps the search honest on a fast machine and the clock keeps it honest
 * on a slow one — a phone that manages a third of a laptop's nodes per second thinks less
 * rather than stuttering. The clock is read once every 512 nodes, on a counter rather than
 * a bitmask, because a bitmask test only lands on the sample point by luck and the search
 * would sail past its deadline. Once the budget is gone the flag latches, so the whole
 * tree unwinds instead of re-checking at every frame.
 */
function spent(s: Ctx): boolean {
  if (s.out) return true;
  if (s.nodes >= s.profile.nodeBudget) { s.out = true; return true; }
  if (s.nodes < s.checkAt) return false;
  s.checkAt = s.nodes + 512;
  if (Date.now() > s.deadline) { s.out = true; return true; }
  return false;
}

const sameAction = (a: Action, b: Action): boolean =>
  a.kind === b.kind && a.to.c === b.to.c && a.to.r === b.to.r
  && (a.kind === "rally" || (a as { from: Coord }).from.c === (b as { from: Coord }).from.c
    && (a as { from: Coord }).from.r === (b as { from: Coord }).from.r);

/**
 * Candidates for a node INSIDE the tree.
 *
 * Travel and rally are deliberately root-only. Both are expensive to enumerate — a travel
 * target list is a breadth-first flood from every tile that can act — and generating them
 * at every node cost more than a hundredfold in time for a fraction of a ply of insight.
 * The AI still plays them; it just does not model the opponent playing them deep in a line.
 */
function gen(state: GameState, p: Player, s: Ctx, limit = s.profile.branching): Candidate[] {
  return generate(state, p, s.ctx, {
    limit, travel: false, rally: false, veinGuard: false,
    reinforce: s.profile.gen.reinforce,
  });
}

/** Candidates for the move the AI is actually about to play: the full repertoire. */
function genRoot(state: GameState, p: Player, s: Ctx): Candidate[] {
  return generate(state, p, s.ctx, { ...s.profile.gen, limit: s.profile.branching });
}

/** Play an action on the real state with `turn` to move, then undo it exactly. */
function withAction<T>(
  state: GameState, turn: Player, a: Action, s: Ctx, body: () => T,
): T {
  const snap = snapshot(state);
  const prev = state.current;
  state.current = turn;
  applyAction(state, a, s.ctx);
  const out = body();
  state.current = prev;
  restore(state, snap);
  return out;
}

/**
 * Negamax with alpha-beta.
 *
 * Alpha-beta is not a nicety here: without it, eight plies at a branching factor of twelve
 * is 400 million positions. With good ordering it is closer to the square root of that, and
 * the ordering is why the generator bothers to score its candidates at all.
 */
function negamax(
  state: GameState, turn: Player, depth: number, alpha: number, beta: number, s: Ctx,
): number {
  const sign = turn === s.me ? 1 : -1;
  if (state.over) return sign * evaluateWith(state, s.me, s.ctx.mods, s.profile.weights);
  if (spent(s)) return sign * evaluateWith(state, s.me, s.ctx.mods, s.profile.weights);
  if (depth <= 0) {
    return s.profile.quiescence
      ? quiesce(state, turn, alpha, beta, s, 4)
      : sign * evaluateWith(state, s.me, s.ctx.mods, s.profile.weights);
  }

  const moves = gen(state, turn, s);
  if (!moves.length) return sign * evaluateWith(state, s.me, s.ctx.mods, s.profile.weights);

  // Try the killer for this ply first: it refuted a sibling, so it often refutes this one
  // too, and a cutoff on the first child is the whole benefit of alpha-beta.
  const killer = s.killers[depth];
  if (killer) {
    const i = moves.findIndex((m) => sameAction(m.action, killer));
    if (i > 0) moves.unshift(...moves.splice(i, 1));
  }

  let best = -Infinity;
  for (const m of moves) {
    s.nodes++;
    const value = withAction(state, turn, m.action, s, () =>
      -negamax(state, otherPlayer(turn), depth - 1, -beta, -alpha, s));
    if (value > best) best = value;
    if (best > alpha) alpha = best;
    if (alpha >= beta) { s.killers[depth] = m.action; break; }
  }
  return best;
}

/**
 * Quiescence: past the horizon, keep following CAPTURES only until the position is quiet.
 *
 * Without this the search is at the mercy of where it happens to stop. Take a tile on the
 * last ply and the position looks a tile better; the recapture that arrives one ply later
 * is invisible. In a game this capture-dense that single blind spot is enough to make a
 * deeper search play WORSE than a shallow one, which is exactly what was happening.
 */
function quiesce(
  state: GameState, turn: Player, alpha: number, beta: number, s: Ctx, depth: number,
): number {
  const sign = turn === s.me ? 1 : -1;
  const stand = sign * evaluateWith(state, s.me, s.ctx.mods, s.profile.weights);
  if (state.over || depth <= 0 || spent(s)) return stand;

  // Standing pat: the side to move is never forced to capture, so a position that is
  // already good enough cannot be dragged down by its own worst available exchange.
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;

  const captures = gen(state, turn, s, 6).filter((m) => isCapture(state, m.action, turn));
  for (const m of captures) {
    s.nodes++;
    const value = withAction(state, turn, m.action, s, () =>
      -quiesce(state, otherPlayer(turn), -beta, -alpha, s, depth - 1));
    if (value >= beta) return beta;
    if (value > alpha) alpha = value;
  }
  return alpha;
}

export interface Decision { move: Candidate | null; value: number; depth: number; nodes: number }

/**
 * Choose the AI's action.
 *
 * Hard deepens iteratively: search one ply, then two, and so on, keeping the best line
 * from the previous pass at the front of the list. That costs almost nothing (the last
 * ply dominates the count) and it buys two things — far better move ordering, and a
 * complete answer at every depth, so the node budget can stop the search anywhere without
 * leaving it half-formed.
 */
export function chooseMove(
  state: GameState, me: Player, difficulty: Difficulty, ctx: ActionContext,
): Decision {
  const profile = PROFILES[difficulty];
  const s: Ctx = {
    ctx, me, profile, nodes: 0, killers: [],
    deadline: Date.now() + profile.timeBudgetMs, checkAt: 512, out: false,
  };
  let candidates = genRoot(state, me, s);
  if (!candidates.length) {
    return { move: null, value: evaluateWith(state, me, ctx.mods, profile.weights), depth: 0, nodes: 0 };
  }

  // Easy plays the top heuristic move without looking ahead at all.
  if (profile.depth <= 1) {
    return { move: candidates[0] ?? null, value: candidates[0]?.score ?? 0, depth: 1, nodes: 0 };
  }

  const opp = otherPlayer(me);
  let best: Candidate | null = candidates[0] ?? null;
  let bestValue = -Infinity;
  let reached = 0;

  for (let depth = 2; depth <= profile.depth; depth++) {
    let localBest: Candidate | null = null;
    let localValue = -Infinity;
    let alpha = -Infinity;

    for (const m of candidates) {
      s.nodes++;
      const value = withAction(state, me, m.action, s, () =>
        state.over
          ? evaluateWith(state, me, ctx.mods, profile.weights)
          : -negamax(state, opp, depth - 1, -Infinity, -alpha, s));
      if (value > localValue) { localValue = value; localBest = m; }
      if (value > alpha) alpha = value;
      if (spent(s)) break;
    }

    if (localBest) {
      best = localBest; bestValue = localValue; reached = depth;
      // Carry the best line to the front of the next, deeper pass.
      candidates = [localBest, ...candidates.filter((c) => c !== localBest)];
    }
    // A forced win or loss is not going to change by looking further.
    if (Math.abs(bestValue) > WIN / 2) break;
    if (spent(s)) break;
  }

  return { move: best, value: bestValue, depth: reached, nodes: s.nodes };
}

/** Back-compat shim for callers that only want the ranked list. */
export function generateMoves(
  state: GameState, p: Player, ctx: ActionContext, limit = 8,
): Array<{ from: Coord; to: Coord; score: number }> {
  return generate(state, p, ctx, {
    limit, travel: false, rally: false, reinforce: false, veinGuard: false,
  })
    .filter((c): c is Candidate & { action: { kind: "move"; from: Coord; to: Coord } } =>
      c.action.kind === "move")
    .map((c) => ({ from: c.action.from, to: c.action.to, score: c.score }));
}

/* ---------------------------------------------------------------------- TURN */

/**
 * Full AI turn: defensive reflexes first (they are cheap and must never be searched away),
 * then the ability, then the chosen action.
 */
export function aiTurn(
  state: GameState, me: Player, difficulty: Difficulty, ctx: ActionContext,
): EngineEvent[] {
  if (state.over) return [];
  const profile = PROFILES[difficulty];
  const opp = otherPlayer(me);
  const myNest = nestTile(state, me);
  const events: EngineEvent[] = [];

  // An ability is a free extra action, so fire it first and still take a move afterwards.
  // The AI runs on NEUTRAL_MODS — it never gets research scaling (CLAUDE.md §4.8).
  if (abilityReady(state, me) && shouldCast(state, me, ctx, profile)) {
    state.current = me;
    events.push(...activateAbility(state, me, ctx.mods[me]));
    if (state.over) return events;
  }

  // Reflex — the nest is life. Reinforce it before considering anything else. Easy does
  // not get this: walking into a lost queen is exactly the mistake it should be making.
  if (myNest && difficulty !== "easy") {
    const rescue = nestRescue(state, me, opp, myNest);
    if (rescue) {
      state.current = me;
      events.push(...moveOrAttack(state, rescue, { c: myNest.c, r: myNest.r }, ctx));
      return events;
    }
  }

  const decision = chooseMove(state, me, difficulty, ctx);
  if (!decision.move) return events;
  state.current = me;
  events.push(...applyAction(state, decision.move.action, ctx));
  return events;
}

/** The neighbour that should step into the nest, if the nest is in danger. */
function nestRescue(state: GameState, me: Player, opp: Player, nest: Tile): Coord | null {
  let threat = 0;
  for (const t of allTiles(state)) {
    if (t.owner === opp && distance(t, nest) <= 2) threat = Math.max(threat, t.soldiers);
  }
  if (threat === 0 || nest.soldiers >= threat + 2) return null;
  const feeder = neighbours(state, nest)
    .filter((n) => n.owner === me && n.soldiers >= 2)
    .sort((a, b) => b.soldiers - a.soldiers)[0];
  return feeder ? { c: feeder.c, r: feeder.r } : null;
}

/**
 * Cast or not.
 *
 * Easy and Normal use the cheap per-ability triggers ported from the legacy build. Hard
 * asks the search instead: it plays out the board with the cast and without it, and keeps
 * the cast only if the position it leaves is genuinely better — which is how it learns to
 * hold a cooldown for a turn rather than spending it on the first legal target.
 */
function shouldCast(
  state: GameState, me: Player, ctx: ActionContext, profile: Profile,
): boolean {
  if (!profile.searchAbility) return abilityWorthCasting(state, me, ctx);
  if (!abilityWorthCasting(state, me, ctx)) return false;

  const before = chooseMove(state, me, "normal", ctx).value;
  const snap = snapshot(state);
  const prev = state.current;
  state.current = me;
  const cast = activateAbility(state, me, ctx.mods[me]);
  // An ability that returned no events did not fire and must not spend its cooldown
  // (CLAUDE.md §5) — restoring puts the cooldown back too.
  const after = cast.length && !state.over
    ? chooseMove(state, me, "normal", ctx).value
    : (state.over ? WIN : -Infinity);
  state.current = prev;
  restore(state, snap);
  return after > before;
}

/**
 * The cheap per-ability triggers. Each has a specific condition rather than being searched,
 * because search would have to model multi-tile board mutation to see the value and would
 * spend most of its budget doing it.
 */
function abilityWorthCasting(state: GameState, me: Player, ctx: ActionContext): boolean {
  const opp = otherPlayer(me);
  const front = frontline(state, me);
  const oppTiles = allTiles(state).filter((t) => t.owner === opp).length;

  switch (abilityOf(state, me).kind) {
    case "fire": {
      let touching = 0, weak = 0;
      for (const t of front) {
        for (const n of neighbours(state, t)) {
          if (n.owner === opp) { touching++; if (n.soldiers <= 5) weak++; }
          if (isHiveTerrain(n)) touching++;
        }
      }
      return weak >= 1 || touching >= 2;
    }
    case "venom": return oppTiles >= 3;
    case "swarm": {
      let food = 0;
      for (const t of front) for (const n of neighbours(state, t)) if (n.owner === opp) food += n.soldiers;
      return food >= 20;
    }
    case "bud":
      return allTiles(state).some((t) => t.owner === me && t.soldiers >= 40
        && neighbours(state, t).some((n) => n.owner === null && n.terrain === "ground"));
    case "spread":
      return allTiles(state).some((t) => t.owner === me
        && neighbours(state, t).some((n) => n.owner === null && n.terrain === "ground" && onEnemyHalf(n.c, n.r, me)));
    case "fortify":
    case "leaf": {
      // Defensive: brace when the border is genuinely under pressure, or about to break.
      let pressure = 0;
      for (const t of front) {
        for (const n of neighbours(state, t)) {
          if (n.owner !== opp || n.soldiers <= 1) continue;
          pressure += n.soldiers;
          const res = fight(
            n.soldiers - 1, attackMultiplier(state, opp, ctx.mods[opp]),
            t.soldiers, defenceMultiplier(state, me, ctx.mods[me]), flatDefence(state, t, ctx.mods[me]),
          );
          if (res.winner === "atk") return true;      // a tile is about to fall — always cast
        }
      }
      return pressure >= 30;
    }
    case "flee": return front.length > 0 && oppTiles >= 2;
    case "tunnel": return true;                        // a beachhead is always worth digging
    default: return front.length > 0;
  }
}
