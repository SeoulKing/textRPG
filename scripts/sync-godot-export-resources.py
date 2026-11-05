"""Select runtime resources without importing character editing history."""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parent.parent / "godot-arcana"
PRESET = ROOT / "export_presets.cfg"
DIRECTIONS = ("s", "se", "e", "ne", "n", "nw", "w", "sw")
TEXT_SUFFIXES = {".json", ".gd", ".tscn", ".tres", ".gdshader", ".gdshaderinc"}
RESOURCE_SUFFIXES = TEXT_SUFFIXES | {".png", ".svg", ".res", ".ttf", ".otf", ".glb", ".wav", ".ogg"}
regions = json.loads((ROOT / "data/regions.json").read_text(encoding="utf-8"))["regions"]
pending = ["main.tscn", "data/regions.json", "tools/export_combat_layout.gd", "tools/export_online_layout.gd"]
pending += [entry["scene"].removeprefix("res://") for entry in regions.values()]
# World catalogs still select some prop/item assets by ID.
for area in (ROOT / "art/export").iterdir():
    # Retired player outputs stay excluded even while their deletion awaits review.
    if area.name.startswith("heroine") or area.name in {"hero.png", "hero-b45.png"}:
        continue
    candidates = area.rglob("*") if area.is_dir() else (area,)
    pending += [p.relative_to(ROOT).as_posix() for p in candidates
                if p.is_file() and p.suffix in RESOURCE_SUFFIXES
                and not (area.name == "reference" and p.name.startswith(("hero-", "heroine-preview-floor")))]

# Direction templates and native rigs are resolved dynamically. Select the
# approved runtime contract explicitly; provenance reports are editing inputs.
BUNDLE_PREFIX = "art/characters/hybrid-v1/"
bundle = ROOT / BUNDLE_PREFIX
pending += [BUNDLE_PREFIX + item for item in (
    "assembly/parts.json", "assembly/assembly.json", "assembly/motion-polish.json", "shared-run.json",
    "heads/manifest.json", "upper-body/manifest.json", "pelvis/manifest.json",
    "legs/manifest.json", "boots/manifest.json", "hands/manifest.json",
)]
for direction in DIRECTIONS:
    pending += [BUNDLE_PREFIX + item for item in (
        f"heads/{direction}/head.png", f"upper-body/{direction}/upper_body.png",
        f"pelvis/{direction}/pelvis.png", f"legs/{direction}/leg.png", f"boots/{direction}/boot.png",
        f"hands/{direction}/hand_l.png", f"hands/{direction}/hand_r.png",
        f"rigs/upper-body/{direction}.tscn", f"rigs/legs/{direction}.tscn",
        f"assembly/upper-body-assembly/{direction}.png", f"assembly/review/neutral/{direction}.png",
    )]
    # Native upper-body configure() reads these detail-protection masks by name.
    pending += [BUNDLE_PREFIX + f"upper-body/{direction}/{layer}.png"
                for layer in ("leather", "metal", "collar_trim")]

BUNDLE_REFERENCE_FIELDS = {
    "manifest", "png_template", "scene_template", "assembly_profile", "motion_tuning",
    "shared_motion", "run_keyframes", "bundle", "motion_source", "upper_assembly_texture", "png", "texture",
}

def bundle_runtime_references(value):
    """Follow only playback fields; nativeSource/tool/report paths are provenance."""
    result = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key in BUNDLE_REFERENCE_FIELDS and isinstance(child, str):
                result.extend(re.findall(r'res://([^"\s]+)', child))
            elif isinstance(child, (dict, list)):
                result.extend(bundle_runtime_references(child))
    elif isinstance(value, list):
        for child in value:
            result.extend(bundle_runtime_references(child))
    return result

selected = set()
while pending:
    relative = pending.pop()
    if "{direction}" in relative:
        pending.extend(relative.replace("{direction}", direction) for direction in DIRECTIONS)
        continue
    if relative in selected:
        continue
    path = ROOT / relative
    if not path.is_file() or path.suffix not in RESOURCE_SUFFIXES:
        continue
    selected.add(relative)
    if path.suffix in TEXT_SUFFIXES:
        content = path.read_text(encoding="utf-8-sig")
        if relative.startswith(BUNDLE_PREFIX) and path.suffix == ".json":
            pending.extend(bundle_runtime_references(json.loads(content)))
        else:
            pending.extend(re.findall(r'res://([^"\s]+)', content))
        for include in re.findall(r'#include\s+"([^"]+)"', content):
            if not include.startswith("res://"):
                pending.append((path.parent / include).resolve().relative_to(ROOT).as_posix())
for required in ("scripts/main.gd", "scripts/world.gd", "scripts/native_2d_world.gd", "scripts/game_ui.gd",
                 "art/characters/hybrid-v1/assembly/parts.json", "art/characters/hybrid-v1/shared-run.json",
                 "art/characters/hybrid-v1/run-keyframes.tres"):
    if required not in selected:
        raise RuntimeError("Missing required runtime resource: " + required)
text = PRESET.read_text(encoding="utf-8-sig")
line = 'export_files=PackedStringArray(' + ', '.join('"res://' + item + '"' for item in sorted(selected)) + ')'
text = re.sub(r'^export_files=.*$', lambda _: line, text, flags=re.M)
# Godot does not import JSON as a Resource; selected JSON also needs its include filter.
include = sorted(item for item in selected if item.endswith(".json")) + ["fonts/NotoSansKR-OFL.txt"]
text = re.sub(r'^include_filter="[^"\n]*"$', lambda _: 'include_filter="' + ','.join(include) + '"', text, flags=re.M)
PRESET.write_text(text, encoding="utf-8", newline="\n")
print(f"Web export selects {len(selected)} runtime resources; hybrid-v1 is the only player bundle.")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--stage-list", help="Write the exact addon-free build input list")
args = parser.parse_args()
if args.stage_list:
    inputs = selected | {"project.godot", "export_presets.cfg", "web-shell.html"}
    for relative in tuple(inputs):
        for suffix in (".import", ".uid"):
            if (ROOT / (relative + suffix)).is_file():
                inputs.add(relative + suffix)
    target = Path(args.stage_list).resolve()
    if not target.is_relative_to((ROOT.parent / ".runtime/godot").resolve()):
        raise RuntimeError("Stage list must stay inside .runtime/godot")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(sorted(inputs)), encoding="utf-8")
