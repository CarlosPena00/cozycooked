// All game data and player-facing strings (English only for now; keep every string here so i18n is easy later).

export const TILE = 96;
export const ART_SCALE = TILE / 16; // 6: every 16 px sprite in the world (tiles, chef, customers, stations)
export const SPEED = TILE * 4.5; // px/s: crossing the 6-tile room takes about 1.3 s
export const CHOPS_NEEDED = 3;
export const COIN_PICK_RADIUS = TILE * 0.6;

// Legend: ~ water, _ deck, . floor, # wall,
// C counter, B cutting board, P pot, F fryer, S serve window, X bin,
// lowercase letters are ingredient crates (see CRATES).
// 20x12 tiles = 1920x1152 px: the camera shows y 0-1080, so only the bottom 72 px of row 11 (water) are cropped.
export const MAP = [
  '~~~~~~~~~~~~~~~~~~~~', // 0  under the HUD order cards
  '~~~~~~~~~~~~~~~~~~~~', // 1
  '~~~~~~~~~~~~~~~~~~~~', // 2  pot/fryer contents + steam float here
  '~~~~~#qBdPPF#~~~~~~~', // 3  cheese, board, dough | pot, pot | fryer
  '~~~~~m......C____~~~', // 4  milk | counter (right above the windows) ; deck top edge
  '~~~~~c......S_______', // 5  chocolate | serve 1 | spot + pier to the right bank
  '~~~~~r......S_______', // 6  rice      | serve 2 | spot + pier
  '~~~~~b......S_______', // 7  beans     | serve 3 | spot + pier
  '~~~~~##CC#CX#____~~~', // 8  counter, counter | counter, bin ; deck bottom edge
  '~~~~~~~~~~~~~~~~~~~~', // 9
  '~~~~~~~~~~~~~~~~~~~~', // 10 under the bottom panel
  '~~~~~~~~~~~~~~~~~~~~', // 11 only 24 px visible
];

export const PLAYER_START = { tx: 8, ty: 5 };

// Tile boxes (inclusive). The kitchen box includes its walls; code uses these instead of pixel numbers.
export const KITCHEN = { left: 5, top: 3, right: 12, bottom: 8 };

// Art frame (assets/art/art.png) drawn on each station type; crates use crate_<ingredient>.
export const SPRITES = {
  counter: 'counter', board: 'counter_board', pot: 'pot_stove', fryer: 'fryer',
  serve: 'serve', bin: 'bin',
};

// Scenery baked into the map (no collision), top-left on a tile plus an optional offset in art pixels (dx, dy):
// art frame names or image keys ('rug' = assets/art/rug_oval.png). Only the rug sits on floor tiles.
export const DECOR = [
  { name: 'rug', tx: 8, ty: 5 }, // a 3x2 rug (cols 8-10, rows 5-6)
  // A low railing along the deck's bottom margin (nobody walks there).
  ...[13, 14, 15, 16].map((tx) => ({ name: 'railing', tx, ty: 8, dy: 2 })),
  { name: 'lily', tx: 3, ty: 5, dx: 2 },
  { name: 'lily_flower', tx: 2, ty: 8, dx: 4, dy: 2 },
  { name: 'reeds', tx: 1, ty: 6, dx: 2 },
  { name: 'tuft', tx: 0, ty: 9, dx: 2 },
  { name: 'lily_flower', tx: 15, ty: 10, dx: 6 },
  { name: 'reeds', tx: 18, ty: 9, dx: 6 },
  { name: 'rock', tx: 18, ty: 3, dx: 4, dy: 4 },
  { name: 'lily', tx: 17, ty: 3, dy: 6 },
  { name: 'reeds', tx: 18, ty: 2, dx: 6 },
];

// Sounds: name -> files (Phaser picks the first format the browser plays). Missing names are silently skipped.
const sound = (name) => [`assets/audio/${name}.ogg`, `assets/audio/${name}.mp3`];
export const SOUNDS = Object.fromEntries(
  ['music', 'chop', 'boil', 'sizzle', 'plate', 'coin', 'pickup', 'serve', 'click', 'plop', 'assemble', 'bin', 'toss'].map((name) => [name, sound(name)]),
);
// Which sound each gameplay event plays (see the event list in KitchenScene): event -> [sound, volume, rate?].
export const EVENT_SOUNDS = {
  interact: ['click', 0.35], nope: ['click', 0.22, 0.55], chop: ['chop', 0.45], cookerDone: ['pickup', 0.5], fryerDone: ['pickup', 0.5],
  plate: ['plate', 0.5], serve: ['serve', 0.45], coinLand: ['coin', 0.3], coinPick: ['pickup', 0.35],
  cookerAdd: ['plop', 0.3], stack: ['plop', 0.3, 0.85], assemble: ['assemble', 0.35], bin: ['bin', 0.35], coinDrop: ['toss', 0.12],
};
// Soft loops while something cooks: cooker type -> [sound, volume]. The loop files are quiet (mean about -29 dBFS),
// so near full volume they sit about 8 dB under the music (music mean -11 dBFS at MUSIC_VOLUME 0.3): audible, not loud.
export const COOK_LOOPS = { pot: ['boil', 0.95], fryer: ['sizzle', 1] };
export const MUSIC_VOLUME = 0.3;

export const STATIONS = {
  C: { type: 'counter' }, B: { type: 'board' }, P: { type: 'pot' }, F: { type: 'fryer' }, S: { type: 'serve' }, X: { type: 'bin' },
};

// "q" is for queijo, to keep "c" for chocolate.
export const CRATES = { m: 'milk', c: 'chocolate', r: 'rice', b: 'beans', q: 'cheese', d: 'dough' };

export const TERRAIN = { '~': 'water', _: 'deck', '#': 'wall', '.': 'floor' };

// `art` is the frame name in assets/art/art.png (`<art>_chopped` when chopped).
export const INGREDIENTS = {
  milk: { name: 'Condensed milk', art: 'milk', choppable: false },
  chocolate: { name: 'Chocolate', art: 'chocolate', choppable: false },
  rice: { name: 'Rice', art: 'rice', choppable: false },
  beans: { name: 'Beans', art: 'beans', choppable: false },
  cheese: { name: 'Coalho cheese', art: 'cheese', choppable: true },
  dough: { name: 'Pastel dough', art: 'dough', choppable: false },
  pastel: { name: 'Raw pastel', art: 'pastel_raw', choppable: false },
};

// Pot and fryer share one code path. Reason/action keys point into STRINGS.
export const COOKERS = {
  pot: { capacity: 4, seconds: 6, accepts: 'any', add: 'addPot', full: 'potFull', refuse: null, empty: 'emptyPot', doneEvent: 'cookerDone' },
  fryer: { capacity: 1, seconds: 4, accepts: ['pastel'], add: 'addFryer', full: 'fryerBusy', refuse: 'fryerOnly', empty: 'emptyFryer', doneEvent: 'fryerDone' },
};
// Seconds after the last ingredient goes in before the food can be taken out (no accidental double-E plating).
export const COOK_GRACE = 0.4;

// Ingredient keys are "kind" or "kind:chopped". Exact match only; anything else from a pot is a mystery stew.
export const RECIPES = {
  brigadeiro: { name: 'Brigadeiro', cooker: 'pot', needs: ['milk', 'chocolate'], art: 'dish_brigadeiro', fill: 'potfill_brigadeiro' },
  baiao: { name: 'Baiao de dois', cooker: 'pot', needs: ['rice', 'beans', 'cheese:chopped'], art: 'dish_baiao', fill: 'potfill_baiao' },
  pastel: { name: 'Pastel', cooker: 'fryer', needs: ['pastel'], art: 'dish_pastel' },
};

// Two ingredients combined on a board or counter (order-independent). The result stays on the station.
export const ASSEMBLIES = [
  { needs: ['dough', 'cheese:chopped'], makes: 'pastel', action: 'makePastel' },
];

// Which "Next:" hint (STRINGS.next.*) to show while holding an ingredient, by ingredient key. Default: toPot.
export const NEXT_FOR_INGREDIENT = { cheese: 'chopCheese', dough: 'dough', 'cheese:chopped': 'choppedCheese', pastel: 'rawPastel' };

// Art: dish_<recipe> on a plate, dish_<recipe>_under when cozycooked (the mystery stew has one look).
export const MYSTERY = { name: 'Mystery stew', art: 'dish_mystery', fill: 'potfill_mystery' };

export const COINS = { happy: 3, cozycooked: 2, surprised: 1, favoriteBonus: 1 };

// The deck outside the serve windows. Waiting spots are filled in this order (middle first); each one faces the
// serve window at tx - 1. Guests walk in and out along their spot's row, between enterX and the spot.
// platform/pier are tile boxes (inclusive) for art and decor; rows 4 and 8 of the platform are margins nobody walks on.
export const DECK = {
  spots: [{ tx: 13, ty: 6 }, { tx: 13, ty: 5 }, { tx: 13, ty: 7 }],
  enterX: 21, // off-screen right (col 20 starts at x 1920)
  platform: { left: 13, top: 4, right: 16, bottom: 8 },
  pier: { left: 17, top: 5, right: 19, bottom: 7 }, // continues to the right bank
  coinArea: { cols: [9, 11], rows: [6, 7] }, // coins land on these floor tiles, near the windows (below the label at the pots)
  idleAfter: 45, // seconds waiting before the flavor idle line
  idleSeconds: 3,
  reactSeconds: 2.5,
};

// Lanterns (tiles) that light up at night: posts stand on the deck's top edge framing the waiting spots,
// the others hang on kitchen walls (corners + bottom wall). mood.js draws them; the night mask brightens around them.
export const LANTERNS = {
  posts: [{ tx: 13, ty: 4 }, { tx: 16, ty: 4 }],
  walls: [{ tx: 5, ty: 3 }, { tx: 12, ty: 3 }, { tx: 9, ty: 8 }],
};

// Customers. Art frames are `<id>_front_0/1` (waiting), `<id>_side_0/1` (walking), `<id>_happy`.
// speed is in tiles/s; minTime is the day time (s) before they can show up.
export const CUSTOMERS = {
  capybara: {
    name: 'Capybara', favorite: 'brigadeiro', speed: 1.5, minTime: 0,
    happy: ['Perfect. Like a warm bath.', "Mmm. I'll tell the birds.", 'Five stars. Well, five seeds.'],
    cozycooked: ['Rustic. I love it.', 'A bit runny. Very relaxing.', 'Raw is a lifestyle.'],
    surprised: ['Not what I ordered. Still nice.', 'A surprise! How chill.', "I'll pretend I asked for this."],
    idle: "No rush. I'm watching the clouds.",
    bye: 'See you tomorrow, chef.',
  },
  sloth: {
    name: 'Sloth', favorite: 'baiao', speed: 0.7, minTime: 0,
    happy: ['Worth... the... wait.', 'Deli... cious.', 'I will... come back... eventually.'],
    cozycooked: ['Crunchy... I have time to chew.', 'Slow food... fast cooking... funny.', "It's still... warming up. Like me."],
    surprised: ['Oh... a plot twist.', 'I ordered... what was it again?', 'This is... also food. Good.'],
    idle: "I'm... reading my book.",
    bye: 'Good... night...',
  },
  toucan: {
    name: 'Toucan', favorite: 'pastel', speed: 2.0, minTime: 0,
    happy: ['WOW! Crunchy and perfect!', 'My beak is SO happy!', "I'm telling the WHOLE forest!"],
    cozycooked: ['Soft! Like a pillow! Love it!', 'Pale and proud! Respect!', 'Gooey! My favorite texture!'],
    surprised: ["Plot twist! I'll eat it!", 'Not my order! Still yum!', 'Is this a new menu? Bold!'],
    idle: 'Hey! Nice kitchen! Very loud bubbles!',
    bye: 'BYE! See you tomorrow! BYE!',
  },
  toad: {
    name: 'Cane toad', favorite: 'baiao', speed: 1.2, minTime: 0,
    happy: ['Ribbit. Magnificent.', 'Croak! Just like my pond.', 'Ribbit-licious.'],
    cozycooked: ['A bit wet. I approve.', 'Crunchy beans. Croak of approval.', 'Moist. Perfect for a toad.'],
    surprised: ['Ribbit? Surprise dinner!', 'Not the plan. Still a meal.', 'Croak... mysterious. I like it.'],
    idle: "Ribbit. I'll wait by the water.",
    bye: 'Ribbit. Good night, chef.',
  },
  wolf: {
    name: 'Maned wolf', favorite: 'brigadeiro', speed: 1.8, minTime: 180,
    happy: ["Oh... it's lovely. Thank you.", 'Sweet. Like a sunset.', "I'll come back... if that's ok."],
    cozycooked: ['Still gooey... I like gooey.', "It's soft. So am I.", "Charming. Don't change a thing."],
    surprised: ['Oh. Um. This is nice too.', "I'm too shy to complain. And it's good.", 'A surprise... how brave.'],
    idle: "I'm... just standing here. Quietly.",
    bye: 'Um... good night.',
  },
};

// Day clock in seconds. Phases start at `start`. `light` is [t, daylight 0..1] keyframes (linear in between).
export const DAY = {
  length: 300,
  phases: [
    { id: 'dawn', start: 0 },
    { id: 'day', start: 30 },
    { id: 'sunset', start: 210 },
    { id: 'night', start: 265 }, // the clock says Night once the blue has taken over from the golden hour
  ],
  lanterns: 255, // lanterns and string lights switch on at dusk, a little before the clock says Night
  light: [[0, 0.6], [30, 1], [210, 1], [255, 0.6], [300, 0.25]],
  // Looks (mood.js), all [t, value] keyframes, linear in between. sky: a colour wash [t, color, alpha] (dawn lavender,
  // rose at sunset); mist: dawn mist over the lake; sunset: the rose-to-amber golden hour; night: the blue night mask (the kitchen
  // and the deck stay almost clear of it, so only the far lake gets dim).
  // The night only starts once the golden hour has peaked, so blue never muddies the amber and rose.
  sky: [[0, 0xbec8eb, 0.14], [30, 0xffe2b0, 0], [200, 0xffb060, 0], [228, 0xf58aa0, 0.06], [250, 0xe87a9a, 0.08], [268, 0x8a6ab0, 0.05], [280, 0x6a5aa8, 0]],
  mist: [[0, 1], [18, 0.75], [40, 0]],
  sunset: [[195, 0], [222, 0.8], [250, 0.8], [280, 0]],
  night: [[0, 0.2], [30, 0], [242, 0], [268, 0.42], [285, 0.6], [300, 0.64]],
  closingMaxSeconds: 4, // after closing starts, the diary appears when the deck is empty or after this
  // Calm gaps: a guest arrives `gaps[day][n]` seconds (+-jitter) after the latest arrival or departure,
  // n = guests on the deck that are not leaving. Rows: day 1, day 2, day 3+. No arrivals after `last`.
  arrivals: { last: 240, gaps: [[1, 8, 24], [1, 7, 20], [1, 6, 16]], jitter: 0.15, favoriteChance: 0.6 },
  maxCustomers: 3,
  // Day 1 tutorial ramp: the first three guests and their orders.
  script: [
    { id: 'capybara', recipe: 'brigadeiro' },
    { id: 'toad', recipe: 'baiao' },
    { id: 'toucan', recipe: 'pastel' },
  ],
};

// Station names are upper-cased in some "Next:" hints (POT, FRYER), so hints spell them the same way:
// CUTTING BOARD, POT, FRYER, SERVE WINDOW. Keep each "Next:" hint to one short line.
export const STRINGS = {
  title: {
    name: 'Cozycooked',
    subtitle: 'a cozy kitchen by the lake',
    press: 'Press any key',
    save: 'Day {day} - {coins} coins',
    saveOne: 'Day {day} - 1 coin',
    mute: 'M: sound on/off',
  },
  hud: {
    next: 'Next: {text}',
    controls: 'WASD move  ·  E use  ·  Esc help  ·  M sound',
    holding: 'Holding: {item}',
    emptyHands: 'Hands free',
    wants: '{customer} wants',
    day: 'Day {day}',
    phase: { dawn: 'Morning', day: 'Daytime', sunset: 'Sunset', night: 'Night', closing: 'Closing time' },
    muted: 'Sound off',
  },
  station: {
    counter: 'Counter', board: 'Cutting board', pot: 'Pot', fryer: 'Fryer',
    serve: 'Serve window', bin: 'Bin', crate: '{ingredient} crate',
  },
  item: {
    chopped: 'Chopped {ingredient}',
    cozycooked: 'Cozycooked {dish}',
  },
  // Shown after "[E]" next to the chef (first letter capitalized). Keep them short.
  action: {
    take: 'take {item}', putBack: 'put it back',
    pickUp: 'pick it up', putDown: 'put it down', swap: 'swap', makePastel: 'make a pastel',
    cheeseOnDough: 'put it on the dough', doughUnder: 'slide it under the cheese',
    chop: 'chop ({n}/{max})', putOnBoard: 'put it on the board',
    addPot: 'add to the pot', addFryer: 'put in the fryer',
    plate: 'plate it - just right!', plateEarly: 'plate it rustic (a bit cozycooked)',
    plateMystery: 'plate the mystery stew',
    throwAway: 'throw away {item}', serve: 'serve it!',
  },
  // Why E does nothing here: always gentle, and say what would work instead.
  reason: {
    chopFirst: 'chop the cheese first',
    boardOnly: 'dishes go on a counter, not the board',
    potFull: 'the pot is full - plate it first',
    fryerBusy: 'the fryer is busy - one pastel at a time',
    fryerOnly: 'the fryer only takes a raw pastel',
    handsFull: 'hands full - set it on a counter first',
    dishInHand: 'one dish at a time - serve this one first',
    missing: 'add the rest - or toss in anything for a mystery stew',
    alone: 'toss in anything else for a mystery stew',
    nobody: 'nobody is waiting yet',
    needDish: 'bring a dish from a pot or fryer',
    closed: 'closed for today - good night!',
    justAdded: 'it just went in',
    takeDish: 'take the dish to a window or counter',
    emptyPot: 'add ingredients here',
    emptyFryer: 'fry a raw pastel here',
    emptyBoard: 'put cheese here to chop it',
    emptyCounter: 'set anything down here',
    emptyBin: 'bring something to throw away',
  },
  next: {
    night: 'The day is done. Good night, chef!',
    keepDish: 'Set it on a counter. Someone will want it soon.',
    notOrdered: 'Not ordered - keep it on a counter, or serve it as a surprise!',
    serveDish: 'Take the {dish} to a SERVE WINDOW.',
    chopCheese: 'Put it on the CUTTING BOARD and press E 3 times.',
    cheeseSwap: 'Swap it onto the CUTTING BOARD (you take what is there), then press E 3 times.',
    cheeseWait: 'Chop the cheese on the CUTTING BOARD first - set this one on a counter meanwhile.',
    dough: 'Put it on chopped cheese to make a pastel.',
    choppedCheese: 'Add it to a POT for baiao, or put dough on it for a pastel.',
    rawPastel: 'Pop it in the FRYER.',
    toPot: 'Put it in a POT with the rest of its recipe.',
    doughBoard: 'Chop some cheese first - the dough can wait under it on the CUTTING BOARD.',
    doughWait: 'Chop some cheese first - set the dough on a counter meanwhile.',
    notNeeded: 'Nobody ordered that - set it on a counter, or toss it in the BIN.',
    freePot: 'Both POTS are taken - toss anything in one for a mystery stew to free it.',
    freePotHeld: 'Both POTS are taken - toss it in one for a mystery stew to free it.',
    ready: 'The {station} is ready! Press E on it to plate it.',
    readyFree: 'Nobody ordered what is in the {station} - plate it to free the {station}.',
    coins: 'Coins! Walk over them to scoop them up.',
    cooking: 'Bubbling away. Take it out anytime, or start the next order.',
    missing: 'The {station} needs {items} for {dish}.',
    waiting: 'The {station} waits for more - or toss in anything for a mystery stew.',
    relax: 'Relax and enjoy the lake. Guests are on their way.',
  },
  // "Next:" hint for the oldest order when the chef has free hands and nothing is cooking.
  hint: {
    brigadeiro: 'Brigadeiro: milk + chocolate (left crates) in a POT.',
    baiao: 'Baiao: rice + beans + chopped cheese in a POT.',
    pastel: 'Pastel: chop cheese, put dough on it, then FRY it.',
  },
  help: {
    title: 'Paused - the food will wait',
    controls: 'Controls',
    move: 'Move: WASD / arrows',
    interact: 'Use: E / Space',
    pause: 'Help / pause: Esc / P / H',
    mute: 'Sound: M',
    recipes: 'Recipes',
    brigadeiro: 'Milk + chocolate in a POT, then plate it with E.',
    baiao: 'Rice + beans + chopped cheese in a POT, then plate it with E.',
    pastel: 'Chop cheese, put dough on it, FRY it, then plate it with E.',
    rules: 'Nothing burns and nobody is in a hurry. Take food out early if you like: customers find rustic, '
      + 'cozycooked dishes charming.',
    back: 'Esc / P / H: back to the kitchen',
    quit: 'Q: back to the title - coins are kept, the day starts over',
  },
  diary: {
    title: 'Diary - Day {day}',
    line: '{customer} had {dish}: {mood}.',
    mood: { happy: 'loved it', cozycooked: 'found it charmingly rustic', surprised: 'was happily surprised' },
    unserved: '{customer} will come back tomorrow.',
    more: '...and {n} more',
    coinsToday: 'Coins today: {n}',
    coinsTotal: 'Total coins: {n}',
    served: 'Dishes served: {n}',
    rustic: 'Rustic dishes: {n}',
    next: 'Press any key to open day {day}',
    closing: [
      'The lake is quiet. The pots are clean. Good day.',
      'Somewhere, a capybara is still thinking about lunch.',
      'Nothing burned. Nothing ever does.',
      'The lanterns hum. Tomorrow smells like chocolate.',
      'Everyone left a little happier than they came.',
      'The sloth is still waving goodbye. Slowly.',
    ],
  },
};
