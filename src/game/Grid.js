import {
  GRID_COLS, GRID_ROWS,
  OWNER, TILE_TYPE,
  HIVE_QUEEN, HIVE_GUARDS,
  PLAYER_NEST, AI_NEST,
} from '../constants.js';

export class Grid {
  constructor() {
    this.tiles = [];
    this._init();
  }

  _init() {
    for (let r = 0; r < GRID_ROWS; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        this.tiles[r][c] = { col: c, row: r, type: TILE_TYPE.EMPTY, owner: OWNER.NONE, soldiers: 0 };
      }
    }

    // ── Hive cluster ─────────────────────────────────────────────────────────
    this._set(HIVE_QUEEN.col,  HIVE_QUEEN.row,  TILE_TYPE.HIVE_QUEEN, OWNER.HIVE, 25);
    for (const g of HIVE_GUARDS) {
      this._set(g.col, g.row, TILE_TYPE.HIVE_GUARD, OWNER.HIVE, 15);
    }

    // ── Player nest + starting territory ─────────────────────────────────────
    this._set(PLAYER_NEST.col, PLAYER_NEST.row, TILE_TYPE.NEST, OWNER.PLAYER, 10);
    for (const [c, r] of [[1,10],[2,10],[1,11],[3,11],[1,12],[2,12]]) {
      this._set(c, r, TILE_TYPE.EMPTY, OWNER.PLAYER, 3);
    }

    // ── AI nest + starting territory ─────────────────────────────────────────
    this._set(AI_NEST.col, AI_NEST.row, TILE_TYPE.NEST, OWNER.AI, 10);
    for (const [c, r] of [[19,2],[18,2],[19,1],[17,1],[19,0],[18,0]]) {
      this._set(c, r, TILE_TYPE.EMPTY, OWNER.AI, 3);
    }

    // ── Resource tiles (3 symmetric pairs) ───────────────────────────────────
    //   close to spawns:   (4,9) ↔ (16,3)
    //   mid-zone:          (3,4) ↔ (17,8)
    //   near-spawn flank:  (7,11) ↔ (13,1)
    for (const [c, r] of [[4,9],[16,3],[3,4],[17,8],[7,11],[13,1]]) {
      this._set(c, r, TILE_TYPE.RESOURCE, OWNER.NONE, 0);
    }
  }

  _set(col, row, type, owner, soldiers) {
    const t    = this.tiles[row][col];
    t.type     = type;
    t.owner    = owner;
    t.soldiers = soldiers;
  }

  get(col, row) {
    if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return null;
    return this.tiles[row][col];
  }

  neighbors(col, row) {
    return [
      this.get(col - 1, row),
      this.get(col + 1, row),
      this.get(col, row - 1),
      this.get(col, row + 1),
    ].filter(Boolean);
  }

  isAdjacent(c1, r1, c2, r2) {
    return Math.abs(c1 - c2) + Math.abs(r1 - r2) === 1;
  }

  tilesByOwner(owner) {
    const out = [];
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++)
        if (this.tiles[r][c].owner === owner) out.push(this.tiles[r][c]);
    return out;
  }

  totalSoldiers(owner) {
    return this.tilesByOwner(owner).reduce((s, t) => s + t.soldiers, 0);
  }
}
