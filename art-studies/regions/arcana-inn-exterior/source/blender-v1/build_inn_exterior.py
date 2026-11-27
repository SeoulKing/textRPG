"""Build the Blue Roof Inn from its approved exterior concept.

Run Blender in background mode with --python and this script. Add
'-- --render' to save the 45-degree review render beside the .blend.
The building faces -Y in Blender and +Z in Godot.
"""

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Vector


SOURCE = Path(__file__).resolve().parent
PROJECT = SOURCE.parents[4]
EXPORT = PROJECT / "godot-arcana/art/source/plaza-inn-blender/inn-exterior.glb"
RNG = random.Random(163)


def srgb(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name, color, roughness=0.88, metal=0.0, glow=0.0):
    rgba = tuple(srgb(int(color[i:i + 2], 16) / 255.0) for i in (0, 2, 4)) + (1.0,)
    result = bpy.data.materials.new(name)
    result.diffuse_color = rgba
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    if glow:
        shader.inputs["Emission Color"].default_value = rgba
        shader.inputs["Emission Strength"].default_value = glow
    return result


class Part:
    """Collect small carved or tiled details into a single editable mesh."""

    def __init__(self, name, collection):
        self.name = name
        self.collection = collection
        self.vertices = []
        self.faces = []
        self.materials = []
        self.face_materials = []

    def solid(self, vertices, faces, surface):
        start = len(self.vertices)
        if surface not in self.materials:
            self.materials.append(surface)
        index = self.materials.index(surface)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(start + corner for corner in face) for face in faces)
        self.face_materials.extend([index] * len(faces))

    def finish(self, origin=(0, 0, 0)):
        local = [tuple(vertex[axis] - origin[axis] for axis in range(3))
                 for vertex in self.vertices]
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(local, [], self.faces)
        mesh.validate()
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        obj.location = origin
        self.collection.objects.link(obj)
        for surface in self.materials:
            mesh.materials.append(surface)
        for polygon, index in zip(mesh.polygons, self.face_materials):
            polygon.material_index = index
        return obj


BOX_FACES = (
    (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
    (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
)


def box(part, surface, position, size, angle=0.0):
    x, y, z = position
    a, b, c = (length * 0.5 for length in size)
    cosine, sine = math.cos(angle), math.sin(angle)
    vertices = [(x + u * cosine - v * sine, y + u * sine + v * cosine, z + w)
                for u, v, w in ((-a, -b, -c), (a, -b, -c), (a, b, -c), (-a, b, -c),
                                (-a, -b, c), (a, -b, c), (a, b, c), (-a, b, c))]
    part.solid(vertices, BOX_FACES, surface)


def front_shape(part, surface, outline, y, depth):
    """Extrude an X/Z outline, with the visible face pointing down Blender Y."""
    count = len(outline)
    area = sum(x1 * z2 - x2 * z1 for (x1, z1), (x2, z2) in
               zip(outline, outline[1:] + outline[:1]))
    if area < 0:
        outline = outline[::-1]
    vertices = [(x, plane, z) for plane in (y, y + depth) for x, z in outline]
    faces = [tuple(range(count)), tuple(range(2 * count - 1, count - 1, -1))]
    faces += [(next_corner % count, corner, corner + count, next_corner % count + count)
              for corner, next_corner in zip(range(count), range(1, count + 1))]
    part.solid(vertices, faces, surface)


def line(part, surface, start, end, width, depth, y):
    ax, az = start
    bx, bz = end
    length = math.hypot(bx - ax, bz - az)
    dx, dz = (bz - az) * width / (2 * length), (ax - bx) * width / (2 * length)
    front_shape(part, surface,
                [(ax + dx, az + dz), (bx + dx, bz + dz),
                 (bx - dx, bz - dz), (ax - dx, az - dz)], y, depth)


def circle(x, z, radius, segments=24):
    return [(x + radius * math.cos(index * math.tau / segments),
             z + radius * math.sin(index * math.tau / segments)) for index in range(segments)]


def arch_points(x, radius, spring, rise, segments=12):
    return [(x - radius * math.cos(index * math.pi / segments),
             spring + rise * math.sin(index * math.pi / segments) ** 0.84)
            for index in range(segments + 1)]


def arch_fill(part, surface, x, width, bottom, spring, rise, y, depth):
    front_shape(part, surface, [(x - width, bottom), (x + width, bottom)] +
                arch_points(x, width, spring, rise)[::-1], y, depth)


def arch_frame(part, surfaces, x, width, bottom, spring, rise, trim, y):
    outer = arch_points(x, width + trim, spring, rise + trim)
    inner = arch_points(x, width, spring, rise)
    for index in range(len(inner) - 1):
        corners = [outer[index], outer[index + 1], inner[index + 1], inner[index]]
        cx = sum(point[0] for point in corners) / 4
        cz = sum(point[1] for point in corners) / 4
        stone = [(cx + 0.972 * (px - cx), cz + 0.972 * (pz - cz)) for px, pz in corners]
        front_shape(part, surfaces[index % len(surfaces)], stone, y, 0.09)
    courses = max(2, round((spring - bottom) / 0.20))
    height = (spring - bottom) / courses
    for side in (-1, 1):
        for index in range(courses):
            box(part, surfaces[index % len(surfaces)],
                (x + side * (width + trim * 0.5), y + 0.045, bottom + (index + 0.5) * height),
                (trim, 0.09, height - 0.008))


def column_ring(part, surface, x, y, levels, segments=10):
    """Build a lathed column, tapering or swelling at the supplied heights."""
    vertices = [(x + radius * math.cos(i * math.tau / segments),
                 y + radius * math.sin(i * math.tau / segments), z)
                for z, radius in levels for i in range(segments)]
    faces = [tuple(reversed(range(segments)))]
    for level in range(len(levels) - 1):
        for index in range(segments):
            bottom = level * segments
            a, b = bottom + index, bottom + (index + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.append(tuple(range(len(vertices) - segments, len(vertices))))
    part.solid(vertices, faces, surface)


def star(part, surface, x, z, radius, y):
    outline = []
    for index in range(8):
        angle = index * math.pi * 0.25
        length = radius if index % 2 == 0 else radius * 0.24
        outline.append((x + length * math.cos(angle), z + length * math.sin(angle)))
    front_shape(part, surface, outline, y, 0.012)


def flower_box(part, x, z, y, width):
    box(part, oak, (x, y - 0.12, z - 0.028), (width, 0.18, 0.15))
    box(part, wood_light, (x, y - 0.20, z + 0.02), (width + 0.04, 0.025, 0.045))
    for index in range(round(width * 14)):
        xx = x + RNG.uniform(-0.49, 0.49) * width
        zz = z + RNG.uniform(-0.06, 0.115)
        leaf_y = y - RNG.uniform(0.13, 0.21)
        leaf(part, xx, zz, leaf_y, RNG.uniform(0.035, 0.071))
        if index % 2 == 0:
            flower(part, xx, zz + 0.02, leaf_y - 0.022)


def leaf(part, x, z, y, size):
    tilt = RNG.uniform(-0.58, 0.58)
    outline = [(x - size, z), (x - size * 0.2, z - size * 0.44),
               (x + size, z + tilt * size), (x + size * 0.13, z + size * 0.52)]
    front_shape(part, RNG.choice(leaf_colors), outline, y, 0.019)


def flower(part, x, z, y):
    radius = RNG.uniform(0.027, 0.044)
    color = RNG.choice(petal_colors)
    for index in range(5):
        angle = index * math.tau / 5
        petal_x = x + radius * 0.60 * math.cos(angle)
        petal_z = z + radius * 0.60 * math.sin(angle)
        front_shape(part, color, circle(petal_x, petal_z, radius * 0.49, 5), y, 0.012)
    front_shape(part, brass_light, circle(x, z, radius * 0.24, 5), y - 0.004, 0.010)


def window(part, x, bottom, width, straight, rise, y):
    spring = bottom + straight
    arch_fill(part, recessed, x, width + 0.055, bottom - 0.03, spring, rise + 0.06, y - 0.006, 0.05)
    arch_fill(part, window_glow, x, width - 0.032, bottom + 0.026, spring - 0.016,
              rise - 0.028, y - 0.024, 0.023)
    # Each pane gets a legible leaded diamond. Keep framing and glass at distinct depths.
    half_diamond = (width - 0.047) * 0.30
    diamond_height = min(0.13, straight * 0.29)
    for side in (-1, 1):
        center = x + side * (width - 0.025) * 0.50
        z = bottom + straight * 0.54
        diamond = [(center, z - diamond_height), (center + half_diamond, z),
                   (center, z + diamond_height), (center - half_diamond, z)]
        for start, end in zip(diamond, diamond[1:] + diamond[:1]):
            line(part, glass_lead, start, end, 0.025, 0.019, y - 0.040)
    box(part, wood_dark, (x, y - 0.034, (bottom + spring + rise) * 0.5 - 0.013),
        (0.038, 0.029, spring + rise - bottom - 0.065))
    arch_frame(part, stone_colors, x, width, bottom, spring, rise, 0.095, y - 0.075)
    box(part, stone_edge, (x, y - 0.056, bottom - 0.025), (width * 2 + 0.26, 0.22, 0.087))
    star(part, brass_light, x, spring + rise * 0.68, 0.053, y - 0.059)


def shingle_plane(part, vertices, surface):
    normal = (Vector(vertices[1]) - Vector(vertices[0])).cross(
        Vector(vertices[3]) - Vector(vertices[0])).normalized()
    if normal.z < 0:
        vertices = vertices[::-1]
        normal.negate()
    bottom = [tuple(Vector(vertex) - normal * 0.037) for vertex in vertices]
    part.solid(bottom + vertices, BOX_FACES, surface)


def roof_plane(part, first, second, rows, count, underlay):
    """Tile a slope between two line segments, from eave to ridge."""
    eave_start, eave_end = map(Vector, first)
    ridge_start, ridge_end = map(Vector, second)

    def point(u, v, lift=0.0):
        return tuple(eave_start.lerp(eave_end, u).lerp(ridge_start.lerp(ridge_end, u), v)
                     + Vector((0, 0, lift)))

    shingle_plane(part, [point(0, 0), point(1, 0), point(1, 1), point(0, 1)], underlay)
    for row in range(rows):
        low = row / rows
        high = min(1, (row + 1.12) / rows)
        offset = 0.5 if row % 2 else 0.0
        for column in range(-1, count):
            left = max(0, (column + offset + 0.016) / count)
            right = min(1, (column + offset + 0.984) / count)
            if right - left < 0.014:
                continue
            lift = 0.023 + (rows - row) * 0.001
            shingle_plane(part, [point(left, low, lift), point(right, low, lift),
                                 point(right, high, lift), point(left, high, lift)],
                          RNG.choice(roof_colors))


def gable(part, x, width, eave, peak, y, back, roof_rows=8, back_peak=None):
    # The rear end disappears into the main roof while the front overhangs the facade.
    edge = width * 0.5
    ridge_back = peak if back_peak is None else back_peak
    front_shape(part, plaster, [(x - edge, eave), (x + edge, eave), (x, peak)], y + 0.055, 0.16)
    for side in (-1, 1):
        ex = x + edge * side
        roof_plane(part, [(ex, y, eave), (ex, back, eave)],
                   [(x, y, peak), (x, back, ridge_back)], roof_rows, 6, roof_dark)
        line(part, stone_edge, (ex + side * 0.025, eave), (x, peak), 0.121, 0.13, y - 0.04)
        line(part, wood_light, (ex + side * 0.012, eave - 0.05), (x, peak - 0.076),
             0.045, 0.10, y - 0.051)
    column_ring(part, brass, x, y + 0.035,
                [(peak, 0.11), (peak + 0.07, 0.11), (peak + 0.12, 0.067),
                 (peak + 0.20, 0.041), (peak + 0.32, 0.012)])


def masonry(part, x0, x1, y, z0, rows, row_height):
    for row in range(rows):
        width = 0.4
        offset = 0.18 if row % 2 else 0.0
        for index in range(math.ceil((x1 - x0) / width) + 1):
            start = max(x0, x0 + index * width - offset)
            end = min(x1, x0 + (index + 1) * width - offset)
            if end - start > 0.02:
                box(part, RNG.choice(stone_colors), ((start + end) * 0.5, y, z0 + (row + 0.5) * row_height),
                    (end - start - 0.009, 0.042, row_height - 0.009))


def lantern(part, x, z):
    y = -2.24
    box(part, brass, (x, y + 0.11, z + 0.18), (0.043, 0.23, 0.048))
    column_ring(part, recessed, x, y, [(z + 0.10, 0.083), (z + 0.15, 0.105),
                                       (z + 0.18, 0.063), (z + 0.24, 0.02)], 8)
    column_ring(part, lantern_glow, x, y, [(z - 0.10, 0.055), (z + 0.10, 0.075)], 8)
    column_ring(part, brass, x, y, [(z - 0.17, 0.019), (z - 0.127, 0.078),
                                    (z - 0.10, 0.069)], 8)
    for side in (-1, 1):
        line(part, brass, (x + side * 0.055, z - 0.10), (x + side * 0.076, z + 0.10),
             0.017, 0.015, y - 0.064)


def build():
    architecture = bpy.data.collections.new("01 • Masonry and timber")
    roofs = bpy.data.collections.new("02 • Blue tiled roofs")
    joinery = bpy.data.collections.new("03 • Entrance and windows")
    adornment = bpy.data.collections.new("04 • Sign, lanterns and planters")
    for collection in (architecture, roofs, joinery, adornment):
        bpy.context.scene.collection.children.link(collection)

    body = Part("Limestone lodge", architecture)
    box(body, plaster, (0, 0, 1.27), (6.16, 3.94, 2.54))
    box(body, stone_edge, (0, 0, 0.12), (6.23, 4.02, 0.24))
    box(body, wood_light, (0, 0, 2.39), (6.27, 4.04, 0.135))
    box(body, oak, (0, 0, 2.57), (6.20, 4.06, 0.115))
    box(body, plaster, (0, 0, 2.65), (6.13, 3.98, 0.35))
    masonry(body, -3.1, -0.66, -1.995, 0.23, 3, 0.155)
    masonry(body, 0.66, 3.1, -1.995, 0.23, 3, 0.155)

    def rotate_wall_details(start, quarter_turns):
        """Turn front-facing joinery to the side or rear without changing its section."""
        for index in range(start, len(body.vertices)):
            x, y, z = body.vertices[index]
            if quarter_turns == 2:
                body.vertices[index] = (-x, -y, z)
            else:
                body.vertices[index] = (-quarter_turns * y, quarter_turns * x, z)

    for side in (-1, 1):
        points = [(side * 3.08, -1.96, 2.74), (side * 3.08, 1.96, 2.74), (side * 3.08, 0, 4.74)]
        body.solid(points + [(x - side * 0.065, y, z) for x, y, z in points],
                   [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
                   if side == 1 else
                   [(2, 1, 0), (3, 4, 5), (1, 4, 3, 0), (2, 5, 4, 1), (0, 3, 5, 2)],
                   plaster)
        for yy in (-1.79, 0.0, 1.79):
            box(body, oak, (side * 3.09, yy, 1.38), (0.075, 0.13, 2.45))
        box(body, oak, (side * 3.09, 0, 2.07), (0.095, 3.94, 0.11))
        start = len(body.vertices)
        for yy in (-1.01, 0.95):
            window(body, side * yy, 0.84, 0.245, 0.62, 0.29, -3.096)
        masonry(body, -1.89, 1.89, -3.090, 0.24, 2, 0.155)
        box(body, oak, (0, -3.093, 2.81), (3.69, 0.067, 0.12))
        for edge in (-1, 1):
            line(body, wood_light, (edge * 1.81, 2.83), (0, 4.66), 0.075, 0.055, -3.14)
            line(body, oak, (edge * 1.10, 2.85), (edge * 0.32, 3.58), 0.072, 0.057, -3.13)
        box(body, oak, (0, -3.105, 4.25), (0.082, 0.064, 0.79))
        front_shape(body, stone_edge, circle(0, 3.59, 0.235, 12), -3.125, 0.062)
        front_shape(body, recessed, circle(0, 3.59, 0.175, 12), -3.146, 0.028)
        for z, span in ((3.51, 0.24), (3.59, 0.31), (3.67, 0.24)):
            box(body, oak, (0, -3.151, z), (span, 0.030, 0.034))
        rotate_wall_details(start, side)
    # Posts sit on the solid piers between the arched openings.
    for x in (-2.95, -1.92, -0.84, 0.84, 1.92, 2.95):
        box(body, oak, (x, -2.018, 1.34), (0.115, 0.12, 2.24))
        box(body, oak, (x, -2.048, 2.49), (0.10, 0.16, 0.32))
    box(body, oak, (0, -2.034, 2.27), (6.26, 0.16, 0.145))
    box(body, wood_light, (0, -2.093, 2.31), (6.23, 0.07, 0.041))
    for x in (-2.98, -0.78, 0.78, 2.98):
        for z in (0.175, 0.34, 0.51):
            box(body, stone_edge, (x, -2.07, z), (0.29 - z * 0.11, 0.185, 0.156))
    for x in (-2.95, -1.92, -0.84, 0.84, 1.92, 2.95):
        line(body, oak, (x, 2.22), (x + math.copysign(0.19, x), 2.05), 0.070, 0.10, -2.095)
    for x in (-2.92, 0, 2.92):
        box(body, oak, (x, 1.995, 1.35), (0.125, 0.115, 2.40))
    box(body, oak, (0, 2.005, 2.07), (6.17, 0.11, 0.11))
    masonry(body, -3.05, 3.05, 1.992, 0.24, 3, 0.155)
    start = len(body.vertices)
    for x in (-1.45, 1.45):
        window(body, x, 0.79, 0.31, 0.63, 0.32, -2.006)
    rotate_wall_details(start, 2)
    body.finish()

    roof = Part("Main lapis slate", roofs)
    for side in (-1, 1):
        y = side * 2.17
        roof_plane(roof, [(-3.25, y, 2.74), (3.25, y, 2.74)],
                   [(-3.25, 0, 4.75), (3.25, 0, 4.75)], 10, 15, roof_dark)
        box(roof, wood_light, (0, y, 2.73), (6.53, 0.08, 0.13))
    box(roof, brass, (0, 0, 4.78), (6.48, 0.065, 0.065))
    for x in (-3.15, -2.72, -2.27, -1.82, -1.36, -0.91, 0.91, 1.36, 1.82, 2.27, 2.72, 3.15):
        base = 4.79
        height = 0.18 if abs(x) < 3 else 0.32
        column_ring(roof, brass, x, 0, [(base, 0.057), (base + 0.041, 0.072),
                                       (base + 0.080, 0.045), (base + height, 0.008)], 8)
    roof.finish()

    center = Part("Central pointed gable", roofs)
    box(center, plaster, (0, -1.52, 3.10), (1.61, 1.46, 1.08))
    for x in (-0.83, 0.83):
        box(center, oak, (x, -2.242, 3.01), (0.13, 0.13, 1.01))
        box(center, stone_edge, (x, -2.259, 3.49), (0.24, 0.17, 0.20))
        box(center, stone_edge, (x, -2.259, 2.53), (0.24, 0.17, 0.19))
    gable(center, 0, 1.89, 3.50, 5.23, -2.30, 0, back_peak=4.70)
    box(center, wood_light, (0, -2.28, 3.74), (1.58, 0.12, 0.085))
    front_shape(center, brass, circle(0, 4.10, 0.171, 12), -2.277, 0.042)
    front_shape(center, roof_dark, circle(0, 4.10, 0.137, 12), -2.289, 0.021)
    star(center, brass_light, 0, 4.10, 0.106, -2.306)
    center.finish()

    dormers = Part("Paired gabled dormers", roofs)
    for x in (-1.89, 1.89):
        box(dormers, plaster, (x, -1.59, 3.25), (1.02, 0.83, 0.95))
        gable(dormers, x, 1.22, 3.52, 4.50, -2.025, -0.20, 6)
    dormers.finish()

    chimney = Part("Twin-flue stone chimney", roofs)
    box(chimney, plaster, (2.42, 0.52, 4.53), (0.60, 0.58, 1.12))
    box(chimney, stone_edge, (2.42, 0.52, 5.12), (0.72, 0.70, 0.16))
    masonry(chimney, 2.12, 2.72, 0.21, 4.19, 5, 0.173)
    for x in (2.25, 2.59):
        column_ring(chimney, brass, x, 0.52, [(5.18, 0.092), (5.28, 0.092),
                                            (5.30, 0.107), (5.36, 0.107)], 12)
        column_ring(chimney, recessed, x, 0.52, [(5.359, 0.076), (5.365, 0.076)], 12)
    chimney.finish()

    entrance = Part("Entrance arch and limestone step", joinery)
    arch_fill(entrance, recessed, 0, 0.59, 0.13, 1.38, 0.53, -2.035, 0.13)
    arch_frame(entrance, stone_colors, 0, 0.54, 0.19, 1.37, 0.53, 0.155, -2.16)
    arch_frame(entrance, (stone_edge,), 0, 0.697, 0.19, 1.37, 0.688, 0.05, -2.123)
    box(entrance, stone_edge, (0, -2.158, 0.075), (1.56, 0.47, 0.15))
    box(entrance, stone_colors[0], (0, -2.101, 0.152), (1.42, 0.265, 0.10))
    star(entrance, stone_edge, 0, 2.075, 0.125, -2.167)
    entrance.finish()

    door = Part("Oak guest door", joinery)
    arch_fill(door, oak, 0, 0.479, 0.20, 1.34, 0.48, -2.085, 0.090)
    arch_frame(door, (wood_light,), 0, 0.437, 0.20, 1.32, 0.442, 0.037, -2.097)
    for x in (-0.22, 0.22):
        for z in (0.47, 1.07):
            box(door, wood_dark, (x, -2.101, z), (0.34, 0.028, 0.47))
            box(door, wood_light, (x, -2.119, z), (0.26, 0.016, 0.39))
            box(door, oak, (x, -2.129, z), (0.205, 0.020, 0.335))
    star(door, brass_light, 0, 1.54, 0.125, -2.109)
    center_ring = circle(0.075, 0.77, 0.069, 12)
    for a, b in zip(center_ring, center_ring[1:] + center_ring[:1]):
        line(door, brass_light, a, b, 0.014, 0.022, -2.15)
    box(door, brass, (0.075, -2.127, 0.85), (0.065, 0.045, 0.09))
    door.finish((-0.47, -2.085, 0.20))

    windows = Part("Amber diamond-lattice windows", joinery)
    plants = Part("Lavender planters and ivy", adornment)
    for x in (-2.42, -1.42, 1.42, 2.42):
        window(windows, x, 0.66, 0.255, 0.64, 0.29, -2.046)
        flower_box(plants, x, 0.66, -2.06, 0.60)
    for x in (-1.89, 1.89):
        window(windows, x, 3.19, 0.246, 0.36, 0.25, -2.035)
        flower_box(plants, x, 3.19, -2.035, 0.54)
    window(windows, 0, 2.71, 0.35, 0.52, 0.30, -2.282)
    flower_box(plants, 0, 2.70, -2.292, 0.90)
    for x, y, start, stop in ((-3.0, -2.165, 0.2, 2.7), (3.02, -2.165, 0.3, 2.62),
                              (-0.78, -2.19, 0.22, 0.87), (0.82, -2.19, 0.23, 0.78),
                              (-0.83, -2.339, 2.51, 3.19), (0.87, -2.339, 2.54, 3.15)):
        for index in range(round((stop - start) * 17)):
            zz = start + index / 17 + RNG.uniform(-0.025, 0.025)
            xx = x + 0.10 * math.sin(zz * 5.1) + RNG.uniform(-0.081, 0.081)
            leaf(plants, xx, zz, y, RNG.uniform(0.041, 0.092))
            if index % 4 == 0:
                flower(plants, xx + 0.018, zz, y - 0.023)
    windows.finish()
    plants.finish()

    lamps = Part("Two brass entrance lanterns", adornment)
    lantern(lamps, -0.84, 1.63)
    lantern(lamps, 0.84, 1.63)
    lamps.finish()

    sign = Part("Blue crescent and star hanging sign", adornment)
    sx, sz, sy = 1.92, 1.83, -2.30
    box(sign, brass, (sx, -2.088, 2.15), (0.14, 0.045, 0.21))
    box(sign, brass, (sx, -2.198, 2.21), (0.076, 0.24, 0.050))
    box(sign, brass, (sx, -2.294, 2.21), (0.35, 0.055, 0.046))
    for x in (sx - 0.12, sx + 0.12):
        line(sign, brass, (x, 2.20), (x, 2.00), 0.025, 0.035, sy + 0.025)
    front_shape(sign, brass, circle(sx, sz, 0.237), sy, 0.063)
    front_shape(sign, roof_dark, circle(sx, sz, 0.206), sy - 0.013, 0.025)
    crescent = [(sx - 0.017 + 0.142 * math.cos(math.radians(angle)),
                 sz + 0.142 * math.sin(math.radians(angle))) for angle in range(106, 317, 14)]
    crescent += [(sx + 0.029 + 0.120 * math.cos(math.radians(angle)),
                  sz + 0.052 + 0.120 * math.sin(math.radians(angle))) for angle in range(295, 156, -14)]
    front_shape(sign, brass_light, crescent, sy - 0.026, 0.014)
    star(sign, brass_light, sx + 0.099, sz + 0.060, 0.050, sy - 0.027)
    star(sign, brass_light, sx + 0.143, sz + 0.143, 0.027, sy - 0.027)
    sign.finish()

    return [obj for collection in (architecture, roofs, joinery, adornment) for obj in collection.objects]


def preview_setup(scene):
    review = bpy.data.collections.new("05 • Review camera and daylight")
    scene.collection.children.link(review)
    camera = bpy.data.objects.new("Plaza front orthographic 45°", bpy.data.cameras.new("45° orthographic"))
    review.objects.link(camera)
    target = Vector((0, 0, 2.0))
    camera.location = target + Vector((0, -10, 10))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 8.7
    scene.camera = camera
    scene.world = bpy.data.worlds.new("Plaza neutral background")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.15, 0.20, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    for name, kind, position, power, color in (
        ("7 o’clock daylight", "SUN", (-3.4, -8.2, 4.5), 2.1, (1.0, 0.92, 0.80)),
        ("Sky fill", "AREA", (1, 1, 8), 640, (0.76, 0.84, 1.0)),
        ("Front bounce", "AREA", (0, -5, 6), 250, (1.0, 0.93, 0.82)),
    ):
        lamp = bpy.data.lights.new(name, kind)
        lamp.energy = power
        lamp.color = color
        if kind == "AREA":
            lamp.shape = "DISK"
            lamp.size = 7
        light = bpy.data.objects.new(name, lamp)
        review.objects.link(light)
        light.location = position
        light.rotation_euler = (-Vector(position)).to_track_quat("-Z", "Y").to_euler()
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 780
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX"


bpy.ops.wm.read_factory_settings(use_empty=True)
plaster = material("Cream lime plaster", "BFA683")
stone_colors = tuple(material("Sandstone " + str(index), color) for index, color in
                     enumerate(("D0B591", "C7A882", "BE9F78", "D4B994", "C4A580")))
stone_edge = material("Pale hand-cut stone edges", "D1B388")
oak = material("Honeyed oak", "7D4F31")
wood_dark = material("Dark inset oak", "4E322A")
wood_light = material("Oak trim", "A16D40")
recessed = material("Dark iron and recesses", "3B3031")
roof_dark = material("Deep cobalt slate base", "182C55")
roof_colors = tuple(material("Lapis slate " + str(index), color) for index, color in
                    enumerate(("304D85", "385A99", "28467C", "375589", "304C8A", "4162A1")))
brass = material("Aged brass", "9E6632", 0.64, 0.18)
brass_light = material("Polished brass accent", "E3AD53", 0.58, 0.12)
window_glow = material("Amber window glass", "C78F51", 0.72, glow=0.09)
lantern_glow = material("Golden lantern glass", "EAB261", 0.68, glow=0.38)
glass_lead = material("Window lattice bronze", "805439")
leaf_colors = tuple(material("Ivy leaf " + str(index), color) for index, color in
                    enumerate(("3A603E", "486942", "507546", "36563D", "667F4B")))
petal_colors = tuple(material("Lavender blossom " + str(index), color) for index, color in
                     enumerate(("A68CBF", "C0A8CE", "DAC6DE", "826CAF")))
models = build()
scene = bpy.context.scene
preview_setup(scene)
bpy.context.view_layer.update()
for obj in models:
    obj.select_set(True)
bpy.context.view_layer.objects.active = models[0]
scene.render.filepath = str(SOURCE / "inn-exterior.png")
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "inn-exterior.blend"))
EXPORT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(EXPORT), export_format="GLB", use_selection=True, export_yup=True)
corners = [obj.matrix_world @ Vector(corner) for obj in models for corner in obj.bound_box]
print("Inn mesh bounds (Blender XYZ):", [(round(min(v[i] for v in corners), 3),
                                           round(max(v[i] for v in corners), 3)) for i in range(3)])
if "--" in sys.argv and "--render" in sys.argv[sys.argv.index("--") + 1:]:
    bpy.ops.render.render(write_still=True)
