"""Assemble the first Arcana home in Blender from the editable inn library."""

import math
import random
from pathlib import Path
import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
INN = HERE.parent / "arcana-inn-interior/source/blender-v1/inn-lobby.blend"
if not bpy.app.background or Path(bpy.data.filepath).resolve() != INN:
    raise RuntimeError(f"Open {INN} in Blender background mode first.")

scene = bpy.context.scene
scene.name = "Arcana | Player Home"
rng = random.Random(640)
materials = bpy.data.materials
oak = materials["Oak | honey"]
dark = materials["Oak | dark carved frames"]
trim = materials["Oak | polished trim"]
wall = materials["Limewash | warm cream"]
linen = materials["Textile | flax linen"]
blue = materials["Textile | lapis blue"]
gold = materials["Textile | antique gold"]
brass = materials["Brass | aged and polished"]
ivory = materials["Porcelain | warm ivory"]
iron = materials["Iron | blackened"]


def color_material(name, rgb, emission=0.0):
    mat = materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Emission Color"].default_value = mat.diffuse_color
    shader.inputs["Emission Strength"].default_value = emission
    return mat


def collection(name):
    group = bpy.data.collections.new(name)
    scene.collection.children.link(group)
    return group


def block(group, name, x, depth, height, width, length, thickness, mat, bevel=0.025):
    # Blender Y maps to negative Godot Z. Heights are Blender Z / Godot Y.
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((width, length, thickness, 1))), verts=list(bm.verts))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = (x, -depth, height)
    if bevel:
        mod = obj.modifiers.new("Soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("Corner normals", "WEIGHTED_NORMAL")
    return obj


# Retain the editable detailed assets and move each into its own home collection.
reused = {
    "kitchen-hearth": ("01 • Limestone hearth", 5.30, 5.36, 3.30, 1.66, 0.98),
    "bedroom-bookcase": ("02 • Oak bookcase", 19.38, 5.46, 1.42, 1.55, 0.92),
    "living-sofa": ("Lounge | L-shaped settee", 6.99, 11.61, 5.24, 1.60, 1.04),
    "living-rug": ("Rug | hearth lounge", 6.86, 13.06, 6.90, 4.05, 1.0),
    "entry-rug": ("Rug | entry", 12.0, 15.12, 2.75, 1.88, 1.0),
    "bedroom-lamp": ("Sconce | east post", 15.18, 4.44, 0.52, 0.29, 1.0),
}
keep = {name for name, *_ in reused.values()}
for obj in [root for root in scene.objects if root.parent is None and root.name not in keep]:
    for part in reversed(obj.children_recursive):
        bpy.data.objects.remove(part, do_unlink=True)
    bpy.data.objects.remove(obj, do_unlink=True)

for slug, (name, x, depth, width, length, vertical) in reused.items():
    anchor = bpy.data.objects[name]
    children = list(anchor.children_recursive)
    bounds = [obj.matrix_world @ Vector(point) for obj in children if obj.type in {"MESH", "CURVE"} for point in obj.bound_box]
    minimum = Vector(tuple(min(p[i] for p in bounds) for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in bounds) for i in range(3)))
    center = (minimum + maximum) * .5
    floor_height = 2.12 if slug == "bedroom-lamp" else 0.012
    scale = Matrix.Diagonal(Vector((width / (maximum.x - minimum.x), length / (maximum.y - minimum.y), vertical, 1)))
    move = Matrix.Translation(Vector((x, -depth, floor_height))) @ scale @ Matrix.Translation(-Vector((center.x, center.y, minimum.z)))
    anchor.matrix_world = move @ anchor.matrix_world
    anchor.name = slug.title()
    part_collection = collection(slug)
    for part in [anchor, *children]:
        if part.type == "LIGHT":
            bpy.data.objects.remove(part, do_unlink=True)
            continue
        for previous in list(part.users_collection):
            previous.objects.unlink(part)
        part_collection.objects.link(part)
    part_collection["pivot"] = (x, floor_height, depth)

architecture = collection("architecture")
architecture["pivot"] = (0.0, 0.0, 0.0)
block(architecture, "Foundation", 12, 10.25, -.27, 18.2, 12.7, .48, dark, .1)
planks = [materials[f"Oak floor | plank {i}"] for i in range(1, 8)]
for row in range(35):
    depth = 4 + (row + .5) * 12.5 / 35
    x = 3.0
    while x < 20.99:
        length = min(rng.uniform(.75, 1.65) if x == 3 else rng.uniform(1.6, 3.25), 21 - x)
        if 0 < 21 - x - length < .45:
            length = 21 - x
        block(architecture, "Oak plank", x + length / 2, depth, -.039, length - .026, .325, .077, rng.choice(planks), .011)
        x += length

glass = color_material("Home | blue window glass", (.15, .35, .51), .55)
moon = color_material("Home | window inlay", (.56, .75, .78), .67)
# Rear wall and three windows, with low foreground walls for the play camera.
block(architecture, "North limewash wall", 12, 3.92, 1.61, 18.15, .34, 3.22, wall)
for height, label in ((.13, "Skirting"), (.82, "Chair rail"), (3.18, "Top beam")):
    block(architecture, label, 12, 4.155, height, 18.15, .25, .16 if height < 2 else .28, dark)
for x in (3, 7.15, 10.99, 14.07, 17.94, 21):
    block(architecture, "North oak post", x, 4.10, 1.64, .26, .37, 3.28, dark, .035)
for x in (8.67, 12.55, 16.05):
    block(architecture, "Window casing", x, 4.18, 2.20, 1.50, .32, 1.53, dark, .055)
    block(architecture, "Blue window", x, 4.37, 2.2, 1.23, .047, 1.25, glass, .026)
    block(architecture, "Window sill", x, 4.36, 1.48, 1.65, .51, .13, trim, .045)
    block(architecture, "Window vertical lead", x, 4.41, 2.2, .065, .044, 1.31, brass)
    block(architecture, "Window horizontal lead", x, 4.41, 2.2, 1.29, .044, .064, brass)
    block(architecture, "Window reflected sky", x - .29, 4.40, 2.54, .27, .012, .094, moon)
for index in range(18):
    block(architecture, "Carved wainscot field", 3.5 + index, 4.18, .45, .85, .10, .48, oak)

# The interior partitions occupy the existing gameplay rectangles.
walls = [
    (3.0, 4, .18, 12.5, .42), (20.82, 4, .18, 12.5, .42),
    (10.71875, 4, .75, 4.53125, 1.12), (13.6875, 4, .75, 4.53125, 1.12),
    (3.0, 8.53125, 2.78125, .75, .64), (7.8125, 8.53125, 3.28125, .75, .64),
    (14.0625, 8.53125, 1.40625, .75, .64), (17.5, 8.53125, 3.5, .75, .64),
    (3.0, 16.42, 7.52, .18, .23), (13.48, 16.42, 7.52, .18, .23),
]
for x, z, width, depth, height in walls:
    location = (x + width / 2, z + depth / 2)
    block(architecture, "Cutaway wall", *location, height / 2, width, depth, height, wall, .024)
    block(architecture, "Oak cap", *location, height + .033, width + .03, depth + .025, .099, dark)
for x in (6.796875, 16.484375):
    block(architecture, "Interior doorway threshold", x, 8.90, .008, 2.02, .58, .04, trim)
block(architecture, "Entrance threshold", 12, 16.45, .008, 2.92, .30, .054, trim)
for x in (10.58, 13.42):
    block(architecture, "Entry cutaway post", x, 16.38, .37, .18, .24, .74, dark)


def furniture(slug, x, z):
    group = collection(slug)
    group["pivot"] = (x, 0.0, z)
    return group


bed = furniture("bedroom-bed", 17.34375, 7.21875)
x, z = 17.34375, 7.21875
block(bed, "Oak bed frame", x, z, .36, .99, 2.10, .25, dark, .067)
block(bed, "Linen mattress", x, z, .60, .94, 2.01, .32, linen, .10)
block(bed, "Folded blue quilt", x, z + .30, .77, .94, 1.36, .19, blue, .11)
block(bed, "Ivory pillow", x, z - .68, .83, .73, .40, .21, ivory, .10)
for edge in (-.42, .42):
    block(bed, "Quilt woven seam", x + edge, z + .33, .839, .035, 1.19, .032, gold)
for side in (-.42, .42):
    for end in (-.96, .96):
        height = 1.18 if end < 0 else .64
        block(bed, "Bed post", x + side, z + end, height / 2, .14, .16, height, oak)
        block(bed, "Polished bed-post cap", x + side, z + end, height, .17, .19, .12, trim, .04)
block(bed, "Headboard", x, z - .98, .82, .94, .13, .53, oak, .055)
block(bed, "Footboard", x, z + .98, .52, .94, .13, .32, oak, .055)

kitchen = furniture("kitchen-counter", 9.08, 5.33)
block(kitchen, "Kitchen dresser", 9.08, 5.33, .55, 3.23, 1.74, 1.05, oak, .055)
block(kitchen, "Worktop", 9.08, 5.33, 1.115, 3.41, 1.90, .16, trim, .056)
for x in (8.01, 9.08, 10.15):
    block(kitchen, "Kitchen cupboard door", x, 6.22, .51, .94, .095, .81, dark)
    block(kitchen, "Kitchen door panel", x, 6.28, .51, .75, .07, .64, oak)
    block(kitchen, "Drawer brass pull", x, 6.33, .73, .18, .11, .044, brass)
block(kitchen, "Cutting board", 8.47, 5.42, 1.221, .69, .56, .065, dark, .056)
block(kitchen, "Knife blade", 8.58, 5.40, 1.267, .42, .095, .033, iron)
block(kitchen, "Knife handle", 8.26, 5.40, 1.278, .21, .112, .055, oak)
for x, z, width, height, mat in ((9.43, 5.07, .42, .43, blue), (10.08, 5.19, .50, .31, ivory)):
    block(kitchen, "Counter ceramic jar", x, z, 1.2 + height / 2, width, width, height, mat, .13)
    block(kitchen, "Jar lid", x, z, 1.2 + height, width * .76, width * .76, .098, dark, .041)

table = furniture("living-worktable", 13.23, 10.59)
block(table, "Worktable top", 13.23, 10.59, .99, 2.60, 1.30, .16, trim, .065)
block(table, "Worktable apron", 13.23, 10.59, .84, 2.39, 1.12, .22, dark)
for x in (12.14, 14.32):
    for z in (10.09, 11.09):
        block(table, "Worktable timber leg", x, z, .43, .19, .21, .86, oak, .035)
block(table, "Planed wood blank", 12.74, 10.65, 1.115, 1.04, .35, .086, oak)
for z in (10.83, 10.95):
    block(table, "Gathered branch", 13.05, z, 1.13, .81, .074, .08, dark)
block(table, "Mallet handle", 13.98, 10.66, 1.12, .12, .55, .11, dark)
block(table, "Mallet head", 13.98, 10.40, 1.14, .41, .21, .15, oak, .041)

review = collection("Preview lighting and camera")
target = Vector((12, -10.18, 1.04))
camera_data = bpy.data.cameras.new("30-degree orthographic")
camera_data.type = "ORTHO"
camera_data.ortho_scale = 20.8
camera = bpy.data.objects.new("Review camera", camera_data)
review.objects.link(camera)
camera.location = target + Vector((0, -math.sqrt(3) * 12.0, 12))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = camera

for name, loc, aim, energy, color, size in (
    ("Warm window fill", (8, -8, 10), (12, -12, 0), 1850, (1.0, .87, .71), 10),
    ("Cool entrance fill", (21, -18, 8), (11, -10, 1), 1150, (.75, .85, 1.0), 9),
    ("Hearth warmth", (5.4, -6.3, 4.4), (8.3, -8.3, 0), 260, (1.0, .54, .21), 4),
):
    data = bpy.data.lights.new(name, "AREA")
    obj = bpy.data.objects.new(name, data)
    data.energy, data.color, data.size = energy, color, size
    review.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector(aim) - obj.location).to_track_quat("-Z", "Y").to_euler()

for workspace in bpy.data.workspaces:
    for screen in workspace.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"

scene.render.engine = "CYCLES"
scene.cycles.samples = 18
scene.cycles.use_denoising = True
scene.render.resolution_x = 1250
scene.render.resolution_y = 690
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(HERE / "preview-3d.png")
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "player-home.blend"), compress=True)
bpy.ops.render.render(write_still=True)
