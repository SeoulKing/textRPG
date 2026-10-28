"""Shared read-only contract/native checks and deterministic SpriteFrames serialization."""
from __future__ import annotations

import hashlib
import io
import json
import math
import re
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONTRACT = ROOT / "godot-arcana/art/source/heroine/animation-pipeline.json"


class PipelineError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise PipelineError(message)


def repo_path(value):
    path = (ROOT / value).resolve()
    require(path.is_relative_to(ROOT), f"Path leaves workspace: {value}")
    return path


def json_read(path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        raise PipelineError(f"{path}: {exc}") from exc


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def positive_int(value):
    return type(value) is int and value > 0


def positive_number(value):
    return type(value) in (int, float) and math.isfinite(value) and value > 0


def compact(text):
    return re.sub(r"\s+", "", text)


def vector(value, size):
    match = re.fullmatch(rf"Vector{size}i\(([^)]+)\)", value)
    require(match is not None, f"Invalid Vector{size}i: {value}")
    parts = tuple(int(v.strip()) for v in match[1].split(","))
    require(len(parts) == size, f"Invalid vector: {value}")
    return parts


def frame_cells(atlas, direction):
    if atlas["layout"] == "direction-rows":
        return [(frame, atlas["directions"].index(direction))
                for frame in range(atlas["frameCount"])]
    require(atlas["layout"] == "cells", f"{atlas['id']}: unknown layout")
    require(len(atlas["directions"]) == 1, f"{atlas['id']}: explicit cells need one direction")
    return [tuple(cell) for cell in atlas["cells"]]


def load_bundle(contract_path=DEFAULT_CONTRACT, source=None, export=None):
    require((source is None) == (export is None), "--source and --export must be supplied together")
    contract_path = repo_path(contract_path)
    contract = json_read(contract_path)
    require(contract["version"] == 2, f"{contract_path}: expected pipeline version 2")
    width, height = contract["frameSize"]
    require(positive_int(width) and positive_int(height), "frameSize must contain positive integers")
    foot = contract["foot"]
    require(len(foot) == 2 and all(type(v) is int for v in foot)
            and 0 <= foot[0] < width and 0 <= foot[1] < height, "foot is outside the frame")
    require(positive_number(contract["pixelsPerUnit"]), "Invalid pixelsPerUnit")
    require(positive_number(contract["cycleDistanceMapUnits"]), "Invalid cycle distance")
    directions = contract["directions"]
    require(directions and len(directions) == len(set(directions)), "Duplicate/empty directions")
    require(all(re.fullmatch(r"[a-z]+", d) for d in directions), "Invalid direction name")
    src = repo_path(contract["source"]["directory"])
    out = repo_path(contract["exportDirectory"])
    if source is not None:
        for label, value in [("source", source), ("export", export)]:
            require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", value) is not None,
                    f"--{label} must be a directory name, not a path")
        src = repo_path(src.parent / source)
        out = repo_path(out.parent / export)
    require(out.is_relative_to(ROOT / "godot-arcana/art/export"), "Output must stay under art/export")
    require(not out.is_relative_to(src) and not src.is_relative_to(out), "Source/output overlap")
    identity = json_read(repo_path(contract["identity"]))
    require(identity["version"] == 1, "Unsupported identity version")
    locked_paths = set()
    for locked in identity["lockedFiles"]:
        path = repo_path(locked["path"])
        require(path not in locked_paths, f"Duplicate locked file: {path}")
        locked_paths.add(path)
        require(path.is_file(), f"Missing locked reference: {path}")
        require(digest(path) == locked["sha256"],
                f"Locked reference changed: {path}; review the baseline, do not auto-update its hash")
        require(not path.is_relative_to(out), f"Output overlaps locked reference: {path}")
    for path in [identity["designReference"], identity["palette"]["path"]]:
        require(repo_path(path) in locked_paths, f"Unpinned baseline: {path}")
    refs = identity["references"]
    require(sorted(ref["direction"] for ref in refs) == sorted(directions),
            "Identity needs exactly one reference per direction")
    for ref in refs:
        require(repo_path(ref["path"]) in locked_paths, f"Unpinned directional reference: {ref['path']}")
    palette_data = json_read(repo_path(identity["palette"]["path"]))
    colors = palette_data[identity["palette"]["field"]]
    require(0 < len(colors) <= 255 and len(colors) == len(set(colors)), "Invalid baseline palette")
    require(all(re.fullmatch(r"#[0-9a-fA-F]{6}", c) for c in colors), "Invalid palette RGB")
    require(palette_data["skinBase"] in colors and palette_data["skinLightShadow"] in colors,
            "Skin colors must belong to the locked palette")
    registration = json_read(repo_path(src / contract["source"]["registration"]))
    require(registration["palette"] == colors, f"{src}: registration palette differs from locked baseline")
    require(registration.get("skin_base") == palette_data["skinBase"], f"{src}: skin base differs from baseline")
    rgba = [(0, 0, 0, 0)] + [tuple(bytes.fromhex(c[1:])) + (255,) for c in colors]
    atlases = contract["atlases"]
    require(len({a["id"] for a in atlases}) == len(atlases), "Duplicate atlas ids")
    count = 0
    targets = set()
    for atlas in atlases:
        label = atlas["id"]
        require(re.fullmatch(r"[a-z][a-z0-9_-]*", label), f"Invalid atlas id: {label}")
        require(positive_int(atlas["frameCount"]), f"{label}: invalid frameCount")
        require(len(atlas["grid"]) == 2 and all(positive_int(n) for n in atlas["grid"]),
                f"{label}: invalid grid")
        require(atlas["directions"] and len(set(atlas["directions"])) == len(atlas["directions"])
                and set(atlas["directions"]) <= set(directions), f"{label}: invalid directions")
        require(atlas["authoringTiming"] == "pixelpen-timeline-fps", f"{label}: unsupported timing")
        occupied = set()
        for direction in atlas["directions"]:
            cells = frame_cells(atlas, direction)
            require(len(cells) == atlas["frameCount"], f"{label}/{direction}: cell/frame count mismatch")
            for cell in cells:
                require(len(cell) == 2 and all(type(v) is int for v in cell)
                        and 0 <= cell[0] < atlas["grid"][0] and 0 <= cell[1] < atlas["grid"][1],
                        f"{label}/{direction}: cell outside atlas: {cell}")
                require(cell not in occupied, f"{label}: duplicate cell {cell}")
                occupied.add(cell)
            count += len(cells)
        for aux in atlas.get("auxiliary", []):
            for col, direction in enumerate(atlas["directions"]):
                cell = (col, aux["row"])
                require(0 <= cell[0] < atlas["grid"][0] and type(cell[1]) is int
                        and 0 <= cell[1] < atlas["grid"][1] and cell not in occupied,
                        f"{label}: invalid auxiliary cell {cell}")
                occupied.add(cell)
        for key in ("path", "spriteFrames"):
            registered = repo_path(atlas[key])
            require(registered.parent == repo_path(contract["exportDirectory"]),
                    f"{label}: {key} must be directly inside exportDirectory")
            target = out / registered.name
            require(target not in targets, f"Duplicate output target: {target}")
            targets.add(target)
        runtime = atlas["runtime"]
        if runtime["mode"] == "durations":
            require(len(runtime["seconds"]) == atlas["frameCount"]
                    and all(positive_number(v) for v in runtime["seconds"]),
                    f"{label}: invalid runtime durations")
        elif runtime["mode"] == "distance":
            require(runtime["cycleDistanceMapUnits"] == contract["cycleDistanceMapUnits"],
                    f"{label}: inconsistent distance timing")
        elif runtime["mode"] == "states":
            for clip in runtime["clips"]:
                require(clip["frames"] and all(type(n) is int and 0 <= n < atlas["frameCount"]
                                               for n in clip["frames"]), f"{label}: invalid state addresses")
                if "secondsPerFrame" in clip:
                    require(positive_number(clip["secondsPerFrame"]), f"{label}: invalid state timing")
        else:
            raise PipelineError(f"{label}: unsupported runtime timing")
    require(count == contract["expectedActiveFrames"], f"Active frame count {count} differs from contract")
    return {"contract": contract, "contractPath": contract_path, "identity": identity,
            "source": src, "output": out, "rgba": rgba, "atlases": atlases}


def read_native(path, size, palette, expected_count):
    """PixelPen 1.1.4: every timeline cell lasts 1/fps; repeated cells preserve holds."""
    try:
        content = path.read_bytes()
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            cfg = json.loads(archive.read("config.json"))
            require(cfg["compatibility_version"] == 3, f"{path}: unsupported PixelPen format")
            require(vector(cfg["canvas_size"], 2) == tuple(size), f"{path}: wrong canvas size")
            colors = []
            for color in cfg["palette"]["color_index"]:
                match = re.fullmatch(r"Color\(([^)]+)\)", color)
                require(match is not None, f"{path}: invalid native palette color")
                values = [float(v.strip()) for v in match[1].split(",")]
                require(len(values) == 4 and all(math.isfinite(v) and 0 <= v <= 1 for v in values),
                        f"{path}: invalid native RGBA")
                colors.append(tuple(round(v * 255) for v in values))
            require(colors == palette, f"{path}: native palette differs from registration")
            require(positive_number(cfg["animation_fps"]), f"{path}: invalid fps")
            require(type(cfg["animation_loop"]) is bool, f"{path}: invalid loop")
            timeline = cfg["animation_timeline"]
            require(len(timeline) == expected_count,
                    f"{path}: {len(timeline)} frames; contract expects {expected_count}. Update the contract for new poses.")
            pool = {frame["frame_uid"]: frame for frame in cfg["pool_frames"]}
            require(len(pool) == len(cfg["pool_frames"]), f"{path}: duplicate frame UIDs")
            frames = []
            for index, cell in enumerate(timeline):
                require(cell["frame_uid"] in pool, f"{path}/frame {index}: missing frame UID")
                frame = pool[cell["frame_uid"]]
                uid = "_".join(map(str, vector(frame["frame_uid"], 3)))
                data = bytearray(size[0] * size[1])
                for layer_index in reversed(range(len(frame["layers"]))):
                    layer = frame["layers"][layer_index]
                    require(vector(layer["size"], 2) == tuple(size), f"{path}/frame {index}: layer size mismatch")
                    layer_data = archive.read(f"pool_frames/{uid}.{layer_index}.bin")
                    require(len(layer_data) == len(data), f"{path}/frame {index}: layer byte count mismatch")
                    require(not layer_data or max(layer_data) < len(palette),
                            f"{path}/frame {index}: palette index outside range")
                    require(type(layer["visible"]) is bool, f"{path}/frame {index}: invalid visibility")
                    if layer["visible"]:
                        for pixel, value in enumerate(layer_data):
                            if value:
                                data[pixel] = value
                require(any(data), f"{path}/frame {index}: empty visible frame")
                image = Image.frombytes("RGBA", tuple(size), b"".join(bytes(palette[n]) for n in data))
                frames.append(image)
            return {"frames": frames, "fps": cfg["animation_fps"], "loop": cfg["animation_loop"],
                    "path": path, "sha256": hashlib.sha256(content).hexdigest()}
    except (OSError, KeyError, ValueError, zipfile.BadZipFile) as exc:
        raise PipelineError(f"{path}: {exc}") from exc


def load_sources(bundle):
    contract = bundle["contract"]
    native_dir = repo_path(bundle["source"] / contract["source"]["pixelpenDirectory"])
    require(native_dir.is_relative_to(bundle["source"]), "Native source leaves source directory")
    clips = {}
    source_paths = set()
    for atlas in bundle["atlases"]:
        for direction in atlas["directions"]:
            name = f"{atlas['id']}_{direction}"
            path = repo_path(native_dir / atlas["sourcePattern"].format(direction=direction))
            require(path.is_relative_to(native_dir), f"{name}: source leaves PixelPen directory")
            require(path not in source_paths, f"{name}: duplicate source file {path}")
            source_paths.add(path)
            clips[name] = read_native(path, contract["frameSize"], bundle["rgba"], atlas["frameCount"])
    # Resolve auxiliaries and boundaries before any export writes.
    for atlas in bundle["atlases"]:
        for aux in atlas.get("auxiliary", []):
            for direction in atlas["directions"]:
                frame_at(clips, aux["sourceAtlas"], direction, aux["sourceFrame"])
    check_boundaries(bundle, clips)
    return clips


def frame_at(clips, atlas, direction, frame):
    name = f"{atlas}_{direction}"
    require(name in clips, f"Unknown boundary/auxiliary clip: {name}")
    frames = clips[name]["frames"]
    require(type(frame) is int and 0 <= frame < len(frames), f"{name}: invalid frame address {frame}")
    return frames[frame]


def check_boundaries(bundle, clips):
    for boundary in bundle["contract"]["boundaries"]:
        for direction in boundary["directions"]:
            left, right = boundary["left"], boundary["right"]
            a = frame_at(clips, left["atlas"], direction, left["frame"])
            b = frame_at(clips, right["atlas"], direction, right["frame"])
            require(a.tobytes() == b.tobytes(),
                    f"Boundary {boundary['id']}/{direction}: {left} differs from {right}")


def output_path(bundle, atlas, key="path"):
    return bundle["output"] / Path(atlas[key]).name


def make_atlas(bundle, atlas, clips):
    w, h = bundle["contract"]["frameSize"]
    image = Image.new("RGBA", (w * atlas["grid"][0], h * atlas["grid"][1]))
    for direction in atlas["directions"]:
        for cell, frame in zip(frame_cells(atlas, direction), clips[f"{atlas['id']}_{direction}"]["frames"]):
            image.paste(frame, (cell[0] * w, cell[1] * h))
    for aux in atlas.get("auxiliary", []):
        for col, direction in enumerate(atlas["directions"]):
            image.paste(frame_at(clips, aux["sourceAtlas"], direction, aux["sourceFrame"]),
                        (col * w, aux["row"] * h))
    return image


def sprite_frames(bundle, atlas, clips):
    """Build from saved timeline order/fps; runtime timing stays in the renderer."""
    w, h = bundle["contract"]["frameSize"]
    texture_path = output_path(bundle, atlas).relative_to(ROOT / "godot-arcana").as_posix()
    resources, animations = [], []
    def add_animation(name, cells, fps, loop):
        frames = []
        for x, y in cells:
            rid = f"F{len(resources)}"
            resources.append(f'[sub_resource type="AtlasTexture" id="{rid}"]\natlas = ExtResource("1")\n'
                             f'region = Rect2({x*w}, {y*h}, {w}, {h})\n')
            frames.append('{"duration": 1.0, "texture": SubResource("' + rid + '")}')
        animations.append('{"frames": [' + ", ".join(frames) + '], "loop": ' + str(loop).lower()
                          + ', "name": &"' + name + '", "speed": ' + str(float(fps)) + '}')
    for direction in atlas["directions"]:
        name = f"{atlas['id']}_{direction}"
        native = clips[name]
        add_animation(name, frame_cells(atlas, direction), native["fps"], native["loop"])
    for aux in atlas.get("auxiliary", []):
        for col, direction in enumerate(atlas["directions"]):
            native = clips[f"{aux['sourceAtlas']}_{direction}"]
            add_animation(f"{aux['name']}_{direction}", [(col, aux["row"])], native["fps"], native["loop"])
    return (f'[gd_resource type="SpriteFrames" load_steps={len(resources)+2} format=3]\n\n'
            f'[ext_resource type="Texture2D" path="res://{texture_path}" id="1"]\n\n'
            + "\n".join(resources) + "\n[resource]\nanimations = ["
            + ",\n".join(animations) + "]\n")


def check_runtime(bundle):
    c = bundle["contract"]
    renderer = compact(repo_path(c["renderer"]).read_text(encoding="utf-8"))
    world = compact(repo_path(c["world"]).read_text(encoding="utf-8"))
    renderer_resource = "res://" + Path(c["renderer"]).relative_to("godot-arcana").as_posix()
    require(f'preload("{renderer_resource}")' in world, "World no longer uses the registered renderer")
    require('constDIRECTIONS=' + compact(json.dumps(c["directions"])) in renderer, "Runtime direction order changed")
    for atlas in bundle["atlases"]:
        for key, binding in [("path", "resourceConstant"), ("spriteFrames", "spriteFramesConstant")]:
            if binding in atlas:
                resource = "res://" + Path(atlas[key]).relative_to("godot-arcana").as_posix()
                require(compact(f'const {atlas[binding]}=preload("{resource}")') in renderer,
                        f"{atlas['id']}: runtime binding {atlas[binding]} differs from {resource}")
        require(compact(f'Vector2({atlas["grid"][0]},{atlas["grid"][1]})') in renderer,
                f"{atlas['id']}: runtime grid differs from contract")
        for marker in atlas["runtime"]["evidence"]:
            require(compact(marker) in renderer, f"{atlas['id']}: review runtime timing/address expression: {marker}")
    spec = compact(repo_path(c["referenceSpec"]).read_text(encoding="utf-8"))
    for name, values in [("FRAME_SIZE", c["frameSize"]), ("FOOT", c["foot"])]:
        require(f'const{name}=Vector2i({values[0]},{values[1]})' in spec, f"Reference spec {name} changed")
    require(re.search(rf"constPIXELS_PER_UNIT={float(c['pixelsPerUnit']):g}(?:\.0)?(?:\D|$)", spec),
            "Reference spec pixelsPerUnit changed")
    registered = {atlas["resourceConstant"] for atlas in bundle["atlases"]}
    return [(name, path) for name, path in re.findall(
        r'const(\w*ATLAS)=preload\("([^"]+\.png)"\)', renderer) if name not in registered]



def check_sprite_frames(bundle, atlas, clips):
    path = output_path(bundle, atlas, "spriteFrames")
    # Only run.tres is currently consumed by the renderer. Other resources are optional previews.
    if not path.exists() and "spriteFramesConstant" not in atlas:
        return
    text = path.read_text(encoding="utf-8")
    expected_texture = "res://" + output_path(bundle, atlas).relative_to(ROOT / "godot-arcana").as_posix()
    textures = dict((identifier, texture) for texture, identifier in re.findall(
        r'\[ext_resource type="Texture2D" path="([^"]+)" id="([^"]+)"\]', text))
    regions = {}
    for identifier, block in re.findall(
            r'\[sub_resource type="AtlasTexture" id="([^"]+)"\](.*?)(?=\n\[|\Z)', text, re.S):
        resource = re.search(r'atlas\s*=\s*ExtResource\("([^"]+)"\)', block)
        rectangle = re.search(r'region\s*=\s*Rect2\(([^)]+)\)', block)
        require(resource and rectangle, f"{path}: invalid AtlasTexture {identifier}")
        require(textures.get(resource[1]) == expected_texture, f"{path}: stale texture reference {identifier}")
        regions[identifier] = tuple(float(n.strip()) for n in rectangle[1].split(","))
    match = re.search(r'\[resource\]\s*animations\s*=\s*(\[.*\])\s*$', text, re.S)
    require(match is not None, f"{path}: unsupported SpriteFrames format")
    encoded = re.sub(r'SubResource\("([^"]+)"\)', lambda m: json.dumps(m[1]), match[1])
    encoded = encoded.replace('&"', '"')
    encoded = re.sub(r",\s*([\]}])", r"\1", encoded)
    animations = json.loads(encoded)
    actual = {animation["name"]: animation for animation in animations}
    require(len(actual) == len(animations), f"{path}: duplicate animation names")
    expected = {}
    for direction in atlas["directions"]:
        name = f"{atlas['id']}_{direction}"
        expected[name] = (frame_cells(atlas, direction), clips[name])
    for aux in atlas.get("auxiliary", []):
        for col, direction in enumerate(atlas["directions"]):
            expected[f"{aux['name']}_{direction}"] = (
                [(col, aux["row"])], clips[f"{aux['sourceAtlas']}_{direction}"])
    require(set(actual) == set(expected), f"{path}: SpriteFrames clip names differ from contract")
    w, h = bundle["contract"]["frameSize"]
    for name, (cells, native) in expected.items():
        animation = actual[name]
        require(len(animation["frames"]) == len(cells), f"{path}/{name}: frame count mismatch")
        require(animation["loop"] == native["loop"], f"{path}/{name}: saved loop differs from native source")
        require(positive_number(animation["speed"]), f"{path}/{name}: invalid animation speed")
        for index, ((x, y), frame) in enumerate(zip(cells, animation["frames"])):
            require(regions.get(frame["texture"]) == (x*w, y*h, w, h),
                    f"{path}/{name}/frame {index}: incorrect atlas region")
            require(positive_number(frame["duration"])
                    and math.isclose(frame["duration"] / animation["speed"], 1 / native["fps"], abs_tol=1e-8),
                    f"{path}/{name}/frame {index}: authoring timing differs from saved PixelPen fps "
                    f"({native['fps']}); sync explicitly to refresh exports")


def validate_exports(bundle, clips):
    errors = []
    palette = set(bundle["rgba"][1:])
    w, h = bundle["contract"]["frameSize"]
    for atlas in bundle["atlases"]:
        path = output_path(bundle, atlas)
        try:
            with Image.open(path) as opened:
                image = opened.convert("RGBA")
            expected_size = (w * atlas["grid"][0], h * atlas["grid"][1])
            require(image.size == expected_size, f"{path}: size {image.size}, expected {expected_size}")
            normalized = bytearray(image.tobytes())
            for offset in range(0, len(normalized), 4):
                rgba = tuple(normalized[offset:offset+4])
                pixel = offset // 4
                if rgba[3] not in (0, 255) or (rgba[3] and rgba not in palette):
                    location = f"{path}: pixel ({pixel % image.width}, {pixel // image.width})"
                    reason = "non-binary alpha" if rgba[3] not in (0, 255) else "RGB outside locked palette"
                    raise PipelineError(f"{location}: {reason}")
                if not rgba[3]:
                    normalized[offset:offset+4] = b"\0\0\0\0"
            image = Image.frombytes("RGBA", image.size, bytes(normalized))
            for direction in atlas["directions"]:
                for index, (x, y) in enumerate(frame_cells(atlas, direction)):
                    crop = image.crop((x*w, y*h, (x+1)*w, (y+1)*h))
                    require(crop.getbbox() is not None, f"{path}/{direction}/frame {index}: empty frame")
                    native = clips[f"{atlas['id']}_{direction}"]["frames"][index]
                    require(crop.tobytes() == native.tobytes(),
                            f"{path}/{direction}/frame {index}: export differs from saved PixelPen; sync required")
            require(image.tobytes() == make_atlas(bundle, atlas, clips).tobytes(),
                    f"{path}: auxiliary or unused cells differ from registered source")
        except (PipelineError, OSError, ValueError, KeyError) as exc:
            errors.append(str(exc))
        try:
            check_sprite_frames(bundle, atlas, clips)
        except (PipelineError, OSError, ValueError, KeyError) as exc:
            errors.append(str(exc))
    return errors


def validation_main():
    import argparse
    parser = argparse.ArgumentParser(description="Read-only character identity, native and export checks")
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    args = parser.parse_args()
    try:
        bundle = load_bundle(args.contract)
        clips = load_sources(bundle)
        errors = validate_exports(bundle, clips)
        try:
            unmanaged = check_runtime(bundle)
            for name, path in unmanaged:
                print(f"Unregistered atlas (not checked): {name} -> {path}")
        except (PipelineError, OSError, ValueError, KeyError) as exc:
            errors.append(str(exc))
        count = sum(len(clip["frames"]) for clip in clips.values())
        auxiliary = sum(len(a["directions"]) * len(a.get("auxiliary", [])) for a in bundle["atlases"])
        print(f"Active poses: {count}; auxiliary cells: {auxiliary} (excluded from active count).")
        for error in errors:
            print("ERROR: " + error)
        print("Structure: " + ("FAIL" if errors else "PASS (registered scope: identity, native, exports, runtime references)"))
        print("Visual review: REQUIRED (likeness, silhouettes, contact and natural motion are not scored).")
        print("Final art approval: " + bundle["identity"]["approval"]["finalArt"])
        pending = [stage["id"] for stage in bundle["contract"]["stages"] if stage["status"] != "active"]
        print("Pending production: " + ", ".join(pending))
        return 1 if errors else 0
    except (PipelineError, OSError, ValueError, KeyError, TypeError) as exc:
        print("Structure: FAIL\nERROR: " + str(exc))
        print("Visual review: REQUIRED; structural failure does not change the approval record.")
        return 1


if __name__ == "__main__":
    raise SystemExit(validation_main())
