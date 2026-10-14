"""Bump the cache-buster in index.html and rebuild its import map (no build step).

GitHub Pages caches files for 10 minutes, so after a deploy a browser could mix old and new modules. Every local
module goes through the import map in index.html, which maps its plain URL to a ?v=N URL; the stylesheet and the
main script carry the same ?v=N. Run this before each deploy (it also picks up new or removed modules):

    python3 tools/bump_version.py        # N + 1
    python3 tools/bump_version.py 20     # set N
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
START, END = "<!-- importmap:start -->", "<!-- importmap:end -->"


def modules():
    files = sorted(p for p in (ROOT / "src").rglob("*.js") if p.name != "main.js")
    return [p.relative_to(ROOT).as_posix() for p in files] + ["assets/art/frames.js"]


def main():
    html = INDEX.read_text()
    current = max(int(v) for v in re.findall(r"\?v=(\d+)", html))
    version = int(sys.argv[1]) if len(sys.argv) > 1 else current + 1
    html = re.sub(r"\?v=\d+", f"?v={version}", html)
    imports = {f"./{m}": f"./{m}?v={version}" for m in modules()}
    block = json.dumps({"imports": imports}, indent=2).replace("\n", "\n  ")
    script = f'{START}\n  <script type="importmap">\n  {block}\n  </script>\n  {END}'
    html = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: script, html, flags=re.S)
    INDEX.write_text(html)
    print(f"index.html: v={version}, {len(imports)} modules in the import map")


if __name__ == "__main__":
    main()
