import { OWNER, KIND, TTYPE, HIVE_CENTER, HIVE_GUARDS, SPECIES } from '../constants.js';
import { stableCombat, veinDamage } from './Combat.js';
import { Grid } from './Grid.js';

function hiveDist(col, row) {
  return Math.abs(col - HIVE_CENTER.col) + Math.abs(row - HIVE_CENTER.row);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * All actions returned as plain objects:
 *   { type: 'EXPAND',       from, to, soldiers }
 *   { type: 'LONG_RANGE',   from, path, soldiers }  path = [from,...veins,to]
 *   { type: 'ATTACK_VEIN',  from, vein, soldiers }
 *   { type: 'PROMOTE_VEIN', vein, from, soldiers }
 *   { type: 'HOLD' }
 */
export class AI {
  constructor(owner, grid) {
    this.owner    = owner;
    this.grid     = grid;
    this.enemy    = owner === OWNER.P1 ? OWNER.P2 : OWNER.P1;
    this.spec     = owner === OWNER.P1 ? SPECIES.P1 : SPECIES.P2;
    this.eSpec    = owner === OWNER.P1 ? SPECIES.P2 : SPECIES.P1;
    this.turnsSinceLongRange = 0;
    // Army Ant bivouac: every 4 turns a free second action
    this.bivouacCooldown = 0;
  }

  /** Returns one action object. captureCount = Hive capture count so far. */
  think({ turnCount, hiveActive, captureCount, hiveBuff }) {
    this.turnsSinceLongRange++;
    if (this.bivouacCooldown > 0) this.bivouacCooldown--;

    const myStables = shuffle(
      this.grid.stablesByOwner(this.owner).filter(t => !t.loose && t.soldiers > 1)
    );

    // ── 1. Hive guard attack (if Hive is active and we're adjacent) ────────────
    if (hiveActive) {
      const guardAction = this._attackHiveGuard(myStables, captureCount);
      if (guardAction) return guardAction;
      const queenAction = this._attackHiveQueen(myStables, captureCount);
      if (queenAction) return queenAction;
    }

    // ── 2. Attack enemy stable with clear advantage (A > D × 1.3) ─────────────
    const attackAction = this._attackEnemyStable(myStables, captureCount);
    if (attackAction) return attackAction;

    // ── 3. Destroy adjacent enemy vein ────────────────────────────────────────
    const veinAction = this._destroyEnemyVein(myStables);
    if (veinAction) return veinAction;

    // ── 4. Expand to adjacent resource tile ───────────────────────────────────
    const resAction = this._expandToResource(myStables);
    if (resAction) return resAction;

    // ── 5. Long-range forward base (every ~5 turns if conditions met) ─────────
    if (this.turnsSinceLongRange >= 5) {
      const lrAction = this._longRangeForward(myStables);
      if (lrAction) { this.turnsSinceLongRange = 0; return lrAction; }
    }

    // ── 6. Expand to nearest neutral tile (toward Hive) ───────────────────────
    const expandAction = this._expandNeutral(myStables);
    if (expandAction) return expandAction;

    // ── 7. Promote vein on resource tile ──────────────────────────────────────
    const promoteAction = this._promoteResourceVein();
    if (promoteAction) return promoteAction;

    return { type: 'HOLD' };
  }

  _attackHiveGuard(myStables, captureCount) {
    for (const src of myStables) {
      for (const nbr of this.grid.neighbors(src.col, src.row)) {
        if (nbr.ttype !== TTYPE.HIVE_GUARD || nbr.owner !== OWNER.HIVE) continue;
        const sent = src.soldiers - 1;
        const bonus = Grid.defBonus(nbr, captureCount);
        const res = stableCombat(sent, nbr.soldiers, this.spec.atk, 1.0, bonus);
        if (res.attackerWins) {
          return { type: 'EXPAND', from: src, to: nbr, soldiers: sent };
        }
        // Still attack if we can deal meaningful damage without losing all attackers
        if (src.soldiers >= 8 && sent > nbr.soldiers + bonus * 0.5) {
          return { type: 'EXPAND', from: src, to: nbr, soldiers: sent };
        }
      }
    }
    return null;
  }

  _attackHiveQueen(myStables, captureCount) {
    const guardsAlive = HIVE_GUARDS.some(g => {
      const t = this.grid.get(g.col, g.row);
      return t && t.owner === OWNER.HIVE && t.soldiers > 0;
    });
    if (guardsAlive) return null;

    for (const src of myStables) {
      for (const nbr of this.grid.neighbors(src.col, src.row)) {
        if (nbr.ttype !== TTYPE.HIVE_QUEEN || nbr.owner !== OWNER.HIVE) continue;
        const sent = src.soldiers - 1;
        const bonus = Grid.defBonus(nbr, captureCount);
        const res = stableCombat(sent, nbr.soldiers, this.spec.atk, 1.0, bonus);
        if (res.attackerWins) {
          return { type: 'EXPAND', from: src, to: nbr, soldiers: sent };
        }
      }
    }
    return null;
  }

  _attackEnemyStable(myStables, captureCount) {
    let best = null;
    let bestScore = -Infinity;

    for (const src of myStables) {
      for (const nbr of this.grid.neighbors(src.col, src.row)) {
        if (nbr.owner !== this.enemy || nbr.kind !== KIND.STABLE) continue;
        const sent  = src.soldiers - 1;
        const bonus = Grid.defBonus(nbr, captureCount);
        const A     = sent  * this.spec.atk;
        const D     = nbr.soldiers * this.eSpec.def + bonus;
        if (A <= D * 1.2) continue;  // need solid advantage
        // Score: prefer weakly defended tiles, especially resource/nest
        const score = A / (D + 1) + (nbr.ttype === TTYPE.RESOURCE ? 5 : 0)
                    + (nbr.ttype === TTYPE.NEST ? 20 : 0);
        if (score > bestScore) { bestScore = score; best = { type: 'EXPAND', from: src, to: nbr, soldiers: sent }; }
      }
    }
    return best;
  }

  _destroyEnemyVein(myStables) {
    for (const src of myStables) {
      for (const nbr of this.grid.neighbors(src.col, src.row)) {
        if (nbr.owner !== this.enemy || nbr.kind !== KIND.VEIN) continue;
        const sent   = src.soldiers - 1;
        const dmg    = veinDamage(sent, this.spec.atk);
        if (dmg >= nbr.veinHp) {
          return { type: 'ATTACK_VEIN', from: src, vein: nbr, soldiers: sent };
        }
        // Even partial damage is worthwhile if it's a multi-turn chip
        if (dmg >= Math.ceil(nbr.veinHp * 0.6) && sent >= 4) {
          return { type: 'ATTACK_VEIN', from: src, vein: nbr, soldiers: Math.ceil(sent * 0.7) };
        }
      }
    }
    return null;
  }

  _expandToResource(myStables) {
    let best = null;
    let bestDist = Infinity;

    for (const src of myStables) {
      for (const nbr of this.grid.neighbors(src.col, src.row)) {
        if (nbr.kind !== KIND.NEUTRAL || nbr.ttype !== TTYPE.RESOURCE) continue;
        const cost = Grid.defBonus(nbr, 0) + 1; // +DEF_RESOURCE for neutral resource
        if (src.soldiers <= cost) continue;
        const d = hiveDist(nbr.col, nbr.row);
        if (d < bestDist) { bestDist = d; best = { type: 'EXPAND', from: src, to: nbr, soldiers: cost + 2 }; }
      }
    }
    return best;
  }

  _longRangeForward(myStables) {
    // Find a neutral tile near the Hive that we don't yet control, reachable by path
    const targets = [];
    for (let r = 0; r < 13; r++)
      for (let c = 0; c < 13; c++) {
        const t = this.grid.tiles[r][c];
        if (t.owner !== OWNER.NONE) continue;
        const d = hiveDist(c, r);
        if (d < 4) targets.push({ t, d });
      }
    targets.sort((a, b) => a.d - b.d);

    for (const { t: dest } of targets.slice(0, 8)) {
      for (const src of myStables) {
        if (this.grid.isAdjacent(src.col, src.row, dest.col, dest.row)) continue; // use EXPAND instead
        const path = this.grid.findPath(src.col, src.row, dest.col, dest.row, this.owner);
        if (!path || path.length < 3) continue;

        // Count new vein tiles (neutral tiles in the path, not counting src)
        const veinTiles = path.slice(1, -1).filter(p => p.owner === OWNER.NONE);
        const veinCost  = veinTiles.length;  // 1 soldier per vein tile
        const destTile  = path[path.length - 1];
        const atk       = src.soldiers - 1 - veinCost;
        if (atk < 1) continue;

        const bonus = Grid.defBonus(destTile, 0);
        const res   = stableCombat(atk, destTile.soldiers, this.spec.atk, 1.0, bonus);
        if (!res.attackerWins && destTile.soldiers > 0) continue;
        if (src.soldiers < veinCost + 3) continue;

        return { type: 'LONG_RANGE', from: src, path, soldiers: src.soldiers - 1 };
      }
    }
    return null;
  }

  _expandNeutral(myStables) {
    // Pick the expansion tile closest to the Hive that we can reach
    let best = null;
    let bestDist = Infinity;

    for (const src of myStables) {
      for (const nbr of this.grid.neighbors(src.col, src.row)) {
        if (nbr.owner !== OWNER.NONE) continue;
        if (nbr.ttype === TTYPE.HIVE_GUARD || nbr.ttype === TTYPE.HIVE_QUEEN) continue;
        const d = hiveDist(nbr.col, nbr.row);
        if (d < bestDist) {
          bestDist = d;
          const send = Math.max(2, Math.ceil(src.soldiers * 0.55));
          best = { type: 'EXPAND', from: src, to: nbr, soldiers: Math.min(send, src.soldiers - 1) };
        }
      }
    }
    return best;
  }

  _promoteResourceVein() {
    for (const v of this.grid.veinsByOwner(this.owner)) {
      if (v.ttype !== TTYPE.RESOURCE) continue;
      const eps = this.grid._veinSegmentEndpoints(v);
      const src = eps.find(e => e.soldiers >= 5);
      if (!src) continue;
      return { type: 'PROMOTE_VEIN', vein: v, from: src, soldiers: 3 };
    }
    return null;
  }
}
