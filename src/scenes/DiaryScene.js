// The diary of the day, a notebook page: who came, what they ate, coins. Saves progress, then any key starts the next day.
import { CUSTOMERS, STRINGS, UPGRADE_TIP_COINS } from '../data.js';
import { loadSave, writeSave } from '../save.js';
import { SPOT_KEYS } from '../map.js';
import { t, pick, dishName } from '../text.js';
import { HAND, ART, artFrame, artImage, dishArt, portraitArt } from '../views.js';

const MAX_LINES = 12;
const PAGE = { x: 330, y: 50, w: 1260, h: 980 };
const LINE = 46; // ruled line spacing
const MOOD_ART = { happy: 'heart', cozycooked: 'heart_rustic', surprised: 'sparkle_1' };
const DESK = 0x1d2236; // the punched holes show the night behind the page
const MAX_STICKERS = 8;

export class DiaryScene extends Phaser.Scene {
  constructor() {
    super('diary');
  }

  // The last line of the page: never names a guest who did not come, nor cheers on a day with unserved guests.
  closingLine(guests, served) {
    if (!served.length) return pick(STRINGS.diary.closingQuiet);
    const fits = (c) => (typeof c === 'string')
      || (c.guest ? guests.some((g) => g.id === c.guest) : served.length === guests.length);
    const line = pick(STRINGS.diary.closing.filter(fits));
    return typeof line === 'string' ? line : line.text;
  }

  // summary: { day, guests: [{ id, recipe, mood, dish }], coinsToday, coinsTotal, spent: coins spent today,
  // early: closed up early, expected: returning guests who had not come yet }
  create(summary) {
    const { day, guests, coinsToday, coinsTotal, spent = 0, early, expected = [] } = summary;
    // Guests nobody served come back first tomorrow, with the same order (the diary promises it), then the
    // returning guests who never made it today.
    const returning = [...guests.filter((g) => !g.mood).map(({ id, recipe }) => ({ id, recipe })), ...expected];
    // Once, when the chef can afford something and a cupboard is still old: a tip about the catalog.
    const save = loadSave();
    const tip = !save.upgradeTip && coinsTotal >= UPGRADE_TIP_COINS && SPOT_KEYS.some((key) => !save.upgrades[key]);
    writeSave({ day: day + 1, coins: coinsTotal, returning, ...(tip ? { upgradeTip: true } : {}) });
    // Lines under the closing line (closed early, the tip): the totals move up to make room.
    const extra = [...(early ? [t('diary.early')] : []), ...(tip ? [t('diary.tip')] : [])];

    const served = guests.filter((g) => g.mood);
    this.page();
    const ink = { fontFamily: HAND, fontSize: '36px', color: '#3b3150' };
    const left = PAGE.x + 150;
    this.add.text(PAGE.x + PAGE.w / 2, PAGE.y + 70, t('diary.title', { day }), { ...ink, fontSize: '64px', color: '#5a3a6a' }).setOrigin(0.5);

    // One line per visit: a species already on the page reads "Another cane toad ...", then "One more cane toad ...".
    // The lines under the closing line take guest lines away, and so does "...and N more" on a busy day.
    const slots = MAX_LINES - extra.length;
    const shown = guests.length > slots ? slots - 1 : guests.length;
    const seen = new Map(); // species -> visits so far
    const lines = guests.slice(0, shown).map((g) => {
      const name = CUSTOMERS[g.id].name;
      const n = seen.get(g.id) ?? 0;
      const again = `diary.another.${(n - 1) % STRINGS.diary.another.length}`;
      const customer = n ? t(again, { customer: name.toLowerCase() }) : name;
      seen.set(g.id, n + 1);
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
      // A friendship heart earned on this visit: a pink sticker, slightly tilted.
      if (g.heart) artImage(this, left + label.width + 122, y - 6, 'heart_friend', 2.5).setAngle(-12);
    });
    if (guests.length > shown) {
      this.add.text(left, top + shown * LINE, t('diary.more', { n: guests.length - shown }), ink).setOrigin(0, 0.62);
    }

    // Totals, written at the bottom of the page.
    const ty = PAGE.y + 750 - extra.length * LINE;
    // Today's plates in the space left between the lines and the totals: each guest above their dish,
    // or just a row of the dishes on a busy day.
    const used = top + (shown + (guests.length > shown ? 1 : 0)) * LINE;
    const room = ty - used;
    if (room >= 120) this.stickers(this.stickerList(served), PAGE.x + PAGE.w / 2 + 40, Math.round((used + ty) / 2) - 30, room >= 230);
    this.add.sprite(left - 40, ty - 4, ART, artFrame('coin_0')).setScale(3).play('coin');
    const coins = [t('diary.coinsToday', { n: coinsToday }), ...(spent ? [t('diary.spent', { n: spent })] : []), t('diary.coinsTotal', { n: coinsTotal })];
    this.add.text(left, ty, coins.join(spent ? '   ' : '     '), { ...ink, fontSize: '40px' }).setOrigin(0, 0.62);
    this.add.text(left, ty + LINE, `${t('diary.served', { n: served.length })}     ${t('diary.rustic', { n: served.filter((g) => g.mood === 'cozycooked').length })}`, ink).setOrigin(0, 0.62);
    this.add.text(PAGE.x + PAGE.w / 2, ty + LINE * 2 + 10, this.closingLine(guests, served), { ...ink, color: '#8a5a7a' }).setOrigin(0.5, 0.62);
    extra.forEach((line, i) => {
      this.add.text(PAGE.x + PAGE.w / 2, ty + LINE * (3 + i) + 10, line, { ...ink, color: '#8a5a7a' }).setOrigin(0.5, 0.62);
    });
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

  // Up to MAX_STICKERS served guests, one of each dish first (so a new dish is never the one left out), in serving order.
  stickerList(served) {
    const key = (g) => g.dish.recipe ?? 'mystery';
    const firsts = served.filter((g, i) => served.findIndex((o) => key(o) === key(g)) === i);
    const picked = new Set(firsts.slice(0, MAX_STICKERS));
    for (const g of served) if (picked.size < MAX_STICKERS) picked.add(g);
    return served.filter((g) => picked.has(g));
  }

  // Served guests in a row, each one above the dish they had, with how they liked it (big = false: dishes only).
  stickers(list, cx, cy, big) {
    const step = big ? 150 : 110;
    list.forEach((g, i) => {
      const x = cx + (i - (list.length - 1) / 2) * step;
      if (!big) {
        artImage(this, x, cy + 14, dishArt(g.dish), 5);
        return;
      }
      artImage(this, x, cy - 36, portraitArt(g.id), 6);
      artImage(this, x, cy + 58, dishArt(g.dish), 5);
      artImage(this, x + 46, cy - 70, MOOD_ART[g.mood], 3);
    });
  }

  // The night lake behind the page (dark at the top, a little teal at the bottom, softly vignetted, a few faint
  // ripples), drawn once into a canvas texture (Canvas-safe), with lantern glows.
  backdrop() {
    const key = 'diaryNight';
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, 1920, 1080);
      const ctx = tex.getContext();
      const sky = ctx.createLinearGradient(0, 0, 0, 1080);
      sky.addColorStop(0, '#1a1b30');
      sky.addColorStop(0.55, '#1d2a40');
      sky.addColorStop(1, '#1f3a4a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = 'rgba(190, 220, 230, 0.07)';
      for (let i = 0; i < 46; i++) {
        const ry = 560 + ((i * 263) % 500);
        ctx.fillRect((i * 677) % 1920, ry - (ry % 6), 24 + ((i * 37) % 4) * 18, 6);
      }
      const vignette = ctx.createRadialGradient(960, 540, 300, 960, 540, 1150);
      vignette.addColorStop(0, 'rgba(10, 10, 24, 0)');
      vignette.addColorStop(1, 'rgba(10, 10, 24, 0.6)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, 1920, 1080);
      tex.refresh();
    }
    this.add.image(0, 0, key).setOrigin(0);
  }

  // A notebook page on the night lake: ruled lines, a red margin, spiral rings, lantern glows around it.
  page() {
    const { x, y, w, h } = PAGE;
    this.backdrop();
    this.add.image(x - 40, y + 60, 'glow').setScale(9).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
    this.add.image(x + w + 60, y + h - 120, 'glow').setScale(7).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 8, y + 12, w, h, 14);
    g.fillStyle(0xfbf3df).fillRoundedRect(x, y, w, h, 14);
    g.lineStyle(2, 0xa9c4e0, 0.7);
    for (let ly = y + 170 + 12; ly < y + h - 20; ly += LINE) g.lineBetween(x + 20, ly, x + w - 20, ly);
    g.lineStyle(3, 0xe39a9a, 0.8).lineBetween(x + 80, y + 10, x + 80, y + h - 10);
    for (let ry = y + 40; ry < y + h - 20; ry += 70) {
      g.fillStyle(DESK).fillCircle(x + 32, ry, 11);
      g.lineStyle(5, 0xb8b8c0).beginPath().arc(x + 20, ry, 18, -Math.PI / 2, Math.PI / 2, true).strokePath();
    }
  }
}
