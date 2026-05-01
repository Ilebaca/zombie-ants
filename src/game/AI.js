import { OWNER, TILE_TYPE, HIVE_QUEEN, HIVE_GUARDS } from '../constants.js';

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function hiveDist(col, row) {
  return Math.abs(col - HIVE_QUEEN.col) + Math.abs(row - HIVE_QUEEN.row);
}

export class AI {
  constructor(grid) {
    this.grid = grid;
  }

  /**
   * Returns an array of action objects: { fromTile, toTile, force }
   * toTile.owner === OWNER.AI  → move
   * toTile.owner !== OWNER.AI  → attack
   */
  think(hiveState) {
    const actions = [];
    const myTiles = this.grid.tilesByOwner(OWNER.AI);
    shuffle(myTiles);

    let acts = 0;

    for (const tile of myTiles) {
      if (acts >= 3) break;
      if (tile.soldiers < 3) continue;

      const force    = tile.soldiers - 1;
      const nbrs     = this.grid.neighbors(tile.col, tile.row);

      // ── Priority 1: attack player tiles with clear advantage ───────────────
      const playerNbr = nbrs.find(n => {
        if (n.owner !== OWNER.PLAYER) return false;
        const def = n.soldiers + (n.type === TILE_TYPE.NEST ? 50 : n.type === TILE_TYPE.RESOURCE ? 5 : 0);
        // Attack non-nest with 60% force threshold; nest needs overwhelming force
        return n.type === TILE_TYPE.NEST
          ? force > def * 1.1
          : force > def * 0.65;
      });

      if (playerNbr) {
        actions.push({ fromTile: tile, toTile: playerNbr, force });
        acts++;
        continue;
      }

      // ── Priority 2: attack Hive guards/queen when active ───────────────────
      if (hiveState === 'ACTIVE') {
        const guardNbr = nbrs.find(n =>
          n.type === TILE_TYPE.HIVE_GUARD && n.owner === OWNER.HIVE && force > n.soldiers * 0.7,
        );
        if (guardNbr) {
          actions.push({ fromTile: tile, toTile: guardNbr, force });
          acts++;
          continue;
        }

        // Attack queen only when guards are cleared
        const queenNbr = nbrs.find(n => n.type === TILE_TYPE.HIVE_QUEEN && n.owner === OWNER.HIVE);
        if (queenNbr) {
          const guardsAlive = HIVE_GUARDS.some(g => {
            const gt = this.grid.get(g.col, g.row);
            return gt && gt.owner === OWNER.HIVE && gt.soldiers > 0;
          });
          if (!guardsAlive && force > queenNbr.soldiers * 0.7) {
            actions.push({ fromTile: tile, toTile: queenNbr, force });
            acts++;
            continue;
          }
        }
      }

      // ── Priority 3: expand into neutral tiles, preferring those closer to Hive
      const neutralNbrs = nbrs.filter(n =>
        n.owner === OWNER.NONE &&
        n.type !== TILE_TYPE.HIVE_GUARD &&
        n.type !== TILE_TYPE.HIVE_QUEEN,
      );
      if (neutralNbrs.length > 0) {
        neutralNbrs.sort((a, b) => hiveDist(a.col, a.row) - hiveDist(b.col, b.row));
        const expandTo = neutralNbrs[0];
        const moveForce = Math.floor(tile.soldiers * 0.6);
        if (moveForce > 0) {
          actions.push({ fromTile: tile, toTile: expandTo, force: moveForce });
          acts++;
          continue;
        }
      }
    }

    // ── Priority 4: funnel soldiers toward front when no combat available ─────
    if (acts === 0) {
      for (const tile of myTiles) {
        if (tile.soldiers < 6) continue;
        const nbrs    = this.grid.neighbors(tile.col, tile.row);
        const allMine = nbrs.every(n => n.owner === OWNER.AI);
        if (!allMine) continue;  // already on front line
        // Find the neighbor closest to Hive centre
        const myNbrs = nbrs.filter(n => n.owner === OWNER.AI);
        if (myNbrs.length === 0) continue;
        myNbrs.sort((a, b) => hiveDist(a.col, a.row) - hiveDist(b.col, b.row));
        const dest = myNbrs[0];
        if (hiveDist(dest.col, dest.row) < hiveDist(tile.col, tile.row)) {
          actions.push({ fromTile: tile, toTile: dest, force: Math.floor(tile.soldiers * 0.7) });
          break;
        }
      }
    }

    return actions;
  }
}
