import { KEEP_NORMAL, KEEP_TUNNEL, TRAVEL_RANGE } from "./config";
import {
  allTiles, directionFromTo, isHiveTerrain, neighbours, otherPlayer, tileAt,
} from "./board";
import {
  attackMultiplier, defenceMultiplier, fight, flatDefence, guardDefence,
} from "./combat";
import { isConnected, pruneAllVeins, recomputeConnectivity } from "./connectivity";
import { captureQueen, queenIsTakeable } from "./hive";
import { key } from "./types";
import type {
  Coord, EngineEvent, GameState, Player, PlayerMods, Tile,
} from "./types";
import { NEUTRAL_MODS } from "./types";

/**
 * All player/AI actions. These are the ONLY functions that mutate the board.
 *
 * They return an EngineEvent[] describing what happened. The engine never calls into
 * rendering — that separation is what lets the AI simulate futures safely (CLAUDE.md §3).
 */

export interface ActionContext {
  mods: Record<Player, PlayerMods>;
}

export const defaultContext = (): ActionContext => ({
  mods: { you: { ...NEUTRAL_MODS }, ai: { ...NEUTRAL_MODS } },
});

/** Soldiers that must stay behind. A tile can never be emptied (CLAUDE.md §4.7). */
export const keepOn = (t: Tile): number => (t.tunnel ? KEEP_TUNNEL : KEEP_NORMAL);

/** A tile can act if it is yours, connected, and has more than its floor. */
export function canActFrom(state: GameState, t: Tile): boolean {
  return t.owner === state.current && isConnected(state, t) && t.soldiers > keepOn(t);
}

/** Promote a captured tile to a stable. Nests and hive terrain are never re-labelled here. */
/**
 * Ground somebody holds is a stable — whatever is printed on it.
 *
 * This used to promote only "ground" and "resource", which left one hole: a dead queen's
 * tiles keep their hive terrain, so walking onto one during the cooldown gave a tile with an
 * owner and NO structure. That is not a state the rest of the rules understand — it anchors
 * no vein, it is not "captured" for the corner logic, and it produces nothing. A rock can
 * never be owned, so every other terrain promotes.
 */
export function promote(t: Tile): void {
  if (t.struct !== "nest" && t.terrain !== "blocked") t.struct = "stable";
}

function endIfNestFell(state: GameState, victim: Player, winner: Player, events: EngineEvent[]): void {
  state.over = true;
  state.winner = winner;
  events.push({ type: "gameOver", winner, reason: "nest" });
  void victim;
}

/* ------------------------------------------------------------------ MOVE / ATTACK */

export function moveOrAttack(
  state: GameState, from: Coord, to: Coord, ctx: ActionContext = defaultContext(),
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const src = tileAt(state, from.c, from.r);
  const dst = tileAt(state, to.c, to.r);
  if (!src || !dst || !src.owner) return events;
  if (!canActFrom(state, src)) return events;
  if (dst.terrain === "blocked") return events;
  if (blockedByEnemyLeaf(state, dst, src.owner)) return events;

  const attacker = src.owner;
  const keep = keepOn(src);
  const commit = src.soldiers - keep;
  if (commit < 1) return events;

  const dir = directionFromTo(src, dst);

  // Reinforce our own tile. Troops landing on a vein promote it (CLAUDE.md §4.5).
  if (dst.owner === attacker) {
    src.soldiers = keep;
    dst.soldiers += commit;
    promote(dst);
    events.push({ type: "move", from, to, owner: attacker, count: commit });
    return finish(state, events);
  }

  // Enemy vein: NO defence, captured instantly with no losses (CLAUDE.md §4.3).
  if (dst.owner && dst.owner !== attacker && dst.struct === "vein") {
    const previous = dst.owner;
    src.soldiers = keep;
    dst.owner = attacker; dst.soldiers = commit; dst.tunnel = false;
    promote(dst);
    events.push({ type: "capture", at: to, owner: attacker, from: dir, previous });
    return finish(state, events);
  }

  /*
   * The five tiles only behave as THE HIVE while she is neutral and standing.
   *
   * Dead, they are ordinary ground: no garrison, no fight, no surge for walking onto them
   * (what is left standing there feeds her when she returns). Held during a surge, they are
   * ordinary tiles of whoever holds them — they can be fought for like any other, but taking
   * them does not hand the growth over.
   */
  const onHive = isHiveTerrain(dst) && queenIsTakeable(state);

  // Unowned tile held by a neutral wild garrison — beat it first.
  if (!dst.owner && dst.guard > 0 && !onHive) {
    const res = fight(commit, attackMultiplier(state, attacker, ctx.mods[attacker]), dst.guard, 1.0, guardDefence(dst));
    src.soldiers = keep;
    events.push({ type: "combat", at: to, attacker, from: dir, won: res.winner === "atk", survivors: res.survivors });
    if (res.winner === "atk") {
      dst.owner = attacker; dst.soldiers = res.survivors; dst.guard = 0;
      promote(dst);
      events.push({ type: "capture", at: to, owner: attacker, from: dir, previous: null });
    } else {
      dst.guard = res.survivors;   // wild garrisons never regenerate
    }
    return finish(state, events);
  }

  // Empty ground or resource: claimed directly.
  if (!dst.owner && !onHive) {
    src.soldiers = keep;
    dst.owner = attacker; dst.soldiers = commit;
    promote(dst);
    events.push({ type: "capture", at: to, owner: attacker, from: dir, previous: null });
    return finish(state, events);
  }

  // COMBAT — enemy tile or hive tile.
  const hive = onHive;
  const defender = dst.owner;
  const defMod = hive || !defender ? 1 : defenceMultiplier(state, defender, ctx.mods[defender]);
  const flat = hive || !defender ? 0 : flatDefence(state, dst, ctx.mods[defender]);

  const res = fight(commit, attackMultiplier(state, attacker, ctx.mods[attacker]), dst.soldiers, defMod, flat);
  src.soldiers = keep;
  events.push({ type: "combat", at: to, attacker, from: dir, won: res.winner === "atk", survivors: res.survivors });

  if (res.winner !== "atk") {
    dst.soldiers = res.survivors;   // defender holds; no regeneration
    return finish(state, events);
  }

  // Attacker won. Capture the "was this a nest?" flag BEFORE mutating — a past bug
  // relabelled the tile first, so the win check never fired (CLAUDE.md §5).
  const wasNest = dst.struct === "nest";
  const previous = dst.owner;

  if (hive && dst.terrain === "hiveQ" && queenIsTakeable(state)) {
    captureQueen(state, attacker, events);
    dst.soldiers = res.survivors;
  } else {
    dst.tunnel = false;                       // an overrun gallery collapses
    dst.owner = attacker;
    dst.soldiers = res.survivors;
    // Captured hive guards become held stables — making them veins let the pruner
    // delete them, which turned a won fight into an apparent loss (CLAUDE.md §5).
    dst.struct = wasNest ? "nest" : "stable";
    events.push({ type: "capture", at: to, owner: attacker, from: dir, previous });
  }

  if (previous && previous !== attacker && wasNest) {
    endIfNestFell(state, previous, attacker, events);
  }
  return finish(state, events);
}

/**
 * Neighbours a selected tile may move into or attack.
 * Rocks and enemy leaf walls are excluded; hive guards and the queen are always valid.
 */
function moveTargets(state: GameState, src: Tile): Coord[] {
  const owner = src.owner;
  if (!owner) return [];
  return neighbours(state, src)
    .filter((t) => t.terrain !== "blocked" && !blockedByEnemyLeaf(state, t, owner))
    .map((t) => ({ c: t.c, r: t.r }));
}

/**
 * Every legal destination in the combined Move/Travel mode: neighbours to move or attack,
 * plus far tiles reachable by a long send. Deduplicated, since the two can overlap.
 */
export function actionTargets(state: GameState, src: Tile): Coord[] {
  const seen = new Set<string>();
  const out: Coord[] = [];
  for (const v of [...moveTargets(state, src), ...travelTargets(state, src)]) {
    const k = key(v.c, v.r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/* ------------------------------------------------------------------------- RALLY */

/**
 * Pull every spare soldier in the colony onto one tile.
 * Only captured tiles are valid targets — never a bare vein (CLAUDE.md §4.5).
 */
export function rallyTargets(state: GameState, p: Player): Tile[] {
  return allTiles(state).filter(
    (t) => t.owner === p && isConnected(state, t) && (t.struct === "stable" || t.struct === "nest"),
  );
}

export function rally(state: GameState, to: Coord): EngineEvent[] {
  const events: EngineEvent[] = [];
  const dst = tileAt(state, to.c, to.r);
  if (!dst || dst.owner !== state.current || !isConnected(state, dst)) return events;
  if (dst.struct === "vein") promote(dst);   // gathering here captures the trail properly

  const sources: Coord[] = [];
  let moved = 0;
  for (const t of allTiles(state)) {
    if (t === dst || t.owner !== state.current || !isConnected(state, t)) continue;
    const keep = keepOn(t);
    if (t.soldiers > keep) {
      const give = t.soldiers - keep;
      t.soldiers = keep;
      dst.soldiers += give;
      moved += give;
      sources.push({ c: t.c, r: t.r });
    }
  }
  if (moved <= 0) return events;
  events.push({ type: "rally", to, owner: state.current, sources, count: moved });
  return finish(state, events);
}

/* ------------------------------------------------------------------------ TRAVEL */

/** Tiles reachable by a long send: within range, through our own or empty ground. */
export function travelTargets(state: GameState, src: Tile): Coord[] {
  if (!src.owner) return [];
  const owner = src.owner;
  const seen = new Map<string, number>([[key(src.c, src.r), 0]]);
  const queue: Array<{ c: number; r: number; d: number }> = [{ c: src.c, r: src.r, d: 0 }];
  const out: Coord[] = [];

  while (queue.length) {
    const cur = queue.shift() as { c: number; r: number; d: number };
    const here = tileAt(state, cur.c, cur.r);
    if (here && cur.d > 0 && cur.d <= TRAVEL_RANGE) {
      const emptyLandable = !here.owner && here.guard === 0 && (here.terrain === "ground" || here.terrain === "resource");
      const ownVein = here.owner === owner && here.struct === "vein";
      if (emptyLandable || ownVein) out.push({ c: cur.c, r: cur.r });
    }
    if (cur.d >= TRAVEL_RANGE || !here) continue;

    for (const n of neighbours(state, here)) {
      const k = key(n.c, n.r);
      if (seen.has(k)) continue;
      if (blockedByEnemyLeaf(state, n, owner)) continue;          // walls stop travel
      if (n.owner && n.owner !== owner && n.hidden) continue;      // cloaked tiles block too
      const passable = n.owner === owner
        || (!n.owner && n.guard === 0 && (n.terrain === "ground" || n.terrain === "resource"));
      if (!passable) continue;
      seen.set(k, cur.d + 1);
      queue.push({ c: n.c, r: n.r, d: cur.d + 1 });
    }
  }
  // Neighbours are handled by Move, so drop distance-1 results.
  return out.filter((o) => Math.abs(o.c - src.c) + Math.abs(o.r - src.r) > 1);
}

function pathTo(state: GameState, src: Tile, dst: Coord): Coord[] | null {
  if (!src.owner) return null;
  const owner = src.owner;
  const prev = new Map<string, string | null>([[key(src.c, src.r), null]]);
  const queue: Tile[] = [src];

  while (queue.length) {
    const cur = queue.shift() as Tile;
    if (cur.c === dst.c && cur.r === dst.r) {
      const path: Coord[] = [];
      let k: string | null | undefined = key(cur.c, cur.r);
      while (k) {
        const parts = k.split(",");
        path.unshift({ c: Number(parts[0]), r: Number(parts[1]) });
        k = prev.get(k) ?? null;
      }
      return path;
    }
    for (const n of neighbours(state, cur)) {
      const k = key(n.c, n.r);
      if (prev.has(k)) continue;
      const isDest = n.c === dst.c && n.r === dst.r;
      if (blockedByEnemyLeaf(state, n, owner)) continue;
      const passable = n.owner === owner
        || (!n.owner && n.guard === 0 && (n.terrain === "ground" || n.terrain === "resource"));
      if (!passable && !isDest) continue;
      prev.set(k, key(cur.c, cur.r));
      queue.push(n);
    }
  }
  return null;
}

/** Long-range send. Lays a vein trail behind it; the destination promotes to a stable. */
export function travel(state: GameState, from: Coord, to: Coord): EngineEvent[] {
  const events: EngineEvent[] = [];
  const src = tileAt(state, from.c, from.r);
  const dst = tileAt(state, to.c, to.r);
  if (!src || !dst || !src.owner || !canActFrom(state, src)) return events;
  if (!travelTargets(state, src).some((o) => o.c === to.c && o.r === to.r)) return events;

  const path = pathTo(state, src, to);
  if (!path) return events;

  const owner = src.owner;
  const keep = keepOn(src);
  const commit = src.soldiers - keep;
  src.soldiers = keep;

  // Lay vein over empty ground we pass through. Trail veins are NOT promoted.
  for (let i = 1; i < path.length; i++) {
    const step = path[i];
    if (!step) continue;
    const t = tileAt(state, step.c, step.r);
    if (t && !t.owner && !isHiveTerrain(t)) {
      t.owner = owner; t.struct = "vein";
      events.push({ type: "veinLaid", at: { c: t.c, r: t.r }, owner });
    }
  }

  if (dst.owner === owner) dst.soldiers += commit;
  else { dst.owner = owner; dst.soldiers = commit; }
  promote(dst);

  events.push({ type: "travel", path, owner, count: commit });
  return finish(state, events);
}

/* ----------------------------------------------------------------------- SHARED */

export function blockedByEnemyLeaf(state: GameState, t: Tile, p: Player): boolean {
  const enemy = otherPlayer(p);
  return state.effects.some((e) => e.c === t.c && e.r === t.r && e.kind === "leaf" && e.owner === enemy);
}

/** Every action ends the same way: prune dangling trails, then rebuild supply lines. */
function finish(state: GameState, events: EngineEvent[]): EngineEvent[] {
  pruneAllVeins(state, events);
  recomputeConnectivity(state);
  checkWipe(state, events);
  return events;
}

/** A colony reduced to zero tiles is eliminated. */
export function checkWipe(state: GameState, events: EngineEvent[]): void {
  if (state.over) return;
  const you = allTiles(state).some((t) => t.owner === "you");
  const ai = allTiles(state).some((t) => t.owner === "ai");
  if (!you) { state.over = true; state.winner = "ai"; events.push({ type: "gameOver", winner: "ai", reason: "wipe" }); }
  else if (!ai) { state.over = true; state.winner = "you"; events.push({ type: "gameOver", winner: "you", reason: "wipe" }); }
}
