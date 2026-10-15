// How game state looks: items, stations, the chef, customers, small effects, text styles and draw order.
// Almost everything is a frame of one self-made sheet, 'art' (assets/art/art.png, names in assets/art/frames.js).
import { TILE, ART_SCALE, INGREDIENTS, RECIPES, MYSTERY, ASSEMBLIES, CHOPS_NEEDED, SPRITES, KITCHEN, DECK } from './data.js';
import { matchRecipe, isCooker, waitingFor } from './stations.js';
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
  map: 0, glint: 1, stationItem: 10, steam: 11, shadow: 12, lantern: 13, customer: 14, coin: 16, guide: 18, chef: 20, held: 22,
  highlight: 24, stationInfo: 26, fx: 30, daylight: 50, glow: 52, bubble: 60, label: 62, hud: 100,
};

// World sizes come from the art scale: px(n) is n pixels of 16 px art, drawn in the world (n * ART_SCALE).
const S = ART_SCALE;
const px = (n) => n * S;
export const ITEM_SCALE = 5; // food and dishes, on stations and in the chef's hands
export const ICON_SCALE = 3; // small icons: pot contents, effects

export const tileCenter = (t) => t * TILE + TILE / 2;
// Mix two 0xRRGGBB colors (p = 0: a, 1: b).
export const mixColor = (a, b, p) => [16, 8, 0].reduce((c, s) => c | (Math.round((((a >> s) & 255) * (1 - p)) + ((b >> s) & 255) * p) << s), 0);
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

// Canvas mode pays for every scaled-up draw each frame, so big soft layers are stretched once into a texture
// at their final size and then drawn 1:1 (cheap in both renderers).
export function stretched(scene, key, src, w, h) {
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(scene.textures.get(src).getSourceImage(), 0, 0, w, h);
    tex.refresh();
  }
  return key;
}

// Little bounce when something appears.
export function pop(scene, obj, scale) {
  scene.tweens.killTweensOf(obj);
  obj.setScale(scale * 0.55);
  scene.tweens.add({ targets: obj, scale, duration: 240, ease: 'Back.easeOut' });
}

// A quick side-to-side tilt ("nope"). Only its own tween is restarted, other tweens on obj keep running.
export function wiggle(scene, obj, degrees = 5) {
  obj.wiggleTween?.stop();
  obj.setAngle(0);
  obj.wiggleTween = scene.tweens.add({
    targets: obj, angle: { from: -degrees, to: degrees }, duration: 60, yoyo: true, repeat: 1, onComplete: () => obj.setAngle(0),
  });
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
  // A small burst of pixel squares that arc up and tumble down (Shapes: plain colors work in Canvas, tint does not).
  confetti(scene, x, y, colors, count = 22) {
    for (let i = 0; i < count; i++) {
      const size = px(i % 3 ? 1.5 : 2);
      const bit = scene.add.rectangle(x, y, size, size, colors[i % colors.length]).setDepth(DEPTH.fx)
        .setStrokeStyle(2, 0x3b2420, 0.35);
      const vx = Phaser.Math.Between(-300, 300);
      const vy = Phaser.Math.Between(-900, -560);
      const spin = Phaser.Math.FloatBetween(-8, 8);
      scene.tweens.addCounter({
        from: 0, to: 1, duration: 1200, ease: 'Linear',
        onUpdate: (tw) => {
          const t = tw.getValue() * 1.2; // seconds
          bit.setPosition(x + vx * t, y + vy * t + 900 * t * t).setRotation(spin * t).setAlpha(t < 0.85 ? 1 : (1.2 - t) / 0.35);
        },
        onComplete: () => bit.destroy(),
      });
    }
  },
  text(scene, x, y, message, style = SMALL) {
    const label = scene.add.text(x, y, message, style).setOrigin(0.5, 1).setDepth(DEPTH.label);
    scene.tweens.add({ targets: label, y: y - px(10), alpha: 0, delay: 1300, duration: 700, onComplete: () => label.destroy() });
    return label;
  },
};

// Serve confetti colors, by recipe (and 'mystery').
const CONFETTI = {
  brigadeiro: [0x6b3e26, 0xe07a8f, 0xffd77a, 0xfff1c4],
  baiao: [0xf3d77e, 0x9a4a36, 0x7fae4f, 0xfff1c4],
  pastel: [0xf0c04a, 0xd98a3a, 0xfff1c4, 0xe07a8f],
  mystery: [0x9a7ac0, 0x7fae4f, 0xe2c99a, 0xfff1c4],
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
    // A board can hold a stack: dough under raw cheese (the cheese sits a little higher, on top of it).
    if (station.type === 'board') this.under = new ItemView(scene, x, y + px(1.5), DEPTH.stationItem - 0.5);
    // Just above the tile, so the chef standing below never covers it: a dark outline around a cream backing
    // (readable on the green wall), filled in whole art pixels.
    this.barWidth = px(12);
    const barY = y - TILE / 2 - 8;
    this.barBack = [[this.barWidth + 12, 24, 0x3b2420], [this.barWidth + 6, 18, COLORS.paper]]
      .map(([w, h, color]) => scene.add.rectangle(x, barY, w, h, color).setDepth(DEPTH.stationInfo).setVisible(false));
    this.bar = scene.add.rectangle(x - this.barWidth / 2, barY, 0, 12, 0xf0c04a).setOrigin(0, 0.5).setDepth(DEPTH.stationInfo);
    // Crates: a small picture of what is inside on the cream front card, readable from across the room
    // (half the world's art scale, the finest the art goes).
    if (station.type === 'crate') artImage(scene, x, y + px(5), INGREDIENTS[station.kind].art, S / 2).setDepth(DEPTH.stationItem);
    this.cooker = isCooker(station);
    if (!this.cooker) return;
    this.overlay = artImage(scene, x, y, 'potfill_broth').setDepth(DEPTH.stationItem).setVisible(false);
    // A stepped pixel halo that breathes around a finished cooker until the food is plated (never over the food).
    this.glow = pixelHalo(scene, x, y).setDepth(DEPTH.stationItem - 1).setVisible(false);
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

  // A small "nope" wiggle of what sits on the station (the scene wiggles the highlight around it).
  wiggle() {
    for (const obj of [this.item.image, ...(this.icons ?? [])]) wiggle(this.scene, obj, 8);
  }

  // dark: 0 by day .. 1 at night (the halo is softer in daylight).
  sync(station, time, dark = 0) {
    let progress = 0;
    if (this.cooker) progress = this.syncCooker(station, time, dark);
    else {
      if (station.type === 'board') {
        progress = station.chops / CHOPS_NEEDED;
        this.under.set(station.under);
        this.item.setPosition(this.x, this.y - px(station.under ? 3.5 : 1));
      }
      this.item.set(station.item);
    }
    for (const o of [...this.barBack, this.bar]) o.setVisible(progress > 0);
    this.bar.width = Math.round((this.barWidth / S) * Math.min(1, progress)) * S;
    this.bar.setFillStyle(progress >= 1 ? 0x8ad46b : 0xf6c453);
  }

  syncCooker(station, time, dark) {
    const { contents } = station;
    const busy = contents.length > 0;
    const ready = busy && station.progress >= 1;
    // A waiting cooker (half a recipe, one lone ingredient) sits still: no broth, no steam, just its icons above.
    const waiting = busy && !!waitingFor(station);
    const cooking = busy && !waiting;
    const recipe = busy ? matchRecipe(contents, station.type) : null;
    // Above the tile: the ingredients while cooking, the finished dish when ready.
    const arts = ready ? [dishArt({ recipe, cooked: true })] : contents.map(itemArt);
    this.layoutIcons(arts, ready);
    this.glow.setVisible(ready);
    if (ready) this.glow.setAlpha((0.8 + 0.2 * dark) * (0.8 + 0.2 * Math.sin(time / 260)));
    if (station.type === 'pot') {
      this.overlay.setVisible(cooking);
      if (cooking) this.overlay.setFrame(ART_FRAMES[(recipe ? RECIPES[recipe].fill : null) ?? 'potfill_broth']);
    } else {
      // Fryer oil bubbles at ~3 fps while frying.
      this.overlay.setVisible(busy && !ready && Math.floor(time / 330) % 2 === 0).setFrame(ART_FRAMES.fryer_bubble);
    }
    toggle(this.steam, cooking && !ready);
    toggle(this.hearts, ready);
    // A waiting cooker shows no bar (it only cooks once it is a whole recipe or a mystery mix).
    return cooking ? station.progress : 0;
  }

  // Up to 2 icons per row, above the progress bar, over the water row under the HUD cards.
  // The finished dish shows bigger, with a springy pop.
  layoutIcons(arts, ready) {
    const key = arts.join();
    if (key === this.iconsKey) return;
    this.iconsKey = key;
    for (const icon of this.icons) icon.destroy();
    const top = this.y - TILE / 2 - 20;
    if (ready) {
      const icon = artImage(this.scene, this.x, top - 34, arts[0], ICON_SCALE + 1).setDepth(DEPTH.stationInfo);
      icon.setScale(1);
      this.scene.tweens.add({ targets: icon, scale: ICON_SCALE + 1, duration: 420, ease: 'Back.easeOut', easeParams: [3] });
      this.icons = [icon];
      return;
    }
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

// A finished cooker's halo: rings of whole art pixels around the tile, rounded at the corners, fading outwards.
const HALO = [[0xfff1b0, 0.95], [0xffd36b, 0.65], [0xffb84d, 0.3]]; // [color, alpha], from the tile edge out
function pixelHalo(scene, x, y) {
  const g = scene.add.graphics({ x, y });
  const half = 8; // art px from the tile centre to its edge
  const reach = half + HALO.length;
  for (let i = -reach; i < reach; i++) {
    for (let j = -reach; j < reach; j++) {
      const d = Math.hypot(Math.max(0, Math.abs(i + 0.5) - half), Math.max(0, Math.abs(j + 0.5) - half));
      const ring = HALO[Math.ceil(d) - 1];
      if (ring) g.fillStyle(ring[0], ring[1]).fillRect(px(i), px(j), S, S);
    }
  }
  return g;
}

function toggle(emitter, on) {
  if (on && !emitter.emitting) emitter.start();
  else if (!on && emitter.emitting) emitter.stop();
}

// A soft gold arrow on the floor in front of a station, pointing at it and bobbing towards it. Fades in and out.
export class GuideArrow {
  constructor(scene) {
    this.scene = scene;
    const g = scene.add.graphics().setDepth(DEPTH.guide).setAlpha(0);
    // Drawn pointing up, tip at (0, -24).
    const arrow = [0, -24, 26, 5, 10, 5, 10, 24, -10, 24, -10, 5, -26, 5];
    const points = (dx, dy) => arrow.reduce((list, v, i) => (i % 2 ? list : [...list, { x: v + dx, y: arrow[i + 1] + dy }]), []);
    g.fillStyle(0x1b1210, 0.25).fillPoints(points(2, 4), true);
    g.fillStyle(0xffd36b).fillPoints(points(0, 0), true);
    g.lineStyle(4, 0x6e4a32).strokePoints(points(0, 0), true);
    this.g = g;
    this.station = null;
  }

  // station: where to point (null hides it).
  update(station, time) {
    const { g } = this;
    if (station) this.station = station;
    g.setAlpha(Phaser.Math.Linear(g.alpha, station ? 0.95 : 0, 0.12));
    if (!this.station || g.alpha < 0.01) return;
    const { tx, ty } = this.station;
    // Point from the room's side of the station: stations stand on the room's walls.
    const [dx, dy] = ty === KITCHEN.top ? [0, -1] : ty === KITCHEN.bottom ? [0, 1] : tx === KITCHEN.left ? [-1, 0] : [1, 0];
    const bob = 8 * Math.sin(time / 160);
    const away = TILE * 0.86 - bob;
    g.setPosition(tileCenter(tx) - dx * away, tileCenter(ty) - dy * away).setRotation(Math.atan2(dx, -dy));
  }
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
    // Waiting guests breathe (a 1 art px bob, each at its own pace) and blink now and then (a 1 art px squash).
    this.phase = Math.random() * Math.PI * 2;
    this.breath = 2200 + Math.random() * 800; // ms per breath
    this.blinkAt = scene.time.now + 1500 + Math.random() * 3000;
    this.hop = 0;
    this.eager = false; // hopped already for the dish coming their way
  }

  // Show a line in the bubble for a few seconds (reactions, idle, bye).
  say(line, seconds = 2.5) {
    this.line = line;
    this.lineLeft = seconds;
  }

  // chef: { x, y, recipe } while the chef carries a dish (else null): a guest hops when their dish comes close.
  sync(c, dt, chef = null) {
    const x = c.x * TILE + TILE / 2;
    const feet = customerFeet(c.ty);
    const { body, id } = this;
    if (c.state === 'served' && !this.served) this.react(c, x, feet);
    if (c.state === 'walking_in' || c.state === 'leaving') {
      body.play(`${id}_side`, true).setFlipX(c.state === 'walking_in');
    } else if (c.state === 'waiting') {
      body.play(`${id}_front`, true).setFlipX(false);
    }
    const waiting = c.state === 'waiting';
    const now = this.scene.time.now;
    const bob = waiting ? Math.round((1 + Math.sin(now / this.breath * Math.PI * 2 + this.phase)) / 2) * S : 0;
    if (waiting && !this.served) {
      const blinking = now >= this.blinkAt;
      if (now >= this.blinkAt + 130) this.blinkAt = now + 2500 + Math.random() * 4000;
      body.setScale(S, blinking ? S * (1 - 1 / body.frame.height) : S);
      // A small happy hop once, when the chef brings this guest's dish near their window.
      const near = chef && chef.recipe === c.recipe && Math.abs(chef.y - tileCenter(c.ty)) < TILE * 0.6 && c.spot.tx * TILE - chef.x < TILE * 2.5;
      // A hop already in the air finishes on its own (restarting it mid-air would leave the guest floating).
      if (near && !this.eager && !this.scene.tweens.isTweening(this)) this.scene.tweens.add({ targets: this, hop: px(2), duration: 130, yoyo: true, ease: 'Sine.easeOut' });
      this.eager = !!near;
    } else if (!this.served) body.setScale(S); // walking or leaving: never keep a blink squash
    // Lower rows stand in front (neighbouring guests overlap a little, and more when they hop).
    body.setPosition(x, feet - this.lift - bob - Math.round(this.hop / S) * S).setDepth(DEPTH.customer + c.ty / 100);
    this.shadow.setPosition(x, feet - 2);

    this.lineLeft -= dt;
    if (this.lineLeft <= 0) this.line = null;
    // The order pops up once the guest has arrived at the window (the HUD card already shows it while they walk in).
    const order = c.state === 'waiting' && !this.line;
    if (this.line) this.bubble.show(null, this.line);
    else if (order) this.bubble.show(dishArt({ recipe: c.recipe, cooked: true }), null);
    else this.bubble.hide();
    // A spoken line is kept on screen while a guest walks out past the right edge.
    this.bubble.setPosition(Math.min(x + px(6.5), this.scene.scale.width - 30 - this.bubble.w), feet - px(13));
  }

  react(c, x, feet) {
    this.served = true;
    this.scene.tweens.killTweensOf(this); // stop the happy hop, the served hop takes over
    this.hop = 0;
    const happy = c.mood !== 'surprised';
    this.body.stop().setFrame(ART_FRAMES[happy ? `${this.id}_happy` : `${this.id}_front_0`]);
    // Squash, then spring up into the hop.
    this.body.setScale(S * 1.25, S * 0.75);
    this.scene.tweens.add({ targets: this.body, scaleX: S, scaleY: S, duration: 380, ease: 'Back.easeOut', easeParams: [3] });
    this.scene.tweens.add({ targets: this, lift: px(5.5), duration: 160, yoyo: true, repeat: 1, ease: 'Sine.easeOut', delay: 60 });
    fx.confetti(this.scene, x, feet - px(12), CONFETTI[c.dish.recipe ?? 'mystery']);
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

// Where a guest's feet touch the deck on row ty (sprites use origin 0.5, 1). Guests are a whole tile tall, so the
// rows above and below the middle spot stand a little further out (onto the deck margins), and stacked guests
// never stand on each other's heads.
const ROW_SPREAD = px(3);
export const customerFeet = (ty) => Math.round(tileCenter(ty) + TILE * 0.44 + (ty - DECK.spots[0].ty) * ROW_SPREAD);

// Customer portrait frame (for cards and the diary).
export const portraitArt = (id) => `${id}_front_0`;
