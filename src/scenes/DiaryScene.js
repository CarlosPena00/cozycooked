// The diary of the day, a notebook page: who came, what they ate, coins. Saves progress, then any key starts the next day.
import { CUSTOMERS, STRINGS } from '../data.js';
import { writeSave } from '../save.js';
import { t, pick, dishName } from '../text.js';
import { HAND, ART, artFrame, artImage, dishArt, portraitArt } from '../views.js';

const MAX_LINES = 12;
const PAGE = { x: 330, y: 50, w: 1260, h: 980 };
const LINE = 46; // ruled line spacing
const MOOD_ART = { happy: 'heart', cozycooked: 'steam_2', surprised: 'sparkle_1' };

export class DiaryScene extends Phaser.Scene {
  constructor() {
    super('diary');
  }

  // summary: { day, guests: [{ id, recipe, mood, dish }], coinsToday, coinsTotal }
  create(summary) {
    const { day, guests, coinsToday, coinsTotal } = summary;
    writeSave({ day: day + 1, coins: coinsTotal });

    const served = guests.filter((g) => g.mood);
    this.page();
    const ink = { fontFamily: HAND, fontSize: '36px', color: '#3b3150' };
    const left = PAGE.x + 150;
    this.add.text(PAGE.x + PAGE.w / 2, PAGE.y + 70, t('diary.title', { day }), { ...ink, fontSize: '64px', color: '#5a3a6a' }).setOrigin(0.5);

    const lines = guests.slice(0, MAX_LINES).map((g) => {
      const customer = CUSTOMERS[g.id].name;
      if (!g.mood) return { g, text: t('diary.unserved', { customer }) };
      return { g, text: t('diary.line', { customer, dish: dishName(g.dish), mood: STRINGS.diary.mood[g.mood] }) };
    });
    const top = PAGE.y + 170;
    lines.forEach(({ g, text }, i) => {
      const y = top + i * LINE;
      artImage(this, left - 40, y - 4, portraitArt(g.id), 2.5);
      const label = this.add.text(left, y, text, ink).setOrigin(0, 0.62);
      if (g.mood) {
        artImage(this, left + label.width + 34, y - 4, dishArt(g.dish), 2.5);
        artImage(this, left + label.width + 78, y - 4, MOOD_ART[g.mood], 2);
      }
    });
    if (guests.length > MAX_LINES) {
      this.add.text(left, top + MAX_LINES * LINE, t('diary.more', { n: guests.length - MAX_LINES }), ink).setOrigin(0, 0.62);
    }

    // Totals, written at the bottom of the page.
    const ty = PAGE.y + 750;
    this.add.sprite(left - 40, ty - 4, ART, artFrame('coin_0')).setScale(3).play('coin');
    this.add.text(left, ty, `${t('diary.coinsToday', { n: coinsToday })}     ${t('diary.coinsTotal', { n: coinsTotal })}`, { ...ink, fontSize: '40px' }).setOrigin(0, 0.62);
    this.add.text(left, ty + LINE, `${t('diary.served', { n: served.length })}     ${t('diary.rustic', { n: served.filter((g) => g.mood === 'cozycooked').length })}`, ink).setOrigin(0, 0.62);
    this.add.text(PAGE.x + PAGE.w / 2, ty + LINE * 2 + 10, pick(STRINGS.diary.closing), { ...ink, color: '#8a5a7a' }).setOrigin(0.5, 0.62);
    // The footer sits on the page, in ink, so it reads well (it pulses once input opens).
    const footer = this.add.text(PAGE.x + PAGE.w / 2, PAGE.y + PAGE.h - 52, t('diary.next', { day: day + 1 }), {
      fontFamily: HAND, fontSize: '40px', color: '#4a2f5a',
    }).setOrigin(0.5).setAlpha(0);

    // A held key from the kitchen must not skip the diary: input opens after 1 s.
    let ready = false;
    this.time.delayedCall(1000, () => {
      ready = true;
      footer.setAlpha(1);
      this.tweens.add({ targets: footer, alpha: 0.75, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
    const next = () => {
      if (!ready) return;
      ready = false;
      this.scene.start('kitchen', { day: day + 1 });
    };
    this.input.keyboard.on('keydown', (e) => {
      if (e.key.toLowerCase() !== 'm' && !e.repeat) next();
    });
    this.input.on('pointerdown', next);
    this.cameras.main.fadeIn(500);
  }

  // A notebook page on a dark desk: ruled lines, a red margin, spiral rings, a tiny lantern glow.
  page() {
    const { x, y, w, h } = PAGE;
    this.add.rectangle(0, 0, 1920, 1080, 0x22232f).setOrigin(0);
    this.add.image(x - 40, y + 60, 'glow').setScale(9).setAlpha(0.35);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 8, y + 12, w, h, 14);
    g.fillStyle(0xfbf3df).fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(2, 0xa9c4e0, 0.7);
    for (let ly = y + 170 + 12; ly < y + h - 20; ly += LINE) g.lineBetween(x + 20, ly, x + w - 20, ly);
    g.lineStyle(3, 0xe39a9a, 0.8).lineBetween(x + 80, y + 10, x + 80, y + h - 10);
    for (let ry = y + 40; ry < y + h - 20; ry += 70) {
      g.fillStyle(0x22232f).fillCircle(x + 32, ry, 11);
      g.lineStyle(5, 0xb8b8c0).beginPath().arc(x + 20, ry, 18, -Math.PI / 2, Math.PI / 2, true).strokePath();
    }
  }
}
