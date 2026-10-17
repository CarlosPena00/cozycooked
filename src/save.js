// Tiny versioned save in localStorage. Every access is wrapped: private mode or corrupt data just means defaults.
import { CUSTOMERS, RECIPES, DAY, GUIDE_DISHES, MAP, STATIONS, UPGRADES } from './data.js';

const KEY = 'cozycooked.save.v1';
// returning: guests left unserved yesterday, [{ id, recipe }], who come first today.
// dishesServed: every dish ever served (the guide arrow retires after GUIDE_DISHES).
// upgrades: what was built on the old cupboards, { "tx,ty": upgrade id }; upgradeTip: the diary suggested them once.
const DEFAULTS = { version: 1, day: 1, coins: 0, muted: false, returning: [], dishesServed: 0, upgrades: {}, upgradeTip: false };

const wholeNumber = (n, min) => (Number.isInteger(n) && n >= min ? n : null);
// Valid guests, each once (the first entry wins).
const guests = (list) => (Array.isArray(list) ? list : [])
  .filter((g) => CUSTOMERS[g?.id] && RECIPES[g?.recipe])
  .filter((g, i, valid) => valid.findIndex((o) => o.id === g.id) === i)
  .map(({ id, recipe }) => ({ id, recipe }))
  .slice(0, DAY.maxCustomers);
// Upgrades only on old cupboard tiles, known ids, each id once (the first entry wins).
const isSpot = (key) => {
  const [tx, ty] = String(key).split(',').map(Number);
  return STATIONS[MAP[ty]?.[tx]]?.type === 'spot';
};
const upgrades = (map) => {
  const out = {};
  if (!map || typeof map !== 'object' || Array.isArray(map)) return out;
  for (const [key, id] of Object.entries(map)) {
    if (isSpot(key) && Object.hasOwn(UPGRADES, id) && !Object.values(out).includes(id)) out[key] = id;
  }
  return out;
};

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw?.version !== 1) return { ...DEFAULTS };
    const day = wholeNumber(raw.day, 1) ?? DEFAULTS.day;
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
