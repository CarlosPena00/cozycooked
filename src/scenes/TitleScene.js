// "Press any key" over the kitchen at dusk. The first key press is also the user gesture that unlocks audio.
import { audio } from '../audio.js';
import { loadSave } from '../save.js';
import { t } from '../text.js';
import { TILE, ART_SCALE, MAP, DECK, CUSTOMERS } from '../data.js';
import { addMapImage } from '../map.js';
import { Mood } from '../mood.js';
import { panel } from '../hud.js';
import { TEXT, INK, COLORS, DEPTH, ART, artFrame, artImage, tileCenter, customerFeet } from '../views.js';

const DUSK = 262; // day time used for the backdrop's light
const [SPOT_A, SPOT_WALK, SPOT_B] = DECK.spots; // two regulars wait, the sloth strolls in along the free row
// The first pot in the map (the chef stands below it, steam rises from it).
const POT = (() => {
  const ty = MAP.findIndex((row) => row.includes('P'));
  return { tx: MAP[ty].indexOf('P'), ty };
})();

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  create() {
    const save = loadSave();
    const cx = this.scale.width / 2;
    addMapImage(this);
    this.cast();
    this.mood = new Mood(this);
    this.mood.light();

    // The title card sits low, over the bottom counters and the lake, so the lit kitchen and the deck show above it.
    const hud = (o) => o.setDepth(DEPTH.hud);
    const card = { x: cx - 520, y: 776, w: 1040, h: 288 };
    hud(panel(this, card.x, card.y, card.w, card.h));
    hud(this.add.text(cx, card.y + 82, t('title.name'), {
      ...TEXT, fontSize: '120px', fontStyle: '600', color: '#f0a23a', stroke: '#5a3222', strokeThickness: 14,
    }).setOrigin(0.5));
    const sub = hud(this.add.text(cx - 60, card.y + 168, t('title.subtitle'), { ...INK, fontSize: '38px', color: COLORS.inkSoft }).setOrigin(0.5));
    ['dish_brigadeiro', 'dish_baiao', 'dish_pastel'].forEach((art, i) => {
      const y = card.y + 166;
      const dish = hud(artImage(this, sub.x + sub.width / 2 + 56 + i * 70, y, art, 4));
      this.tweens.add({ targets: dish, y: y - 10, duration: 900, yoyo: true, repeat: -1, delay: i * 250, ease: 'Sine.easeInOut' });
    });
    hud(panel(this, cx - 210, card.y + 206, 420, 66, 'wood'));
    const press = hud(this.add.text(cx, card.y + 239, t('title.press'), { ...TEXT, fontSize: '44px', color: COLORS.gold, strokeThickness: 8 }).setOrigin(0.5));
    this.tweens.add({ targets: press, alpha: 0.45, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // Small notes over the lake, top corners.
    const note = { ...TEXT, fontSize: '28px', color: COLORS.cream, strokeThickness: 6 };
    if (save.day > 1 || save.coins > 0) {
      hud(this.add.text(this.scale.width - 32, 40, t('title.save', { day: save.day, coins: save.coins }), note).setOrigin(1, 0.5));
    }
    hud(this.add.text(32, 40, t('title.mute'), { ...note, fontSize: '24px', color: COLORS.muted }).setOrigin(0, 0.5));

    const start = () => {
      if (this.started) return;
      this.started = true;
      audio.music();
      audio.play('click', { volume: 0.5 });
      this.cameras.main.fadeOut(350, 20, 26, 40);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('kitchen', { day: save.day }));
    };
    this.started = false;
    this.input.keyboard.on('keydown', (e) => {
      if (e.key.toLowerCase() !== 'm' && !e.repeat) start();
    });
    this.input.on('pointerdown', start);
    this.cameras.main.fadeIn(600);
  }

  update(time, delta) {
    this.mood.update(DUSK, time);
    // The sloth strolls in along the free row and starts over just before reaching the window.
    const sloth = this.sloth;
    sloth.x -= CUSTOMERS.sloth.speed * TILE * (delta / 1000);
    if (sloth.x < tileCenter(SPOT_WALK.tx + 1)) sloth.x = tileCenter(DECK.enterX);
  }

  // A few regulars hanging out on the deck, and the chef in the kitchen.
  cast() {
    const S = ART_SCALE;
    const animal = (id, { tx, ty }, anim) => this.add.sprite(tileCenter(tx), customerFeet(ty), ART, artFrame(`${id}_front_0`))
      .setOrigin(0.5, 1).setScale(S).setDepth(DEPTH.customer).play(anim);
    animal('capybara', SPOT_A, 'capybara_front');
    animal('toad', SPOT_B, 'toad_front');
    this.sloth = animal('sloth', { tx: DECK.enterX - 2, ty: SPOT_WALK.ty }, 'sloth_side').setFlipX(true);
    this.add.sprite(tileCenter(POT.tx), tileCenter(POT.ty + 1) - 2.5 * S, ART, artFrame('chef_up_0')).setScale(S).setDepth(DEPTH.chef);
    this.add.particles(tileCenter(POT.tx), tileCenter(POT.ty) - 4.5 * S, ART, {
      frame: [artFrame('steam_0'), artFrame('steam_1'), artFrame('steam_2')],
      lifespan: 1800, speedY: { min: -10 * S, max: -6.5 * S }, speedX: { min: -2 * S, max: 2 * S },
      scale: { start: 3.6, end: 6 }, alpha: { start: 0.7, end: 0 }, frequency: 500,
    }).setDepth(DEPTH.fx);
  }
}
