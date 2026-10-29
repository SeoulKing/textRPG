"""Package saved PixelPen exports. Does not redraw or overwrite native projects."""
from pathlib import Path
import hashlib
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "godot-arcana/art/source/plaza-guide/idle-v2"
OUT = ROOT / "godot-arcana/art/export/plaza-guide"
spec = json.loads((SRC / "animation.json").read_text(encoding="utf-8"))
frames = [Image.open(SRC / f"native-frames/pose-{i:02}.png").convert("RGBA") for i in range(spec["poses"])]
reference = Image.open(OUT / "plaza-guide.png").convert("RGBA")
assert frames[0].tobytes() == reference.tobytes(), "Neutral pose must match approved Mei"
for frame in frames:
    assert frame.crop((0, 91, 96, 136)).tobytes() == reference.crop((0, 91, 96, 136)).tobytes(), "Keep boots planted"
    assert set(frame.getchannel("A").get_flattened_data()) <= {0, 255}
resource = "res://art/export/plaza-guide/mei-idle.png"
digest = hashlib.md5(resource.encode()).hexdigest()
template = (OUT / "plaza-guide.png.import").read_text(encoding="utf-8")
template = template.replace("res://art/export/plaza-guide/plaza-guide.png", resource).replace("plaza-guide.png-10f7bc0db83246187c6cdaf7b80e0dd0", "mei-idle.png-" + digest)
(OUT / "mei-idle.png.import").write_text(template, encoding="utf-8")
# Export full frame textures at build time. WebGL playback must never read
# pixels back from a GPU atlas to construct ImageTextures while animating.
frame_out = OUT / "mei-idle-frames"
frame_out.mkdir(exist_ok=True)
lines = [f'[gd_resource type="SpriteFrames" load_steps={spec["poses"]+1} format=3]']
for i, frame in enumerate(frames):
    frame.save(frame_out / f"pose-{i:02}.png")
    lines += [f'[ext_resource type="Texture2D" path="res://art/export/plaza-guide/mei-idle-frames/pose-{i:02}.png" id="pose_{i}"]']
cells = ',\n'.join('{"duration": 1.0, "texture": ExtResource("pose_%d")}' % i for i in spec["sequence"])
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
