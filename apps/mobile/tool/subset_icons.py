#!/usr/bin/env python3
"""Rebuild assets/fonts/MaterialSymbolsRounded.ttf with only the icons listed in lib/icons.dart.

The full Google font is ~15 MB; the app only ships the glyphs it uses (like the web client).
Weight, grade and optical size are pinned to the defaults (400 / 0 / 24); the FILL axis is kept
so `Icon(..., fill: 1)` draws the filled variant of the same glyph.

Usage (needs fonttools: `pip install fonttools`):
    python3 tool/subset_icons.py [path/to/MaterialSymbolsRounded[FILL,GRAD,opsz,wght].ttf]
Without a path, the font is downloaded from github.com/google/material-design-icons.
"""
import re
import sys
import tempfile
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC_URL = ("https://github.com/google/material-design-icons/raw/master/variablefont/"
           "MaterialSymbolsRounded%5BFILL,GRAD,opsz,wght%5D.ttf")
OUT = ROOT / "assets/fonts/MaterialSymbolsRounded.ttf"

codepoints = sorted({int(h, 16) for h in re.findall(r"IconData\(0x([0-9a-fA-F]+)", (ROOT / "lib/icons.dart").read_text())})
assert codepoints, "no IconData(0x...) entries found in lib/icons.dart"

if len(sys.argv) > 1:
    src = Path(sys.argv[1])
else:
    src = Path(tempfile.mkdtemp()) / "MaterialSymbolsRounded.ttf"
    print(f"Downloading {SRC_URL}")
    urllib.request.urlretrieve(SRC_URL, src)

font = TTFont(src)
opts = subset.Options()
opts.layout_features = []  # codepoints only, no ligatures
opts.name_IDs = ["*"]
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(unicodes=codepoints)
sub.subset(font)
# Instancing after subsetting: much faster, and avoids a fontTools KeyError on '.notdef'.
font = instancer.instantiateVariableFont(font, {"wght": 400, "GRAD": 0, "opsz": 24})

missing = [hex(c) for c in codepoints if c not in font.getBestCmap()]
assert not missing, f"codepoints not in the font: {missing}"
assert [a.axisTag for a in font["fvar"].axes] == ["FILL"], "FILL axis lost"
OUT.parent.mkdir(parents=True, exist_ok=True)
font.save(OUT)
print(f"{OUT.relative_to(ROOT)}: {len(codepoints)} icons, {OUT.stat().st_size // 1024} KB")
