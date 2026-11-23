"""Build Arcana's inn lobby in a fresh Blender process and render the review camera."""

import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector


if not bpy.app.background:
    raise RuntimeError("Run the inn builder in a separate Blender background process.")

OUT = Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Arcana | Inn Lobby"
scene.unit_settings.system = "METRIC"
scene.render.engine = "CYCLES"
scene.cycles.samples = 36
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.resolution_x = 1440
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = 0.15
bpy.context.preferences.filepaths.save_version = 0

rng = random.Random(312)
parents = []
mesh_cache = {}


def linear_color(hexcolor):
    digits = hexcolor.lstrip("#")
    srgb = [int(digits[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4
                 for value in srgb)


def material(name, hexcolor, roughness=.65, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    color = (*linear_color(hexcolor), 1)
    mat.diffuse_color = color
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat


def grain(mat, scale, strength, low=.62, high=1.22):
    tree = mat.node_tree
    shader = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    base = tuple(shader.inputs["Base Color"].default_value)
    coord = tree.nodes.new("ShaderNodeTexCoord")
    stretch = tree.nodes.new("ShaderNodeVectorMath")
    stretch.operation = "MULTIPLY"
    stretch.inputs[1].default_value = scale
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1
    noise.inputs["Detail"].default_value = 2.5
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = .14
    ramp.color_ramp.elements[0].color = (*(value * low for value in base[:3]), 1)
    ramp.color_ramp.elements[1].position = .88
    ramp.color_ramp.elements[1].color = (*(value * high for value in base[:3]), 1)
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = .022
    tree.links.new(coord.outputs["Object"], stretch.inputs[0])
    tree.links.new(stretch.outputs["Vector"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], ramp.inputs[0])
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])


def glow(name, hexcolor, strength):
    mat = material(name, hexcolor, .48)
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Emission Color"].default_value = mat.diffuse_color
    shader.inputs["Emission Strength"].default_value = strength
    return mat


def attach(obj):
    if not obj.users_collection:
        collection = parents[-1].users_collection[0] if parents else scene.collection
        collection.objects.link(obj)
    if parents:
        obj.parent = parents[-1]
        obj.matrix_parent_inverse = parents[-1].matrix_world.inverted()
    return obj


def group(name, loc=(0, 0, 0)):
    anchor = bpy.data.objects.new(name, None)
    anchor.location = loc
    anchor.empty_display_size = .15
    if not parents:
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        collection.objects.link(anchor)
    attach(anchor)
    bpy.context.view_layer.update()
    parents.append(anchor)
    return anchor


def finish_group():
    parents.pop()


def primitive(name, kind, loc, size, mat, bevel=0, rot=0, vertices=24):
    key = (kind, tuple(round(d, 6) for d in size), mat.name, vertices)
    mesh = mesh_cache.get(key)
    if mesh is None:
        bm = bmesh.new()
        if kind == "box":
            bmesh.ops.create_cube(bm, size=1)
        elif kind == "cylinder":
            bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=vertices,
                                  radius1=.5, radius2=.5, depth=1)
        else:
            bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=.5)
        bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((*size, 1))), verts=list(bm.verts))
        for face in bm.faces:
            face.smooth = kind == "sphere" or (kind == "cylinder" and len(face.verts) == 4)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        mesh.materials.append(mat)
        mesh_cache[key] = mesh
    obj = bpy.data.objects.new(name, mesh)
    obj.location = loc
    obj.rotation_euler.z = rot
    attach(obj)
    if bevel:
        mod = obj.modifiers.new("Rounded edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod = obj.modifiers.new("Weighted corner normals", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
    return obj


def box(name, loc, size, mat, bevel=0, rot=0):
    return primitive(name, "box", loc, size, mat, bevel, rot)


def cyl(name, loc, radius, depth, mat, vertices=24, bevel=0):
    return primitive(name, "cylinder", loc, (2 * radius, 2 * radius, depth), mat, bevel,
                     vertices=vertices)


def ball(name, loc, size, mat, rot=0):
    return primitive(name, "sphere", loc, size, mat, rot=rot)


def path(name, points, radius, mat, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, position in zip(spline.points, points):
        point.co = (*position, 1)
    spline.use_cyclic_u = cyclic
    curve.materials.append(mat)
    return attach(bpy.data.objects.new(name, curve))


def point(name, loc, color, power, radius):
    data = bpy.data.lights.new(name, "POINT")
    data.color = color
    data.energy = power
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    return attach(obj)


wood = material("Oak | honey", "895431", .54)
dark_wood = material("Oak | dark carved frames", "482D26", .55)
trim = material("Oak | polished trim", "A6693B", .46)
gold = material("Textile | antique gold", "C38A41", .84)
brass = material("Brass | aged and polished", "BB813A", .32, .63)
iron = material("Iron | blackened", "302B30", .41, .48)
plum = material("Textile | deep plum velvet", "623853", .86)
plum_light = material("Textile | plum cushions", "79455D", .84)
blue = material("Textile | lapis blue", "33476F", .88)
linen = material("Textile | flax linen", "D9BB85", .91)
cream = material("Porcelain | warm ivory", "E8D6B2", .31)
clay = material("Ceramics | dark earthenware", "794C3B", .65)
plaster = material("Limewash | warm cream", "E1BD87", .91)
shadow_wood = material("Oak | recessed shadow", "43291E", .77)
for mat in (wood, dark_wood, trim):
    grain(mat, (2.4, 29, 22), .25)
for mat in (plum, plum_light, blue, linen, gold):
    grain(mat, (75, 75, 75), .14, .79, 1.19)
grain(plaster, (11, 11, 11), .29, .79, 1.11)


group("Architecture | oak floor")
box("Floor foundation", (0, 0, -.24), (15.03, 10.53, .45), dark_wood, .07)
planks = [material(f"Oak floor | plank {i}", color, .58) for i, color in enumerate(
    ("A56B40", "98603B", "AD774A", "945C39", "B17C4D", "A66A3E", "AA7348"), 1)]
for mat in planks:
    grain(mat, (1.4, 48, 20), .27, .68, 1.20)
# Five display pixels at the shader lab's 100% zoom and 30-degree pitch.
plank_end_gap = 5.0 * 16.7 / (1614.0 * 3.0)
plank_row_gap = plank_end_gap / 0.5
for row in range(37):
    row_width = 10.48 / 37
    y = -5.24 + (row + .5) * row_width
    x = -7.49
    while x < 7.49 - .001:
        length = min(rng.uniform(.72, 1.80) if x == -7.49 else rng.uniform(1.25, 3.15), 7.49 - x)
        if 0 < 7.49 - x - length < .44:
            length = 7.49 - x
        box("Staggered oak plank", (x + length / 2, y, -.033),
            (length - plank_end_gap, row_width - plank_row_gap, .066), rng.choice(planks), .007)
        x += length
finish_group()


def panel_run(name, x1, x2, y, top, count):
    width = (x2 - x1) / count
    box(f"{name} backing", ((x1 + x2) / 2, y, top / 2), (x2 - x1, .16, top), dark_wood, .018)
    for index in range(count):
        x = x1 + (index + .5) * width
        box(f"{name} recessed panel", (x, y - .087, .47 * top), (.79 * width, .03, .66 * top),
            shadow_wood, .019)
        box(f"{name} panel insert", (x, y - .106, .47 * top), (.63 * width, .035, .52 * top),
            wood, .024)
        points = [(x - width * .24, y - .133, .23 * top),
                  (x - width * .24, y - .133, .51 * top)]
        points += [(x + width * .24 * math.cos(math.pi - i * math.pi / 8), y - .133,
                    (.51 + .16 * math.sin(i * math.pi / 8)) * top) for i in range(1, 9)]
        points.append((x + width * .24, y - .133, .23 * top))
        path(f"{name} carved arch", points, .009, dark_wood, True)
    for z, depth, height, mat in ((.055, .22, .11, shadow_wood), (top - .07, .22, .10, trim),
                                  (top + .008, .25, .065, dark_wood)):
        box(f"{name} rail", ((x1 + x2) / 2, y, z), (x2 - x1 + .035, depth, height), mat, .019)


group("Architecture | plaster and timber back wall")
box("Cream plaster back wall", (0, 5.31, 1.67), (14.86, .42, 3.34), plaster, .033)
panel_run("Back wainscot", -7.43, 7.43, 5.08, .93, 25)
box("Crown beam", (0, 5.14, 3.34), (14.92, .38, .22), dark_wood, .026)
box("Crown beam edge", (0, 4.941, 3.36), (14.87, .065, .045), trim, .012)
box("Wall cap", (0, 5.25, 3.49), (15.0, .63, .12), wood, .035)
for x in (-7.27, -3.87, -.45, 3.01, 7.27):
    box("Wall post", (x, 4.99, 1.73), (.30, .34, 3.45), dark_wood, .027)
    box("Post face molding", (x, 4.802, 1.73), (.22, .07, 2.55), wood, .021)
    box("Post inner panel", (x, 4.761, 1.78), (.10, .024, 1.93), dark_wood, .012)
    for z, width, depth, height, mat in ((.11, .41, .44, .22, shadow_wood),
                                        (.90, .39, .39, .12, trim), (3.03, .34, .39, .25, wood),
                                        (3.38, .44, .49, .12, trim), (3.51, .46, .55, .14, dark_wood)):
        box("Post molding", (x, 4.93, z), (width, depth, height), mat, .025)
    path("Post carved emblem", [(x - .083, 4.733, 3.00), (x, 4.721, 2.90),
                                 (x + .083, 4.733, 3.00), (x, 4.723, 3.082)], .012, trim, True)
finish_group()

group("Architecture | cutaway entrance")
for start, end in ((-7.49, -1.25), (1.25, 7.49)):
    panel_run("Cutaway front wall", start, end, -5.10, .51, 11)
    box("Cutaway top cap", ((start + end) / 2, -5.10, .55),
        (end - start, .35, .10), wood, .022)
for x in (-1.36, 1.36):
    box("Entry newel", (x, -5.10, .39), (.27, .33, .78), dark_wood, .028)
    box("Entry newel cap", (x, -5.10, .78), (.35, .36, .10), trim, .026)
box("Entry oak threshold", (0, -5.14, -.018), (2.41, .41, .075), trim, .021)
for x in (-7.42, 7.42):
    box("Side cutaway edge", (x, -.03, .018), (.15, 10.14, .10), dark_wood, .018)
finish_group()


def rug(name, x, y, width, depth, field):
    group(name, (x, y, 0))
    edge = material(name + " | binding", "35243C", .95)
    box("Bound backing", (x, y, .021), (width, depth, .035), edge, .014)
    box("Woven field", (x, y, .040), (width - .06, depth - .06, .012), field, .005)
    vertices, faces = [], []

    def tile(cx, cy, w, d, angle=0):
        i = len(vertices)
        c, s = math.cos(angle), math.sin(angle)
        vertices.extend((x + cx + dx * c - dy * s, y + cy + dx * s + dy * c, .047)
                        for dx, dy in ((-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2)))
        faces.append((i, i + 1, i + 2, i + 3))

    for inset, line_width in ((.079, .028), (.155, .016), (.239, .023)):
        for side in (-1, 1):
            tile(0, side * (depth / 2 - inset), width - 2 * inset, line_width)
            tile(side * (width / 2 - inset), 0, line_width, depth - 2 * inset)
    for length, cross, vertical in ((width, depth, False), (depth, width, True)):
        for side in (-1, 1):
            for index in range(int((length - .56) / .135) + 1):
                t = -.5 * length + .28 + index * .135
                n = side * (cross / 2 - .197)
                tile(n, t, .037, .037, math.pi / 4) if vertical else tile(t, n, .037, .037, math.pi / 4)
    for dx in (-1, 1):
        for dy in (-1, 1):
            px, py = dx * (width / 2 - .32), dy * (depth / 2 - .32)
            tile(px, py, .17, .044)
            tile(px, py, .044, .17)
            tile(px - dx * .12, py - dy * .12, .058, .058, math.pi / 4)
    unit = min(width, depth) / 7
    for i in range(4):
        angle = i * math.pi / 2
        c, s = math.cos(angle), math.sin(angle)
        for distance, w, d in ((.46, .38, .38), (.95, .47, .27), (1.38, .18, .18)):
            tile(distance * unit * c, distance * unit * s, w * unit, d * unit, angle + math.pi / 4)
        for step in (-1, 1):
            tile(unit * (.80 * c - step * .28 * s), unit * (.80 * s + step * .28 * c),
                 .27 * unit, .13 * unit, angle - step * math.pi / 4)
    tile(0, 0, .59 * unit, .59 * unit, math.pi / 4)
    mesh = bpy.data.meshes.new("Woven gold geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(gold)
    attach(bpy.data.objects.new("Gold woven borders and medallion", mesh))
    finish_group()


rug_plum = material("Textile | aubergine rugs", "43294B", .97)
rug_indigo = material("Textile | midnight indigo runners", "2D2E50", .97)
for field in (rug_plum, rug_indigo):
    grain(field, (112, 112, 80), .22, .69, 1.21)
rug("Rug | hearth lounge", -4.58, -2.18, 5.70, 3.61, rug_plum)
rug("Rug | reception", 3.81, .65, 2.48, 1.06, rug_indigo)
rug("Rug | back bench", -.30, 2.83, 2.34, 1.10, rug_indigo)
rug("Rug | entry", 0, -4.54, 2.40, 1.00, rug_indigo)


def lathe(name, loc, profile, mat, sides=32):
    x, y, z = loc
    verts = [(x + radius * math.cos(i * math.tau / sides),
              y + radius * math.sin(i * math.tau / sides), z + height)
             for height, radius in profile for i in range(sides)]
    faces = [(row * sides + i, row * sides + (i + 1) % sides,
              (row + 1) * sides + (i + 1) % sides, (row + 1) * sides + i)
             for row in range(len(profile) - 1) for i in range(sides)]
    faces.extend((tuple(range(sides - 1, -1, -1)), tuple(range(len(verts) - sides, len(verts)))))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return attach(bpy.data.objects.new(name, mesh))


lamp_glass = glow("Lantern | amber glass", "FFB85F", 3.2)
shade = glow("Lamp | parchment shade", "F1BB72", 1.3)


def lantern(name, x, y, z, wall=False):
    group(name, (x, y, z))
    if wall:
        box("Sconce mount", (x, y + .175, z + .23), (.16, .08, .26), iron, .018)
        path("Forged wall bracket", [(x, y + .16, z + .31), (x, y, z + .46),
                                    (x, y - .04, z + .37)], .024, brass)
    cyl("Lantern foot", (x, y, z + .03), .122, .06, brass, 8, .010)
    cyl("Glowing lantern body", (x, y, z + .175), .083, .254, lamp_glass, 6)
    for i in range(6):
        angle = i * math.tau / 6
        dx, dy = .087 * math.cos(angle), .087 * math.sin(angle)
        cyl("Lantern cage rod", (x + dx, y + dy, z + .17), .011, .278, brass, 8)
    lathe("Lantern roof", (x, y, z), [(.28, .11), (.31, .13), (.38, .055), (.40, .035)], brass, 8)
    ball("Lantern finial", (x, y, z + .425), (.064, .064, .069), brass)
    point("Lantern light", (x, y - .20, z + .20), (1, .55, .25), 51 if wall else 21, .20)
    finish_group()


def lamp_table(name, x, y):
    group(name, (x, y, 0))
    for i in range(3):
        angle = i * math.tau / 3
        dx, dy = math.cos(angle), math.sin(angle)
        path("Curved oak foot", [(x, y, .28), (x + .15*dx, y + .15*dy, .24),
                                 (x + .25*dx, y + .25*dy, .10), (x + .31*dx, y + .31*dy, .045)], .046, dark_wood)
        ball("Foot end", (x + .31*dx, y + .31*dy, .04), (.10, .10, .075), trim)
    lathe("Turned pedestal", (x, y, 0), [(.10, .08), (.25, .115), (.31, .14), (.39, .09),
                                          (.51, .14), (.58, .11)], dark_wood)
    cyl("Round oak top", (x, y, .61), .36, .11, wood, 32, .021)
    cyl("Tabletop rim", (x, y, .647), .354, .030, trim, 32, .009)
    lathe("Brass lamp stem", (x, y, .66), [(0, .12), (.025, .12), (.044, .085),
          (.075, .063), (.126, .070), (.17, .045), (.32, .027), (.36, .058)], brass)
    lathe("Pleated lamp shade", (x, y, .66), [(.252, .165), (.27, .165), (.33, .135),
          (.43, .094), (.49, .084)], shade, 20)
    for z, radius in ((.918, .166), (1.15, .084)):
        path("Woven shade binding", [(x + radius * math.cos(i * math.tau / 20),
             y + radius * math.sin(i * math.tau / 20), z) for i in range(20)], .007, brass, True)
    ball("Brass shade finial", (x, y, 1.169), (.051, .051, .07), brass)
    point("Soft amber light", (x, y - .13, 1.09), (1, .62, .30), 54, .23)
    finish_group()


lantern("Sconce | west post", -.45, 4.62, 2.12, True)
lantern("Sconce | east post", 7.27, 4.62, 2.12, True)
lantern("Entry lantern | left", -1.36, -5.10, .83)
lantern("Entry lantern | right", 1.36, -5.10, .83)
lamp_table("Lamp table | sofa arm", -2.13, -.59)
lamp_table("Lamp table | lounge edge", -7.01, -2.74)
lamp_table("Lamp table | luggage nook", 5.92, -2.27)


leaf_materials = [material(f"Plant | leaf {index}", color, .73)
                  for index, color in enumerate(("394E28", "4E6332", "66763B", "78944D"), 1)]
pot_blue = material("Ceramics | deep blue glaze", "3F5261", .37)
soil = material("Potting soil", "382A25", .96)


def potted_plant(name, x, y, scale):
    group(name, (x, y, 0))
    profile = [(z*scale, r*scale) for z, r in
               ((0, .205), (.038, .212), (.06, .23), (.21, .31), (.30, .30),
                (.32, .32), (.36, .32), (.38, .28), (.32, .265), (.29, .23))]
    lathe("Glazed leaf pot", (x, y, 0), profile, pot_blue)
    cyl("Soil", (x, y, .316 * scale), .263 * scale, .015, soil)
    path("Incised pot rim", [(x + .318*scale*math.cos(i*math.tau/28),
         y + .318*scale*math.sin(i*math.tau/28), .342*scale) for i in range(28)], .013*scale, brass, True)
    vertices, faces, indices = [], [], []
    for index in range(24):
        angle = index * 2.39996
        direction = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-direction.y, direction.x, 0))
        start = Vector((x, y, .34*scale)) + direction * rng.uniform(.025, .11) * scale
        root = start + direction * rng.uniform(.11, .27) * scale + Vector((0, 0, rng.uniform(.17, .58)*scale))
        length, width = rng.uniform(.26, .52)*scale, rng.uniform(.074, .137)*scale
        tip = root + direction * length + Vector((0, 0, rng.uniform(-.20, .10)*scale))
        path("Plant stems", [start, start.lerp(root, .66) + Vector((0, 0, .032)), root],
             .013*scale, leaf_materials[0])
        n = len(vertices)
        vertices.extend((root, root.lerp(tip, .35) + side*width, root.lerp(tip, .69) + side*width*.71,
                         tip, root.lerp(tip, .69) - side*width*.71, root.lerp(tip, .35) - side*width,
                         root.lerp(tip, .44) + Vector((0, 0, .105*scale))))
        for a in range(6):
            faces.append((n + a, n + (a+1)%6, n + 6))
            indices.append(rng.randrange(len(leaf_materials)))
    mesh = bpy.data.meshes.new("Faceted foliage")
    mesh.from_pydata(vertices, [], faces)
    for mat in leaf_materials:
        mesh.materials.append(mat)
    for polygon, index in zip(mesh.polygons, indices):
        polygon.material_index = index
    attach(bpy.data.objects.new("Editable faceted foliage", mesh))
    finish_group()


for spec in (("Plant | hearth end", -7.04, 3.17, .87), ("Plant | lounge end", -7.01, -3.84, .81),
             ("Plant | bench end", 1.48, 4.35, .77), ("Plant | front corner", 6.78, -4.50, 1.04)):
    potted_plant(*spec)


for module in ("inn_hearth.py", "inn_lounge.py", "inn_reception.py"):
    source = OUT / module
    exec(compile(source.read_text(encoding="utf-8-sig"), str(source), "exec"), globals())


def area(name, loc, target, color, power, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return attach(obj)


group("Lighting and review camera")
area("Warm ceiling bounce", (-2.4, -2.1, 8.5), (0, 1.5, 0), (1, .88, .73), 1150, 10)
area("Cool room fill", (5, -5.5, 5.8), (1, 2, 1.3), (.59, .68, 1), 520, 8)
area("Soft amber backfill", (4.5, 1.2, 6.4), (2.8, 4.5, 1.2), (1, .71, .45), 230, 5)
world = bpy.data.worlds.new("Black surround")
scene.world = world
world.use_nodes = True
background = next(node for node in world.node_tree.nodes if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0, 0, 0, 1)
camera_data = bpy.data.cameras.new("Arcana front orthographic 45°")
camera_data.type = "ORTHO"
camera_data.ortho_scale = 15.93
camera = bpy.data.objects.new(camera_data.name, camera_data)
target = Vector((0, .32, 1.41))
camera.location = target + Vector((0, -17, 17))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
attach(camera)
scene.camera = camera
finish_group()

for workspace in bpy.data.workspaces:
    for screen in workspace.screens:
        for view in screen.areas:
            if view.type == "VIEW_3D":
                view.spaces.active.region_3d.view_perspective = "CAMERA"
                view.spaces.active.overlay.show_overlays = False
                view.spaces.active.shading.color_type = "MATERIAL"

scene.render.filepath = "//inn-lobby.png"
blend_path = str(OUT / "inn-lobby.blend")
bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
bpy.ops.wm.open_mainfile(filepath=blend_path)
saved_scene = bpy.context.scene
print(f"Arcana inn reopened: {len(saved_scene.objects)} objects, camera {saved_scene.camera.name}", flush=True)
bpy.ops.render.render(write_still=True)
