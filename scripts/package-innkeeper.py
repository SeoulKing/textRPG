"""Register approved innkeeper artwork, preserving the source."""
from pathlib import Path
from PIL import Image
import json
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "godot-arcana/art/source/innkeeper"
OUT = ROOT / "godot-arcana/art/export/innkeeper"
source = Image.open(SRC / "innkeeper-source.png").convert("RGBA")
bounds = source.getchannel("A").point(lambda a: 255 if a >= 192 else 0).getbbox()
sprite = source.crop(bounds)
height = 106
width = round(sprite.width * height / sprite.height)
sprite = sprite.resize((width, height), Image.Resampling.NEAREST)
lut = Image.open(ROOT / "godot-arcana/art/export/arcana-palette-lut.png").convert("RGB")
pixels = sprite.load()
for y in range(height):
    for x in range(width):
        r, g, b, a = pixels[x, y]
        if a < 192:
            pixels[x, y] = (0, 0, 0, 0)
        else:
            ri, gi, bi = (round(v * 31 / 255) for v in (r, g, b))
            pixels[x, y] = (*lut.getpixel((bi * 32 + ri, gi)), 255)
frame = Image.new("RGBA", (96, 136))
frame.alpha_composite(sprite, (48 - width // 2, 116 - height))
frame.save(OUT / "innkeeper.png")
spec = {"frame": [96, 136], "foot": [48, 116], "pixelsPerUnit": 64,
        "sourceBounds": bounds, "silhouetteHeight": height, "alpha": [0, 255],
        "palette": "arcana-palette-lut.png", "pose": "front idle",
        "worldPosition": [16.7, 0, 5.9], "interactionPoint": [267, 148]}
(SRC / "registration.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
print("Innkeeper registered: 96x136, foot (48,116), 64px/unit.")
