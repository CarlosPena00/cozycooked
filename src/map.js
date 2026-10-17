// Builds the kitchen from MAP: baked images for everything static, invisible collision boxes, and station state.
// The whole scene (lake, banks, walls, floor, stations, deck, decor) is painted once into three small canvases at
// 16 px per tile, one per water frame, and shown at ART_SCALE. Swapping them animates the water for the cost of
// one image per frame, the same in Canvas and WebGL.
import { TILE, MAP, STATIONS, CRATES, TERRAIN, SPRITES, DECOR, KITCHEN, DECK, UPGRADES } from './data.js';
import { DEPTH } from './views.js';
import { ART_FRAMES, WALL_TALL_FRAMES } from '../assets/art/frames.js';

export const MAP_TEXTURES = ['map0', 'map1', 'map2']; // one per water frame
const WATER_MS = 620; // water frame time
const ART = 16; // source tile size
const W = MAP[0].length;
const H = MAP.length;
const COUNTER_BASED = new Set(['counter', 'board', 'pot', 'fryer']);
// The tall back wall, left to right between its two corners (repeats if the kitchen is wider).
const BACK_WALL = ['wall', 'wall_window', 'wall_shelf', 'wall_picture', 'wall_pans', 'wall_window', 'wall_clock'];
const SHADE = 'rgba(14, 36, 48, 0.38)'; // soft shadow on the water under the kitchen and the deck

const at = (tx, ty) => MAP[ty]?.[tx] ?? '~';
const isDeck = (tx, ty) => TERRAIN[at(tx, ty)] === 'deck';

// What a map tile looks like: 'water', 'floor', 'deck', 'wall', a station type or 'crate'.
function kindAt(tx, ty) {
  const ch = at(tx, ty);
  if (CRATES[ch]) return 'crate';
  // Old cupboards are baked as plain counters: their own sprite (or what was built there) is drawn on top.
  if (STATIONS[ch]?.type === 'spot') return 'counter';
  if (STATIONS[ch]) return STATIONS[ch].type;
  // Wall tiles inside the room's right column are wall; the other ring corners are plain counters.
  if (TERRAIN[ch] === 'wall') return tx === KITCHEN.right ? 'wall' : 'counter';
  return TERRAIN[ch] ?? 'floor';
}

function painter(scene, ctx) {
  const draw = (key, index, x, y) => {
    const f = scene.textures.getFrame(key, index);
    ctx.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, x, y, f.cutWidth, f.cutHeight);
  };
  return {
    art: (name, tx, ty, dx = 0, dy = 0) => draw('art', ART_FRAMES[name], tx * ART + dx, ty * ART + dy),
    tall: (name, tx, ty) => draw('wallsTall', WALL_TALL_FRAMES[name], tx * ART, (ty - 1) * ART),
    image: (key, tx, ty) => draw(key, undefined, tx * ART, ty * ART),
    shade: (x, y, w, h) => {
      ctx.fillStyle = SHADE;
      ctx.fillRect(x, y, w, h);
    },
  };
}

// The lake: water everywhere, a grassy bank on the left and right edges.
function paintLake(p, frame) {
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) p.art(`water_${frame}`, tx, ty);
    p.art(`grass_${ty % 2}`, 0, ty);
    p.art('shore_w', 1, ty);
    p.art('shore_e', W - 1, ty);
  }
}

// The room: tall back wall, side walls, bottom wall on stilts over the water, floor, counters and stations.
function paintKitchen(p) {
  const { left, top, right, bottom } = KITCHEN;
  const L = left - 1; // the left wall stands outside the station ring, over the water
  for (let ty = top; ty <= bottom; ty++) {
    p.art('wall_side', L, ty);
    for (let tx = left; tx <= right; tx++) {
      const kind = kindAt(tx, ty);
      if (kind === 'floor' || kind === 'crate' || kind === 'bin') p.art(`floor_${(tx * 3 + ty * 5) % 3}`, tx, ty);
      if (kind === 'wall' || kind === 'serve') p.art('wall_side', tx, ty);
      const body = kind === 'crate' ? `crate_${CRATES[at(tx, ty)]}` : SPRITES[kind];
      if (body) p.art(body, tx, ty);
      if (COUNTER_BASED.has(kind)) {
        if (!COUNTER_BASED.has(kindAt(tx - 1, ty))) p.art('counter_cap_l', tx, ty);
        if (!COUNTER_BASED.has(kindAt(tx + 1, ty))) p.art('counter_cap_r', tx, ty);
      }
    }
  }
  // Back wall (16x32 pieces rising over the row above), drawn last so it overlaps nothing it should not.
  for (let tx = L; tx <= right; tx++) {
    const name = tx === L || tx === right ? 'wall_corner' : BACK_WALL[(tx - left) % BACK_WALL.length];
    p.tall(name, tx, top - 1);
  }
  for (let tx = L; tx <= right; tx++) p.art('wall_front', tx, bottom + 1);
}

// Deck boards, and an edge with posts below every deck tile that ends over the water.
function paintDeck(p) {
  // Soft shadows the house and the deck cast on the water, just below their stilts.
  const { platform, pier } = DECK;
  p.shade((KITCHEN.left - 1) * ART + 2, (KITCHEN.bottom + 2) * ART - 2, (platform.right + 2 - KITCHEN.left) * ART, 5);
  p.shade((pier.left) * ART, (pier.bottom + 2) * ART - 2, (W - pier.left) * ART, 5);
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (!isDeck(tx, ty)) continue;
      p.art(`deck_${(tx + ty) % 2}`, tx, ty);
      if (at(tx, ty + 1) === '~') p.art('deck_edge', tx, ty + 1);
    }
  }
}

// Draws one full frame of the scene into a 16 px per tile canvas texture.
function paint(scene, key, frame) {
  const tex = scene.textures.createCanvas(key, W * ART, H * ART);
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  const p = painter(scene, ctx);
  paintLake(p, frame);
  paintDeck(p);
  paintKitchen(p);
  for (const { name, tx, ty, dx = 0, dy = 0 } of DECOR) {
    if (name in ART_FRAMES) p.art(name, tx, ty, dx, dy);
    else p.image(name, tx, ty);
  }
  // refresh() re-uploads with the game's default (LINEAR, since antialias is on), so NEAREST must come after it.
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// Baked once per game; scene restarts (new days) and the title reuse the textures.
export function bakeMap(scene) {
  MAP_TEXTURES.forEach((key, frame) => {
    if (!scene.textures.exists(key)) paint(scene, key, frame);
  });
}

// The baked map as one image whose water ripples (it cycles through the three bakes).
export function addMapImage(scene) {
  bakeMap(scene);
  const image = scene.add.image(0, 0, MAP_TEXTURES[0]).setOrigin(0).setScale(TILE / ART).setDepth(DEPTH.map);
  let frame = 0;
  scene.time.addEvent({
    delay: WATER_MS, loop: true,
    callback: () => image.setTexture(MAP_TEXTURES[(frame = (frame + 1) % MAP_TEXTURES.length)]),
  });
  return image;
}

export function newStation(type, tx, ty, kind = null) {
  return { type, tx, ty, kind, item: null, under: null, chops: 0, contents: [], progress: 0 };
}

// The old cupboards (U tiles), as "tx,ty" keys.
export const SPOT_KEYS = MAP.flatMap((row, ty) => [...row].flatMap((ch, tx) => (STATIONS[ch]?.type === 'spot' ? [`${tx},${ty}`] : [])));

// A station standing on an old cupboard tile: the cupboard itself, or the upgrade built there (upgrade id or null).
// `onSpot` tells StationView to draw its body (the baked map only has a counter there).
export function spotStation(tx, ty, upgrade = null) {
  return { ...newStation(upgrade ? UPGRADES[upgrade].type : 'spot', tx, ty), onSpot: true, upgrade };
}

// -> { ground: the baked map image, walls: arcade static group, stations: Map "tx,ty" -> station state }
// upgrades: { "tx,ty": upgrade id } built on the old cupboards (from the save).
export function buildKitchen(scene, upgrades = {}) {
  const ground = addMapImage(scene);
  const walls = scene.physics.add.staticGroup();
  const stations = new Map();
  MAP.forEach((row, ty) => [...row].forEach((ch, tx) => {
    const kind = CRATES[ch] ?? null;
    const def = STATIONS[ch];
    const key = `${tx},${ty}`;
    if (def?.type === 'spot') stations.set(key, spotStation(tx, ty, upgrades[key] ?? null));
    else if (def || kind) stations.set(key, newStation(def?.type ?? 'crate', tx, ty, kind));
  }));
  for (const { x, y, w, h } of solidRects()) {
    walls.add(scene.add.zone(x * TILE + (w * TILE) / 2, y * TILE + (h * TILE) / 2, w * TILE, h * TILE));
  }
  return { ground, walls, stations };
}

// The kitchen is walled in, so only walls and stations need collision. Solid tiles are merged into a few big
// rectangles (row runs, then equal runs stacked down): with one box per tile, sliding diagonally along a wall
// caught on the seams between tiles. -> [{ x, y, w, h }] in tiles.
function solidRects() {
  const solid = (ch) => !!(STATIONS[ch] || CRATES[ch] || TERRAIN[ch] === 'wall');
  const open = {}; // rectangles still growing down, by "x,w"
  const done = [];
  MAP.forEach((row, ty) => {
    const runs = [];
    for (let tx = 0; tx < W; tx++) {
      if (!solid(row[tx])) continue;
      const last = runs[runs.length - 1];
      if (last && last.x + last.w === tx) last.w += 1;
      else runs.push({ x: tx, w: 1 });
    }
    const keys = new Set(runs.map((r) => `${r.x},${r.w}`));
    for (const [key, rect] of Object.entries(open)) {
      if (!keys.has(key)) {
        done.push(rect);
        delete open[key];
      }
    }
    for (const r of runs) {
      const key = `${r.x},${r.w}`;
      if (open[key]) open[key].h += 1;
      else open[key] = { x: r.x, y: ty, w: r.w, h: 1 };
    }
  });
  return [...done, ...Object.values(open)];
}
