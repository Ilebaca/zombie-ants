import Phaser from 'phaser';
import { Grid }          from '../game/Grid.js';
import { AI }            from '../game/AI.js';
import { stableCombat, veinDamage } from '../game/Combat.js';
import {
  CANVAS_W, CANVAS_H,
  GRID_SIZE, GRID_LEFT, GRID_TOP, TILE_SIZE, TILE_STRIDE,
  PANEL_X, PANEL_W,
  OWNER, KIND, TTYPE,
  HIVE_CENTER, HIVE_GUARDS,
  P1_NEST, P2_NEST,
  SPECIES, SPEEDS,
  HIVE_AWAKEN_TURN, HIVE_BUFF_TURNS, HIVE_REDORMANT,
  RESOURCE_DEPLETE,
  HIVE_COL_DORMANT, HIVE_COL_ACTIVE, HIVE_COL_BUFF,
  PROD_EMPTY, PROD_RESOURCE,
} from '../constants.js';

const HEX = (n) => '#' + n.toString(16).padStart(6, '0');
const HS  = Object.freeze({ DORMANT: 'DORMANT', ACTIVE: 'ACTIVE', BUFF_P1: 'BUFF_P1', BUFF_P2: 'BUFF_P2', RESPAWNING: 'RESPAWNING' });

export class SpectatorScene extends Phaser.Scene {
  constructor() { super({ key: 'SpectatorScene' }); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  create() {
    this.grid = new Grid();
    this.ai1  = new AI(OWNER.P1, this.grid);
    this.ai2  = new AI(OWNER.P2, this.grid);

    // Turn state
    this.totalTurns   = 0;      // each individual player turn
    this.activeOwner  = OWNER.P1;
    this.gameOver     = false;
    this.winner       = null;

    // Hive state
    this.hiveState      = HS.DORMANT;
    this.hiveAwakenTurn = HIVE_AWAKEN_TURN;
    this.hiveBuff       = 0;    // buff turns remaining (in the captor's turns)
    this.hiveCaptureCount = 0;
    this.p1Buff = false;
    this.p2Buff = false;

    // Speed / step
    this.currentSpeed = SPEEDS.NORMAL;
    this.stepMode     = false;
    this.stepPending  = false;
    this.turnTimer    = this.currentSpeed;

    // Resource depletion tracking
    this.resourceOwnerTurns = new Map(); // key:`${c},${r}` → turns held

    // Action log
    this.log = [];

    this._buildBackground();
    this._buildTileViews();
    this._buildHUD();
    this._buildPanel();

    this._redrawAll();
    this._updatePanel();

    // Keyboard shortcuts
    this.input.keyboard.on('keydown-SPACE', () => this._stepPressed());
    this.input.keyboard.on('keydown-R',     () => this.scene.restart());
  }

  update(time, delta) {
    if (this.gameOver) return;
    if (this.stepMode) {
      if (this.stepPending) { this.stepPending = false; this._runTurn(); }
      return;
    }
    this.turnTimer -= delta;
    if (this.turnTimer <= 0) {
      this.turnTimer = this.currentSpeed;
      this._runTurn();
    }
  }

  // ── Core turn ─────────────────────────────────────────────────────────────
  _runTurn() {
    const owner  = this.activeOwner;
    const spec   = owner === OWNER.P1 ? SPECIES.P1 : SPECIES.P2;
    const isP1Buff = owner === OWNER.P1 && this.p1Buff;
    const isP2Buff = owner === OWNER.P2 && this.p2Buff;
    const buffActive = isP1Buff || isP2Buff;

    // 1. Production
    this.grid.production(owner, buffActive);

    // 2. Vein heal
    this.grid.veinHeal(owner);

    // 3. Connectivity + vein HP
    this.grid.recomputeConnectivity(owner);
    this.grid.recalcVeinHp(owner);

    // 4. Hive tick (check awakening / buff countdown)
    this._tickHive(owner);

    // 5. Resource depletion tick
    this._tickResources(owner);

    // 6. AI decision
    const action = (owner === OWNER.P1 ? this.ai1 : this.ai2).think({
      turnCount: this.totalTurns,
      hiveActive: this.hiveState === HS.ACTIVE,
      captureCount: this.hiveCaptureCount,
      hiveBuff: buffActive,
    });

    // 7. Execute
    const logEntry = this._execute(action, owner, spec);

    // 8. Recompute full connectivity for both owners
    this.grid.recomputeConnectivity(OWNER.P1);
    this.grid.recomputeConnectivity(OWNER.P2);
    this.grid.recalcVeinHp(OWNER.P1);
    this.grid.recalcVeinHp(OWNER.P2);

    // 9. Fire Ant swarm response
    if (owner === OWNER.P1 && action.type === 'EXPAND') this._swarmResponse(action, OWNER.P2);
    if (owner === OWNER.P2 && action.type === 'EXPAND') this._swarmResponse(action, OWNER.P1);

    // 10. Log
    this.totalTurns++;
    this._addLog(`T${this.totalTurns} ${owner === OWNER.P1 ? '🟠P1' : '🔵P2'} ${logEntry}`);

    // 11. Switch player
    this.activeOwner = owner === OWNER.P1 ? OWNER.P2 : OWNER.P1;

    // 12. Check win
    this._checkWin();

    // 13. Update visuals
    this._redrawAll();
    this._updatePanel();
  }

  // ── Execute action ─────────────────────────────────────────────────────────
  _execute(action, owner, spec) {
    const enemy = owner === OWNER.P1 ? OWNER.P2 : OWNER.P1;
    const eSpec = owner === OWNER.P1 ? SPECIES.P2 : SPECIES.P1;

    switch (action.type) {

      case 'EXPAND': {
        const { from: src, to: dest, soldiers: sent } = action;
        if (!src || !dest) return 'EXPAND (invalid)';
        const actual = Math.min(sent, src.soldiers - 1);
        if (actual <= 0) return 'EXPAND (no soldiers)';

        if (dest.owner === OWNER.NONE && dest.kind === KIND.NEUTRAL) {
          // Unclaimed neutral — free capture
          src.soldiers -= actual;
          this.grid.makeStable(dest, owner, dest.ttype, actual);
          this._flash(dest, spec.color);
          return `Expand → (${dest.col},${dest.row}) [${dest.ttype === TTYPE.RESOURCE ? '+resource' : 'empty'}]`;
        }

        // Combat
        const bonus = Grid.defBonus(dest, this.hiveCaptureCount);
        const res   = stableCombat(actual, dest.soldiers, spec.atk, eSpec.def, bonus);
        src.soldiers -= actual;

        if (res.attackerWins) {
          const prevOwner = dest.owner;
          const prevType  = dest.ttype;
          this.grid.makeStable(dest, owner, dest.ttype, res.attackerSurvivors);
          this._flash(dest, spec.color);

          if (dest.ttype === TTYPE.HIVE_QUEEN) {
            this._captureHive(owner);
            return `HIVE QUEEN CAPTURED! Buff starts.`;
          }
          return `Expand → (${dest.col},${dest.row}) [${res.attackerSurvivors} surv, was ${prevOwner === OWNER.HIVE ? 'HIVE' : 'enemy'}]`;
        } else {
          dest.soldiers = res.defenderSurvivors;
          this._flash(dest, 0xff4444);
          return `Expand → (${dest.col},${dest.row}) FAILED (${res.defenderSurvivors} def left)`;
        }
      }

      case 'LONG_RANGE': {
        const { from: src, path, soldiers: totalSent } = action;
        if (!src || !path || path.length < 2) return 'LONG_RANGE (invalid)';
        const actual = Math.min(totalSent, src.soldiers - 1);

        // Count new vein tiles (neutral tiles not including src)
        const veinTiles  = path.slice(1, -1).filter(p => p.owner === OWNER.NONE);
        const destTile   = path[path.length - 1];
        const veinCost   = veinTiles.length;
        const attackSol  = Math.max(1, actual - veinCost);

        if (src.soldiers < veinCost + 2) return 'LONG_RANGE (too expensive)';

        src.soldiers -= actual;

        // Lay veins
        for (const vt of path.slice(1, -1)) {
          if (vt.owner === OWNER.NONE) this.grid.makeVein(vt, owner);
        }

        // Capture or attack destination
        if (destTile.owner === OWNER.NONE) {
          this.grid.makeStable(destTile, owner, destTile.ttype, attackSol);
          this._flash(destTile, spec.color);
          return `Long-range → (${destTile.col},${destTile.row}) via ${veinTiles.length} veins`;
        } else {
          const bonus = Grid.defBonus(destTile, this.hiveCaptureCount);
          const res   = stableCombat(attackSol, destTile.soldiers, spec.atk, eSpec.def, bonus);
          if (res.attackerWins) {
            this.grid.makeStable(destTile, owner, destTile.ttype, res.attackerSurvivors);
            this._flash(destTile, spec.color);
            return `Long-range → (${destTile.col},${destTile.row}) CAPTURED`;
          } else {
            destTile.soldiers = res.defenderSurvivors;
            this._flash(destTile, 0xff4444);
            return `Long-range → (${destTile.col},${destTile.row}) FAILED`;
          }
        }
      }

      case 'ATTACK_VEIN': {
        const { from: src, vein, soldiers: sent } = action;
        if (!src || !vein) return 'ATTACK_VEIN (invalid)';
        const actual = Math.min(sent, src.soldiers - 1);
        const dmg    = veinDamage(actual, spec.atk);
        const prevHp = vein.veinHp;
        vein.veinHp  = Math.max(0, vein.veinHp - dmg);

        if (vein.veinHp <= 0) {
          this.grid.destroyVein(vein);
          this._flash(vein, 0xff8800);
          return `Vein attack (${vein.col},${vein.row}) HP ${prevHp}→0 DESTROYED`;
        }
        this._flash(vein, 0xffcc44);
        return `Vein attack (${vein.col},${vein.row}) HP ${prevHp}→${vein.veinHp}`;
      }

      case 'PROMOTE_VEIN': {
        const { vein, from: src, soldiers: cost } = action;
        if (!vein || !src) return 'PROMOTE_VEIN (invalid)';
        const actual = Math.max(3, Math.min(cost, src.soldiers - 1));
        src.soldiers -= actual;
        this.grid.makeStable(vein, owner, vein.ttype, actual);
        this._flash(vein, spec.color);
        return `Promote vein (${vein.col},${vein.row}) → stable [${vein.ttype === TTYPE.RESOURCE ? '+resource' : ''}]`;
      }

      default:
        return 'Hold';
    }
  }

  // ── Hive lifecycle ─────────────────────────────────────────────────────────
  _tickHive(owner) {
    if (this.hiveState === HS.DORMANT) {
      if (this.totalTurns >= this.hiveAwakenTurn) {
        this.hiveState = HS.ACTIVE;
        const scale = 1 + this.hiveCaptureCount * 0.5;
        const qTile  = this.grid.get(HIVE_CENTER.col, HIVE_CENTER.row);
        if (qTile) qTile.soldiers = Math.round(18 * scale);
        for (const g of HIVE_GUARDS) {
          const t = this.grid.get(g.col, g.row);
          if (t) t.soldiers = Math.round(10 * scale);
        }
        this._addLog(`—— HIVE AWAKENS (capture #${this.hiveCaptureCount + 1}) ——`);
      }
    }

    if (this.hiveState === HS.BUFF_P1 && owner === OWNER.P1) {
      this.hiveBuff--;
      if (this.hiveBuff <= 0) this._hiveBuffExpire();
    }
    if (this.hiveState === HS.BUFF_P2 && owner === OWNER.P2) {
      this.hiveBuff--;
      if (this.hiveBuff <= 0) this._hiveBuffExpire();
    }
  }

  _captureHive(owner) {
    this.hiveCaptureCount++;
    this.hiveState  = owner === OWNER.P1 ? HS.BUFF_P1 : HS.BUFF_P2;
    this.hiveBuff   = HIVE_BUFF_TURNS;
    this.p1Buff     = owner === OWNER.P1;
    this.p2Buff     = owner === OWNER.P2;

    const all = [HIVE_CENTER, ...HIVE_GUARDS];
    for (const pos of all) {
      const t = this.grid.get(pos.col, pos.row);
      if (t) { t.owner = owner; t.kind = KIND.STABLE; t.soldiers = 5; }
    }
  }

  _hiveBuffExpire() {
    this.p1Buff = false;
    this.p2Buff = false;
    const all = [HIVE_CENTER, ...HIVE_GUARDS];
    for (const pos of all) {
      const t = this.grid.get(pos.col, pos.row);
      if (!t) continue;
      t.owner    = OWNER.HIVE;
      t.kind     = KIND.STABLE;
      t.ttype    = pos === HIVE_CENTER ? TTYPE.HIVE_QUEEN : TTYPE.HIVE_GUARD;
      t.soldiers = 0;
    }
    this.hiveState       = HS.DORMANT;
    this.hiveAwakenTurn  = this.totalTurns + HIVE_REDORMANT;
    this._addLog(`—— HIVE BUFF EXPIRED — respawns in ${HIVE_REDORMANT} turns ——`);
  }

  // ── Species traits ─────────────────────────────────────────────────────────
  _swarmResponse(action, reactOwner) {
    // Fire Ant: if owner == reactOwner and their tile was attacked, adjacent get +2
    if (reactOwner === OWNER.P1 && SPECIES.P1.name !== 'Fire Ant') return;
    if (reactOwner === OWNER.P2 && SPECIES.P2.name !== 'Fire Ant') return;
    const dest = action.to;
    if (!dest || dest.owner !== reactOwner) return;  // attack failed on enemy tile — no trigger
    // Actually: the tile was just captured by the attacker; Fire Ant reactive surges are on the adjacent tiles
    // The reactive tile was the attacked one — its owner is now the attacker.
    // We check if the attacker just took one of reactOwner's tiles.
    // Adjacent tiles of the lost tile that still belong to reactOwner get +2
    for (const nbr of this.grid.neighbors(dest.col, dest.row)) {
      if (nbr.owner === reactOwner && nbr.kind === KIND.STABLE && !nbr.loose) {
        nbr.soldiers = Math.min(nbr.soldiers + 2, 99);
      }
    }
  }

  // ── Resource depletion ─────────────────────────────────────────────────────
  _tickResources(owner) {
    for (const t of this.grid.stablesByOwner(owner)) {
      if (t.ttype !== TTYPE.RESOURCE) continue;
      const key = `${t.col},${t.row}`;
      const prev = this.resourceOwnerTurns.get(key) ?? 0;
      const next = prev + 1;
      this.resourceOwnerTurns.set(key, next);
      if (next >= RESOURCE_DEPLETE) {
        t.ttype = TTYPE.EMPTY;
        this.resourceOwnerTurns.delete(key);
        this._addLog(`  (${t.col},${t.row}) resource depleted`);
        this._spawnNewResource(t.col, t.row);
      }
    }
    // Reset depletion counter for any resource that changed hands
    for (const [key] of this.resourceOwnerTurns) {
      const [c, r] = key.split(',').map(Number);
      const t = this.grid.get(c, r);
      // If tile no longer belongs to owner who was accumulating — reset
      if (!t || t.owner !== owner || t.ttype !== TTYPE.RESOURCE) {
        this.resourceOwnerTurns.delete(key);
      }
    }
  }

  _spawnNewResource(nearCol, nearRow) {
    // Find a neutral tile not near either nest to spawn a new resource
    const candidates = [];
    for (let r = 0; r < GRID_SIZE; r++)
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = this.grid.tiles[r][c];
        if (t.owner !== OWNER.NONE || t.kind !== KIND.NEUTRAL) continue;
        if (t.ttype === TTYPE.RESOURCE) continue;
        const d = Math.abs(c - nearCol) + Math.abs(r - nearRow);
        if (d > 3) candidates.push({ t, d });
      }
    if (candidates.length === 0) return;
    candidates.sort((a, b) => Math.abs(a.d - 6) - Math.abs(b.d - 6));
    candidates[0].t.ttype = TTYPE.RESOURCE;
  }

  // ── Win check ──────────────────────────────────────────────────────────────
  _checkWin() {
    const pNest = this.grid.get(P1_NEST.col, P1_NEST.row);
    const aNest = this.grid.get(P2_NEST.col, P2_NEST.row);
    if (pNest && pNest.owner === OWNER.P2) this._endGame(OWNER.P2);
    else if (aNest && aNest.owner === OWNER.P1) this._endGame(OWNER.P1);
  }

  _endGame(winner) {
    this.gameOver = true;
    this.winner   = winner;
    this._addLog(`══ ${winner === OWNER.P1 ? 'P1 (Fire Ant)' : 'P2 (Army Ant)'} WINS on turn ${this.totalTurns} ══`);
    this._redrawAll();
    this._updatePanel();
    this._showEndOverlay(winner);
  }

  // ── Visual construction ────────────────────────────────────────────────────
  _buildBackground() {
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x0a120a);
    // Grid border
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x1a2a1a, 0.5);
    for (let i = 0; i <= GRID_SIZE; i++) {
      const x = GRID_LEFT + i * TILE_STRIDE;
      const y = GRID_TOP  + i * TILE_STRIDE;
      gfx.lineBetween(x, GRID_TOP, x, GRID_TOP + GRID_SIZE * TILE_STRIDE);
      gfx.lineBetween(GRID_LEFT, y, GRID_LEFT + GRID_SIZE * TILE_STRIDE, y);
    }
  }

  _buildTileViews() {
    this.tileGfx    = this.add.graphics().setDepth(1);  // tile fills + vein lines
    this.tileTexts  = [];  // [row][col] Text

    for (let r = 0; r < GRID_SIZE; r++) {
      this.tileTexts[r] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const cx = GRID_LEFT + c * TILE_STRIDE + TILE_SIZE / 2;
        const cy = GRID_TOP  + r * TILE_STRIDE + TILE_SIZE / 2;
        this.tileTexts[r][c] = this.add.text(cx, cy, '', {
          fontSize: '11px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5).setDepth(3);
      }
    }

    this.flashGfx  = this.add.graphics().setDepth(5);
    this.flashItems = [];  // { gfx, alpha, color, x, y }
  }

  _buildHUD() {
    this.add.rectangle(CANVAS_W / 2, 28, CANVAS_W, 56, 0x060c06).setDepth(8);

    const s = { fontSize: '13px', fontFamily: 'monospace' };
    this.hudP1  = this.add.text(12, 10, '', { ...s, color: HEX(SPECIES.P1.color) }).setDepth(9);
    this.hudP1b = this.add.text(12, 30, '', { ...s, fontSize: '11px', color: '#ffcc22' }).setDepth(9);

    this.hudTurn = this.add.text(CANVAS_W / 2, 10, '', { ...s, color: '#aaaaaa' }).setOrigin(0.5, 0).setDepth(9);
    this.hudHive = this.add.text(CANVAS_W / 2, 30, '', { ...s, fontSize: '11px', color: HEX(HIVE_COL_ACTIVE) }).setOrigin(0.5, 0).setDepth(9);

    this.hudP2  = this.add.text(CANVAS_W - 12, 10, '', { ...s, color: HEX(SPECIES.P2.color) }).setOrigin(1, 0).setDepth(9);
    this.hudP2b = this.add.text(CANVAS_W - 12, 30, '', { ...s, fontSize: '11px', color: '#4488ff' }).setOrigin(1, 0).setDepth(9);

    // Bottom status bar
    this.add.rectangle(CANVAS_W / 2, CANVAS_H - 14, CANVAS_W, 28, 0x060c06).setDepth(8);
    this.hudBottom = this.add.text(CANVAS_W / 2, CANVAS_H - 14, '', {
      fontSize: '11px', fontFamily: 'monospace', color: '#555555',
    }).setOrigin(0.5).setDepth(9);
  }

  _buildPanel() {
    // Panel background
    this.add.rectangle(PANEL_X + PANEL_W / 2, CANVAS_H / 2, PANEL_W, CANVAS_H, 0x060e06).setDepth(7);
    this.add.graphics().setDepth(7).lineStyle(1, 0x1a2a1a).lineBetween(PANEL_X - 4, 0, PANEL_X - 4, CANVAS_H);

    const px = PANEL_X + 8;
    const s  = { fontFamily: 'monospace' };

    // Speed controls
    this.add.text(px, 58, 'SPEED', { ...s, fontSize: '10px', color: '#444', letterSpacing: 3 }).setDepth(9);

    const speeds = [
      ['TURBO', SPEEDS.TURBO], ['FAST', SPEEDS.FAST], ['NORMAL', SPEEDS.NORMAL], ['SLOW', SPEEDS.SLOW], ['STEP', SPEEDS.STEP],
    ];
    this.speedBtns = [];
    let bx = px;
    for (const [label, spd] of speeds) {
      const btn = this.add.text(bx, 72, label, {
        ...s, fontSize: '11px',
        color: spd === this.currentSpeed ? '#ffee44' : '#555555',
        backgroundColor: '#0d180d',
        padding: { x: 5, y: 3 },
      }).setInteractive().setDepth(9);
      btn.on('pointerdown', () => this._setSpeed(spd, btn));
      btn.on('pointerover', () => { if (this.currentSpeed !== spd) btn.setStyle({ color: '#aaaaaa' }); });
      btn.on('pointerout',  () => { if (this.currentSpeed !== spd) btn.setStyle({ color: '#555555' }); });
      this.speedBtns.push({ btn, spd });
      bx += btn.width + 6;
    }

    // Step button
    this.stepBtn = this.add.text(px, 96, '[SPACE] Step', {
      ...s, fontSize: '11px', color: '#555555', backgroundColor: '#0d180d', padding: { x: 5, y: 3 },
    }).setInteractive().setDepth(9);
    this.stepBtn.on('pointerdown', () => this._stepPressed());

    // Stats section
    this.add.text(px, 124, 'COLONY STATS', { ...s, fontSize: '10px', color: '#444', letterSpacing: 3 }).setDepth(9);

    const statsS = { ...s, fontSize: '12px' };
    this.statP1Label = this.add.text(px,       140, `${SPECIES.P1.name.toUpperCase()}`, { ...statsS, color: HEX(SPECIES.P1.color), fontStyle: 'bold' }).setDepth(9);
    this.statP2Label = this.add.text(px + 200, 140, `${SPECIES.P2.name.toUpperCase()}`, { ...statsS, color: HEX(SPECIES.P2.color), fontStyle: 'bold' }).setDepth(9);

    this.statLines = [];
    const rows = ['Stables', 'Soldiers', 'Resources', 'Veins', 'Loose'];
    for (let i = 0; i < rows.length; i++) {
      const y = 158 + i * 18;
      this.add.text(px, y, rows[i], { ...s, fontSize: '11px', color: '#444' }).setDepth(9);
      const t1 = this.add.text(px + 80,  y, '', { ...s, fontSize: '11px', color: HEX(SPECIES.P1.color) }).setDepth(9);
      const t2 = this.add.text(px + 200, y, '', { ...s, fontSize: '11px', color: HEX(SPECIES.P2.color) }).setDepth(9);
      this.statLines.push([t1, t2]);
    }

    // Hive section
    this.add.text(px, 258, 'HIVE', { ...s, fontSize: '10px', color: '#444', letterSpacing: 3 }).setDepth(9);
    this.hiveStatusText = this.add.text(px, 274, '', { ...s, fontSize: '11px', color: HEX(HIVE_COL_ACTIVE), wordWrap: { width: PANEL_W - 16 } }).setDepth(9);

    // Action log
    this.add.text(px, 316, 'ACTION LOG', { ...s, fontSize: '10px', color: '#444', letterSpacing: 3 }).setDepth(9);
    this.logTexts = [];
    for (let i = 0; i < 22; i++) {
      this.logTexts.push(
        this.add.text(px, 332 + i * 17, '', {
          ...s, fontSize: '11px', color: '#444444', wordWrap: { width: PANEL_W - 16 },
        }).setDepth(9)
      );
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  _redrawAll() {
    this.tileGfx.clear();
    this._drawTiles();
    this._drawVeinLines();
    this._updateTexts();
    this._processFlashes();
  }

  _tileColor(tile) {
    if (tile.kind === KIND.NEUTRAL) {
      return tile.ttype === TTYPE.RESOURCE ? 0x1a3a1a : 0x141414;
    }
    if (tile.kind === KIND.VEIN) {
      return tile.owner === OWNER.P1 ? SPECIES.P1.colorDim : SPECIES.P2.colorDim;
    }
    // STABLE
    if (tile.owner === OWNER.HIVE) {
      if (this.hiveState === HS.DORMANT || this.hiveState === HS.RESPAWNING) return HIVE_COL_DORMANT;
      if (this.hiveState === HS.ACTIVE)   return HIVE_COL_ACTIVE;
      return HIVE_COL_BUFF;
    }
    const sp = tile.owner === OWNER.P1 ? SPECIES.P1 : SPECIES.P2;
    if (tile.ttype === TTYPE.NEST) return sp.nestColor;
    return sp.color;
  }

  _drawTiles() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const t  = this.grid.tiles[r][c];
        const x  = GRID_LEFT + c * TILE_STRIDE;
        const y  = GRID_TOP  + r * TILE_STRIDE;
        const col = this._tileColor(t);

        if (t.kind === KIND.VEIN) {
          // Small square in center of cell
          const sz = 18;
          this.tileGfx.fillStyle(col, 0.85);
          this.tileGfx.fillRect(x + (TILE_SIZE - sz) / 2, y + (TILE_SIZE - sz) / 2, sz, sz);
          // Loose vein: dim further
          if (t.loose) {
            this.tileGfx.fillStyle(0x000000, 0.4);
            this.tileGfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          }
        } else if (t.kind === KIND.STABLE) {
          this.tileGfx.fillStyle(col, 1);
          this.tileGfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          // Loose overlay
          if (t.loose) {
            this.tileGfx.fillStyle(0x000000, 0.5);
            this.tileGfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            this.tileGfx.lineStyle(2, 0xff4400, 0.8);
            this.tileGfx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          }
          // Buff glow
          const buffing = (t.owner === OWNER.P1 && this.p1Buff) || (t.owner === OWNER.P2 && this.p2Buff);
          if (buffing) {
            this.tileGfx.lineStyle(2, 0xffdd22, 0.7);
            this.tileGfx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
          }
          // Active player border
          if (t.owner === this.activeOwner && t.ttype === TTYPE.NEST) {
            this.tileGfx.lineStyle(2, 0xffffff, 0.6);
            this.tileGfx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        }
        // Resource marker for neutral resource tiles
        if (t.kind === KIND.NEUTRAL && t.ttype === TTYPE.RESOURCE) {
          this.tileGfx.fillStyle(0x2a5a2a, 1);
          this.tileGfx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Hive cross outline
    if (this.hiveState === HS.ACTIVE) {
      this.tileGfx.lineStyle(2, HIVE_COL_ACTIVE, 0.6);
      const hx = GRID_LEFT + HIVE_CENTER.col * TILE_STRIDE;
      const hy = GRID_TOP  + HIVE_CENTER.row * TILE_STRIDE;
      this.tileGfx.strokeRect(hx - TILE_STRIDE, hy - TILE_STRIDE, TILE_SIZE * 3 + TILE_STRIDE, TILE_SIZE * 3 + TILE_STRIDE);
    }
  }

  _drawVeinLines() {
    for (let owner = 1; owner <= 2; owner++) {
      const sp = owner === OWNER.P1 ? SPECIES.P1 : SPECIES.P2;
      this.tileGfx.lineStyle(4, sp.color, 0.55);
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const t = this.grid.tiles[r][c];
          if (t.owner !== owner) continue;
          if (t.kind !== KIND.VEIN && t.kind !== KIND.STABLE) continue;
          const cx = GRID_LEFT + c * TILE_STRIDE + TILE_SIZE / 2;
          const cy = GRID_TOP  + r * TILE_STRIDE + TILE_SIZE / 2;
          for (const [dc, dr] of [[1, 0], [0, 1]]) {
            const n = this.grid.get(c + dc, r + dr);
            if (!n || n.owner !== owner) continue;
            if (n.kind !== KIND.VEIN && n.kind !== KIND.STABLE) continue;
            const nx = GRID_LEFT + n.col * TILE_STRIDE + TILE_SIZE / 2;
            const ny = GRID_TOP  + n.row * TILE_STRIDE + TILE_SIZE / 2;
            this.tileGfx.lineBetween(cx, cy, nx, ny);
          }
        }
      }
    }
  }

  _updateTexts() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = this.grid.tiles[r][c];
        const txt = this.tileTexts[r][c];
        if (t.kind === KIND.STABLE && t.soldiers > 0) {
          const icon = t.ttype === TTYPE.NEST ? '★' : t.ttype === TTYPE.RESOURCE ? '◈' :
                       t.ttype === TTYPE.HIVE_QUEEN ? '♛' : t.ttype === TTYPE.HIVE_GUARD ? '⚔' : '';
          txt.setText(icon ? `${icon}\n${t.soldiers}` : String(t.soldiers));
          txt.setStyle({ color: '#ffffff', fontSize: t.soldiers > 9 ? '10px' : '12px' });
        } else if (t.kind === KIND.VEIN) {
          txt.setText(`${t.veinHp}`);
          txt.setStyle({ color: '#888888', fontSize: '9px' });
        } else {
          txt.setText('');
        }
      }
    }
  }

  // ── Flash effects ──────────────────────────────────────────────────────────
  _flash(tile, color) {
    const x = GRID_LEFT + tile.col * TILE_STRIDE;
    const y = GRID_TOP  + tile.row * TILE_STRIDE;
    const fx = this.add.rectangle(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, color, 0.8).setDepth(6);
    this.tweens.add({ targets: fx, alpha: 0, duration: 450, ease: 'Power2', onComplete: () => fx.destroy() });
  }

  _processFlashes() {} // handled via tweens

  // ── HUD + Panel updates ────────────────────────────────────────────────────
  _updatePanel() {
    // Stats
    const rows = [
      [this.grid.stablesByOwner(OWNER.P1).length,   this.grid.stablesByOwner(OWNER.P2).length],
      [this.grid.totalSoldiers(OWNER.P1),            this.grid.totalSoldiers(OWNER.P2)],
      [this.grid.stablesByOwner(OWNER.P1).filter(t => t.ttype === TTYPE.RESOURCE).length,
       this.grid.stablesByOwner(OWNER.P2).filter(t => t.ttype === TTYPE.RESOURCE).length],
      [this.grid.veinsByOwner(OWNER.P1).length,     this.grid.veinsByOwner(OWNER.P2).length],
      [this.grid.stablesByOwner(OWNER.P1).filter(t => t.loose).length,
       this.grid.stablesByOwner(OWNER.P2).filter(t => t.loose).length],
    ];
    for (let i = 0; i < rows.length; i++) {
      this.statLines[i][0].setText(String(rows[i][0]));
      this.statLines[i][1].setText(String(rows[i][1]));
    }

    // Hive status
    let hiveStr = '';
    switch (this.hiveState) {
      case HS.DORMANT:
        hiveStr = `DORMANT — awakens turn ${this.hiveAwakenTurn} (now ${this.totalTurns})`;
        break;
      case HS.ACTIVE:
        hiveStr = `ACTIVE — race for the queen!\ncapture #${this.hiveCaptureCount + 1}`;
        break;
      case HS.BUFF_P1:
        hiveStr = `BUFF: P1 Fire Ant — ${this.hiveBuff} turns left\noutput doubled`;
        break;
      case HS.BUFF_P2:
        hiveStr = `BUFF: P2 Army Ant — ${this.hiveBuff} turns left\noutput doubled`;
        break;
      case HS.RESPAWNING:
        hiveStr = `RESPAWNING — dormant for ${HIVE_REDORMANT} turns`;
        break;
    }
    this.hiveStatusText.setText(hiveStr);

    // Speed button highlights
    for (const { btn, spd } of this.speedBtns) {
      const active = this.stepMode ? spd === SPEEDS.STEP : spd === this.currentSpeed;
      btn.setStyle({ color: active ? '#ffee44' : '#555555' });
    }
    this.stepBtn.setStyle({ color: this.stepMode ? '#ffee44' : '#555555' });

    // Log
    const recent = this.log.slice(-22);
    for (let i = 0; i < 22; i++) {
      const entry = recent[i] ?? '';
      const color = entry.includes('P1') ? HEX(SPECIES.P1.color) :
                    entry.includes('P2') ? HEX(SPECIES.P2.color) :
                    entry.startsWith('——') ? '#8844aa' : '#444444';
      this.logTexts[i].setText(entry).setStyle({ color });
    }

    // HUD
    const p1s = this.grid.stablesByOwner(OWNER.P1);
    const p2s = this.grid.stablesByOwner(OWNER.P2);
    this.hudP1.setText(`🐜 FIRE ANT  ${this.grid.totalSoldiers(OWNER.P1)} sol · ${p1s.length} tiles`);
    this.hudP2.setText(`${p2s.length} tiles · ${this.grid.totalSoldiers(OWNER.P2)} sol  ARMY ANT 🐜`);
    this.hudP1b.setText(this.p1Buff ? '⚡ HIVE BUFF' : '');
    this.hudP2b.setText(this.p2Buff ? '⚡ HIVE BUFF' : '');
    this.hudTurn.setText(`Turn ${this.totalTurns}  ·  ${this.activeOwner === OWNER.P1 ? '🟠 P1 acting' : '🔵 P2 acting'}`);

    switch (this.hiveState) {
      case HS.DORMANT:   this.hudHive.setText(`♛ Hive dormant · awakens turn ${this.hiveAwakenTurn}`); break;
      case HS.ACTIVE:    this.hudHive.setText('♛ HIVE ACTIVE — clear guards, capture queen'); break;
      case HS.BUFF_P1:   this.hudHive.setText(`♛ HIVE BUFF: P1 · ${this.hiveBuff} turns left`); break;
      case HS.BUFF_P2:   this.hudHive.setText(`♛ HIVE BUFF: P2 · ${this.hiveBuff} turns left`); break;
      case HS.RESPAWNING: this.hudHive.setText('♛ Hive respawning…'); break;
    }

    const speedLabel = this.stepMode ? 'STEP MODE (SPACE/click)' :
      Object.entries(SPEEDS).find(([, v]) => v === this.currentSpeed)?.[0] ?? '';
    this.hudBottom.setText(`[R] restart  ·  speed: ${speedLabel}  ·  ${this.gameOver ? 'GAME OVER' : 'running'}`);
  }

  // ── Speed / step controls ─────────────────────────────────────────────────
  _setSpeed(spd, _btn) {
    this.stepMode    = spd === SPEEDS.STEP;
    this.currentSpeed = spd;
    this.turnTimer   = spd;
    this._updatePanel();
  }

  _stepPressed() {
    if (!this.stepMode) { this._setSpeed(SPEEDS.STEP, null); }
    if (this.gameOver) return;
    this.stepPending = true;
  }

  // ── Log ───────────────────────────────────────────────────────────────────
  _addLog(msg) {
    this.log.push(msg);
    if (this.log.length > 200) this.log.shift();
  }

  // ── End screen ────────────────────────────────────────────────────────────
  _showEndOverlay(winner) {
    const sp = winner === OWNER.P1 ? SPECIES.P1 : SPECIES.P2;
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x000000, 0.6).setDepth(20);
    this.add.text(CANVAS_W / 2, CANVAS_H / 2 - 40, `${sp.name.toUpperCase()} WINS`, {
      fontSize: '42px', fontFamily: 'monospace', fontStyle: 'bold',
      color: HEX(sp.color), stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(21);
    this.add.text(CANVAS_W / 2, CANVAS_H / 2 + 16, `Colony eliminated on turn ${this.totalTurns}`, {
      fontSize: '16px', fontFamily: 'monospace', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(21);
    this.add.text(CANVAS_W / 2, CANVAS_H / 2 + 56, 'Click or press R to restart', {
      fontSize: '13px', fontFamily: 'monospace', color: '#555555',
    }).setOrigin(0.5).setDepth(21);
    this.input.once('pointerdown', () => this.scene.restart());
  }
}
