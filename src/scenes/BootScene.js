import Phaser from 'phaser';
import { CANVAS_W, CANVAS_H, SPECIES } from '../constants.js';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  create() {
    const cx = CANVAS_W / 2;

    // Grid background
    const g = this.add.graphics();
    g.lineStyle(1, 0x1a2a1a, 0.4);
    for (let x = 0; x < CANVAS_W; x += 44) g.lineBetween(x, 0, x, CANVAS_H);
    for (let y = 0; y < CANVAS_H; y += 44) g.lineBetween(0, y, CANVAS_W, y);

    this.add.text(cx, 90, 'ZOMBIE ANTS', {
      fontSize: '54px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#c4571f', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(cx, 152, 'Two colonies. One Hive. Spread, surround, consume.', {
      fontSize: '15px', fontFamily: 'monospace', color: '#6aaa6a', fontStyle: 'italic',
    }).setOrigin(0.5);

    this.add.text(cx, 178, 'GDD v1.4 · AI vs AI demo · Crossroads 13×13', {
      fontSize: '12px', fontFamily: 'monospace', color: '#555555',
    }).setOrigin(0.5);

    // Divider
    const div = this.add.graphics();
    div.lineStyle(1, 0x3a5a3a); div.lineBetween(cx - 320, 198, cx + 320, 198);

    this.add.text(cx, 215, 'GAME RULES  (v1.4 turn-based)', {
      fontSize: '12px', fontFamily: 'monospace', color: '#888', letterSpacing: 4,
    }).setOrigin(0.5);

    const rules = [
      'Players alternate turns. One action per turn. Stable tiles produce soldiers each turn; veins produce nothing.',
      '4 actions: EXPAND (adjacent capture) · LONG-RANGE (vein path + remote stable) · ATTACK VEIN · PROMOTE VEIN→STABLE',
      'Combat is fully deterministic. A>D → attacker wins with proportional losses. A≤D → defender wins, attacker wiped.',
      'Veins have HP = floor((endpoint A + endpoint B) ÷ 2). Break a vein → tiles beyond it become LOOSE (stranded).',
      'The HIVE awakens at turn 20. Clear 4 guards → capture queen → 10-turn output doubling buff. Respawns stronger.',
      'Win condition: capture the enemy NEST tile.',
    ];

    let y = 248;
    for (const r of rules) {
      this.add.text(cx - 330, y, '·', { fontSize: '13px', fontFamily: 'monospace', color: '#c4571f' });
      this.add.text(cx - 310, y, r, { fontSize: '12px', fontFamily: 'monospace', color: '#aaaaaa', wordWrap: { width: 820 } });
      y += 30;
    }

    // Species cards
    const cardY = y + 14;
    const cardData = [
      { owner: 'P1', x: cx - 240, sp: SPECIES.P1, desc: 'Generalist. Swarm Response: adjacent tiles gain +2 when attacked.' },
      { owner: 'P2', x: cx + 40,  sp: SPECIES.P2, desc: 'Nomadic raider. Bivouac: free 2nd action every 4 turns.' },
    ];
    for (const { x, sp, desc } of cardData) {
      this.add.rectangle(x + 190, cardY + 24, 380, 48, 0x111111).setOrigin(0.5);
      this.add.rectangle(x + 190, cardY + 24, 378, 46, sp.color, 0.15).setOrigin(0.5);
      this.add.text(x + 10, cardY + 8, sp.name.toUpperCase(), {
        fontSize: '13px', fontFamily: 'monospace', fontStyle: 'bold',
        color: '#' + sp.color.toString(16).padStart(6, '0'),
      });
      this.add.text(x + 10, cardY + 28, `ATK ×${sp.atk}  DEF ×${sp.def}  ·  ${desc}`, {
        fontSize: '10px', fontFamily: 'monospace', color: '#888888', wordWrap: { width: 360 },
      });
    }

    const playText = this.add.text(cx, CANVAS_H - 72, '▶  CLICK ANYWHERE TO START THE AI vs AI DEMO', {
      fontSize: '17px', fontFamily: 'monospace', fontStyle: 'bold',
      color: '#ffee44', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.tweens.add({ targets: playText, alpha: 0.3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.add.text(cx, CANVAS_H - 38, 'GDD v1.4 · Milan Kujundzic', {
      fontSize: '11px', fontFamily: 'monospace', color: '#333',
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => this.scene.start('SpectatorScene'));
    this.input.keyboard.once('keydown', () => this.scene.start('SpectatorScene'));
  }
}
