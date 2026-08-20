/**
 * BOARD EVALUATION
 *
 * The old evaluation counted what a player HAS. That is why deeper search made the AI
 * worse rather than better: search optimises whatever it is given, and a function that
 * cannot see danger will happily walk a stack into a losing fight because the position
 * "looks" fine one ply before the punishment lands.
 *
 * This one also counts what a player is ABOUT TO LOSE. Combat is fully deterministic
 * (CLAUDE.md §4.1), so "can that tile be taken next move?" is not a guess — it is
 * arithmetic, and cheap arithmetic at that. Knowing it at every leaf is what lets a
 * shallow search play sensibly and a deep one stop blundering.
 */
import {
  PROD, attackMultiplier, defenceMultiplier, distance, flatDefence,
  isConnected, isHiveTerrain, keepOn, neighbours, nestTile, otherPlayer,
} from "../engine";
import type { GameState, Player, PlayerMods, Tile } from "../engine";

/** A win is a win, but a faster win is worth more — it stops the AI dawdling on a kill. */
export const WIN = 1e7;

export interface EvalWeights {
  tile: number;
  income: number;
  resource: number;
  army: number;
  /** Largest single stack, capped. Same army spread thin loses to the same army in one fist. */
  concentration: number;
  /** What the opponent can capture on their next move, and what we can capture on ours. */
  hanging: number;
  nestThreat: number;
  nestPressure: number;
  advance: number;
  /** Hive tiles held. */
  hive: number;
  /**
   * Holding the Hive queen, per turn of surge left.
   *
   * Capturing her multiplies BOTH attack and defence by 1.5 for the whole surge
   * (`surgeMultiplier`). Nothing else on the board is worth anything like it, and the
   * evaluation used to price the whole thing as five ordinary tiles — so the AI would
   * wander past the centre of the map rather than fight for it.
   */
  surge: number;
}

/**
 * The full weight set.
 *
 * `hanging` is the term the old evaluation lacked and the one that makes search pay off.
 *
 * A `fragility` term used to sit beside it, counting the articulation points of the colony
 * graph — the tiles whose capture would cut other tiles off. It was removed after self-play:
 * hard scored 28% with it and 71% without. Two reasons, and both are worth remembering
 * before anyone adds it back. In a colony that is still growing, nearly every frontier tile
 * IS an articulation point, so the term mostly penalised expanding at all; and computing it
 * at every leaf halved the node rate, which cost a whole ply of depth to buy the bad advice.
 */
export const FULL: EvalWeights = {
  tile: 10,
  income: 7,
  resource: 10,
  army: 1.2,
  concentration: 1.6,
  hanging: 0.7,
  nestThreat: 4,
  nestPressure: 3,
  advance: 1.5,
  hive: 6,
  surge: 14,
};

/**
 * What Easy plays on. It is the same function with the tactical terms switched off, so
 * Easy does not see a tile hanging and does not understand that a massed army is worth
 * more than a scattered one. That is a structural weakness rather than a random one:
 * it plays consistently, just naively, and it makes the mistakes a new player makes.
 */
export const NAIVE: EvalWeights = {
  ...FULL,
  concentration: 0,
  hanging: 0,
  nestThreat: 1,
  hive: 0,
  surge: 0,
};

/**
 * Veins are infrastructure, not territory (CLAUDE.md §4.5): they produce nothing, hold
 * nothing, and prune the moment they lose an anchor. Counting one as a whole tile taught
 * the AI to prefer a four-tile travel — four veins — over an adjacent resource, which is
 * four times the "territory" and none of the value.
 */
const VEIN_SHARE = 0.25;

/** What one tile is worth to the side holding it, before any positional term. */
function tileValue(t: Tile, w: EvalWeights): number {
  if (t.struct === "vein") return w.tile * VEIN_SHARE;
  let v = w.tile;
  if (t.struct === "stable" || t.struct === "nest") {
    v += (t.terrain === "resource" ? PROD.resourceStable : PROD.stable) * w.income;
  }
  if (t.terrain === "resource") v += w.resource;
  if (t.struct === "nest") v += 400;                  // losing it loses the match
  return v;
}

interface Side {
  tiles: number;
  income: number;
  resources: number;
  maxStack: number;
  hiveTiles: number;
  /** Value of this side's tiles the OTHER side can take on its next move. */
  hanging: number;
}

const blankSide = (): Side => ({
  tiles: 0, income: 0, resources: 0, maxStack: 0, hiveTiles: 0, hanging: 0,
});

/**
 * Score the board from `me`'s perspective. Positive = good for the AI.
 *
 * One pass over the grid does all the counting; the hanging scan rides along on it,
 * comparing raw attack power against raw defence power rather than calling `fight()`,
 * because only the winner matters here and not the survivor count.
 */
export function evaluate(
  state: GameState, me: Player, mods: Record<Player, PlayerMods>, w: EvalWeights = FULL,
): number {
  const opp = otherPlayer(me);

  if (state.over) {
    if (state.winner === null) return 0;
    // Subtracting the turn count makes an earlier win strictly better than a later one.
    return (state.winner === me ? WIN : -WIN) + (state.winner === me ? -state.turn : state.turn);
  }
  const myNest = nestTile(state, me);
  const oppNest = nestTile(state, opp);
  if (!myNest) return -WIN;
  if (!oppNest) return WIN;

  const atk: Record<Player, number> = {
    you: attackMultiplier(state, "you", mods.you),
    ai: attackMultiplier(state, "ai", mods.ai),
  };
  const def: Record<Player, number> = {
    you: defenceMultiplier(state, "you", mods.you),
    ai: defenceMultiplier(state, "ai", mods.ai),
  };

  const side: Record<Player, Side> = { you: blankSide(), ai: blankSide() };
  const wantsTactics = w.hanging > 0;
  let myArmy = 0, oppArmy = 0, nearest = 99;

  // ONE pass over the grid. This function runs at every leaf of the search, so the
  // difference between one walk and four (allTiles + armyOf + the advance scan) is the
  // difference between a search that reaches five plies and one that reaches three.
  for (const row of state.grid) for (const t of row) {
    if (!t.owner) continue;
    if (t.owner === me) {
      myArmy += t.soldiers;
      if (t.soldiers >= 3) {
        const d = distance(t, oppNest);
        if (d < nearest) nearest = d;
      }
    } else oppArmy += t.soldiers;

    if (!isConnected(state, t)) continue;
    const s = side[t.owner];
    s.tiles += t.struct === "vein" ? VEIN_SHARE : 1;
    if (t.struct === "stable" || t.struct === "nest") {
      s.income += t.terrain === "resource" ? PROD.resourceStable : PROD.stable;
    }
    if (t.terrain === "resource") s.resources++;
    if (isHiveTerrain(t)) s.hiveTiles++;
    if (t.soldiers > s.maxStack) s.maxStack = t.soldiers;

    if (!wantsTactics || t.struct === "vein") continue;

    // Can the other side take this tile on their next move? Deterministic combat means
    // this is a comparison, not a simulation.
    const holder = t.owner;
    const raider = otherPlayer(holder);
    const defPower = t.soldiers * def[holder] + flatDefence(state, t, mods[holder]);
    for (const n of neighbours(state, t)) {
      if (n.owner !== raider || !isConnected(state, n)) continue;
      const commit = n.soldiers - keepOn(n);
      if (commit < 1) continue;
      if (commit * atk[raider] > defPower) { s.hanging += tileValue(t, w); break; }
    }
  }

  const mine = side[me], theirs = side[opp];
  // Tried and rejected: scaling this term up as the turn limit approaches, on the theory
  // that the limit is decided on tile count so late tiles are worth more. It cost hard
  // fifteen points against easy — the AI over-extends grabbing ground it cannot hold, and
  // arrives at the count behind rather than ahead.
  let score =
      (mine.tiles - theirs.tiles) * w.tile
    + (mine.income - theirs.income) * w.income
    + (mine.resources - theirs.resources) * w.resource
    + (myArmy - oppArmy) * w.army
    + (fistValue(mine.maxStack) - fistValue(theirs.maxStack)) * w.concentration
    + (mine.hiveTiles - theirs.hiveTiles) * w.hive
    // What THEY are about to lose is as good as what we are about to lose is bad.
    + (theirs.hanging - mine.hanging) * w.hanging;

  if (w.surge > 0 && state.hive.phase === "buff" && state.hive.owner) {
    score += (state.hive.owner === me ? 1 : -1) * w.surge * Math.max(0, state.hive.buffLeft);
  }

  // Nest safety dominates: losing the queen ends the match outright.
  const threat = biggestNeighbour(state, myNest, opp);
  const pressure = biggestNeighbour(state, oppNest, me);
  score += pressure * w.nestPressure - threat * w.nestThreat;
  if (myNest.soldiers < threat) score -= 220;

  // Push the army at the enemy queen rather than letting it idle at home.
  score -= nearest * w.advance;
  return score;
}

/**
 * What a fist is worth.
 *
 * Concentration wins fights, so it is worth something — but a 60-stack is not twice the
 * weapon a 30-stack is, because both already beat everything on the board, and without a
 * ceiling the search reads "pile the whole colony onto one tile" as a win condition.
 */
const FIST_CAP = 40;
const fistValue = (stack: number): number => Math.min(stack, FIST_CAP);

function biggestNeighbour(state: GameState, at: Tile, p: Player): number {
  let best = 0;
  for (const n of neighbours(state, at)) if (n.owner === p && n.soldiers > best) best = n.soldiers;
  return best;
}

