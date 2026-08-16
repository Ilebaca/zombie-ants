import { createGame, recomputeConnectivity, tile } from "../index";
import type { GameState, Player, SpeciesId, Structure, Terrain } from "../index";
import type { MapId } from "../config";

/** A blank board with no colonies placed, for precise rule tests. */
export function blankGame(map: MapId = "mid", species: Record<Player, SpeciesId> = { you: "fire", ai: "fire" }): GameState {
  const state = createGame({ map, species });
  for (const row of state.grid) {
    for (const t of row) {
      t.owner = null; t.struct = null; t.soldiers = 0; t.guard = 0; t.tunnel = false; t.prodAcc = 0;
      if (t.terrain !== "hiveQ" && t.terrain !== "hiveG") t.terrain = "ground";
    }
  }
  state.effects = [];
  recomputeConnectivity(state);
  return state;
}

export interface PlaceOpts {
  owner?: Player | null;
  struct?: Structure;
  soldiers?: number;
  terrain?: Terrain;
  guard?: number;
  tunnel?: boolean;
}

/** Put a tile in a precise state. Returns the tile. */
export function put(state: GameState, c: number, r: number, o: PlaceOpts) {
  const t = tile(state, c, r);
  if (o.terrain !== undefined) t.terrain = o.terrain;
  if (o.owner !== undefined) t.owner = o.owner;
  if (o.struct !== undefined) t.struct = o.struct;
  if (o.soldiers !== undefined) t.soldiers = o.soldiers;
  if (o.guard !== undefined) t.guard = o.guard;
  if (o.tunnel !== undefined) t.tunnel = o.tunnel;
  return t;
}

/** Corner coordinates well away from the central hive, so tests don't hit it by accident. */
export const CORNER = { c: 1, r: 1 };
