// Loads every asset once, waits for the web fonts (text is drawn into canvases, so the font must be ready
// before the first text is created), builds the animations, then shows the title.
import { CUSTOMERS } from '../data.js';
import { audio } from '../audio.js';
import { ART_FRAMES, ART_ANIMS } from '../../assets/art/frames.js';

const FONTS = ['400 32px Fredoka', '500 32px Fredoka', '600 32px Fredoka', '32px "Patrick Hand"'];
const FONT_TIMEOUT = 4000; // offline or blocked fonts: carry on with the fallback font
// This module's own ?v= (index.html import map), so a deploy never pairs a new frames.js with a cached art.png.
const V = new URL(import.meta.url).search;

// Frames per second for each animation; walk speed sets how fast each animal's feet move.
function frameRate(name) {
  const animal = name.split('_')[0];
  if (CUSTOMERS[animal]) return name.endsWith('_side') ? Math.max(2.5, CUSTOMERS[animal].speed * 3.2) : 2;
  return { coin: 10, sparkle: 10, steam: 5, fryer: 3, firefly: 2 }[name] ?? 7; // chef walk: 7
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    this.load.spritesheet('art', 'assets/art/art.png' + V, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('lanternPost', 'assets/art/lantern_post.png' + V, { frameWidth: 16, frameHeight: 32 });
    this.load.spritesheet('wallsTall', 'assets/art/walls_tall.png' + V, { frameWidth: 16, frameHeight: 32 });
    this.load.image('rug', 'assets/art/rug_oval.png' + V); // 3x2 tiles
    this.load.image('glow', 'assets/art/glow.png' + V);
    this.load.image('mist', 'assets/art/mist.png' + V);
    this.load.image('sunset', 'assets/art/sunset.png' + V);
    audio.preload(this);
  }

  create() {
    for (const key of ['art', 'lanternPost', 'wallsTall', 'rug']) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    for (const [key, names] of Object.entries(ART_ANIMS)) {
      this.anims.create({
        key,
        frames: names.map((n) => ({ key: 'art', frame: ART_FRAMES[n] })),
        frameRate: frameRate(key),
        repeat: key === 'sparkle' || key === 'steam' ? 0 : -1,
      });
    }
    audio.init(this.game);
    const fonts = Promise.all(FONTS.map((f) => document.fonts.load(f))).catch(() => null);
    const timeout = new Promise((done) => setTimeout(done, FONT_TIMEOUT));
    Promise.race([fonts, timeout]).then(() => this.scene.start('title'));
  }
}
