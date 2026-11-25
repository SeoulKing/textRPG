import math

import bpy
from mathutils import Vector

from furniture import READING_TABLE_TOP


TAU = math.tau


def _point(coordinates):
    x, y, z = coordinates
    return x, -y, z


def _mesh(name, points, faces, materials, collection, face_materials=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([_point(point) for point in points], [], [tuple(reversed(face)) for face in faces])
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    for material in materials:
        data.materials.append(material)
    if face_materials is not None:
        for polygon, index in zip(data.polygons, face_materials):
            polygon.material_index = index
    return obj


def _strokes(name, paths, radius, material, collection):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 1
    data.bevel_depth = radius
    data.bevel_resolution = 1
    data.use_fill_caps = True
    data.materials.append(material)
    for points, cyclic in paths:
        spline = data.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, xyz in zip(spline.points, points):
            point.co = (*_point(xyz), 1.0)
        spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    return obj


def _ring_profile(name, center, profile, material, collection, segments=48):
    x, y = center
    points = [
        (x + radius * math.cos(TAU * segment / segments),
         y + radius * math.sin(TAU * segment / segments), z)
        for z, radius in profile for segment in range(segments)
    ]
    faces = [tuple(reversed(range(segments)))]
    for ring in range(len(profile) - 1):
        start = ring * segments
        for i in range(segments):
            previous = start + i
            following = start + (i + 1) % segments
            faces.append((previous, following, following + segments, previous + segments))
    faces.append(tuple(range(len(points) - segments, len(points))))
    return _mesh(name, points, faces, [material], collection)


def _ring_points(x, y, z, radius, count=56):
    return [
        (x + radius * math.cos(TAU * i / count), y + radius * math.sin(TAU * i / count), z)
        for i in range(count)
    ]


def _point_light(name, x, y, z, energy, radius, collection):
    data = bpy.data.lights.new(name, "POINT")
    data.energy = energy
    data.color = (1.0, 0.52, 0.21)
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    obj.location = _point((x, y, z))
    collection.objects.link(obj)


def _build_prism(api, stone, warm_stone, shadow_stone, brass, collection):
    x, y = 12.5, 10.25
    _ring_profile("Pedestal | stone plinth", (x, y),
                  [(0.015, 1.43), (0.07, 1.49), (0.15, 1.49), (0.21, 1.42)],
                  stone, collection)
    _ring_profile("Pedestal | carved relief band", (x, y),
                  [(0.15, 1.35), (0.19, 1.38), (0.47, 1.38), (0.51, 1.34)],
                  shadow_stone, collection)
    _ring_profile("Pedestal | bevelled display slab", (x, y),
                  [(0.47, 1.38), (0.51, 1.48), (0.62, 1.48),
                   (0.66, 1.43), (0.68, 1.32)],
                  warm_stone, collection)
    _ring_profile("Pedestal | inset tracing surface", (x, y),
                  [(0.68, 1.19), (0.685, 1.21)], stone, collection)

    joints = []
    reliefs = []
    for i in range(16):
        theta = i * TAU / 16
        outward = Vector((math.cos(theta), math.sin(theta)))
        sideways = Vector((-math.sin(theta), math.cos(theta)))
        for _, radius, z0, z1 in (
            (0, 1.482, 0.53, 0.61), (0, 1.492, 0.085, 0.147)
        ):
            px, py = Vector((x, y)) + outward * radius
            joints.append(([(px, py, z0), (px, py, z1)], False))
        for index, (u, z) in enumerate([(-0.13, 0.32), (0, 0.42), (0.13, 0.32), (0, 0.22)]):
            px, py = Vector((x, y)) + outward * 1.385 + sideways * u
            if index == 0:
                reliefs.append(([], True))
            reliefs[-1][0].append((px, py, z))
    _strokes("Pedestal | masonry seams", joints, 0.007, shadow_stone, collection)
    _strokes("Pedestal | geometric reliefs", reliefs, 0.012, stone, collection)
    _strokes("Pedestal | moulding", [
        (_ring_points(x, y, z, radius), True)
        for z, radius in [(0.19, 1.393), (0.505, 1.43), (0.646, 1.46)]
    ], 0.018, brass, collection)

    soft_gold = api.mat("Prism | engraved light", "#e8ae62", 0.15, 0.44, "#ffb451", 0.55)
    ring_marks = [(_ring_points(x, y, 0.693, radius, 72), True) for radius in (0.42, 0.78, 1.05)]
    for i in range(8):
        theta = i * TAU / 8
        c, s = math.cos(theta), math.sin(theta)
        ring_marks.append(([(x + c * 0.91, y + s * 0.91, 0.697),
                            (x + c * 1.13, y + s * 1.13, 0.697)], False))
    _strokes("Pedestal | prism calibration engraving", ring_marks, 0.012, soft_gold, collection)

    lower, upper, radius = 0.94, 2.44, 0.43
    profile = [(1.43, radius * 0.84, 0.0), (1.82, radius, 0.0)]
    vertices = [(x, y, lower)]
    vertices += [
        (x + r * math.cos(TAU * i / 6 + offset),
         y + r * math.sin(TAU * i / 6 + offset), z)
        for z, r, offset in profile for i in range(6)
    ]
    vertices.append((x, y, upper))
    faces = []
    for i in range(6):
        j = (i + 1) % 6
        faces.extend([(0, j + 1, i + 1), (i + 1, j + 1, j + 7, i + 7), (i + 7, j + 7, 13)])
    facets = [
        api.mat("Prism | clear amber facet", "#e09335", 0.17, 0.18, "#ffb541", 0.24),
        api.mat("Prism | honey facet", "#f2ba62", 0.25, 0.24, "#ffbd5f", 0.43),
        api.mat("Prism | dark golden facet", "#b36822", 0.31, 0.20, "#dd7b25", 0.13),
    ]
    for material in facets:
        shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        shader.inputs["Transmission Weight"].default_value = 0.28
        shader.inputs["IOR"].default_value = 1.46
    _mesh("Prism | floating amber crystal", vertices, faces, facets, collection,
          [i % 3 for i in (1, 0, 1, 0, 1, 2, 2, 0, 1, 0, 2, 0, 2, 1, 0, 1, 2, 1)])
    warm_edge = api.mat("Prism | cut edge glints", "#ffe2a2", 0.1, 0.29, "#ffc05d", 1.5)
    crystal_edges = []
    for i in range(6):
        j = (i + 1) % 6
        crystal_edges.append(([vertices[0], vertices[i + 1], vertices[i + 7], vertices[13]], False))
        crystal_edges.append(([vertices[i + 7], vertices[j + 7]], False))
    _strokes("Prism | light on facet edges", crystal_edges, 0.012, warm_edge, collection)
    _point_light("Prism | gentle reflected amber", x, y, 1.28, 6.5, 0.30, collection)


def _banner(name, x, y, top, width, height, blue, blue_shadow, gilt, brass, collection,
            rod=False, drape=0.0):
    def on_cloth(u, v, front=0.0):
        # For cloth laid across a tabletop, the top strip bends onto the horizontal surface.
        fold = (0.010 * math.cos(u * math.pi * 4.5) + 0.013 * math.sin(u * math.pi * 3))
        depth = height * (0.86 + 0.14 * (1.0 - abs(u))) * v
        if v < 0:
            return x + u * width / 2, y + v * drape, top + front * 0.5
        return x + u * width / 2, y + fold * (0.3 + 0.7 * v) + front, top - depth

    rows = [-1.0, -0.1, 0, 0.18, 0.47, 0.76, 1] if drape else [0, 0.22, 0.50, 0.78, 1]
    columns = 13
    vertices = [on_cloth(-1 + 2 * i / (columns - 1), v) for v in rows for i in range(columns)]
    faces = []
    material_indices = []
    for row in range(len(rows) - 1):
        for col in range(columns - 1):
            a = row * columns + col
            faces.append((a, a + 1, a + 1 + columns, a + columns))
            material_indices.append(int(col in (1, 10) and row > 0))
    cloth = _mesh(f"{name} | sapphire fabric", vertices, faces, [blue, blue_shadow], collection,
                  material_indices)
    solidify = cloth.modifiers.new("Woven cloth thickness", "SOLIDIFY")
    solidify.thickness = 0.009

    border = []
    for u in (-0.89, 0.89):
        border.append(([on_cloth(u, v, 0.011) for v in (*rows[:-1], 0.94)], False))
    edge = [on_cloth(-0.89 + 1.78 * i / 12, 0.94, 0.011) for i in range(13)]
    border.append((edge, False))
    border.append(([on_cloth(-0.89 + 1.78 * i / 12, 0.067, 0.011) for i in range(13)], False))
    for u0, v0, w, h in [(0, 0.47, 0.54, 0.22), (0, 0.47, 0.25, 0.11),
                          (0, 0.19, 0.065, 0.028), (0, 0.76, 0.065, 0.028)]:
        border.append(([on_cloth(u, v, 0.016)
                        for u, v in [(u0, v0-h), (u0+w, v0), (u0, v0+h), (u0-w, v0)]], True))
    _strokes(f"{name} | gold embroidered trim and crest", border, 0.0105 if rod else 0.0085, gilt, collection)

    if rod:
        _strokes(f"{name} | brass suspension rod", [
            ([(x - width * 0.65, y, top + 0.036), (x + width * 0.65, y, top + 0.036)], False),
            ([(x - width * 0.57, y - 0.14, top + 0.042),
              (x - width * 0.57, y, top + 0.042)], False),
            ([(x + width * 0.57, y - 0.14, top + 0.042),
              (x + width * 0.57, y, top + 0.042)], False),
        ], 0.032, brass, collection)
    if drape:
        fringe = []
        for i in range(11):
            u = -0.92 + i * 0.184
            px, py, pz = on_cloth(u, 0.98, 0.014)
            fringe.append(([(px, py, pz), (px, py + 0.006, pz-0.052)], False))
        _strokes(f"{name} | fringe", fringe, 0.008, gilt, collection)


def _lantern(name, x, y, z, size, metal, glass, flame, collection, energy=0.0, wall=False):
    def profile(part, heights, material, segments=12):
        return _ring_profile(f"{name} | {part}", (x, y),
                             [(z + a * size, r * size) for a, r in heights],
                             material, collection, segments)

    profile("bronze base", [(0, 0.25), (0.07, 0.27), (0.11, 0.22), (0.18, 0.20)], metal)
    profile("amber panes", [(0.16, 0.18), (0.25, 0.205), (0.68, 0.205), (0.76, 0.19)], glass, 6)
    profile("hood", [(0.70, 0.23), (0.77, 0.25), (0.84, 0.24),
                     (0.90, 0.15), (1.00, 0.13), (1.05, 0.075)], metal)
    profile("wick light", [(0.21, 0.04), (0.25, 0.073), (0.51, 0.040), (0.60, 0.013)], flame)
    ribs = []
    for i in range(6):
        theta = i * TAU / 6
        px, py = x + math.cos(theta)*size*0.210, y + math.sin(theta)*size*0.210
        ribs.append(([(px, py, z + size*0.18), (px, py, z + size*0.78)], False))
    ribs.append(([(x, y, z + 1.02 * size), (x, y, z + 1.18 * size)], False))
    if wall:
        ribs.append(([(x, y - 0.28, z + 1.26 * size), (x, y - 0.13, z + 1.31 * size),
                      (x, y, z + 1.24 * size), (x, y, z + 1.1 * size)], False))
    _strokes(f"{name} | mullions and hanger", ribs, size * 0.020, metal, collection)
    if energy:
        _point_light(f"{name} | warm pool", x, y + 0.12, z + size*0.47, energy, 0.36*size, collection)


def _desk_lamp(name, x, y, z, metal, glass, collection):
    _ring_profile(f"{name} | brass base", (x, y),
                  [(z, 0.109), (z+0.027, 0.116), (z+0.05, 0.088),
                   (z+0.082, 0.035), (z+0.29, 0.026)], metal, collection, 12)
    _ring_profile(f"{name} | amber lampshade", (x, y),
                  [(z+0.25, 0.145), (z+0.27, 0.150), (z+0.40, 0.087),
                   (z+0.43, 0.059)], glass, collection, 8)
    _ring_profile(f"{name} | top and finial", (x, y),
                  [(z+0.41, 0.062), (z+0.44, 0.063), (z+0.45, 0.030),
                   (z+0.48, 0.017)], metal, collection, 10)
    _point_light(f"{name} | desk glow", x-0.07, y+0.10, z+0.28, 3.5, 0.1, collection)


def _build_quill(api, x, y, z, collection):
    quill = api.mat("Quill | parchment feather", "#f0c88a", 0.0, 0.68)
    close_gold = api.mat("Quill | feather barbs", "#fed9a5", 0.07, 0.63, "#ffbc64", 0.34)
    axis = Vector((0.66, -0.11, 0.54))
    side = Vector((0.16, 0.14, -0.15))
    base = Vector((x, y, z))
    vertices = [tuple(base + axis * offset + side * width) for offset, width in [
        (0.18, 0), (0.37, 0.41), (0.61, 0.49), (0.83, 0.36), (1.0, 0.0),
        (0.78, -0.44), (0.58, -0.38), (0.41, -0.28)
    ]]
    obj = _mesh("Library | suspended quill vane", vertices, [tuple(range(len(vertices)))],
                [quill], collection)
    solidify = obj.modifiers.new("Feather thickness", "SOLIDIFY")
    solidify.thickness = 0.008
    marks = [([tuple(base), tuple(base + axis)], False)]
    for i in range(4):
        amount = 0.34 + 0.115 * i
        ridge = base + axis * amount
        for sign in (-1, 1):
            edge = base + axis * (amount + 0.145) + side * sign * 0.34
            marks.append(([tuple(ridge), tuple(edge)], False))
    _strokes("Library | suspended quill feather detail", marks, 0.0085, close_gold, collection)


def _build_lens(api, x, y, z, brass, collection):
    lens_material = api.mat("Lens | pale optical glass", "#89bfb0", 0.1, 0.22, "#a6dfc3", 0.18)
    shader = next(node for node in lens_material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Transmission Weight"].default_value = 0.60
    lens_center = Vector((x, y, z))
    horizontal = Vector((0.91, 0.37, 0.18)).normalized()
    normal = Vector((-0.42, 0.83, 0.36)).normalized()
    vertical = horizontal.cross(normal).normalized()
    radius = 0.31
    ring = [
        tuple(lens_center + horizontal * (radius * math.cos(TAU*i/32))
              + vertical * (radius * math.sin(TAU*i/32)))
        for i in range(32)
    ]
    points = [*ring, tuple(lens_center + normal*0.061), tuple(lens_center - normal*0.061)]
    faces = [(i, (i+1)%32, 32) for i in range(32)] + [((i+1)%32, i, 33) for i in range(32)]
    _mesh("Practice | suspended optical lens", points, faces, [lens_material], collection)
    _strokes("Practice | brass lens rim", [(ring, True)], 0.019, brass, collection)
    soft_glint = api.mat("Lens | narrow reflected sunlight", "#eacf8f", 0.28, 0.33, "#ffcf81", 0.55)
    _strokes("Practice | reflection on suspended lens", [(ring[2:8], False)], 0.025, soft_glint, collection)


def _plant(api, x, y, collection):
    pottery = api.mat("Plant | terracotta pot", "#986041", 0.04, 0.65)
    soil = api.mat("Plant | potting soil", "#51392a", 0.0, 0.93)
    dark_leaf = api.mat("Plant | sage foliage shadow", "#3f572d", 0, 0.72)
    light_leaf = api.mat("Plant | sage foliage highlight", "#78834a", 0, 0.67)
    _ring_profile("Reception | small terracotta pot", (x, y),
                  [(0.005, 0.17), (0.04, 0.19), (0.33, 0.25), (0.37, 0.255),
                   (0.39, 0.229)], pottery, collection, 12)
    _ring_profile("Reception | potting soil", (x, y),
                  [(0.388, 0.222), (0.392, 0.222)], soil, collection, 12)
    vertices, faces = [], []
    for i in range(10):
        theta = i * 2.40
        forward = Vector((math.cos(theta), math.sin(theta), 0))
        across = Vector((-math.sin(theta), math.cos(theta), 0))
        base = Vector((x, y, 0.42 + 0.019 * i))
        length = 0.29 + 0.08 * math.sin(i * 0.9)
        centre = base + forward * length * 0.62 + Vector((0, 0, 0.26 + i * 0.015))
        edge = centre - Vector((0, 0, 0.04))
        tip = base + forward * length * 1.38 + Vector((0, 0, 0.21 + (i % 3) * 0.12))
        first = len(vertices)
        vertices.extend([tuple(base), tuple(edge + across*0.080), tuple(centre),
                         tuple(edge - across*0.08), tuple(tip)])
        faces.extend([(first, first + 1, first + 2), (first, first + 2, first + 3),
                      (first + 1, first + 4, first + 2), (first + 2, first + 4, first + 3)])
    _mesh("Reception | sparse sage leaves", vertices, faces, [light_leaf, dark_leaf], collection,
          [i%2 for i in range(len(faces))])


def build_magic(api):
    magic = api.collection("Magic | First-floor demonstrations")
    banners = api.collection("Decoration | Sapphire academy heraldry")
    lanterns = api.collection("Lighting | Handcrafted amber lanterns")
    accents = api.collection("Decoration | Foyer accents")
    stone = api.mat("Prism pedestal | textured rose limestone", "#b98561", 0.03, 0.73)
    warm_stone = api.mat("Prism pedestal | honed peach limestone", "#cf9c73", 0.03, 0.62)
    shadow_stone = api.mat("Prism pedestal | carved stone shadow", "#987053", 0.02, 0.77)
    brass = api.mat("Heraldry and lamps | aged brass", "#8e602e", 0.63, 0.42)
    gilt = api.mat("Heraldry | antique gold thread", "#d6a65c", 0.26, 0.65)
    blue = api.mat("Heraldry | deep sapphire woven cloth", "#183975", 0.01, 0.81)
    blue_shadow = api.mat("Heraldry | sapphire fold shadow", "#142c5f", 0.0, 0.85)
    shader = next(node for node in blue.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Sheen Weight"].default_value = 0.19
    glass = api.mat("Lantern | translucent amber panes", "#ecaa48", 0.10, 0.24, "#ffb34b", 1.15)
    shader = next(node for node in glass.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Transmission Weight"].default_value = 0.30
    flame = api.mat("Lantern | warm wick", "#fff1bb", 0.0, 0.42, "#ffc84f", 3.3)
    _build_prism(api, stone, warm_stone, shadow_stone, brass, magic)

    for i, x in enumerate((1.48, 6.67, 17.75, 23.55), 1):
        _banner(f"Rear wall banner {i}", x, 1.10, 3.56, 0.48, 1.66,
                blue, blue_shadow, gilt, brass, banners, rod=True)
    for i, x in enumerate((10.65, 14.35), 1):
        _banner(f"Gate pier banner {i}", x, 21.055, 1.48, 0.57, 1.05,
                blue, blue_shadow, gilt, brass, banners, drape=0.31)
        _lantern(f"Gate lantern {i}", x, 20.53, 1.60, 0.63, brass, glass, flame, lanterns, 12)
    _banner("Reception desk cloth", 4.0, 16.433, 1.096, 0.57, 0.68,
            blue, blue_shadow, gilt, brass, banners, drape=0.21)
    _banner("Practice workbench cloth", 21.05, 4.155, 1.026, 0.54, 0.65,
            blue, blue_shadow, gilt, brass, banners, drape=0.18)
    for i, x in enumerate((7.37, 17.38), 1):
        _lantern(f"Rear sconce {i}", x, 1.28, 2.47, 0.80, brass, glass, flame, lanterns, 20, wall=True)
    for name, x, y, z in [
        ("Reception desk lamp", 5.12, 15.72, 1.08),
        ("Library window table lamp", 4.95, 5.48, READING_TABLE_TOP),
        ("Library inner table lamp", 3.05, 9.92, READING_TABLE_TOP),
        ("Practice workbench lamp", 22.34, 3.38, 1.01),
    ]:
        _desk_lamp(name, x, y, z, brass, glass, lanterns)
    _build_quill(api, 3.79, 5.45, READING_TABLE_TOP + 0.22, magic)
    _build_lens(api, 20.70, 3.37, 1.70, brass, magic)
    _plant(api, 2.0, 16.29, accents)

