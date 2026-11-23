"""Publish the approved PixelPen export to the shared innkeeper texture path."""

import json
from pathlib import Path
from shutil import copyfile

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REGISTRATION = ROOT / "godot-arcana/art/source/innkeeper/registration.json"
OUTPUT = ROOT / "godot-arcana/art/export/innkeeper/innkeeper.png"

registration = json.loads(REGISTRATION.read_text(encoding="utf-8"))
source = ROOT / registration["source"]
with Image.open(source) as sprite:
    if sprite.mode != "RGBA" or list(sprite.size) != registration["frame"]:
        raise ValueError("Innkeeper export must match the registered RGBA frame.")
    alpha = sprite.getchannel("A")
    alpha_values = [value for value, count in enumerate(alpha.histogram()) if count]
    if (
        alpha_values != registration["alpha"]
        or alpha.getbbox() != tuple(registration["spriteBounds"])
    ):
        raise ValueError("Innkeeper export must match the registered alpha and sprite bounds.")

copyfile(source, OUTPUT)
print(f"Innkeeper packaged from {registration['source']}")
