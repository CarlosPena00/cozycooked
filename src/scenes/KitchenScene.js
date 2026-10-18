// One day in the kitchen. Thin glue: logic lives in stations.js, customers.js and day.js; looks in views.js and hud.js.
//
// Gameplay events (this.events), for juice and audio:
//   interact (station, action)   chop (station)   cookerAdd (station)   cookerDone (station)   fryerDone (station)
//   plate (station)   assemble (station)   stack (station)   bin (station)   serve (customer, mood)   coinDrop (coin)
//   coinLand (coin)   coinPick (coin)   phase (phaseId)   lanternsOn ()   customer (event, customer, extra)
//   nope (station): E did nothing   build (station): an old cupboard became something new
//   heart (customer, hearts): a regular likes the chef a little more   gift (id): a regular left a gift on the deck
import {
  TILE, ART_SCALE, SPEED, CHOPS_NEEDED, COIN_PICK_RADIUS, PLAYER_START, INGREDIENTS, COOKERS, COOK_LOOPS, COOK_GRACE,
  CRATES, CUSTOMERS, DAY, DECK, KITCHEN, MAP, NEXT_FOR_INGREDIENT, RECIPES, ASSEMBLIES, GUIDE_DISHES, UPGRADES, COIN_LADDER,
  FRIEND_HEARTS, GIFTS, availableRecipes,
} from '../data.js';
import { resolve, cook, isCooker, ingredientKey, cookerStatus, waitingFor } from '../stations.js';
import { Day } from '../day.js';
import { Customers } from '../customers.js';
import { buildKitchen, spotStation } from '../map.js';
import { Hud } from '../hud.js';
import { Mood } from '../mood.js';
import { audio } from '../audio.js';
import { loadSave, writeSave } from '../save.js';
import { t, itemName, dishName, stationName, keyName } from '../text.js';
import {
  ART, DEPTH, tileCenter, artFrame, itemArt, fx, wiggle, StationView, CustomerView, ChefView, GuideArrow, giftImage,
} from '../views.js';

// Which extra event each action emits (besides `interact`).
const ACTION_EVENTS = {
  chop: 'chop', addPot: 'cookerAdd', addFryer: 'cookerAdd', addOven: 'cookerAdd', plate: 'plate', plateEarly: 'plate', plateMystery: 'plate',
  makePastel: 'assemble', throwAway: 'bin', cheeseOnDough: 'stack', doughUnder: 'stack',
};

const lerp = (a, b, p) => a + (b - a) * p;
// Labels and floating lines stay over the kitchen (walls included), never over the deck or the lake.
const KITCHEN_PX = { left: KITCHEN.left * TILE, right: KITCHEN.right * TILE };
const BODY = TILE * 0.6; // the chef's collision box: smaller than a tile so corners are forgiving
// ms without the action label after a happy moment (serve, plate), so no refusal pops up right after it,
// and while fresh food settles in a cooker (COOK_GRACE), so the label does not flicker through "it just went in".
const QUIET_AFTER = {
  serve: 1500, plate: 1000, plateEarly: 1000, plateMystery: 1000, addPot: COOK_GRACE * 1000, addFryer: COOK_GRACE * 1000,
  addOven: COOK_GRACE * 1000,
};
const CHOP_REPEAT_MS = 220; // holding E on a board with raw cheese keeps chopping, one chop per this many ms
const FLASH_MS = 1800; // how long the reason stays in the label after E did nothing
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
    this.dishesServed = loadSave().dishesServed; // ever, for the guide arrow
    this.coinsToday = 0;
    this.spentToday = 0; // coins spent in the catalog today (the diary says so)
    this.held = null;
    this.target = null;
    this.coins = [];
    this.closing = false;
    this.closedEarly = false;
    this.ending = false;
    this.chopAgainAt = 0;
    this.closeTimer = 0;
    this.lanternsLit = false;
    this.ladder = { step: -1, at: -Infinity }; // the coin chime's place on its scale, and when it last rang

    this.upgrades = loadSave().upgrades; // { "tx,ty": upgrade id } built on the old cupboards
    this.friends = loadSave().friends; // { species: hearts }
    this.gifts = loadSave().gifts; // species whose gift stands on the deck
    this.giftViews = new Map(this.gifts.map((id) => [id, giftImage(this, id)]));
    const { ground, walls, stations } = buildKitchen(this, this.upgrades);
    this.ground = ground;
    this.walls = walls;
    this.stations = stations;
    this.stationViews = new Map();
    for (const st of stations.values()) this.stationViews.set(st, new StationView(this, st));
    // From day 2, a price tag on each old cupboard hints that something can be built there.
    if (this.dayNumber >= 2) for (const st of stations.values()) if (st.type === 'spot') this.stationViews.get(st).showTag();

    this.day = new Day(this.dayNumber);
    this.customers = new Customers(this.dayNumber, (event, c, extra) => this.onCustomer(event, c, extra), loadSave().returning, this.recipes());

    this.buildPlayer();
    this.mood = new Mood(this);
    this.hud = new Hud(this);
    audio.bind(this);
    this.bindJuice();

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE');
    for (const key of ['ESC', 'P', 'H']) this.input.keyboard.on(`keydown-${key}`, () => this.openHelp());
    // Back from the help or the catalog: forget the keys pressed there (an E that built an oven must not use it too).
    const forgetKeys = () => this.input.keyboard.resetKeys();
    this.events.on('resume', forgetKeys);
    this.events.once('shutdown', () => this.events.off('resume', forgetKeys));
    this.cameras.main.fadeIn(400);
  }

  // Recipes this kitchen can make (pão de queijo needs the clay oven).
  recipes() {
    return availableRecipes(new Set([...this.stations.values()].filter(isCooker).map((s) => s.type)));
  }

  // Orders on the deck (guests walking in or waiting), oldest first. QA and the HUD read this; `.recipe` is writable.
  get orders() {
    return this.customers.orders;
  }

  // Debug helper (?debug): jump the day clock, e.g. skipTo(185) for sunset, skipTo(239) for closing.
  skipTo(seconds) {
    this.day.t = seconds;
  }

  // Debug helper (?debug): a guest appears now at a free spot, ready to be served (walk = true: walks in instead).
  // debugSpawn() = the next guest of the day; debugSpawn('toad', 'pastel'). Returns the customer or null (deck full).
  debugSpawn(id, recipe, walk = false) {
    return this.customers.debugSpawn(id, recipe, walk);
  }

  // Debug helper (?debug): coins for testing the catalog, e.g. debugCoins(100). Saved like a purchase.
  debugCoins(n = 50) {
    this.wallet += n;
    writeSave({ coins: this.wallet });
    return this.wallet;
  }

  openHelp() {
    if (this.ending) return;
    audio.stopLoops();
    this.scene.launch('help');
    this.scene.pause();
  }

  // The catalog of an old cupboard, over the paused kitchen (like the help).
  openCatalog(spot) {
    if (this.ending) return;
    audio.stopLoops();
    this.scene.launch('catalog', { spot });
    this.scene.pause();
  }

  // The catalog bought upgrade `id` for this old cupboard: it becomes that station, for good (saved right away).
  build(spot, id) {
    const key = `${spot.tx},${spot.ty}`;
    if (this.stations.get(key) !== spot || spot.type !== 'spot' || Object.values(this.upgrades).includes(id)) return null;
    const station = spotStation(spot.tx, spot.ty, id);
    this.stationViews.get(spot).destroy();
    this.stationViews.delete(spot);
    this.stations.set(key, station);
    this.stationViews.set(station, new StationView(this, station));
    this.wallet -= UPGRADES[id].price;
    this.spentToday += UPGRADES[id].price;
    this.upgrades = { ...this.upgrades, [key]: id };
    writeSave({ coins: this.wallet, upgrades: this.upgrades });
    this.customers.recipes = this.recipes();
    // A celebration: the next new guest orders the dish the new furniture makes.
    if (station.type === 'oven') this.customers.firstOrder = 'paodequeijo';
    this.target = null;
    const [x, y] = [tileCenter(spot.tx), tileCenter(spot.ty)];
    [[0, 0], [-TILE * 0.35, -TILE * 0.2], [TILE * 0.35, -TILE * 0.1]].forEach(([dx, dy], i) => {
      this.time.delayedCall(i * 180, () => fx.sparkle(this, x + dx, y + dy));
    });
    fx.text(this, x, y - TILE * 0.6 - 30, t('catalog.built'));
    this.events.emit('build', station);
    return station;
  }

  // Close up early (from the help): closing time starts now, the clock stays where it is. Unserved guests say
  // goodbye and come back tomorrow, floor coins fly to the chef, then the diary - the same path as the night.
  closeEarly() {
    if (this.closing || this.ending) return;
    this.closedEarly = true;
    this.day.close();
    this.events.emit('phase', 'closing');
    this.startClosing();
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
    // New chefs: a soft bouncing arrow over the station the "Next:" hint talks about, until GUIDE_DISHES are served.
    this.guide = this.dishesServed < GUIDE_DISHES ? new GuideArrow(this) : null;
    this.flash = null; // { station, reason, until }: the reason shown after E did nothing
  }

  // Cozy feedback on gameplay events. Handlers are removed on shutdown (scene restarts keep the emitter).
  bindJuice() {
    const at = (st) => [tileCenter(st.tx), tileCenter(st.ty)];
    const handlers = {
      interact: () => this.chef.squash(),
      nope: (st) => {
        this.stationViews.get(st).wiggle();
        wiggle(this, this.highlight, 5);
      },
      chop: (st) => {
        const { image } = this.stationViews.get(st).item;
        this.tweens.add({ targets: image, scaleY: image.scaleX * 0.77, duration: 70, yoyo: true });
      },
      cookerAdd: (st) => fx.float(this, at(st)[0], at(st)[1] - TILE * 0.3, 'steam_1', { rise: TILE * 0.6, duration: 700 }),
      cookerDone: (st) => fx.sparkle(this, ...at(st)),
      fryerDone: (st) => fx.sparkle(this, ...at(st)),
      bin: (st) => fx.float(this, at(st)[0], at(st)[1] - TILE * 0.3, 'steam_0', { rise: TILE * 0.6, duration: 700 }),
      coinLand: (coin) => this.tweens.add({ targets: coin, y: coin.y - TILE * 0.22, duration: 140, yoyo: true, repeat: 1, ease: 'Quad.easeOut' }),
      coinPick: (coin) => {
        fx.float(this, coin.x, coin.y - TILE * 0.15, 'coin_0', { rise: TILE * 0.8, duration: 500 });
        this.chime();
      },
    };
    for (const [event, fn] of Object.entries(handlers)) this.events.on(event, fn);
    this.events.once('shutdown', () => {
      for (const [event, fn] of Object.entries(handlers)) this.events.off(event, fn);
      audio.stopLoops();
    });
  }

  // A picked coin rings one step higher than the one just before it (within COIN_LADDER.gapMs), else from the bottom.
  chime() {
    const { steps, gapMs, sound, volume } = COIN_LADDER;
    const now = this.time.now;
    this.ladder.step = now - this.ladder.at <= gapMs ? Math.min(this.ladder.step + 1, steps.length - 1) : 0;
    this.ladder.at = now;
    audio.play(sound, { volume, rate: 2 ** (steps[this.ladder.step] / 12) });
  }

  // Design hook: replace to draw customers differently.
  createCustomerView(customer) {
    return new CustomerView(this, customer);
  }

  onCustomer(event, c, extra = {}) {
    if (event === 'arrive') {
      c.view = this.createCustomerView(c);
      c.hearts = this.friends[c.id] ?? 0; // a guest who arrives with every heart brings a gift
    }
    if (extra.line && event !== 'served') c.view.say(extra.line, event === 'idle' ? DECK.idleSeconds : DECK.reactSeconds);
    if (event === 'gone') c.view.destroy();
    this.events.emit('customer', event, c, extra);
  }

  update(time, delta) {
    const dt = delta / 1000;
    this.tickDay(dt);
    this.customers.update(dt, this.day.t);
    const chef = this.held?.dish ? { x: this.player.x, y: this.player.y, recipe: this.held.dish.recipe } : null;
    for (const c of this.customers.list) c.view.sync(c, dt, chef);
    for (const st of this.stations.values()) {
      if (cook(st, dt)) this.events.emit(COOKERS[st.type].doneEvent, st);
    }

    this.move(dt);
    this.target = this.findTarget();
    const { E, SPACE } = this.keys;
    if (this.target && (Phaser.Input.Keyboard.JustDown(E) || Phaser.Input.Keyboard.JustDown(SPACE))) {
      this.use(this.target);
      this.chopAgainAt = time + CHOP_REPEAT_MS;
    } else if (this.target && (E.isDown || SPACE.isDown) && time >= this.chopAgainAt && this.choppable(this.target)) {
      // Holding E keeps chopping (only chopping repeats).
      this.use(this.target);
      this.chopAgainAt = time + CHOP_REPEAT_MS;
    }

    this.collectCoins();
    this.draw(time);
  }

  tickDay(dt) {
    const phase = this.day.update(dt);
    if (phase) this.events.emit('phase', phase);
    if (!this.lanternsLit && this.day.t >= DAY.lanterns) {
      this.lanternsLit = true;
      this.events.emit('lanternsOn');
    }
    if (this.day.closing && !this.closing) this.startClosing();
    if (!this.closing || this.ending) return;
    this.closeTimer += dt;
    const settled = this.customers.empty && !this.coins.length && this.closeTimer >= 1.5;
    if (settled || this.closeTimer >= DAY.closingMaxSeconds) this.endDay();
  }

  // Night: no more serving, everyone says goodbye, leftover coins fly to the chef one after another (their chimes
  // climb the scale), and the last one lands with a deeper clunk.
  startClosing() {
    this.closing = true;
    this.customers.close();
    let flying = this.coins.length;
    this.coins.forEach((coin, i) => {
      coin.ready = false;
      coin.tween?.stop();
      const from = { x: coin.x, y: coin.y };
      coin.tween = this.tweens.addCounter({
        from: 0, to: 1, duration: 600, delay: Math.min(i * 110, 1600), ease: 'Quad.easeIn',
        onUpdate: (tw) => {
          const p = tw.getValue();
          coin.setPosition(lerp(from.x, this.player.x, p), lerp(from.y, this.player.y, p));
        },
        onComplete: () => {
          coin.tween = null;
          this.pickCoin(coin);
          flying -= 1;
          if (!flying) this.time.delayedCall(140, () => audio.play(COIN_LADDER.sound, { volume: COIN_LADDER.volume + 0.1, rate: COIN_LADDER.clunkRate }));
        },
      });
    });
  }

  endDay() {
    this.ending = true;
    audio.stopLoops();
    for (const coin of [...this.coins]) this.pickCoin(coin);
    const summary = {
      day: this.dayNumber,
      guests: this.customers.log.map((c) => ({ id: c.id, recipe: c.recipe, mood: c.mood, dish: c.dish, line: c.line, heart: !!c.heart })),
      coinsToday: this.coinsToday,
      coinsTotal: this.wallet,
      spent: this.spentToday,
      early: this.closedEarly,
      // Yesterday's guests who had not come yet (closed early, or a busy deck): they still come back tomorrow.
      expected: this.dayNumber > 1 ? this.customers.pending.map(({ id, recipe }) => ({ id, recipe })) : [],
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
    // Diagonal into a wall: slide along it at full speed instead of the diagonal's slower share.
    if (dx && dy) {
      const wallX = this.against(dx, 0);
      const wallY = this.against(0, dy);
      if (wallX && !wallY) v.set(0, dy * SPEED);
      if (wallY && !wallX) v.set(dx * SPEED, 0);
    }
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

  // Is the chef's body touching something solid on its (dx, dy) side (one axis at a time)?
  against(dx, dy) {
    const b = this.player.body;
    const edge = dx > 0 ? b.right + 1 : dx < 0 ? b.left - 1 : dy > 0 ? b.bottom + 1 : b.top - 1;
    const [from, to] = dx ? [b.top, b.bottom - 1] : [b.left, b.right - 1];
    const cell = Math.floor(edge / TILE);
    for (let t = Math.floor(from / TILE); t <= Math.floor(to / TILE); t++) {
      if (dx ? this.solid(cell, t) : this.solid(t, cell)) return true;
    }
    return false;
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

  // Would E chop here right now?
  choppable(station) {
    return resolve(station, this.held, this.context()).action === 'chop';
  }

  use(station) {
    const res = resolve(station, this.held, this.context());
    if (!res.action) {
      // A gentle "nope": the station wiggles, a soft click, and the reason stays in the label for a moment.
      this.flash = res.reason ? { station, reason: res.reason, until: this.time.now + FLASH_MS } : null;
      this.events.emit('nope', station);
      return;
    }
    this.flash = null;
    this.events.emit('interact', station, res.action);
    if (res.action === 'serve') {
      this.serve(station);
      return;
    }
    if (res.action === 'browse') {
      this.openCatalog(station);
      return;
    }
    this.held = res.run();
    if (QUIET_AFTER[res.action]) this.quietUntil = this.time.now + QUIET_AFTER[res.action];
    const event = ACTION_EVENTS[res.action];
    if (event) this.events.emit(event, station);
    // The last chop on a cheese-and-dough stack makes the pastel.
    if (res.action === 'chop' && station.item.kind === 'pastel') this.events.emit('assemble', station);
  }

  serve(window) {
    const result = this.customers.serve(this.held.dish, window.ty);
    if (!result) return;
    this.held = null;
    this.quietUntil = this.time.now + QUIET_AFTER.serve;
    result.customer.view.say(result.line, DECK.reactSeconds);
    this.events.emit('serve', result.customer, result.mood);
    this.dropCoins(result.customer, result.coins, window.ty);
    this.befriend(result.customer, result.favorite);
    this.dishesServed += 1;
    writeSave({ dishesServed: this.dishesServed });
    // The chef knows the way now: the arrow fades out for good.
    if (this.guide && this.dishesServed >= GUIDE_DISHES) {
      this.guide.fadeOut();
      this.guide = null;
    }
  }

  // Regulars: their favorite just right earns a heart (never lost); a guest who came with every heart leaves a gift.
  befriend(c, favorite) {
    const hearts = this.friends[c.id] ?? 0;
    if (favorite && hearts < FRIEND_HEARTS) {
      this.friends = { ...this.friends, [c.id]: hearts + 1 };
      c.heart = true; // the diary puts a heart sticker on this line
      writeSave({ friends: this.friends });
      c.view.showHearts(c, hearts + 1);
      this.events.emit('heart', c, hearts + 1);
    }
    if (c.hearts >= FRIEND_HEARTS && !this.gifts.includes(c.id)) this.receiveGift(c.id);
  }

  // A regular's gift appears on its deck spot, for good.
  receiveGift(id) {
    this.gifts = [...this.gifts, id];
    writeSave({ gifts: this.gifts });
    const img = giftImage(this, id);
    this.giftViews.set(id, img);
    const scale = img.scale;
    img.setScale(scale * 0.4);
    this.tweens.add({ targets: img, scale, duration: 420, delay: 600, ease: 'Back.easeOut', easeParams: [3] });
    this.time.delayedCall(600, () => {
      fx.sparkle(this, img.x, img.y - img.displayHeight / 2);
      const label = fx.text(this, img.x, img.y - img.displayHeight - 8, t('friends.gift', { customer: CUSTOMERS[id].name.toLowerCase(), gift: GIFTS[id].name }));
      label.x = Phaser.Math.Clamp(label.x, label.width / 2 + 20, this.scale.width - label.width / 2 - 20); // on screen
    });
    this.events.emit('gift', id);
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
        onStart: () => this.events.emit('coinDrop', coin), // one toss per coin, as each one takes off
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
      if (!orders.length) return t(this.customers.coming ? 'next.keepDish' : 'next.keepDishLate');
      if (!orders.some((c) => c.recipe === held.dish.recipe)) return t('next.notOrdered');
      return t('next.serveDish', { dish: dishName(held.dish) });
    }
    if (held) return t(`next.${this.heldPlan(held).hint}`);
    const { ready, wanted, cooking, waiting, blocked } = this.cookerPlan();
    const upper = (s) => t(`station.${s.type}`).toUpperCase();
    // A plated dish somebody ordered, set on a counter: it only needs carrying to the window.
    const plated = this.platedForOrder();
    if (plated) return t('next.onCounter', { dish: dishName(plated.item.dish) });
    // Finished food first: a guest may be waiting for it, and it frees the cooker.
    if (ready) return t('next.ready', { station: upper(ready) });
    // Half of a recipe someone ordered: say what is still missing (taking it out now would make a mystery stew).
    if (wanted) {
      const { recipe, missing } = cookerStatus(wanted);
      return t('next.missing', { station: upper(wanted), items: missing.map(keyName).join(' + '), dish: RECIPES[recipe].name });
    }
    // Cheese left on the board for an order: finish chopping it before starting anything else.
    if (this.boardWork()) return t('next.finishChop');
    // Coins wait patiently on the floor: they never hide what a waiting guest needs.
    if (this.coins.length && !orders.length) return t('next.coins');
    if (cooking) {
      // The oven bakes, the pots and the fryer bubble.
      const word = cooking.type === 'oven' ? 'baking' : 'cooking';
      return t(`next.${word}${this.customers.coming || this.openRecipes().length ? '' : 'Late'}`);
    }
    if (blocked) return t(blocked.progress >= 1 ? 'next.readyFree' : 'next.freePot', { station: upper(blocked) });
    if (orders.length) return t(`hint.${orders[0].recipe}`);
    // Something nobody ordered waits in a cooker: only a light nudge (it can wait, or become a mystery stew).
    if (waiting) return t('next.waiting', { station: upper(waiting) });
    return t(this.customers.coming ? 'next.relax' : 'next.relaxLate');
  }

  // Cookers that matter for the next step: the first finished one (only food somebody ordered while guests wait),
  // the first waiting for the rest of a recipe somebody ordered, the first one cooking (food nobody ordered only
  // counts when it fills the last cooker the oldest order needs: it frees soon), the first other waiting
  // cooker (nobody ordered that), and `blocked`: a cooker to free (waiting, or done with food nobody ordered) when
  // every cooker the oldest order needs is taken.
  cookerPlan() {
    const all = [...this.stations.values()].filter((s) => isCooker(s));
    const cookers = all.filter((s) => s.contents.length);
    const waiting = cookers.filter((s) => waitingFor(s));
    const open = this.openRecipes();
    const wanted = (s) => waitingFor(s) === 'missing' && open.includes(cookerStatus(s).recipe);
    const type = this.orders.length ? RECIPES[this.orders[0].recipe].cooker : null;
    const full = type && all.every((s) => s.type !== type || s.contents.length);
    const done = cookers.filter((s) => s.progress >= 1);
    const ordered = (s) => !this.orders.length || this.orders.some((c) => c.recipe === cookerStatus(s).recipe);
    return {
      ready: done.find(ordered) ?? null,
      wanted: waiting.find(wanted) ?? null,
      cooking: cookers.find((s) => s.progress < 1 && !waiting.includes(s) && (ordered(s) || (full && s.type === type))) ?? null,
      waiting: waiting.find((s) => !wanted(s)) ?? null,
      blocked: full ? [...waiting, ...done].find((s) => s.type === type) ?? null : null,
    };
  }

  // Recipes of the orders no dish is on its way for yet: each cooking or finished cooker, a plated dish in hand and
  // each plated dish on a counter cover one order of their recipe (so the hints never ask for a second brigadeiro).
  openRecipes() {
    const open = this.orders.map((c) => c.recipe);
    const all = [...this.stations.values()];
    const cookers = all.filter((s) => isCooker(s) && s.contents.length && !waitingFor(s));
    const plates = all.filter((s) => s.item?.dish);
    const covered = [...cookers.map((s) => cookerStatus(s).recipe), ...plates.map((s) => s.item.dish.recipe), this.held?.dish?.recipe];
    for (const recipe of covered) if (open.includes(recipe)) open.splice(open.indexOf(recipe), 1);
    return open;
  }

  // The first counter holding a plated dish somebody ordered, or null.
  platedForOrder() {
    const ordered = (s) => s.item?.dish && this.orders.some((c) => c.recipe === s.item.dish.recipe);
    return [...this.stations.values()].find(ordered) ?? null;
  }

  // A board holding raw cheese (alone or on dough) that an open order still needs chopped; else null.
  // Chopped cheese already waiting (on a counter, in hand, or inside a raw pastel) counts towards those orders.
  boardWork() {
    const all = [...this.stations.values()];
    const board = all.find((s) => s.type === 'board' && s.item && ingredientKey(s.item) === 'cheese');
    if (!board) return null;
    const keys = [...all.map((s) => s.item), this.held].filter((item) => item && !item.dish).map(ingredientKey);
    const ready = keys.filter((key) => key === 'cheese:chopped' || key === 'pastel').length;
    const needs = this.openRecipes().filter((recipe) => this.needsKey(recipe, 'cheese:chopped')).length;
    return needs > ready ? board : null;
  }

  // Does a recipe need this ingredient key, steps included (a pastel needs chopped cheese)?
  needsKey(recipe, key) {
    const has = (k) => k === key || (ASSEMBLIES.find((a) => a.makes === k)?.needs.some(has) ?? false);
    return RECIPES[recipe].needs.some(has);
  }

  // Ingredient keys some open order still needs, steps included (a pastel order needs dough, cheese and chopped cheese).
  neededKeys() {
    const keys = new Set();
    const add = (key) => {
      keys.add(key);
      if (key.includes(':')) keys.add(key.split(':')[0]);
      ASSEMBLIES.find((a) => a.makes === key)?.needs.forEach(add);
    };
    for (const recipe of this.openRecipes()) RECIPES[recipe].needs.forEach(add);
    return keys;
  }

  // What to do with the ingredient in hand: the "Next:" hint (STRINGS.next.*) and the station the arrow points at.
  heldPlan(held) {
    const key = ingredientKey(held);
    const all = [...this.stations.values()];
    const find = (fn) => all.find(fn) ?? null;
    // There can be two boards (an upgrade): raw cheese and dough look for one that is free for them.
    const boards = all.filter((s) => s.type === 'board');
    const pots = all.filter((s) => s.type === 'pot');
    const hint = NEXT_FOR_INGREDIENT[key] ?? 'toPot';
    // Nobody ordered anything that uses it: no arrow into an empty pot, just a gentle way to set it aside.
    if (this.orders.length && !this.neededKeys().has(key)) return { hint: 'notNeeded', station: null };
    // Late in the day with no orders left, nothing will need it either: back in its crate, or the bin.
    if (!this.orders.length && !this.customers.coming) {
      return { hint: Object.values(CRATES).includes(key) ? 'putBackLate' : 'keepDishLate', station: null };
    }
    // Raw cheese goes on an empty board, or on top of dough waiting there. A board busy chopping other cheese
    // waits; anything else on it swaps into the chef's hands.
    if (key === 'cheese') {
      const free = boards.find((b) => !b.item || (ingredientKey(b.item) === 'dough' && !b.under));
      if (free) return { hint, station: free };
      const swap = boards.find((b) => ingredientKey(b.item) !== 'cheese');
      return swap ? { hint: 'cheeseSwap', station: swap } : { hint: 'cheeseWait', station: null };
    }
    if (key === 'dough') {
      const cheese = find((s) => s.item && ingredientKey(s.item) === 'cheese:chopped');
      if (cheese) return { hint, station: cheese };
      // No chopped cheese yet: the dough can wait on the board, under the cheese (see stations.js holder()).
      const free = boards.find((b) => !b.item || (ingredientKey(b.item) === 'cheese' && !b.under));
      return free ? { hint: 'doughBoard', station: free } : { hint: 'doughWait', station: null };
    }
    if (key === 'pastel') return { hint, station: find((s) => s.type === 'fryer' && !s.contents.length) };
    // A pot already on its way to a recipe somebody ordered and still missing this.
    const open = this.openRecipes();
    const pot = pots.find((s) => s.contents.length && open.includes(cookerStatus(s).recipe) && cookerStatus(s).missing.includes(key));
    if (key === 'cheese:chopped') {
      // Pão de queijo: straight into a free oven (a busy one bakes another batch first).
      if (open.includes('paodequeijo')) {
        const oven = find((s) => s.type === 'oven' && !s.contents.length);
        const onlyBread = open.every((recipe) => recipe === 'paodequeijo');
        if (oven) return { hint: 'choppedOven', station: oven };
        if (onlyBread) return { hint: 'ovenWait', station: null };
      }
      // Only a pastel wants it: no pot, it waits for dough (on a free board).
      const forPot = open.some((recipe) => RECIPES[recipe].cooker === 'pot' && RECIPES[recipe].needs.includes(key));
      if (!forPot) return { hint: 'choppedPastel', station: boards.find((b) => !b.item) ?? null };
      return { hint, station: pot ?? pots.find((s) => !s.contents.length) ?? null };
    }
    const empty = pots.find((s) => !s.contents.length);
    if (pot || empty) return { hint, station: pot ?? empty };
    // Every pot holds stray things: say so (one more thing makes a mystery stew, which cooks and frees the pot).
    const stray = pots.find((s) => waitingFor(s));
    return stray ? { hint: 'freePotHeld', station: stray } : { hint, station: null };
  }

  // The station the "Next:" hint is about (the guide arrow points at it), or null when the hint is not about one.
  guideStation() {
    const { held, orders } = this;
    if (this.closing) return null;
    if (held?.dish) {
      const c = orders.find((o) => o.state === 'waiting' && o.recipe === held.dish.recipe);
      return c ? this.stations.get(`${c.spot.tx - 1},${c.spot.ty}`) ?? null : null;
    }
    if (held) return this.heldPlan(held).station;
    // Same order as nextStep().
    const { ready, wanted, cooking, blocked } = this.cookerPlan();
    const plated = this.platedForOrder();
    if (plated) return plated;
    if (ready) return ready;
    if (wanted) return this.sourceOf(cookerStatus(wanted).missing[0]);
    const board = this.boardWork();
    if (board) return board;
    if (cooking || !orders.length) return null;
    if (blocked) return blocked;
    return this.sourceOf(RECIPES[orders[0].recipe].needs[0]);
  }

  // Where to start getting an ingredient key with free hands: a station already holding it (or a step of it), else its crate.
  sourceOf(key) {
    const all = [...this.stations.values()];
    const holding = (k) => all.find((s) => s.item && ingredientKey(s.item) === k);
    const crate = (kind) => all.find((s) => s.type === 'crate' && s.kind === kind);
    if (key === 'pastel') return holding('pastel') ?? (holding('cheese:chopped') ? crate('dough') : this.sourceOf('cheese:chopped'));
    if (key === 'cheese:chopped') return holding('cheese:chopped') ?? holding('cheese') ?? crate('cheese');
    return crate(key.split(':')[0]) ?? null;
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
    // Once closing starts the day is over: the "Next:" hint says good night, the stations stay quiet.
    if (!target || this.closing) return null;
    const res = resolve(target, held, this.context());
    // Right after E did nothing here, the reason shows (while it is still the reason), even in a quiet moment.
    const { flash } = this;
    const flashing = flash && flash.station === target && flash.reason === res.reason && this.time.now < flash.until;
    if (!flashing && this.time.now < this.quietUntil) return null;
    // Free hands at a serve window: stay quiet while walking past (the window explains itself on E, see use()).
    if (target.type === 'serve' && !held && !res.action && !flashing) return null;
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
      view.sync(st, time, this.mood.dark);
      if (isCooker(st) && st.contents.length && st.progress < 1 && !waitingFor(st)) busy[st.type] = true;
    }
    for (const [type, [name, volume]] of Object.entries(COOK_LOOPS)) audio.loop(name, busy[type], volume);

    // The arrow rests while the chef already faces that station (the highlight shows it).
    const guide = this.guideStation();
    this.guide?.update(guide !== this.target ? guide : null, time);

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
      dark: this.mood.dark,
      muted: audio.muted,
    });
  }
}
