"""Export the Arcana plaza fountain from an opened Blender source.

Run Blender in background mode with the fountain .blend, this script, and
the destination .glb after --. The Blender source is never saved by the exporter.
"""

import sys
from pathlib import Path

import bpy


def evaluated_mesh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))


def bake_wave(obj, thickness, first_frame):
    # glTF can animate morph weights, but does not carry Blender curve bevel tracks.
    curve = obj.data
    curve.animation_data_clear()
    low, high = min(thickness), max(thickness)
    curve.bevel_depth = low
    bpy.context.view_layer.update()
    base_mesh = evaluated_mesh(obj)
    curve.bevel_depth = high
    bpy.context.view_layer.update()
    expanded_mesh = evaluated_mesh(obj)

    name = obj.name
    obj.name += " Source"
    wave = bpy.data.objects.new(name, base_mesh)
    obj.users_collection[0].objects.link(wave)
    wave.parent = obj.parent
    wave.matrix_parent_inverse = obj.matrix_parent_inverse.copy()
    wave.location = obj.location
    wave.scale = obj.scale
    motion = wave.animation_data_create()
    motion.action = obj.animation_data.action
    motion.action_slot = obj.animation_data.action_slot

    wave.shape_key_add(name="Basis")
    crest = wave.shape_key_add(name="Crest")
    assert len(crest.data) == len(expanded_mesh.vertices), name
    for point, vertex in zip(crest.data, expanded_mesh.vertices):
        point.co = vertex.co
    for frame, depth in enumerate(thickness, first_frame):
        crest.value = (depth - low) / (high - low)
        crest.keyframe_insert("value", frame=frame)

    bpy.data.meshes.remove(expanded_mesh)
    bpy.data.objects.remove(obj, do_unlink=True)


def select(objects, active=None):
    for obj in tuple(bpy.context.selected_objects):
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active


def merge_static(name, objects, group, root):
    if not objects:
        return
    select(objects, objects[0])
    bpy.ops.object.convert(target="MESH")
    meshes = list(bpy.context.selected_objects)
    origin = bpy.data.objects.new(name, bpy.data.meshes.new(name))
    group.objects.link(origin)
    origin.parent = root
    select([*meshes, origin], origin)
    bpy.ops.object.join()


def portable_materials():
    names = {
        "Limestone • Honey": "FountainStoneHoney",
        "Limestone • Cream": "FountainStoneCream",
        "Limestone • Pale": "FountainStonePale",
        "Limestone • Recessed joints": "FountainStoneJoint",
        "Water • Animated caustics": "FountainPool",
        "Water • Streams": "FountainStream",
        "Water • Spray": "FountainFoam",
        "Water • Soft ripple": "FountainRipple",
    }
    for original, portable in names.items():
        material = bpy.data.materials[original]
        material.name = portable
        shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        for label in ("Base Color", "Normal", "Emission Color"):
            socket = shader.inputs[label]
            for link in list(socket.links):
                material.node_tree.links.remove(link)
        shader.inputs["Base Color"].default_value = material.diffuse_color
        if portable == "FountainStream":
            shader.inputs["Transmission Weight"].default_value = 0.0


def main():
    output = Path(sys.argv[sys.argv.index("--") + 1])
    scene = bpy.context.scene
    group = bpy.data.collections["North Star Fountain"]
    root = bpy.data.objects["Fountain • Ground pivot"]
    root.name = "FountainGroundPivot"
    scene.name = "WaterLoop"
    # The Blender preview ends at 72. Frame 73 is the identical closing key.
    scene.frame_end += 1
    waves = [obj for obj in group.all_objects if "Expanding wavelet" in obj.name]
    tracks = {obj: [] for obj in waves}
    for frame in range(scene.frame_start, scene.frame_end + 1):
        scene.frame_set(frame)
        for obj in waves:
            tracks[obj].append(obj.data.bevel_depth)
    scene.frame_set(scene.frame_start)
    for obj, thickness in tracks.items():
        bake_wave(obj, thickness, scene.frame_start)

    water = bpy.data.collections["05 • Water and ripples"]
    static_water = [obj for obj in water.objects if not obj.animation_data]
    masonry = [obj for obj in group.all_objects if obj.type == "MESH" and obj.name not in water.objects]
    merge_static("FountainBody", masonry, group, root)
    merge_static("FountainWater", static_water, water, root)
    portable_materials()

    for obj in group.all_objects:
        obj.name = obj.name.replace(" • ", " ").replace(".", "_")
    scene.frame_set(scene.frame_start)
    output.parent.mkdir(parents=True, exist_ok=True)
    select(list(group.all_objects), root)
    bpy.ops.export_scene.gltf(
        filepath=str(output),
        use_selection=True,
        export_animations=True,
        export_animation_mode="SCENE",
        export_anim_scene_split_object=False,
        export_anim_slide_to_zero=True,
        export_force_sampling=True,
    )


main()
