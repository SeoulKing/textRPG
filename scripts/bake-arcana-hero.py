"""Normalize the generated B / 4.5-head sheet into game-ready sprite frames.
Source art and its prompt are preserved outside res://; this script only crops,
aligns, palette-quantizes and packs the approved character artwork.
"""
from pathlib import Path
from PIL import Image
import json
import statistics

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-studies/arcana-hero/hero-b45-animation-source.png"
OUT = ROOT / "godot-arcana/art/export/hero-b45.png"
FRAME = (96, 128)
BASELINE = 121

def bake():
    source = Image.open(SOURCE).convert("RGBA")
    colors = []
    for line in (ROOT / "godot-arcana/art/source/arcana-64.gpl").read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) >= 3 and all(v.isdigit() for v in parts[:3]):
            colors.append(tuple(map(int, parts[:3])))
    if len(colors) != 64:
        raise ValueError("Expected 64-color project palette")
    palette = Image.new("P", (1, 1))
    palette.putpalette([v for rgb in (colors * 4) for v in rgb])
    cells = []
    heights = []
    for row in range(4):
        for col in range(8):
            region = (round(col*source.width/8), round(row*source.height/4), round((col+1)*source.width/8), round((row+1)*source.height/4))
            cell = source.crop(region)
            alpha = cell.getchannel("A").point(lambda a: 255 if a >= 144 else 0)
            cell.putalpha(alpha)
            bounds = alpha.getbbox()
            if not bounds:
                raise ValueError(f"Empty frame {row}:{col}")
            cell = cell.crop(bounds)
            cells.append(cell)
            if col < 2:
                heights.append(cell.height)
    scale = 112.0 / statistics.median(heights)
    atlas = Image.new("RGBA", (FRAME[0]*8, FRAME[1]*4))
    records = []
    for index, cell in enumerate(cells):
        width, height = round(cell.width*scale), round(cell.height*scale)
        if width > FRAME[0]-4 or height > FRAME[1]-8:
            raise ValueError(f"Frame does not fit {index}: {width}x{height}")
        cell = cell.resize((width, height), Image.Resampling.LANCZOS)
        alpha = cell.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
        rgb = cell.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGBA")
        rgb.putalpha(alpha)
        # Anchor the head instead of the swinging hands / satchel bounding box.
        head = alpha.crop((0, 0, width, max(1, round(height*.23))))
        head_bounds = head.getbbox()
        center = (head_bounds[0]+head_bounds[2])/2 if head_bounds else width/2
        x, y = round(FRAME[0]/2-center), BASELINE-height
        if x < 1 or x+width >= FRAME[0]:
            raise ValueError(f"Head-aligned frame clips: {index}")
        col, row = index % 8, index // 8
        atlas.alpha_composite(rgb, (col*FRAME[0]+x, row*FRAME[1]+y))
        records.append({"row": row, "column": col, "size": [width,height], "offset": [x,y]})
    OUT.parent.mkdir(exist_ok=True)
    atlas.save(OUT, optimize=True)
    pixels = atlas.get_flattened_data() if hasattr(atlas, "get_flattened_data") else atlas.getdata()
    opaque = {pixel[:3] for pixel in pixels if pixel[3]}
    if not opaque.issubset(set(colors)) or set(atlas.getchannel("A").tobytes()) - {0,255}:
        raise ValueError("Palette / binary alpha contract failed")
    info = {"source": str(SOURCE.relative_to(ROOT)), "atlas": str(OUT.relative_to(ROOT)), "frame": FRAME, "baseline": BASELINE, "rows": ["south","north","east","west"], "idleColumns": [0,1], "walkColumns": [2,3,4,5,6,7], "frames": records}
    (ROOT / "art-studies/arcana-hero/hero-b45-frames.json").write_text(json.dumps(info,indent=2)+"\n", encoding="utf-8")
    preview = Image.new("RGBA", (FRAME[0]*4, FRAME[1]))
    for row in range(4):
        preview.alpha_composite(atlas.crop((0,row*FRAME[1],FRAME[0],(row+1)*FRAME[1])), (row*FRAME[0],0))
    preview.save(ROOT / "art-studies/arcana-hero/hero-b45-directions.png")
    print(f"Hero B45 ready: {atlas.width}x{atlas.height}, 32 frames, {len(opaque)} palette colors, binary alpha")

if __name__ == "__main__":
    bake()
