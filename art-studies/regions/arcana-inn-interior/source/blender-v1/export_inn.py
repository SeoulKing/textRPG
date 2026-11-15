"""Export the saved inn lobby as grouped Godot geometry from Blender background mode."""

import re
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import bpy
from mathutils import Vector


SOURCE = Path(__file__).resolve().with_name("inn-lobby.blend")
PROJECT = SOURCE.parents[5]
OUTPUT = PROJECT / "godot-arcana/art/source/inn-lobby-blender/inn-lobby.glb"


def pack_group(anchor, meshes, graph):
    """Merge evaluated meshes while keeping the group pivot and material slots."""
    pivot = anchor.matrix_world.copy()
    parts = []
    for source in meshes:
        evaluated = source.evaluated_get(graph)
        mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=graph)
        part = bpy.data.objects.new(source.name + " export", mesh)
        bpy.context.scene.collection.objects.link(part)
        part.matrix_world = evaluated.matrix_world
        parts.append(part)

    root = bpy.data.objects.new(re.sub(r"[^A-Za-z0-9]+", "_", anchor.name).strip("_"), None)
    bpy.context.scene.collection.objects.link(root)
    root.matrix_world = pivot
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    merged = parts[0]
    bpy.context.view_layer.objects.active = merged
    if len(parts) > 1:
        bpy.ops.object.join()
    merged.name = root.name + "_Mesh"
    bpy.context.view_layer.update()
    transform = merged.matrix_world.copy()
    merged.parent = root
    merged.matrix_world = transform
    return root, merged


def pack_hearth(anchor, meshes, graph):
    flames = [obj for obj in meshes if obj.name.startswith(("Flame volume", "Rising ember"))]
    if not flames:
        return pack_group(anchor, meshes, graph)
    hearth, structure = pack_group(anchor, [obj for obj in meshes if obj not in flames], graph)
    bounds = [obj.matrix_world @ Vector(corner) for obj in flames for corner in obj.bound_box]
    pivot = bpy.data.objects.new("Hearth_flames", None)
    pivot.location = tuple(
        (min(point[axis] for point in bounds) + max(point[axis] for point in bounds)) / 2
        for axis in (0, 1)
    ) + (min(point.z for point in bounds),)
    bpy.context.scene.collection.objects.link(pivot)
    bpy.context.view_layer.update()
    flame_root, flame_mesh = pack_group(pivot, flames, graph)
    transform = flame_root.matrix_world.copy()
    flame_root.name = "Hearth_flame_pivot"
    flame_root.parent = hearth
    flame_root.matrix_world = transform
    return hearth, structure, flame_root, flame_mesh


def export():
    if not bpy.app.background or Path(bpy.data.filepath).resolve() != SOURCE:
        raise RuntimeError(f"Open {SOURCE} in a separate Blender background process first.")

    scene = bpy.context.scene
    groups = {}
    for obj in scene.objects:
        if obj.type not in {"MESH", "CURVE"} or obj.hide_render:
            continue
        anchor = obj
        while anchor.parent:
            anchor = anchor.parent
        groups.setdefault(anchor, []).append(obj)
    if not groups:
        raise RuntimeError("The saved inn has no renderable geometry.")

    graph = bpy.context.evaluated_depsgraph_get()
    exported = []
    for anchor, meshes in groups.items():
        if anchor.name == "01 • Limestone hearth":
            exported.extend(pack_hearth(anchor, meshes, graph))
        else:
            exported.extend(pack_group(anchor, meshes, graph))
    bpy.ops.object.select_all(action="DESELECT")
    for item in exported:
        item.select_set(True)

    # Godot owns the preview lighting. Use the saved material's base values where
    # procedural Blender-only grain and bump nodes have no glTF equivalent.
    for material in {material for obj in exported if obj.type == "MESH" for material in obj.data.materials if material}:
        tree = material.node_tree
        if tree is None:
            continue
        shader = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if shader:
            for name in ("Base Color", "Normal"):
                for link in list(shader.inputs[name].links):
                    if link.from_node.type != "TEX_IMAGE":
                        tree.links.remove(link)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".inn-lobby-", dir=OUTPUT.parent) as directory:
        temporary = Path(directory) / OUTPUT.name
        result = bpy.ops.export_scene.gltf(
            filepath=str(temporary),
            export_format="GLB",
            use_selection=True,
            export_animations=False,
            export_cameras=False,
            export_lights=False,
        )
        if "FINISHED" not in result or not temporary.is_file():
            raise RuntimeError("The inn GLB export failed.")
        # A Windows TemporaryDirectory can restrict access to the exporting
        # account. Give the finished asset the permissions of the asset folder.
        ready = OUTPUT.with_name(f".{OUTPUT.stem}-{uuid4().hex}.glb")
        try:
            shutil.copyfile(temporary, ready)
            ready.replace(OUTPUT)
        finally:
            ready.unlink(missing_ok=True)
    print(f"Inn lobby exported: {len(groups)} editable groups, {OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    export()
