// Kitchen HUD, laid out over the lake so it never covers the kitchen or the deck: order cards stacked on the left
// (like tickets on a rail), day clock top right, Next hint + held item in a strip under the kitchen, coins bottom
// right, and a small "E: action" label that follows the chef.
import { CUSTOMERS } from './data.js';
import { t, dishName } from './text.js';
import { TEXT, SMALL, INK, COLORS, DEPTH, ART, artFrame, artImage, recipeArt, portraitArt, pop, mixColor } from './views.js';

// Notices (a heart earned, a gift, something bought): cream pills over the open water above the deck, in up to two
// lanes so they never overlap each other (more wait their turn). x is the centre, kept between minX and maxX.
const NOTICE = { x: 1590, lanes: [262, 198], h: 50, minX: 1262, maxX: 1908, ms: 4000 };

const CARD = { x: 16, y: 16, w: 356, h: 112, gap: 12 };
const CLOCK = { x: 1654, y: 16, w: 250, h: 112 };
const BOTTOM = { x: 16, y: 970, w: 1236, h: 98 };
const COINS = { x: 1664, y: 970, w: 240, h: 84 };
const COIN_TICK_MS = 110;
const POUCH_SCALE = 4;

// Cream paper in lamplight: what the paper panels warm and dim to at night (no glare over the dark lake).
const NIGHT_PAPER = 0xd8bf98;
const NIGHT_EDGE = 0x6e4a32;
const DIM_STEPS = 10; // panels are redrawn only when the dimming moves a step

// A rounded panel with a soft drop shadow. style: 'paper' (cream, ink text) or 'wood' (dark, cream text).
// dim: 0 (day) .. 1 (night), paper only.
export function panel(scene, x, y, w, h, style = 'paper', dim = 0) {
  return drawPanel(scene.add.graphics(), x, y, w, h, style, dim);
}

function drawPanel(g, x, y, w, h, style, dim) {
  const paper = style === 'paper';
  g.clear().fillStyle(0x1b1210, 0.25).fillRoundedRect(x + 3, y + 5, w, h, 18);
  g.fillStyle(paper ? mixColor(COLORS.paper, NIGHT_PAPER, dim) : COLORS.wood, paper ? 0.97 : 0.84).fillRoundedRect(x, y, w, h, 18);
  g.lineStyle(3, paper ? mixColor(COLORS.paperEdge, NIGHT_EDGE, dim) : COLORS.woodEdge, 1).strokeRoundedRect(x, y, w, h, 18);
  return g;
}

export class Hud {
  constructor(scene) {
    this.scene = scene;
    const add = (o) => o.setDepth(DEPTH.hud);
    this.cards = add(scene.add.container(0, 0));
    this.ordersKey = null;
    this.dim = 0;

    this.clock = add(panel(scene, CLOCK.x, CLOCK.y, CLOCK.w, CLOCK.h));
    const cx = CLOCK.x + CLOCK.w / 2;
    // A wide, low arc (half an ellipse), so the sun and moon never touch "Day N" on their way over the top.
    this.arc = { x: cx, y: CLOCK.y + 98, rx: 104, ry: 77 };
    const arcPoint = (p) => ({ x: this.arc.x - Math.cos(Math.PI * p) * this.arc.rx, y: this.arc.y - Math.sin(Math.PI * p) * this.arc.ry });
    this.arcPoint = arcPoint;
    const g = add(scene.add.graphics());
    g.lineStyle(4, 0xe2c99a, 1).strokePoints(Array.from({ length: 49 }, (_, i) => arcPoint(i / 48)));
    this.dayText = add(scene.add.text(cx, CLOCK.y + 66, '', { ...INK, fontSize: '30px', fontStyle: '600' }).setOrigin(0.5));
    this.phaseText = add(scene.add.text(cx, CLOCK.y + 95, '', { ...INK, fontSize: '22px', color: COLORS.inkSoft }).setOrigin(0.5));
    this.sun = add(scene.add.circle(0, 0, 13, 0xffc83d).setStrokeStyle(4, 0xc9702a));

    add(panel(scene, BOTTOM.x, BOTTOM.y, BOTTOM.w, BOTTOM.h, 'wood'));
    this.nextText = add(scene.add.text(BOTTOM.x + 24, BOTTOM.y + 10, '', { ...TEXT, fontSize: '29px', color: COLORS.gold, strokeThickness: 0, wordWrap: { width: BOTTOM.w - 50 } }));
    this.heldIcon = add(scene.add.image(BOTTOM.x + 44, BOTTOM.y + 71, ART, 0).setScale(3).setVisible(false));
    this.heldText = add(scene.add.text(BOTTOM.x + 82, BOTTOM.y + 71, '', { ...TEXT, fontSize: '26px', color: COLORS.muted, strokeThickness: 0 }).setOrigin(0, 0.5));
    this.heldArt = null;

    add(panel(scene, COINS.x, COINS.y, COINS.w, COINS.h, 'wood'));
    const coinY = COINS.y + COINS.h / 2;
    // The coin pouch: it squashes a little with every coin counted in, and sparkles softly at every ten.
    this.pouch = add(scene.add.image(COINS.x + 52, coinY - 2, ART, artFrame('pouch')).setScale(POUCH_SCALE));
    this.coinsText = add(scene.add.text(COINS.x + 92, coinY, '', { ...TEXT, fontSize: '38px', fontStyle: '600', color: COLORS.gold }).setOrigin(0, 0.5));
    this.coinsShown = null; // counts up one coin at a time towards the wallet
    this.coinTickAt = 0;
    add(scene.add.text(BOTTOM.x + BOTTOM.w - 24, BOTTOM.y + 71, t('hud.controls'), { ...TEXT, fontSize: '22px', color: '#b8a48c', strokeThickness: 0 }).setOrigin(1, 0.5));
    this.muteText = add(scene.add.text(COINS.x + COINS.w / 2, COINS.y - 8, t('hud.muted'), { ...SMALL, color: COLORS.muted }).setOrigin(0.5, 1));

    this.label = new ActionLabel(scene);
    this.notices = { lanes: NOTICE.lanes.map(() => null), queue: [] };
  }

  // A notice pill for about 4 s: { id: guest portrait (optional), text, icons: (scene) => [images] after the text }.
  notice(n) {
    this.notices.queue.push(n);
    this.nextNotice();
  }

  nextNotice() {
    const { lanes, queue } = this.notices;
    let lane = lanes.indexOf(null);
    while (queue.length && lane >= 0) {
      lanes[lane] = this.openNotice(queue.shift(), lane);
      lane = lanes.indexOf(null);
    }
  }

  openNotice({ id, text, icons }, lane) {
    const { scene } = this;
    const h = NOTICE.h;
    const parts = [];
    let x = 16;
    if (id) {
      parts.push(artImage(scene, x + 20, 0, portraitArt(id), 2.5));
      x += 50;
    }
    const label = scene.add.text(x, 0, text, { ...INK, fontSize: '26px' }).setOrigin(0, 0.5);
    parts.push(label);
    x += label.width + 14;
    for (const icon of icons?.(scene) ?? []) {
      icon.setPosition(x + icon.displayWidth / 2, 0);
      parts.push(icon);
      x += icon.displayWidth + 2;
    }
    const w = x + 14;
    const g = scene.add.graphics();
    g.fillStyle(0x1b1210, 0.22).fillRoundedRect(2, -h / 2 + 4, w, h, h / 2);
    g.fillStyle(COLORS.paper, 0.97).fillRoundedRect(0, -h / 2, w, h, h / 2);
    g.lineStyle(3, COLORS.paperEdge).strokeRoundedRect(0, -h / 2, w, h, h / 2);
    const left = Math.max(NOTICE.minX, Math.min(NOTICE.x - w / 2, NOTICE.maxX - w));
    const box = scene.add.container(Math.round(left), NOTICE.lanes[lane], [g, ...parts]).setDepth(DEPTH.hud).setAlpha(0);
    box.y += 12;
    scene.tweens.add({ targets: box, alpha: 1, y: NOTICE.lanes[lane], duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: box, alpha: 0, y: NOTICE.lanes[lane] - 14, delay: NOTICE.ms, duration: 500,
      onComplete: () => {
        box.destroy();
        this.notices.lanes[lane] = null;
        this.nextNotice();
      },
    });
    return box;
  }

  // orders: waiting customers, oldest first. dayProgress: 0..1 over the day. dark: 0 (day) .. 1 (night).
  update({ orders, next, held, label, coins, day, phase, dayProgress, night, dark = 0, muted }) {
    const dim = Math.round(dark * DIM_STEPS) / DIM_STEPS;
    const dimmed = dim !== this.dim;
    if (dimmed) {
      this.dim = dim;
      drawPanel(this.clock, CLOCK.x, CLOCK.y, CLOCK.w, CLOCK.h, 'paper', dim);
    }
    this.renderOrders(orders, dimmed);
    this.nextText.setText(t('hud.next', { text: next }));
    this.renderHeld(held);
    this.countCoins(coins);
    this.muteText.setVisible(muted);
    this.dayText.setText(t('hud.day', { day }));
    this.phaseText.setText(t(`hud.phase.${phase}`));
    const { x, y } = this.arcPoint(Math.min(1, dayProgress));
    this.sun.setPosition(x, y);
    this.sun.setFillStyle(night ? 0xf3f0ff : 0xffc83d).setStrokeStyle(4, night ? 0x8a8fc0 : 0xc9702a);
    this.label.update(label);
  }

  // The coin counter ticks up one by one (the pouch squashes for each), so a serve feels like a little payday.
  // Spending (a purchase) snaps straight down: no pops for coins going out.
  countCoins(coins) {
    const now = this.scene.time.now;
    if (this.coinsShown === null || coins < this.coinsShown) this.coinsShown = coins;
    else if (coins !== this.coinsShown && now >= this.coinTickAt) {
      this.coinsShown += 1;
      this.coinTickAt = now + COIN_TICK_MS;
      this.squashPouch();
      if (this.coinsShown % 10 === 0) this.sparklePouch();
      this.coinsText.setScale(1.3);
      this.scene.tweens.add({ targets: this.coinsText, scale: 1, duration: 200, ease: 'Quad.easeOut' });
    }
    this.coinsText.setText(String(this.coinsShown));
  }

  squashPouch() {
    const { scene, pouch } = this;
    scene.tweens.killTweensOf(pouch);
    pouch.setScale(POUCH_SCALE);
    scene.tweens.add({ targets: pouch, scaleX: POUCH_SCALE * 1.12, scaleY: POUCH_SCALE * 0.84, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
  }

  // Two small sparkles over the pouch (on top of the HUD, unlike fx.sparkle).
  sparklePouch() {
    [[-18, -26, 4], [20, -12, 3]].forEach(([dx, dy, scale], i) => {
      const s = this.scene.add.sprite(this.pouch.x + dx, this.pouch.y + dy, ART, artFrame('sparkle_0'))
        .setScale(scale).setAlpha(0.85).setDepth(DEPTH.hud + 1);
      s.playAfterDelay('sparkle', i * 140);
      s.once('animationcomplete', () => s.destroy());
    });
  }

  renderHeld(held) {
    const art = held?.art ?? null;
    if (art !== this.heldArt) {
      this.heldArt = art;
      this.heldIcon.setVisible(!!art);
      if (art) {
        this.heldIcon.setFrame(artFrame(art));
        pop(this.scene, this.heldIcon, 3);
      }
    }
    this.heldText.setText(held ? held.text : t('hud.emptyHands'));
    this.heldText.x = art ? BOTTOM.x + 82 : BOTTOM.x + 24;
  }

  // Rebuilt only when the list of waiting orders changes (or the panels dim a step).
  renderOrders(orders, force = false) {
    const key = orders.map((c) => `${c.id}:${c.recipe}`).join(',');
    if (key === this.ordersKey && !force) return;
    const old = this.ordersKey ? this.ordersKey.split(',') : [];
    this.ordersKey = key;
    this.cards.removeAll(true);
    orders.slice(0, 3).forEach((c, i) => {
      const card = this.card(c, CARD.x, CARD.y + i * (CARD.h + CARD.gap));
      this.cards.add(card);
      if (!old.includes(`${c.id}:${c.recipe}`)) {
        card.x = -60;
        card.alpha = 0;
        this.scene.tweens.add({ targets: card, x: 0, alpha: 1, duration: 350, ease: 'Back.easeOut' });
      }
    });
  }

  card(c, x, y) {
    const { scene } = this;
    const { ingredients, cooker, dish } = recipeArt(c.recipe);
    const parts = [
      panel(scene, x, y, CARD.w, CARD.h, 'paper', this.dim),
      scene.add.circle(x + 44, y + 56, 34, mixColor(0xf3dfb8, 0xc9ad84, this.dim)),
      artImage(scene, x + 44, y + 56, portraitArt(c.id), 4),
      scene.add.text(x + 88, y + 8, t('hud.wants', { customer: CUSTOMERS[c.id].name }), { ...INK, fontSize: '22px', color: COLORS.inkSoft }),
      scene.add.text(x + 88, y + 32, dishName({ recipe: c.recipe, cooked: true }), { ...INK, fontSize: '28px', fontStyle: '600' }),
      artImage(scene, x + CARD.w - 40, y + 40, dish, 4),
    ];
    // Recipe as icons: a + b + c -> cooker.
    let ix = x + 104;
    const iy = y + 88;
    ingredients.forEach((art, i) => {
      if (i) parts.push(scene.add.text(ix - 20, iy, '+', { ...INK, fontSize: '22px', color: COLORS.inkSoft }).setOrigin(0.5));
      parts.push(artImage(scene, ix, iy, art, 2));
      ix += 40;
    });
    parts.push(scene.add.text(ix - 12, iy, '→', { ...INK, fontSize: '24px', color: COLORS.inkSoft }).setOrigin(0.5));
    parts.push(artImage(scene, ix + 16, iy, cooker, 2));
    return scene.add.container(0, 0, parts);
  }
}

// "E  take milk" next to the chef; refusals show in a softer style without the key.
class ActionLabel {
  constructor(scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.label);
    this.text = scene.add.text(0, 0, '', { ...INK, fontSize: '24px' }).setOrigin(0, 0.5).setDepth(DEPTH.label);
    this.key = scene.add.text(0, 0, 'E', { ...INK, fontSize: '22px', fontStyle: '600' }).setOrigin(0.5).setDepth(DEPTH.label);
    this.shown = null;
    this.w = 0;
  }

  // label: { text, ok, x, y, minX, maxX } (x, y = top centre; minX/maxX = left/right limits) or null.
  update(label) {
    const objs = [this.g, this.text, this.key];
    if (!label) {
      this.shown = null;
      for (const o of objs) o.setVisible(false);
      return;
    }
    const sig = `${label.ok}|${label.text}`;
    if (sig !== this.shown) {
      this.shown = sig;
      this.text.setText(label.text).setColor(label.ok ? COLORS.ink : COLORS.inkSoft).setFontStyle(label.ok ? '500' : 'italic');
      const pad = label.ok ? 46 : 14;
      this.w = pad + this.text.width + 16;
      const g = this.g.clear();
      g.fillStyle(0x1b1210, 0.22).fillRoundedRect(2, 4, this.w, 40, 20);
      g.fillStyle(COLORS.paper, label.ok ? 0.97 : 0.85).fillRoundedRect(0, 0, this.w, 40, 20);
      if (label.ok) {
        g.fillStyle(0xf6c453).fillRoundedRect(6, 5, 30, 30, 8);
        g.lineStyle(2, COLORS.paperEdge).strokeRoundedRect(6, 5, 30, 30, 8);
      }
      this.key.setVisible(label.ok);
      this.pad = pad;
    }
    const x = Math.round(Math.max(label.minX ?? -Infinity, Math.min(label.x - this.w / 2, label.maxX - this.w)));
    const y = Math.round(label.y);
    this.g.setPosition(x, y).setVisible(true);
    this.text.setPosition(x + this.pad, y + 20).setVisible(true);
    this.key.setPosition(x + 21, y + 20);
  }
}
