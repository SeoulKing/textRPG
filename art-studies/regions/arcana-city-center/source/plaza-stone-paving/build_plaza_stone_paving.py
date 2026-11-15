"""Build the 22 × 30 plaza flagstones and export the Godot mesh."""
from pathlib import Path
from random import Random

import bpy
from mathutils import Vector


SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[4]
OUTPUT = ROOT / "godot-arcana/art/source/plaza-stone-paving/plaza-stone-paving.glb"
PALETTE = ("#b8a990", "#beaf97", "#b1a48f", "#c2b49c", "#ae9e86", "#b9ad96")
RANDOM = Random(813)


def material(name, hex_color):
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [(channel / 12.92 if channel < 0.04045 else
               ((channel + 0.055) / 1.055) ** 2.4) for channel in srgb]
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*linear, 1.0)
    surface = next(node for node in result.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    surface.inputs["Base Color"].default_value = result.diffuse_color
    surface.inputs["Roughness"].default_value = 0.94
    return result


def stone_tiles(root):
    vertices, faces, material_indices = [], [], []
    row_edges = [-15.0]
    while row_edges[-1] < 13.4:
        row_edges.append(row_edges[-1] + RANDOM.uniform(0.84, 1.5))
    row_edges.append(15.0)
    for row, (south, north) in enumerate(zip(row_edges, row_edges[1:])):
        joints = [-11.0]
        cursor = -11.0 + RANDOM.uniform(0.56, 1.05) + (0.50 if row % 2 else 0.0)
        while cursor < 10.35:
            joints.append(cursor)
            cursor += RANDOM.uniform(1.20, 2.06)
        joints.append(11.0)
        for west, east in zip(joints, joints[1:]):
            corners = (RANDOM.uniform(0.018, 0.064) for _ in range(4))
            a, b, c, d = corners
            gap = 0.012
            west, east, south_edge, north_edge = west + gap, east - gap, south + gap, north - gap
            perimeter = [
                (west + a, south_edge), (east - b, south_edge),
                (east, south_edge + b), (east, north_edge - c),
                (east - c, north_edge), (west + d, north_edge),
                (west, north_edge - d), (west, south_edge + a),
            ]
            middle_x = (west + east) * 0.5
            middle_y = (south_edge + north_edge) * 0.5
            height = RANDOM.uniform(-0.004, 0.002)
            start = len(vertices)
            vertices.extend((x, y, -0.027) for x, y in perimeter)
            vertices.extend((x + (0.019 if x < middle_x else -0.019),
                             y + (0.019 if y < middle_y else -0.019), height)
                            for x, y in perimeter)
            faces.append(tuple(range(start + 8, start + 16)))
            material_indices.append(RANDOM.randrange(len(PALETTE)))
            for i in range(8):
                j = (i + 1) % 8
                faces.append((start + i, start + j, start + 8 + j, start + 8 + i))
                material_indices.append(len(PALETTE))

    mesh = bpy.data.meshes.new("Shallow bevel flagstones")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    surface = bpy.data.objects.new("StoneTileSurface", mesh)
    bpy.context.collection.objects.link(surface)
    surface.parent = root
    for i, color in enumerate(PALETTE):
        mesh.materials.append(material(f"Limestone {i + 1}", color))
    mesh.materials.append(material("Worn limestone edges", "#a0937f"))
    for polygon, index in zip(mesh.polygons, material_indices):
        polygon.material_index = index
    return surface


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    floor = bpy.data.objects.new("PlazaStonePaving", None)
    bpy.context.collection.objects.link(floor)
    surface = stone_tiles(floor)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, -0.114))
    bed = bpy.context.object
    bed.name = "StoneBedding"
    bed.scale = (11, 15, 0.087)
    bed.parent = floor
    bed.data.materials.append(material("Recessed mortar", "#948670"))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in (floor, surface, bed):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), use_selection=True, export_extras=True)

    # Review a section at the plaza's 45-degree camera pitch.
    bpy.ops.object.camera_add(location=(7, -17, 18.4))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 12.5
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.light = "FLAT"
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 570
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(SOURCE / "plaza-stone-paving-preview.png")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "plaza-stone-paving.blend"))
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
