"""Export saved PixelPen projects through the registered identity contract.

No source regeneration, runtime edits, baseline updates or engine invocation.
All source/contract checks finish before the first output write.
"""
import argparse
import io
import json
import os
from pathlib import Path
import sys
import tempfile

sys.dont_write_bytecode = True

from PIL import Image, ImageDraw
from character_animation_pipeline import (
    DEFAULT_CONTRACT, ROOT, PipelineError, digest, frame_cells, load_bundle,
    load_sources, make_atlas, output_path, require, sprite_frames,
)


def image_bytes(image, format="PNG", **options):
    stream = io.BytesIO()
    image.save(stream, format=format, **options)
    return stream.getvalue()


def make_outputs(bundle, clips):
    """Prepare every artifact in memory. PixelPen and locked reference files are never outputs."""
    contract = bundle["contract"]
    w, h = contract["frameSize"]
    outputs = {}
    for atlas in bundle["atlases"]:
        image = make_atlas(bundle, atlas, clips)
        outputs[output_path(bundle, atlas)] = image_bytes(image)
        outputs[output_path(bundle, atlas, "spriteFrames")] = sprite_frames(bundle, atlas, clips).encode("utf-8")
        board = Image.new("RGBA", image.size, "#8292a7")
        board.alpha_composite(image)
        draw = ImageDraw.Draw(board)
        for direction in atlas["directions"]:
            for index, (x, y) in enumerate(frame_cells(atlas, direction)):
                draw.text((x*w+2, (y+1)*h-13), f"{direction} {index}", fill="white")
        outputs[bundle["source"] / "preview" / f"{atlas['id']}-native-all-frames.png"] = image_bytes(board)

    # Authoring preview uses native timeline order and fps, including repeated cells.
    # Gameplay's distance cycle / cast events / idle breathing remain in the renderer.
    boards, durations = [], []
    directions = contract["directions"]
    columns = min(4, len(directions))
    rows = (len(directions) + columns - 1) // columns
    scale = contract["display"]["previewScale"]
    require(type(scale) is int and scale > 0, "previewScale must be a positive integer")
    for kind in ("idle", "run", "cast", "idle"):
        atlas = next((a for a in bundle["atlases"] if a["id"] == kind), None)
        if atlas is None:
            continue
        members = [clips[f"{kind}_{d}"] for d in atlas["directions"]]
        # A composite GIF has one clock. Split direction previews if source clocks differ.
        if len({member["fps"] for member in members}) != 1:
            continue
        for index in range(atlas["frameCount"]):
            board = Image.new("RGBA", (columns*w, rows*h), "#8292a7")
            for direction in atlas["directions"]:
                position = directions.index(direction)
                board.alpha_composite(clips[f"{kind}_{direction}"]["frames"][index],
                                      ((position % columns)*w, (position // columns)*h))
            boards.append(board.resize((board.width*scale, board.height*scale), Image.Resampling.NEAREST).convert("RGB"))
            # GIF has 10 ms timing granularity; SpriteFrames retains the exact native fps.
            durations.append(max(10, round(100 / members[0]["fps"]) * 10))
    if boards:
        outputs[bundle["source"] / "preview/native-state-flow.gif"] = image_bytes(
            boards[0], "GIF", save_all=True, append_images=boards[1:], duration=durations, loop=0)

    # Per-direction previews also cover bench and clips with different authoring clocks.
    for name, native in clips.items():
        frames = []
        for frame in native["frames"]:
            board = Image.new("RGBA", (w, h), "#8292a7")
            board.alpha_composite(frame)
            frames.append(board.resize((w*scale, h*scale), Image.Resampling.NEAREST).convert("RGB"))
        outputs[bundle["source"] / "preview" / f"{name}-native.gif"] = image_bytes(
            frames[0], "GIF", save_all=True, append_images=frames[1:],
            duration=max(10, round(100 / native["fps"]) * 10),
            **({"loop": 0} if native["loop"] else {}))

    audit = {
        "contract": bundle["contractPath"].relative_to(ROOT).as_posix(),
        "identity": bundle["identity"]["id"],
        "source": "saved native PixelPen files; no source regeneration",
        "sourceDirectory": bundle["source"].relative_to(ROOT).as_posix(),
        "exportDirectory": bundle["output"].relative_to(ROOT).as_posix(),
        "frames": sum(len(native["frames"]) for native in clips.values()),
        "clips": {name: {"frames": len(native["frames"]), "fps": native["fps"], "loop": native["loop"],
                         "sourceSha256": native["sha256"]} for name, native in clips.items()},
        "boundaries": {b["id"]: "equal" for b in contract["boundaries"]},
        "structuralPreflight": "passed",
        "visualReview": "required",
        "finalArtApproval": bundle["identity"]["approval"]["finalArt"],
        "timingNote": "SpriteFrames and *-native.gif use PixelPen timeline/fps. Gameplay timing stays in renderer.",
        "outputs": [path.relative_to(ROOT).as_posix() for path in outputs],
    }
    outputs[bundle["source"] / "native-package-audit.json"] = (
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    for path in outputs:
        resolved = path.resolve()
        require(resolved.is_relative_to(ROOT), f"Output leaves workspace: {path}")
        require(resolved.is_relative_to(bundle["output"])
                or resolved.is_relative_to((bundle["source"] / "preview").resolve())
                or resolved == (bundle["source"] / "native-package-audit.json").resolve(),
                f"Unregistered output path: {path}")
        require(resolved.suffix != ".pxpen", f"Refusing to overwrite source: {path}")
    return outputs, audit


def write_outputs(outputs):
    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
            os.replace(temporary, path)
        finally:
            if temporary is not None and temporary.exists():
                temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    parser.add_argument("--source", help="Sibling source directory name; requires --export")
    parser.add_argument("--export", dest="export_name", help="Sibling export directory name; requires --source")
    args = parser.parse_args()
    if (args.source is None) != (args.export_name is None):
        parser.error("--source and --export must be supplied together")
    try:
        bundle = load_bundle(args.contract, args.source, args.export_name)
        clips = load_sources(bundle)
        outputs, audit = make_outputs(bundle, clips)
        # Catch a saved edit made while packaging before replacing any generated file.
        for native in clips.values():
            require(digest(native["path"]) == native["sha256"],
                    f"Source changed during packaging; retry after saving: {native['path']}")
        write_outputs(outputs)
        print(json.dumps(audit, ensure_ascii=False, indent=2))
        print("Exported saved sources. Visual review remains required; runtime/web were not changed.")
        return 0
    except (PipelineError, OSError, ValueError, KeyError, TypeError) as exc:
        print("Sync failed: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
