// Catalogs over the paused kitchen. An old cupboard's (data.spot): the upgrades not built yet, side by side, A/D or
// arrows choose. The deck's (no spot, C in the kitchen): cosmetic decor, string-light colours and aprons on a grid,
// WASD or arrows choose. E/Space buys (after a yes), Esc closes. Building and buying happen in the kitchen
// (KitchenScene.build, buyDecor, useDecor).
import { UPGRADES, DECK_DECOR, EVENT_SOUNDS } from '../data.js';
import { t } from '../text.js';
import { panel } from '../hud.js';
import { INK, COLORS, ART, artFrame, artImage, decorIcon, catalogArt } from '../views.js';
import { audio } from '../audio.js';

const CARD = { w: 440, h: 470, gap: 50, y: 290 };
// The deck grid: COLS cards a row.
const DECK_CARD = { w: 290, h: 290, gap: 24, y: 270, cols: 5 };
const sound = (event) => {
  const [name, volume, rate = 1] = EVENT_SOUNDS[event];
  audio.play(name, { volume, rate });
};

export class CatalogScene extends Phaser.Scene {
  constructor() {
    super('catalog');
  }

  // data.spot: the old cupboard station the chef is facing, or null for the deck catalog.
  create({ spot = null } = {}) {
    this.spot = spot;
    this.deck = !spot;
    this.kitchen = this.scene.get('kitchen');
    const built = Object.values(this.kitchen.upgrades);
    this.ids = this.deck ? Object.keys(DECK_DECOR) : Object.keys(UPGRADES).filter((id) => !built.includes(id));
    this.index = 0;
    this.confirming = false;

    const cx = 960;
    this.add.rectangle(0, 0, 1920, 1080, 0x1b1210, 0.55).setOrigin(0);
    const rowW = (n, c) => n * c.w + (n - 1) * c.gap;
    const w = this.deck ? rowW(DECK_CARD.cols, DECK_CARD) + 120 : rowW(this.ids.length, CARD) + 160;
    const pw = Math.max(1100, w);
    const top = this.deck ? 70 : 90;
    const ph = this.deck ? 940 : 900;
    this.add.graphics().fillStyle(COLORS.paper).fillRoundedRect(cx - pw / 2, top, pw, ph, 18);
    panel(this, cx - pw / 2, top, pw, ph);
    const ink = (x, y, text, style = {}) => this.add.text(x, y, text, { ...INK, ...style });
    ink(cx, top + 76, t(this.deck ? 'catalog.deckTitle' : 'catalog.title'), { fontSize: '60px', fontStyle: '600' }).setOrigin(0.5);
    ink(cx, top + 138, t(this.deck ? 'catalog.deckSubtitle' : 'catalog.subtitle'), { fontSize: '30px', color: COLORS.inkSoft }).setOrigin(0.5);

    if (this.deck) {
      const { cols, w: cw, h: ch, gap, y } = DECK_CARD;
      this.cards = this.ids.map((id, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, this.ids.length - row * cols);
        const left = cx - rowW(inRow, DECK_CARD) / 2;
        return this.deckCard(id, left + (i % cols) * (cw + gap), y + row * (ch + gap));
      });
    } else {
      const left = cx - rowW(this.ids.length, CARD) / 2;
      this.cards = this.ids.map((id, i) => this.card(id, left + i * (CARD.w + CARD.gap)));
    }
    // What the chef has to spend.
    const haveY = this.deck ? 905 : 830;
    this.have = ink(cx + 26, haveY, '', { fontSize: '32px' }).setOrigin(0.5);
    this.haveCoin = this.add.image(0, haveY, ART, artFrame('coin_hud')).setScale(3);
    this.footer = ink(cx, this.deck ? 962 : 910, '', { fontSize: '30px', color: COLORS.inkSoft, align: 'center' }).setOrigin(0.5);
    this.refresh();

    const kb = this.input.keyboard;
    for (const key of ['A', 'LEFT']) kb.on(`keydown-${key}`, () => this.move(-1));
    for (const key of ['D', 'RIGHT']) kb.on(`keydown-${key}`, () => this.move(1));
    if (this.deck) {
      for (const key of ['W', 'UP']) kb.on(`keydown-${key}`, () => this.move(-DECK_CARD.cols));
      for (const key of ['S', 'DOWN']) kb.on(`keydown-${key}`, () => this.move(DECK_CARD.cols));
      kb.on('keydown-C', () => this.close());
    }
    for (const key of ['E', 'SPACE']) kb.on(`keydown-${key}`, (e) => !e.repeat && this.buy());
    kb.on('keydown-ESC', () => (this.confirming ? this.setConfirm(false) : this.close()));
  }

  // One upgrade: its picture, name, what it does and its price (or how many coins are still missing).
  card(id, x) {
    const def = UPGRADES[id];
    const { w, y } = CARD;
    const cx = x + w / 2;
    const frame = this.add.graphics();
    // Big enough to read the furniture; the oven shows the new dish it bakes beside it.
    const art = artImage(this, def.dish ? cx - 44 : cx, y + 116, def.art, 8);
    const dish = def.dish ? artImage(this, cx + 92, y + 150, def.dish, 5) : null;
    const name = this.add.text(cx, y + 230, def.name, { ...INK, fontSize: '34px', fontStyle: '600', align: 'center' }).setOrigin(0.5);
    const text = this.add.text(cx, y + 300, def.text, {
      ...INK, fontSize: '26px', color: COLORS.inkSoft, align: 'center', wordWrap: { width: w - 60 },
    }).setOrigin(0.5);
    const coin = this.add.image(0, y + 400, ART, artFrame('coin_hud')).setScale(3);
    const price = this.add.text(0, y + 400, '', { ...INK, fontSize: '32px', fontStyle: '600' }).setOrigin(0, 0.5);
    return { id, def, x, y, w, h: CARD.h, frame, parts: [art, dish, name, text, coin, price].filter(Boolean), coin, price, cx };
  }

  // One deck catalog thing, smaller: its picture, name, a line about it, and its price or that it is yours.
  deckCard(id, x, y) {
    const def = DECK_DECOR[id];
    const { w, h } = DECK_CARD;
    const cx = x + w / 2;
    const frame = this.add.graphics();
    const look = catalogArt(id);
    const art = decorIcon(this, cx, y + 82, look, look.cols || look.bulbs ? 5 : 7);
    const name = this.add.text(cx, y + 160, def.name, { ...INK, fontSize: '28px', fontStyle: '600', align: 'center' }).setOrigin(0.5);
    const text = this.add.text(cx, y + 200, def.text, {
      ...INK, fontSize: '21px', color: COLORS.inkSoft, align: 'center', wordWrap: { width: w - 36 },
    }).setOrigin(0.5, 0.5);
    const coin = this.add.image(0, y + 254, ART, artFrame('coin_hud')).setScale(2.5);
    const price = this.add.text(0, y + 254, '', { ...INK, fontSize: '27px', fontStyle: '600' }).setOrigin(0, 0.5);
    return { id, def, x, y, w, h, frame, parts: [art, name, text, coin, price], coin, price, cx };
  }

  price(id) {
    return (this.deck ? DECK_DECOR : UPGRADES)[id].price;
  }

  owned(id) {
    return this.deck && !!this.kitchen.decor[id];
  }

  // An owned light colour or apron the kitchen uses right now.
  inUse(id) {
    const { kind } = DECK_DECOR[id];
    return this.owned(id) && (kind === 'lights' ? this.kitchen.lights : this.kitchen.apron) === id;
  }

  affordable(id) {
    return this.owned(id) || this.kitchen.wallet >= this.price(id);
  }

  // Redraw the cards (selection, dimmed when too dear) and the footer.
  refresh() {
    for (const [i, c] of this.cards.entries()) {
      const { x, y, w, h } = c;
      const selected = i === this.index;
      const ok = this.affordable(c.id);
      c.frame.clear();
      c.frame.fillStyle(selected ? 0xfbe9c2 : 0xf3e2c0).fillRoundedRect(x, y, w, h, 16);
      if (selected) {
        c.frame.lineStyle(10, 0xfff1c4, 0.6).strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 20);
        c.frame.lineStyle(5, 0xffd36b, 1).strokeRoundedRect(x, y, w, h, 16);
      }
      const owned = this.owned(c.id);
      const missing = this.price(c.id) - this.kitchen.wallet;
      let label = ok ? t('catalog.price', { n: this.price(c.id) }) : t('catalog.short', { n: missing });
      if (owned) label = t(DECK_DECOR[c.id].kind === 'place' ? 'catalog.owned' : this.inUse(c.id) ? 'catalog.inUse' : 'catalog.stored');
      c.price.setText(label).setColor(ok && !owned ? COLORS.ink : COLORS.inkSoft);
      c.coin.setVisible(!owned);
      const coinW = owned ? 0 : c.coin.displayWidth + 12;
      const total = coinW + c.price.width;
      c.coin.setX(c.cx - total / 2 + c.coin.displayWidth / 2);
      c.price.setX(c.cx - total / 2 + coinW);
      for (const p of c.parts) p.setAlpha(ok ? 1 : 0.45);
    }
    this.have.setText(t('catalog.have', { n: this.kitchen.wallet }));
    this.haveCoin.setX(this.have.x - this.have.width / 2 - 30);
    this.footer.setText(this.confirming ? this.question() : t(this.deck ? 'catalog.deckKeys' : 'catalog.keys'));
    this.footer.setColor(this.confirming ? COLORS.ink : COLORS.inkSoft);
  }

  // The yes/no line for the selected card.
  question() {
    const id = this.ids[this.index];
    if (!this.deck) return t('catalog.confirm', { price: UPGRADES[id].price });
    const name = DECK_DECOR[id].name.toLowerCase();
    if (!this.owned(id)) return t('catalog.buy', { name, price: DECK_DECOR[id].price });
    return t(this.inUse(id) ? 'catalog.putAway' : 'catalog.use', { name });
  }

  move(dir) {
    const next = this.index + dir;
    if (this.ids.length < 2) return;
    // Left/right wrap around; up/down on the grid stay in place at the edge.
    if (Math.abs(dir) > 1 && (next < 0 || next >= this.ids.length)) return;
    this.index = (next + this.ids.length) % this.ids.length;
    this.confirming = false;
    sound('interact');
    this.refresh();
  }

  setConfirm(on) {
    this.confirming = on;
    this.refresh();
  }

  // First E asks, the second buys (or uses / puts away an owned colour or apron). Too dear, or already on the
  // deck: a soft "nope" and a little wiggle of the price.
  buy() {
    const c = this.cards[this.index];
    if (!c) return;
    const placed = this.owned(c.id) && DECK_DECOR[c.id].kind === 'place';
    if (!this.affordable(c.id) || placed) {
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
    if (!this.deck) {
      this.close();
      kitchen.build(spot, c.id);
      return;
    }
    // Deck things: the catalog stays open (several little things can be bought in a row).
    if (this.owned(c.id)) kitchen.useDecor(c.id, !this.inUse(c.id));
    else kitchen.buyDecor(c.id);
    sound('build');
    this.setConfirm(false);
  }

  close() {
    this.scene.resume('kitchen');
    this.scene.stop();
  }
}
