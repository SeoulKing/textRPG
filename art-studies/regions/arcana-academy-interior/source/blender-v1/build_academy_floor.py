"""Rebuild the academy from Blender 4.5 with --background --python."""

from dataclasses import dataclass
import math
from pathlib import Path
from random import Random
import sys
from types import SimpleNamespace

import bpy
from mathutils import Vector


OUT = Path(__file__).resolve().parent
WIDTH, DEPTH = 25, 21
UPPER_WALL_HEIGHT = 8.0
LOW_WALL_HEIGHT = 0.25
UPPER_CAP_HEIGHT = 0.18
UPPER_MASONRY_HEIGHT = UPPER_WALL_HEIGHT - UPPER_CAP_HEIGHT
LANDING_Z = 1.8
UPPER_PORTAL_SPAN = (11, 14)
UPPER_PORTAL_SPRING = 4.4
UPPER_PORTAL_RISE = (UPPER_PORTAL_SPAN[1] - UPPER_PORTAL_SPAN[0]) / 2
CLIP_EPSILON = 1e-9
HERO_FILE = OUT / "arcana-academy-first-floor.blend"
PREVIEW_FILE = OUT / "arcana-academy-first-floor-preview.png"
DOORS = {
    "Entrance": (12.5, 20.5, 0.0),
    "Library doorway": (7.5, 8.0, 0.0),
    "Practice doorway": (17.5, 6.0, 0.0),
    "Classroom doorway": (17.5, 14.0, 0.0),
    "Upper floor landing": (12.5, 0.23, LANDING_Z),
}

CUBE_FACES = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
              (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))


def world(x, y, z):
    return x, -y, z


def linear_color(code):
    code = code.lstrip("#")
    channels = [int(code[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)


def mat(name, hex, metallic=0, roughness=0.7, emission=None, emission_strength=0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    color = (*linear_color(hex), 1)
    material.diffuse_color = color
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*linear_color(emission), 1)
        shader.inputs["Emission Strength"].default_value = emission_strength
    return material


def surface_grain(material, scale, strength, distance):
    tree = material.node_tree
    shader = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 2
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    tree.links.new(coordinates.outputs["Object"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])


def collection(name, parent=None):
    target = bpy.data.collections.get(name)
    if target is None:
        target = bpy.data.collections.new(name)
        (parent or bpy.data.collections["Academy | First floor"]).children.link(target)
    return target


def mesh_object(name, vertices, faces, materials, target, indices=()):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for material in materials:
        mesh.materials.append(material)
    for face, index in zip(mesh.polygons, indices):
        face.material_index = index
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    return obj


def bevel_edges(obj, amount):
    if amount:
        bevel = obj.modifiers.new("Hand-dressed edges", "BEVEL")
        bevel.width = amount
        bevel.segments = 2
        bevel.affect = "EDGES"
        bevel.harden_normals = True


def cube_vertices(x, y, z, w, d, h):
    x0, x1 = x - w / 2, x + w / 2
    y0, y1 = y - d / 2, y + d / 2
    return [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z),
            (x0, y0, z + h), (x1, y0, z + h), (x1, y1, z + h), (x0, y1, z + h)]


def box(name, x, y, z, w, d, h, material, bevel=0.03, rotation=0, collection=None):
    target = collection or bpy.data.collections["Academy | First floor"]
    obj = mesh_object(name, cube_vertices(0, 0, 0, w, d, h), CUBE_FACES, [material], target)
    obj.location = world(x, y, z)
    obj.rotation_euler.z = -math.radians(rotation)
    bevel_edges(obj, bevel)
    return obj


def blocks(name, layouts, palette, target, bevel=0.015):
    vertices, faces, indices = [], [], []
    for x, y, z, w, d, h, index in layouts:
        start = len(vertices)
        vertices.extend(cube_vertices(x, -y, z, w, d, h))
        faces.extend(tuple(start + vertex for vertex in face) for face in CUBE_FACES)
        indices.extend([index] * len(CUBE_FACES))
    obj = mesh_object(name, vertices, faces, palette, target, indices)
    bevel_edges(obj, bevel)
    return obj


def beam(name, start, end, width, depth, material, target):
    first, second = Vector(world(*start)), Vector(world(*end))
    direction = second - first
    obj = box(name, 0, 0, 0, width, depth, direction.length,
              material, 0.012, collection=target)
    obj.location = first
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def xz_prism(outline, front_y, back_y):
    area = sum(x0 * z1 - x1 * z0 for (x0, z0), (x1, z1) in zip(outline, outline[1:] + outline[:1]))
    if area < 0:
        outline = list(reversed(outline))
    count = len(outline)
    vertices = [world(x, y, z) for y in (front_y, back_y) for x, z in outline]
    faces = [tuple(range(count)), tuple(reversed(range(count, 2 * count)))]
    for i in range(count):
        next_i = (i + 1) % count
        faces.append((i, i + count, next_i + count, next_i))
    return vertices, faces


def extrude_xz(name, outline, front_y, back_y, material, target):
    vertices, faces = xz_prism(outline, front_y, back_y)
    return mesh_object(name, vertices, faces, [material], target)


def make_palette():
    stone = [mat(f"Sandstone | {i + 1}", code, roughness=0.86) for i, code in
             enumerate(("be987c", "caa68d", "d0aa8c", "d5b196", "c5a28a", "c6a18a", "d1ad91"))]
    floor = [mat(f"Limestone | {i + 1}", code, roughness=0.79) for i, code in
             enumerate(("aa8a77", "ba9a81", "c6a48c", "bfa088", "c3a087", "c9a98e", "bfa48f"))]
    for material in [*stone, *floor]:
        surface_grain(material, 11, 0.16, 0.05)
    return SimpleNamespace(
        stone=stone,
        floor=floor,
        joints=mat("Limestone mortar", "917662"),
        foundation=mat("Foundation cut face", "956e57"),
        frame=mat("Window | Bronze leadwork", "735139", 0.35, 0.46),
        carpet=mat("Wool | Aged sage", "485b46", roughness=0.91),
        edge=mat("Thread | Muted honey", "b89a55", 0.1, 0.78),
        dark_edge=mat("Wool | Bound edge", "273b33", roughness=0.88),
    )


def make_floor(palette):
    target = collection("01 | Limestone floor and foundation")
    box("Full foundation", 12.5, 10.5, -0.61, WIDTH, DEPTH, 0.37,
        palette.foundation, 0.055, collection=target)
    box("Foundation cap and mortar bed", 12.5, 10.5, -0.26, WIDTH, DEPTH, 0.20,
        palette.joints, 0.035, collection=target)
    sections = (("Library floor", 0, 8, 1, 13), ("Practice floor", 17, 25, 1, 10),
                ("Classroom floor", 17, 25, 10, 18), ("Central hall floor", 8, 17, 1, 18),
                ("Foyer | west", 0, 8, 13, 18), ("Foyer | south", 0, 25, 18, 21),
                ("Rear wall foundation tiles", 0, 25, 0, 1))
    rng = Random(820)
    for name, x0, x1, y0, y1 in sections:
        layouts = [(x + 0.5, y + 0.5, -0.075, 0.985, 0.985, 0.075, rng.randrange(len(palette.floor)))
                   for y in range(y0, y1) for x in range(x0, x1)]
        blocks(name, layouts, palette.floor, target, 0.012)


def wall_run(name, along, start, end, fixed, height, palette, target):
    def axis(position):
        return (position, fixed) if along == "x" else (fixed, position)

    length = end - start
    if length <= 0:
        return
    x, y = axis((start + end) / 2)
    w, d = (length, 0.97) if along == "x" else (0.97, length)
    box(f"{name} | mortar", x, y, 0.01, w, d, height - 0.04,
        palette.joints, 0.018, collection=target)
    rows = max(1, round(height / 0.32))
    layouts = []
    rng = Random(name)
    cap_height = min(0.14, height * 0.24)
    course = (height - cap_height + 0.01) / rows
    for row in range(rows):
        position = start
        while position < end - 0.004:
            length = min(end - position, rng.uniform(0.74, 1.3))
            px, py = axis(position + length / 2)
            along_width, across_width = max(0.01, length - 0.014), 0.995
            block_w, block_d = (along_width, across_width) if along == "x" else (across_width, along_width)
            layouts.append((px, py, row * course + 0.008, block_w, block_d,
                            course - 0.016, rng.randrange(len(palette.stone))))
            position += length
    blocks(f"{name} | ashlar", layouts, palette.stone, target)
    w, d = (end - start, 1.0) if along == "x" else (1.0, end - start)
    box(f"{name} | coping", x, y, height - cap_height, w, d, cap_height,
        palette.stone[3], min(0.04, cap_height * 0.36), collection=target)


def tile_upper_coping(name, along, start, end, palette, target):
    for index in range(start, end):
        coordinate = index + 0.5
        x, y = (coordinate, 0.5) if along == "x" else (0.5, coordinate)
        w, d = (0.984, 1.03) if along == "x" else (1.03, 0.984)
        color = (index + index // 3) % len(palette.stone)
        box(f"{name} {index + 1:02d}", x, y, UPPER_MASONRY_HEIGHT, w, d, UPPER_CAP_HEIGHT,
            palette.stone[color], 0.033, collection=target)


def make_front_corner(palette, target):
    x, y = WIDTH - 0.5, DEPTH - 0.5
    cap_height = LOW_WALL_HEIGHT * 0.24
    cap_bottom = LOW_WALL_HEIGHT - cap_height
    # One corner tile meets the two runs at right angles with flush top faces.
    box("Front east corner | dressed stone", x, y, 0.005, 0.995, 0.995, cap_bottom,
        palette.stone[2], 0.014, collection=target)
    box("Front east corner | single coping", x, y, cap_bottom, 1, 1, cap_height,
        palette.stone[3], cap_height * 0.36, collection=target)


def make_cutaway(palette):
    outer = collection("02 | Exterior low walls and entrance")
    inner = collection("03 | Room partitions and thresholds")
    exterior_walls = (
        ("West exterior wall", "y", 1, DEPTH, 0.5, UPPER_MASONRY_HEIGHT),
        ("East perimeter", "y", 1, DEPTH - 1, WIDTH - 0.5, LOW_WALL_HEIGHT),
        ("Front wall west of entry", "x", 1, 11, DEPTH - 0.5, LOW_WALL_HEIGHT),
        ("Front wall east of entry", "x", 14, WIDTH - 1, DEPTH - 0.5, LOW_WALL_HEIGHT),
    )
    partitions = (
        ("Library hall wall north of door", "y", 1, 7, 7.5),
        ("Library hall wall south of door", "y", 9, 13, 7.5),
        ("Library south wall", "x", 1, 7, 12.5),
        ("Practice hall wall north of door", "y", 1, 5, 17.5),
        ("Right wall between room doors", "y", 7, 13, 17.5),
        ("Classroom hall wall south of door", "y", 15, 18, 17.5),
        ("Classroom and practice divider", "x", 18, 24, 9.5),
        ("Classroom south wall", "x", 18, 24, 17.5),
    )
    for name, along, start, end, fixed, height in exterior_walls:
        wall_run(name, along, start, end, fixed, height, palette, outer)
    make_front_corner(palette, outer)
    tile_upper_coping("West coping stone", "y", 1, DEPTH, palette, outer)
    for name, along, start, end, fixed in partitions:
        wall_run(name, along, start, end, fixed, LOW_WALL_HEIGHT, palette, inner)

    for index, x in enumerate((10.65, 14.35), start=1):
        box(f"Entrance pier {index} | base", x, 20.49, 0, 0.68, 0.94, 0.2,
            palette.stone[0], collection=outer)
        box(f"Entrance pier {index} | shaft", x, 20.49, 0.19, 0.57, 0.82, 1.24,
            palette.stone[2], collection=outer)
        box(f"Entrance pier {index} | capital", x, 20.49, 1.42, 0.69, 0.98, 0.18,
            palette.stone[3], collection=outer)

    for name in ("Entrance", "Library doorway", "Practice doorway", "Classroom doorway"):
        x, y, _ = DOORS[name]
        w, d = (2.98, 0.96) if name == "Entrance" else (0.96, 1.98)
        box(f"{name} | flush dressed threshold", x, y, -0.025, w, d, 0.03,
            palette.stone[3], 0.012, collection=inner)


def arched_top(left, right, spring, height, x):
    normalized = (x - (left + right) / 2) / ((right - left) / 2)
    return spring + height * math.sqrt(max(0, 1 - normalized ** 2))


def window_glass(index, code):
    pane = mat(f"Amber leaded glass | {index}", code, 0.08, 0.32, code, 0.32)
    tree = pane.node_tree
    surface = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    output = next(node for node in tree.nodes if node.type == "OUTPUT_MATERIAL")
    path = tree.nodes.new("ShaderNodeLightPath")
    transparent = tree.nodes.new("ShaderNodeBsdfTransparent")
    transparent.inputs["Color"].default_value = (0.96, 0.81, 0.57, 1.0)
    mix = tree.nodes.new("ShaderNodeMixShader")
    tree.links.new(path.outputs["Is Shadow Ray"], mix.inputs[0])
    tree.links.new(surface.outputs[0], mix.inputs[1])
    tree.links.new(transparent.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], output.inputs["Surface"])
    return pane


def arch_trim(name, left, right, bottom, spring, height, palette, target):
    for i, x in enumerate((left - 0.065, right + 0.065), 1):
        box(f"{name} | dressed jamb {i}", x, 0.99, bottom, 0.135, 0.18,
            spring - bottom, palette.stone[3], 0.013, collection=target)
    mid, radius = (left + right) / 2, (right - left) / 2
    for index in range(10):
        a0, a1 = (index + 0.02) * math.pi / 10, (index + 0.98) * math.pi / 10
        inner = [(mid + radius * math.cos(a), spring + height * math.sin(a)) for a in (a0, a1)]
        outer = [(mid + (radius + 0.14) * math.cos(a), spring + (height + 0.17) * math.sin(a))
                 for a in (a1, a0)]
        block = extrude_xz(f"{name} | arch stone {index + 1}", inner + outer,
                           1.10, 0.89, palette.stone[2 + index % 3], target)
        bevel_edges(block, 0.014)


@dataclass(frozen=True)
class RearOpening:
    name: str
    left: float
    right: float
    bottom: float = 0.93
    spring: float = 2.93
    rise: float = 0.77
    glazed: bool = True

    def outline(self, clearance=0.0):
        left, right = self.left - clearance, self.right + clearance
        # The stair slab covers the portal threshold. Separate the masonry from its top face.
        sill_clearance = 0.0 if self.glazed else 0.035
        bottom, rise = self.bottom - clearance - sill_clearance, self.rise + clearance
        samples = [right - (right - left) * i / 16 for i in range(17)]
        arch = [(x, arched_top(left, right, self.spring, rise, x)) for x in samples]
        return [(left, bottom), (right, bottom), *arch]


def glaze_window(opening, palette, glazing, target):
    name, left, right = opening.name, opening.left, opening.right
    bottom, spring, arch_height = opening.bottom, opening.spring, opening.rise
    span = right - left

    pane_y = 0.72
    columns = 2 if span < 2 else 3
    for i in range(columns):
        x0, x1 = left + span * i / columns, left + span * (i + 1) / columns
        xz_top = [(x1 - (x1 - x0) * step / 6, 0) for step in range(7)]
        xz_top = [(x, arched_top(left, right, spring, arch_height, x)) for x, _ in xz_top]
        outline = [(x0, bottom), (x1, bottom), *xz_top]
        mesh_object(f"{name} | amber pane {i + 1}", [world(x, pane_y, z) for x, z in outline],
                    [tuple(range(len(outline)))], [glazing[i % len(glazing)]], target)
        if i:
            beam(f"{name} | vertical mullion {i}", (x0, pane_y + 0.035, bottom),
                 (x0, pane_y + 0.035, arched_top(left, right, spring, arch_height, x0)),
                 0.065, 0.10, palette.frame, target)
        for j, center_z in enumerate((1.39, 2.00, 2.62), 1):
            center_x = (x0 + x1) / 2
            points = [(x0, center_z), (center_x, center_z + 0.29),
                      (x1, center_z), (center_x, center_z - 0.29), (x0, center_z)]
            for k, ((xa, za), (xb, zb)) in enumerate(zip(points, points[1:]), 1):
                beam(f"{name} | lead cames {i + 1}.{j}.{k}", (xa, pane_y + 0.046, za),
                     (xb, pane_y + 0.046, zb), 0.031, 0.052, palette.frame, target)


def xz_rectangle(left, bottom, right, top):
    return [(left, bottom), (right, bottom), (right, top), (left, top)]


def clean_outline(points):
    cleaned = []
    for point in points:
        if not cleaned or math.dist(cleaned[-1], point) > CLIP_EPSILON:
            cleaned.append(point)
    if len(cleaned) > 1 and math.dist(cleaned[0], cleaned[-1]) <= CLIP_EPSILON:
        cleaned.pop()
    if len(cleaned) < 3:
        return []
    x0, z0 = cleaned[0]
    area_twice = sum(
        (ax - x0) * (bz - z0) - (az - z0) * (bx - x0)
        for (ax, az), (bx, bz) in zip(cleaned[1:], cleaned[2:])
    )
    return cleaned if area_twice > 1e-12 else []


def split_outline(points, start, end):
    dx, dz = end[0] - start[0], end[1] - start[1]
    length = math.hypot(dx, dz)
    if length <= CLIP_EPSILON:
        return points, []

    def signed_distance(point):
        distance = (dx * (point[1] - start[1]) - dz * (point[0] - start[0])) / length
        return distance if abs(distance) > CLIP_EPSILON else 0.0

    inside, outside = [], []
    previous = points[-1]
    previous_distance = signed_distance(previous)
    for current in points:
        current_distance = signed_distance(current)
        if previous_distance * current_distance < 0:
            ratio = previous_distance / (previous_distance - current_distance)
            intersection = (previous[0] + ratio * (current[0] - previous[0]),
                            previous[1] + ratio * (current[1] - previous[1]))
            inside.append(intersection)
            outside.append(intersection)
        if current_distance >= 0:
            inside.append(current)
        if current_distance <= 0:
            outside.append(current)
        previous, previous_distance = current, current_distance
    return clean_outline(inside), clean_outline(outside)


def subtract_opening(outline, opening):
    """Return the convex fragments of an outline outside a convex window."""
    remaining = outline
    fragments = []
    for start, end in zip(opening, (*opening[1:], opening[0])):
        remaining, outside = split_outline(remaining, start, end)
        if not remaining:
            return [outline]
        if outside:
            fragments.append(outside)
    return fragments


def cut_out_openings(outline, openings):
    pieces = [outline]
    for opening in openings:
        pieces = [fragment for piece in pieces for fragment in subtract_opening(piece, opening)]
    return pieces


def masonry_prisms(name, outlines, palette, target, front_y, back_y):
    vertices, faces, indices = [], [], []
    for outline, material_index in outlines:
        prism_vertices, prism_faces = xz_prism(outline, front_y, back_y)
        start = len(vertices)
        vertices.extend(prism_vertices)
        faces.extend(tuple(start + index for index in face) for face in prism_faces)
        indices.extend([material_index] * len(prism_faces))
    mesh_object(name, vertices, faces, palette, target, indices)


def rear_masonry(openings, palette, target):
    profiles = [(opening, opening.outline()) for opening in openings]
    envelope = xz_rectangle(0, 0.006, WIDTH, UPPER_MASONRY_HEIGHT)
    # Keep the mortar's opening faces behind the visible cut-stone reveals.
    mortar = cut_out_openings(envelope, [opening.outline(0.025) for opening in openings])
    masonry_prisms("Rear wall | continuous mortar", [(piece, 0) for piece in mortar],
                   [palette.joints], target, front_y=0.979, back_y=0.021)

    # Each course starts at the wall edge. Openings trim it without resetting the joint pattern.
    rows = round(UPPER_MASONRY_HEIGHT / 0.32)
    course = UPPER_MASONRY_HEIGHT / rows
    rng = Random(1349)
    uncut, cut = [], []
    for row in range(rows):
        lower, upper = row * course + 0.006, (row + 1) * course - 0.006
        active = [(opening, outline) for opening, outline in profiles
                  if lower < opening.spring + opening.rise and upper > opening.bottom]
        start = 0.0
        while start < WIDTH:
            length = rng.uniform(0.78, 1.28) if start else rng.uniform(0.35, 1.02)
            end = min(start + length, WIDTH)
            if WIDTH - end < 0.24:
                end = WIDTH
            left, right = start + 0.007, end - 0.007
            index = rng.randrange(len(palette.stone))
            openings_under_brick = [outline for opening, outline in active
                                    if left < opening.right and right > opening.left]
            if openings_under_brick:
                footprint = xz_rectangle(left, lower, right, upper)
                cut.extend((piece, index) for piece in cut_out_openings(footprint, openings_under_brick))
            else:
                uncut.append(((left + right) / 2, 0.5, lower, right - left, 0.994, upper - lower, index))
            start = end
    blocks("Rear wall | full ashlar courses", uncut, palette.stone, target, 0.013)
    masonry_prisms("Rear wall | ashlar cut around openings", cut, palette.stone, target,
                   front_y=0.997, back_y=0.003)


def dress_reveal(opening, palette, target):
    along_depth = 0.32 if opening.glazed else 0.98
    center_y = 1.0 - along_depth / 2
    for label, x in (("west", opening.left - 0.006), ("east", opening.right + 0.006)):
        box(f"{opening.name} | recessed {label} jamb", x, center_y, opening.bottom, 0.034,
            along_depth, opening.spring - opening.bottom, palette.stone[2], 0.004, collection=target)
    if opening.glazed:
        box(f"{opening.name} | flush inner sill", (opening.left + opening.right) / 2,
            center_y, opening.bottom - 0.018, opening.right - opening.left, along_depth, 0.024,
            palette.stone[2], 0.004, collection=target)


def make_rear_wall(palette):
    target = collection("04 | Rear wall and leaded amber windows")
    glazing = [window_glass(index + 1, color) for index, color in
               enumerate(("e0a34e", "ffc978", "f1ac54"))]
    openings = (
        RearOpening("Library window west bay", 2, 3.38),
        RearOpening("Library window east bay", 3.62, 5),
        RearOpening("West hall window", 8, 10),
        RearOpening("Upper landing arch", *UPPER_PORTAL_SPAN, LANDING_Z,
                    UPPER_PORTAL_SPRING, UPPER_PORTAL_RISE, glazed=False),
        RearOpening("East hall window", 15, 17),
        RearOpening("Practice window west bay", 19, 20.88),
        RearOpening("Practice window east bay", 21.12, 23),
    )
    rear_masonry(openings, palette, target)
    for opening in openings:
        dress_reveal(opening, palette, target)
        arch_trim(opening.name, opening.left, opening.right, opening.bottom, opening.spring,
                  opening.rise, palette, target)
        if opening.glazed:
            glaze_window(opening, palette, glazing, target)
    tile_upper_coping("Rear coping stone", "x", 0, WIDTH, palette, target)


def make_stair(palette):
    target = collection("05 | Central staircase and upper landing")
    front, rear, steps = 5.05, 1.38, 10
    rise = LANDING_Z / steps
    tread = (front - rear) / steps
    for i in range(steps):
        y = front - (i + 0.5) * tread
        height = (i + 1) * rise
        box(f"Tread {i + 1:02d} | hewn limestone", 12.5, y, 0, 4.91, tread + 0.01, height,
            palette.stone[1 + i % 3], 0.018, collection=target)
        box(f"Tread {i + 1:02d} | nosing", 12.5, y + tread / 2 - 0.02,
            height - 0.052, 4.91, 0.12, 0.052, palette.stone[3], 0.017, collection=target)
    box("Upper landing | arrival slab", 12.5, rear / 2, 0, 3.0, rear + 0.01, LANDING_Z,
        palette.stone[1], 0.018, collection=target)

    for x, side in ((10.2, "west"), (14.8, "east")):
        for i in range(steps):
            y = front - (i + 0.5) * tread
            box(f"Stair {side} | cheek stone {i + 1:02d}", x, y, 0, 0.42, tread + 0.008,
                (i + 1) * rise + 0.30, palette.stone[2 + i % 2], 0.018, collection=target)
        beam(f"Stair {side} | sloping dressed cap", (x, rear, 2.16), (x, front, 0.44),
             0.47, 0.15, palette.stone[3], target)
        box(f"Stair {side} | foot pier", x, front - 0.03, 0, 0.54, 0.54, 0.65,
            palette.stone[3], collection=target)


def make_carpet(name, x, y, w, d, palette, target):
    box(f"{name} | wool body", x, y, 0.007, w, d, 0.036, palette.carpet, 0.016, collection=target)
    for edge_offset, width, material in ((0.035, 0.065, palette.dark_edge), (0.13, 0.036, palette.edge)):
        for direction in (-1, 1):
            box(f"{name} | end border", x, y + direction * (d / 2 - edge_offset), 0.043,
                w - edge_offset * 2, width, 0.008, material, 0.005, collection=target)
            box(f"{name} | side border", x + direction * (w / 2 - edge_offset), y, 0.043,
                width, d - edge_offset * 2, 0.008, material, 0.005, collection=target)
    for dx in (-1, 1):
        for dy in (-1, 1):
            box(f"{name} | corner stitch", x + dx * (w / 2 - 0.29), y + dy * (d / 2 - 0.29),
                0.044, 0.10, 0.10, 0.01, palette.edge, 0.003, 45, target)


def make_textiles(palette):
    target = collection("06 | Woven floor runners")
    surface_grain(palette.carpet, 32, 0.23, 0.035)
    make_carpet("Library carpet", 4.25, 7.05, 4.7, 9.55, palette, target)
    make_carpet("Classroom carpet", 21.25, 13.71, 4.92, 5.43, palette, target)
    make_carpet("Practice bench mat", 21.56, 3.65, 4.62, 2.65, palette, target)
    make_carpet("Reception runner", 3.86, 17.70, 3.7, 0.90, palette, target)


def make_connections(scene):
    target = collection("12 | Layout markers")
    for name, (x, y, z) in DOORS.items():
        anchor = bpy.data.objects.new(name, None)
        anchor.empty_display_type = "ARROWS"
        anchor.empty_display_size = 0.52
        anchor.location = world(x, y, z)
        target.objects.link(anchor)
    scene["design_reference"] = "first-floor-plan-v1.png / first-floor-3d-concept-v5.png"
    scene["floor_footprint_tiles"] = (WIDTH, DEPTH)
    scene["stair_landing_height"] = LANDING_Z
    scene["stair_portal_clear_height"] = UPPER_PORTAL_SPRING + UPPER_PORTAL_RISE - LANDING_Z


def add_camera(name, position, target_point, span, target):
    camera_data = bpy.data.cameras.new(name)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = span
    camera_data.clip_end = 200
    obj = bpy.data.objects.new(name, camera_data)
    target.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target_point) - obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


def add_light(name, kind, position, target_point, energy, color, target):
    data = bpy.data.lights.new(name, type=kind)
    data.energy = energy
    data.color = color
    light = bpy.data.objects.new(name, data)
    target.objects.link(light)
    light.location = position
    light.rotation_euler = (Vector(target_point) - light.location).to_track_quat("-Z", "Y").to_euler()
    return data


def stage_scene(scene, root, draft):
    target = collection("90 | Cameras and daylight", root)
    center = Vector(world(12.5, 10.31, 3.22))
    distance = 23
    offset = Vector((distance, -distance, math.sqrt(2) * distance * math.tan(math.radians(30))))
    scene.camera = add_camera("Academy | 2 to 1 isometric", center + offset, center, 36.7, target)
    add_camera("Academy | floor plan", world(12.5, 10.5, 48), world(12.5, 10.5, 0), 28.8, target)

    sunlight = add_light("Sun | amber afternoon from rear windows", "SUN", (-8, 25, 17),
                         (1.0, -6, 1), 3.65, (1.0, 0.76, 0.47), target)
    sunlight.angle = math.radians(0.8)
    for room, light_x, table_x in (("Library", 4.03, 4.85), ("Practice", 21.76, 22.0)):
        window_light = add_light(f"{room} | warm daylight through the leaded panes", "SPOT",
                                 world(light_x, -2.45, 3.72), world(table_x, 5.23, 0.07),
                                 1400, (1.0, 0.59, 0.29), target)
        window_light.spot_size = math.radians(35)
        window_light.spot_blend = 0.36
        window_light.shadow_soft_size = 0.065
    fill = add_light("Soft fill | open cutaway side", "AREA", (24, -24, 11),
                     world(12.5, 10.31, 1.55), 1560, (0.93, 0.91, 0.89), target)
    fill.shape = "DISK"
    fill.size = 15
    ceiling = add_light("Bounced ceiling light", "AREA", (7, -11, 13),
                        (11, -8, 0), 970, (1.0, 0.9, 0.78), target)
    ceiling.size = 12

    shading_world = scene.world or bpy.data.worlds.new("Academy studio world")
    scene.world = shading_world
    shading_world.use_nodes = True
    tree = shading_world.node_tree
    nodes = tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    light_path = nodes.new("ShaderNodeLightPath")
    fill_node = nodes.new("ShaderNodeBackground")
    fill_node.inputs["Color"].default_value = (0.45, 0.57, 0.72, 1)
    fill_node.inputs["Strength"].default_value = 0.18
    backdrop = nodes.new("ShaderNodeBackground")
    backdrop.inputs["Color"].default_value = (0.0035, 0.0038, 0.0041, 1)
    backdrop.inputs["Strength"].default_value = 0.56
    mix = nodes.new("ShaderNodeMixShader")
    tree.links.new(light_path.outputs["Is Camera Ray"], mix.inputs[0])
    tree.links.new(fill_node.outputs[0], mix.inputs[1])
    tree.links.new(backdrop.outputs[0], mix.inputs[2])
    tree.links.new(mix.outputs[0], output.inputs["Surface"])

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12 if draft else 36
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 12
    scene.render.resolution_x, scene.render.resolution_y = (920, 663) if draft else (1664, 1200)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.32
    scene.render.filepath = str(OUT.parents[4] / ".runtime" / "academy-first-floor-draft.png") if draft else f"//{PREVIEW_FILE.name}"

    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.region_3d.view_perspective = "CAMERA"
                area.spaces.active.overlay.show_extras = False
                area.spaces.active.shading.color_type = "MATERIAL"


def build():
    draft = "--draft" in sys.argv
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Arcana | Magic Academy First Floor"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["upper_wall_height"] = UPPER_WALL_HEIGHT
    root = collection("Academy | First floor", scene.collection)
    palette = make_palette()
    make_floor(palette)
    make_cutaway(palette)
    make_rear_wall(palette)
    make_stair(palette)
    make_textiles(palette)
    make_connections(scene)

    sys.dont_write_bytecode = True
    sys.path.insert(0, str(OUT))
    from furniture import build_furniture
    from magic import build_magic

    api = SimpleNamespace(mat=mat, box=box, collection=collection)
    build_furniture(api)
    build_magic(api)

    stage_scene(scene, root, draft)
    scene.render.use_file_extension = True
    if not draft:
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(HERO_FILE), compress=True)
    bpy.ops.render.render(write_still=True)
    print(f"ACADEMY_READY objects={len(scene.objects)} render={scene.render.filepath}")


if __name__ == "__main__":
    build()
