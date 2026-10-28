"""Register the approved guide at the active heroine's native pixel scale."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "godot-arcana/art/source/plaza-guide"
OUT = ROOT / "godot-arcana/art/export/plaza-guide"
OUT.mkdir(parents=True, exist_ok=True)
hero = Image.open(ROOT / "godot-arcana/art/export/heroine-reference-bright-v10/heroine-idle.png").convert("RGBA").crop((0, 0, 96, 136))
hero_bounds = hero.getbbox()
height = hero_bounds[3] - hero_bounds[1]
source = Image.open(SRC / "guide-source-v3.png").convert("RGBA")
bounds = source.getchannel("A").point(lambda a: 255 if a >= 192 else 0).getbbox()
sprite = source.crop(bounds)
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
frame.save(OUT / "plaza-guide.png")
resource = "res://art/export/plaza-guide/plaza-guide.png"
digest = hashlib.md5(resource.encode()).hexdigest()
template = (ROOT / "godot-arcana/art/export/innkeeper/innkeeper.png.import").read_text(encoding="utf-8")
template = "\n".join(line for line in template.splitlines() if not line.startswith("uid=")) + "\n"
template = template.replace("res://art/export/innkeeper/innkeeper.png", resource).replace("innkeeper.png-7cffffa39fed509d09340f07a9240f17", "plaza-guide.png-" + digest)
(OUT / "plaza-guide.png.import").write_text(template, encoding="utf-8")
preview = Image.new("RGBA", (192, 136), "#34414b")
preview.alpha_composite(hero, (0, 0))
preview.alpha_composite(frame, (96, 0))
preview.resize((768, 544), Image.Resampling.NEAREST).save(SRC / "hero-guide-native-4x.png")
spec = {"frame": [96, 136], "foot": [48, 116], "pixelsPerUnit": 64,
        "sourceBounds": bounds, "silhouetteHeight": height, "heroBounds": hero_bounds,
        "alpha": [0, 255], "palette": "arcana-palette-lut.png", "pose": "front idle",
        "worldPosition": [32, 0, 32.5], "source": "guide-source-v3.png"}
(SRC / "registration.json").write_text(json.dumps(spec, indent=2), encoding="utf-8")
print(f"Guide: 96x136; foot (48,116); silhouette {height}px, matching active heroine.")
