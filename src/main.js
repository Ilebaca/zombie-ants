import Phaser from 'phaser';
import { BootScene }  from './scenes/BootScene.js';
import { DemoScene }  from './scenes/DemoScene.js';
import { CANVAS_W, CANVAS_H, COL } from './constants.js';

new Phaser.Game({
  type:            Phaser.AUTO,
  width:           CANVAS_W,
  height:          CANVAS_H,
  backgroundColor: '#' + COL.BG.toString(16).padStart(6, '0'),
  scene:           [BootScene, DemoScene],
  parent:          document.body,
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
