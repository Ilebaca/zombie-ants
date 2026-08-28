/**
 * The tutorial board, and the enemy's scripted reply.
 *
 * A first match played straight cannot teach the game. The Hive sleeps for ten turns, the
 * enemy is a dozen tiles away, and five starting tiles of three soldiers cannot crack
 * anything — so a walkthrough played on a normal opening can only ever demonstrate "move
 * onto empty ground" and stop there.
 *
 * This arranges a real board into one where the whole lesson fits into five turns: a supply
 * line running from the colony to a camp beside the Hive, and an enemy tile sitting on the
 * guard between that camp and the queen. The rules are untouched — this only decides where
 * things START, exactly as a formation does, and it is applied to whatever map the player
 * picked so it never contradicts their choice.
 *
 * THE ENEMY TILE IS ON A HIVE GUARD ON PURPOSE. The queen's only neighbours are her four
 * guards, so there is no square she can be attacked from directly; a walkthrough that asks
 * for "attack the enemy, then take the queen" needs the enemy standing exactly there. A
 * captured hive tile becomes an ordinary stable (CLAUDE.md §5), so this is a board the game
 * produces by itself — it is simply set up already.
 */
import { allTiles, isHiveTerrain, nestTile, neighbours, tileAt } from "./board";
import { recomputeConnectivity } from "./connectivity";
import { setHiveDefence } from "./hive";
import { actionTargets, canActFrom, moveOrAttack } from "./actions";
import { distance } from "./board";
import type { ActionContext } from "./actions";
import type { Coord, EngineEvent, GameState, Player, Tile } from "./types";

/**
 * The army waiting in the nest.
 *
 * Rally gathers it onto the camp, and that one fist has to beat the enemy tile AND the
 * queen behind it — with the weakest attack multiplier in the game against the strongest
 * defence, since the player picked their colony and we do not get to choose.
 */
export const TUTORIAL_ARMY = 170;
/** What the supply line and the camp stand at: enough to act, not enough to matter. */
const SUPPLY = 6;
/** The enemy holding the guard. Small: the lesson is the arithmetic, not the odds. */
const ENEMY = 8;

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
  nest.soldiers = TUTORIAL_ARMY;

  const door = doorCell(state, nest);
  if (!door) { recomputeConnectivity(state); return; }
  claim(state, door, "ai", ENEMY);

  const camp = campCell(state, door, nest);
  if (camp) {
    // The line home, so the camp is supplied rather than cut off — a detached tile produces
    // nothing and would teach the wrong lesson on sight (§4.2).
    for (const at of supplyPath(state, camp, nest)) claim(state, at, "you", SUPPLY);
    claim(state, camp, "you", SUPPLY);
  }

  recomputeConnectivity(state);
}

function claim(state: GameState, at: Coord, owner: Player, soldiers: number): void {
  const t = tileAt(state, at.c, at.r);
  if (!t) return;
  t.owner = owner;
  // A captured hive tile is a stable, never a vein — the pruner would delete a vein and
  // the tile would be unselectable (§5).
  t.struct = "stable";
  t.soldiers = soldiers;
  t.guard = 0;
}

/** The hive guard the enemy is sitting on: the one on the player's side of the queen. */
function doorCell(state: GameState, nest: Tile): Coord | null {
  let best: { at: Coord; d: number } | null = null;
  for (const t of allTiles(state)) {
    if (t.terrain !== "hiveG" || t.owner) continue;
    const d = Math.abs(t.c - nest.c) + Math.abs(t.r - nest.r);
    if (!best || d < best.d) best = { at: { c: t.c, r: t.r }, d };
  }
  return best?.at ?? null;
}

/** Where the fist gathers: beside the enemy tile, on the side the colony is on. */
function campCell(state: GameState, door: Coord, nest: Tile): Coord | null {
  const t = tileAt(state, door.c, door.r);
  if (!t) return null;
  let best: { at: Coord; d: number } | null = null;
  for (const n of neighbours(state, t)) {
    if (!placeable(n)) continue;
    const d = Math.abs(n.c - nest.c) + Math.abs(n.r - nest.r);
    if (!best || d < best.d) best = { at: { c: n.c, r: n.r }, d };
  }
  return best?.at ?? null;
}

/**
 * The tiles between the camp and the colony, walked back from the camp.
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
  // No route home — better to leave the camp out of the arrangement than to hand the
  // player a cut-off stack and teach them that supply does not matter.
  void nest;
  return [];
}

/**
 * The FURTHEST tile a long send can reach from here.
 *
 * Lives beside the board it is walked on rather than in the screen, because it is the
 * lesson rather than a piece of chrome — and because a helper the test writes for itself
 * is a helper that passes against broken code.
 *
 * The nearest legal send is a poor lesson: a two-tile hop lays one vein and looks like a
 * move that went slightly wrong. The point of the step is the distance.
 */
export function furthestTravel(state: GameState, src: Tile): Coord | null {
  let best: { at: Coord; d: number } | null = null;
  for (const at of actionTargets(state, src)) {
    const d = distance(src, at);
    if (d <= 1) continue;
    if (!best || d > best.d) best = { at, d };
  }
  return best?.at ?? null;
}

/**
 * THE ENEMY'S TURN DURING THE WALKTHROUGH, decided here rather than searched.
 *
 * The player should see the board answer between their moves — a turn handed over is half
 * of how the game works — but not by a real search: a tutorial whose next step depends on
 * what the opponent felt like doing is a tutorial that can strand itself. This takes one
 * tile of ground beside the enemy's own colony and nothing else. It is chosen the same way
 * every time, so the same board always plays out the same.
 *
 * It returns the engine's own events, so the renderer dramatises it exactly as it would a
 * real move — the point is that the player watches it happen.
 */
export function tutorialAiMove(state: GameState, ctx: ActionContext): EngineEvent[] {
  const from = allTiles(state)
    .filter((t) => t.owner === "ai" && canActFrom(state, t) && emptyBeside(state, t))
    // Most soldiers first so the move is worth watching, then grid order to settle ties.
    .sort((a, b) => (b.soldiers - a.soldiers) || (a.r - b.r) || (a.c - b.c))[0];
  if (!from) return [];
  const to = emptyBeside(state, from) as Tile;
  return moveOrAttack(state, { c: from.c, r: from.r }, { c: to.c, r: to.r }, ctx);
}

/** The first free tile beside this one, in grid order — never a fight, never the Hive. */
function emptyBeside(state: GameState, t: Tile): Tile | null {
  return neighbours(state, t)
    .filter(placeable)
    .sort((a, b) => (a.r - b.r) || (a.c - b.c))[0] ?? null;
}

const key = (t: Coord): string => `${t.c},${t.r}`;
