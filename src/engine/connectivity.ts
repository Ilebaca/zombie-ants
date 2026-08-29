import { allTiles, isHiveTerrain, neighbours, nestTile, razeTile } from "./board";
import { key } from "./types";
import type { EngineEvent, GameState, Player, Tile } from "./types";

/**
 * SUPPLY LINES (CLAUDE.md §4.2)
 *
 * A tile is active only if a chain of same-owner tiles — captured tiles OR veins — links it
 * back to that player's nest. A part detached from the queen goes inactive: no production,
 * no income.
 *
 * Tunnel galleries are their own roots: they link back underground and can never be cut off.
 */
export function connectedSet(state: GameState, p: Player): Set<string> {
  const found = new Set<string>();
  const nest = nestTile(state, p);
  const stack: Tile[] = [];

  if (nest) {
    found.add(key(nest.c, nest.r));
    stack.push(nest);
  }

  // Every gallery mouth is an independent root.
  for (const t of allTiles(state)) {
    if (t.owner === p && t.tunnel) {
      const k = key(t.c, t.r);
      if (!found.has(k)) { found.add(k); stack.push(t); }
    }
  }

  while (stack.length) {
    const t = stack.pop() as Tile;
    for (const n of neighbours(state, t)) {
      if (n.owner !== p) continue;
      const k = key(n.c, n.r);
      if (!found.has(k)) { found.add(k); stack.push(n); }
    }
  }
  return found;
}

/**
 * Rebuild the connectivity cache. Call after EVERY action and immediately after effects
 * tick — venom or fire that destroys a connector must deactivate the far side at once.
 */
export function recomputeConnectivity(state: GameState): void {
  state.conn.you = connectedSet(state, "you");
  state.conn.ai = connectedSet(state, "ai");
}

export function isConnected(state: GameState, t: Tile): boolean {
  if (!t.owner) return false;
  if (isHiveTerrain(t)) return true;   // the shared objective is never "cut off"
  if (t.tunnel) return true;           // galleries link back underground
  return state.conn[t.owner].has(key(t.c, t.r));
}

/**
 * DANGLING VEINS COLLAPSE (CLAUDE.md §4.5)
 *
 * Two rules, and it took a real match to learn that one of them was not enough.
 *
 * A vein needs at least two same-owner colony neighbours: it is a connector, and a
 * connector with one end joined to nothing is a stub. When it loses an anchor the trail
 * unwinds back to the nearest captured tile, junctions surviving because they keep two or
 * more neighbours.
 *
 * But that rule is LOCAL, and a closed ring satisfies it forever: every vein in a loop has
 * two vein neighbours, so a loop cut off from the colony by a barrage stood there
 * permanently — ground that produced nothing, defended nothing, and had to be cleared one
 * tile at a time. So a vein must also be able to REACH a captured tile of its own colony
 * through same-owner tiles. A trail always can, because a trail ends at one; a free
 * floating loop never can, and goes.
 *
 * Both run to a fixed point together: destroying a stub can strand a loop, and destroying
 * a loop can leave a stub.
 *
 * NOTE: never call this from Flee — Flee relocates garrisons and must not break structure.
 */
export function pruneVeins(state: GameState, owner: Player, events: EngineEvent[] = []): EngineEvent[] {
  const destroy = (t: Tile): void => {
    events.push({ type: "veinPruned", at: { c: t.c, r: t.r }, owner });
    razeTile(t);
  };

  let changed = true;
  while (changed) {
    changed = false;

    for (const t of allTiles(state)) {
      if (t.owner !== owner || t.struct !== "vein") continue;
      let anchors = 0;
      for (const n of neighbours(state, t)) {
        if (n.owner === owner && (n.struct === "vein" || n.struct === "stable" || n.struct === "nest")) anchors++;
      }
      if (anchors < 2) { destroy(t); changed = true; }
    }

    const held = veinsHeld(state, owner);
    for (const t of allTiles(state)) {
      if (t.owner !== owner || t.struct !== "vein") continue;
      if (held.has(key(t.c, t.r))) continue;
      destroy(t);
      changed = true;
    }
  }
  return events;
}

/**
 * Every vein of `owner` that can be walked to from one of their captured tiles.
 *
 * Captured tiles only — a stable or a nest. Starting from veins as well would make any
 * group of veins hold itself up, which is the loop this exists to catch.
 */
function veinsHeld(state: GameState, owner: Player): Set<string> {
  const held = new Set<string>();
  const queue: Tile[] = [];
  for (const t of allTiles(state)) {
    if (t.owner === owner && (t.struct === "stable" || t.struct === "nest")) queue.push(t);
  }
  while (queue.length) {
    const cur = queue.pop() as Tile;
    for (const n of neighbours(state, cur)) {
      if (n.owner !== owner || n.struct !== "vein") continue;
      const k = key(n.c, n.r);
      if (held.has(k)) continue;
      held.add(k);
      queue.push(n);
    }
  }
  return held;
}

export function pruneAllVeins(state: GameState, events: EngineEvent[] = []): EngineEvent[] {
  pruneVeins(state, "you", events);
  pruneVeins(state, "ai", events);
  return events;
}
