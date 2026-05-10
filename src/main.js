import Phaser from 'phaser';
import { BootScene }      from './scenes/BootScene.js';
import { SpectatorScene } from './scenes/SpectatorScene.js';
import { CANVAS_W, CANVAS_H } from './constants.js';

new Phaser.Game({
  type:            Phaser.AUTO,
  width:           CANVAS_W,
  height:          CANVAS_H,
  backgroundColor: '#080f08',
  scene:           [BootScene, SpectatorScene],
  parent:          document.body,
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
