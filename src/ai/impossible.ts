/**
 * Bounded whole-turn planning for Impossible.
 *
 * A branch is a legal turn: optional ability, one action, optional ability, then
 * production/effects/cooldowns. Tunnelling consumes the action. Both players get
 * the same move repertoire in the tree; the live game is changed only on execution.
 */
import {
  abilityOf, abilityReady, abilitySpendsTurn, activateAbility, allTiles,
  attackMultiplier, blockedByEnemyLeaf, defenceMultiplier, distance, endTurn,
  flatDefence, incomeOf, isConnected, keepOn, nestTile, otherPlayer, restore,
  snapshot, tunnelTargets,
} from "../engine";
import type { ActionContext, Coord, EngineEvent, GameState, Move, Player } from "../engine";
import { FULL, WIN, evaluate } from "./evaluate";
import { applyAction, generate } from "./moves";
import type { Action } from "./moves";

interface AbilityChoice { target?: Coord }
export interface PlannedTurn {
  before?: AbilityChoice;
  action?: Action;
  after?: AbilityChoice;
}
export interface PlannerBudget {
  depth: number;
  branching: number;
  nodeBudget: number;
  timeBudgetMs: number;
}
interface RankedTurn { plan: PlannedTurn; score: number }
export interface TurnDecision {
  plan: PlannedTurn;
  value: number;
  depth: number;
  nodes: number;
}
interface Search {
  context: ActionContext;
  budget: PlannerBudget;
  nodes: number;
  deadline: number;
  stopped: boolean;
  table: Map<string, { depth: number; value: number; bound: "exact" | "lower" | "upper" }>;
}

export const IMPOSSIBLE_WEIGHTS = {
  ...FULL, incomeFloor: 1.5, resource: 24, hanging: 1.2,
  nestThreat: 8, nestPressure: 5, advance: 3, surge: 24,
};

/** Real upgraded income and nest safety remain valuable for the entire match. */
export function evaluateImpossible(state: GameState, me: Player, context: ActionContext): number {
  let score = evaluate(state, me, context.mods, IMPOSSIBLE_WEIGHTS);
  if (state.over || Math.abs(score) > WIN / 2) return score;
  const enemy = otherPlayer(me);
  score += 12 * (incomeOf(state, me, context.mods[me]) + context.mods[me].brood
    - incomeOf(state, enemy, context.mods[enemy]) - context.mods[enemy].brood);
  const tiles = allTiles(state);
  for (const owner of [me, enemy]) {
    const nest = nestTile(state, owner);
    if (!nest) continue;
    const raider = otherPlayer(owner);
    const attack = attackMultiplier(state, raider, context.mods[raider]);
    const defence = nest.soldiers * defenceMultiplier(state, owner, context.mods[owner])
      + flatDefence(state, nest, context.mods[owner]);
    let danger = 0;
    for (const tile of tiles) {
      if (tile.owner !== raider || !isConnected(state, tile)) continue;
      const range = distance(tile, nest);
      if (range > 3 || blockedByEnemyLeaf(state, nest, raider)) continue;
      const power = Math.max(0, tile.soldiers - keepOn(tile)) * attack;
      danger = Math.max(danger, Math.max(0, power - defence) / Math.max(1, range));
    }
    score += (owner === me ? -1 : 1) * danger * 18;
  }
  // Race for all seams, rather than treating only currently owned resources as valuable.
  for (const resource of tiles) {
    if (resource.terrain !== "resource" || resource.owner) continue;
    let mine = 20, theirs = 20;
    for (const tile of tiles) {
      if (!tile.owner || !isConnected(state, tile) || tile.soldiers <= keepOn(tile)) continue;
      const reach = distance(tile, resource);
      if (tile.owner === me) mine = Math.min(mine, reach);
      else theirs = Math.min(theirs, reach);
    }
    score += (theirs - mine) * 2;
  }
  return score;
}

/** Compact exact keys: include fractional growth and effect clocks, not object identity. */
function positionKey(state: GameState): string {
  return JSON.stringify([
    state.current, state.turn, state.rng, state.over, state.winner, state.hive,
    state.effects, state.cooldown, state.shield, state.cloak, state.boon,
    state.grid.map((row) => row.map((tile) => [
      tile.owner, tile.struct, tile.soldiers, tile.terrain, tile.guard,
      tile.tunnel, tile.hidden, tile.prodAcc,
    ])),
  ]);
}

function exhausted(search: Search): boolean {
  if (search.stopped) return true;
  if (search.nodes >= search.budget.nodeBudget
      || Date.now() >= search.deadline) search.stopped = true;
  return search.stopped;
}

/** Tunnel locations are strategic choices too, rather than always the nearest nest tile. */
function abilities(state: GameState, player: Player, root: boolean): AbilityChoice[] {
  if (!abilityReady(state, player)) return [];
  if (abilityOf(state, player).kind !== "tunnel") return [{}];
  const foe = nestTile(state, otherPlayer(player));
  const targets = tunnelTargets(state, player);
  const rank = (at: Coord): number => {
    const tile = state.grid[at.r]?.[at.c];
    let score = tile?.terrain === "resource" ? 45 : 0;
    if (foe) score -= distance(at, foe) * 3;
    // A five-worker tunnel should not be donated to an adjacent enemy stack.
    for (const other of allTiles(state)) {
      if (other.owner !== otherPlayer(player) || distance(at, other) !== 1) continue;
      score -= Math.max(0, other.soldiers - keepOn(other)) * 3;
    }
    return score;
  };
  return targets.sort((a, b) => rank(b) - rank(a)).slice(0, root ? 5 : 2)
    .map((target) => ({ target }));
}

const asMove = (action: Action): Move => action.kind === "rally"
  ? { do: "rally", to: action.to }
  : { do: action.kind, from: action.from, to: action.to };

/** Execute only the selected turn. The caller still owns handing over the turn. */
export function executePlannedTurn(
  state: GameState, player: Player, plan: PlannedTurn, context: ActionContext, into?: Move[],
): EngineEvent[] {
  const events: EngineEvent[] = [];
  state.current = player;
  const cast = (choice: AbilityChoice): boolean => {
    const result = activateAbility(state, player, context.mods[player], choice);
    if (!result.length) return false;
    events.push(...result);
    into?.push({ do: "ability", ...(choice.target ? { at: choice.target } : {}) });
    return true;
  };
  if (plan.before) {
    if (!cast(plan.before)) return events;
    if (state.over || abilitySpendsTurn(abilityOf(state, player).kind)) return events;
  }
  if (plan.action) {
    const result = applyAction(state, plan.action, context);
    if (!result.length) return events;
    events.push(...result);
    into?.push(asMove(plan.action));
  }
  if (!state.over && plan.after) cast(plan.after);
  return events;
}

/** Evaluate a complete turn on the real engine, restoring all data including RNG. */
function simulate<T>(
  state: GameState, player: Player, plan: PlannedTurn, context: ActionContext,
  body: (events: EngineEvent[]) => T,
): T {
  const saved = snapshot(state);
  try {
    const events = executePlannedTurn(state, player, plan, context);
    if (!state.over) endTurn(state, context.mods);
    return body(events);
  } finally {
    restore(state, saved);
  }
}

function rankedTurns(state: GameState, player: Player, search: Search, root: boolean, actionsOnly = false): RankedTurn[] {
  const choices: RankedTurn[] = [];
  const seen = new Set<string>();
  const positions = new Set<string>();
  const consider = (plan: PlannedTurn): void => {
    if (exhausted(search)) return;
    const key = JSON.stringify(plan);
    if (seen.has(key)) return;
    seen.add(key);
    search.nodes++;
    const score = simulate(state, player, plan, search.context, (events) => {
      if ((plan.before || plan.after) && !events.some((event) => event.type === "abilityCast")) return -Infinity;
      const position = positionKey(state);
      if (positions.has(position)) return -Infinity;
      positions.add(position);
      return evaluateImpossible(state, player, search.context);
    });
    if (Number.isFinite(score)) choices.push({ plan, score });
  };
  const actions = (): Action[] => generate(state, player, search.context, {
    limit: root ? 32 : 14, complete: true,
    travel: true, rally: true, reinforce: true, veinGuard: root,
  }).map((candidate) => candidate.action);
  const plain = actions();
  // Winning attacks and urgent reinforcements are ordered first by the generator.
  for (const action of plain) consider({ action });
  consider({}); // Waiting for production can be better than a losing attack.
  const available = actionsOnly ? [] : abilities(state, player, root);
  for (const before of available) {
    if (exhausted(search)) break;
    const saved = snapshot(state);
    try {
      state.current = player;
      const cast = activateAbility(state, player, search.context.mods[player], before);
      if (!cast.length) continue;
      const consumes = abilitySpendsTurn(abilityOf(state, player).kind);
      const afterCast = !state.over && !consumes ? actions() : [];
      restore(state, saved);
      consider({ before });
      for (const action of afterCast) consider({ before, action });
    } finally {
      restore(state, saved);
    }
  }
  if (!actionsOnly && abilityReady(state, player) && !abilitySpendsTurn(abilityOf(state, player).kind)) {
    for (const action of plain.slice(0, root ? 16 : 5)) {
      if (exhausted(search)) break;
      // Non-targeted free abilities are legal either before or after the action.
      consider({ action, after: {} });
    }
  }
  choices.sort((a, b) => b.score - a.score);
  return choices.slice(0, root ? search.budget.branching * 2 : search.budget.branching);
}

function negamax(
  state: GameState, player: Player, depth: number, alpha: number, beta: number, search: Search,
): number {
  if (state.over || depth <= 0 || exhausted(search))
    return evaluateImpossible(state, player, search.context);
  const key = positionKey(state);
  const cached = search.table.get(key);
  const originalAlpha = alpha;
  if (cached && cached.depth >= depth) {
    if (cached.bound === "exact") return cached.value;
    if (cached.bound === "lower") alpha = Math.max(alpha, cached.value);
    else beta = Math.min(beta, cached.value);
    if (alpha >= beta) return cached.value;
  }
  const options = rankedTurns(state, player, search, false);
  if (!options.length) return evaluateImpossible(state, player, search.context);
  let best = -Infinity;
  for (const candidate of options) {
    if (exhausted(search)) break;
    const value = simulate(state, player, candidate.plan, search.context,
      () => -negamax(state, otherPlayer(player), depth - 1, -beta, -alpha, search));
    if (value > best) best = value;
    alpha = Math.max(alpha, value);
    if (alpha >= beta) break;
  }
  if (Number.isFinite(best) && !exhausted(search) && search.table.size < 512) {
    search.table.set(key, {
      depth, value: best,
      bound: best <= originalAlpha ? "upper" : best >= beta ? "lower" : "exact",
    });
  }
  return Number.isFinite(best) ? best : evaluateImpossible(state, player, search.context);
}

export function planImpossibleTurn(
  state: GameState, player: Player, context: ActionContext, budget: PlannerBudget,
  actionsOnly = false,
): TurnDecision {
  const search: Search = {
    context, budget, nodes: 0, deadline: Date.now() + budget.timeBudgetMs, stopped: false, table: new Map(),
  };
  const original = snapshot(state);
  try {
    state.current = player;
    let options = rankedTurns(state, player, search, true, actionsOnly);
    if (actionsOnly) options = options.filter((option) => !option.plan.before && !option.plan.after);
    let best = options[0] ?? { plan: {}, score: evaluateImpossible(state, player, context) };
    let reached = 1;
    for (let depth = 2; depth <= budget.depth && !exhausted(search); depth++) {
      let complete = true;
      let winner = best;
      let score = -Infinity;
      let alpha = -Infinity;
      for (const option of options) {
        const value = simulate(state, player, option.plan, context,
          () => -negamax(state, otherPlayer(player), depth - 1, -Infinity, -alpha, search));
        if (exhausted(search)) { complete = false; break; }
        if (value > score) { score = value; winner = { plan: option.plan, score: value }; }
        alpha = Math.max(alpha, value);
      }
      if (!complete) break;
      best = winner;
      reached = depth;
      options = [best, ...options.filter((option) => option.plan !== best.plan)];
      if (best.score > WIN / 2) break;
    }
    return { plan: best.plan, value: best.score, depth: reached, nodes: search.nodes };
  } finally {
    restore(state, original);
  }
}
