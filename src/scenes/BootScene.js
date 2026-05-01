import Phaser from 'phaser';
import { CANVAS_W, CANVAS_H, COL } from '../constants.js';

const HEX = (n) => '#' + n.toString(16).padStart(6, '0');

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  create() {
    const cx = CANVAS_W / 2;

    // ── Subtle grid bg ────────────────────────────────────────────────────────
    const g = this.add.graphics();
    g.lineStyle(1, 0x1a2a1a, 0.5);
    for (let x = 0; x < CANVAS_W; x += 48) g.lineBetween(x, 0, x, CANVAS_H);
    for (let y = 0; y < CANVAS_H; y += 48) g.lineBetween(0, y, CANVAS_W, y);

    // ── Title ─────────────────────────────────────────────────────────────────
    this.add.text(cx, 100, 'ZOMBIE ANTS', {
      fontSize: '56px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#c4571f',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(cx, 158, 'Two colonies. One Hive. Spread, surround, consume.', {
      fontSize: '16px', fontFamily: 'monospace', color: '#6aaa6a', fontStyle: 'italic',
    }).setOrigin(0.5);

    // ── Divider ───────────────────────────────────────────────────────────────
    const div = this.add.graphics();
    div.lineStyle(1, 0x3a5a3a, 1);
    div.lineBetween(cx - 300, 185, cx + 300, 185);

    // ── How to play ───────────────────────────────────────────────────────────
    this.add.text(cx, 210, 'HOW TO PLAY', {
      fontSize: '13px', fontFamily: 'monospace', color: '#888888',
      letterSpacing: 4,
    }).setOrigin(0.5);

    const instructions = [
      ['SELECT',  'Click one of your tiles (outlined in yellow)'],
      ['MOVE',    'Click an adjacent friendly tile to move all-but-one soldiers'],
      ['ATTACK',  'Click an adjacent neutral or enemy tile to assault it'],
      ['HIVE',    'The queen awakens at 1m 30s — race to capture her for double output'],
      ['          ', 'Clear all 4 Hive guards before attacking the queen'],
      ['WIN',     'Capture the enemy NEST tile to eliminate their colony'],
    ];

    let y = 248;
    for (const [label, desc] of instructions) {
      if (label.trim()) {
        this.add.text(cx - 260, y, label, {
          fontSize: '13px', fontFamily: 'monospace', color: '#c4571f', fontStyle: 'bold',
        });
      }
      this.add.text(cx - 180, y, desc, {
        fontSize: '13px', fontFamily: 'monospace', color: '#aaaaaa',
      });
      y += 28;
    }

    // ── Legend ────────────────────────────────────────────────────────────────
    const legendY = y + 20;
    this.add.text(cx, legendY, 'MAP LEGEND', {
      fontSize: '13px', fontFamily: 'monospace', color: '#888888', letterSpacing: 4,
    }).setOrigin(0.5);

    const legend = [
      [COL.PLAYER,           '★  YOUR colony'],
      [COL.AI,               '★  ENEMY colony'],
      [COL.NEUTRAL_RESOURCE, '◈  Resource tile (3× income)'],
      [COL.HIVE_ACTIVE,      '♛  The Hive (dormant until 1m 30s)'],
    ];

    let lx = cx - 300;
    for (const [color, text] of legend) {
      const box = this.add.rectangle(lx + 8, legendY + 30, 16, 16, color);
      this.add.text(lx + 22, legendY + 22, text, {
        fontSize: '12px', fontFamily: 'monospace', color: '#aaaaaa',
      });
      lx += 300;
      if (lx > cx + 100) { lx = cx - 300; }
    }

    // ── Click to play ─────────────────────────────────────────────────────────
    const playText = this.add.text(cx, CANVAS_H - 80, '▶  CLICK ANYWHERE TO BEGIN THE DEMO', {
      fontSize: '18px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffee44',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.tweens.add({
      targets:  playText,
      alpha:    0.3,
      duration: 900,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    this.add.text(cx, CANVAS_H - 45, 'Game Design Document v1.0 · Milan Kujundzic', {
      fontSize: '11px', fontFamily: 'monospace', color: '#444444',
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => this.scene.start('DemoScene'));
    this.input.keyboard.once('keydown', () => this.scene.start('DemoScene'));
  }
}
