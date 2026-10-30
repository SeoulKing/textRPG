"""Keep the Web selected-resource list closed over literal runtime references."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent / "godot-arcana"
PRESET = ROOT / "export_presets.cfg"
ROOTS = ["main.tscn", "scenes/native_2d/plaza.tscn", "scenes/native_2d/inn_lobby.tscn", "scenes/native_2d/academy_first_floor.tscn", "scenes/native_2d/academy_second_floor.tscn", "scenes/native_2d/restaurant.tscn", "scenes/shop_2d.tscn"]
RESOURCE_SUFFIXES = {".gd", ".tscn", ".tres", ".gdshader", ".gdshaderinc", ".png", ".svg", ".res", ".ttf", ".otf", ".glb", ".wav", ".ogg"}
TEXT_SUFFIXES = {".gd", ".tscn", ".tres", ".gdshader", ".gdshaderinc"}
# Asset names in data files are resolved dynamically; ship the existing export library.
pending = list(ROOTS) + [p.relative_to(ROOT).as_posix() for p in (ROOT / "art/export").rglob("*") if p.is_file() and p.suffix in RESOURCE_SUFFIXES]
selected = set()
while pending:
    relative = pending.pop()
    if relative in selected:
        continue
    path = ROOT / relative
    if not path.is_file() or path.suffix not in RESOURCE_SUFFIXES:
        continue
    selected.add(relative)
    if path.suffix in TEXT_SUFFIXES:
        content = path.read_text(encoding="utf-8-sig")
        pending.extend(re.findall(r'res://([^"\s]+)', content))
        for include in re.findall(r'#include\s+"([^"]+)"', content):
            full = (path.parent / include).resolve()
            pending.append(full.relative_to(ROOT).as_posix())
for required in ("scripts/main.gd", "scripts/world.gd", "scripts/native_2d_world.gd", "scripts/game_ui.gd"):
    if required not in selected:
        raise RuntimeError("Missing required runtime resource: " + required)
text = PRESET.read_text(encoding="utf-8-sig")
line = 'export_files=PackedStringArray(' + ', '.join('"res://' + item + '"' for item in sorted(selected)) + ')'
text = re.sub(r'^export_files=.*$', lambda _: line, text, flags=re.M)
PRESET.write_text(text, encoding="utf-8", newline="\n")
print(f"Web export includes {len(selected)} resources with runtime dependencies.")
