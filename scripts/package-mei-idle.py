"""Package saved PixelPen exports. Does not redraw or overwrite native projects."""
from pathlib import Path
import hashlib
import json
import re
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "godot-arcana/art/source/plaza-guide/idle-v2"
OUT = ROOT / "godot-arcana/art/export/plaza-guide"
spec = json.loads((SRC / "animation.json").read_text(encoding="utf-8"))
frames = [Image.open(SRC / f"native-frames/pose-{i:02}.png").convert("RGBA") for i in range(spec["poses"])]
reference = Image.open(OUT / "plaza-guide.png").convert("RGBA")
assert frames[0].tobytes() == reference.tobytes(), "Neutral pose must match approved Mei"
assert frames and all(frame.size == (96, 136) for frame in frames), "Every pose must be a full 96x136 frame"
assert spec["sequence"] and all(0 <= pose < len(frames) for pose in spec["sequence"]), "Timeline references a missing pose"
for frame in frames:
    assert frame.crop((0, 91, 96, 136)).tobytes() == reference.crop((0, 91, 96, 136)).tobytes(), "Keep boots planted"
    assert frame.getchannel("A").getbbox() is not None, "Empty Mei pose"
    assert set(frame.getchannel("A").get_flattened_data()) <= {0, 255}
resource = "res://art/export/plaza-guide/mei-idle.png"
digest = hashlib.md5(resource.encode()).hexdigest()
template = (OUT / "plaza-guide.png.import").read_text(encoding="utf-8")
template = template.replace("res://art/export/plaza-guide/plaza-guide.png", resource).replace("plaza-guide.png-10f7bc0db83246187c6cdaf7b80e0dd0", "mei-idle.png-" + digest)
# Copy texture settings, never the neutral sprite's identity. Preserve an existing
# unique atlas UID; otherwise let Godot assign one during the next import.
atlas_import = OUT / "mei-idle.png.import"
uid_pattern = r'^uid="([^"]+)"$'
source_uid = re.search(uid_pattern, template, re.MULTILINE)
existing_uid = re.search(uid_pattern, atlas_import.read_text(encoding="utf-8"), re.MULTILINE) if atlas_import.exists() else None
if existing_uid and (not source_uid or existing_uid[1] != source_uid[1]):
    template = re.sub(uid_pattern, existing_uid[0], template, flags=re.MULTILINE)
else:
    template = re.sub(uid_pattern + r'\n?', '', template, flags=re.MULTILINE)
atlas_import.write_text(template, encoding="utf-8")
# Build one imported atlas from the saved native frames. Playback changes UVs
# only: no GPU readback, ImageTexture creation, or sampler replacement.
atlas = Image.new("RGBA", (96 * spec["poses"], 136))
for i, frame in enumerate(frames):
    atlas.alpha_composite(frame, (96 * i, 0))
atlas.save(OUT / "mei-idle.png")
# Retain full-frame exports for existing references and inspection.
frame_out = OUT / "mei-idle-frames"
frame_out.mkdir(exist_ok=True)
lines = [f'[gd_resource type="SpriteFrames" load_steps={spec["poses"]+2} format=3]',
         f'[ext_resource type="Texture2D" path="{resource}" id="atlas"]']
for i, frame in enumerate(frames):
    frame.save(frame_out / f"pose-{i:02}.png")
    lines += [f'[sub_resource type="AtlasTexture" id="pose_{i}"]\natlas = ExtResource("atlas")\nregion = Rect2({96*i}, 0, 96, 136)']
cells = ',\n'.join('{"duration": 1.0, "texture": SubResource("pose_%d")}' % i for i in spec["sequence"])
lines += ['[resource]', 'animations = [{"frames": ['+cells+'], "loop": true, "name": &"idle", "speed": '+str(spec['fps'])+'}]']
(OUT / "mei-idle.tres").write_text('\n\n'.join(lines)+'\n', encoding="utf-8")
preview = []
for i in spec["sequence"]:
    canvas = Image.new("RGBA", (96, 136), "#34414b")
    canvas.alpha_composite(frames[i])
    preview.append(canvas.resize((384,544),Image.Resampling.NEAREST).convert("RGB"))
preview[0].save(SRC / "mei-idle-preview.gif", save_all=True, append_images=preview[1:], duration=round(1000/spec['fps']), loop=0, optimize=False)
board = Image.new("RGBA", (96*spec["poses"],136), "#34414b")
for i,frame in enumerate(frames): board.alpha_composite(frame,(96*i,0))
board.resize((96*spec["poses"]*4,544),Image.Resampling.NEAREST).save(SRC / "mei-idle-poses-4x.png")
spec["name"] = "메이"
spec["referenceSHA256"] = hashlib.sha256((OUT / "plaza-guide.png").read_bytes()).hexdigest()
spec["nativeSHA256"] = hashlib.sha256((SRC / "mei-idle.pxpen").read_bytes()).hexdigest()
(SRC / "animation.json").write_text(json.dumps(spec,ensure_ascii=False,indent=2),encoding="utf-8")
print(f"Mei idle: {spec['poses']} native poses, {len(spec['sequence'])} cells, {spec['fps']} fps; approved neutral and planted boots preserved.")
