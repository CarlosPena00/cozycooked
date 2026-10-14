"""Generate Undercooked's self-made pixel art (16x16 frames; looks right from 4x up to 6x).

Run from games/cozycooked/:  uv run -q --with pillow python -I tools/make_art.py

Outputs (assets/art/):
  art.png        one spritesheet, 16x16 frames, no spacing, 16 columns (new frames are appended, so indexes of
                 older frames never move)
  frames.json    { "frameWidth", "frameHeight", "columns", "frames": {name: index}, "anims": {name: [frame names]},
                   "wallsTall": {...} }
  frames.js      the same data as an ES module (ART_FRAMES, ART_ANIMS, WALL_TALL_FRAMES)
  walls_tall.png 16x32 frames: tall back-wall pieces (bottom half on the wall tile, top half rises above it)
  bubble.png     24x24 speech bubble (16x16 icon goes at x=4, y=2)
  lantern_post.png  32x32: 2 frames of 16x32 (lit, unlit) for the deck: honey-wood post, brass lantern
  glow.png       64x64 warm radial glow (already colored: tint is WebGL-only in Phaser)
  rug_oval.png   48x32 braided oval rug (3x2 tiles)
  mist.png       256x128 dawn mist, tiles on both axes, pre-coloured with alpha
  sunset.png     8x256 vertical golden-hour wash, stretch it over the screen

Optional: pass a folder to also write review images there (contact.png at 6x, mockup_*.png), e.g.
  uv run -q --with pillow python -I tools/make_art.py /tmp/preview

Style: one cozy hand-made look. Shapes are letter grids; objects get a 1px dark warm outline (a deep shade of the
neighbouring colour, never pure black) so they read at 6x; full tiles (floor, counters, walls, water) have no
outline and tile seamlessly.
"""
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'art'

# Shared palette (warm, close to Kenney's roguelike packs). Sprites can override letters.
PAL = {
    'k': '#2b1d1a',  # eyes, darkest
    'h': '#ffffff',
    'w': '#fbf6ec', 'W': '#e3d8c3',
    'q': '#fff1c4', 'y': '#f3d77e', 'Y': '#d4a94a',
    'o': '#f0a23a', 'O': '#c9702a',
    'r': '#d9534a', 'R': '#a83a3a',
    'p': '#f4a3b0', 'P': '#e07a8f',
    'b': '#8a5634', 'B': '#6b3e26', 'd': '#4a2a1a',
    't': '#c8a480', 'T': '#b98b5e', 'u': '#8f673f', 'U': '#6e4e2e',
    'g': '#79b742', 'G': '#4f8a35',
    'l': '#4d8fd1', 'L': '#356aa8', 'i': '#8cc0ee',
    's': '#c2c2c2', 'S': '#999999', 'm': '#757575', 'M': '#5c5c5c', 'n': '#494949',
    'e': '#f5e6c8', 'E': '#e2c99a',
    'x': '#9a4a36', 'X': '#6e3024', 'z': '#c27560',
}
WARM_DARK = (59, 36, 30)


def rgb(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def grid(rows, pal=None, alpha=255):
    """Letter grid -> RGBA image. '.' is transparent."""
    p = {**PAL, **(pal or {})}
    w = len(rows[0])
    assert all(len(r) == w for r in rows), [len(r) for r in rows]
    im = Image.new('RGBA', (w, len(rows)), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                im.putpixel((x, y), rgb(p[ch]) + (alpha,))
    return im


def outline_color(c):
    d = tuple(int(v * 0.42) for v in c[:3])
    return tuple(int(d[i] * 0.5 + WARM_DARK[i] * 0.5) for i in range(3)) + (255,)


def outlined(im):
    """Add a soft 1px outline (4-neighbourhood, so corners stay round). Grows the image by 1px each side."""
    w, h = im.size
    src = Image.new('RGBA', (w + 2, h + 2), (0, 0, 0, 0))
    src.paste(im, (1, 1))
    out = src.copy()
    for y in range(h + 2):
        for x in range(w + 2):
            if src.getpixel((x, y))[3]:
                continue
            for dx, dy in ((0, 1), (0, -1), (-1, 0), (1, 0)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w + 2 and 0 <= ny < h + 2 and src.getpixel((nx, ny))[3] > 128:
                    out.putpixel((x, y), outline_color(src.getpixel((nx, ny))))
                    break
    return out


def frame(im, align='center', dx=0, dy=0):
    """Place an image on a 16x16 frame. align: center | bottom."""
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    w, h = im.size
    x = (16 - w) // 2 + dx
    y = (16 - h) // 2 if align == 'center' else 16 - h
    f.alpha_composite(im, (x, y + dy)) if x >= 0 and y + dy >= 0 else f.paste(im, (x, y + dy), im)
    return f


def sprite(rows, pal=None, align='center', dx=0, dy=0):
    return frame(outlined(grid(rows, pal)), align, dx, dy)


def stack(*layers):
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for layer in layers:
        f.alpha_composite(layer)
    return f


def face(rows, cx, cy, eye='d', blush='p', mouth=True):
    """Sleepy face for cozycooked food: closed eyes, blush, tiny 'o' mouth. Returns new rows."""
    g = [list(r) for r in rows]

    def put(x, y, ch):
        if 0 <= y < len(g) and 0 <= x < len(g[0]) and g[y][x] != '.':
            g[y][x] = ch
    for x in (cx - 3, cx - 2, cx + 2, cx + 3):
        put(x, cy, eye)
    put(cx - 4, cy + 1, blush)
    put(cx + 4, cy + 1, blush)
    if mouth:
        put(cx, cy + 2, eye)
    return [''.join(r) for r in g]


def happy(rows):
    """Turn 1px 'k' eyes into closed happy '^' eyes."""
    g = [list(r) for r in rows]
    eyes = [(x, y) for y, r in enumerate(rows) for x, ch in enumerate(r) if ch == 'k']
    for x, y in eyes:
        g[y][x] = rows[y + 1][x] if y + 1 < len(rows) and rows[y + 1][x] not in '.k' else rows[y][x - 1]
        g[y - 1][x] = 'k'
        g[y][x - 1] = 'k'
        g[y][x + 1] = 'k'
    return [''.join(r) for r in g]


def bob(rows, keep):
    """Idle bob: everything above the last `keep` rows moves down 1px (the row just above them is dropped)."""
    return ['.' * len(rows[0])] + rows[:-keep - 1] + rows[-keep:]


# ---------------------------------------------------------------- ingredients

MILK = [
    "..ssssssss..",
    ".sSSSSSSSSs.",
    ".hsssssssss.",
    ".lilllllllL.",
    ".lilllllllL.",
    ".wwwwwwwwwW.",
    ".whwwiiiwwW.",
    ".wwwilllwwW.",
    ".wwwwilwwwW.",
    ".wwwwwwwwwW.",
    ".lilllllllL.",
    ".lilllllllL.",
    "..SSSSSSSS..",
]

CHOCOLATE = [
    "bbbbdbbbbd",
    "bBBBdbBBBd",
    "bBBBdbBBBd",
    "dddddddddd",
    "bbbbdbbbbd",
    "bBBBdbBBBd",
    "bBBBdbBBBd",
    "dddddddddd",
    "yyyyyyyyyY",
    "rrrrrrrrRR",
    "rrwwwwwwrR",
    "rrwrrrrwrR",
    "rrwwwwwwrR",
    "rrrrrrrrRR",
]

RICE = [
    "....wwww....",
    "..wwwhwwww..",
    ".wwhwwwWwhw.",
    ".WwwwwWwwwW.",
    ".uTTTTTTTTu.",
    "..tttttttT..",
    ".ttttttttTT.",
    "tttttttttTTT",
    "tttWWwWWtTTT",
    "tttWwwwWtTTT",
    "tttWWwWWtTTT",
    "ttttttttTTTT",
    ".TTTTTTTTTT.",
]

BEANS = [
    "....zxzx....",
    "..zxXzxXzx..",
    ".zxXzxXzxXx.",
    ".xXzxXxzxXxX",
    "tttttttttttT",
    "tTTTTTTTTTTu",
    ".tTTTTTTTTu.",
    "..uTTTTTTu..",
    "...uuuuuu...",
]
BEANS_PAL = {'t': '#d98a4e', 'T': '#c0703a', 'u': '#9a5530'}  # clay bowl

CHEESE = [
    "...qqqqqqqqq",
    "..qqqqqqqqqY",
    ".qqqqqqqqqYY",
    "yyyyyyyyyYYY",
    "yyEEyyyyyYYY",
    "yyEEyyyEyYYY",
    "yyyyyyyyyYYY",
    "yyyyyEEyyYY.",
    "yyyyyyyyyY..",
]
CHEESE_PAL = {'E': '#dcb75c'}

CHEESE_CHOPPED = [
    "qqqY..qqqY..",
    "yyyY..yyyY..",
    "yyYY..yyYY..",
    "............",
    "...qqqY.qqqY",
    "...yyyY.yyyY",
    "...yyYY.yyYY",
]

DOUGH = [
    "....eeeeee....",
    "..eeeeweeeee..",
    ".eeweeeeeeweE.",
    "eeeeeeeeeeeeEE",
    "eeeeeweeeeeeEE",
    "UttttttttttttU",
    "UTTTTTTTTTTTTU",
    ".eeeeeeeeeeEE.",
    "..EEeeeeeeEE..",
    "....EEEEEE....",
]

PASTEL = [
    ".EeEeEeEeEeEe.",
    "eewwweeeeeeeeE",
    "Eweeeeeeeeeeee",
    "eeeeeeeeeeeeeE",
    "Eeeeeeeeeeeeee",
    "eeeeeeeeeeeEEE",
    ".EeEeEeEeEeEe.",
]
PASTEL_FRIED = [
    ".EeEeEeEeEeEe.",
    "eewwweeeweeeeE",
    "Eweeeeweeeeeee",
    "eeeeeeeeeeweeE",
    "Eeeweeeeeeeeee",
    "eeeeeeeeweeEEE",
    ".EeEeEeEeEeEe.",
]
FRIED_PAL = {'e': '#eab350', 'E': '#c27a2e', 'w': '#f8da8c'}
PALE_PAL = {'e': '#f8eedd', 'E': '#ebcdbd', 'w': '#ffffff'}

BRIGADEIRO = [
    "....BBBB....",
    "..BbBBdBBB..",
    ".BbhbBBBdBB.",
    ".BbBBdBBBBB.",
    "BBBdBBBBBdBB",
    "BdBBBBBdBBBB",
    ".BBBBdBBBBd.",
    ".rrrrrrrrrr.",
    ".rRrRrRrRrR.",
    "..rRrRrRrR..",
    "..RRRRRRRR..",
]

PLATE = [
    "...wwwwwwww...",
    ".wwwWWWWWWwww.",
    "wwWWWWWWWWWWww",
    "wwWWWWWWWWWWww",
    ".wwwWWWWWWwww.",
    "..sswwwwwwss..",
    "....ssssss....",
]

# toppings drawn on a plate (the plate is drawn first, food sits on its well)
TOP_BRIGADEIRO = [
    "...BBB......",
    "..BhBdB.....",
    "..BBBBB.....",
    "...BBB......",
    "BBB....BBB..",
    "hBdB..BhBdB.",
    "BBBB..BBBBB.",
    "BBB....BBB..",
]
TOP_BRIGADEIRO_UNDER = [
    "...cccc.....",
    "..cchccc....",
    ".ccccccccc..",
    "cccccccccccc",
    "cccccccccccc",
    ".ccccccccccC",
    "..cCcccCccC.",
    "...C..C.....",
]
MELT_PAL = {'c': '#b98a66', 'C': '#9a6c4e', 'h': '#e3c4a6', 'd': '#5a3a2a'}

TOP_BAIAO = [
    "....wwxwww....",
    "..wxwwgwwywx..",
    ".wwywxwwwxwwg.",
    "wgwwwwyxwwwxww",
    "wwxwwgwwwywwww",
    ".WwwWwwWwwWwW.",
]
BAIAO_PAL = {'w': '#f3ead2', 'W': '#d9caa4', 'x': '#8a3b2e', 'y': '#f3d77e', 'g': '#6fae3e'}
TOP_BAIAO_UNDER = [
    "...h..h..h....",
    "..hwhwhwhwhw..",
    ".hwwywxwwwxwh.",
    "wwwwwwwwwwwwww",
    "wwxwwwwwwywwww",
    ".WwwWwwWwwWwW.",
]
BAIAO_PALE = {'w': '#fbf6e8', 'W': '#e6dcc4', 'x': '#b07a6e', 'y': '#f6e3a6', 'h': '#ffffff'}

TOP_PASTEL = [
    ".EeEeEeEeEe.",
    "eewweeeeweeE",
    "Eweeeweeeeee",
    "eeeeeeeeweeE",
    ".EeEeEeEeEe.",
]

TOP_MYSTERY = [
    ".......w.w....",
    "....vv..w.....",
    "..vvjvvvwvv...",
    ".vvvvvvjvvvv..",
    "vvjvvvvvvvvjvv",
    "vvvvvjvvvvvvvv",
    ".VvvVvvVvvVvV.",
]
MYSTERY_PAL = {'v': '#8aa05e', 'V': '#667d45', 'j': '#c3d98e', 'w': '#f3ead2'}

# ---------------------------------------------------------------- characters

CHEF = {
    'pal': {'w': '#fbf6ec', 'W': '#d9cfbf', 'f': '#f2c29a', 'F': '#d99c76', 'm': '#6b4a32',
            'h': '#6b4a32', 'r': '#d9534a', 'u': '#5a3a2a', 'n': '#4a3f4f'},
    'down': [
        "....wwwwww....",
        "...wwwwwwwW...",
        "...wwwwwwwW...",
        "....wwwwwW....",
        "...WWWWWWWW...",
        "..ffffffffff..",
        "..ffkffffkff..",
        "..fpfmmmmfpf..",
        "...ffffffff...",
        "...wwrrrrww...",
        "..wwwwrrwwww..",
        "..fwwwwwwwwf..",
        "...nnnnnnnn...",
    ],
    'up': [
        "....wwwwww....",
        "...wwwwwwwW...",
        "...wwwwwwwW...",
        "....wwwwwW....",
        "...WWWWWWWW...",
        "..hhhhhhhhhh..",
        "..hhhhhhhhhh..",
        "..fhhhhhhhhf..",
        "...ffffffff...",
        "...wwwrrwww...",
        "..wwwwrrwwww..",
        "..fwwwwwwwwf..",
        "...nnnnnnnn...",
    ],
    'side': [
        ".....wwwwww...",
        "....wwwwwwwW..",
        "....wwwwwwwW..",
        ".....wwwwwW...",
        "....WWWWWWWW..",
        "....hhhffffff.",
        "....hhffffkff.",
        "....hfffffmmff",
        ".....ffffffff.",
        ".....wwrrrw...",
        "....wwwwwwww..",
        "....wwwwwfww..",
        ".....nnnnnn...",
    ],
    'feet': {
        'down': ["...uu....uu...", "....uu..uu...."],
        'up': ["...uu....uu...", "....uu..uu...."],
        'side': [".....uu..uu...", "......uuuu...."],
    },
}

ANIMALS = {
    'capybara': {
        'pal': {'c': '#b5814f', 'C': '#8f6038', 'a': '#cf9d6c', 'n': '#4e3426',
                'o': '#f29a38', 'O': '#d4742a', 'g': '#79b742'},
        'front': [
            "......gg......",
            ".....oooo.....",
            ".CC..oooo..CC.",
            ".CcccOOOOcccC.",
            "..cccccccccc..",
            ".cckcccccckcc.",
            ".cccccccccccc.",
            ".cpcaaaaaacpc.",
            ".ccaaaaaaaacc.",
            ".ccaannnnaacc.",
            ".ccaaannaaacc.",
            "..caaaaaaaac..",
            ".CccccccccccC.",
            ".CCC......CCC.",
        ],
        'side': [
            "..........gg..",
            ".........oooo.",
            ".......C.oOOo.",
            "...cccccccccc.",
            ".cccccccccckcc",
            "cccccccccccpca",
            "ccccccccccccnn",
            "ccccccccccaaan",
            "cccccccccaaaa.",
            ".CCCCCCCCCCC..",
        ],
        'legs': [".CC.CC..CC.CC.", "..CCC....CCC.."],
    },
    'sloth': {
        'pal': {'f': '#a08a6c', 'F': '#7d6a52', 'e': '#efe2c6', 'D': '#5a4636', 'n': '#3b2a26',
                'm': '#3b2a26', 'c': '#efe2c6'},
        'front': [
            "....ffffff....",
            "..ffffffffff..",
            ".ffeeeeeeeeff.",
            ".feeeeeeeeeef.",
            "feDDDeeeeDDDef",
            "feDkDeeeeDkDef",
            "fpeDeennneeDpf",
            ".ffeeemmeeeff.",
            ".fffeeeeeefff.",
            "..ffGGGGGGff..",
            ".fcfGyyyyGfcf.",
            "..ffGGGGGGff..",
            "..ffffffffff..",
            "...FFF..FFF...",
        ],
        'side': [
            "........fffff.",
            ".......fffffff",
            "......fffeeeef",
            "......ffDkDeef",
            "......ffDDeeen",
            "..ffffffepemee",
            ".ffffffffeeef.",
            "ffffffffffff..",
            "fffffffffcff..",
            ".FFFFFFFFFFF..",
        ],
        'legs': [".FF..FF..FF...", "..FF..FFFF...."],
    },
    'toucan': {
        'pal': {'K': '#2f2b36', 'J': '#211e27', 'y': '#fbe6a0', 'o': '#f28a2e', 'O': '#d0661f',
                'z': '#3a2a2a', 'l': '#5fb6e8', 'r': '#d9534a', 'u': '#6a8fc0'},
        'front': [
            "....KKKKKK....",
            "...KKKKKKKK...",
            "..KKlkKKklKK..",
            "..KKyyooyyKK..",
            ".KKyyoooOyyKK.",
            ".KKyyoooOyyKK.",
            ".KKKyyooOyKKK.",
            ".KKKKKooKKKKK.",
            ".JKKKKKOKKKKJ.",
            ".JJKKKKKKKKJJ.",
            "..JKKKKKKKKJ..",
            "...JKKKKKKJ...",
            "....rrrrrr....",
            "....uu..uu....",
        ],
        'side': [
            "......KKKK....",
            ".....KKKKKK...",
            ".....KKylkoo..",
            "....KKyyoooooo",
            "...KKKyyOOOOzz",
            "..KKKKyy......",
            ".KKKKKKy......",
            "KKJJKKKK......",
            "KJJJKKKK......",
            "JJJJKKKK......",
            "JJ.KKKKr......",
            "J....rr.......",
        ],
        'legs': ["....uu.u......", "....u.uu......"],
    },
    'toad': {
        'pal': {'a': '#a39456', 'A': '#756839', 'b': '#eadca8', 'y': '#f2c14e', 'd': '#7c6f3c',
                'm': '#4e4226'},
        'front': [
            "..aaa....aaa..",
            ".ayyya..ayyya.",
            ".aykya..aykya.",
            "aaaaaaaaaaaaaa",
            "aadaaaaaaaadaa",
            "aaaaaadaaaaaaa",
            "apammmmmmmmapa",
            "aaabbbbbbbbaaa",
            ".abbbbbbbbbba.",
            "AAabbbbbbbbaAA",
            "AAA.AAAAAA.AAA",
        ],
        'side': [
            ".......aaa....",
            "......ayyya...",
            "....aaaykya...",
            "..aaaaaaaaaaa.",
            ".aadaaaadaaaaa",
            "aaaaaaaaaapmmm",
            "aadaaaaaaabbb.",
            "AAAaaaaabbbb..",
        ],
        'legs': ["AAAAA..AA.AA..", ".AAAA.AA..AA.."],
    },
    'wolf': {
        'pal': {'o': '#d9773a', 'O': '#b0582a', 'K': '#2b2226', 'w': '#f3e9d8'},
        'front': [
            ".O..........O.",
            ".OO........OO.",
            ".OwO......OwO.",
            ".OwwOooooOwwO.",
            "..oooooooooo..",
            ".oookooookooo.",
            ".oooowwwwoooo.",
            "..ooowKKwooo..",
            "...oowKKwoo...",
            "...KKKwwKKK...",
            "...oKKwwKKo...",
            "...oooooooo...",
            "...KK....KK...",
            "...KK....KK...",
        ],
        'side': [
            "..........O.O.",
            "..........OOO.",
            ".........ooooo",
            ".........ookoo",
            "........KKowwK",
            "w......KKKoo..",
            "wo.ooooooKoo..",
            ".ooooooooooo..",
            "..ooooooooOO..",
            "..OOOOOOOOOO..",
        ],
        'legs': [
            ["...KK...KK....", "...KK...KK....", "...KK...KK....", "...KK...KK...."],
            ["...KK...KK....", "..KK.....KK...", "..KK.....KK...", ".KK.......KK.."],
        ],
    },
}

# ---------------------------------------------------------------- kitchen kit (one cozy wood style, no Kenney)
# Full tiles (counter, floor, walls, deck, water) are drawn edge to edge with no outline so they tile seamlessly.
# Objects that sit on them (board, pot, bell, bin, plants...) get the dark 1px outline.

KIT = {
    # worktop: honey butcher block
    'q': '#f6dcaa', 'a': '#e8b97f', 'A': '#d9a267', 'j': '#b87c48',
    # counter front: walnut cabinet
    'L': '#f2cb92', 'D': '#6e3c22', 'f': '#a0613a', 'F': '#8a4e2d', 'v': '#6b3620', 'y': '#f5d37a',
    'd': '#4a281a',
}


def paint(rows, pal=None):
    """Like grid(), but for full tiles: every letter must be in the palette ('.' stays transparent)."""
    return grid(rows, {**PAL, **KIT, **(pal or {})})


def on(base, obj, x=0, y=0):
    """Composite obj onto a copy of base at (x, y); obj may hang over the frame edge (it gets clipped)."""
    f = base.copy()
    layer = Image.new('RGBA', f.size, (0, 0, 0, 0))
    layer.paste(obj, (x, y), obj)
    f.alpha_composite(layer)
    return f


WORKTOP = [  # rows 0-9 of a counter: back edge, then 3 butcher-block strips with staggered joints
    "jjjjjjjjjjjjjjjj",
    "qqqqqqqqqqqqqqqq",
    "aaaaaaaaaaajaaaa",
    "AAAAAAAAAAAjAAAA",
    "aaaajaaaaaaaaaaa",
    "aaaajaaaaaaaaaaa",
    "AAAAjAAAAAAAAAAA",
    "aaaaaaaaaaaaajaa",
    "aaaaaaaaaaaaajaa",
    "AAAAAAAAAAAAAjAA",
]
CABINET = [  # rows 10-15: rounded lip, door with a brass knob, toe kick
    "LLLLLLLLLLLLLLLL",
    "DDDDDDDDDDDDDDDD",
    "vffffffffffffffF",
    "vfFFFFFFFFFFFyfF",
    "vffffffffffffffF",
    "dddddddddddddddd",
]


def counter_tile():
    return paint(WORKTOP + CABINET)


def counter_cap(side):
    """Overlay for the open end of a counter run: a darker side edge (left or right)."""
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    x, x2 = (0, 1) if side == 'l' else (15, 14)
    for y in range(16):
        f.putpixel((x, y), rgb('#5a3020' if y < 11 else '#3e2216') + (255,))
        if 1 <= y <= 9:
            f.putpixel((x2, y), rgb(KIT['q']) + (255,))
    return f


BOARD = [  # pale birch board with a handle tab and a hole, so it reads as a cutting board
    ".bbbbbbbbbb...",
    "bbbbbbbbbbbb..",
    "bbbbbbbbbbbbbb",
    "bbbbbbbbbbbbhb",
    "bbbbbbbbbbbbbb",
    "bbbbbbbbbbbb..",
    "BBBBBBBBBBBB..",
]
BOARD_PAL = {'b': '#f6e0b4', 'B': '#c99a62', 'h': '#8a5634'}
KNIFE = [
    "hhhhhhhh.....",
    "SSSSSSSSmkkkk",
]
KNIFE_PAL = {'h': '#ffffff', 'S': '#aab6c0', 'm': '#6d7880', 'k': '#4a2e22'}
CARROT = ["o.o", "...", "o.g"]


def board_tile():
    f = on(counter_tile(), outlined(grid(BOARD, BOARD_PAL)), 0, 1)
    veg = grid(["oo.o.", "o..gg", ".oo.g"], {'o': '#f08a3a', 'g': '#79b742'})
    f = on(f, veg, 2, 3)
    f = on(f, outlined(grid(KNIFE, KNIFE_PAL)), 1, 6)
    return f


STOVE = [  # cast-iron top with a burner, cream enamel oven front
    "jjjjjjjjjjjjjjjj",
    "iIIIIIIIIIIIIIIi",
    "iIiiiiiiiiiiiiIi",
    "iIiiioooooooiiIi",
    "iIiiooiiiiiooiIi",
    "iIiioiiiiiiioiIi",
    "iIiiooiiiiiooiIi",
    "iIiiioooooooiiIi",
    "iIiiiiiiiiiiiiIi",
    "iiiiiiiiiiiiiiii",
    "eeeeeeeeeeeeeeee",
    "DDDDDDDDDDDDDDDD",
    "EkKkEEEEEEEEkKkE",
    "EEEEwwwwwwwwEEEE",
    "EEEEwgggggggEEEE",
    "dddddddddddddddd",
]
STOVE_PAL = {'i': '#3d3634', 'I': '#4f4744', 'o': '#6b605b', 'e': '#fbf1dc', 'E': '#e6d6b6',
             'k': '#3d3634', 'K': '#c9a24a', 'w': '#5a4038', 'g': '#f0a050'}

POT = [
    "..CCCCCCCCCC..",
    ".CiiiiiiiiiiC.",
    "HCiiiiiiiiiiCH",
    "HHceeeeeeeecHH",
    ".Cchhcccccccc.",
    ".Cchccccccccc.",
    ".Ccccccccccccc",
    "..CccccccccC..",
    "...CCCCCCCC...",
]
POT_PAL = {'c': '#dc8650', 'C': '#a2542c', 'h': '#f6bb86', 'e': '#f0a46c', 'i': '#3a2a28', 'H': '#4a2e22'}
POT_AT = (0, 0)  # where the outlined pot sits on the stove tile
POT_FILLS = {  # colours of the 2 rows inside the pot (top row, bottom row)
    'broth': ('#eedfb8', '#d8c398'),
    'brigadeiro': ('#7a4a2e', '#5a321e'),
    'baiao': ('#efe3c4', '#8a3b2e'),
    'mystery': ('#9ab066', '#7a9150'),
}


def pot_stove():
    return on(paint(STOVE, STOVE_PAL), outlined(grid(POT, POT_PAL)), POT_AT[0] + 0, POT_AT[1] + 1)


def pot_fill(name):
    """Transparent overlay that covers the pot's dark inside (the 'i' pixels of POT) with food colours."""
    top, bottom = POT_FILLS[name]
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    inside = [(x, y) for y, r in enumerate(POT) for x, ch in enumerate(r) if ch == 'i']
    y0 = min(y for _, y in inside)
    for x, y in inside:
        col = top if y == y0 else bottom
        if name == 'baiao':
            col = '#8a3b2e' if (x + y) % 3 == 0 else '#f3d77e' if (x * 7 + y) % 5 == 0 else '#efe3c4'
        if name == 'brigadeiro' and (x, y) in ((4, 1), (9, 2)):
            col = '#a8714a'
        if name == 'mystery' and (x, y) in ((4, 1), (9, 2)):
            col = '#d2e4a0'
        f.putpixel((x + 1 + POT_AT[0], y + 2 + POT_AT[1]), rgb(col) + (255,))
    return f


FRYER = [  # steel deep fryer: golden oil, a dark wire basket with a red handle, a flame on the front
    "jjjjjjjjjjjjjjjj",
    "nSSSSSSSSSSSSSSn",
    "nSnnnnnnnnnnnnSn",
    "nSnoQoooooooqnSn",
    "nSnoKKKKKKKKonSn",
    "nSnoKoqooQoKonSn",
    "nSnQKoooooqKonSn",
    "nSnoKKKKKKKKQnSn",
    "nSnooqoRRoooonSn",
    "nSSSSSSSRRSSSSSn",
    "SSSSSSSSRRSSSSSS",
    "nnnnnnnnkknnnnnn",
    "nmmmmmmmlmmmmmmn",
    "nmmmmmmlLlmmmmmn",
    "nmmmmmmlLlmmmmmn",
    "dddddddddddddddd",
]
FRYER_PAL = {'n': '#5f5a58', 'S': '#b4b0aa', 'm': '#8c8682', 'o': '#f0b23e', 'Q': '#fff4c0', 'q': '#ffd77a',
             'R': '#d9534a', 'k': '#8f2f2a', 'K': '#4a3a34', 'l': '#f2823a', 'L': '#ffd060'}


def fryer_tile(bubbles):
    rows = [list(r) for r in FRYER]
    if bubbles:  # move the bubbles around for the second frame
        for y in range(3, 9):
            for x in range(3, 13):
                if rows[y][x] in 'Qq':
                    rows[y][x] = 'o'
        for (x, y), ch in zip(((5, 3), (11, 3), (6, 6), (9, 5), (12, 6), (4, 8), (11, 8)), 'QqQqQqQ'):
            rows[y][x] = ch
    return paint([''.join(r) for r in rows], FRYER_PAL)


PLATE_RIM = {'w': '#fbf6ec', 'W': '#e6ecee', 's': '#9cc0dc'}


def plates_tile():
    f = counter_tile()
    for i in range(3):
        f = on(f, outlined(grid(PLATE, PLATE_RIM)), 0, 3 - 2 * i)
    return f


SERVE = [  # pass-through hatch: striped awning, shade, honey sill, painted front
    "dddddddddddddddd",
    "RRwwRRwwRRwwRRww",
    "RRwwRRwwRRwwRRww",
    "RRwwRRwwRRwwRRww",
    "RRwwRRwwRRwwRRww",
    ".RR..ww..RR..ww.",
    "vvvvvvvvvvvvvvvv",
    "qqqqqqqqqqqqqqqq",
    "aaaaaaaaaaaaaaaa",
    "AAAAAAAAAAAAAAAA",
    "LLLLLLLLLLLLLLLL",
    "DDDDDDDDDDDDDDDD",
    "vGGGGGGGGGGGGGGv",
    "vGgggggggggggGGv",
    "vGGGGGGGGGGGGGGv",
    "dddddddddddddddd",
]
SERVE_PAL = {'R': '#d65a4a', 'w': '#fbf1dc', 'v': '#4a2e24', 'G': '#6f9a86', 'g': '#8fbca6'}
BELL = [
    "...k...",
    "..yyy..",
    ".yhyyY.",
    ".yyyyY.",
    "nnnnnnn",
]
BELL_PAL = {'k': '#6b4a32', 'y': '#f5c84a', 'Y': '#c8902a', 'h': '#fff4c0', 'n': '#6b4a32'}


def serve_tile():
    f = paint(SERVE, SERVE_PAL)
    f = on(f, outlined(grid(BELL, BELL_PAL)), 2, 5)
    ticket = grid([".n.", "www", "wlw", "www", "wlw"], {'n': '#6b4a32', 'w': '#fffaf0', 'l': '#9a8a7a'})
    f = on(f, outlined(ticket), 10, 3)
    return f


BIN = [  # little wooden compost bucket: green lid, iron hoops, a big leaf on the front
    ".....kk.....",
    "..gggggggg..",
    ".gGGGGGGGGg.",
    "..gggggggg..",
    ".hhhhhhhhhh.",
    ".tTtTtlLtTt.",
    ".tTtTllLLTt.",
    ".tTtlllLLTt.",
    ".tTllLlLlTt.",
    ".tTlLlllTtt.",
    ".tTLttTtTtt.",
    ".hhhhhhhhhh.",
    "..TTTTTTTT..",
]
BIN_PAL = {'k': '#3f5a34', 'g': '#7fb05a', 'G': '#5f8f44', 't': '#c89462', 'T': '#a8764a',
           'h': '#5a4a42', 'l': '#9fd06a', 'L': '#4f8a35'}

# ---- walls: back wall face (plaster over sage wainscot, under a dark roof beam), side tops, bottom face

WALL = [
    "dddddddddddddddd",
    "BBBBBBBBBBBBBBBB",
    "bbbbbbbbbbbbbbbb",
    "PPPPPPPPPPPPPPPP",
    "pppppppppppPpppp",
    "pppPpppppppppppp",
    "pppppppppppppppp",
    "ppppppppPpppppPp",
    "pPpppppppppppppp",
    "pppppppppppppppp",
    "uuuuuuuuuuuuuuuu",
    "GgggGgggGgggGggg",
    "GgggGgggGgggGggg",
    "GgggGgggGgggGggg",
    "GgggGgggGgggGggg",
    "GGGGGGGGGGGGGGGG",
]
WALL_PAL = {'d': '#3e2418', 'B': '#5c3624', 'b': '#7a4a2e', 'p': '#f1dfbb', 'P': '#e3cca2',
            'u': '#7a4a2e', 'g': '#9cb284', 'G': '#768f60'}

WINDOW = [
    "uuuuuuuuuuuu",
    "rRiiiiiiiiRr",
    "rRihiiiiiiRr",
    "rRiiiuiiiiRr",
    "rruuuuuuuurr",
    "rRjjjujjjjRr",
    "rrjjjujjjrrr",
    "uuuuuuuuuuuu",
]
WINDOW_PAL = {'u': '#8a5634', 'i': '#bfe4ea', 'j': '#94cdd8', 'h': '#ffffff', 'r': '#e88f86', 'R': '#c96a64'}
JARS = [
    "rr.yy.gg..",
    "oo.yy.ll..",
    "oo.YY.ll..",
    "oo.YY.LL..",
]
SHELF_PAL = {'r': '#c25b4a', 'o': '#f0a23a', 'y': '#fbf1dc', 'Y': '#f3d77e', 'g': '#6b4a32', 'l': '#9fc76a',
             'L': '#79a74a'}


def wall_tile(kind='plain'):
    f = paint(WALL, WALL_PAL)
    if kind == 'window':
        f = on(f, grid(WINDOW, WINDOW_PAL), 2, 2)
    elif kind == 'shelf':
        jars = grid([
            "rr..yyy..gg.",
            "oo..yyy..ll.",
            "oo..YYY.lll.",
            "oo..YYY.LLL.",
        ], SHELF_PAL)
        f = on(f, outlined(jars), 1, 3)
        f = on(f, grid(["uuuuuuuuuuuuuu", ".U..........U."], {'u': '#7a4a2e', 'U': '#5c3624'}), 1, 8)
    elif kind == 'pans':
        rail = grid(["kkkkkkkkkkkk"], {'k': '#5a4a42'})
        pan = grid([
            "..k..",
            "..k..",
            ".CCC.",
            "CcccC",
            "ChccC",
            "CcccC",
            ".CCC.",
        ], {'k': '#5a4a42', 'C': '#a2542c', 'c': '#dc8650', 'h': '#f6bb86'})
        ladle = grid(["k", "k", "k", "k", "k", "S", ], {'k': '#8a5634', 'S': '#a9b6c0'})
        f = on(f, rail, 2, 3)
        f = on(f, outlined(pan), 2, 3)
        f = on(f, outlined(ladle), 9, 3)
        f = on(f, outlined(grid(["sss", ".s."], {'s': '#a9b6c0'})), 8, 8)
        herbs = grid(["k.", "g.", "gG", "Gg", ".G"], {'k': '#8a5634', 'g': '#8fb35a', 'G': '#6f8f44'})
        f = on(f, outlined(herbs), 12, 3)
    elif kind == 'post':
        post = grid(["bB"] * 8, {'b': '#8a5634', 'B': '#6b3e26'})
        f = on(f, post, 7, 3)
    return f


WALL_SIDE = [  # top of a side wall seen from above: a plaster cap between two timbers, tiles vertically
    "dBbppppppppppbBd",
    "dBbppppPppppPbBd",
    "dBbppppppppppbBd",
    "dBbpPppppppppbBd",
    "dBbppppppppPpbBd",
    "dBbppppppppppbBd",
    "dBbpppPppppppbBd",
    "dBbppppppppppbBd",
] * 2
WALL_SIDE_PAL = {'d': '#3e2418', 'b': '#8a5634', 'B': '#6b3e26', 'q': '#a8704a', 'u': '#7a4a2e',
                 'p': '#ead6af', 'P': '#dcc49a'}

WALL_FRONT = [  # bottom wall: plaster cap, a short clapboard face, then stilts over the water (transparent)
    "dddddddddddddddd",
    "pppppppPpppppppp",
    "pppPpppppppppPpp",
    "bbbbbbbbbbbbbbbb",
    "dddddddddddddddd",
    "xxxxxxxxxxxxxxxx",
    "XXXXXXXXXXXXXXXX",
    "zzzzzzzzzzzzzzzz",
    "xxxxxxxxxxxxxxxx",
    "XXXXXXXXXXXXXXXX",
    "zzzzzzzzzzzzzzzz",
    "..bB........bB..",
    "..bB........bB..",
    "..bB........bB..",
    "..BB........BB..",
    "................",
]
WALL_FRONT_PAL = {**WALL_SIDE_PAL, 'x': '#b98656', 'X': '#a87449', 'z': '#7a4a2e'}


def wall_corner():
    """Where the back wall meets a side wall: the side wall's cap, under the back wall's roof beam."""
    return paint(WALL[:3] + WALL_SIDE[3:], {**WALL_SIDE_PAL, 'B': '#5c3624', 'b': '#7a4a2e'})


# Tall back wall (16x32, assets/art/walls_tall.png): the bottom half covers the wall tile, the top half rises over
# the tile above (outside the kitchen), so the room gets a real back wall with room for windows and shelves.
WALL_TALL = ["dddddddddddddddd", "BBBBBBBBBBBBBBBB", "bbbbbbbbbbbbbbbb", "PPPPPPPPPPPPPPPP"] + [
    "pppppppppppPpppp", "pppPpppppppppppp", "pppppppppppppppp", "ppppppppPpppppPp", "pPpppppppppppppp",
    "pppppppppppppppp", "ppppppPppppppppp", "pppppppppppppPpp", "ppPppppppppppppp", "pppppppppPpppppp",
    "pppppppppppppppp", "pppPpppppppppppp", "ppppppppppppPppp", "pppppppppppppppp", "pPpppppPpppppppp",
    "pppppppppppppppp", "pppppppppppppppp",
] + ["uuuuuuuuuuuuuuuu", "qqqqqqqqqqqqqqqq"] + ["GgggGgggGgggGggg"] * 8 + ["GGGGGGGGGGGGGGGG"]
WALL_TALL_PAL = {**WALL_PAL, 'q': '#a8704a'}

BIG_WINDOW = [
    "uuuuuuuuuuuuuu",
    "uiiiiiiuiiiiiu",
    "uiihiiiuiiiiiu",
    "uiiiiiiuiiiiiu",
    "ujjjjjjujjjjju",
    "uuuuuuuuuuuuuu",
    "ujjjjjjujjjjju",
    "utttjjjujjjttu",
    "uTTTTttuttTTTu",
    "ummmmmmummmmmu",
    "uuuuuuuuuuuuuu",
]
BIG_WINDOW_PAL = {'u': '#8a5634', 'i': '#cbe8ec', 'h': '#ffffff', 'j': '#a8d6de', 't': '#8fb35a', 'T': '#6f9a4a',
                  'm': '#5f9cab'}
CURTAIN = ["rRrR", "rRrR", "rRr.", "rR..", "yy..", "rR..", "rRr.", "rrRr"]
CURTAIN_PAL = {'r': '#e88f86', 'R': '#c96a64', 'y': '#f3d77e'}
PICTURE = [
    "uuuuuuuuuu",
    "uiiiiiiiiu",
    "uiiCCCCiiu",
    "uiCcccccCu",
    "uiCkcckcCu",
    "uiCcnncCiu",
    "uiiCCCCiiu",
    "uggggggggu",
    "uuuuuuuuuu",
]
PICTURE_PAL = {'u': '#c9963a', 'i': '#f6ead0', 'C': '#8f6038', 'c': '#b5814f', 'k': '#2b1d1a', 'n': '#4e3426',
               'g': '#8fb35a'}
CLOCK = [
    "..uuuu..",
    ".uwwwwu.",
    "uwwwkwwu",
    "uwwwkwwu",
    "uwwkkwwu",
    "uwwwwwwu",
    ".uwwwwu.",
    "..uuuu..",
]
PLANT = [
    ".g.gg.",
    "gGgGgg",
    ".gGgG.",
    "..tt..",
    ".tTTt.",
    ".tTTt.",
]
PLANT_PAL = {'g': '#8fb35a', 'G': '#6f9a4a', 't': '#d9774f', 'T': '#b85e3c'}


def wall_tall(kind):
    f = paint(WALL_TALL, WALL_TALL_PAL)
    shelf = grid(["uuuuuuuuuuuuuu", ".U..........U."], {'u': '#7a4a2e', 'U': '#5c3624'})
    if kind == 'window':
        f = on(f, grid(BIG_WINDOW, BIG_WINDOW_PAL), 1, 6)
        f = on(f, grid(["uuuuuuuuuuuuuuuu"], {'u': '#5c3624'}), 0, 5)
        f = on(f, outlined(grid(CURTAIN, CURTAIN_PAL)), -1, 4)
        f = on(f, outlined(grid(CURTAIN, CURTAIN_PAL).transpose(Image.FLIP_LEFT_RIGHT)), 11, 4)
        f = on(f, outlined(grid(PLANT, PLANT_PAL)), 5, 12)
    elif kind == 'shelf':
        for y, jars in ((8, ["rr..yyy..gg.", "oo..yyy..ll.", "oo..YYY.lll.", "oo..YYY.LLL."]),
                        (16, [".ss.......pp", "sSSs..bb..pp", "sSSs.bBb..PP", "sSSs.bBb..PP"])):
            pal = {**SHELF_PAL, 's': '#fbf6ec', 'S': '#7fa8c9', 'b': '#c25b4a', 'B': '#f3d77e', 'p': '#f4a3b0',
                   'P': '#e07a8f'}
            f = on(f, outlined(grid(jars, pal)), 1, y - 5)
            f = on(f, shelf, 1, y)
    elif kind == 'pans':
        rail = grid(["kkkkkkkkkkkkkk"], {'k': '#5a4a42'})
        pan = grid(["...k...", "...k...", ".CCCCC.", "CcccccC", "ChcccCC", "CcccccC", "CcccccC", ".CCCCC."],
                   {'k': '#5a4a42', 'C': '#a2542c', 'c': '#dc8650', 'h': '#f6bb86'})
        ladle = grid(["k.", "k.", "k.", "k.", "k.", "k.", "SS", "SS"], {'k': '#8a5634', 'S': '#a9b6c0'})
        garlic = grid(["k.", "ww", "wW", "ww", "Ww", "ww", ".w"], {'k': '#8a5634', 'w': '#fbf1dc', 'W': '#e3d0b0'})
        f = on(f, rail, 1, 7)
        f = on(f, outlined(pan), 0, 7)
        f = on(f, outlined(ladle), 8, 7)
        f = on(f, outlined(garlic), 11, 7)
    elif kind == 'picture':
        f = on(f, outlined(grid(PICTURE, PICTURE_PAL)), 2, 7)
    elif kind == 'clock':
        f = on(f, outlined(grid(CLOCK, {'u': '#7a4a2e', 'w': '#fbf6ec', 'k': '#3e2418'})), 3, 7)
        f = on(f, outlined(grid(PLANT, PLANT_PAL)), 8, 14)
        f = on(f, shelf.crop((0, 0, 8, 2)), 7, 20)
    elif kind == 'post':
        f = on(f, grid(["bbB"] * 18, {'b': '#8a5634', 'B': '#6b3e26'}), 6, 3)
    return f


def wall_tall_corner():
    return paint(WALL[:3] + WALL_SIDE + WALL_SIDE[:13], {**WALL_SIDE_PAL, 'B': '#5c3624', 'b': '#7a4a2e'})


RAILING = [  # low deck railing, transparent between the posts (tiles horizontally)
    "................",
    "................",
    "................",
    "................",
    "qqqqqqqqqqqqqqqq",
    "bbbbbbbbbbbbbbbb",
    "ddddddddddddddbd",
    "..............bd",
    "..............bd",
    "qqqqqqqqqqqqqqbd",
    "bbbbbbbbbbbbbbbd",
    "ddddddddddddddbd",
    "..............bd",
    "..............bd",
    "..............dd",
    "................",
]

# ---- floor, rug, deck

FLOOR_PAL = {'a': '#b47c4e', 'b': '#ad7649', 'c': '#b88250', 'h': '#c08c5a', 'g': '#8a5636', 'k': '#9a6640'}


def floor_tile(variant):
    """Warm horizontal planks, 4px tall, joints placed per variant so tiles never show a grid."""
    joints = [(11, None, 4, None), (None, 13, None, 6), (8, None, None, 2)][variant]
    tones = ['a', 'b', 'c', 'a']
    rows = []
    for y in range(16):
        plank, r = divmod(y, 4)
        if r == 3:
            rows.append('g' * 16)
            continue
        line = [('h' if r == 0 else tones[plank]) for _ in range(16)]
        j = joints[plank]
        if j is not None:
            line[j] = 'g'
        rows.append(''.join(line))
    if variant == 2:  # a little knot
        rows[5] = rows[5][:4] + 'kk' + rows[5][6:]
        rows[6] = rows[6][:4] + 'kk' + rows[6][6:]
    return paint(rows, FLOOR_PAL)


def rug(w=48, h=32):
    """Oval braided rug in warm rings (terracotta, mustard, cream, sage), soft and quiet."""
    rings = ['#8c3e30', '#cf7350', '#e9b45c', '#f1e2c2', '#8fae86', '#e9b45c', '#cf7350']
    f = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cx, cy = (w - 1) / 2, (h - 1) / 2
    for y in range(h):
        for x in range(w):
            d = math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2))
            if d > 1:
                continue
            i = min(len(rings) - 1, int((1 - d) * len(rings) * 1.6))
            col = rgb(rings[i])
            if (x + y) % 4 == 0:  # braid texture
                col = tuple(int(v * 0.9) for v in col)
            if d > 0.94:
                col = rgb('#5e2a22')
            f.putpixel((x, y), col + (255,))
    return f


DECK_PAL = {'a': '#c6a47e', 'b': '#ba976f', 'c': '#ceae87', 'g': '#87674b', 'n': '#6a4e3a', 'h': '#dcc19a'}  # warm, sun-bleached


def deck_tile(variant):
    """Weathered vertical boards with nail heads; joints differ per variant."""
    tones = 'abca'
    joints = [(5, 12, 2, 9), (13, 3, 10, 6)][variant]
    f = Image.new('RGBA', (16, 16))
    for x in range(16):
        board, r = divmod(x, 4)
        for y in range(16):
            ch = 'g' if r == 3 else ('h' if r == 0 else tones[board])
            if r != 3 and y == joints[board]:
                ch = 'g'
            if r == 1 and y == (joints[board] + 3) % 16:
                ch = 'n'
            f.putpixel((x, y), rgb(DECK_PAL[ch]) + (255,))
    return f


def deck_edge():
    """South edge of the deck over water: boards, a fascia board, and two posts going into the water."""
    f = deck_tile(0)
    for x in range(16):
        f.putpixel((x, 9), rgb('#d4bc9e') + (255,))
        for y, c in ((10, '#8a7058'), (11, '#7a6250'), (12, '#4e3e32')):
            f.putpixel((x, y), rgb(c) + (255,))
        for y in range(13, 16):
            f.putpixel((x, y), (0, 0, 0, 0))
    for px in (2, 12):
        for y in range(13, 16):
            for dx, c in ((0, '#7a6250'), (1, '#5a4636')):
                f.putpixel((px + dx, y), rgb(c) + (255,))
    return f


# ---- water and shore (shore pieces are overlays: transparent where the water tile shows through)

WATER_PAL = {'w': '#2f6b7c', 'W': '#2c6476', 'r': '#3d7d8d', 'h': '#7fb6ba'}
RIPPLES = [(2, 3, 3), (10, 6, 2), (5, 11, 3), (13, 13, 2)]


def water_tile(phase):
    """Calm, slightly darker teal-blue; a few soft ripple dashes drift 1px per frame (3 frames, tiles seamlessly)."""
    f = Image.new('RGBA', (16, 16), rgb(WATER_PAL['w']) + (255,))
    for x, y in ((7, 1), (8, 1), (0, 8), (1, 8), (12, 9), (4, 14), (5, 14)):
        f.putpixel((x, y), rgb(WATER_PAL['W']) + (255,))
    for i, (x, y, n) in enumerate(RIPPLES):
        shift = (phase + i) % 3
        for k in range(n):
            col = 'h' if (k == 0 and i == phase) else 'r'
            f.putpixel(((x + k + shift) % 16, y), rgb(WATER_PAL[col]) + (255,))
    return f


GRASS_PAL = {'g': '#7ea252', 'G': '#6c9046', 'l': '#93b862', 's': '#e2cc95', 'S': '#c9ae78', 'm': '#8d7650'}


def edge_depth(t):
    """Distance of the shoreline from the tile edge; periodic over 16px so neighbouring tiles line up."""
    return 7 + 1.4 * math.sin(2 * math.pi * t / 16) + 0.8 * math.sin(4 * math.pi * t / 16 + 1)


def grass_px(x, y, variant):
    n = (x * 7 + y * 13 + variant * 5) % 17
    if n == 0 or (variant and n == 9):
        return 'l'
    if n in (4, 11):
        return 'G'
    return 'g'


def shore(kind, variant=0):
    """kind: 'grass' or the land sides: 'n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se' (land on both sides = lake
    corner), or 'nw_tip' ... (land only in the corner = a point of land). Water stays transparent."""
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    tip = kind.endswith('_tip')
    sides = kind.replace('_tip', '')
    for y in range(16):
        for x in range(16):
            if kind == 'grass':
                m = 99
            else:
                ms = []
                for s in sides:
                    if s == 'n':
                        ms.append(edge_depth(x) - y - 0.5)
                    if s == 's':
                        ms.append(edge_depth(x) - (15 - y) - 0.5)
                    if s == 'w':
                        ms.append(edge_depth(y) - x - 0.5)
                    if s == 'e':
                        ms.append(edge_depth(y) - (15 - x) - 0.5)
                m = min(ms) if tip else max(ms)
            if m > 2.4:
                col = rgb(GRASS_PAL[grass_px(x, y, variant)]) + (255,)
            elif m > 1.2:
                col = rgb(GRASS_PAL['s']) + (255,)
            elif m > 0:
                col = rgb(GRASS_PAL['S']) + (255,)
            elif m > -1:
                col = rgb('#c7e2dc') + (120,)
            else:
                continue
            f.putpixel((x, y), col)
    return f


REEDS = [
    "..b......",
    ".bb...b..",
    ".bb..bb..",
    ".bb..bb.b",
    "..g..bb.b",
    "..g...g.g",
    "..g..g..g",
    ".g...g.g.",
    ".g..g..g.",
    ".gg.g.gg.",
]
REEDS_PAL = {'b': '#7a4a2e', 'g': '#6f9a4a'}
LILY = [
    "..GGGG..",
    ".GgggGG.",
    "GggggGgG",
    "Ggggg.GG",
    "GggggggG",
    ".GgggGG.",
    "..GGGG..",
]
LILY_PAL = {'g': '#6fa65a', 'G': '#4e8a46'}
FLOWER = [".p.", "pyp", ".p."]
ROCK = ["..sss..", ".shsss.", "sssssSS", ".SSSSS."]
ROCK_PAL = {'s': '#a7a39a', 'S': '#86827a', 'h': '#c9c6bd'}
TUFT = ["y...p", ".g.g.", "g.g.g", ".ggg."]
TUFT_PAL = {'g': '#5f8a40', 'y': '#f3d77e', 'p': '#f4a3b0'}


def light_string(lit):
    """One tile of a string of warm bulbs (tiles horizontally): a sagging wire and one bulb in the middle."""
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    wire = rgb('#3e3030') + (255,)
    for x in range(16):
        y = round(2 + 3 * math.sin(math.pi * x / 16))
        f.putpixel((x, y), wire)
    bulb = (('#fff4c2', '#ffd57a', '#f5a742') if lit else ('#c9bfa8', '#9c917a', '#7a705e'))
    for x, y, c in ((7, 6, 2), (8, 6, 2), (7, 7, 1), (8, 7, 1), (7, 8, 0), (8, 7, 0), (8, 8, 1), (7, 7, 0)):
        f.putpixel((x, y), rgb(bulb[c]) + (255,))
    f.putpixel((7, 5), wire)
    f.putpixel((8, 5), wire)
    return f


def firefly(i):
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    c = 7.5
    for y in range(16):
        for x in range(16):
            d = math.hypot(x - c, y - c)
            a = max(0.0, 1 - d / (4.5 if i == 0 else 3.2)) ** 2 * (0.55 if i == 0 else 0.35)
            if a > 0.02:
                f.putpixel((x, y), (214, 240, 120, int(a * 255)))
    core = (255, 250, 190, 255) if i == 0 else (236, 240, 160, 230)
    for x, y in ((7, 7), (8, 7), (7, 8), (8, 8)):
        f.putpixel((x, y), core)
    return f


def crate(icon_img, label_color):
    """Wooden crate with the ingredient peeking out of the top."""
    back = tile([
        ".uuuuuuuuuuuuuu.",
        ".uUUUUUUUUUUUUu.",
        ".uUUUUUUUUUUUUu.",
        ".uUUUUUUUUUUUUu.",
    ], {})
    front = tile([
        "uuuuuuuuuuuuuuuu",
        "uttttttttttttttu",
        "uTTTTTTTTTTTTTTu",
        "uTuTTTTTTTTTTuTu",
        "uuuuuuuuuuuuuuuu",
        "uTTTTwwwwwwTTTTu",
        "uTuTTwLLLLwTTuTu",
        "uTTTTwwwwwwTTTTu",
    ], {'L': label_color})
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    f.alpha_composite(back, (0, 4))
    f.alpha_composite(icon_img, (0, -3))
    f.alpha_composite(front, (0, 8))
    return f


def tile(rows, pal):
    return grid(rows, {**PAL, **pal})


# ---- atmosphere textures (pre-coloured: tint is WebGL-only)

def periodic_noise(w, h, cells, seed):
    """Smooth value noise that wraps on both axes (so the texture tiles)."""
    r = __import__('random').Random(seed)
    cx, cy = cells
    g = [[r.random() for _ in range(cx)] for _ in range(cy)]

    def smooth(t):
        return t * t * (3 - 2 * t)
    out = [[0.0] * w for _ in range(h)]
    for y in range(h):
        fy = y / h * cy
        y0, ty = int(fy), smooth(fy - int(fy))
        for x in range(w):
            fx = x / w * cx
            x0, tx = int(fx), smooth(fx - int(fx))
            a = g[y0 % cy][x0 % cx] * (1 - tx) + g[y0 % cy][(x0 + 1) % cx] * tx
            b = g[(y0 + 1) % cy][x0 % cx] * (1 - tx) + g[(y0 + 1) % cy][(x0 + 1) % cx] * tx
            out[y][x] = a * (1 - ty) + b * ty
    return out


def mist(w=256, h=128):
    n1 = periodic_noise(w, h, (4, 2), 3)
    n2 = periodic_noise(w, h, (8, 4), 5)
    n3 = periodic_noise(w, h, (16, 8), 9)
    f = Image.new('RGBA', (w, h))
    for y in range(h):
        for x in range(w):
            v = n1[y][x] * 0.55 + n2[y][x] * 0.3 + n3[y][x] * 0.15
            a = max(0.0, min(1.0, (v - 0.34) / 0.45)) ** 1.5 * 0.5
            f.putpixel((x, y), (236, 232, 240, int(a * 255)))
    return f


def sunset_gradient(h=256):
    """Vertical golden-hour wash: rose at the top, peach in the middle, soft amber at the bottom."""
    stops = [(0.0, (236, 112, 150, 0.34)), (0.5, (255, 156, 104, 0.27)), (1.0, (255, 196, 120, 0.20))]
    f = Image.new('RGBA', (8, h))
    for y in range(h):
        t = y / (h - 1)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t0 <= t <= t1:
                k = (t - t0) / (t1 - t0)
                c = [c0[i] + (c1[i] - c0[i]) * k for i in range(4)]
                break
        for x in range(8):
            f.putpixel((x, y), tuple(int(v) for v in c[:3]) + (int(c[3] * 255),))
    return f

# ---------------------------------------------------------------- fx

def coin_frames():
    pal = {'g': '#f7c948', 'G': '#d89a2a', 'h': '#fff1a8', 'c': '#e0a83a'}
    frames = []
    for w in (10, 6, 4, 6):  # never edge-on: the thinnest frame still shows a gold face
        rows = []
        for y in range(10):
            dy = (y - 4.5) / 5
            half = w / 2 * math.sqrt(max(0, 1 - dy * dy)) + 0.35
            row = ''
            for x in range(10):
                dx = x - 4.5
                if abs(dx) <= half:
                    edge_l = dx < -half + 1.2
                    edge_r = dx > half - 1.2
                    row += 'h' if edge_l and w > 2 else 'G' if edge_r else 'g'
                else:
                    row += '.'
            rows.append(row)
        if w == 10:
            rows = [r[:4] + ('c' if 3 <= i <= 6 else r[4]) + r[5:] for i, r in enumerate(rows)]
            rows = [r[:5] + ('c' if 3 <= i <= 6 else r[5]) + r[6:] for i, r in enumerate(rows)]
        frames.append(sprite(rows, pal))
    return frames


def puff(points, alpha):
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for cx, cy, r in points:
        for y in range(16):
            for x in range(16):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                    shade = 255 if y + 0.5 < cy else 235
                    f.putpixel((x, y), (shade, shade, shade - 6, alpha))
    return f


HEART = [
    ".rr...rr.",
    "rhrr.rrrr",
    "rhrrrrrrr",
    "rrrrrrrrR",
    ".rrrrrrR.",
    "..rrrrR..",
    "...rrR...",
    "....R....",
]
HEART_PAL = {'r': '#f0647a', 'R': '#c94660', 'h': '#ffc2cc'}

STEAM_HEART = [
    ".ww...ww.",
    "wwww.wwww",
    "wwwwwwwww",
    ".wwwwwww.",
    "..wwwww..",
    "...www...",
    "....w....",
]


def sparkle(arm, diag=False):
    f = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    c = 7
    core, glow = (255, 255, 240, 255), (255, 226, 130, 255)
    f.putpixel((c, c), core)
    for i in range(1, arm + 1):
        col = core if i == 1 else glow
        for dx, dy in (((1, 1), (1, -1), (-1, 1), (-1, -1)) if diag else ((1, 0), (-1, 0), (0, 1), (0, -1))):
            f.putpixel((c + dx * i, c + dy * i), col)
    if not diag and arm >= 3:
        for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            f.putpixel((c + dx, c + dy), glow)
    return f


LANTERN = [  # brass lantern with a dome and a ring; cream glass with a candle when unlit, warm glow when lit
    ".....nn.....",
    "....n..n....",
    "....nRRn....",
    "...nRrrRn...",
    "..nRrrrrRn..",
    "..nnnnnnnn..",
    "..nyyyhyyn..",
    "..nyyhfhyn..",
    "..nyyyfyyn..",
    "..nyycccyn..",
    "..nyocccon..",
    "..nnnnnnnn..",
    "...nRRRRn...",
]
LANTERN_LIT = {'n': '#9a6a2e', 'R': '#d9a845', 'r': '#f6d27a', 'y': '#ffd57a', 'o': '#f5a742', 'h': '#fff4c2',
               'c': '#fff8e0', 'f': '#ffffff'}
LANTERN_OFF = {'n': '#9a6a2e', 'R': '#d9a845', 'r': '#f6d27a', 'y': '#f4ead2', 'o': '#e2d4b4', 'h': '#ffffff',
               'c': '#fbf6ec', 'f': '#6b4a32'}


def lantern_post(lit):
    """16x32 deck post in honey wood with an arm, the brass lantern hanging from it."""
    pal = {**(LANTERN_LIT if lit else LANTERN_OFF), **{k: v for k, v in WOOD.items() if k not in 'R'}}
    f = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    arm = grid([
        "jjjjjjjjjj....",
        "qaaaaaaaaj....",
        "AAAAAAAAAA....",
    ], pal)
    pole = grid(["qaAj"] * 26 + ["aaAj", "JJJJ"], pal)
    f.alpha_composite(outlined(pole), (0, 2))
    f.alpha_composite(outlined(arm), (1, 1))
    f.alpha_composite(outlined(grid(["n", "n"], pal)), (11, 4))
    f.alpha_composite(outlined(grid(LANTERN, pal)), (5, 5))
    return f


def glow(size=64, color=(255, 205, 120)):
    f = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - c, y - c) / (size / 2)
            if d < 1:
                a = (1 - d) ** 2 * 0.85
                f.putpixel((x, y), color + (int(a * 255),))
    return f


def bubble():
    """24x24 speech bubble: rounded body 24x20 + tail. Icon area: 16x16 at (4, 2)."""
    fill, line, shade = rgb('#fbf3e0'), rgb('#6b4a32'), rgb('#ead9b8')
    f = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
    for y in range(20):
        for x in range(24):
            cx = min(max(x, 3), 20)
            cy = min(max(y, 3), 16)
            d = math.hypot(x - cx, y - cy)
            if d <= 3.2:
                edge = d > 2.2 or x in (0, 23) or y in (0, 19)
                f.putpixel((x, y), (line if edge else shade if y >= 17 else fill) + (255,))
    for i, (x0, x1) in enumerate(((7, 12), (8, 11), (9, 10), (9, 9))):
        for x in range(x0, x1 + 1):
            edge = x in (x0, x1) or i == 3
            f.putpixel((x, 19 + i), (line if edge else shade) + (255,))
    return f


# ---------------------------------------------------------------- round 3: deck life, banks, lighter lanterns
# Objects bigger than a tile are drawn whole, outlined once, then cut into 16x16 frames named <name>_<i>
# (row-major), so the map painter can stamp them like any other art frame.

WOOD = {'q': '#f6dcaa', 'a': '#e8b97f', 'A': '#d9a267', 'j': '#b87c48', 'J': '#8a5634', 'K': '#6b3e26'}
LEAF = {'g': '#8fb35a', 'G': '#6f9a4a', 'l': '#b4d273', 'L': '#557f3c'}
CLAY = {'t': '#d9774f', 'T': '#b85e3c', 'z': '#ec9a6c'}
BLOOM = {'p': '#f4a3b0', 'P': '#e07a8f', 'y': '#f3d77e', 'Y': '#e0a83a', 'w': '#fbf6ec', 'v': '#b7a3e0'}


def canvas(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def big(rows, pal=None):
    """Letter grid -> outlined image (any size)."""
    return outlined(grid(rows, pal))


def place(im, w, h, x=None, y=None):
    """Put im on a w x h transparent canvas: centred by default, x/y override (y=None -> bottom aligned)."""
    f = canvas(w, h)
    f.alpha_composite(im, ((w - im.width) // 2 if x is None else x, h - im.height if y is None else y))
    return f


def cut(im):
    """Cut a multiple-of-16 image into 16x16 frames, row-major."""
    return [im.crop((x, y, x + 16, y + 16)) for y in range(0, im.height, 16) for x in range(0, im.width, 16)]


BENCH = [  # 2 tiles wide, backrest at the back (top), seat in front, honey wood like the counters
    "..JJ......................JJ..",
    "jjjjjjjjjjjjjjjjjjjjjjjjjjjjjj",
    "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "..JJ......................JJ..",
    "..JJ......................JJ..",
    "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "jjjjjjjjjjjjjjjjjjjjjjjjjjjjjj",
    "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    ".KK......................KK..",
]
BENCH[13] = BENCH[13] + '.'

CAT = [  # orange tabby asleep, curled up; nose to tail
    ".O....O.....",
    ".oO..Oo..oo.",
    "ooooooooooOo",
    "owwoooOoOooO",
    "kwwkooooOooO",
    "owwoooooooOo",
    ".ooOoOoOoOo.",
    "..oooooooo..",
]
CAT_PAL = {'o': '#f0a45a', 'O': '#c9743a', 'w': '#fbf1dc', 'k': '#6b3e26'}

BARREL = [  # half barrel planter body (flowers are added on top)
    "JjjjjjjjjjjJ",
    "aqaaqaaqaaqa",
    "aqaaqaaqaaqa",
    "nnnnnnnnnnnn",
    "AaAAaAAaAAaA",
    "AaAAaAAaAAaA",
    "nnnnnnnnnnnn",
    ".AjAAjAAjAA.",
]
BARREL_PAL = {**WOOD, 'n': '#7a6a62'}

POT_BIG = [  # terracotta pot
    "zzzzzzzzzz",
    "tTTTTTTTTt",
    ".tttttttt.",
    ".tzttttTt.",
    ".tzttttTt.",
    "..tttttT..",
    "..TTTTTT..",
]

FERN = [  # leafy plant for a pot (rows are drawn above the pot rim)
    "....l..g....",
    ".g..gl.gG.l.",
    "gGl.gGlgG.gG",
    ".gGlgGgGlgG.",
    "lgGgGgGgGgGl",
    ".GgGLgGLgGg.",
    "..LgGLGgGL..",
]

BLOOMS = [  # flower mound for the barrel: greens with little 3px flowers
    "...g.pp.gy.y...",
    "..gGpPPpgYyYg..",
    ".lgGgppgGgyGgl.",
    "gGwgGgGlgGgvgGg",
    "wWwGgpGgGgvVvGg",
    "gwgGpPpgGlgvgGL",
    ".GgGgpgGgGgGgL.",
]
BLOOMS_PAL = {**LEAF, **BLOOM, 'W': '#e3d8c3', 'V': '#8f7ac6'}

BUCKET = [  # wooden bucket with water and a fish tail sticking out
    "...........ff",
    "..........fFf",
    "...rrrrrrrfr.",
    "..rbbbbbbFbbr",
    "..rbhbbbbbbbr",
    "..rbbbbbbbbbr",
    "...uaaaaaaau.",
    "...aqaaaaaAa.",
    "...nnnnnnnnn.",
    "...aqaaaaaAa.",
    "....AAAAAAA..",
]
BUCKET_PAL = {**WOOD, 'r': '#b87c48', 'b': '#3d7d8d', 'h': '#9fd0d0', 'f': '#9fb8c8', 'F': '#6f8aa0',
              'u': '#8a5634', 'n': '#7a6a62'}

FRUIT_CRATES = [  # a crate of fruit: two pineapples (abacaxi) and mangoes
    "..g.g....g.g..",
    "..gGg....gGg..",
    ".gGgGg..gGgGg.",
    "..yYy....yYy..",
    ".yYoYy..yYoYy.",
    ".YoYoYrrYoYoY.",
    ".yYoYrRryYoYy.",
    "uuuuuuuuuuuuuu",
    "utttttttttttTu",
    "uTuTTTTTTTuTTu",
    "uTTTTTTTTTTTTu",
    "uuuuuuuuuuuuuu",
]
FRUIT_PAL = {'y': '#f6c84a', 'Y': '#c98a2a', 'o': '#e8a040', 'r': '#f0913a', 'R': '#d9534a', 'g': '#8fb35a',
             'G': '#557f3c'}

ROD = [  # a fishing rod leaning out over the water from the left edge, line and a red-white float
    "................",
    "..............bb",
    "............bb.l",
    "..........bb...l",
    "........bb.....l",
    "......bb.......l",
    "....bb.........l",
    "..kk...........l",
    "kkKk...........l",
    "kk.............l",
    "..............rr",
    "..............ww",
    "................",
]
ROD_PAL = {'b': '#8a5634', 'k': '#4a2e22', 'K': '#c9963a', 'l': '#e8ecec', 'r': '#e05a4a', 'w': '#fbf6ec'}

MENU = [  # A-frame chalkboard on the deck: the three dishes of the day, each with a chalk price dot
    "jjjjjjjjjjjj",
    "jkkkkkkkkkkj",
    "jkCCCkkkkkkj",  # brigadeiro (cocoa ball, sprinkles)
    "jCcCCk.c.ykj",
    "jkCCCkkkkkkj",
    "jkkkkkkkkkkj",
    "jkoooOkkkkkj",  # pastel (golden half moon)
    "joooooO.c.yj",
    "jkkkkkkkkkkj",
    "jkwrwwkkkkkj",  # baiao (rice, beans, cheese)
    "jwWwrwW.c.yj",
    "jkWWWWkkkkkj",
    "jjjjjjjjjjjj",
    ".J........J.",
    "J..........J",
]
MENU_PAL = {**WOOD, 'k': '#4f6b5c', 'C': '#5a3424', 'c': '#d8dccf', 'y': '#f3d77e', 'o': '#eab350',
            'O': '#c27a2e', 'w': '#f3ead2', 'W': '#d9caa4', 'r': '#8a3b2e'}

FONT_3X5 = {
    'U': ["X.X", "X.X", "X.X", "X.X", "XXX"],
    'N': ["XX.", "X.X", "X.X", "X.X", "X.X"],
    'D': ["XX.", "X.X", "X.X", "X.X", "XX."],
    'E': ["XXX", "X..", "XX.", "X..", "XXX"],
    'R': ["XX.", "X.X", "XX.", "X.X", "X.X"],
    'C': [".XX", "X..", "X..", "X..", ".XX"],
    'O': [".X.", "X.X", "X.X", "X.X", ".X."],
    'K': ["X.X", "X.X", "XX.", "X.X", "X.X"],
}


def text_rows(word, ink='r'):
    rows = ['' for _ in range(5)]
    for i, ch in enumerate(word):
        for y in range(5):
            rows[y] += ('.' if i else '') + FONT_3X5[ch][y].replace('X', ink)
    return rows


def hanging_sign():
    """A pub-style sign on a post: 'UNDER / COOKED' in red on a cream board, hung by two chains (32x32)."""
    w, h = 30, 30
    im = canvas(w, h)
    pal = {**WOOD, 'c': '#f8ebc8', 'C': '#e8d3a4', 'r': '#a8443a', 'm': '#7a6a62'}
    post = grid(["aJ"] * 26, pal)
    arm = grid(["J" + "j" * 27 + "J", "j" + "a" * 27 + "j"], pal)
    im.alpha_composite(arm, (0, 2))
    im.alpha_composite(post, (0, 4))
    for x in (8, 25):
        im.alpha_composite(grid(["m", "m", "m"], pal), (x, 4))
    board = ['J' * 27] + ['J' + 'c' * 25 + 'J' for _ in range(14)] + ['J' + 'C' * 25 + 'J', 'J' * 27]
    board = [list(r) for r in board]
    for y0, word in ((2, 'UNDER'), (9, 'COOKED')):
        rows = text_rows(word)
        x0 = 1 + (26 - len(rows[0])) // 2
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch != '.':
                    board[y0 + y][x0 + x] = ch
    im.alpha_composite(grid([''.join(r) for r in board], pal), (3, 7))
    # a little foot plate for the post
    im.alpha_composite(grid(["JjJ"], pal), (0, 29))
    return outlined(im)


def rowboat(w=44, h=14):
    """Top view of a little red rowboat: honey inside, cream rim, two seats, an oar resting inside."""
    im = canvas(w, h)
    cy = (h - 1) / 2
    hull, rim, inside, shade, seat = '#c65a3e', '#f3e2bc', '#d9a267', '#b98450', '#8a5634'
    for x in range(w):
        t = (x - (w - 1) * 0.42) / ((w - 1) * (0.58 if x > (w - 1) * 0.42 else 0.42))
        half = (h / 2) * math.sqrt(max(0.0, 1 - abs(t) ** (2.2 if t > 0 else 4)))
        for y in range(h):
            d = abs(y - cy)
            if d > half:
                continue
            if d > half - 1.3:
                c = hull
            elif d > half - 2.3:
                c = rim
            else:
                c = shade if y > cy + 1 else inside
            im.putpixel((x, y), rgb(c) + (255,))
    for sx in (int(w * 0.3), int(w * 0.62)):
        for y in range(h):
            if im.getpixel((sx, y))[:3] in (rgb(inside), rgb(shade)):
                im.putpixel((sx, y), rgb(seat) + (255,))
                im.putpixel((sx + 1, y), rgb('#a8704a') + (255,))
    oar = rgb('#7a4a2e') + (255,)
    for i in range(14):
        im.putpixel((int(w * 0.36) + i, 5 + i // 7), oar)
    for x, y in ((int(w * 0.36) + 14, 6), (int(w * 0.36) + 15, 6), (int(w * 0.36) + 15, 7), (int(w * 0.36) + 16, 7)):
        im.putpixel((x, y), oar)
    return outlined(im)


def round_canopy(w, h, blobs, cols, light_dir=(-1, -1), seed=3):
    """Fluffy canopy: union of circles, shaded by the height inside each blob (light from top left)."""
    im = canvas(w, h)
    dark, mid, light, hi = (rgb(c) for c in cols)
    for y in range(h):
        for x in range(w):
            best = None
            for cx, cy, r in blobs:
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                if d <= r:
                    lit = ((x + 0.5 - cx) * light_dir[0] + (y + 0.5 - cy) * light_dir[1]) / r
                    best = lit if best is None else max(best, lit)
            if best is None:
                continue
            n = (x * 7 + y * 11 + seed) % 13
            c = hi if best > 0.55 and n < 7 else light if best > 0.15 else mid if best > -0.45 else dark
            if n == 0 and c is mid:
                c = light
            im.putpixel((x, y), c + (255,))
    return im


def tree(kind='green'):
    """32x32 tree for the banks: trunk on the grass, round canopy, a soft shadow at its foot."""
    f = canvas(32, 32)
    shadow = canvas(32, 32)
    for y in range(26, 31):
        for x in range(4, 28):
            if ((x - 15.5) / 12) ** 2 + ((y - 28) / 2.6) ** 2 <= 1:
                shadow.putpixel((x, y), (30, 44, 30, 80))
    f.alpha_composite(shadow)
    trunk = grid([".bBb.", ".bbB.", ".bBb.", ".Bbb.", ".bbB.", "bBbbB"], {'b': '#8a5634', 'B': '#6b3e26'})
    f.alpha_composite(outlined(trunk), (12, 22))
    blobs = [(16, 12, 9), (9, 15, 6.5), (23, 15, 6.5), (12, 8, 6), (20, 8, 6), (16, 18, 6)]
    if kind == 'ipe':  # Brazilian ipe in bloom: pink canopy, a few green leaves
        cols = ('#b8507e', '#d9679a', '#f08cb4', '#ffc2dc')
    else:
        cols = ('#4f7a3a', '#6f9a4a', '#8fb35a', '#b4d273')
    canopy = round_canopy(32, 26, blobs, cols)
    if kind == 'ipe':
        for x, y in ((8, 17), (22, 19), (14, 21), (25, 12), (6, 12)):
            for dx, dy in ((0, 0), (1, 0), (0, 1)):
                canopy.putpixel((x + dx, y + dy), rgb('#6f9a4a') + (255,))
    else:
        for x, y in ((10, 10), (21, 13), (15, 17), (24, 18), (7, 16)):  # little yellow fruit (mangoes)
            canopy.putpixel((x, y), rgb('#f3c04a') + (255,))
            canopy.putpixel((x, y + 1), rgb('#e0903a') + (255,))
    f.alpha_composite(outlined(canopy).crop((1, 1, 33, 27)), (0, 0))
    return f


def bush():
    f = canvas(16, 16)
    blobs = [(8, 9, 5.5), (4.5, 10.5, 3.5), (11.5, 10.5, 3.5), (8, 6, 3.5)]
    b = round_canopy(16, 15, blobs, ('#4f7a3a', '#6f9a4a', '#8fb35a', '#b4d273'), seed=5)
    for x, y in ((5, 8), (10, 6), (11, 11)):
        b.putpixel((x, y), rgb('#f4a3b0') + (255,))
        b.putpixel((x + 1, y), rgb('#fbf6ec') + (255,))
    f.alpha_composite(outlined(b).crop((1, 0, 17, 16)), (0, 0))
    return f


def runner(part):
    """Flat woven runner rug along a lane (l, m, r pieces), 10px tall, guests walk on it."""
    stripes = ['#b85e3c', '#f1e2c2', '#e9c27a', '#f1e2c2', '#8fae86', '#f1e2c2', '#e9c27a', '#f1e2c2', '#b85e3c']
    f = canvas(16, 16)
    y0 = 4
    for i, c in enumerate(['#7a3e2c'] + stripes + ['#7a3e2c']):
        for x in range(16):
            if part == 'l' and x < 1 or part == 'r' and x > 14:
                continue
            col = rgb(c)
            if (x + i) % 4 == 0 and 0 < i < 10:
                col = tuple(int(v * 0.94) for v in col)
            if (part, x) in (('l', 1), ('r', 14)) and 0 < i < 10:
                col = rgb('#7a3e2c')
            f.putpixel((x, y0 + i), col + (255,))
    if part in ('l', 'r'):  # fringe
        fx = 0 if part == 'l' else 15
        for i in range(1, 10, 2):
            f.putpixel((fx, y0 + i), rgb('#f1e2c2') + (255,))
    return f


def parasol():
    """A beach umbrella seen from above (red and cream wedges) over a striped towel, with a soft shadow (32x32)."""
    f = canvas(32, 32)
    for y in range(32):
        for x in range(32):
            if ((x - 18) / 12) ** 2 + ((y - 20) / 10) ** 2 <= 1:
                f.putpixel((x, y), (30, 44, 30, 70))
    towel = grid(["wrrwwrrwwr", "wrrwwrrwwr", "wwwwwwwwww", "rrrrrrrrrr", "wwwwwwwwww", "yyyyyyyyyy", "wwwwwwwwww",
                  "rrrrrrrrrr", "wwwwwwwwww", "wrrwwrrwwr"], {'w': '#fbf1dc', 'r': '#e88f86', 'y': '#f3d77e'})
    f.alpha_composite(outlined(towel), (16, 15))
    top = canvas(26, 26)
    c = 12.5
    for y in range(26):
        for x in range(26):
            d = math.hypot(x - c, y - c)
            if d > 12.4:
                continue
            wedge = int(((math.atan2(y - c, x - c) + math.pi) / (2 * math.pi)) * 8) % 2
            col = rgb('#d65a4a' if wedge else '#fbf1dc')
            if d > 10.8:  # scalloped rim, a shade darker
                col = tuple(int(v * 0.84) for v in col)
            elif (x - c) + (y - c) < -6:  # light from the top left
                col = tuple(min(255, int(v * 1.06)) for v in col)
            top.putpixel((x, y), col + (255,))
    for x, y in ((12, 12), (13, 12), (12, 13), (13, 13)):
        top.putpixel((x, y), rgb('#c9963a') + (255,))
    f.alpha_composite(outlined(top), (1, 1))
    return f


def petals(variant):
    """A few fallen ipe petals (flat, pink) to scatter on the planks."""
    f = canvas(16, 16)
    spots = [(2, 3), (9, 1), (12, 7), (5, 10), (13, 13)] if variant == 0 else [(3, 6), (10, 4), (7, 12), (14, 10)]
    for x, y in spots:
        f.putpixel((x, y), rgb('#f08cb4') + (255,))
        f.putpixel((x + 1, y), rgb('#ffc2dc') + (255,))
        f.putpixel((x, y + 1), rgb('#d9679a') + (255,))
    return f



def coin_hud():
    """Static, front-facing coin for the HUD and the diary: 12px, a rim, a little star and a shine."""
    pal = {'g': '#f7c948', 'G': '#d89a2a', 'h': '#fff1a8', 'c': '#e0a83a', 's': '#fff6cc', 'd': '#b87a1e'}
    rows = [
        "...GGGGGG...",
        "..GhhggggG..",
        ".GhggggggcG.",
        "GhggggsgggcG",
        "Ghgggsssggcd",
        "Ghggsssssgcd",
        "Gggggsssggcd",
        "Ggggsgggsgcd",
        "Gggggggggccd",
        ".Gcgggggccd.",
        "..dcccccdd..",
        "...dddddd...",
    ]
    return sprite(rows, pal)


# ---------------------------------------------------------------- build

def build(preview_dir=None):
    frames = {}

    def add(name, im):
        assert name not in frames, name
        frames[name] = im

    # ingredients and raw items
    icons = {
        'milk': sprite(MILK),
        'chocolate': sprite(CHOCOLATE),
        'rice': sprite(RICE),
        'beans': sprite(BEANS, BEANS_PAL),
        'cheese': sprite(CHEESE, CHEESE_PAL),
        'cheese_chopped': sprite(CHEESE_CHOPPED),
        'dough': sprite(DOUGH),
        'pastel_raw': sprite(PASTEL),
    }
    for k, v in icons.items():
        add(k, v)
    add('pastel_fried', sprite(PASTEL_FRIED, FRIED_PAL))
    add('pastel_under', sprite(face(PASTEL, 7, 2), {**PALE_PAL, 'd': '#8a5a4a'}))
    add('brigadeiro', sprite(BRIGADEIRO))

    plate = sprite(PLATE, align='bottom', dy=-1)
    add('plate', plate)

    def plated(rows, pal=None, dy=0):
        return stack(plate, sprite(rows, pal, align='bottom', dy=-5 + dy))
    add('dish_brigadeiro', plated(TOP_BRIGADEIRO))
    add('dish_brigadeiro_under', plated(face(TOP_BRIGADEIRO_UNDER, 6, 3), MELT_PAL))
    add('dish_baiao', plated(TOP_BAIAO, BAIAO_PAL))
    add('dish_baiao_under', plated(face(TOP_BAIAO_UNDER, 7, 3, eye='k'), {**BAIAO_PALE, 'k': '#8a5a4a'}))
    add('dish_pastel', plated(TOP_PASTEL, FRIED_PAL))
    add('dish_pastel_under', plated(face(TOP_PASTEL, 6, 1), {**PALE_PAL, 'd': '#8a5a4a'}))
    add('dish_mystery', plated(TOP_MYSTERY, MYSTERY_PAL))

    # crates
    labels = {'milk': '#4d8fd1', 'chocolate': '#6b3e26', 'rice': '#e3d8c3', 'beans': '#9a4a36',
              'cheese': '#f3d77e', 'dough': '#e2c99a'}
    for k, col in labels.items():
        add(f'crate_{k}', crate(icons[k], col))

    # stations (same names as round 1, redrawn on the new counter)
    add('fryer', fryer_tile(False))
    add('fryer_bubble', fryer_tile(True))
    add('pot_stove', pot_stove())
    for k in POT_FILLS:
        add(f'potfill_{k}', pot_fill(k))
    add('counter_board', board_tile())
    add('counter_plates', plates_tile())

    # chef
    for d in ('down', 'up', 'side'):
        body, feet = CHEF[d], CHEF['feet'][d]
        add(f'chef_{d}_0', sprite(body + [feet[0]], CHEF['pal'], align='bottom'))
        add(f'chef_{d}_1', sprite(bob(body, 3) + [feet[1]], CHEF['pal'], align='bottom'))

    # customers
    for name, a in ANIMALS.items():
        add(f'{name}_front_0', sprite(a['front'], a['pal'], align='bottom'))
        add(f'{name}_front_1', sprite(bob(a['front'], 2), a['pal'], align='bottom'))
        legs = a['legs']
        la, lb = (legs[0], legs[1]) if isinstance(legs[0], list) else ([legs[0]], [legs[1]])
        add(f'{name}_side_0', sprite(a['side'] + la, a['pal'], align='bottom'))
        add(f'{name}_side_1', sprite(bob(a['side'], 1) + lb, a['pal'], align='bottom'))
        add(f'{name}_happy', sprite(happy(a['front']), a['pal'], align='bottom'))

    # fx
    for i, c in enumerate(coin_frames()):
        add(f'coin_{i}', c)
    add('steam_0', puff([(8, 11, 2.8)], 210))
    add('steam_1', puff([(7, 8, 3.6), (10.5, 10.5, 2.8)], 170))
    steam_heart = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    steam_heart.alpha_composite(grid(STEAM_HEART, alpha=140), (4, 3))
    add('steam_2', steam_heart)
    add('sparkle_0', sparkle(1))
    add('sparkle_1', sparkle(3))
    add('sparkle_2', sparkle(2, diag=True))
    add('heart', sprite(HEART, HEART_PAL))
    add('lantern', sprite(LANTERN, LANTERN_LIT))
    add('lantern_off', sprite(LANTERN, LANTERN_OFF))

    # ---- round 2 kitchen kit (appended: round-1 frame indexes do not move)
    add('counter', counter_tile())
    add('counter_cap_l', counter_cap('l'))
    add('counter_cap_r', counter_cap('r'))
    add('serve', serve_tile())
    add('bin', sprite(BIN, BIN_PAL, align='bottom', dy=-1))
    add('stove', paint(STOVE, STOVE_PAL))
    for k in ('plain', 'window', 'shelf', 'pans', 'post'):
        add('wall' if k == 'plain' else f'wall_{k}', wall_tile(k))
    add('wall_side', paint(WALL_SIDE, WALL_SIDE_PAL))
    add('wall_front', paint(WALL_FRONT, WALL_FRONT_PAL))
    add('wall_corner', wall_corner())
    add('railing', paint(RAILING))
    for i in range(3):
        add(f'floor_{i}', floor_tile(i))
    for i in range(2):
        add(f'deck_{i}', deck_tile(i))
    add('deck_edge', deck_edge())
    for i in range(3):
        add(f'water_{i}', water_tile(i))
    add('grass_0', shore('grass', 0))
    add('grass_1', shore('grass', 1))
    for k in ('n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'):
        add(f'shore_{k}', shore(k))
    for k in ('nw', 'ne', 'sw', 'se'):
        add(f'shore_{k}_tip', shore(f'{k}_tip'))
    add('reeds', sprite(REEDS, REEDS_PAL, align='bottom'))
    add('lily', sprite(LILY, LILY_PAL))
    lily = sprite(LILY, LILY_PAL)
    add('lily_flower', on(lily, outlined(grid(FLOWER, {'p': '#f4a3b0', 'y': '#f3d77e'})), 7, 3))
    add('rock', sprite(ROCK, ROCK_PAL, align='bottom', dy=-2))
    add('tuft', sprite(TUFT, TUFT_PAL, align='bottom', dy=-2))
    add('lights', light_string(True))
    add('lights_off', light_string(False))
    add('firefly_0', firefly(0))
    add('firefly_1', firefly(1))

    # ---- round 3: deck life and banks (appended). Multi-tile pieces are <name>_<i>, row-major.
    def add_big(name, im):
        for i, piece in enumerate(cut(im)):
            add(f'{name}_{i}', piece)
    add('coin_hud', coin_hud())
    add_big('bench', place(big(BENCH, WOOD), 32, 16))
    add('cat', sprite(CAT, CAT_PAL, align='bottom', dy=-3))
    barrel = canvas(16, 16)
    barrel.alpha_composite(outlined(grid(BARREL, BARREL_PAL)), (1, 6))
    barrel.alpha_composite(outlined(grid(BLOOMS, BLOOMS_PAL)), (0, 0))
    add('flower_barrel', barrel)
    potted = canvas(16, 16)
    potted.alpha_composite(outlined(grid(POT_BIG, CLAY)), (2, 7))
    potted.alpha_composite(outlined(grid(FERN, LEAF)), (1, 1))
    add('potted_plant', potted)
    add('fish_bucket', sprite(BUCKET, BUCKET_PAL, align='bottom'))
    add('fruit_crates', sprite(FRUIT_CRATES, FRUIT_PAL, align='bottom'))
    add('fishing_rod', frame(grid(ROD, ROD_PAL), dy=1))
    add('menu_board', sprite(MENU, MENU_PAL, align='bottom'))
    add_big('sign', place(hanging_sign(), 32, 32))
    add_big('boat', place(rowboat(), 48, 16))
    add_big('tree', tree('green'))
    add_big('tree_ipe', tree('ipe'))
    add('bush', bush())
    for part in 'lmr':
        add(f'runner_{part}', runner(part))
    add_big('parasol', parasol())
    add('petals_0', petals(0))
    add('petals_1', petals(1))

    names = list(frames)
    cols = 16
    rows_n = math.ceil(len(names) / cols)
    sheet = Image.new('RGBA', (cols * 16, rows_n * 16), (0, 0, 0, 0))
    for i, n in enumerate(names):
        sheet.alpha_composite(frames[n], ((i % cols) * 16, (i // cols) * 16))
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / 'art.png', optimize=True)

    anims = {
        'coin': [f'coin_{i}' for i in range(4)],
        'steam': ['steam_0', 'steam_1', 'steam_2'],
        'sparkle': ['sparkle_0', 'sparkle_1', 'sparkle_2'],
        'fryer': ['fryer', 'fryer_bubble'],
        'water': ['water_0', 'water_1', 'water_2'],
        'firefly': ['firefly_0', 'firefly_1'],
    }
    for d in ('down', 'up', 'side'):
        anims[f'chef_{d}'] = [f'chef_{d}_0', f'chef_{d}_1']
    for a in ANIMALS:
        anims[f'{a}_front'] = [f'{a}_front_0', f'{a}_front_1']
        anims[f'{a}_side'] = [f'{a}_side_0', f'{a}_side_1']
    tall_names = ['wall', 'wall_window', 'wall_shelf', 'wall_pans', 'wall_picture', 'wall_clock', 'wall_post',
                  'wall_corner']
    index = {'frameWidth': 16, 'frameHeight': 16, 'columns': cols,
             'frames': {n: i for i, n in enumerate(names)}, 'anims': anims,
             'wallsTall': {'frameWidth': 16, 'frameHeight': 32, 'frames': {n: i for i, n in enumerate(tall_names)}}}
    (OUT / 'frames.json').write_text(json.dumps(index, indent=1) + '\n')
    (OUT / 'frames.js').write_text(
        '// Generated by tools/make_art.py - do not edit by hand.\n'
        '// Frame indexes into assets/art/art.png (16x16 frames, no spacing).\n'
        f'export const ART_FRAMES = {json.dumps(index["frames"])};\n'
        f'export const ART_ANIMS = {json.dumps(anims)};\n'
        '// assets/art/walls_tall.png: 16x32 frames (tall back wall pieces), name -> index.\n'
        f'export const WALL_TALL_FRAMES = {json.dumps({n: i for i, n in enumerate(tall_names)})};\n')

    bubble().save(OUT / 'bubble.png')
    lp = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    lp.alpha_composite(lantern_post(True), (0, 0))
    lp.alpha_composite(lantern_post(False), (16, 0))
    lp.save(OUT / 'lantern_post.png')
    glow().save(OUT / 'glow.png')

    tall = Image.new('RGBA', (16 * len(tall_names), 32), (0, 0, 0, 0))
    for i, n in enumerate(tall_names):
        tall.alpha_composite(wall_tall_corner() if n == 'wall_corner' else wall_tall(n.replace('wall_', '') or n),
                             (16 * i, 0))
    tall.save(OUT / 'walls_tall.png')
    rug().save(OUT / 'rug_oval.png')
    mist().save(OUT / 'mist.png')
    sunset_gradient().save(OUT / 'sunset.png')

    print(f'{len(names)} frames -> {OUT / "art.png"} ({sheet.width}x{sheet.height})')
    if preview_dir:
        preview(Path(preview_dir), frames, sheet, lp)


# ---------------------------------------------------------------- previews (review only, not used by the game)

MOCK = [  # 14x10 tiles: a small kitchen (7x4 floor) with a serve hatch onto a deck over the lake
    '~~~~~~~~~~~~~E',
    '~1abcdefg2~~~E',
    '~|mkBCPPF|~~~E',
    '~|.......|+++E',
    '~|.......S+++E',
    '~|.......|+++E',
    '~|.......|===E',
    '~|rnqoCDC|~~~E',
    '~_________~~~E',
    '~~~~~~~~~~~~~E',
]
MOCK_TALL = {'1': 'wall_corner', '2': 'wall_corner', 'a': 'wall', 'b': 'wall_window', 'c': 'wall_shelf',
             'd': 'wall_picture', 'e': 'wall_pans', 'f': 'wall_window', 'g': 'wall_clock'}
MOCK_KEY = {
    '1': 'wall_corner', '2': 'wall_corner', 'a': 'wall', 'b': 'wall_window', 'c': 'wall_shelf', 'd': 'wall_post',
    'e': 'wall_pans', 'f': 'wall_window', 'g': 'wall', '|': 'wall_side', '_': 'wall_front',
    'C': 'counter', 'B': 'counter_board', 'P': 'pot_stove', 'F': 'fryer', 'D': 'counter_plates', 'S': 'serve',
    'm': 'crate_milk', 'k': 'crate_chocolate', 'r': 'crate_rice', 'n': 'crate_beans', 'q': 'crate_cheese',
    'o': 'crate_dough', '=': 'deck_edge',
}


def preview(out, frames, sheet, lp, scale=6):
    """Write contact.png (every frame at 6x) and mock-ups of a small kitchen at dawn, day, sunset and night."""
    out.mkdir(parents=True, exist_ok=True)
    cols = sheet.width // 16
    contact = Image.new('RGBA', (sheet.width * scale, sheet.height * scale), (58, 50, 66, 255))
    for i in range(sheet.width // 16 * (sheet.height // 16)):
        bg = frames['floor_0'] if i % 2 == 0 else frames['deck_0']
        contact.alpha_composite(bg.resize((16 * scale, 16 * scale), Image.NEAREST),
                                ((i % cols) * 16 * scale, (i // cols) * 16 * scale))
    contact.alpha_composite(sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST))
    contact.save(out / 'contact.png')

    TALL = {n: (wall_tall_corner() if n == 'wall_corner' else wall_tall(n.replace('wall_', '') or n))
            for n in ('wall', 'wall_window', 'wall_shelf', 'wall_pans', 'wall_picture', 'wall_clock', 'wall_corner')}
    w, h = len(MOCK[0]), len(MOCK)
    base = Image.new('RGBA', (w * 16, h * 16))

    def put(name, tx, ty, dx=0, dy=0):
        base.alpha_composite(frames[name] if isinstance(name, str) else name, (tx * 16 + dx, ty * 16 + dy))
    floors = ['floor_0', 'floor_1', 'floor_2']
    for ty, row in enumerate(MOCK):
        for tx, ch in enumerate(row):
            if ch in '~=E_':
                put('water_0', tx, ty)
            if ch == 'E':
                put('shore_e', tx, ty)
            if ch == '.' or ch in 'mkrnqo':
                put(floors[(tx * 3 + ty * 5) % 3], tx, ty)
            if ch == '=':
                put('deck_edge', tx, ty)
            if ch == '_':
                put('wall_front', tx, ty)
            if ch == '+':
                put(f'deck_{(tx + ty) % 2}', tx, ty)
            if ch in MOCK_TALL:
                put(TALL[MOCK_TALL[ch]], tx, ty, 0, -16)
            elif ch in MOCK_KEY:
                put(MOCK_KEY[ch], tx, ty)
    # shade on the water under the kitchen and the deck
    shade = Image.new('RGBA', (w * 16, h * 16), (0, 0, 0, 0))
    for x in range(1 * 16 + 2, 10 * 16 + 2):
        for y in range(8 * 16 + 12, 9 * 16 + 3):
            shade.putpixel((x, y), (20, 40, 50, 90))
    for x in range(10 * 16, 13 * 16):
        for y in range(7 * 16, 7 * 16 + 3):
            shade.putpixel((x, y), (20, 40, 50, 80))
    base.alpha_composite(shade)
    put('counter_cap_l', 4, 2)
    put('counter_cap_r', 8, 2)
    put('counter_cap_l', 6, 7)
    put('counter_cap_r', 8, 7)
    base.alpha_composite(rug(), (4 * 16, 4 * 16))
    put('bin', 8, 6)
    # lake life
    for name, tx, ty, dx, dy in (('lily_flower', 11, 8, 2, 0), ('lily', 12, 1, 0, 3), ('lily', 0, 4, 0, 0),
                                 ('lily_flower', 0, 6, -2, 4), ('reeds', 12, 8, 5, -2), ('reeds', 13, 1, -6, 2),
                                 ('rock', 13, 4, 3, 0), ('tuft', 13, 6, 3, 0), ('lily', 6, 9, 0, 2)):
        put(name, tx, ty, dx, dy)
    # string of lights from the hatch to the lantern post
    for tx in (10, 11):
        put('lights', tx, 3, 0, -6)
    base_day = base.copy()

    def actors(im, lit):
        im.alpha_composite(lp.crop((0 if lit else 16, 0, 16 if lit else 32, 32)), (12 * 16 + 2, 2 * 16 + 2))
        im.alpha_composite(lp.crop((0 if lit else 16, 0, 16 if lit else 32, 32)), (12 * 16 + 2, 5 * 16 - 2))
        im.alpha_composite(frames['chef_side_0'], (5 * 16, 4 * 16 + 6))
        im.alpha_composite(frames['dish_baiao'].resize((12, 12), Image.NEAREST), (5 * 16 + 11, 4 * 16 + 11))
        im.alpha_composite(frames['capybara_front_0'], (10 * 16 + 2, 4 * 16 - 3))
        im.alpha_composite(frames['toad_front_0'], (11 * 16 + 3, 5 * 16 - 4))
        b = bubble()
        b.alpha_composite(frames['dish_brigadeiro'], (4, 2))
        im.alpha_composite(b, (10 * 16 + 9, 2 * 16 + 14))
        im.alpha_composite(frames['potfill_brigadeiro'], (6 * 16, 2 * 16))
        im.alpha_composite(frames['coin_0'].resize((8, 8), Image.NEAREST), (7 * 16 + 4, 5 * 16 + 8))
    variants = {}
    day = base_day.copy()
    actors(day, False)
    variants['day'] = day

    dawn = base_day.copy()
    actors(dawn, False)
    m = mist()
    for x in range(0, dawn.width, m.width):
        for y in range(0, dawn.height, m.height):
            dawn.alpha_composite(m, (x, y))
    dawn.alpha_composite(Image.new('RGBA', dawn.size, (190, 200, 235, 40)))
    variants['dawn'] = dawn

    sunset = base_day.copy()
    actors(sunset, True)
    sunset.alpha_composite(sunset_gradient(sunset.height).resize(sunset.size))
    variants['sunset'] = sunset

    night = base_day.copy()
    for tx in (10, 11):
        night.alpha_composite(frames['lights'], (tx * 16, 3 * 16 - 6))
    actors(night, True)
    night.alpha_composite(Image.new('RGBA', night.size, (29, 36, 64, 130)))
    g = glow()
    from PIL import ImageChops
    for (x, y, size) in ((12 * 16 + 13, 2 * 16 + 17, 48), (12 * 16 + 13, 5 * 16 + 13, 48), (88, 40, 40),
                         (10 * 16 + 8, 3 * 16 + 2, 24), (11 * 16 + 8, 3 * 16 + 2, 24)):
        gl = g.resize((size, size))
        layer = Image.new('RGBA', night.size, (0, 0, 0, 0))
        layer.alpha_composite(gl, (x - size // 2, y - size // 2))
        a = layer.split()[3]
        add = Image.merge('RGB', [ImageChops.multiply(c, a) for c in layer.split()[:3]])
        night = Image.merge('RGBA', (*ImageChops.add(night.convert('RGB'), add).split(), night.split()[3]))
    for tx, ty, i in ((11, 8, 0), (2, 9, 1), (13, 3, 0), (0, 2, 1), (12, 7, 1), (6, 0, 0)):
        night.alpha_composite(frames[f'firefly_{i}'], (tx * 16, ty * 16 - 4))
    variants['night'] = night

    for k, im in variants.items():
        im.resize((im.width * scale, im.height * scale), Image.NEAREST).save(out / f'mockup_{k}.png')
    grid4 = Image.new('RGBA', (w * 16 * 2 * 3 + 12, h * 16 * 2 * 3 + 12), (30, 26, 34, 255))
    for i, k in enumerate(('dawn', 'day', 'sunset', 'night')):
        im = variants[k].resize((w * 16 * 3, h * 16 * 3), Image.NEAREST)
        grid4.alpha_composite(im, ((i % 2) * (w * 48 + 12), (i // 2) * (h * 48 + 12)))
    grid4.save(out / 'mockup_all.png')


if __name__ == '__main__':
    import sys
    build(sys.argv[1] if len(sys.argv) > 1 else None)
