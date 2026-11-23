"""Build the approved A study as an editable, two-layer player home in Blender."""

from pathlib import Path
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
INN = HERE.parent / "arcana-inn-interior/source/blender-v1/inn-lobby.blend"
if not bpy.app.background or Path(bpy.data.filepath).resolve() != INN:
    raise RuntimeError(f"Open {INN} in Blender background mode first.")

scene = bpy.context.scene
scene.name = "Arcana | Library Lane Home"
rng = random.Random(707)
materials = bpy.data.materials
oak = materials["Oak | honey"]
dark = materials["Oak | dark carved frames"]
trim = materials["Oak | polished trim"]
linen = materials["Textile | flax linen"]
plum = materials["Textile | deep plum velvet"]
blue = materials["Textile | lapis blue"]
gold = materials["Textile | antique gold"]
brass = materials["Brass | aged and polished"]
ivory = materials["Porcelain | warm ivory"]
iron = materials["Iron | blackened"]


def matte(name, hex_color, roughness=.68, emission=0.0):
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    rgb = [c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in srgb]
    mat = materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Emission Color"].default_value = mat.diffuse_color
    shader.inputs["Emission Strength"].default_value = emission
    return mat


plaster = matte("Library Lane | cream lime plaster", "DCC29E")
mortar = matte("Library Lane | mortar", "9F896D")
stone = [matte(f"Library Lane | limestone {i}", color) for i, color in enumerate(
    ["D0B899", "C4A98B", "DCC3A2", "C9B496", "BDA589"])]
slate = matte("Library Lane | blue slate", "41495E")
ink = matte("Library Lane | indigo wood paint", "303F57")
glass = matte("Library Lane | old glass", "567595", .23, .18)
glow = matte("Library Lane | amber flame", "FF9A46", .44, 3)
leaf = matte("Library Lane | leaf", "657649")
leaf_light = matte("Library Lane | fresh leaf", "8A9760")
flower = matte("Library Lane | lavender", "9674A0")
clay = matte("Library Lane | fired clay", "9C593D")
copper = matte("Library Lane | kettle copper", "B9794E", .35)


def collection(name, pivot=(0.0, 0.0, 0.0)):
    group = bpy.data.collections.new(name)
    scene.collection.children.link(group)
    group["pivot"] = pivot
    return group


def solid(group, name, x, depth, height, size, mat, bevel=.025, shape="box", angle=0.0):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if shape == "round":
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=16, radius1=.5, radius2=.5, depth=1)
    elif shape == "oval":
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=.5)
    else:
        bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((*size, 1))), verts=list(bm.verts))
    for face in bm.faces:
        face.smooth = shape == "oval"
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = (x, -depth, height)
    obj.rotation_euler.z = angle
    if bevel and shape != "oval":
        mod = obj.modifiers.new("Soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("Corner normals", "WEIGHTED_NORMAL")
    return obj


def box(group, name, x, z, y, w, d, h, mat, bevel=.025):
    return solid(group, name, x, z, y, (w, d, h), mat, bevel)


def oval(group, name, x, z, y, w, d, h, mat):
    return solid(group, name, x, z, y, (w, d, h), mat, 0.0, "oval")


def round_part(group, name, x, z, y, diameter, height, mat):
    return solid(group, name, x, z, y, (diameter, diameter, height), mat, .018, "round")


def beam(group, name, start, end, thickness, mat):
    a, b = (Vector((x, -z, y)) for x, z, y in (start, end))
    center = (a + b) / 2
    obj = box(group, name, center.x, -center.y, center.z, thickness, thickness, (b-a).length, mat, .018)
    obj.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    return obj


def plant(group, x, z, y, size=.34, bloom=False):
    round_part(group, "Clay pot", x, z, y + size * .38, size, size * .76, clay)
    round_part(group, "Pot rim", x, z, y + size * .69, size * 1.08, size * .15, clay)
    for index in range(7):
        a = index * math.tau / 7.0
        height = y + size * (1.35 + rng.random() * .67)
        reach = size * rng.uniform(.27, .64)
        dx, dz = math.cos(a) * reach, math.sin(a) * reach
        beam(group, "Herb stem", (x, z, y + size * .67), (x+dx, z+dz, height), .019, leaf)
        sprig = oval(group, "Leaf cluster", x+dx, z+dz, height-size*.12, size*.44, size*.27, size*.42, leaf_light if index % 2 else leaf)
        sprig.rotation_euler.y = .45
        if bloom:
            oval(group, "Lavender tip", x+dx, z+dz, height+size*.12, size*.30, size*.24, size*.43, flower)


reused = {
    "living-sofa": ("Lounge | Armchair", 18.78, 13.24, 1.72, 1.62, 1.0),
    "living-rug": ("Rug | hearth lounge", 16.45, 13.22, 6.30, 4.54, 1.0),
    "entry-rug": ("Rug | entry", 12.0, 15.06, 2.21, 1.08, 1.0),
    "living-bookcase": ("02 • Oak bookcase", 19.60, 9.83, 2.05, 1.04, .73),
}
keep = {data[0] for data in reused.values()}
for root in [node for node in scene.objects if node.parent is None and node.name not in keep]:
    for part in reversed(root.children_recursive):
        bpy.data.objects.remove(part, do_unlink=True)
    bpy.data.objects.remove(root, do_unlink=True)
for slug, (name, x, depth, width, length, vertical) in reused.items():
    anchor = bpy.data.objects[name]
    children = list(anchor.children_recursive)
    bounds = [node.matrix_world @ Vector(point) for node in children if node.type in {"MESH", "CURVE"} for point in node.bound_box]
    minimum = Vector(tuple(min(p[i] for p in bounds) for i in range(3)))
    maximum = Vector(tuple(max(p[i] for p in bounds) for i in range(3)))
    center = (minimum + maximum) / 2
    base = .019 if "rug" in slug else .008
    scale = Matrix.Diagonal(Vector((width/(maximum.x-minimum.x), length/(maximum.y-minimum.y), vertical, 1)))
    anchor.matrix_world = Matrix.Translation(Vector((x, -depth, base))) @ scale @ Matrix.Translation(-Vector((center.x, center.y, minimum.z))) @ anchor.matrix_world
    anchor.name = slug
    group = collection(slug, (x, base, depth))
    for part in [anchor, *children]:
        for previous in list(part.users_collection):
            previous.objects.unlink(part)
        group.objects.link(part)

lower = collection("architecture")
upper = collection("upper-walls")
cut = .57
wall_top = 2.72
box(lower, "Continuous foundation", 12, 10.25, -.24, 18.40, 12.91, .43, mortar, .07)
box(lower, "Blue slate foot rail", 12, 10.25, -.087, 18.44, 12.95, .120, slate, .028)
planks = [materials[f"Oak floor | plank {i}"] for i in range(1, 8)]
for row in range(32):
    depth = 4 + (row + .5) * 12.5 / 32
    x = 3.0
    while x < 20.99:
        length = min(rng.uniform(.76, 1.50) if x == 3 else rng.uniform(1.65, 3.45), 21-x)
        if 0 < 21 - x - length < .46:
            length = 21 - x
        box(lower, "Staggered oak plank", x + length / 2, depth, -.026, length-.024, .366, .052, rng.choice(planks), .010)
        x += length

# Shared XZ masonry ends and passages, in metres. Upper meshes start at the cut plane.
walls = [
    (2.73, 3.73, 18.54, .27, "Back"),
    (2.73, 4.00, .27, 12.50, "West"),
    (21.00, 4.00, .27, 12.50, "East"),
    (2.73, 16.50, 8.10, .27, "Street west"),
    (13.17, 16.50, 8.10, .27, "Street east"),
    (9.00, 4.00, .38, 6.78, "Kitchen partition rear"),
    (9.00, 13.20, .38, 3.30, "Kitchen partition front"),
    (9.38, 8.73, 5.71, .38, "Bedroom partition west"),
    (17.48, 8.73, 3.52, .38, "Bedroom partition east"),
]
for x, z, w, d, name in walls:
    cx, cz = x+w/2, z+d/2
    box(lower, name + " masonry below cut", cx, cz, cut/2, w, d, cut, stone[0], .014)
    box(lower, name + " oak skirting", cx, cz, .08, w+.044, d+.044, .16, dark, .016)
    box(lower, name + " low slate coping", cx, cz, cut, w+.055, d+.055, .075, slate, .016)
    box(upper, name + " lime plaster", cx, cz, (wall_top+cut)/2, w, d, wall_top-cut, plaster, .018)
    box(upper, name + " continuous slate wall cap", cx, cz, wall_top, w+.067, d+.067, .14, slate)
# Cutaway foundations meet a distinct entrance step.
box(lower, "Indigo door threshold", 12.0, 16.61, .008, 2.34, .62, .075, dark)
box(lower, "Limestone stoop", 12.0, 17.04, -.112, 2.66, .57, .23, stone[2], .045)
box(lower, "Limestone lower step", 12.0, 17.44, -.225, 2.90, .46, .17, stone[1], .045)
box(lower, "Bedroom oak threshold", 16.285, 8.92, .016, 2.39, .44, .051, trim)
box(lower, "Kitchen oak threshold", 9.19, 11.99, .016, .46, 2.42, .051, trim)
# Visible stone courses on the street front, controlled with the upper wall.
for start, end in ((2.75, 10.81), (13.19, 21.25)):
    for row in range(5):
        x = start
        first = .50 if row % 2 else .92
        first_piece = True
        while x < end-.01:
            size = min(end-x, first if first_piece else .93)
            box(upper, "Street limestone ashlar", x+size/2, 16.773, cut+.211+row*.423,
                size-.022, .049, .401, rng.choice(stone), .015)
            first_piece = False
            x += size
for x in (2.87, 21.13):
    box(upper, "Street corner pier", x, 16.60, (wall_top+cut)/2, .34, .46, wall_top-cut, stone[2], .026)
    box(upper, "Back corner upright", x, 3.88, (wall_top+cut)/2, .29, .29, wall_top-cut, dark)

# Door jambs and lintels are in the upper layer; the matching thresholds remain.
for x in (15.18, 17.39):
    box(upper, "Bedroom oak door jamb", x, 8.92, 1.19, .18, .54, 2.38, dark)
box(upper, "Bedroom oak lintel", 16.285, 8.92, 2.42, 2.39, .54, .22, trim)
for z in (10.88, 13.10):
    box(upper, "Kitchen oak door jamb", 9.19, z, 1.19, .53, .19, 2.38, dark)
box(upper, "Kitchen oak lintel", 9.19, 11.99, 2.42, .53, 2.42, .22, trim)
for x in (10.95, 13.05):
    box(upper, "Street indigo door jamb", x, 16.66, 1.30, .23, .49, 2.60, ink)
box(upper, "Entry limestone lintel", 12.0, 16.67, 2.67, 2.63, .49, .23, stone[2])
# Park the exterior door flush to its jamb, leaving the gameplay doorway open.
box(upper, "Front door held open", 11.02, 15.68, 1.24, .135, 1.90, 2.41, ink)
for y in (.54, 1.62):
    box(upper, "Recessed door panel", 11.10, 15.66, y, .047, 1.45, .62, slate)
oval(upper, "Front door brass knob", 11.14, 14.91, 1.03, .12, .11, .11, brass)


def window(x, z, y, street=False):
    # Individual frames, sills and glass are part of the architecture layer.
    face = 1 if street else -1
    box(upper, "Recessed indigo window surround", x, z, y, 1.68, .15, 1.28, ink, .04)
    box(upper, "Old blue window glass", x, z + face*.095, y, 1.39, .06, 1.02, glass, .02)
    box(upper, "Window sash vertical", x, z + face*.143, y, .066, .056, 1.06, ink)
    box(upper, "Window sash horizontal", x, z + face*.143, y, 1.45, .056, .07, ink)
    box(upper, "Stone window ledge", x, z + face*.13, y-.626, 1.77, .33, .12, stone[2])
    box(upper, "Window glass highlight", x-.43, z + face*.13, y+.28, .23, .016, .042, ivory, .008)


for x in (6.65, 16.44):
    window(x, 4.03, 1.87, True)
for x in (6.30, 17.50):
    window(x, 16.81, 1.61, True)
    box(upper, "Oak window flower box", x, 17.01, .95, 1.55, .41, .30, oak)
    for dx in (-.52, -.14, .24, .56):
        plant(upper, x+dx, 17.03, 1.10, .21, True)
beam(upper, "Kitchen diagonal oak brace", (3.16, 4.24, 1.60), (5.19, 4.24, 2.56), .16, trim)
box(upper, "Kitchen timber header", 6.18, 4.25, 2.56, 6.05, .26, .22, dark)
box(upper, "Brass front lantern arm", 13.64, 16.91, 1.94, .16, .33, .098, iron)
box(upper, "Street lantern glass", 13.64, 17.03, 1.65, .23, .24, .30, glow)
for y in (1.47, 1.83):
    box(upper, "Street lantern brass cap", 13.64, 17.03, y, .29, .30, .067, iron)
for x in (13.52, 13.76):
    box(upper, "Street lantern post", x, 17.17, 1.65, .027, .026, .34, iron)
plant(lower, 10.44, 17.03, -.04, .38, True)
box(upper, "Small landscape frame", 12.03, 9.13, 1.86, 1.13, .096, .71, dark)
box(upper, "Mounted landscape paper", 12.03, 9.19, 1.86, .96, .042, .55, linen)
box(upper, "Landscape afternoon sky", 12.03, 9.218, 1.93, .77, .017, .26, glass)
box(upper, "Landscape distant hill", 12.03, 9.224, 1.76, .77, .017, .11, leaf)
for x in (5.53, 6.12, 6.72, 7.32):
    beam(upper, "Hanging kitchen herb tie", (x, 4.30, 2.46), (x, 4.34, 2.24), .027, trim)
    for dx in (-.095, 0.0, .095):
        oval(upper, "Hanging herb sprig", x+dx, 4.40, 2.16, .12, .085, .34, leaf if x < 7 else leaf_light)

stove = collection("kitchen-hearth", (3.82, 0, 12.52))
box(stove, "Iron range body", 3.82, 12.52, .59, 1.45, 1.24, 1.17, iron, .07)
box(stove, "Range top", 3.82, 12.52, 1.205, 1.55, 1.34, .145, iron, .04)
box(stove, "Firebox brass frame", 4.56, 12.55, .54, .075, .79, .59, brass)
box(stove, "Firebox pane", 4.606, 12.55, .53, .026, .64, .45, dark)
oval(stove, "Flame volume warm core", 4.63, 12.58, .43, .05, .29, .18, glow)
round_part(stove, "Front iron burner", 3.88, 12.61, 1.292, .54, .034, dark)
oval(stove, "Copper kettle", 3.88, 12.62, 1.51, .54, .58, .46, copper)
round_part(stove, "Copper kettle lid", 3.88, 12.62, 1.735, .30, .061, brass)
beam(stove, "Kettle spout", (4.07, 12.67, 1.49), (4.27, 12.83, 1.64), .105, copper)
for x in (3.32, 4.28):
    for z in (12.03, 13.0):
        box(stove, "Iron foot", x, z, .11, .15, .16, .24, iron)
box(stove, "Iron stove pipe", 3.31, 12.08, 1.82, .17, .18, 1.2, iron)

kitchen = collection("kitchen-counter", (3.82, 0, 8.61))
box(kitchen, "Oak counter case", 3.82, 8.61, .53, 1.45, 5.78, 1.04, dark)
box(kitchen, "Ivory worktop", 3.82, 8.61, 1.095, 1.57, 5.89, .14, ivory)
for z in (6.31, 7.45, 8.58, 9.72, 10.86):
    box(kitchen, "Oak cupboard panel", 4.56, z, .51, .095, .98, .78, oak)
    box(kitchen, "Cupboard inset", 4.615, z, .51, .036, .80, .61, trim)
    box(kitchen, "Brass cupboard handle", 4.659, z, .77, .065, .22, .055, brass)
box(kitchen, "Sink basin", 3.80, 8.86, 1.175, .94, .80, .042, stone[1], .052)
beam(kitchen, "Faucet stem", (3.34, 8.86, 1.15), (3.34, 8.86, 1.62), .071, brass)
beam(kitchen, "Faucet spout", (3.34, 8.86, 1.62), (3.66, 8.86, 1.62), .063, brass)
box(kitchen, "Oak cutting board", 3.86, 10.42, 1.20, .87, .82, .064, trim)
round_part(kitchen, "Stoneware bowl", 3.88, 10.42, 1.30, .50, .16, clay)
apple = matte("Library Lane | apple skin", "AA5141")
for x,z in ((3.75,10.32),(4.04,10.40),(3.82,10.53)):
    oval(kitchen,"Kitchen apple",x,z,1.43,.22,.20,.19,apple)
for z in (6.66, 7.29):
    round_part(kitchen, "Ceramic dry goods jar", 3.69, z, 1.42, .37, .43, ivory)
    round_part(kitchen, "Jar cap", 3.69, z, 1.66, .38, .065, blue)

shelf = collection("kitchen-shelf", (6.32, 0, 4.69))
for y in (.18, .78, 1.38, 2.02):
    box(shelf, "Kitchen store shelf", 6.32, 4.69, y, 2.87, .92, .12, trim)
for x in (4.99, 7.65):
    box(shelf, "Kitchen shelf upright", x, 4.69, 1.13, .13, .93, 2.26, dark)
for x,y,mat in ((5.31,.24,clay),(6.06,.84,ivory),(6.88,.84,clay),(5.48,1.44,ivory),(6.35,1.44,blue),(7.20,1.44,ivory),(6.63,2.08,ivory)):
    round_part(shelf, "Pantry pottery", x, 4.70, y+.17, .44, .34, mat)
    round_part(shelf, "Pantry pottery lid", x, 4.70, y+.34, .40, .045, trim)
plant(shelf, 5.45, 4.68, 2.08, .42)

bed = collection("bedroom-bed", (18.66, 0, 6.12))
box(bed, "Oak bed frame", 18.66, 6.12, .37, 1.74, 2.86, .24, dark, .065)
box(bed, "Linen mattress", 18.66, 6.12, .61, 1.68, 2.78, .31, linen, .11)
box(bed, "Patchwork quilt base", 18.66, 6.52, .79, 1.68, 1.90, .15, blue, .075)
for ix in range(5):
    for iz in range(6):
        shade = (ivory, blue, gold, ivory)[(ix+iz*2) % 4]
        box(bed, "Quilt patch", 18.00+ix*.33, 5.78+iz*.30, .872, .321, .292, .025, shade, .009)
box(bed, "Quilt binding", 18.66, 7.42, .835, 1.68, .070, .125, blue, .028)
box(bed, "Linen pillow", 18.66, 5.16, .84, 1.27, .49, .23, ivory, .11)
for x in (17.84, 19.48):
    for z,h in ((4.77,1.31),(7.46,.62)):
        box(bed, "Rounded oak post", x, z, h/2, .14, .14, h, oak)
        oval(bed, "Oak finial", x, z, h+.023, .19, .19, .17, trim)
box(bed, "Shaped wooden headboard", 18.66, 4.77, 1.01, 1.74, .15, .56, oak, .082)
box(bed, "Wooden footboard", 18.66, 7.46, .49, 1.68, .14, .40, dark, .045)

wardrobe = collection("bedroom-wardrobe", (11.18, 0, 5.08))
box(wardrobe, "Tall oak wardrobe", 11.18, 5.08, 1.15, 1.70, 1.50, 2.28, dark, .045)
box(wardrobe, "Wardrobe crown", 11.18, 5.08, 2.34, 1.85, 1.63, .17, trim)
for x in (10.79, 11.57):
    box(wardrobe, "Raised wardrobe door", x, 5.84, 1.10, .73, .089, 1.86, oak)
    box(wardrobe, "Wardrobe recessed panel", x, 5.903, 1.10, .60, .055, 1.65, dark)
    box(wardrobe, "Wardrobe field", x, 5.946, 1.13, .52, .047, 1.52, oak)
    oval(wardrobe, "Wardrobe brass knob", x + (.20 if x < 11 else -.20), 5.981, 1.07, .09, .09, .09, brass)
plant(wardrobe, 10.93, 5.17, 2.44, .37)

lamp = collection("bedroom-lamp", (16.74, 0, 4.87))
box(lamp, "Bedside cabinet", 16.74, 4.87, .42, 1.07, .91, .83, dark, .04)
box(lamp, "Oak bedside top", 16.74, 4.87, .87, 1.17, .99, .11, trim)
box(lamp, "Cabinet drawer", 16.74, 5.34, .65, .91, .054, .29, oak)
oval(lamp, "Bedside drawer handle", 16.74, 5.38, .65, .15, .09, .075, brass)
round_part(lamp, "Lamp brass foot", 16.78, 4.89, .95, .34, .065, brass)
round_part(lamp, "Lamp stem", 16.78, 4.89, 1.13, .075, .35, brass)
oval(lamp, "Lamp luminous linen shade", 16.78, 4.89, 1.46, .46, .43, .47, matte("Library Lane | lit linen", "F2CA89", .75, .65))

table = collection("living-worktable", (13.80, 0, 12.32))
box(table, "Craft table top", 13.8, 12.32, 1.02, 2.59, 1.46, .14, trim, .049)
box(table, "Craft table apron", 13.8, 12.32, .88, 2.41, 1.25, .20, dark)
for x in (12.67, 14.93):
    for z in (11.78, 12.86):
        box(table, "Square oak table leg", x, z, .45, .16, .16, .89, oak)
box(table, "Leather school journal", 14.43, 12.35, 1.155, .57, .42, .105, dark)
box(table, "Journal page edges", 14.43, 12.37, 1.153, .51, .405, .057, linen)
box(table, "Journal brass clasp", 14.49, 12.58, 1.188, .17, .07, .052, brass)
round_part(table, "Pen pot", 13.02, 12.17, 1.22, .29, .29, blue)
for i in range(5):
    beam(table, "Pencil or brush", (13.02, 12.17, 1.22), (12.89+i*.067, 12.16, 1.57+rng.random()*.22), .031, trim)
plant(table, 13.68, 12.00, 1.10, .32, True)

stool = collection("living-stool", (13.80, 0, 13.65))
round_part(stool, "Oak stool seat", 13.80, 13.65, .53, .67, .13, oak)
for a in (0,2.094,4.188):
    dx,dz = math.cos(a), math.sin(a)
    beam(stool, "Splayed stool leg", (13.80+dx*.28, 13.65+dz*.28, .02), (13.80+dx*.19, 13.65+dz*.19, .52), .083, dark)

plantpot = collection("living-planter", (20.28, 0, 14.44))
plant(plantpot, 20.28, 14.44, .006, .58)

def woven_rug(name, x, z, width, length, fabric, border):
    rug = collection(name, (x, 0.018, z))
    box(rug, "Linen rug backing", x, z, .018, width, length, .027, border, .015)
    box(rug, "Woven rug field", x, z, .035, width-.19, length-.19, .015, fabric, .012)
    for edge in (-1, 1):
        box(rug, "Woven lengthwise border", x+edge*(width/2-.13), z, .046, .035, length-.32, .011, border)
        box(rug, "Woven end band", x, z+edge*(length/2-.21), .046, width-.24, .059, .011, border)
        for i in range(13):
            dx = (i/12-.5)*(width-.20)
            box(rug, "Short rug fringe", x+dx, z+edge*(length/2+.039), .016, .034, .088, .025, linen, .008)
    for i in (-1, 0, 1):
        solid(rug, "Woven diamond", x, z+i*length*.23, .045, (.24, .24, .011), linen, .005, angle=math.pi/4)


woven_rug("kitchen-runner", 6.16, 9.10, 1.53, 5.67,
    matte("Library Lane | rust runner", "9E604C"), gold)
woven_rug("bedroom-rug", 15.20, 6.47, 2.01, 3.54,
    matte("Library Lane | bedroom straw weave", "BAA47E"), blue)
books = bpy.data.collections["living-bookcase"]
for index, (width, mat) in enumerate(((.64, dark), (.56, blue), (.48, linen))):
    box(books, "Stacked book cover", 18.92, 10.56, .073 + index*.127, width, .49, .116, mat, .018)
    box(books, "Stacked book pages", 18.92, 10.81, .074 + index*.127, width-.09, .031, .071, ivory, .01)

review = bpy.data.collections.new("Review lighting and camera")
scene.collection.children.link(review)
aim = Vector((12, -10.40, 1.14))
camera_data = bpy.data.cameras.new("Arcana orthographic review")
camera_data.type = "ORTHO"
camera_data.ortho_scale = 21.9
camera = bpy.data.objects.new("Review camera", camera_data)
review.objects.link(camera)
camera.location = aim+Vector((0, -24, 20))
camera.rotation_euler = (aim-camera.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = camera
for name, location, energy, color, size in (
    ("Soft amber afternoon", (7, -10, 10), 1800, (1, .83, .65), 10),
    ("Quiet outdoor fill", (21, -20, 11), 1400, (.80, .87, 1), 12),
):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.color, data.size = energy, color, size
    obj = bpy.data.objects.new(name, data)
    review.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (aim-obj.location).to_track_quat("-Z", "Y").to_euler()

for workspace in bpy.data.workspaces:
    for screen in workspace.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"

scene.render.engine = "CYCLES"
scene.cycles.samples = 18
scene.cycles.use_denoising = True
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = "//campus-a-blender.png"
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "player-home-campus-a.blend"), compress=True)
bpy.ops.render.render(write_still=True)
