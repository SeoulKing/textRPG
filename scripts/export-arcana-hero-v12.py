"""Export the approved hero with embedded art, rig, and movement clips.

Run with Blender in background mode. The source .blend is only read.
"""

from pathlib import Path
import json
from math import radians
import struct
import sys

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art-studies/characters/arcana-hero-pixel3d/arcana-hero-pixel3d-v12.blend"
OUTPUT = ROOT / "godot-arcana/art/characters/hero-v12/hero.glb"
COLOR_ATTRIBUTE = "Hero color"


def mesh_triangles(mesh):
    mesh.calc_loop_triangles()
    return [tuple(triangle.vertices) for triangle in mesh.loop_triangles]


def vertex_samples(mesh):
    coordinates = [vertex.co.copy() for vertex in mesh.vertices]
    colors = [Vector(attribute.color[:3]) for attribute in mesh.color_attributes["Skin tone"].data]
    return coordinates, colors


def compact_skull(skull):
    """Remove over-sampled faces while retaining the sculpt and its painted skin."""
    source = skull.data
    source_points, source_colors = vertex_samples(source)
    source_triangles = mesh_triangles(source)
    source_surface = BVHTree.FromPolygons(source_points, source_triangles, all_triangles=True)
    source_weights = {
        tuple(vertex.co): tuple((group.group, group.weight) for group in vertex.groups)
        for vertex in source.vertices
    }

    editing = bmesh.new()
    editing.from_mesh(source)
    # Keep the caps and neck junction, as well as the original UV boundaries.
    protected = {face for face in editing.faces if len(face.verts) > 4 or any(v.co.z < 1.221 for v in face.verts)}
    bmesh.ops.dissolve_limit(
        editing,
        angle_limit=radians(.5),
        use_dissolve_boundaries=False,
        verts=[vertex for vertex in editing.verts if protected.isdisjoint(vertex.link_faces)],
        edges=[edge for edge in editing.edges if protected.isdisjoint(edge.link_faces)],
        delimit={"SEAM", "MATERIAL", "SHARP"},
    )
    bmesh.ops.triangulate(editing, faces=[face for face in editing.faces if len(face.verts) > 4 and face not in protected])
    compact = bpy.data.meshes.new(source.name + " · runtime")
    editing.to_mesh(compact)
    editing.free()
    for material in source.materials:
        compact.materials.append(material)
    skull.data = compact
    skull.vertex_groups.new(name="Head")

    points, colors = vertex_samples(compact)
    triangles = mesh_triangles(compact)
    surface = BVHTree.FromPolygons(points, triangles, all_triangles=True)
    assert all(tuple(vertex.co) in source_weights for vertex in compact.vertices)
    assert all(source_weights[tuple(vertex.co)] == tuple((group.group, group.weight) for group in vertex.groups)
               for vertex in compact.vertices)
    max_distance, max_color = 0.0, 0.0
    for point, color in zip(source_points, source_colors):
        closest, _, face, distance = surface.find_nearest(point)
        max_distance = max(max_distance, distance)
        a, b, c = triangles[face]
        sampled = barycentric_transform(closest, points[a], points[b], points[c], colors[a], colors[b], colors[c])
        max_color = max(max_color, *(abs(a - b) for a, b in zip(color, sampled)))
    for triangle in triangles:
        a, b, c = (points[index] for index in triangle)
        for sample in ((a + b + c) / 3, (a + b) / 2, (a + c) / 2, (b + c) / 2):
            max_distance = max(max_distance, source_surface.find_nearest(sample)[3])
    assert len(triangles) < .30 * len(source_triangles)
    assert max_distance < .25 / 70 and max_color < .01, (max_distance, max_color)
    print(f"Skull {len(source_triangles)} to {len(triangles)} triangles; "
          f"maximum sampled deviation {max_distance * 70:.3f} px at 70 px/unit.")


def connect_unlit(material, texture=None, vertex_color=False):
    tree = material.node_tree
    nodes, links = tree.nodes, tree.links
    for node in list(nodes):
        if node != texture:
            nodes.remove(node)
    emission = nodes.new("ShaderNodeEmission")
    if texture is not None:
        links.new(texture.outputs["Color"], emission.inputs["Color"])
    elif vertex_color:
        color = nodes.new("ShaderNodeVertexColor")
        color.layer_name = COLOR_ATTRIBUTE
        links.new(color.outputs["Color"], emission.inputs["Color"])

    # The glTF exporter recognizes this graph as KHR_materials_unlit.
    ray = nodes.new("ShaderNodeLightPath")
    select = nodes.new("ShaderNodeMixShader")
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(ray.outputs["Is Camera Ray"], select.inputs[0])
    links.new(emission.outputs[0], select.inputs[1])
    links.new(emission.outputs[0], select.inputs[2])
    links.new(select.outputs[0], output.inputs["Surface"])


def consolidate_colors(meshes):
    color_material = bpy.data.materials.new("Hero · painted mesh colors")
    connect_unlit(color_material, vertex_color=True)
    textured = {}
    for obj in meshes:
        mesh = obj.data
        if mesh.uv_layers:
            assert len(mesh.uv_layers) == 1, mesh.name
            mesh.uv_layers[0].name = "UVMap"
        colors = mesh.color_attributes.get("Skin tone")
        paints = {}
        for i, material in enumerate(mesh.materials):
            texture = next((node for node in material.node_tree.nodes if node.type == "TEX_IMAGE"), None)
            if texture is not None:
                textured[material] = texture
            else:
                emission = next(node for node in material.node_tree.nodes if node.type == "EMISSION")
                color = emission.inputs["Color"]
                assert not color.is_linked or colors is not None, material.name
                paints[i] = (tuple(color.default_value), color.is_linked)
        attribute = mesh.color_attributes.new(name=COLOR_ATTRIBUTE, type="FLOAT_COLOR", domain="CORNER")
        for polygon in mesh.polygons:
            solid, painted = paints.get(polygon.material_index, ((1.0, 1.0, 1.0, 1.0), False))
            for loop in polygon.loop_indices:
                attribute.data[loop].color = colors.data[mesh.loops[loop].vertex_index].color if painted else solid
        if colors is not None:
            mesh.color_attributes.remove(colors)
        for index in paints:
            mesh.materials[index] = color_material

    for material, texture in textured.items():
        connect_unlit(material, texture=texture)


def join_meshes(meshes, name):
    bpy.ops.object.select_all(action="DESELECT")
    active = meshes[0]
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
    assert bpy.ops.object.join() == {"FINISHED"}
    active.name = name
    active.data.name = name
    return active


def export():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    for scene in list(bpy.data.scenes):
        if scene != bpy.context.scene:
            bpy.data.scenes.remove(scene)
    rig = bpy.data.objects["Arcana Rig"]
    sys.path.insert(0, str(ROOT / "scripts/blender"))
    from hero_foot_rig import prepare_feet, narrow_idle_stance
    from hero_mocap import bake_locomotion
    prepare_feet(rig)
    narrow_idle_stance(rig)
    bake_locomotion(rig)
    root = rig.parent
    root["motion_source"] = (
        "Walk and Run adapted from Female 1 (B03 and C03), Open Motion Project by "
        "ACCAD/The Ohio State University, https://accad.ohio-state.edu/research/motion-lab/mocap-system-and-data "
        "(CC BY 3.0, https://creativecommons.org/licenses/by/3.0/)."
    )
    meshes = [obj for obj in rig.children_recursive if obj.type == "MESH" and not obj.hide_render]
    assert len(meshes) == 125 and all(obj.parent == rig for obj in meshes)
    compact_skull(bpy.data.objects["Face · skull, cheek and jaw"])
    consolidate_colors(meshes)

    body = join_meshes([obj for obj in meshes if obj.data.shape_keys is None], "Hero Model")
    eyes = bpy.data.collections["Eyes · Separate surfaces"]
    animated_eyes = [
        join_meshes([obj for obj in eyes.objects if obj["eye_side"] == side], "Eye " + side)
        for side in ("L", "R")
    ]
    assert all(obj.data.shape_keys.key_blocks.get("Blink") is not None for obj in animated_eyes)
    rig["Blink L"] = 0.0
    rig["Blink R"] = 0.0
    bpy.context.scene.frame_set(1)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in (root, rig, body, *animated_eyes):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    candidate = OUTPUT.with_name("hero.next.glb")
    try:
        assert bpy.ops.export_scene.gltf(
            filepath=str(candidate),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_skins=True,
            export_vertex_color="MATERIAL",
            export_all_vertex_colors=False,
            export_morph=True,
            export_morph_normal=False,
            export_morph_animation=False,
            export_extras=True,
            export_cameras=False,
            export_lights=False,
            export_animations=True,
            export_animation_mode="ACTIONS",
            export_force_sampling=True,
            export_frame_range=False,
            export_anim_slide_to_zero=True,
            export_def_bones=False,
            export_leaf_bone=False,
            export_image_format="AUTO",
        ) == {"FINISHED"}
        verify(candidate)
        candidate.replace(OUTPUT)
    finally:
        candidate.unlink(missing_ok=True)


def verify(path):
    with path.open("rb") as file:
        magic, version, length, json_length, chunk_type = struct.unpack("<4sIIII", file.read(20))
        assert magic == b"glTF" and version == 2 and length == path.stat().st_size
        assert chunk_type == 0x4E4F534A
        asset = json.loads(file.read(json_length))
    assert not asset.get("cameras")
    assert all("KHR_materials_unlit" in material.get("extensions", {}) for material in asset["materials"])
    assert len(asset["images"]) == 7 and all("bufferView" in image for image in asset["images"])
    assert sorted(animation["name"] for animation in asset["animations"]) == ["Idle", "Run", "Walk"]
    assert all(max(asset["accessors"][sampler["input"]]["max"][0] for sampler in animation["samplers"]) > 1.3
               for animation in asset["animations"] if animation["name"] != "Run")
    run = next(animation for animation in asset["animations"] if animation["name"] == "Run")
    assert any(asset["accessors"][sampler["input"]]["count"] == 25 and
               abs(asset["accessors"][sampler["input"]]["max"][0] - 1.0) < 0.00001
               for sampler in run["samplers"])
    assert sum(mesh.get("extras", {}).get("targetNames") == ["Blink"] for mesh in asset["meshes"]) == 2
    assert len(asset["skins"]) == 1 and len(asset["skins"][0]["joints"]) == 41
    for name in ("Toe.L", "Toe.R"):
        toe = next(i for i in asset["skins"][0]["joints"] if asset["nodes"][i]["name"] == name)
        for clip in asset["animations"]:
            assert any(c["target"] == {"node": toe, "path": "rotation"} for c in clip["channels"])
    assert [asset["nodes"][i]["name"] for i in asset["scenes"][0]["nodes"]] == ["Arcana Hero"]
    assert any("COLOR_0" in part["attributes"] for mesh in asset["meshes"] for part in mesh["primitives"])
    assert all("JOINTS_0" in part["attributes"] and "WEIGHTS_0" in part["attributes"]
               for mesh in asset["meshes"] for part in mesh["primitives"])
    print(f"Exported {OUTPUT} with {len(asset['meshes'])} skinned meshes.")


export()
