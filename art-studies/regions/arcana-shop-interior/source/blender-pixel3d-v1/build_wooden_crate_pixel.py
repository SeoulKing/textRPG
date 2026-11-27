"""Build the editable crate, its 64 px camera preview and the Godot GLB in Blender 5.3."""

from math import atan2, radians, sqrt
from pathlib import Path
from sys import argv

import bpy
from mathutils import Quaternion, Vector


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[4]
OUTPUT = PROJECT / "godot-arcana/art/source/shop-room-blender/wooden-crate-pixel.glb"
PALETTE = {
    "Outline": "38251E",
    "Shadow": "563825",
    "Side": "725037",
    "Front Dark": "865630",
    "Front": "9D683A",
    "Front Light": "B27B45",
    "Rail": "BA8148",
    "Lid Dark": "BA905B",
    "Lid": "C69A62",
    "Lid Light": "D6AC75",
    "Catchlight": "E8BF88",
    "Iron": "393B34",
    "Iron Light": "777365",
}


def linear(byte):
    value = byte / 255.0
    return value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, hex_color):
    color = tuple(linear(int(hex_color[i:i+2], 16)) for i in (0, 2, 4)) + (1.0,)
    mat = bpy.data.materials.new(f"Crate / {name}")
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 1.0
    shader.inputs["Specular IOR Level"].default_value = 0.0
    # The color ramp is baked per face. Match it in the preview and the exported mesh.
    shader.inputs["Emission Color"].default_value = color
    shader.inputs["Emission Strength"].default_value = 1.0
    return mat


def block(collection, palette, name, center, size, top, front, side, angle=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    obj = bpy.context.object
    obj.name = name
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    for vertex in obj.data.vertices:
        for axis in range(3):
            vertex.co[axis] *= size[axis]
    obj.rotation_euler.y = angle
    for name in (top, front, side):
        obj.data.materials.append(palette[name])
    for face in obj.data.polygons:
        normal = face.normal
        face.material_index = 0 if normal.z > 0.5 else 1 if abs(normal.y) > 0.5 else 2
    return obj


def make_crate(scene):
    collection = bpy.data.collections.new("Wooden crate · GLB export")
    scene.collection.children.link(collection)
    palette = {name: material(name, value) for name, value in PALETTE.items()}

    def wood(name, center, size, top, front, side, angle=0.0):
        return block(collection, palette, name, center, size, top, front, side, angle)

    wood("Dark shell", (0, 0, 0.426), (0.866, 0.866, 0.844), "Shadow", "Outline", "Outline")
    for i, front in enumerate(("Front Dark", "Front Light", "Front", "Front Dark")):
        x = -0.310 + i * 0.207
        wood(f"Front board {i+1}", (x, -0.434, 0.418), (0.186, 0.027, 0.664), "Rail", front, "Shadow")
        wood(f"Back board {i+1}", (x, 0.434, 0.418), (0.186, 0.027, 0.664), "Rail", "Side", "Shadow")
        wood(f"Right board {i+1}", (0.434, x, 0.418), (0.027, 0.186, 0.664), "Rail", "Side", "Side")
        wood(f"Left board {i+1}", (-0.434, x, 0.418), (0.027, 0.186, 0.664), "Rail", "Side", "Side")

    for i, name in enumerate(("Lid Dark", "Lid", "Lid Light")):
        y = -0.277 + i * 0.277
        wood(f"Lid plank {i+1}", (0, y, 0.846), (0.846, 0.257, 0.052), name, "Front Dark", "Side")
    for x in (-0.421, 0.421):
        wood("Lid rim", (x, 0, 0.865), (0.088, 0.921, 0.057), "Lid Light", "Rail", "Shadow")
    for y in (-0.436, 0.436):
        wood("Lid end", (0, y, 0.865), (0.825, 0.063, 0.057), "Lid Light", "Front Dark", "Shadow")
    wood("Light-facing lid edge", (-0.451, -0.035, 0.894), (0.026, 0.639, 0.012), "Catchlight", "Lid Light", "Lid")
    wood("Front lid edge", (-0.07, -0.468, 0.883), (0.604, 0.015, 0.027), "Catchlight", "Lid Light", "Front")

    for x in (-0.414, 0.414):
        for y in (-0.417, 0.417):
            wood("Corner post", (x, y, 0.427), (0.100, 0.104, 0.802), "Lid Light", "Rail", "Front Dark")
    for z in (0.062, 0.765):
        for y in (-0.447, 0.447):
            wood("Cross rail", (0, y, z), (0.830, 0.059, 0.105), "Lid", "Front Dark", "Shadow")
        for x in (-0.447, 0.447):
            wood("Side rail", (x, 0, z), (0.059, 0.827, 0.105), "Front Light", "Front Dark", "Front Dark")

    run = 0.719
    rise = 0.521
    angle = -atan2(rise, run)
    length = sqrt(run * run + rise * rise)
    wood("Diagonal front brace shadow", (0, -0.452, 0.400), (length, 0.050, 0.161), "Shadow", "Shadow", "Shadow", angle)
    wood("Raised diagonal front brace", (0, -0.484, 0.427), (length, 0.068, 0.137), "Lid Light", "Rail", "Front Dark", angle)
    wood("Diagonal brace highlight", (-0.022, -0.521, 0.458), (length * 0.68, 0.010, 0.023), "Catchlight", "Lid Light", "Rail", angle)

    for x in (-0.396, 0.396):
        for z in (0.105, 0.739):
            wood("Square iron nail", (x, -0.486, z), (0.045, 0.014, 0.043), "Iron Light", "Iron", "Iron")
    for x, z in ((-0.292, 0.214), (0.295, 0.639)):
        wood("Brace pin", (x, -0.522, z), (0.032, 0.014, 0.031), "Iron Light", "Iron", "Iron")

    # Paint a few compact clusters. Material breaks remain subordinate to the joints.
    for x, y, width in ((-0.17, -0.27, 0.24), (-0.07, 0.28, 0.27)):
        wood("Lid grain cluster", (x, y, 0.873), (width, 0.033, 0.004), "Lid Dark", "Lid Dark", "Lid Dark")
        wood("Lid grain step", (x + width * 0.42, y + 0.032, 0.873), (0.059, 0.033, 0.004), "Lid Dark", "Lid Dark", "Lid Dark")
    for x, z, length in ((-0.28, 0.57, 0.15), (0.075, 0.23, 0.12), (0.30, 0.48, 0.18)):
        wood("Front grain cluster", (x, -0.449, z), (0.027, 0.005, length), "Front Dark", "Front Dark", "Front Dark")

    # Yaw is authored here. Godot places this asset at the room's existing crate origin.
    yaw = Quaternion((0, 0, 1), radians(-16.0))
    for obj in collection.objects:
        obj.location = yaw @ obj.location
        obj.rotation_euler = (yaw @ obj.rotation_euler.to_quaternion()).to_euler()
    return collection


def configure_preview(scene):
    camera = bpy.data.objects.new("Godot angle · 64 px", bpy.data.cameras.new("Godot angle"))
    scene.collection.objects.link(camera)
    center = Vector((0, 0, 0.43))
    camera.location = center + Vector((0, -4, 4))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.13
    scene.camera = camera

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 64
    scene.render.resolution_y = 64
    scene.render.resolution_percentage = 100
    scene.render.filter_size = 0.0
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.dither_intensity = 0.0
    scene.eevee.taa_render_samples = 1
    scene.eevee.taa_samples = 1
    scene.view_settings.view_transform = "Standard"
    scene.render.filepath = "//wooden-crate-pixel-64.png"

    tree = bpy.data.node_groups.new("Crate Pixel Preview", "CompositorNodeTree")
    tree.interface.new_socket(name="Image", in_out="INPUT", socket_type="NodeSocketColor")
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    size = tree.interface.new_socket(name="Pixel Size", in_out="INPUT", socket_type="NodeSocketInt")
    size.default_value = 8
    size.min_value = 1
    size.max_value = 24
    input_node = tree.nodes.new("NodeGroupInput")
    input_node.location = (-230, 0)
    pixelate = tree.nodes.new("CompositorNodePixelate")
    pixelate.location = (0, 0)
    output_node = tree.nodes.new("NodeGroupOutput")
    output_node.location = (230, 0)
    tree.links.new(input_node.outputs["Image"], pixelate.inputs["Color"])
    tree.links.new(input_node.outputs["Pixel Size"], pixelate.inputs["Size"])
    tree.links.new(pixelate.outputs["Color"], output_node.inputs["Image"])

    effect = scene.compositor_effects.new("Pixel Preview")
    effect.node_group = tree
    effect.enable_for_preview = True
    effect.enable_for_render = False

    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.type = "RENDERED"
                area.spaces.active.shading.use_compositor = "ALWAYS"
                area.spaces.active.overlay.show_overlays = False
                area.spaces.active.region_3d.view_perspective = "CAMERA"


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Wooden crate · Godot pixel preview"
    crate = make_crate(scene)
    exporter = crate.exporters.new("IO_FH_gltf2")
    exporter.name = "Update the Godot crate"
    exporter.filepath = "//../../../../../godot-arcana/art/source/shop-room-blender/wooden-crate-pixel.glb"
    exporter.export_properties.export_animations = False
    exporter.export_properties.export_apply = True
    exporter.export_properties.check_existing = False
    bpy.ops.object.select_all(action="DESELECT")
    configure_preview(scene)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "wooden-crate-pixel.blend"))
    if "--skip-glb" not in argv:
        for obj in crate.objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = crate.objects["Dark shell"]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = "WoodenCratePixel"
        bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
        bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", use_selection=True, export_extras=True)
    if "--render" in argv:
        # Render from the original scene, with editable parts and the crate camera.
        bpy.ops.wm.open_mainfile(filepath=str(HERE / "wooden-crate-pixel.blend"))
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
