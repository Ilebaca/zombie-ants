import Phaser from 'phaser';
import { Grid }          from '../game/Grid.js';
import { AI }            from '../game/AI.js';
import { resolveCombat } from '../game/Combat.js';
import {
  CANVAS_W, CANVAS_H,
  GRID_COLS, GRID_ROWS,
  GRID_LEFT, GRID_TOP,
  TILE_SIZE, TILE_STRIDE,
  OWNER, TILE_TYPE,
  HIVE_QUEEN, HIVE_GUARDS,
  PLAYER_NEST, AI_NEST,
  SOLDIER_GEN_INTERVAL,
  SOLDIERS_EMPTY, SOLDIERS_RESOURCE, SOLDIERS_CAP,
  HIVE_AWAKEN_TIME, HIVE_BUFF_DURATION, HIVE_RESPAWN_DELAY,
  AI_THINK_INTERVAL,
  DEFENSE_BONUS_RESOURCE, DEFENSE_BONUS_NEST,
  COL,
} from '../constants.js';

const HEX   = (n) => '#' + n.toString(16).padStart(6, '0');
const TS2   = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

// ── Hive states ───────────────────────────────────────────────────────────────
const HS = Object.freeze({
  DORMANT:      'DORMANT',
  ACTIVE:       'ACTIVE',
  BUFF_PLAYER:  'BUFF_PLAYER',
  BUFF_AI:      'BUFF_AI',
  RESPAWNING:   'RESPAWNING',
});

export class DemoScene extends Phaser.Scene {
  constructor() { super({ key: 'DemoScene' }); }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  create() {
    this.grid     = new Grid();
    this.ai       = new AI(this.grid);
    this.selected = null;   // { col, row } of selected player tile
    this.gameOver = false;

    // timers (accumulator style)
    this.genAccum   = 0;
    this.aiAccum    = 0;
    this.matchStart = this.time.now;

    // Hive state machine
    this.hiveState        = HS.DORMANT;
    this.hiveAwakenAt     = this.time.now + HIVE_AWAKEN_TIME;
    this.hiveBuffEnd      = 0;
    this.hiveCaptureCount = 0;
    this.playerBuff       = false;
    this.aiBuff           = false;

    this._buildTileViews();
    this._buildHUD();
    this._buildOverlays();

    this.input.on('pointerdown', this._onClick, this);
    this.input.keyboard.on('keydown-R', () => this.scene.restart());
  }

  update(time, delta) {
    if (this.gameOver) return;

    // passive income
    this.genAccum += delta;
    if (this.genAccum >= SOLDIER_GEN_INTERVAL) {
      this.genAccum -= SOLDIER_GEN_INTERVAL;
      this._generateSoldiers();
    }

    // AI think
    this.aiAccum += delta;
    if (this.aiAccum >= AI_THINK_INTERVAL) {
      this.aiAccum -= AI_THINK_INTERVAL;
      this._runAI();
    }

    this._tickHive(time);
    this._checkWin();
    this._redrawTiles();
    this._redrawOverlays(time);
    this._redrawHUD(time);
  }

  // ── Tile view construction ─────────────────────────────────────────────────
  _buildTileViews() {
    this.rects   = [];   // [row][col] → Rectangle
    this.counts  = [];   // [row][col] → Text (soldier count)
    this.icons   = [];   // [row][col] → Text (type icon)

    for (let r = 0; r < GRID_ROWS; r++) {
      this.rects[r]  = [];
      this.counts[r] = [];
      this.icons[r]  = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const x = GRID_LEFT + c * TILE_STRIDE;
        const y = GRID_TOP  + r * TILE_STRIDE;
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;

        this.rects[r][c] = this.add.rectangle(cx, cy, TILE_SIZE, TILE_SIZE, COL.NEUTRAL)
          .setDepth(0);

        this.icons[r][c] = this.add.text(cx, cy - 7, '', {
          fontSize: '10px', fontFamily: 'monospace', color: '#ffcc44',
        }).setOrigin(0.5).setDepth(2);

        this.counts[r][c] = this.add.text(cx, cy + 6, '', {
          fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5).setDepth(2);
      }
    }
  }

  // ── Tile rendering ─────────────────────────────────────────────────────────
  _tileColor(tile) {
    // Hive tiles claimed by a player during buff
    if ((tile.type === TILE_TYPE.HIVE_GUARD || tile.type === TILE_TYPE.HIVE_QUEEN) &&
        tile.owner !== OWNER.HIVE) {
      return tile.owner === OWNER.PLAYER ? COL.PLAYER_BRIGHT : COL.AI_BRIGHT;
    }
    if (tile.owner === OWNER.HIVE) {
      if (this.hiveState === HS.DORMANT)     return COL.HIVE_DORMANT;
      if (this.hiveState === HS.RESPAWNING)  return COL.HIVE_RESPAWNING;
      return COL.HIVE_ACTIVE;
    }
    if (tile.owner === OWNER.PLAYER) {
      if (tile.type === TILE_TYPE.NEST)     return COL.PLAYER_NEST;
      if (tile.type === TILE_TYPE.RESOURCE) return COL.PLAYER_RESOURCE;
      return COL.PLAYER;
    }
    if (tile.owner === OWNER.AI) {
      if (tile.type === TILE_TYPE.NEST)     return COL.AI_NEST;
      if (tile.type === TILE_TYPE.RESOURCE) return COL.AI_RESOURCE;
      return COL.AI;
    }
    if (tile.type === TILE_TYPE.RESOURCE) return COL.NEUTRAL_RESOURCE;
    return COL.NEUTRAL;
  }

  _tileIcon(tile) {
    switch (tile.type) {
      case TILE_TYPE.NEST:       return '★';
      case TILE_TYPE.RESOURCE:   return '◈';
      case TILE_TYPE.HIVE_QUEEN: return '♛';
      case TILE_TYPE.HIVE_GUARD: return '⚔';
      default:                   return '';
    }
  }

  _redrawTiles() {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = this.grid.tiles[r][c];
        this.rects[r][c].setFillStyle(this._tileColor(tile));
        this.icons[r][c].setText(this._tileIcon(tile));
        this.counts[r][c].setText(tile.soldiers > 0 ? String(tile.soldiers) : '');
      }
    }
  }

  // ── Selection & attack overlays ────────────────────────────────────────────
  _buildOverlays() {
    this.selGfx = this.add.graphics().setDepth(5);
  }

  _redrawOverlays() {
    this.selGfx.clear();
    if (!this.selected) return;

    const { col, row } = this.selected;
    const srcTile = this.grid.get(col, row);
    if (!srcTile || srcTile.owner !== OWNER.PLAYER) { this.selected = null; return; }

    // Selected tile border
    this._drawBorder(col, row, COL.SEL_BORDER, 3);

    // Neighbour hints
    for (const n of this.grid.neighbors(col, row)) {
      if (n.owner === OWNER.PLAYER) {
        this._drawBorder(n.col, n.row, COL.MOVE_BORDER, 2, 0.8);
      } else {
        const isHive = n.type === TILE_TYPE.HIVE_GUARD || n.type === TILE_TYPE.HIVE_QUEEN;
        if (isHive && this.hiveState !== HS.ACTIVE) continue;
        if (n.type === TILE_TYPE.HIVE_QUEEN && this._guardsAlive()) continue;
        this._drawBorder(n.col, n.row, COL.ATTACK_BORDER, 2, 0.8);
      }
    }
  }

  _drawBorder(col, row, color, width, alpha = 1) {
    const x = GRID_LEFT + col * TILE_STRIDE;
    const y = GRID_TOP  + row * TILE_STRIDE;
    this.selGfx.lineStyle(width, color, alpha);
    this.selGfx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  _onClick(ptr) {
    if (this.gameOver) return;
    const col = Math.floor((ptr.x - GRID_LEFT) / TILE_STRIDE);
    const row = Math.floor((ptr.y - GRID_TOP)  / TILE_STRIDE);
    const tile = this.grid.get(col, row);
    if (!tile) { this.selected = null; return; }

    if (!this.selected) {
      if (tile.owner === OWNER.PLAYER && tile.soldiers > 1) this.selected = { col, row };
      return;
    }

    const src = this.grid.get(this.selected.col, this.selected.row);

    // Clicking selected tile again → deselect
    if (col === this.selected.col && row === this.selected.row) {
      this.selected = null;
      return;
    }

    if (!this.grid.isAdjacent(this.selected.col, this.selected.row, col, row)) {
      // Not adjacent: switch selection if it's our tile
      this.selected = (tile.owner === OWNER.PLAYER && tile.soldiers > 1)
        ? { col, row } : null;
      return;
    }

    // Adjacent action
    if (tile.owner === OWNER.PLAYER) {
      this._moveSoldiers(src, tile);
    } else {
      const isHive = tile.type === TILE_TYPE.HIVE_GUARD || tile.type === TILE_TYPE.HIVE_QUEEN;
      if (isHive && this.hiveState !== HS.ACTIVE) {
        this._notify('The Hive is dormant — wait for it to awaken', 0xaa66ff);
        this.selected = null;
        return;
      }
      if (tile.type === TILE_TYPE.HIVE_QUEEN && tile.owner === OWNER.HIVE && this._guardsAlive()) {
        this._notify('Clear the Hive guards first', 0xff9944);
        this.selected = null;
        return;
      }
      this._attack(src, tile, OWNER.PLAYER);
    }
    this.selected = null;
  }

  // ── Combat & movement ─────────────────────────────────────────────────────
  _moveSoldiers(from, to) {
    if (from.soldiers <= 1) return;
    const n     = from.soldiers - 1;
    from.soldiers = 1;
    to.soldiers  += n;
    this._flash(to, COL.FLASH_MOVE);
  }

  _attack(from, to, attackOwner) {
    if (from.soldiers <= 1) return;
    const force   = from.soldiers - 1;
    from.soldiers = 1;
    this._resolveTile(from, to, force, attackOwner);
  }

  _resolveTile(from, to, force, attackOwner) {
    const bonus  = this._defenseBonus(to);
    const result = resolveCombat(force, to.soldiers, 1.0, 1.0, bonus);

    if (result.attackerWins) {
      to.owner    = attackOwner;
      to.soldiers = result.attackerRemaining;
      this._flash(to, attackOwner === OWNER.PLAYER ? COL.FLASH_CAPTURE : COL.AI_BRIGHT);

      if (to.type === TILE_TYPE.HIVE_QUEEN) this._captureHive(attackOwner);
    } else {
      to.soldiers = result.defenderRemaining;
      this._flash(to, COL.FLASH_REPEL);
    }
  }

  _defenseBonus(tile) {
    if (tile.type === TILE_TYPE.NEST)       return DEFENSE_BONUS_NEST;
    if (tile.type === TILE_TYPE.RESOURCE)   return DEFENSE_BONUS_RESOURCE;
    if (tile.type === TILE_TYPE.HIVE_QUEEN) return 10 + this.hiveCaptureCount * 5;
    if (tile.type === TILE_TYPE.HIVE_GUARD) return  5 + this.hiveCaptureCount * 3;
    return 0;
  }

  _guardsAlive() {
    return HIVE_GUARDS.some(g => {
      const t = this.grid.get(g.col, g.row);
      return t && t.owner === OWNER.HIVE && t.soldiers > 0;
    });
  }

  // ── Passive soldier generation ─────────────────────────────────────────────
  _generateSoldiers() {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const t = this.grid.tiles[r][c];
        if (t.owner !== OWNER.PLAYER && t.owner !== OWNER.AI) continue;
        if (t.type === TILE_TYPE.HIVE_GUARD || t.type === TILE_TYPE.HIVE_QUEEN) continue;

        let gen = t.type === TILE_TYPE.RESOURCE ? SOLDIERS_RESOURCE : SOLDIERS_EMPTY;
        if (t.owner === OWNER.PLAYER && this.playerBuff) gen *= 2;
        if (t.owner === OWNER.AI     && this.aiBuff)     gen *= 2;

        t.soldiers = Math.min(t.soldiers + gen, SOLDIERS_CAP);
      }
    }
  }

  // ── Hive lifecycle ────────────────────────────────────────────────────────
  _tickHive(time) {
    if (this.hiveState === HS.DORMANT && time >= this.hiveAwakenAt) {
      this._hiveAwaken();
    }
    if ((this.hiveState === HS.BUFF_PLAYER || this.hiveState === HS.BUFF_AI) &&
        time >= this.hiveBuffEnd) {
      this._hiveBuffExpire(time);
    }
  }

  _hiveAwaken() {
    this.hiveState = HS.ACTIVE;
    const scale = 1 + this.hiveCaptureCount * 0.5;
    this.grid.get(HIVE_QUEEN.col, HIVE_QUEEN.row).soldiers = Math.round(18 * scale);
    for (const g of HIVE_GUARDS) {
      const t = this.grid.get(g.col, g.row);
      if (t) t.soldiers = Math.round(10 * scale);
    }
    this._notify('THE HIVE AWAKENS — race for the queen!', 0xcc88ff);
    this._pulseHive();
  }

  _captureHive(owner) {
    this.hiveCaptureCount++;
    this.hiveState   = owner === OWNER.PLAYER ? HS.BUFF_PLAYER : HS.BUFF_AI;
    this.hiveBuffEnd = this.time.now + HIVE_BUFF_DURATION;
    this.playerBuff  = owner === OWNER.PLAYER;
    this.aiBuff      = owner === OWNER.AI;

    // Transfer Hive tiles to captor during buff
    const all = [HIVE_QUEEN, ...HIVE_GUARDS];
    for (const pos of all) {
      const t = this.grid.get(pos.col, pos.row);
      if (t) { t.owner = owner; t.soldiers = 5; }
    }

    const msg = owner === OWNER.PLAYER
      ? '♛ HIVE CAPTURED — soldier output doubled!'
      : '♛ ENEMY captured the Hive!';
    this._notify(msg, owner === OWNER.PLAYER ? 0xffcc22 : 0xff4444);
  }

  _hiveBuffExpire(time) {
    this.playerBuff = false;
    this.aiBuff     = false;

    // Reset Hive tiles
    const all = [HIVE_QUEEN, ...HIVE_GUARDS];
    for (const pos of all) {
      const t = this.grid.get(pos.col, pos.row);
      if (!t) continue;
      t.owner    = OWNER.HIVE;
      t.type     = (pos === HIVE_QUEEN) ? TILE_TYPE.HIVE_QUEEN : TILE_TYPE.HIVE_GUARD;
      t.soldiers = 0;
    }

    this.hiveState = HS.RESPAWNING;
    this._notify('Hive respawning…', 0x9955cc);

    // Re-awaken after delay (no second dormancy — keeps demo moving)
    this.time.delayedCall(HIVE_RESPAWN_DELAY, () => {
      if (!this.gameOver) this._hiveAwaken();
    });
  }

  _pulseHive() {
    const hiveTiles = [HIVE_QUEEN, ...HIVE_GUARDS].map(p => this.rects[p.row][p.col]);
    this.tweens.add({
      targets: hiveTiles, scaleX: 1.07, scaleY: 1.07,
      duration: 700, yoyo: true, repeat: 3, ease: 'Sine.easeInOut',
    });
  }

  // ── AI ─────────────────────────────────────────────────────────────────────
  _runAI() {
    for (const action of this.ai.think(this.hiveState)) {
      const { fromTile: f, toTile: t, force } = action;
      const actualForce = Math.min(force, f.soldiers - 1);
      if (actualForce <= 0) continue;

      if (t.owner === OWNER.AI) {
        // move
        f.soldiers -= actualForce;
        t.soldiers += actualForce;
      } else {
        f.soldiers -= actualForce;
        this._resolveTile(f, t, actualForce, OWNER.AI);
      }
    }
  }

  // ── Win check ─────────────────────────────────────────────────────────────
  _checkWin() {
    const pNest = this.grid.get(PLAYER_NEST.col, PLAYER_NEST.row);
    const aNest = this.grid.get(AI_NEST.col,     AI_NEST.row);

    if (pNest.owner === OWNER.AI) {
      this.gameOver = true;
      this._endScreen('COLONY ELIMINATED', 'The enemy consumed your nest.', 0xff4444);
    } else if (aNest.owner === OWNER.PLAYER) {
      this.gameOver = true;
      this._endScreen('COLONY VICTORIOUS', 'Your colony has consumed the enemy nest.', 0xffcc22);
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  _buildHUD() {
    this.add.rectangle(CANVAS_W / 2, 25, CANVAS_W, 50, COL.HUD_BG).setDepth(8);

    const ts = { fontSize: '13px', fontFamily: 'monospace' };

    this.hudPlayerSoldiers = this.add.text(12, 12, '', { ...ts, color: HEX(COL.PLAYER_BRIGHT) }).setDepth(9);
    this.hudPlayerBuff     = this.add.text(12, 30, '', { ...ts, color: '#ffcc22', fontSize: '11px' }).setDepth(9);

    this.hudHiveStatus = this.add.text(CANVAS_W / 2, 10, '', {
      ...ts, color: HEX(COL.HIVE_ACTIVE), fontSize: '14px',
    }).setOrigin(0.5, 0).setDepth(9);
    this.hudHiveSub = this.add.text(CANVAS_W / 2, 30, '', {
      ...ts, color: '#cc88ff', fontSize: '11px',
    }).setOrigin(0.5, 0).setDepth(9);

    this.hudAISoldiers = this.add.text(CANVAS_W - 12, 12, '', {
      ...ts, color: HEX(COL.AI_BRIGHT),
    }).setOrigin(1, 0).setDepth(9);
    this.hudAIBuff = this.add.text(CANVAS_W - 12, 30, '', {
      ...ts, color: '#4488ff', fontSize: '11px',
    }).setOrigin(1, 0).setDepth(9);

    // Bottom instruction bar
    this.add.rectangle(CANVAS_W / 2, CANVAS_H - 16, CANVAS_W, 32, COL.HUD_BG).setDepth(8);
    this.add.text(CANVAS_W / 2, CANVAS_H - 16,
      'SELECT your tile  ·  MOVE to adjacent friendly  ·  ATTACK adjacent enemy  ·  R to restart',
      { fontSize: '11px', fontFamily: 'monospace', color: '#555555' },
    ).setOrigin(0.5).setDepth(9);
  }

  _redrawHUD(time) {
    const ps = this.grid.totalSoldiers(OWNER.PLAYER);
    const pt = this.grid.tilesByOwner(OWNER.PLAYER).length;
    const as = this.grid.totalSoldiers(OWNER.AI);
    const at = this.grid.tilesByOwner(OWNER.AI).length;

    this.hudPlayerSoldiers.setText(`🐜 YOUR COLONY  ${ps} soldiers · ${pt} tiles`);
    this.hudAISoldiers.setText(`${at} tiles · ${as} soldiers  ENEMY 🐜`);
    this.hudPlayerBuff.setText(this.playerBuff ? '⚡ HIVE BUFF ACTIVE' : '');
    this.hudAIBuff.setText(this.aiBuff ? '⚡ HIVE BUFF ACTIVE' : '');

    switch (this.hiveState) {
      case HS.DORMANT: {
        const rem = Math.max(0, this.hiveAwakenAt - time);
        this.hudHiveStatus.setText(`♛  HIVE DORMANT  —  awakens in ${Math.ceil(rem / 1000)}s`);
        this.hudHiveSub.setText(`capture #${this.hiveCaptureCount + 1} · buff doubles all output for 30s`);
        break;
      }
      case HS.ACTIVE:
        this.hudHiveStatus.setText('♛  HIVE ACTIVE  —  race for the queen!');
        this.hudHiveSub.setText('clear the 4 guards  →  capture the queen tile');
        break;
      case HS.BUFF_PLAYER: {
        const rem = Math.max(0, this.hiveBuffEnd - time);
        this.hudHiveStatus.setText(`♛  HIVE BUFF: YOUR COLONY  —  ${Math.ceil(rem / 1000)}s remaining`);
        this.hudHiveSub.setText('soldier output doubled');
        break;
      }
      case HS.BUFF_AI: {
        const rem = Math.max(0, this.hiveBuffEnd - time);
        this.hudHiveStatus.setText(`♛  HIVE BUFF: ENEMY  —  ${Math.ceil(rem / 1000)}s remaining`);
        this.hudHiveSub.setText('enemy soldier output doubled');
        break;
      }
      case HS.RESPAWNING:
        this.hudHiveStatus.setText('♛  HIVE RESPAWNING…');
        this.hudHiveSub.setText('');
        break;
    }

    // Match timer in title
    const elapsed = time - this.matchStart;
    this.hudHiveSub.setText(this.hudHiveSub.text + `   [ ${TS2(elapsed)} ]`);
  }

  // ── Feedback ─────────────────────────────────────────────────────────────
  _flash(tile, color) {
    const x  = GRID_LEFT + tile.col * TILE_STRIDE;
    const y  = GRID_TOP  + tile.row * TILE_STRIDE;
    const fx = this.add.rectangle(
      x + TILE_SIZE / 2, y + TILE_SIZE / 2,
      TILE_SIZE, TILE_SIZE, color, 0.85,
    ).setDepth(4);
    this.tweens.add({
      targets: fx, alpha: 0, duration: 350, ease: 'Power2',
      onComplete: () => fx.destroy(),
    });
  }

  _notify(text, color) {
    const n = this.add.text(CANVAS_W / 2, GRID_TOP - 18, text, {
      fontSize: '15px', fontFamily: 'monospace', fontStyle: 'bold',
      color: HEX(color), stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10);
    this.tweens.add({
      targets: n, y: GRID_TOP - 45, alpha: 0,
      duration: 2500, ease: 'Power2',
      onComplete: () => n.destroy(),
    });
  }

  _endScreen(title, subtitle, color) {
    this.selGfx.clear();
    this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x000000, 0.72).setDepth(20);
    this.add.text(CANVAS_W / 2, CANVAS_H / 2 - 50, title, {
      fontSize: '42px', fontFamily: 'monospace', fontStyle: 'bold',
      color: HEX(color), stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(21);
    this.add.text(CANVAS_W / 2, CANVAS_H / 2 + 14, subtitle, {
      fontSize: '18px', fontFamily: 'monospace', color: '#bbbbbb',
    }).setOrigin(0.5).setDepth(21);
    this.add.text(CANVAS_W / 2, CANVAS_H / 2 + 60, 'Click or press R to play again', {
      fontSize: '14px', fontFamily: 'monospace', color: '#666666',
    }).setOrigin(0.5).setDepth(21);

    this.input.once('pointerdown', () => this.scene.restart());
  }
}
