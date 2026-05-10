import {
  GRID_SIZE, OWNER, KIND, TTYPE,
  HIVE_CENTER, HIVE_GUARDS,
  P1_NEST, P2_NEST, P1_CLUSTER, P2_CLUSTER, RESOURCE_TILES,
  START_SOLDIERS, VEIN_HP_CAP, VEIN_HEAL_AMT, VEIN_HEAL_THRESHOLD,
  PROD_EMPTY, PROD_RESOURCE,
  DEF_RESOURCE, DEF_NEST,
} from '../constants.js';

export class Grid {
  constructor() {
    this.tiles = [];
    this._init();
  }

  // ── Initialisation ──────────────────────────────────────────────────────────
  _init() {
    for (let r = 0; r < GRID_SIZE; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        this.tiles[r][c] = {
          col: c, row: r,
          owner: OWNER.NONE,
          kind:  KIND.NEUTRAL,
          ttype: TTYPE.EMPTY,
          soldiers:   0,
          veinHp:     0,
          veinMaxHp:  0,
          loose:      false,
          depleteAt:  0,   // turn number when resource depletes (0 = not tracking)
        };
      }
    }

    // Starting clusters
    for (const [c, r] of P1_CLUSTER) {
      this._makeStable(c, r, OWNER.P1, c === P1_NEST.col && r === P1_NEST.row ? TTYPE.NEST : TTYPE.EMPTY, START_SOLDIERS);
    }
    for (const [c, r] of P2_CLUSTER) {
      this._makeStable(c, r, OWNER.P2, c === P2_NEST.col && r === P2_NEST.row ? TTYPE.NEST : TTYPE.EMPTY, START_SOLDIERS);
    }

    // Resource tiles
    for (const [c, r] of RESOURCE_TILES) {
      const t = this.tiles[r][c];
      t.ttype = TTYPE.RESOURCE;
    }

    // Hive (dormant — high defenders, effectively impassable early game)
    this._makeHive(HIVE_CENTER.col, HIVE_CENTER.row, TTYPE.HIVE_QUEEN, 25);
    for (const g of HIVE_GUARDS) {
      this._makeHive(g.col, g.row, TTYPE.HIVE_GUARD, 15);
    }
  }

  _makeStable(c, r, owner, ttype, soldiers) {
    const t    = this.tiles[r][c];
    t.owner    = owner;
    t.kind     = KIND.STABLE;
    t.ttype    = ttype;
    t.soldiers = soldiers;
  }

  _makeHive(c, r, ttype, soldiers) {
    const t    = this.tiles[r][c];
    t.owner    = OWNER.HIVE;
    t.kind     = KIND.STABLE;  // Hive tiles act as stable (can be attacked directly)
    t.ttype    = ttype;
    t.soldiers = soldiers;
  }

  // ── Tile accessors ──────────────────────────────────────────────────────────
  get(col, row) {
    if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return null;
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

  stablesByOwner(owner) {
    const out = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = this.tiles[r][c];
        if (t.owner === owner && t.kind === KIND.STABLE) out.push(t);
      }
    return out;
  }

  veinsByOwner(owner) {
    const out = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = this.tiles[r][c];
        if (t.owner === owner && t.kind === KIND.VEIN) out.push(t);
      }
    return out;
  }

  totalSoldiers(owner) {
    return this.stablesByOwner(owner).reduce((s, t) => s + t.soldiers, 0);
  }

  // ── Pathfinding ─────────────────────────────────────────────────────────────
  /** BFS shortest path from (fc,fr) to (tc,tr) through neutral/own tiles.
   *  Returns array of tiles [from, ...intermediates, to] or null. */
  findPath(fc, fr, tc, tr, owner) {
    const start = this.get(fc, fr);
    const end   = this.get(tc, tr);
    if (!start || !end) return null;

    const visited = new Map();
    const queue   = [start];
    visited.set(`${fc},${fr}`, null);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.col === tc && curr.row === tr) {
        // Reconstruct path
        const path = [];
        let node = curr;
        while (node) { path.unshift(node); node = visited.get(`${node.col},${node.row}`); }
        return path;
      }
      for (const nbr of this.neighbors(curr.col, curr.row)) {
        const key = `${nbr.col},${nbr.row}`;
        if (visited.has(key)) continue;
        // Can traverse neutral tiles or own tiles (not enemy, not Hive unless destination)
        const isEnemy = nbr.owner !== OWNER.NONE && nbr.owner !== owner && nbr.owner !== OWNER.HIVE;
        const isHive  = nbr.owner === OWNER.HIVE;
        if (isEnemy) continue;
        if (isHive && !(nbr.col === tc && nbr.row === tr)) continue;
        visited.set(key, curr);
        queue.push(nbr);
      }
    }
    return null;
  }

  // ── Connectivity ────────────────────────────────────────────────────────────
  /** Mark loose=true on stable tiles disconnected from the owner's nest. */
  recomputeConnectivity(owner) {
    const nestPos  = owner === OWNER.P1 ? P1_NEST : P2_NEST;
    const nestTile = this.get(nestPos.col, nestPos.row);
    const reachable = new Set();

    if (!nestTile || nestTile.owner !== owner) {
      // Nest lost — all tiles loose
      for (const t of this.stablesByOwner(owner)) t.loose = true;
      return;
    }

    const queue = [nestTile];
    reachable.add(`${nestTile.col},${nestTile.row}`);

    while (queue.length > 0) {
      const curr = queue.shift();
      for (const nbr of this.neighbors(curr.col, curr.row)) {
        if (nbr.owner !== owner) continue;
        const key = `${nbr.col},${nbr.row}`;
        if (reachable.has(key)) continue;
        reachable.add(key);
        queue.push(nbr);
      }
    }

    for (const t of this.stablesByOwner(owner)) {
      t.loose = !reachable.has(`${t.col},${t.row}`);
    }
    for (const t of this.veinsByOwner(owner)) {
      t.loose = !reachable.has(`${t.col},${t.row}`);
    }
  }

  // ── Vein HP ─────────────────────────────────────────────────────────────────
  /** Find the stable-tile endpoints bounding the connected vein segment. */
  _veinSegmentEndpoints(veinTile) {
    const visited   = new Set([`${veinTile.col},${veinTile.row}`]);
    const queue     = [veinTile];
    const endpoints = [];

    while (queue.length > 0) {
      const curr = queue.shift();
      for (const nbr of this.neighbors(curr.col, curr.row)) {
        if (nbr.owner !== veinTile.owner) continue;
        const key = `${nbr.col},${nbr.row}`;
        if (nbr.kind === KIND.STABLE) {
          endpoints.push(nbr);
        } else if (nbr.kind === KIND.VEIN && !visited.has(key)) {
          visited.add(key);
          queue.push(nbr);
        }
      }
    }
    return endpoints;
  }

  recalcVeinHp(owner) {
    for (const t of this.veinsByOwner(owner)) {
      const eps = this._veinSegmentEndpoints(t);
      const sum = eps.reduce((s, e) => s + e.soldiers, 0);
      const div = Math.max(1, eps.length);
      t.veinMaxHp = Math.min(VEIN_HP_CAP, Math.max(1, Math.floor(sum / div)));
      t.veinHp    = Math.min(t.veinHp, t.veinMaxHp);
    }
  }

  veinHeal(owner) {
    for (const t of this.veinsByOwner(owner)) {
      if (t.veinHp >= t.veinMaxHp) continue;
      const eps    = this._veinSegmentEndpoints(t);
      const canHeal = eps.some(e => e.soldiers >= VEIN_HEAL_THRESHOLD);
      if (canHeal) t.veinHp = Math.min(t.veinMaxHp, t.veinHp + VEIN_HEAL_AMT);
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /** Convert a neutral tile to a vein belonging to owner. */
  makeVein(tile, owner) {
    tile.owner    = owner;
    tile.kind     = KIND.VEIN;
    tile.soldiers = 0;
    tile.veinHp   = 1;
    tile.veinMaxHp = 1;
  }

  /** Convert a vein or neutral tile to a stable tile. */
  makeStable(tile, owner, ttype, soldiers) {
    tile.owner    = owner;
    tile.kind     = KIND.STABLE;
    tile.ttype    = ttype;
    tile.soldiers = soldiers;
    tile.veinHp   = 0;
    tile.veinMaxHp = 0;
    tile.loose    = false;
  }

  /** Destroy a vein tile (becomes neutral). */
  destroyVein(tile) {
    tile.owner    = OWNER.NONE;
    tile.kind     = KIND.NEUTRAL;
    tile.soldiers = 0;
    tile.veinHp   = 0;
    tile.veinMaxHp = 0;
  }

  /** Tile defense bonus for stable combat. */
  static defBonus(tile, captureCount = 0) {
    if (tile.ttype === TTYPE.NEST)       return DEF_NEST;
    if (tile.ttype === TTYPE.RESOURCE)   return DEF_RESOURCE;
    if (tile.ttype === TTYPE.HIVE_QUEEN) return 12 + captureCount * 6;
    if (tile.ttype === TTYPE.HIVE_GUARD) return  6 + captureCount * 4;
    return 0;
  }

  // ── Production ───────────────────────────────────────────────────────────────
  production(owner, buffActive) {
    for (const t of this.stablesByOwner(owner)) {
      if (t.ttype === TTYPE.HIVE_GUARD || t.ttype === TTYPE.HIVE_QUEEN) continue;
      let gen = t.ttype === TTYPE.RESOURCE ? PROD_RESOURCE : PROD_EMPTY;
      if (buffActive) gen *= 2;
      t.soldiers = Math.min(t.soldiers + gen, 99);
    }
  }
}
