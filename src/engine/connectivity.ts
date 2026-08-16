import { allTiles, isHiveTerrain, neighbours, nestTile } from "./board";
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
 * DANGLING VEINS COLLAPSE (CLAUDE.md §4.4)
 *
 * A vein is only useful as a connector, so it needs at least two same-owner colony
 * neighbours. When it loses an anchor the trail is destroyed back to the nearest captured
 * tile. Iterates until stable so a whole arm unwinds; junctions survive because they keep
 * two or more neighbours.
 *
 * NOTE: never call this from Flee — Flee relocates garrisons and must not break structure.
 */
export function pruneVeins(state: GameState, owner: Player, events: EngineEvent[] = []): EngineEvent[] {
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of allTiles(state)) {
      if (t.owner !== owner || t.struct !== "vein") continue;

      let anchors = 0;
      for (const n of neighbours(state, t)) {
        if (n.owner === owner && (n.struct === "vein" || n.struct === "stable" || n.struct === "nest")) anchors++;
      }
      if (anchors < 2) {
        events.push({ type: "veinPruned", at: { c: t.c, r: t.r }, owner });
        t.owner = null; t.struct = null; t.soldiers = 0; t.tunnel = false;
        changed = true;
      }
    }
  }
  return events;
}

export function pruneAllVeins(state: GameState, events: EngineEvent[] = []): EngineEvent[] {
  pruneVeins(state, "you", events);
  pruneVeins(state, "ai", events);
  return events;
}
