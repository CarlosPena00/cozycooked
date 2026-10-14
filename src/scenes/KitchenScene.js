// One day in the kitchen. Thin glue: logic lives in stations.js, customers.js and day.js; looks in views.js and hud.js.
//
// Gameplay events (this.events), for juice and audio:
//   interact (station, action)   chop (station)   cookerAdd (station)   cookerDone (station)   fryerDone (station)
//   plate (station)   assemble (station)   bin (station)   serve (customer, mood)   coinDrop (coin)   coinLand (coin)
//   coinPick (coin)   phase (phaseId)   lanternsOn ()   customer (event, customer, extra)
import {
  TILE, ART_SCALE, SPEED, CHOPS_NEEDED, COIN_PICK_RADIUS, PLAYER_START, INGREDIENTS, COOKERS, COOK_LOOPS, DAY, DECK,
  KITCHEN, MAP, NEXT_FOR_INGREDIENT, RECIPES,
} from '../data.js';
import { resolve, cook, isCooker, ingredientKey, cookerStatus } from '../stations.js';
import { Day } from '../day.js';
import { Customers } from '../customers.js';
import { buildKitchen } from '../map.js';
import { Hud } from '../hud.js';
import { Mood } from '../mood.js';
import { audio } from '../audio.js';
import { loadSave } from '../save.js';
import { t, itemName, dishName, stationName, keyName } from '../text.js';
import {
  ART, SMALL, DEPTH, tileCenter, artFrame, itemArt, fx, StationView, CustomerView, ChefView,
} from '../views.js';

// Which extra event each action emits (besides `interact`).
const ACTION_EVENTS = {
  chop: 'chop', addPot: 'cookerAdd', addFryer: 'cookerAdd', plate: 'plate', plateEarly: 'plate', plateMystery: 'plate',
  makePastel: 'assemble', throwAway: 'bin',
};

const NIGHT_START = DAY.phases.find((p) => p.id === 'night').start;
const lerp = (a, b, p) => a + (b - a) * p;
// Labels and floating lines stay over the kitchen (walls included), never over the deck or the lake.
const KITCHEN_PX = { left: KITCHEN.left * TILE, right: KITCHEN.right * TILE };
const BODY = TILE * 0.6; // the chef's collision box: smaller than a tile so corners are forgiving
// ms without the action label after a happy moment (serve, plate), so no refusal pops up right after it.
const QUIET_AFTER = { serve: 1500, plate: 1000, plateEarly: 1000, plateMystery: 1000 };
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export class KitchenScene extends Phaser.Scene {
  constructor() {
    super('kitchen');
  }

  init(data) {
    this.dayNumber = data?.day ?? loadSave().day;
  }

  create() {
    this.wallet = loadSave().coins; // total coins, shown in the HUD
    this.coinsToday = 0;
    this.held = null;
    this.target = null;
    this.coins = [];
    this.closing = false;
    this.ending = false;
    this.closeTimer = 0;
    this.lanternsLit = false;

    const { ground, walls, stations } = buildKitchen(this);
    this.ground = ground;
    this.walls = walls;
    this.stations = stations;
    this.stationViews = new Map();
    for (const st of stations.values()) this.stationViews.set(st, new StationView(this, st));

    this.day = new Day(this.dayNumber);
    this.customers = new Customers(this.dayNumber, (event, c, extra) => this.onCustomer(event, c, extra));

    this.buildPlayer();
    this.mood = new Mood(this);
    this.hud = new Hud(this);
    audio.bind(this);
    this.bindJuice();

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE');
    for (const key of ['ESC', 'P', 'H']) this.input.keyboard.on(`keydown-${key}`, () => this.openHelp());
    this.cameras.main.fadeIn(400);
  }

  // Orders on the deck (guests walking in or waiting), oldest first. QA and the HUD read this; `.recipe` is writable.
  get orders() {
    return this.customers.orders;
  }

  // Debug helper (?debug): jump the day clock, e.g. skipTo(250) for sunset, skipTo(299) for closing.
  skipTo(seconds) {
    this.day.t = seconds;
  }

  // Debug helper (?debug): a guest appears now at a free spot, ready to be served (walk = true: walks in instead).
  // debugSpawn() = the next guest of the day; debugSpawn('toad', 'pastel'). Returns the customer or null (deck full).
  debugSpawn(id, recipe, walk = false) {
    return this.customers.debugSpawn(id, recipe, walk);
  }

  openHelp() {
    if (this.ending) return;
    audio.stopLoops();
    this.scene.launch('help');
    this.scene.pause();
  }

  // The physics body is an invisible box, smaller than a tile so corners feel forgiving; ChefView draws the chef.
  buildPlayer() {
    const x = tileCenter(PLAYER_START.tx);
    const y = tileCenter(PLAYER_START.ty);
    this.player = this.add.zone(x, y, BODY, BODY);
    this.physics.add.existing(this.player);
    this.physics.add.collider(this.player, this.walls);
    this.facing = { x: 0, y: -1 };
    this.chef = new ChefView(this, x, y);
    // Soft rounded outline on the station in front of the chef; it glides from station to station.
    this.highlight = this.add.graphics().setDepth(DEPTH.highlight).setVisible(false);
    const half = TILE / 2;
    this.highlight.lineStyle(10, 0xfff1c4, 0.35).strokeRoundedRect(-half - 3, -half - 3, TILE + 6, TILE + 6, 20);
    this.highlight.lineStyle(5, 0xffd36b, 1).strokeRoundedRect(-half, -half, TILE, TILE, 18);
    this.tweens.add({ targets: this.highlight, alpha: 0.6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.highlightAt = null;
    this.quietUntil = 0;
  }

  // Cozy feedback on gameplay events. Handlers are removed on shutdown (scene restarts keep the emitter).
  bindJuice() {
    const at = (st) => [tileCenter(st.tx), tileCenter(st.ty)];
    const handlers = {
      interact: () => this.chef.squash(),
      chop: (st) => {
        const { image } = this.stationViews.get(st).item;
        this.tweens.add({ targets: image, scaleY: image.scaleX * 0.77, duration: 70, yoyo: true });
      },
      cookerAdd: (st) => fx.float(this, at(st)[0], at(st)[1] - TILE * 0.3, 'steam_1', { rise: TILE * 0.6, duration: 700 }),
      cookerDone: (st) => fx.sparkle(this, ...at(st)),
      fryerDone: (st) => fx.sparkle(this, ...at(st)),
      bin: (st) => fx.float(this, at(st)[0], at(st)[1] - TILE * 0.3, 'steam_0', { rise: TILE * 0.6, duration: 700 }),
      coinLand: (coin) => this.tweens.add({ targets: coin, y: coin.y - TILE * 0.22, duration: 140, yoyo: true, repeat: 1, ease: 'Quad.easeOut' }),
      coinPick: (coin) => fx.float(this, coin.x, coin.y - TILE * 0.15, 'coin_0', { rise: TILE * 0.8, duration: 500 }),
    };
    for (const [event, fn] of Object.entries(handlers)) this.events.on(event, fn);
    this.events.once('shutdown', () => {
      for (const [event, fn] of Object.entries(handlers)) this.events.off(event, fn);
      audio.stopLoops();
    });
  }

  // Design hook: replace to draw customers differently.
  createCustomerView(customer) {
    return new CustomerView(this, customer);
  }

  onCustomer(event, c, extra = {}) {
    if (event === 'arrive') c.view = this.createCustomerView(c);
    if (extra.line && event !== 'served') c.view.say(extra.line, event === 'idle' ? DECK.idleSeconds : DECK.reactSeconds);
    if (event === 'gone') c.view.destroy();
    this.events.emit('customer', event, c, extra);
  }

  update(time, delta) {
    const dt = delta / 1000;
    this.tickDay(dt);
    this.customers.update(dt, this.day.t);
    for (const c of this.customers.list) c.view.sync(c, dt);
    for (const st of this.stations.values()) {
      if (cook(st, dt)) this.events.emit(COOKERS[st.type].doneEvent, st);
    }

    this.move(dt);
    this.target = this.findTarget();
    const { E, SPACE } = this.keys;
    if (this.target && (Phaser.Input.Keyboard.JustDown(E) || Phaser.Input.Keyboard.JustDown(SPACE))) this.use(this.target);

    this.collectCoins();
    this.draw(time);
  }

  tickDay(dt) {
    const phase = this.day.update(dt);
    if (phase) this.events.emit('phase', phase);
    if (!this.lanternsLit && this.day.t >= NIGHT_START) {
      this.lanternsLit = true;
      this.events.emit('lanternsOn');
    }
    if (this.day.closing && !this.closing) this.startClosing();
    if (!this.closing || this.ending) return;
    this.closeTimer += dt;
    const settled = this.customers.empty && !this.coins.length && this.closeTimer >= 1.5;
    if (settled || this.closeTimer >= DAY.closingMaxSeconds) this.endDay();
  }

  // Night: no more serving, everyone says goodbye, leftover coins fly to the chef.
  startClosing() {
    this.closing = true;
    this.customers.close();
    for (const coin of this.coins) {
      coin.ready = false;
      coin.tween?.stop();
      const from = { x: coin.x, y: coin.y };
      coin.tween = this.tweens.addCounter({
        from: 0, to: 1, duration: 600, ease: 'Quad.easeIn',
        onUpdate: (tw) => {
          const p = tw.getValue();
          coin.setPosition(lerp(from.x, this.player.x, p), lerp(from.y, this.player.y, p));
        },
        onComplete: () => {
          coin.tween = null;
          this.pickCoin(coin);
        },
      });
    }
  }

  endDay() {
    this.ending = true;
    audio.stopLoops();
    for (const coin of [...this.coins]) this.pickCoin(coin);
    const summary = {
      day: this.dayNumber,
      guests: this.customers.log.map((c) => ({ id: c.id, recipe: c.recipe, mood: c.mood, dish: c.dish, line: c.line })),
      coinsToday: this.coinsToday,
      coinsTotal: this.wallet,
    };
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('diary', summary));
  }

  move(dt) {
    const { W, A, S, D, UP, DOWN, LEFT, RIGHT } = this.keys;
    const dx = (D.isDown || RIGHT.isDown) - (A.isDown || LEFT.isDown);
    const dy = (S.isDown || DOWN.isDown) - (W.isDown || UP.isDown);
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(SPEED);
    const slide = this.cornerSlide(dx, dy, dt);
    if (dx && !dy) v.y = slide;
    if (dy && !dx) v.x = slide;
    this.player.body.setVelocity(v.x, v.y);
    if (dx || dy) this.facing = { x: dx, y: dy };
  }

  // Corner assist: walking straight while the body overlaps two lanes and one of them is blocked just ahead,
  // slide sideways into the open lane instead of snagging on the corner. -> sideways velocity (px/s).
  cornerSlide(dx, dy, dt) {
    if (!dx === !dy) return 0; // standing still or moving diagonally
    const c = this.player.body.center;
    const [along, across, dir] = dx ? [c.x, c.y, dx] : [c.y, c.x, dy];
    const next = Math.floor(along / TILE) + dir; // the next tile in the walking direction
    const lanes = [Math.floor((across - BODY / 2) / TILE), Math.floor((across + BODY / 2 - 1) / TILE)];
    if (lanes[0] === lanes[1]) return 0; // fits in one lane: nothing to snag on
    const open = lanes.filter((lane) => !this.solid(dx ? next : lane, dx ? lane : next));
    if (open.length !== 1) return 0; // both open (no corner) or both blocked (a wall ahead)
    const offset = tileCenter(open[0]) - across;
    return Math.sign(offset) * Math.min(SPEED, Math.abs(offset) / Math.max(dt, 1 / 120));
  }

  // Is the tile a wall or a station (anything the chef collides with)?
  solid(tx, ty) {
    const ch = MAP[ty]?.[tx];
    return ch === undefined || (ch !== '.' && ch !== '_');
  }

  // The station in front of the chef. Diagonals fall back to each axis, to be forgiving.
  findTarget() {
    const { x, y } = this.player;
    const { x: fx, y: fy } = this.facing;
    for (const [dx, dy] of [[fx, fy], [fx, 0], [0, fy]]) {
      if (!dx && !dy) continue;
      const tx = Math.floor((x + dx * TILE * 0.75) / TILE);
      const ty = Math.floor((y + dy * TILE * 0.75) / TILE);
      const station = this.stations.get(`${tx},${ty}`);
      if (station) return station;
    }
    return null;
  }

  context() {
    return { waiting: this.customers.waiting.length, closing: this.closing };
  }

  use(station) {
    const res = resolve(station, this.held, this.context());
    if (!res.action) {
      // The serve window explains itself on press (the prompt line already shows other reasons).
      if (station.type === 'serve' && res.reason) this.say(station, t(`reason.${res.reason}`));
      return;
    }
    this.events.emit('interact', station, res.action);
    if (res.action === 'serve') {
      this.serve(station);
      return;
    }
    this.held = res.run();
    if (QUIET_AFTER[res.action]) this.quietUntil = this.time.now + QUIET_AFTER[res.action];
    const event = ACTION_EVENTS[res.action];
    if (event) this.events.emit(event, station);
  }

  serve(window) {
    const result = this.customers.serve(this.held.dish, window.ty);
    if (!result) return;
    this.held = null;
    this.quietUntil = this.time.now + QUIET_AFTER.serve;
    result.customer.view.say(result.line, DECK.reactSeconds);
    this.events.emit('serve', result.customer, result.mood);
    this.dropCoins(result.customer, result.coins, window.ty);
  }

  // A short floating line next to a station, over the kitchen (clamped inside the kitchen box).
  say(station, message) {
    const label = fx.text(this, 0, tileCenter(station.ty) - TILE / 2, message, { ...SMALL, fontSize: '28px' });
    const half = label.width / 2;
    label.x = Phaser.Math.Clamp(tileCenter(station.tx) - TILE * 2.5, KITCHEN_PX.left + half, KITCHEN_PX.right - half);
  }

  // A spinning coin.
  makeCoin(x, y) {
    return this.add.sprite(x, y, ART, artFrame('coin_0')).setScale(Math.round(ART_SCALE * 0.7)).setDepth(DEPTH.coin)
      .play({ key: 'coin', startFrame: Phaser.Math.Between(0, 3) });
  }

  // Coins pop from the customer, arc over the window and land on the kitchen floor (DECK.coinArea), like in Kingdom.
  dropCoins(customer, amount, row) {
    const fromX = customer.x * TILE + TILE / 2;
    const fromY = tileCenter(row);
    const { cols, rows } = DECK.coinArea;
    const jitter = () => Phaser.Math.Between(-TILE / 4, TILE / 4);
    for (let i = 0; i < amount; i++) {
      const coin = this.makeCoin(fromX, fromY);
      coin.ready = false;
      this.coins.push(coin);
      const toX = tileCenter(Phaser.Math.Between(...cols)) + jitter();
      const toY = tileCenter(Phaser.Math.Between(...rows)) + jitter();
      coin.tween = this.tweens.addCounter({
        from: 0, to: 1, duration: 500, delay: i * 120,
        onUpdate: (tw) => {
          const p = tw.getValue();
          coin.setPosition(lerp(fromX, toX, p), lerp(fromY, toY, p) - Math.sin(Math.PI * p) * TILE);
        },
        onComplete: () => {
          coin.tween = null;
          coin.ready = true;
          this.events.emit('coinLand', coin);
        },
      });
      this.events.emit('coinDrop', coin);
    }
  }

  pickCoin(coin) {
    if (!this.coins.includes(coin)) return;
    coin.tween?.stop();
    this.coins.splice(this.coins.indexOf(coin), 1);
    this.wallet += 1;
    this.coinsToday += 1;
    this.events.emit('coinPick', coin);
    coin.destroy();
  }

  collectCoins() {
    for (const coin of [...this.coins]) {
      const near = Phaser.Math.Distance.Between(coin.x, coin.y, this.player.x, this.player.y) < COIN_PICK_RADIUS;
      if (coin.ready && near) this.pickCoin(coin);
    }
  }

  // A one-line guide for whoever has no idea what to do next (SPEC 7, first match wins).
  nextStep() {
    const { held, orders } = this;
    if (this.closing) return t('next.night');
    if (held?.dish) {
      if (!orders.length) return t('next.keepDish');
      if (!orders.some((c) => c.recipe === held.dish.recipe)) return t('next.notOrdered');
      return t('next.serveDish', { dish: dishName(held.dish) });
    }
    const cookers = [...this.stations.values()].filter((s) => isCooker(s) && s.contents.length);
    const ready = cookers.find((s) => s.progress >= 1);
    const upper = (s) => t(`station.${s.type}`).toUpperCase();
    if (held) return t(`next.${NEXT_FOR_INGREDIENT[ingredientKey(held)] ?? 'toPot'}`);
    // A recipe half in a pot: say what is still missing (taking it out now would make a mystery stew).
    for (const s of cookers) {
      const { recipe, missing } = cookerStatus(s);
      if (recipe && missing.length) {
        return t('next.missing', { station: upper(s), items: missing.map(keyName).join(' + '), dish: RECIPES[recipe].name });
      }
    }
    if (ready) return t('next.ready', { station: upper(ready) });
    if (this.coins.length) return t('next.coins');
    if (cookers.length) return t('next.cooking');
    if (orders.length) return t(`hint.${orders[0].recipe}`);
    return t('next.relax');
  }

  // Debug only (QA scripts read it; the game shows actionLabel instead):
  // "[E] Station: action", or "Station - why nothing happens", plus what the chef holds.
  promptLine() {
    const { target, held } = this;
    const parts = [];
    if (target) {
      const res = resolve(target, held, this.context());
      const name = stationName(target);
      if (res.action) {
        const item = res.action === 'take' ? INGREDIENTS[target.kind].name : held && itemName(held);
        parts.push(`[E] ${name}: ${t(`action.${res.action}`, { item, n: res.n, max: CHOPS_NEEDED })}`);
      } else {
        parts.push(res.reason ? `${name} - ${t(`reason.${res.reason}`, { n: res.n })}` : name);
      }
    }
    if (held) parts.push(t('hud.holding', { item: itemName(held) }));
    return parts.join('     ');
  }

  // The small label next to the chef: what E does here, or why nothing happens. Below the chef's feet,
  // or above the head when the station is below (so it never hides the station).
  actionLabel() {
    const { target, held } = this;
    if (!target || this.time.now < this.quietUntil) return null;
    const res = resolve(target, held, this.context());
    // Free hands at a serve window: stay quiet while walking past (the window explains itself on E, see use()).
    if (target.type === 'serve' && !held && !res.action) return null;
    let text;
    if (res.action) {
      const item = res.action === 'take' ? INGREDIENTS[target.kind].name : held && itemName(held);
      text = capitalize(t(`action.${res.action}`, { item, n: res.n, max: CHOPS_NEEDED }));
    } else if (res.reason) text = capitalize(t(`reason.${res.reason}`, { n: res.n }));
    else text = stationName(target);
    const below = target.ty > Math.floor(this.player.y / TILE);
    const y = below ? this.player.y - TILE * 1.2 : this.player.y + TILE * 0.5;
    return { text, ok: !!res.action, x: this.player.x, y, minX: KITCHEN_PX.left, maxX: KITCHEN_PX.right };
  }

  // Sky, night and lanterns (mood.js), Canvas-safe.
  applyDaylight(time) {
    if (this.lanternsLit) this.mood.light();
    this.mood.update(this.day.t, time);
  }

  draw(time) {
    const { x, y } = this.player;
    const moving = this.player.body.velocity.lengthSq() > 1;
    this.chef.sync(x, y, this.facing, moving, this.held);

    this.highlight.setVisible(!!this.target);
    if (this.target) {
      const tx = tileCenter(this.target.tx);
      const ty = tileCenter(this.target.ty);
      const jump = this.highlightAt !== this.target && !this.highlight.visible;
      const p = jump ? 1 : 0.35;
      this.highlight.setPosition(lerp(this.highlight.x, tx, p), lerp(this.highlight.y, ty, p));
      this.highlightAt = this.target;
    }

    const busy = { pot: false, fryer: false };
    for (const [st, view] of this.stationViews) {
      view.sync(st, time);
      if (isCooker(st) && st.contents.length && st.progress < 1) busy[st.type] = true;
    }
    for (const [type, [name, volume]] of Object.entries(COOK_LOOPS)) audio.loop(name, busy[type], volume);

    this.applyDaylight(time);

    this.hud.update({
      orders: this.orders,
      next: this.nextStep(),
      held: this.held && { art: itemArt(this.held), text: t('hud.holding', { item: itemName(this.held) }) },
      label: this.actionLabel(),
      coins: this.wallet,
      day: this.dayNumber,
      phase: this.day.phase,
      dayProgress: this.day.t / DAY.length,
      night: this.day.phase === 'night' || this.day.phase === 'closing',
      muted: audio.muted,
    });
  }
}
