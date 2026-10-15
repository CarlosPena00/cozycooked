// Time-of-day look, Canvas-safe (no tint, no shaders): dawn mist drifting over the lake, a rose-to-amber sunset
// wash, and a blue night that keeps the kitchen warm and readable (only the far lake gets dim), with lanterns,
// string lights on the deck and fireflies.
import { TILE, ART_SCALE, MAP, DAY, LANTERNS, KITCHEN, DECK } from './data.js';
import { DEPTH, tileCenter, artFrame, artImage, stretched, mixColor } from './views.js';

const NIGHT_MASK = 'nightMask';
const MASK_SCALE = 8; // the mask is drawn small and scaled up (smooth gradients are cheap that way)
const NIGHT_COLOR = 'rgb(20, 28, 66)';
const S = ART_SCALE;
const MAP_W = MAP[0].length * TILE;
const MAP_H = MAP.length * TILE;
const VIEW_H = 1080;
const MIST_SCALE = 8.5; // mist.png is 256x128: 2176x1088 on screen, two copies side by side
const MIST_SPEED = 14; // px/s
// Dawn mist stays on open water (tile boxes, inclusive), so it never washes over the kitchen, the deck or the guests.
const MIST_AREAS = [
  { left: 0, top: 0, right: 19, bottom: 0 }, // behind the kitchen roof, under the order cards
  { left: 0, top: 1, right: 3, bottom: 11 }, // the lake on the left
  { left: 13, top: 1, right: 16, bottom: 3 }, // above the deck
  { left: 17, top: 1, right: 19, bottom: 4 },
  { left: 17, top: 9, right: 19, bottom: 9 }, // below the pier
  { left: 4, top: 10, right: 19, bottom: 11 }, // under the bottom panel
];
const FIREFLIES = 10;
// The overlay copy of the wash, relative to the normal one. The overlay does most of the work: it tints the teal lake
// towards periwinkle and keeps its saturation, while a strong normal wash would grey it (max 1.0 at the 0.8 peak).
const SUNSET_OVERLAY = 1.0;
const SUNSET_KITCHEN = 0.5; // how much of the wash is cut out over the lamplit kitchen
const GLINT = 0xe8f4ee;
const GLINT_GOLD = 0xffd690; // glints at sunset
const lerp = (a, b, p) => a + (b - a) * p;

// Keyframes [t, ...] -> the two around t and how far between them (0..1).
function around(keys, t) {
  const i = keys.findIndex((k) => k[0] > t);
  if (i <= 0) return i === 0 ? [keys[0], keys[0], 0] : [keys.at(-1), keys.at(-1), 0];
  const a = keys[i - 1];
  const b = keys[i];
  return [a, b, (t - a[0]) / (b[0] - a[0])];
}
const valueAt = (keys, t) => {
  const [a, b, p] = around(keys, t);
  return lerp(a[1], b[1], p);
};

// Cuts a box (tile units, inclusive) out of a canvas with a soft edge: a few nested boxes, each a bit stronger.
// u = one tile in canvas pixels. Use with globalCompositeOperation 'destination-out'.
function softBox(ctx, u, { left, top, right, bottom }, strength, feather = 0.6) {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const inset = (feather * (i - steps / 2)) / steps;
    ctx.fillStyle = `rgba(0,0,0,${1 - (1 - strength) ** (1 / steps)})`;
    ctx.fillRect((left + inset) * u, (top + inset) * u, (right + 1 - left - 2 * inset) * u, (bottom + 1 - top - 2 * inset) * u);
  }
}

// Dark blue over the lake; the kitchen and the deck are cut out almost fully (warm and readable), lanterns
// open soft round holes. Built once at 1/8 size (all edges come out soft), then stretched to full size.
function bakeNightMask(scene) {
  if (scene.textures.exists(NIGHT_MASK)) return;
  const w = MAP_W / MASK_SCALE;
  const h = MAP_H / MASK_SCALE;
  const tex = scene.textures.createCanvas(`${NIGHT_MASK}Small`, w, h);
  const ctx = tex.getContext();
  ctx.fillStyle = NIGHT_COLOR;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-out';
  const u = TILE / MASK_SCALE; // one tile in mask pixels
  const box = (area, strength, feather) => softBox(ctx, u, area, strength, feather);
  const hole = (x, y, r, strength) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.5, `rgba(0,0,0,${strength * 0.7})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // The room with its walls (the back wall rises one more tile).
  box({ left: KITCHEN.left - 1, top: KITCHEN.top - 2, right: KITCHEN.right, bottom: KITCHEN.bottom + 1 }, 0.82);
  box(DECK.platform, 0.6);
  box({ ...DECK.pier, right: DECK.pier.right + 1 }, 0.45, 0.4);
  for (const { tx, ty } of [...LANTERNS.posts, ...LANTERNS.walls]) hole(tileCenter(tx) / MASK_SCALE, tileCenter(ty) / MASK_SCALE, 2.6 * u, 0.6);
  tex.refresh();
  stretched(scene, NIGHT_MASK, tex.key, MAP_W, MAP_H);
}

// The golden-hour wash, stretched over the view; the lamplit kitchen keeps half its own colours (soft-edged cut-out).
function bakeSunset(scene) {
  const key = 'sunsetFull';
  if (scene.textures.exists(key)) return key;
  stretched(scene, key, 'sunset', MAP_W, VIEW_H);
  const tex = scene.textures.get(key);
  const ctx = tex.getContext();
  ctx.globalCompositeOperation = 'destination-out';
  softBox(ctx, TILE, { left: KITCHEN.left, top: KITCHEN.top - 1, right: KITCHEN.right, bottom: KITCHEN.bottom }, SUNSET_KITCHEN, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  tex.refresh();
  return key;
}

export class Mood {
  constructor(scene) {
    this.scene = scene;
    bakeNightMask(scene);
    this.dark = 0;
    const layer = (o) => o.setDepth(DEPTH.daylight);
    this.sky = layer(scene.add.rectangle(0, 0, MAP_W, MAP_H, 0xffffff, 0).setOrigin(0));
    // Two copies of the mist side by side drift left; each is cut into one cropped image per lake area.
    const mist = stretched(scene, 'mistFull', 'mist', 256 * MIST_SCALE, 128 * MIST_SCALE);
    this.mistX = 0;
    this.mist = [0, 1].flatMap((copy) => MIST_AREAS.map((area) => {
      const img = layer(scene.add.image(0, 0, mist).setOrigin(0).setAlpha(0));
      return Object.assign(img, { copy, area: { x: area.left * TILE, y: area.top * TILE, r: (area.right + 1) * TILE, b: (area.bottom + 1) * TILE } });
    }));
    // The golden hour: a rose-to-amber wash, plus the same wash in overlay mode, which warms the blue lake towards
    // rose and amber instead of greying it (Canvas supports overlay; WebGL just draws it as a second wash).
    const sunset = bakeSunset(scene);
    this.sunset = [0, 1].map((i) => layer(scene.add.image(0, 0, sunset).setOrigin(0).setAlpha(0)
      .setBlendMode(i ? Phaser.BlendModes.OVERLAY : Phaser.BlendModes.NORMAL)));
    this.night = layer(scene.add.image(0, 0, NIGHT_MASK).setOrigin(0).setAlpha(0));
    // Lamplight: a big warm glow over the room, under the lantern glows.
    const cx = ((KITCHEN.left + KITCHEN.right) / 2) * TILE;
    const cy = ((KITCHEN.top + KITCHEN.bottom + 1) / 2) * TILE;
    const lamp = stretched(scene, 'lamplight', 'glow', 64 * 16, 64 * 12);
    this.lamplight = scene.add.image(cx, cy, lamp).setDepth(DEPTH.glow).setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.lit = false;
    this.lanterns = [];
    this.glows = [];
    for (const { tx, ty } of LANTERNS.posts) {
      // The post sprite is 16x32 art px, feet 2 art px into the tile below the post's tile.
      const post = scene.add.sprite(tileCenter(tx) + 2 * S, (ty + 1) * TILE + 2 * S, 'lanternPost', 1).setOrigin(0.5, 1).setScale(S).setDepth(DEPTH.lantern);
      this.lanterns.push(post);
      this.addGlow(post.x + 3 * S, post.y - 20 * S);
    }
    for (const { tx, ty } of LANTERNS.walls) {
      this.lanterns.push(artImage(scene, tileCenter(tx), tileCenter(ty), 'lantern_off').setDepth(DEPTH.lantern));
      this.addGlow(tileCenter(tx), tileCenter(ty) + S);
    }
    this.lights = this.makeLights();
    this.fireflies = this.makeFireflies();
    this.glints = this.makeGlints(16);
  }

  addGlow(x, y, scale = S * 1.125) {
    const size = Math.round(64 * scale);
    const glow = this.scene.add.image(x, y, stretched(this.scene, `glow${size}`, 'glow', size, size)).setDepth(DEPTH.glow).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.glows.push(glow);
  }

  // A string of bulbs between the first two lantern heads (one bulb per tile, the wire hangs from the tile edges).
  makeLights() {
    const [a, b] = LANTERNS.posts;
    if (!b) return [];
    const x0 = tileCenter(a.tx) + 5 * S;
    const tiles = Math.round((tileCenter(b.tx) - tileCenter(a.tx)) / TILE);
    const y = (a.ty + 1) * TILE - 16 * S;
    return Array.from({ length: tiles }, (_, i) => {
      const x = x0 + (i + 0.5) * TILE;
      this.addGlow(x, y + 8 * S, S * 0.5);
      return artImage(this.scene, x, y, 'lights_off').setOrigin(0.5, 0).setDepth(DEPTH.lantern);
    });
  }

  // Fireflies drift slowly over the water and the deck edges at night, blinking.
  makeFireflies() {
    const spots = [];
    MAP.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (ch === '~' && ty >= 2 && ty <= 9 && (tx < KITCHEN.left - 1 || tx > KITCHEN.right)) spots.push([tx, ty]);
    }));
    return Array.from({ length: FIREFLIES }, (_, i) => {
      const [tx, ty] = spots[(i * 7919) % spots.length];
      const fly = this.scene.add.sprite(tileCenter(tx), tileCenter(ty), 'art', artFrame('firefly_0')).setScale(S)
        .setDepth(DEPTH.glow).setAlpha(0).play({ key: 'firefly', startFrame: i % 2 });
      const home = { x: fly.x, y: fly.y };
      const wander = () => this.scene.tweens.add({
        targets: fly, x: home.x + Phaser.Math.Between(-TILE, TILE), y: home.y + Phaser.Math.Between(-TILE * 0.7, TILE * 0.7),
        duration: Phaser.Math.Between(2600, 4200), ease: 'Sine.easeInOut', onComplete: wander,
      });
      wander();
      return fly;
    });
  }

  // Tiny cream dashes (1 art px tall) that fade in and out on open water, each time somewhere else.
  // Only rows 2-9: rows 0-1 sit under the HUD cards and rows 10-11 under the bottom panel.
  makeGlints(n) {
    const water = [];
    MAP.forEach((row, ty) => [...row].forEach((ch, tx) => {
      if (ch === '~' && ty >= 2 && ty <= 9 && tx >= 2 && tx < MAP[0].length - 1) water.push([tx, ty]);
    }));
    return Array.from({ length: n }, (_, i) => {
      const glint = this.scene.add.rectangle(0, 0, 4 * S, S, GLINT, 1).setDepth(DEPTH.glint).setAlpha(0);
      const place = () => {
        const [tx, ty] = Phaser.Utils.Array.GetRandom(water);
        const inTile = () => Phaser.Math.Between(TILE * 0.12, TILE * 0.88);
        glint.setPosition(tx * TILE + inTile(), ty * TILE + inTile());
        glint.width = Phaser.Math.RND.pick([2, 3, 4]) * S;
      };
      place();
      this.scene.tweens.add({
        targets: glint, alpha: 0.45, duration: 1600, yoyo: true, repeat: -1, delay: i * 420,
        repeatDelay: Phaser.Math.Between(400, 1800), ease: 'Sine.easeInOut', onRepeat: place,
      });
      return glint;
    });
  }

  // Lanterns and string lights switch on (the scene emits lanternsOn at dusk, DAY.lanterns).
  light() {
    if (this.lit) return;
    this.lit = true;
    for (const l of this.lanterns) l.setFrame(l.texture.key === 'lanternPost' ? 0 : artFrame('lantern'));
    for (const l of this.lights) l.setFrame(artFrame('lights'));
    this.glows.forEach((glow, i) => this.scene.tweens.add({ targets: glow, alpha: 0.5, duration: 1500, delay: i * 120 }));
  }

  update(t, time) {
    const [a, b, p] = around(DAY.sky, t);
    const alpha = lerp(a[2], b[2], p);
    this.sky.setFillStyle(mixColor(a[1], b[1], p), alpha).setVisible(alpha > 0.005);
    const mist = valueAt(DAY.mist, t);
    const mistW = this.mist[0].width;
    if (mist > 0.005) this.mistX = (this.mistX - MIST_SPEED * (this.scene.game.loop.delta / 1000)) % mistW;
    for (const m of this.mist) {
      const x = this.mistX + m.copy * mistW;
      // The part of this copy over its area, in texture pixels (the texture is drawn 1:1 from the image's top left).
      const left = Math.max(0, m.area.x - x);
      const right = Math.min(mistW, m.area.r - x);
      const bottom = Math.min(m.height, m.area.b);
      const show = mist > 0.005 && right > left && bottom > m.area.y;
      m.setVisible(show);
      if (show) m.setPosition(x, 0).setAlpha(mist).setCrop(left, m.area.y, right - left, bottom - m.area.y);
    }
    const sunset = valueAt(DAY.sunset, t);
    this.sunset.forEach((wash, i) => wash.setAlpha(Math.min(1, sunset * (i ? SUNSET_OVERLAY : 1))).setVisible(sunset > 0.005));
    // The glints on the water turn warm gold with the golden hour.
    const gold = Math.round(Math.min(1, sunset / 0.8) * 10) / 10;
    if (gold !== this.glintGold) {
      this.glintGold = gold;
      for (const glint of this.glints) glint.setFillStyle(mixColor(GLINT, GLINT_GOLD, gold));
    }
    const night = valueAt(DAY.night, t);
    this.night.setAlpha(night).setVisible(night > 0.005);
    this.dark = Math.min(1, night / 0.6); // 0 by day .. 1 at night: the HUD and the done halo follow it
    const lamp = Math.min(1, night / 0.5) * 0.32;
    this.lamplight.setAlpha(lamp).setVisible(lamp > 0.005);
    const flies = Math.max(0, (night - 0.3) / 0.3);
    for (const fly of this.fireflies) fly.setAlpha(Math.min(1, flies)).setVisible(flies > 0.01);
    if (!this.lit) return;
    // A slow, gentle flicker.
    this.glows.forEach((glow, i) => {
      if (!this.scene.tweens.isTweening(glow)) glow.setAlpha(0.46 + 0.05 * Math.sin(time / 400 + i * 1.7));
    });
  }
}
