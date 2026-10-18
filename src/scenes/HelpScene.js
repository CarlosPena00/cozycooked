// Pause/help overlay on top of the paused kitchen: controls and the recipes as picture cards (pão de queijo only
// once the clay oven is built). N closes the kitchen early for the day, after a confirm card.
import { RECIPES, INGREDIENTS, ASSEMBLIES, SPRITES, CUSTOMERS } from '../data.js';
import { t } from '../text.js';
import { writeSave } from '../save.js';
import { panel } from '../hud.js';
import { INK, COLORS, artImage, portraitArt, heartIcons } from '../views.js';

const KEYS = [['WASD', 'move'], ['E', 'interact'], ['C', 'catalog'], ['Esc', 'pause'], ['M', 'mute']];

// Picture steps for a recipe, in the order you do them. A chopped ingredient shows "raw -> board -> chopped";
// an assembly shows its parts (chopped first), then what they make: cheese -> board -> chopped + dough -> raw pastel.
function steps(id) {
  const recipe = RECIPES[id];
  const out = [];
  const part = (key) => {
    const [kind, chopped] = key.split(':');
    const art = INGREDIENTS[kind].art;
    if (chopped) out.push(art, '>', 'counter_board', '>', `${art}_chopped`);
    else out.push(art);
  };
  recipe.needs.forEach((key, i) => {
    if (i) out.push('+');
    const assembly = ASSEMBLIES.find((a) => a.makes === key);
    if (!assembly) return part(key);
    [...assembly.needs].sort((a, b) => b.includes(':') - a.includes(':')).forEach((k, j) => {
      if (j) out.push('+');
      part(k);
    });
    out.push('>', INGREDIENTS[key].art);
  });
  out.push('>', SPRITES[recipe.cooker], '>', recipe.art);
  return out;
}

export class HelpScene extends Phaser.Scene {
  constructor() {
    super('help');
  }

  create() {
    const cx = 960;
    this.add.rectangle(0, 0, 1920, 1080, 0x1b1210, 0.55).setOrigin(0);
    // Nearly full screen and opaque, so no order card or clock edge peeks out around or through it.
    this.add.graphics().fillStyle(COLORS.paper).fillRoundedRect(10, 8, 1900, 1064, 18);
    panel(this, 10, 8, 1900, 1064);
    const ink = (x, y, text, style = {}) => this.add.text(x, y, text, { ...INK, ...style });
    ink(cx, 120, t('help.title'), { fontSize: '60px', fontStyle: '600' }).setOrigin(0.5);

    ink(240, 190, t('help.recipes'), { fontSize: '34px', fontStyle: '600', color: COLORS.inkSoft });
    const kitchen = this.scene.get('kitchen');
    const recipes = kitchen.recipes();
    // Three cards fill the space above the rules; a fourth (the oven's) makes them all a little slimmer.
    const h = recipes.length > 3 ? 104 : 130;
    const gap = recipes.length > 3 ? 12 : 20;
    recipes.forEach((id, i) => this.recipeCard(id, RECIPES[id], 240, 240 + i * (h + gap), h));

    // Cozycooked is a feature: sleepy dishes.
    const ry = 712;
    ['dish_brigadeiro_under', 'dish_baiao_under', 'dish_pastel_under'].forEach((art, i) => artImage(this, 276 + i * 70, ry + 22, art, 4));
    ink(500, ry, t('help.rules'), { fontSize: '26px', wordWrap: { width: 980 }, lineSpacing: 4 });

    // Controls as key caps.
    ink(240, 820, t('help.controls'), { fontSize: '34px', fontStyle: '600', color: COLORS.inkSoft });
    let x = 240;
    for (const [cap, key] of KEYS) {
      const label = t(`help.${key}`).split(':')[0];
      const capText = this.add.text(0, 0, cap, { ...INK, fontSize: '26px', fontStyle: '600' });
      const w = Math.max(48, capText.width + 24);
      const g = this.add.graphics();
      g.fillStyle(0xe2c99a).fillRoundedRect(x, 870, w, 48, 10);
      g.fillStyle(0xfff8ea).fillRoundedRect(x, 866, w, 44, 10);
      g.lineStyle(2, COLORS.paperEdge).strokeRoundedRect(x, 866, w, 48, 10);
      capText.setPosition(x + w / 2, 888).setOrigin(0.5).setDepth(1);
      const text = ink(x + w + 14, 888, label, { fontSize: '26px' }).setOrigin(0, 0.5);
      x += w + text.width + 60;
    }
    this.friendsRow(kitchen.friends ?? {}, recipes);
    // The footer: back, close up for today (not once closing time has started), back to the title.
    const canClose = !kitchen.closing;
    const parts = [t('help.back'), ...(canClose ? [t('help.close')] : []), t('help.quit')];
    const footerStyle = { fontSize: '26px', color: COLORS.inkSoft, align: 'center', lineSpacing: 8 };
    this.footer = ink(cx, 975, parts.join('      ·      '), footerStyle).setOrigin(0.5);
    if (this.footer.width > 1760) this.footer.setText(`${parts.slice(0, -1).join('      ·      ')}\n${parts.at(-1)}`);
    this.confirmCard = this.closeCard(cx);

    this.done = false;
    for (const key of ['ESC', 'P', 'H']) {
      this.input.keyboard.on(`keydown-${key}`, () => (this.confirmCard.visible ? this.ask(false) : this.close()));
    }
    this.input.keyboard.on('keydown-N', (e) => {
      if (e.repeat || !canClose) return;
      if (this.confirmCard.visible) this.closeEarly();
      else this.ask(true);
    });
    this.input.keyboard.on('keydown-Q', () => {
      if (!this.confirmCard.visible) this.toTitle();
    });
  }

  // The regulars, a column right of the recipes: each guest's portrait, their hearts (grey outlines still to earn)
  // and their favourite dish (and the one they love, once this kitchen makes it), then how hearts work.
  friendsRow(friends, recipes) {
    const x = 1546;
    this.add.text(x, 190, t('help.friends'), { ...INK, fontSize: '34px', fontStyle: '600', color: COLORS.inkSoft });
    Object.keys(CUSTOMERS).forEach((id, i) => {
      const y = 282 + i * 88;
      artImage(this, x + 30, y - 4, portraitArt(id), 3.5);
      heartIcons(this, x + 84, y + 4, friends[id] ?? 0, 1.75, 30);
      const { favorite, loves } = CUSTOMERS[id];
      [favorite, loves].filter((r) => r && recipes.includes(r)).forEach((r, j) => artImage(this, x + 212 + j * 58, y, RECIPES[r].art, 3));
    });
    this.add.text(x, 712, t('help.friendsWhy'), { ...INK, fontSize: '22px', color: COLORS.inkSoft, wordWrap: { width: 330 }, lineSpacing: 2 });
  }

  // "Close the kitchen for today?" - a paper card in the middle of the page, over a dark dim.
  closeCard(cx) {
    const w = 1240;
    const h = 300;
    const y = 540 - h / 2;
    const card = this.add.container(0, 0).setVisible(false).setDepth(10);
    card.add(this.add.rectangle(0, 0, 1920, 1080, 0x1b1210, 0.6).setOrigin(0)); // dark enough that the recipe rows behind stay quiet
    const g = this.add.graphics().fillStyle(COLORS.paper).fillRoundedRect(cx - w / 2, y, w, h, 18);
    card.add([g, panel(this, cx - w / 2, y, w, h)]);
    const ink = (ty, text, style) => this.add.text(cx, ty, text, { ...INK, align: 'center', ...style }).setOrigin(0.5);
    card.add(ink(y + 70, t('help.closeAsk'), { fontSize: '48px', fontStyle: '600' }));
    card.add(ink(y + 150, t('help.closeWhy'), { fontSize: '28px', color: COLORS.inkSoft, wordWrap: { width: w - 120 } }));
    card.add(ink(y + 236, t('help.closeYes'), { fontSize: '30px', fontStyle: '600' }));
    return card;
  }

  // Show (or put away) the close-up card; the footer steps aside while it is up.
  ask(on) {
    this.confirmCard.setVisible(on);
    this.footer.setVisible(!on);
  }

  // Close up for today: back to the kitchen, which says good night and opens the diary.
  closeEarly() {
    if (this.done) return;
    this.done = true;
    const kitchen = this.scene.get('kitchen');
    this.close();
    kitchen.closeEarly();
  }

  // Back to the title: the day starts over next time, the coins picked up so far are kept
  // (coins still on the floor or in the air count too, like at closing time).
  toTitle() {
    if (this.done) return;
    this.done = true;
    const kitchen = this.scene.get('kitchen');
    writeSave({ coins: kitchen.wallet + kitchen.coins.length });
    this.scene.stop('kitchen');
    this.scene.start('title');
  }

  recipeCard(id, recipe, x, y, h = 130) {
    const slim = h < 130;
    const g = this.add.graphics();
    g.fillStyle(0xf6e6c4).fillRoundedRect(x, y, 1260, h, 16); // the regulars' column is on the right
    this.add.text(x + 24, y + (slim ? 10 : 16), recipe.name, { ...INK, fontSize: slim ? '30px' : '32px', fontStyle: '600' });
    this.add.text(x + 24, y + (slim ? 50 : 62), t(`help.${id}`), {
      ...INK, fontSize: slim ? '22px' : '24px', color: COLORS.inkSoft, wordWrap: { width: 380 },
    });
    const my = y + h / 2;
    let ix = x + 470;
    for (const step of steps(id)) {
      if (step === '+' || step === '>') {
        this.add.text(ix + 4, my, step === '+' ? '+' : '→', { ...INK, fontSize: '34px', color: COLORS.inkSoft }).setOrigin(0.5);
        ix += 40;
      } else {
        artImage(this, ix + 32, my, step, 4);
        ix += 76;
      }
    }
  }

  close() {
    this.scene.resume('kitchen');
    this.scene.stop();
  }
}
