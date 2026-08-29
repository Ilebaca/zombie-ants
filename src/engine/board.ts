import type { Coord, Direction, GameState, Grid, Player, Tile } from "./types";

export function inBounds(state: GameState, c: number, r: number): boolean {
  return c >= 0 && r >= 0 && c < state.size && r < state.size;
}

/** Tile at (c,r), or undefined off-grid. Index access is checked (`noUncheckedIndexedAccess`). */
export function tileAt(state: GameState, c: number, r: number): Tile | undefined {
  return state.grid[r]?.[c];
}

/** Tile at (c,r); throws if off-grid. Use when the caller already knows it is valid. */
export function tile(state: GameState, c: number, r: number): Tile {
  const t = tileAt(state, c, r);
  if (!t) throw new Error(`tile out of bounds: ${c},${r}`);
  return t;
}

/** Orthogonal neighbours only — the game has no diagonal movement. */
/** Hoisted: `neighbours` runs in the AI's inner search loop, so it allocates one array
 *  per call rather than two. */
const DELTAS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * A tile loses everything it was holding: no owner, no structure, no garrison, no gallery.
 *
 * ONE function, for the same reason `strike` is one (CLAUDE.md §4.4): "razed" is a rule
 * about what survives, and it was written out by hand at each of the three places that
 * raze a tile — a venom hit, a burnt vein, and a pruned trail. Three copies of a rule are
 * three chances for one of them to keep a stale gallery flag.
 *
 * TERRAIN is not touched. Ground, a gem seam or a hive square outlive whoever held them —
 * the hive's terrain outliving its ownership is the single most expensive lesson in this
 * codebase (§5a).
 */
export function razeTile(t: Tile): void {
  t.owner = null;
  t.struct = null;
  t.soldiers = 0;
  t.tunnel = false;
}

export function neighbours(state: GameState, t: Tile): Tile[] {
  const out: Tile[] = [];
  for (const [dc, dr] of DELTAS) {
    const n = tileAt(state, t.c + dc, t.r + dr);
    if (n) out.push(n);
  }
  return out;
}

/** Manhattan distance — movement is orthogonal, so this is true path length on open ground. */
export function distance(a: Coord, b: Coord): number {
  return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}

export function directionFromTo(from: Coord, to: Coord): Direction {
  if (to.c > from.c) return "R";
  if (to.c < from.c) return "L";
  if (to.r > from.r) return "D";
  return "U";
}

export function forEachTile(state: GameState, fn: (t: Tile) => void): void {
  for (const row of state.grid) for (const t of row) fn(t);
}

export function allTiles(state: GameState): Tile[] {
  const out: Tile[] = [];
  forEachTile(state, (t) => out.push(t));
  return out;
}

export function tilesOwnedBy(state: GameState, p: Player): Tile[] {
  return allTiles(state).filter((t) => t.owner === p);
}

export function ownedCount(state: GameState, p: Player): number {
  return tilesOwnedBy(state, p).length;
}

/** Total soldiers a player has on the board, including detached tiles. */
export function armyOf(state: GameState, p: Player): number {
  return tilesOwnedBy(state, p).reduce((n, t) => n + t.soldiers, 0);
}

/** The player's queen tile, or null if it has fallen. */
export function nestTile(state: GameState, p: Player): Tile | null {
  return allTiles(state).find((t) => t.owner === p && t.struct === "nest") ?? null;
}

export function isHiveTerrain(t: Tile): boolean {
  return t.terrain === "hiveQ" || t.terrain === "hiveG";
}

export const otherPlayer = (p: Player): Player => (p === "you" ? "ai" : "you");

/** Empty grid of plain ground. Map generators carve terrain into this. */
export function makeGrid(size: number): Grid {
  const grid: Grid = [];
  for (let r = 0; r < size; r++) {
    const row: Tile[] = [];
    for (let c = 0; c < size; c++) {
      row.push({
        c, r, terrain: "ground", owner: null, struct: null,
        soldiers: 0, guard: 0, tunnel: false, hidden: false, prodAcc: 0,
      });
    }
    grid.push(row);
  }
  return grid;
}
