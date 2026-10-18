// Tiny versioned save in localStorage. Every access is wrapped: private mode or corrupt data just means defaults.
import { CUSTOMERS, RECIPES, GUIDE_DISHES, MAP, STATIONS, UPGRADES, FRIEND_HEARTS, GIFTS, DECK_DECOR } from './data.js';

const KEY = 'cozycooked.save.v1';
// returning: guests left unserved yesterday, [{ id, recipe }], who come first today.
// dishesServed: every dish ever served (the guide arrow retires after GUIDE_DISHES).
// upgrades: what was built on the old cupboards, { "tx,ty": upgrade id }; upgradeTip: the diary suggested them once.
// friends: hearts per guest species, { id: 1..FRIEND_HEARTS }; heartDays: the day each species last earned one
// (one heart a day); gifts: species whose gift stands on the deck, [id].
// decor: deck catalog things bought, { id: true }; lights / apron: the owned one in use (null: the warm bulbs, the red
// apron); decorTip: the diary suggested the deck catalog once. firstOrder: a dish the next new guest orders (the
// first pão de queijo after the oven is built), kept until it is ordered.
const DEFAULTS = {
  version: 1, day: 1, coins: 0, muted: false, returning: [], dishesServed: 0, upgrades: {}, upgradeTip: false, friends: {},
  heartDays: {}, gifts: [], decor: {}, lights: null, apron: null, decorTip: false, firstOrder: null,
};

const wholeNumber = (n, min) => (Number.isInteger(n) && n >= min ? n : null);
// Valid guests, each species once (the first entry wins), so never more than there are species.
const guests = (list) => (Array.isArray(list) ? list : [])
  .filter((g) => CUSTOMERS[g?.id] && RECIPES[g?.recipe])
  .filter((g, i, valid) => valid.findIndex((o) => o.id === g.id) === i)
  .map(({ id, recipe }) => ({ id, recipe }));
// Upgrades only on old cupboard tiles (the key spelled exactly "tx,ty"), known ids, each id once (the first entry wins).
const isSpot = (key) => {
  const [tx, ty] = String(key).split(',').map(Number);
  return key === `${tx},${ty}` && STATIONS[MAP[ty]?.[tx]]?.type === 'spot';
};
const upgrades = (map) => {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const [key, id] of Object.entries(map)) {
    if (isSpot(key) && Object.hasOwn(UPGRADES, id) && !Object.values(out).includes(id)) out[key] = id;
  }
  return out;
};
// Hearts: known species only, whole numbers 1..FRIEND_HEARTS.
const friends = (map) => {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const id of Object.keys(CUSTOMERS)) {
    const n = Object.hasOwn(map, id) ? map[id] : null;
    if (Number.isInteger(n) && n >= 1 && n <= FRIEND_HEARTS) out[id] = n;
  }
  return out;
};
// The day each species last earned a heart: known species, whole days from 1.
const heartDays = (map) => {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const id of Object.keys(CUSTOMERS)) if (Object.hasOwn(map, id) && wholeNumber(map[id], 1)) out[id] = map[id];
  return out;
};
// Deck decor: known ids set to true; the one in use of a kind must be owned and of that kind.
const decor = (map) => {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const id of Object.keys(DECK_DECOR)) if (map[id] === true) out[id] = true;
  return out;
};
const inUse = (id, owned, kind) => (typeof id === 'string' && owned[id] && DECK_DECOR[id].kind === kind ? id : null);
// Gifts: species with a gift, each once.
const gifts = (list) => (Array.isArray(list) ? list : []).filter((id, i, all) => Object.hasOwn(GIFTS, id) && all.indexOf(id) === i);

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw?.version !== 1) return { ...DEFAULTS };
    const day = wholeNumber(raw.day, 1) ?? DEFAULTS.day;
    const owned = decor(raw.decor);
    return {
      version: 1,
      day,
      coins: wholeNumber(raw.coins, 0) ?? DEFAULTS.coins,
      muted: raw.muted === true,
      returning: guests(raw.returning),
      // Saves from before the count: a chef already past day 1 knows the way around.
      dishesServed: wholeNumber(raw.dishesServed, 0) ?? (day > 1 ? GUIDE_DISHES : 0),
      upgrades: upgrades(raw.upgrades),
      upgradeTip: raw.upgradeTip === true,
      friends: friends(raw.friends),
      heartDays: heartDays(raw.heartDays),
      gifts: gifts(raw.gifts),
      decor: owned,
      lights: inUse(raw.lights, owned, 'lights'),
      apron: inUse(raw.apron, owned, 'apron'),
      decorTip: raw.decorTip === true,
      firstOrder: Object.hasOwn(RECIPES, raw.firstOrder ?? '') ? raw.firstOrder : null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(patch) {
  const save = { ...loadSave(), ...patch, version: 1 };
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked: the game keeps running, progress just is not kept.
  }
  return save;
}
