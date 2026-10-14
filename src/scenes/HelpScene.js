// Pause/help overlay on top of the paused kitchen: controls and the three recipes as picture cards.
import { RECIPES, INGREDIENTS, ASSEMBLIES, SPRITES } from '../data.js';
import { t } from '../text.js';
import { panel } from '../hud.js';
import { INK, COLORS, artImage } from '../views.js';

const KEYS = [['WASD', 'move'], ['E', 'interact'], ['Esc', 'pause'], ['M', 'mute']];

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
    panel(this, 160, 60, 1600, 960);
    const ink = (x, y, text, style = {}) => this.add.text(x, y, text, { ...INK, ...style });
    ink(cx, 120, t('help.title'), { fontSize: '60px', fontStyle: '600' }).setOrigin(0.5);

    ink(240, 190, t('help.recipes'), { fontSize: '34px', fontStyle: '600', color: COLORS.inkSoft });
    Object.entries(RECIPES).forEach(([id, recipe], i) => this.recipeCard(id, recipe, 240, 240 + i * 150));

    // Cozycooked is a feature: sleepy dishes.
    const ry = 712;
    ['dish_brigadeiro_under', 'dish_baiao_under', 'dish_pastel_under'].forEach((art, i) => artImage(this, 276 + i * 70, ry + 22, art, 4));
    ink(500, ry, t('help.rules'), { fontSize: '26px', wordWrap: { width: 1180 }, lineSpacing: 4 });

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
    ink(cx, 970, t('help.back'), { fontSize: '26px', color: COLORS.inkSoft }).setOrigin(0.5);

    for (const key of ['ESC', 'P', 'H']) this.input.keyboard.on(`keydown-${key}`, () => this.close());
  }

  recipeCard(id, recipe, x, y) {
    const g = this.add.graphics();
    g.fillStyle(0xf6e6c4).fillRoundedRect(x, y, 1440, 130, 16);
    this.add.text(x + 24, y + 16, recipe.name, { ...INK, fontSize: '32px', fontStyle: '600' });
    this.add.text(x + 24, y + 62, t(`help.${id}`), { ...INK, fontSize: '24px', color: COLORS.inkSoft, wordWrap: { width: 380 } });
    let ix = x + 470;
    for (const step of steps(id)) {
      if (step === '+' || step === '>') {
        this.add.text(ix + 4, y + 65, step === '+' ? '+' : '→', { ...INK, fontSize: '34px', color: COLORS.inkSoft }).setOrigin(0.5);
        ix += 40;
      } else {
        artImage(this, ix + 32, y + 65, step, 4);
        ix += 76;
      }
    }
  }

  close() {
    this.scene.resume('kitchen');
    this.scene.stop();
  }
}
