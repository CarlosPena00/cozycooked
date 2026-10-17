// The furniture catalog of an old cupboard, over the paused kitchen: the upgrades not built yet, side by side.
// A/D or arrows choose, E/Space buys (after a yes), Esc closes. Building happens in the kitchen (KitchenScene.build).
import { UPGRADES, EVENT_SOUNDS } from '../data.js';
import { t } from '../text.js';
import { panel } from '../hud.js';
import { INK, COLORS, ART, artFrame, artImage } from '../views.js';
import { audio } from '../audio.js';

const CARD = { w: 440, h: 470, gap: 50, y: 290 };
const sound = (event) => {
  const [name, volume, rate = 1] = EVENT_SOUNDS[event];
  audio.play(name, { volume, rate });
};

export class CatalogScene extends Phaser.Scene {
  constructor() {
    super('catalog');
  }

  // data.spot: the old cupboard station the chef is facing.
  create({ spot }) {
    this.spot = spot;
    this.kitchen = this.scene.get('kitchen');
    const built = Object.values(this.kitchen.upgrades);
    this.ids = Object.keys(UPGRADES).filter((id) => !built.includes(id));
    this.index = 0;
    this.confirming = false;

    const cx = 960;
    this.add.rectangle(0, 0, 1920, 1080, 0x1b1210, 0.55).setOrigin(0);
    const w = this.ids.length * CARD.w + (this.ids.length - 1) * CARD.gap + 160;
    const pw = Math.max(1100, w);
    this.add.graphics().fillStyle(COLORS.paper).fillRoundedRect(cx - pw / 2, 90, pw, 900, 18);
    panel(this, cx - pw / 2, 90, pw, 900);
    const ink = (x, y, text, style = {}) => this.add.text(x, y, text, { ...INK, ...style });
    ink(cx, 170, t('catalog.title'), { fontSize: '60px', fontStyle: '600' }).setOrigin(0.5);
    ink(cx, 232, t('catalog.subtitle'), { fontSize: '30px', color: COLORS.inkSoft }).setOrigin(0.5);

    const left = cx - (this.ids.length * CARD.w + (this.ids.length - 1) * CARD.gap) / 2;
    this.cards = this.ids.map((id, i) => this.card(id, left + i * (CARD.w + CARD.gap)));
    // What the chef has to spend.
    const have = ink(cx + 26, 830, t('catalog.have', { n: this.kitchen.wallet }), { fontSize: '32px' }).setOrigin(0.5);
    this.add.image(have.x - have.width / 2 - 30, 830, ART, artFrame('coin_hud')).setScale(3);
    this.footer = ink(cx, 910, '', { fontSize: '30px', color: COLORS.inkSoft, align: 'center' }).setOrigin(0.5);
    this.refresh();

    const kb = this.input.keyboard;
    for (const key of ['A', 'LEFT']) kb.on(`keydown-${key}`, () => this.move(-1));
    for (const key of ['D', 'RIGHT']) kb.on(`keydown-${key}`, () => this.move(1));
    for (const key of ['E', 'SPACE']) kb.on(`keydown-${key}`, (e) => !e.repeat && this.buy());
    kb.on('keydown-ESC', () => (this.confirming ? this.setConfirm(false) : this.close()));
  }

  // One upgrade: its picture, name, what it does and its price (or how many coins are still missing).
  card(id, x) {
    const def = UPGRADES[id];
    const { w, h, y } = CARD;
    const cx = x + w / 2;
    const frame = this.add.graphics();
    const art = artImage(this, cx, y + 120, def.art, 6);
    const name = this.add.text(cx, y + 230, def.name, { ...INK, fontSize: '34px', fontStyle: '600', align: 'center' }).setOrigin(0.5);
    const text = this.add.text(cx, y + 300, def.text, {
      ...INK, fontSize: '26px', color: COLORS.inkSoft, align: 'center', wordWrap: { width: w - 60 },
    }).setOrigin(0.5);
    const coin = this.add.image(0, y + 400, ART, artFrame('coin_hud')).setScale(3);
    const price = this.add.text(0, y + 400, '', { ...INK, fontSize: '32px', fontStyle: '600' }).setOrigin(0, 0.5);
    return { id, def, x, frame, parts: [art, name, text, coin, price], coin, price, cx };
  }

  affordable(id) {
    return this.kitchen.wallet >= UPGRADES[id].price;
  }

  // Redraw the cards (selection, dimmed when too dear) and the footer.
  refresh() {
    const { w, h, y } = CARD;
    for (const [i, c] of this.cards.entries()) {
      const selected = i === this.index;
      const ok = this.affordable(c.id);
      c.frame.clear();
      c.frame.fillStyle(selected ? 0xfbe9c2 : 0xf3e2c0).fillRoundedRect(c.x, y, w, h, 16);
      if (selected) {
        c.frame.lineStyle(10, 0xfff1c4, 0.6).strokeRoundedRect(c.x - 4, y - 4, w + 8, h + 8, 20);
        c.frame.lineStyle(5, 0xffd36b, 1).strokeRoundedRect(c.x, y, w, h, 16);
      }
      const missing = c.def.price - this.kitchen.wallet;
      c.price.setText(ok ? t('catalog.price', { n: c.def.price }) : t('catalog.short', { n: missing }));
      c.price.setColor(ok ? COLORS.ink : COLORS.inkSoft);
      const total = c.coin.displayWidth + 12 + c.price.width;
      c.coin.setX(c.cx - total / 2 + c.coin.displayWidth / 2);
      c.price.setX(c.cx - total / 2 + c.coin.displayWidth + 12);
      for (const p of c.parts) p.setAlpha(ok ? 1 : 0.45);
    }
    const id = this.ids[this.index];
    this.footer.setText(this.confirming ? t('catalog.confirm', { price: UPGRADES[id].price }) : t('catalog.keys'));
    this.footer.setColor(this.confirming ? COLORS.ink : COLORS.inkSoft);
  }

  move(dir) {
    if (this.ids.length < 2) return;
    this.index = (this.index + dir + this.ids.length) % this.ids.length;
    this.confirming = false;
    sound('interact');
    this.refresh();
  }

  setConfirm(on) {
    this.confirming = on;
    this.refresh();
  }

  // First E asks, the second builds. Too dear: a soft "nope" and a little wiggle of the price.
  buy() {
    const c = this.cards[this.index];
    if (!c) return;
    if (!this.affordable(c.id)) {
      sound('nope');
      this.tweens.add({ targets: c.price, x: c.price.x + 8, duration: 50, yoyo: true, repeat: 2 });
      return;
    }
    if (!this.confirming) {
      sound('interact');
      this.setConfirm(true);
      return;
    }
    const { kitchen, spot } = this;
    this.close();
    kitchen.build(spot, c.id);
  }

  close() {
    this.scene.resume('kitchen');
    this.scene.stop();
  }
}
