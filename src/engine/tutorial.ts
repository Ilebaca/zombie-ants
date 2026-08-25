/**
 * The tutorial board.
 *
 * A first match played straight cannot teach the game. The Hive sleeps for ten turns, the
 * enemy is a dozen tiles away, and five starting tiles with three soldiers each cannot
 * crack anything — so a walkthrough played on a normal opening can only ever demonstrate
 * "move onto empty ground" and stop there.
 *
 * This arranges a real board into one where every lesson is available on turn one: a
 * spearhead standing next to the Hive with soldiers enough to take her, a supply line
 * holding it to the colony, and an enemy outpost within arm's reach to be fought for. The
 * rules are untouched — this only decides where things START, exactly as a formation does.
 * It is applied to whatever map the player picked, so it never contradicts their choice.
 */
import { allTiles, isHiveTerrain, nestTile, neighbours, tileAt } from "./board";
import { recomputeConnectivity } from "./connectivity";
import { setHiveDefence } from "./hive";
import type { Coord, GameState, Player, Tile } from "./types";

/** The spearhead's garrison: enough to take a hive guard AND the queen behind it. */
export const TUTORIAL_FIST = 140;
/** What the supply line stands at. */
const SUPPLY = 4;
/** The enemy outpost, and the garrison put beside it to take the outpost WITH. */
const OUTPOST = 3;
const ASSAULT = 14;

/** Ground a colony may be placed on. Never hive terrain, never a wild garrison. */
const placeable = (t: Tile): boolean =>
  !t.owner && t.guard === 0 && !isHiveTerrain(t) && (t.terrain === "ground" || t.terrain === "resource");

export function arrangeTutorial(state: GameState): void {
  // She is up from the first turn: the walkthrough ends on taking her, and a tutorial that
  // asked the player to wait ten turns for its last step would not be one.
  state.limits.awakenTurn = 1;
  if (state.hive.phase === "dormant") {
    state.hive.phase = "awake";
    state.hive.awokeTurn = 1;
    setHiveDefence(state);
  }

  const nest = nestTile(state, "you");
  if (!nest) return;

  const fist = fistCell(state, nest);
  if (fist) {
    // The line back to the colony, so the spearhead is supplied rather than cut off — a
    // detached tile produces nothing and would teach the wrong lesson on sight (§4.2).
    for (const at of supplyPath(state, fist, nest)) claim(state, at, "you", SUPPLY);
    claim(state, fist, "you", TUTORIAL_FIST);
  }

  const outpost = outpostCell(state);
  if (outpost) {
    claim(state, outpost, "ai", OUTPOST);
    // Combat is deterministic (§4.1), so "attack that tile" is only a lesson if the sum
    // comes out. The tile they are asked to attack FROM gets a garrison that wins it.
    const t = tileAt(state, outpost.c, outpost.r);
    const attacker = t && neighbours(state, t).find((n) => n.owner === "you");
    if (attacker) attacker.soldiers = Math.max(attacker.soldiers, ASSAULT);
  }

  recomputeConnectivity(state);
}

function claim(state: GameState, at: Coord, owner: Player, soldiers: number): void {
  const t = tileAt(state, at.c, at.r);
  if (!t) return;
  t.owner = owner;
  t.struct = "stable";
  t.soldiers = soldiers;
  t.guard = 0;
}

/**
 * Where the spearhead stands: beside a hive guard, on the side the player's nest is on.
 *
 * Beside a GUARD rather than beside the queen, because the queen's only neighbours are her
 * four guards — there is no square from which she can be attacked directly. Cracking a
 * guard first and stepping into it is how she is actually taken, so that is what the
 * walkthrough has to be able to show.
 */
function fistCell(state: GameState, nest: Tile): Coord | null {
  let best: { at: Coord; d: number } | null = null;
  for (const guard of allTiles(state)) {
    if (guard.terrain !== "hiveG") continue;
    for (const n of neighbours(state, guard)) {
      if (!placeable(n)) continue;
      const d = Math.abs(n.c - nest.c) + Math.abs(n.r - nest.r);
      if (!best || d < best.d) best = { at: { c: n.c, r: n.r }, d };
    }
  }
  return best?.at ?? null;
}

/**
 * The tiles between the spearhead and the colony, walked back from the spearhead.
 *
 * A breadth-first walk over ground the player could have taken anyway, stopping at the
 * first tile they already hold. The tile it stops ON is theirs already and is not returned.
 */
function supplyPath(state: GameState, from: Coord, nest: Tile): Coord[] {
  const start = tileAt(state, from.c, from.r);
  if (!start) return [];
  const prev = new Map<string, string | null>([[key(from), null]]);
  const queue: Tile[] = [start];

  while (queue.length) {
    const cur = queue.shift() as Tile;
    for (const n of neighbours(state, cur)) {
      const k = key(n);
      if (prev.has(k)) continue;
      if (n.owner === "you") {
        // Found the colony: walk the chain back, dropping the tile they already hold.
        const path: Coord[] = [];
        let at: string | null = key(cur);
        while (at) {
          const [c, r] = at.split(",").map(Number) as [number, number];
          path.push({ c, r });
          at = prev.get(at) ?? null;
        }
        return path;
      }
      if (!placeable(n)) continue;
      prev.set(k, key(cur));
      queue.push(n);
    }
  }
  // No route home — better to leave the spearhead out of the arrangement than to hand the
  // player a cut-off stack and teach them that supply does not matter.
  void nest;
  return [];
}

/** Something to fight on turn one: an enemy tile beside the colony, well away from the Hive. */
function outpostCell(state: GameState): Coord | null {
  for (const t of allTiles(state)) {
    if (!placeable(t)) continue;
    if (neighbours(state, t).some((n) => isHiveTerrain(n))) continue;
    if (!neighbours(state, t).some((n) => n.owner === "you")) continue;
    return { c: t.c, r: t.r };
  }
  return null;
}

const key = (t: Coord): string => `${t.c},${t.r}`;
