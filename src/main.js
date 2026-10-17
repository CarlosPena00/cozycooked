import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { KitchenScene } from './scenes/KitchenScene.js';
import { HelpScene } from './scenes/HelpScene.js';
import { CatalogScene } from './scenes/CatalogScene.js';
import { DiaryScene } from './scenes/DiaryScene.js';
import { audio } from './audio.js';

const game = new Phaser.Game({
  // AUTO falls back to Canvas when the browser has no WebGL.
  type: Phaser.AUTO,
  parent: 'game',
  width: 1920,
  height: 1080,
  backgroundColor: '#2e4a52',
  // Smooth scaling keeps text readable; pixel textures set NEAREST themselves.
  antialias: true,
  physics: { default: 'arcade' },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, KitchenScene, HelpScene, CatalogScene, DiaryScene],
});

// M toggles sound on every screen.
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'm' && !e.repeat) audio.toggleMute();
});

if (new URLSearchParams(location.search).has('debug')) window.game = game;
