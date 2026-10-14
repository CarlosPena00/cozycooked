// Tiny versioned save in localStorage. Every access is wrapped: private mode or corrupt data just means defaults.
const KEY = 'cozycooked.save.v1';
const DEFAULTS = { version: 1, day: 1, coins: 0, muted: false };

const wholeNumber = (n, min) => (Number.isInteger(n) && n >= min ? n : null);

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw?.version !== 1) return { ...DEFAULTS };
    return {
      version: 1,
      day: wholeNumber(raw.day, 1) ?? DEFAULTS.day,
      coins: wholeNumber(raw.coins, 0) ?? DEFAULTS.coins,
      muted: raw.muted === true,
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
