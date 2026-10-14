// Player-facing text: STRINGS lookup with {var} interpolation, plus item and dish names.
import { STRINGS, INGREDIENTS, RECIPES, MYSTERY } from './data.js';

export function t(key, vars = {}) {
  const value = key.split('.').reduce((node, k) => node?.[k], STRINGS);
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (match, name) => String(vars[name] ?? match));
}

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function dishName(dish) {
  if (!dish.recipe) return MYSTERY.name; // a mystery stew is never "cozycooked"
  const name = RECIPES[dish.recipe].name;
  return dish.cooked ? name : t('item.cozycooked', { dish: name });
}

// An ingredient key ("cheese:chopped") as a name, lower-case for use inside sentences ("chopped coalho cheese").
export function keyName(key) {
  const [kind, chopped] = key.split(':');
  const name = INGREDIENTS[kind].name.toLowerCase();
  return (chopped ? t('item.chopped', { ingredient: name }) : name).toLowerCase();
}

export function itemName(item) {
  if (item.type === 'ingredient') {
    const name = INGREDIENTS[item.kind].name;
    return item.chopped ? t('item.chopped', { ingredient: name.toLowerCase() }) : name;
  }
  return dishName(item.dish);
}

export function stationName(station) {
  if (station.type === 'crate') return t('station.crate', { ingredient: INGREDIENTS[station.kind].name });
  return t(`station.${station.type}`);
}
