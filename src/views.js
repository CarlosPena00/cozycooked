// How game state looks: items, stations, the chef, customers, small effects, text styles and draw order.
// Almost everything is a frame of one self-made sheet, 'art' (assets/art/art.png, names in assets/art/frames.js).
import { TILE, ART_SCALE, INGREDIENTS, RECIPES, MYSTERY, ASSEMBLIES, CHOPS_NEEDED, SPRITES } from './data.js';
import { matchRecipe, isCooker } from './stations.js';
import { ART_FRAMES } from '../assets/art/frames.js';

export const ART = 'art';
export const FONT = '"Fredoka", "Trebuchet MS", sans-serif';
export const HAND = '"Patrick Hand", "Fredoka", sans-serif';

// Warm palette shared by the HUD and the screens.
export const COLORS = {
  ink: '#4a2f22', inkSoft: '#8a6248', cream: '#fff6e4', gold: '#ffd77a', muted: '#e8d9c0',
  paper: 0xfff3dc, paperEdge: 0x9a6a46, wood: 0x3b2722, woodEdge: 0x6e4a32, leaf: 0x7fae4f, rose: 0xe07a8f,
};
export const TEXT = { fontFamily: FONT, fontSize: '28px', color: COLORS.cream, stroke: '#3b2420', strokeThickness: 6 };
export const SMALL = { ...TEXT, fontSize: '24px', strokeThickness: 5 };
export const INK = { fontFamily: FONT, fontSize: '26px', color: COLORS.ink };

// Draw order, back to front.
export const DEPTH = {
  map: 0, glint: 1, stationItem: 10, steam: 11, shadow: 12, lantern: 13, customer: 14, coin: 16, chef: 20, held: 22,
  highlight: 24, stationInfo: 26, fx: 30, daylight: 50, glow: 52, bubble: 60, label: 62, hud: 100,
};

// World sizes come from the art scale: px(n) is n pixels of 16 px art, drawn in the world (n * ART_SCALE).
const S = ART_SCALE;
const px = (n) => n * S;
export const ITEM_SCALE = 5; // food and dishes, on stations and in the chef's hands
export const ICON_SCALE = 3; // small icons: pot contents, effects

export const tileCenter = (t) => t * TILE + TILE / 2;
export const artFrame = (name) => ART_FRAMES[name];
export const artImage = (scene, x, y, name, scale = S) => scene.add.image(x, y, ART, ART_FRAMES[name]).setScale(scale);

// Art frame names for items: ingredients (raw/chopped) and plated dishes (cooked/cozycooked).
export function itemArt(item) {
  return item.type === 'ingredient' ? ingredientArt(item.kind, item.chopped) : dishArt(item.dish);
}
const ingredientArt = (kind, chopped) => (chopped ? `${INGREDIENTS[kind].art}_chopped` : INGREDIENTS[kind].art);

export function dishArt(dish) {
  if (!dish.recipe) return MYSTERY.art;
  const { art } = RECIPES[dish.recipe];
  return dish.cooked ? art : `${art}_under`;
}

// A recipe as pictures: raw ingredients (assemblies expanded, e.g. pastel = dough + chopped cheese), cooker, dish.
export function recipeArt(id) {
  const recipe = RECIPES[id];
  const keys = recipe.needs.flatMap((key) => ASSEMBLIES.find((a) => a.makes === key)?.needs ?? [key]);
  const ingredients = keys.map((key) => {
    const [kind, chopped] = key.split(':');
    return ingredientArt(kind, !!chopped);
  });
  return { ingredients, cooker: SPRITES[recipe.cooker], dish: recipe.art };
}

// Little bounce when something appears.
export function pop(scene, obj, scale) {
  scene.tweens.killTweensOf(obj);
  obj.setScale(scale * 0.55);
  scene.tweens.add({ targets: obj, scale, duration: 240, ease: 'Back.easeOut' });
}

// One item drawn from the art sheet; pops when it changes.
export class ItemView {
  constructor(scene, x, y, depth, scale = ITEM_SCALE) {
    this.scene = scene;
    this.scale = scale;
    this.art = null;
    this.image = scene.add.image(x, y, ART, 0).setScale(scale).setDepth(depth).setVisible(false);
  }

  setPosition(x, y) {
    this.image.setPosition(x, y);
    return this;
  }

  set(item) {
    return this.setArt(item ? itemArt(item) : null);
  }

  setArt(art) {
    if (art === this.art) return this;
    this.art = art;
    this.image.setVisible(!!art);
    if (art) {
      this.image.setFrame(ART_FRAMES[art]);
      pop(this.scene, this.image, this.scale);
    }
    return this;
  }
}

// Small effects that clean up after themselves.
export const fx = {
  // An art frame that drifts up and fades (hearts, coins, steam).
  float(scene, x, y, art, { scale = 4, rise = px(14), duration = 1000, delay = 0 } = {}) {
    const img = artImage(scene, x, y, art, scale).setDepth(DEPTH.fx);
    scene.tweens.add({ targets: img, y: y - rise, alpha: 0, delay, duration, ease: 'Sine.easeOut', onComplete: () => img.destroy() });
  },
  sparkle(scene, x, y) {
    [[0, 0, S], [-6.5, 2.5, 4], [6, -3.5, 4]].forEach(([dx, dy, scale], i) => {
      const s = scene.add.sprite(x + px(dx), y + px(dy), ART, ART_FRAMES.sparkle_0).setScale(scale).setDepth(DEPTH.fx);
      s.playAfterDelay('sparkle', i * 120);
      s.once('animationcomplete', () => s.destroy());
    });
  },
  text(scene, x, y, message, style = SMALL) {
    const label = scene.add.text(x, y, message, style).setOrigin(0.5, 1).setDepth(DEPTH.label);
    scene.tweens.add({ targets: label, y: y - px(10), alpha: 0, delay: 1300, duration: 700, onComplete: () => label.destroy() });
    return label;
  },
};

// A cream speech bubble with a tail on its left. Shows a dish icon (order) or a short line. Hidden until show().
const BUBBLE_ICON = 4;
class Bubble {
  constructor(scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.bubble);
    this.icon = scene.add.image(0, 0, ART, 0).setScale(BUBBLE_ICON).setDepth(DEPTH.bubble);
    // Wide enough that reaction lines fit on one line, so a bubble never reaches the next row's guest.
    this.text = scene.add.text(0, 0, '', { ...INK, fontSize: '26px', wordWrap: { width: 480 }, lineSpacing: -2 })
      .setOrigin(0, 0.5).setDepth(DEPTH.bubble);
    for (const o of [this.g, this.icon, this.text]) o.setVisible(false);
    this.key = null;
    this.w = 0;
  }

  show(art, line) {
    const key = `${art}|${line}`;
    if (key === this.key) return;
    const appeared = this.key === null;
    this.key = key;
    this.icon.setVisible(!!art);
    if (art) this.icon.setFrame(ART_FRAMES[art]);
    this.text.setText(line ?? '').setVisible(!!line);
    // A spoken line draws over the order bubbles around it.
    for (const o of [this.g, this.icon, this.text]) o.setDepth(DEPTH.bubble + (line ? 1 : 0));
    const icon = 16 * BUBBLE_ICON;
    const w = art ? icon + 18 : this.text.width + 32;
    const h = art ? icon + 14 : this.text.height + 24;
    const g = this.g.clear();
    g.fillStyle(0x3b2420, 0.18).fillRoundedRect(16, -h / 2 + 5, w, h, 18);
    g.fillStyle(COLORS.paper).lineStyle(3, COLORS.paperEdge);
    g.fillRoundedRect(14, -h / 2, w, h, 18).strokeRoundedRect(14, -h / 2, w, h, 18);
    g.fillTriangle(16, -11, 16, 11, 0, 5).lineBetween(15, -11, 0, 5).lineBetween(0, 5, 15, 11);
    g.setVisible(true);
    this.w = w;
    if (appeared) pop(g.scene, g, 1);
  }

  hide() {
    if (this.key === null) return;
    this.key = null;
    for (const o of [this.g, this.icon, this.text]) o.setVisible(false);
  }

  // (x, y) is the tip of the tail.
  setPosition(x, y) {
    this.g.setPosition(x, y);
    this.icon.setPosition(x + 14 + this.w / 2, y);
    this.text.setPosition(x + 30, y);
  }

  destroy() {
    for (const o of [this.g, this.icon, this.text]) o.destroy();
  }
}

// What a station shows on top of the baked map: its item, a progress bar, and for cookers the pot filling,
// fryer bubbles, the ingredients inside (small icons above the tile) and steam.
export class StationView {
  constructor(scene, station) {
    const x = tileCenter(station.tx);
    const y = tileCenter(station.ty);
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.item = new ItemView(scene, x, y - px(1), DEPTH.stationItem);
    this.barWidth = TILE * 0.78;
    const barY = y + TILE * 0.39;
    this.barBack = scene.add.rectangle(x, barY, this.barWidth + 6, 16, 0x2b1d1a, 0.8).setDepth(DEPTH.stationInfo).setVisible(false);
    this.bar = scene.add.rectangle(x - this.barWidth / 2, barY, 0, 9, 0xf0c04a).setOrigin(0, 0.5).setDepth(DEPTH.stationInfo);
    this.cooker = isCooker(station);
    if (!this.cooker) return;
    this.overlay = artImage(scene, x, y, 'potfill_broth').setDepth(DEPTH.stationItem).setVisible(false);
    this.icons = [];
    this.iconsKey = '';
    this.steam = scene.add.particles(x, y - px(4.5), ART, {
      frame: [ART_FRAMES.steam_0, ART_FRAMES.steam_1],
      lifespan: 1600, speedY: { min: -px(11.5), max: -px(7.5) }, speedX: { min: -px(2.5), max: px(2.5) },
      scale: { start: 3.6, end: 6 }, alpha: { start: 0.75, end: 0 }, frequency: 420, emitting: false,
    }).setDepth(DEPTH.steam);
    this.hearts = scene.add.particles(x, y - px(5.5), ART, {
      frame: ART_FRAMES.steam_2, lifespan: 1800, speedY: { min: -px(9), max: -px(6.5) }, speedX: { min: -px(1.5), max: px(1.5) },
      scale: { start: 3.75, end: 5.25 }, alpha: { start: 0.9, end: 0 }, frequency: 1100, emitting: false,
    }).setDepth(DEPTH.steam);
  }

  sync(station, time) {
    let progress = 0;
    if (this.cooker) progress = this.syncCooker(station, time);
    else {
      if (station.type === 'board') progress = station.chops / CHOPS_NEEDED;
      this.item.set(station.item);
    }
    this.barBack.setVisible(progress > 0);
    this.bar.setVisible(progress > 0);
    this.bar.width = this.barWidth * Math.min(1, progress);
    this.bar.setFillStyle(progress >= 1 ? 0x8ad46b : 0xf6c453);
  }

  syncCooker(station, time) {
    const { contents } = station;
    const busy = contents.length > 0;
    const ready = busy && station.progress >= 1;
    const recipe = busy ? matchRecipe(contents, station.type) : null;
    // Above the tile: the ingredients while cooking, the finished dish when ready.
    const arts = ready ? [dishArt({ recipe, cooked: true })] : contents.map(itemArt);
    this.layoutIcons(arts);
    if (station.type === 'pot') {
      this.overlay.setVisible(busy);
      if (busy) this.overlay.setFrame(ART_FRAMES[(recipe ? RECIPES[recipe].fill : null) ?? 'potfill_broth']);
    } else {
      // Fryer oil bubbles at ~3 fps while frying.
      this.overlay.setVisible(busy && !ready && Math.floor(time / 330) % 2 === 0).setFrame(ART_FRAMES.fryer_bubble);
    }
    toggle(this.steam, busy && !ready);
    toggle(this.hearts, ready);
    return busy ? station.progress : 0;
  }

  // Up to 2 icons per row, just above the tile, over the water row under the HUD cards.
  layoutIcons(arts) {
    const key = arts.join();
    if (key === this.iconsKey) return;
    this.iconsKey = key;
    for (const icon of this.icons) icon.destroy();
    const top = this.y - TILE / 2;
    this.icons = arts.map((art, i) => {
      const rows = Math.ceil(arts.length / 2);
      const row = Math.floor(i / 2);
      const inRow = Math.min(2, arts.length - row * 2);
      const step = 16 * ICON_SCALE;
      const x = this.x + (inRow === 2 ? (i % 2 ? step / 2 : -step / 2) : 0);
      const y = top - step / 2 - (rows - 1 - row) * (step - 2);
      const icon = artImage(this.scene, x, y, art, ICON_SCALE).setDepth(DEPTH.stationInfo);
      pop(this.scene, icon, ICON_SCALE);
      return icon;
    });
  }
}

function toggle(emitter, on) {
  if (on && !emitter.emitting) emitter.start();
  else if (!on && emitter.emitting) emitter.stop();
}

// The chef: 2-frame walk in 3 directions (side frames face right, flipped for left), a soft shadow,
// and the held item in front (never on the tile above, so station bars stay visible).
export class ChefView {
  constructor(scene, x, y) {
    this.scene = scene;
    this.shadow = scene.add.ellipse(x, y, px(10.5), px(3.5), 0x2b1d1a, 0.28).setDepth(DEPTH.shadow);
    this.sprite = scene.add.sprite(x, y, ART, ART_FRAMES.chef_up_0).setScale(S).setDepth(DEPTH.chef);
    this.held = new ItemView(scene, x, y, DEPTH.held);
  }

  sync(x, y, facing, moving, heldItem) {
    const dir = facing.x ? 'side' : facing.y < 0 ? 'up' : 'down';
    const { sprite } = this;
    sprite.setFlipX(facing.x < 0).setPosition(x, y - px(2.5));
    if (moving) sprite.play(`chef_${dir}`, true);
    else if (sprite.anims.isPlaying || sprite.frame.name !== ART_FRAMES[`chef_${dir}_0`]) {
      sprite.stop();
      sprite.setFrame(ART_FRAMES[`chef_${dir}_0`]);
    }
    this.shadow.setPosition(x, y + px(5));
    const [hx, hy] = dir === 'side' ? [facing.x * 6, 1.5] : dir === 'up' ? [6, -0.5] : [0, 3];
    this.held.setPosition(x + px(hx), y + px(hy)).set(heldItem);
  }

  // Squash and stretch on every interaction.
  squash() {
    const { sprite } = this;
    this.scene.tweens.killTweensOf(sprite);
    sprite.setScale(S * 1.15, S * 0.85);
    this.scene.tweens.add({ targets: sprite, scaleX: S, scaleY: S, duration: 260, ease: 'Back.easeOut' });
  }
}

// A customer on the deck: walks in sideways, waits facing the kitchen with the order in a bubble,
// hops with a heart when served, walks away.
export class CustomerView {
  constructor(scene, customer) {
    this.scene = scene;
    this.id = customer.id;
    this.shadow = scene.add.ellipse(0, 0, px(11.5), px(3.5), 0x2b1d1a, 0.28).setDepth(DEPTH.shadow);
    this.body = scene.add.sprite(0, 0, ART, ART_FRAMES[`${this.id}_side_0`]).setScale(S).setOrigin(0.5, 1).setDepth(DEPTH.customer);
    this.bubble = new Bubble(scene);
    this.line = null;
    this.lineLeft = 0;
    this.lift = 0;
    this.served = false;
  }

  // Show a line in the bubble for a few seconds (reactions, idle, bye).
  say(line, seconds = 2.5) {
    this.line = line;
    this.lineLeft = seconds;
  }

  sync(c, dt) {
    const x = c.x * TILE + TILE / 2;
    const feet = customerFeet(c.ty);
    const { body, id } = this;
    if (c.state === 'served' && !this.served) this.react(c, x, feet);
    if (c.state === 'walking_in' || c.state === 'leaving') {
      body.play(`${id}_side`, true).setFlipX(c.state === 'walking_in');
    } else if (c.state === 'waiting') {
      body.play(`${id}_front`, true).setFlipX(false);
    }
    body.setPosition(x, feet - this.lift);
    this.shadow.setPosition(x, feet - 2);

    this.lineLeft -= dt;
    if (this.lineLeft <= 0) this.line = null;
    // The order shows as soon as the guest starts walking in (the HUD card appears at the same time).
    const order = (c.state === 'walking_in' || c.state === 'waiting') && !this.line;
    if (this.line) this.bubble.show(null, this.line);
    else if (order) this.bubble.show(dishArt({ recipe: c.recipe, cooked: true }), null);
    else this.bubble.hide();
    this.bubble.setPosition(x + px(6.5), feet - px(13));
  }

  react(c, x, feet) {
    this.served = true;
    const happy = c.mood !== 'surprised';
    this.body.stop().setFrame(ART_FRAMES[happy ? `${this.id}_happy` : `${this.id}_front_0`]);
    this.scene.tweens.add({ targets: this, lift: px(5.5), duration: 160, yoyo: true, repeat: 1, ease: 'Sine.easeOut' });
    if (happy) {
      fx.float(this.scene, x, feet - px(18), 'heart', { scale: 5, rise: px(17.5), duration: 1400 });
      fx.float(this.scene, x - px(4.5), feet - px(15), 'heart', { scale: 3, rise: px(15), duration: 1300, delay: 250 });
    } else fx.sparkle(this.scene, x, feet - px(17.5));
  }

  destroy() {
    for (const o of [this.shadow, this.body]) o.destroy();
    this.bubble.destroy();
  }
}

// Where a guest's feet touch the deck on row ty (sprites use origin 0.5, 1).
export const customerFeet = (ty) => tileCenter(ty) + TILE * 0.44;

// Customer portrait frame (for cards and the diary).
export const portraitArt = (id) => `${id}_front_0`;
