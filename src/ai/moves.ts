/**
 * ACTION GENERATION
 *
 * The old generator only produced adjacent attacks onto tiles the AI did not own. That
 * quietly removed three quarters of the game from it:
 *
 *  - it could never REINFORCE, so with a floor of one soldier per tile (CLAUDE.md §4.7)
 *    and one action per turn, its army was permanently scattered into single soldiers
 *    while a human massed a fist and walked through it;
 *  - it could never TRAVEL, so every long send down its own veins was invisible;
 *  - it could never RALLY, which gathers every spare soldier in the colony onto one tile
 *    and is the strongest single action in the game.
 *
 * Everything here is generated for either side, so the search models the opponent with
 * the same repertoire it uses itself.
 */
import {
  allTiles, attackMultiplier, blockedByEnemyLeaf, defenceMultiplier, distance, fight,
  flatDefence, guardDefence, isConnected, isHiveTerrain, keepOn, moveOrAttack, neighbours,
  nestTile, otherPlayer, rally, rallyTargets, travel, travelTargets,
} from "../engine";
import type { ActionContext, Coord, EngineEvent, GameState, Player, Tile } from "../engine";

export type Action =
  | { kind: "move"; from: Coord; to: Coord }
  | { kind: "travel"; from: Coord; to: Coord }
  | { kind: "rally"; to: Coord };

export interface Candidate { action: Action; score: number }

export interface GenOptions {
  /** How many candidates survive ordering. The search's real branching factor. */
  limit: number;
  travel: boolean;
  rally: boolean;
  /** Moves onto our own tiles. Off for Easy, which therefore never masses an army. */
  reinforce: boolean;
  /** Offer garrisoning a vein whose capture would sever the colony. Root only — the test
   *  re-floods the colony graph, which is far too expensive to run at every node. */
  veinGuard: boolean;
}

export const applyAction = (
  state: GameState, a: Action, ctx: ActionContext,
): EngineEvent[] => {
  switch (a.kind) {
    case "move": return moveOrAttack(state, a.from, a.to, ctx);
    case "travel": return travel(state, a.from, a.to);
    case "rally": return rally(state, a.to);
  }
};

/** Does this action take ground? Quiescence only follows the ones that do. */
export function isCapture(state: GameState, a: Action, p: Player): boolean {
  if (a.kind === "rally") return false;
  const dst = state.grid[a.to.r]?.[a.to.c];
  if (!dst) return false;
  return dst.owner !== p || dst.guard > 0;
}

export function generate(
  state: GameState, p: Player, ctx: ActionContext, opts: GenOptions,
): Candidate[] {
  const opp = otherPlayer(p);
  const oppNest = nestTile(state, opp);
  const myNest = nestTile(state, p);
  const atkMul = attackMultiplier(state, p, ctx.mods[p]);
  const defMul = defenceMultiplier(state, opp, ctx.mods[opp]);
  const out: Candidate[] = [];

  for (const src of allTiles(state)) {
    if (src.owner !== p || !isConnected(state, src)) continue;
    const commit = src.soldiers - keepOn(src);
    if (commit < 1) continue;
    const srcDist = oppNest ? distance(src, oppNest) : 0;

    for (const n of neighbours(state, src)) {
      if (n.terrain === "blocked" || blockedByEnemyLeaf(state, n, p)) continue;
      const forward = oppNest ? Math.max(0, srcDist - distance(n, oppNest)) : 0;
      const score = rateStep(state, src, n, commit, p, opp, atkMul, defMul, ctx, forward, opts, myNest);
      if (score > 0) out.push({ action: { kind: "move", from: xy(src), to: xy(n) }, score });
    }

    /**
     * A long send lays a vein trail behind it, so it takes ground AND extends supply, and
     * it does in one turn what walking would take four to do. With one action per turn
     * that tempo IS the game — an AI that steps one tile at a time is playing four times
     * slower than one that sends.
     *
     * So a travel is rated on where it lands plus how far it got there: the reach is the
     * point, not an incidental. It still sits below a capture, because taking ground off
     * the opponent beats claiming empty ground, and the search sorts out the rest.
     */
    if (opts.travel && commit >= 4) {
      for (const to of travelTargets(state, src)) {
        const gain = oppNest ? Math.max(0, srcDist - distance(to, oppNest)) : 0;
        const t = state.grid[to.r]?.[to.c];
        if (!t) continue;
        const reach = Math.abs(to.c - src.c) + Math.abs(to.r - src.r);
        const worth = (t.terrain === "resource" ? 44 : 12) + gain * 6 + reach * 7;
        out.push({ action: { kind: "travel", from: xy(src), to }, score: worth });
      }
    }
  }

  if (opts.rally) out.push(...rallyCandidates(state, p, opp, ctx, atkMul, defMul));
  if (opts.veinGuard) {
    out.push(...veinGuardCandidates(state, p, opp));
    out.push(...nestDefenceCandidates(state, p, opp, ctx));
  }

  out.sort((a, b) => b.score - a.score);
  return dedupe(out).slice(0, opts.limit);
}

const xy = (t: Tile): Coord => ({ c: t.c, r: t.r });

/**
 * One entry per distinct action, keeping the highest score.
 *
 * The same move can be proposed by more than one rater — a reinforcement onto the nest is
 * both an ordinary reinforcement and a nest defence — and a duplicate costs a slot in the
 * branching budget without adding a single new position to the tree. The list is already
 * sorted, so the first sighting is the best one.
 */
function dedupe(list: readonly Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const c of list) {
    const a = c.action;
    const k = a.kind === "rally"
      ? `r${a.to.c},${a.to.r}`
      : `${a.kind}${a.from.c},${a.from.r}>${a.to.c},${a.to.r}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * Bring troops home when the queen is in danger.
 *
 * Losing the nest loses the match outright (CLAUDE.md §4.6), so this is the one thing
 * worth spending any turn on. It used to be a reflex that ran ahead of the search and
 * marched exactly ONE neighbour in; as a candidate the search can weigh it, and it can
 * answer with a rally instead — which brings the whole colony home rather than a single
 * tile's spare troops. Defending with everything is only an option if "everything" is on
 * the list.
 */
function nestDefenceCandidates(
  state: GameState, p: Player, opp: Player, ctx: ActionContext,
): Candidate[] {
  const nest = nestTile(state, p);
  if (!nest) return [];

  const atkOpp = attackMultiplier(state, opp, ctx.mods[opp]);
  const defMe = defenceMultiplier(state, p, ctx.mods[p]);
  const flat = flatDefence(state, nest, ctx.mods[p]);

  // The worst single blow that can land on the queen next turn, from anything close
  // enough to reach her — adjacent now, or one step from being adjacent.
  //
  // Connectivity is the gate. A stack that has lost its chain back to its own nest cannot
  // act at all (`canActFrom`), so it is not a threat however large it is. Without this
  // check the AI garrisons against armies that are already dead on their feet.
  let worst = 0;
  for (const t of allTiles(state)) {
    if (t.owner !== opp || !isConnected(state, t)) continue;
    if (Math.abs(t.c - nest.c) + Math.abs(t.r - nest.r) > 2) continue;
    worst = Math.max(worst, t.soldiers - keepOn(t));
  }
  if (worst < 1) return [];
  if (worst * atkOpp <= nest.soldiers * defMe + flat) return [];   // she already holds

  const out: Candidate[] = [];
  for (const n of neighbours(state, nest)) {
    if (n.owner !== p) continue;
    const give = n.soldiers - keepOn(n);
    if (give < 1) continue;
    const holds = worst * atkOpp <= (nest.soldiers + give) * defMe + flat;
    out.push({
      action: { kind: "move", from: xy(n), to: xy(nest) },
      score: holds ? 900 : 120,        // a partial reinforcement is better than nothing
    });
  }
  return out;
}

/**
 * Garrison a vein whose loss would cut the colony in half.
 *
 * Veins have no defence at all (CLAUDE.md §4.3), so an enemy takes one for free and
 * everything downstream of it goes dark. Putting soldiers on it does not defend it — it
 * PROMOTES it to a stable (§4.5), which does.
 *
 * This used to be a reflex that ran ahead of the search and returned immediately, which
 * meant hard spent whole turns patching trails while the position it was patching them for
 * went to pieces. It is a candidate now, so the search decides whether it is worth a turn.
 */
function veinGuardCandidates(state: GameState, p: Player, opp: Player): Candidate[] {
  const out: Candidate[] = [];
  for (const v of allTiles(state)) {
    if (v.owner !== p || v.struct !== "vein") continue;
    if (!neighbours(state, v).some((n) => n.owner === opp && n.soldiers > 1)) continue;
    if (!severs(state, v, p)) continue;
    const feeder = neighbours(state, v)
      .filter((n) => n.owner === p && n.soldiers - keepOn(n) >= 1)
      .sort((a, b) => b.soldiers - a.soldiers)[0];
    if (feeder) out.push({ action: { kind: "move", from: xy(feeder), to: xy(v) }, score: 85 });
  }
  return out;
}

/** Would losing this tile disconnect more than just the tile itself? */
function severs(state: GameState, v: Tile, owner: Player): boolean {
  return tilesSevered(state, v, owner) > 0;
}

/**
 * How many of `owner`'s tiles lose their link to the nest if this one is taken, not
 * counting the tile itself.
 *
 * Re-floods the colony graph, so it is only ever called from the root pass.
 */
function tilesSevered(state: GameState, v: Tile, owner: Player): number {
  if (v.owner !== owner) return 0;
  const before = countConnected(state, owner);
  const saved = v.owner;
  v.owner = null;
  const after = countConnected(state, owner);
  v.owner = saved;
  return Math.max(0, before - after - 1);
}

function countConnected(state: GameState, p: Player): number {
  const nest = nestTile(state, p);
  if (!nest) return 0;
  const seen = new Set<Tile>([nest]);
  const stack: Tile[] = [nest];
  for (const t of allTiles(state)) if (t.owner === p && t.tunnel && !seen.has(t)) { seen.add(t); stack.push(t); }
  while (stack.length) {
    const t = stack.pop() as Tile;
    for (const n of neighbours(state, t)) if (n.owner === p && !seen.has(n)) { seen.add(n); stack.push(n); }
  }
  return seen.size;
}

/** Score one adjacent step, whatever kind of tile it lands on. */
function rateStep(
  state: GameState, src: Tile, n: Tile, commit: number, p: Player, opp: Player,
  atkMul: number, defMul: number, ctx: ActionContext, forward: number,
  opts: GenOptions, myNest: Tile | null,
): number {
  // A cloaked enemy tile looks empty — the AI must not cheat by seeing through it.
  const apparent = n.owner === opp && n.hidden ? null : n.owner;

  if (apparent === p) {
    if (!opts.reinforce) return -1;
    return rateReinforce(state, src, n, commit, p, opp, ctx, myNest);
  }

  if (apparent === opp && n.struct === "vein") {
    // Enemy trails have no defence at all (CLAUDE.md §4.3) — they are taken for free.
    // What makes one worth taking is what hangs off the far side of it: connectivity is
    // nest-anchored, so cutting the right vein sends everything past it dark in one move.
    // Rated by how many tiles that is, which is the difference between a tidy capture and
    // a colony cut in half.
    const severed = opts.veinGuard ? tilesSevered(state, n, opp) : 0;
    return 42 + forward * 3 + severed * 26;
  }

  if (apparent === opp) {
    const res = fight(commit, atkMul, n.soldiers, defMul, flatDefence(state, n, ctx.mods[opp]));
    if (res.winner !== "atk") return -1;
    return 72 + (n.struct === "nest" ? 99999 : 0) + (n.struct === "stable" ? 20 : 6)
      + (n.terrain === "resource" ? 30 : 0) + forward * 6;
  }

  if (isHiveTerrain(n)) {
    const res = fight(commit, atkMul, n.soldiers, 1, 0);
    if (res.winner !== "atk") return -1;
    return n.terrain === "hiveQ" ? 220 : 90;
  }

  if (n.guard > 0) {
    const res = fight(commit, atkMul, n.guard, 1.0, guardDefence(n));
    if (res.winner !== "atk") return -1;
    // A defended resource pays its cost back in about two turns.
    return (n.terrain === "resource" ? 55 : 8) + forward * 5;
  }

  return (n.terrain === "resource" ? 48 : 11) + forward * 6;
}

/**
 * Is moving onto our own tile worth a whole turn?
 *
 * Usually not — it takes no ground. It is worth it when it builds a fist that wins a
 * fight the two piles would each have lost separately, or when it saves a tile that is
 * about to fall. Rating those two cases explicitly is what stops reinforcement moves
 * either flooding the move list or being ignored.
 */
function rateReinforce(
  state: GameState, src: Tile, dst: Tile, commit: number, p: Player, opp: Player,
  ctx: ActionContext, myNest: Tile | null,
): number {
  const atkMul = attackMultiplier(state, p, ctx.mods[p]);
  const defMulMe = defenceMultiplier(state, p, ctx.mods[p]);
  const defMulOpp = defenceMultiplier(state, opp, ctx.mods[opp]);
  const atkMulOpp = attackMultiplier(state, opp, ctx.mods[opp]);
  const merged = dst.soldiers + commit;
  let score = 2 + Math.min(commit, 20) * 0.4;         // massing is mildly good on its own

  for (const n of neighbours(state, dst)) {
    if (n.owner === opp) {
      const flat = flatDefence(state, n, ctx.mods[opp]);
      const before = fight(dst.soldiers - keepOn(dst), atkMul, n.soldiers, defMulOpp, flat);
      const after = fight(merged - keepOn(dst), atkMul, n.soldiers, defMulOpp, flat);
      // The whole point of a fist: a fight neither pile could win, the pair can.
      if (before.winner !== "atk" && after.winner === "atk") {
        score += 60 + (n.struct === "nest" ? 400 : 0) + (n.terrain === "resource" ? 25 : 0);
      }
      // ...or it turns a tile that was hanging into one that holds.
      const raid = n.soldiers - keepOn(n);
      if (raid >= 1) {
        const flatMine = flatDefence(state, dst, ctx.mods[p]);
        const fell = raid * atkMulOpp > dst.soldiers * defMulMe + flatMine;
        const holds = raid * atkMulOpp <= merged * defMulMe + flatMine;
        if (fell && holds) score += 45 + (dst.struct === "nest" ? 500 : 0);
      }
    }
    if (isHiveTerrain(n) && merged > n.soldiers && dst.soldiers <= n.soldiers) score += 70;
  }

  if (myNest && dst === myNest) score += 8;
  return score;
}

/**
 * Rally gathers every spare soldier in the colony onto one tile.
 *
 * It reads as the strongest action in the game and it is very nearly the worst. Self-play
 * settled this: an AI allowed to rally whenever the fist beat something scored 10% against
 * the same AI without it. The reason is the other half of the action — every tile the
 * troops came off is left at its one-soldier floor, so the whole colony becomes free ground
 * for anything that walks up to it, and one fist cannot be in fifteen places.
 *
 * So it is offered for the two cases where the downside cannot be collected: when the fist
 * takes the enemy queen and ends the match, and when the AI's own queen is about to fall
 * and there is no later to pay for.
 */
function rallyCandidates(
  state: GameState, p: Player, opp: Player, ctx: ActionContext,
  atkMul: number, defMul: number,
): Candidate[] {
  let spare = 0;
  for (const t of allTiles(state)) {
    if (t.owner === p && isConnected(state, t)) spare += Math.max(0, t.soldiers - keepOn(t));
  }
  if (spare < 6) return [];

  const out: Candidate[] = [];
  for (const dst of rallyTargets(state, p)) {
    const pooled = dst.soldiers + spare - Math.max(0, dst.soldiers - keepOn(dst));
    let best = 0;

    // The finisher: the pooled fist takes the queen, and there is no next turn to punish.
    for (const n of neighbours(state, dst)) {
      if (n.owner !== opp || n.struct !== "nest") continue;
      const flat = flatDefence(state, n, ctx.mods[opp]);
      const now = fight(Math.max(0, dst.soldiers - keepOn(dst)), atkMul, n.soldiers, defMul, flat);
      const then = fight(pooled - keepOn(dst), atkMul, n.soldiers, defMul, flat);
      if (then.winner === "atk" && now.winner !== "atk") best = 99999;
    }

    // The last stand: our own queen falls next turn unless everything comes home.
    if (dst.struct === "nest") {
      let threat = 0;
      for (const n of neighbours(state, dst)) if (n.owner === opp) threat = Math.max(threat, n.soldiers);
      if (threat > dst.soldiers && pooled > threat) best = Math.max(best, 300);
    }

    if (best > 0) out.push({ action: { kind: "rally", to: xy(dst) }, score: best });
  }
  return out;
}
