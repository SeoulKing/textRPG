"""Export independent Blender collections at their reusable floor pivots."""

from pathlib import Path
import sys
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
VARIANTS = {
    HERE / "player-home.blend": "player-home-blender",
    HERE / "player-home-campus-a.blend": "player-home-campus-a",
}
OUTPUT_ROOT = HERE.parents[2] / "godot-arcana/art/source"
sys.path.insert(0, str(HERE.parent / "arcana-inn-interior/source/blender-v1"))
from export_inn import pack_group, pack_hearth

ASSETS = (
    "architecture", "kitchen-hearth", "kitchen-counter", "bedroom-bed",
    "bedroom-bookcase", "bedroom-lamp", "living-sofa", "living-worktable",
    "living-rug", "entry-rug",
)


def is_rear_wall_piece(obj):
    center = obj.matrix_world @ (sum((Vector(corner) for corner in obj.bound_box), Vector()) / 8)
    # Blender's Y axis is negative room depth. Exclude the street corner at the west end.
    return center.y >= -4.5 or (center.x <= 3.0 and center.y > -16.5)


def export(only=()):
    source = Path(bpy.data.filepath).resolve()
    if not bpy.app.background or source not in VARIANTS:
        raise RuntimeError("Open a saved player-home Blender source in background mode first.")
    output = OUTPUT_ROOT / VARIANTS[source]
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    graph = bpy.context.evaluated_depsgraph_get()
    assets = ASSETS if source.name == "player-home.blend" else sorted(
        group.name for group in scene.collection.children if "pivot" in group
    )
    if only:
        unknown = set(only).difference(assets)
        if unknown:
            raise ValueError(f"Unknown player-home collections: {', '.join(sorted(unknown))}")
        assets = [name for name in assets if name in only]
    if "upper-walls" in assets:
        assets = [*assets, "rear-walls"]
    for name in assets:
        collection = bpy.data.collections["upper-walls" if name == "rear-walls" else name]
        x, height, depth = collection["pivot"]
        pivot = bpy.data.objects.new(name + "_pivot", None)
        scene.collection.objects.link(pivot)
        pivot.location = (x, -depth, height)
        bpy.context.view_layer.update()
        meshes = [obj for obj in collection.all_objects if obj.type in {"MESH", "CURVE"} and not obj.hide_render]
        if name in {"upper-walls", "rear-walls"}:
            meshes = [obj for obj in meshes if is_rear_wall_piece(obj) == (name == "rear-walls")]
        packed = pack_hearth(pivot, meshes, graph) if name == "kitchen-hearth" else pack_group(pivot, meshes, graph)
        root = packed[0]
        root.name = name
        root.location -= Vector((x, -depth, height))
        bpy.ops.object.select_all(action="DESELECT")
        for obj in packed:
            obj.select_set(True)
            if obj.type != "MESH":
                continue
            for mat in obj.data.materials:
                if not mat or not mat.node_tree:
                    continue
                shader = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
                if shader:
                    for channel in ("Base Color", "Normal"):
                        for link in list(shader.inputs[channel].links):
                            if link.from_node.type != "TEX_IMAGE":
                                mat.node_tree.links.remove(link)
        path = output / (name + ".glb")
        temporary = output / (name + ".tmp.glb")
        result = bpy.ops.export_scene.gltf(filepath=str(temporary), export_format="GLB",
            use_selection=True, export_animations=False, export_cameras=False, export_lights=False)
        if "FINISHED" not in result:
            raise RuntimeError(f"Could not export {path.name}")
        temporary.replace(path)
        for obj in reversed(packed):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.objects.remove(pivot, do_unlink=True)
        print(f"{path.name}: Blender pivot ({x:.4f}, {height:.4f}, {depth:.4f})", flush=True)


if __name__ == "__main__":
    export(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ())
