import { clearBoard, createGame, tile } from "../index";
import type { GameState, Player, SpeciesId, Structure, Terrain } from "../index";
import type { MapId } from "../config";

/** A blank board with no colonies placed, for precise rule tests. */
export function blankGame(map: MapId = "small", species: Record<Player, SpeciesId> = { you: "fire", ai: "fire" }): GameState {
  // The hive's terrain stays: most rule tests want the middle of the map to be what the
  // real map has there, and the ones that do not clear it themselves.
  //
  // AND THE PLAYER ALWAYS MOVES FIRST HERE. A live match flips a coin for it
  // (`startsFirst`), and `canActFrom` gates every action on whose turn it is — so a test
  // board left to the coin would refuse half its own moves depending on the map's default
  // seed, which is a landmine rather than a test.
  return clearBoard(createGame({ map, species, first: "you" }), true);
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
