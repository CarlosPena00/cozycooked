// Customers on the deck (no Phaser): arrivals, walking, waiting, being served, leaving.
// Positions are in tiles: a customer walks along row `ty` from DECK.enterX to its spot and back.
// The scene listens through `emit(event, customer, extra)` and draws them (see views.js CustomerView).
// Events: arrive, wait, idle, served, bye, leave, gone.
// Arrivals follow "calm gaps": the next guest comes a short gap after the deck last changed (SPEC-r2 2.1).
import { CUSTOMERS, RECIPES, DAY, DECK, COINS } from './data.js';
import { pick } from './text.js';

const between = (min, max) => min + Math.random() * (max - min);

// Who receives a dish served at the window on row `ty` (SPEC 4.4). `waiting` is in arrival order.
export function pickReceiver(waiting, dish, ty) {
  const here = waiting.find((c) => c.spot.ty === ty);
  const matches = waiting.filter((c) => dish.recipe && c.recipe === dish.recipe);
  if (matches.length) return matches.includes(here) ? here : matches[0];
  return here ?? waiting[0] ?? null;
}

export function moodFor(customer, dish) {
  if (customer.recipe !== dish.recipe) return 'surprised';
  return dish.cooked ? 'happy' : 'cozycooked';
}

export class Customers {
  // returning: guests left unserved yesterday ([{ id, recipe }]); they come first, before anyone new.
  constructor(dayNumber, emit = () => {}, returning = []) {
    this.dayNumber = dayNumber;
    this.emit = emit;
    this.list = []; // on the deck now, arrival order
    this.log = []; // every guest of the day (same objects), for the diary
    this.script = dayNumber === 1 ? DAY.script : returning;
    this.pending = [...this.script]; // scripted guests still to come, in order
    this.closed = false;
    this.t = 0;
    this.changed(0);
  }

  // Guests that can be served now (standing at a window), oldest first.
  get waiting() {
    return this.list.filter((c) => c.state === 'waiting');
  }

  // Orders shown in the HUD and bubbles: guests walking in or waiting, oldest first.
  get orders() {
    return this.list.filter((c) => c.state === 'walking_in' || c.state === 'waiting');
  }

  // Guests on the deck that are not leaving (walking in, waiting, reacting). The deck holds at most DAY.maxCustomers.
  get staying() {
    return this.list.filter((c) => c.state !== 'leaving' && c.state !== 'gone').length;
  }

  // Day time of the next arrival (null once closed). QA can assign it, e.g. `nextArrival = day.t` to call a guest now.
  get nextArrival() {
    return this.closed ? null : this.lastChange + this.gap;
  }

  set nextArrival(t) {
    this.lastChange = t - this.gap;
  }

  // The deck changed (arrival or departure): restart the calm gap for the new number of guests.
  changed(t) {
    const { gaps, jitter } = DAY.arrivals;
    const row = gaps[Math.min(this.dayNumber, gaps.length) - 1];
    this.lastChange = t;
    this.gap = row[Math.min(this.staying, row.length - 1)] * between(1 - jitter, 1 + jitter);
  }

  get empty() {
    return this.list.length === 0;
  }

  update(dt, t) {
    this.t = t;
    const open = !this.closed && t <= DAY.arrivals.last && this.staying < DAY.maxCustomers;
    if (open && t >= this.nextArrival) this.arrive(t);
    for (const c of this.list) this.step(c, dt);
    for (const c of this.list.filter((g) => g.state === 'gone')) this.emit('gone', c);
    this.list = this.list.filter((c) => c.state !== 'gone');
  }

  // A spot with nobody at all, else one whose only guest is leaving (preference order: DECK.spots).
  freeSpot() {
    const empty = (spot, ignoreLeaving) => !this.list.some((c) => c.spot === spot && !(ignoreLeaving && c.state === 'leaving'));
    return DECK.spots.find((spot) => empty(spot, false)) ?? DECK.spots.find((spot) => empty(spot, true)) ?? null;
  }

  // Scripted guests first, in order, each once it is their time of day (a returning maned wolf still comes at dusk);
  // otherwise a random guest who is neither on the deck nor still expected, and, when someone else can come,
  // not one of the last two arrivals either (so the day sees everybody, not six capybaras).
  nextGuest(t) {
    const onDeck = (id) => this.list.some((c) => c.id === id);
    const ready = (id) => !onDeck(id) && t >= CUSTOMERS[id].minTime;
    const i = this.pending.findIndex((g) => ready(g.id));
    if (i >= 0) return this.pending.splice(i, 1)[0];
    const ids = Object.keys(CUSTOMERS).filter((id) => ready(id) && !this.pending.some((g) => g.id === id));
    if (!ids.length) return null;
    const recent = this.log.slice(-2).map((c) => c.id);
    const fresh = ids.filter((id) => !recent.includes(id));
    const id = pick(fresh.length ? fresh : ids);
    const recipe = Math.random() < DAY.arrivals.favoriteChance ? CUSTOMERS[id].favorite : pick(Object.keys(RECIPES));
    return { id, recipe };
  }

  arrive(t) {
    const spot = this.freeSpot();
    const guest = spot && this.nextGuest(t);
    if (!guest) {
      this.nextArrival = t + 1; // every animal is on the deck right now: try again in a second
      return;
    }
    this.spawn(guest, spot);
  }

  spawn({ id, recipe }, spot, x = DECK.enterX) {
    const c = {
      id, recipe, spot, x, ty: spot.ty,
      state: 'walking_in', waited: 0, idleShown: false, timer: 0, mood: null, dish: null, line: null, view: null,
    };
    this.list.push(c);
    this.log.push(c);
    this.changed(this.t);
    this.emit('arrive', c);
    return c;
  }

  // Debug (QA): a guest appears now, already at a free spot (waiting from the next update) unless walk = true.
  // id/recipe default to the next guest of the day. Returns the customer, or null if every spot is taken.
  debugSpawn(id, recipe, walk = false) {
    const spot = this.freeSpot();
    const guest = id ? { id, recipe: recipe ?? CUSTOMERS[id].favorite } : this.nextGuest(this.t);
    if (!spot || !guest) return null;
    return this.spawn({ ...guest, recipe: recipe ?? guest.recipe }, spot, walk ? DECK.enterX : spot.tx);
  }

  step(c, dt) {
    const speed = CUSTOMERS[c.id].speed;
    switch (c.state) {
      case 'walking_in':
        c.x = Math.max(c.spot.tx, c.x - speed * dt);
        if (c.x === c.spot.tx) {
          c.state = 'waiting';
          this.emit('wait', c);
        }
        break;
      case 'waiting':
        c.waited += dt;
        if (!c.idleShown && c.waited >= DECK.idleAfter) {
          c.idleShown = true;
          this.emit('idle', c, { line: CUSTOMERS[c.id].idle });
        }
        break;
      case 'served':
        c.timer -= dt;
        if (c.timer <= 0) this.leave(c);
        break;
      case 'leaving':
        c.x += speed * dt;
        if (c.x >= DECK.enterX) c.state = 'gone';
        break;
      default:
        break;
    }
  }

  leave(c) {
    c.state = 'leaving';
    this.changed(this.t);
    this.emit('leave', c);
  }

  // Serve a dish at the window on row ty. Returns { customer, mood, coins, line } or null if nobody is waiting.
  serve(dish, ty) {
    const c = pickReceiver(this.waiting, dish, ty);
    if (!c) return null;
    const mood = moodFor(c, dish);
    const favorite = mood === 'happy' && dish.recipe === CUSTOMERS[c.id].favorite;
    const line = pick(CUSTOMERS[c.id][mood]);
    Object.assign(c, { state: 'served', timer: DECK.reactSeconds, mood, dish: { ...dish }, line });
    this.emit('served', c, { mood, line });
    return { customer: c, mood, coins: COINS[mood] + (favorite ? COINS.favoriteBonus : 0), line };
  }

  // Night: nobody new arrives; everyone not yet served says goodbye and walks off (they come back tomorrow).
  close() {
    this.closed = true;
    for (const c of this.list) {
      if (c.state !== 'waiting' && c.state !== 'walking_in') continue;
      this.emit('bye', c, { line: CUSTOMERS[c.id].bye });
      this.leave(c);
    }
  }
}
