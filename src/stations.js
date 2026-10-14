// The single-button rule, as pure logic (no Phaser). See SPEC section 2.
// resolve() decides what E would do; the prompt and the E key both use it, so the prompt never lies.
import { INGREDIENTS, RECIPES, ASSEMBLIES, COOKERS, CHOPS_NEEDED, COOK_GRACE } from './data.js';

export const newIngredient = (kind) => ({ type: 'ingredient', kind, chopped: false });
// A dish is always on a plate: plates are implicit (E on a cooker with free hands takes the food out, plated).
export const newDish = (recipe, cooked) => ({ type: 'plate', dish: { recipe, cooked } });
export const ingredientKey = (item) => (item.chopped ? `${item.kind}:chopped` : item.kind);
export const isCooker = (station) => station.type in COOKERS;

const sortedKey = (keys) => [...keys].sort().join('+');

// The recipe id these contents make in this cooker, or null for a mystery dish.
export function matchRecipe(contents, cooker) {
  const key = sortedKey(contents.map(ingredientKey));
  return Object.keys(RECIPES).find((id) => RECIPES[id].cooker === cooker && sortedKey(RECIPES[id].needs) === key) ?? null;
}

function assemblyFor(a, b) {
  if (a?.type !== 'ingredient' || b?.type !== 'ingredient') return null;
  const key = sortedKey([ingredientKey(a), ingredientKey(b)]);
  return ASSEMBLIES.find((rule) => sortedKey(rule.needs) === key) ?? null;
}

// True when two ingredients would assemble if the choppable one was chopped (dough + raw cheese).
function needsChop(a, b) {
  const chopped = (item) => ({ ...item, chopped: item.chopped || INGREDIENTS[item.kind].choppable });
  if (a?.type !== 'ingredient' || b?.type !== 'ingredient') return false;
  return !assemblyFor(a, b) && !!assemblyFor(chopped(a), chopped(b));
}

// What a cooker is on its way to making, for recipe hints: the recipe whose needs best cover the contents
// (most ingredients already in, then fewest missing), or recipe null when the contents fit no recipe (mystery stew)
// or the cooker is empty. -> { recipe, have: [ingredient keys inside], missing: [ingredient keys still needed] }
export function cookerStatus(station) {
  const have = (station.contents ?? []).map(ingredientKey);
  let best = { recipe: null, have, missing: [] };
  if (!have.length) return best;
  let bestScore = -Infinity;
  for (const [id, recipe] of Object.entries(RECIPES)) {
    if (recipe.cooker !== station.type) continue;
    const missing = [...recipe.needs];
    const fits = have.every((key) => {
      const i = missing.indexOf(key);
      if (i >= 0) missing.splice(i, 1);
      return i >= 0;
    });
    const score = -missing.length;
    if (fits && score > bestScore) {
      bestScore = score;
      best = { recipe: id, have, missing };
    }
  }
  return best;
}

// One rule for what waits: a cooker cooks a whole recipe, or two or more things that fit no recipe (a mystery stew).
// Anything less waits for more: half a recipe, or one lone ingredient (it never turns into a stew by itself).
// -> null (empty, or cooking / cooked), 'missing' (half a recipe) or 'alone' (one ingredient that fits no recipe).
export function waitingFor(station) {
  const { recipe, have, missing } = cookerStatus(station);
  if (recipe && missing.length) return 'missing';
  return !recipe && have.length === 1 ? 'alone' : null;
}

// Advance a cooker by dt seconds. Returns true on the frame it finishes. Nothing ever burns.
// A waiting cooker (see waitingFor) does not cook.
export function cook(station, dt) {
  if (!isCooker(station) || !station.contents.length || station.progress >= 1) return false;
  if (waitingFor(station)) return false;
  station.progress = Math.min(1, station.progress + dt / COOKERS[station.type].seconds);
  return station.progress >= 1;
}

const NOTHING = { action: null, reason: null };
const refuse = (reason, n) => ({ action: null, reason, n });
const act = (action, run, n) => ({ action, reason: null, run, n });

function crate(station, held) {
  if (!held) return act('take', () => newIngredient(station.kind));
  if (held.type === 'ingredient' && held.kind === station.kind && !held.chopped) return act('putBack', () => null);
  return refuse('handsFull');
}

// The bin takes anything held (an ingredient or a whole dish); hands are free afterwards.
function bin(station, held) {
  return held ? act('throwAway', () => null) : refuse('emptyBin');
}

// Counters hold anything; boards hold ingredients and chop cheese. Both assemble and swap.
// On a board, raw cheese and dough stack up in either order (cheese on top, station.under = the dough):
// chopping the cheese then makes the pastel right there, so the natural "dough first" never dead-ends.
function holder(station, held) {
  const { item, under } = station;
  const board = station.type === 'board';
  if (board && held?.dish) return refuse('boardOnly');
  if (under && held) return refuse('chopFirst'); // a stack only gets chopped
  const rule = assemblyFor(held, item);
  if (rule) {
    return act(rule.action, () => {
      station.item = newIngredient(rule.makes);
      station.chops = 0;
      return null;
    });
  }
  if (needsChop(held, item)) {
    if (!board) return refuse('chopFirst');
    const heldRaw = INGREDIENTS[held.kind].choppable;
    return act(heldRaw ? 'cheeseOnDough' : 'doughUnder', () => {
      station.item = heldRaw ? held : item;
      station.under = heldRaw ? item : held; // chops already done on the cheese still count
      return null;
    });
  }
  if (board && !held && item && INGREDIENTS[item.kind].choppable && !item.chopped) {
    return act('chop', () => {
      station.chops += 1;
      if (station.chops >= CHOPS_NEEDED) {
        const chopped = { ...item, chopped: true };
        const made = under && assemblyFor(under, chopped);
        station.item = made ? newIngredient(made.makes) : chopped;
        station.under = null;
        if (made) station.chops = 0;
      }
      return null;
    }, station.chops);
  }
  const place = (action, result) => act(action, () => {
    station.item = held;
    station.chops = 0;
    return result;
  });
  if (!held && item) return place('pickUp', item);
  if (held && !item) return place(board ? 'putOnBoard' : 'putDown', null);
  if (held && item) return place('swap', item);
  return refuse(board ? 'emptyBoard' : 'emptyCounter');
}

function cooker(station, held) {
  const def = COOKERS[station.type];
  const { contents } = station;
  if (held?.type === 'ingredient') {
    if (def.accepts !== 'any' && !def.accepts.includes(ingredientKey(held))) return refuse(def.refuse);
    if (contents.length >= def.capacity) return refuse(def.full);
    // Raw cheese into a pot whose recipe wants it chopped would only make a mystery stew by accident.
    if (!held.chopped && cookerStatus(station).missing.includes(`${held.kind}:chopped`)) return refuse('chopFirst');
    return act(def.add, () => {
      station.contents = [...contents, held];
      station.progress = 0;
      return null;
    });
  }
  // Only a dish can be in hand here (ingredients were handled above): point it at a window.
  if (!contents.length) return refuse(held ? 'takeDish' : def.empty);
  if (held) return refuse('dishInHand'); // one dish at a time
  // Half a recipe or a lone ingredient stays in (so a quick double E after adding milk never makes an accidental
  // mystery stew). Never a softlock: recipes are smaller than the pot, so one more wrong ingredient makes a stew.
  const waiting = waitingFor(station);
  if (waiting) return refuse(waiting);
  // A short grace after the last ingredient went in, so a quick double E never plates it raw by accident.
  if (station.progress * def.seconds < COOK_GRACE) return refuse('justAdded');
  const cooked = station.progress >= 1;
  const recipe = matchRecipe(contents, station.type);
  // Taking food out early is allowed. That's the whole joke. (A mystery stew is just a mystery, never early.)
  const action = !recipe ? 'plateMystery' : cooked ? 'plate' : 'plateEarly';
  return act(action, () => {
    station.contents = [];
    station.progress = 0;
    return newDish(recipe, cooked);
  });
}

// The serve window only decides whether serving is possible; the scene picks the customer.
function serve(station, held, ctx) {
  if (ctx.closing) return refuse('closed');
  if (!held?.dish) return refuse('needDish');
  if (!ctx.waiting) return refuse('nobody');
  return { action: 'serve', reason: null };
}

// -> { action, reason, n, run }. action/reason are STRINGS keys (action.*, reason.*); n fills {n} in the text.
// run() mutates the station and returns what the chef holds afterwards. action null = E does nothing.
// ctx: { waiting: number of customers waiting, closing: bool } (only used by the serve window).
export function resolve(station, held, ctx = { waiting: 0, closing: false }) {
  if (isCooker(station)) return cooker(station, held);
  switch (station.type) {
    case 'crate': return crate(station, held);
    case 'bin': return bin(station, held);
    case 'counter':
    case 'board': return holder(station, held);
    case 'serve': return serve(station, held, ctx);
    default: return NOTHING;
  }
}
