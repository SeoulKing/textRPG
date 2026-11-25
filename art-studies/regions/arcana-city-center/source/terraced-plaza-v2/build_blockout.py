"""Build the detached plaza study from its XZ layout. Run with Blender in background."""

import argparse
import json
import math
from functools import lru_cache
from pathlib import Path
import sys

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
STONE = "#e0c8a1"
TRIM = "#f3e3c4"
WALL = "#b49473"
WOOD = "#5e4638"
GLASS = "#eab969"
PATH = "#bba98e"
LEAF = "#82936e"


@lru_cache(maxsize=None)
def material(color):
    channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    rgb = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels)
    value = bpy.data.materials.new(color)
    value.diffuse_color = (*rgb, 1)
    if value.node_tree is None:
        value.use_nodes = True
    shader = next(n for n in value.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = value.diffuse_color
    shader.inputs["Roughness"].default_value = 0.8
    return value


def collection(scene, name):
    value = bpy.data.collections.new(name)
    scene.collection.children.link(value)
    return value


def mesh(group, name, vertices, faces, color):
    data = bpy.data.meshes.new(name)
    # Godot XZ maps to Blender X/-Y. Reverse winding after the axis conversion.
    data.from_pydata([(x, -z, y) for x, z, y in vertices], [], [tuple(reversed(f)) for f in faces])
    data.update()
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    data.materials.append(material(color))
    return obj


def prism(group, name, polygon, low, high, color):
    count = len(polygon)
    vertices = [(x, z, height) for height in (low, high) for x, z in polygon]
    faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count) for i in range(count))
    return mesh(group, name, vertices, faces, color)


def box(group, name, rect, low, high, color):
    x0, z0, x1, z1 = rect
    return prism(group, name, [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], low, high, color)


def round_edge(center, radius, count=48):
    return [(center[0] + radius * math.cos(i * math.tau / count),
             center[1] + radius * math.sin(i * math.tau / count)) for i in range(count)]


def ring(group, name, center, outer, inner, low, high, color):
    outside, inside = round_edge(center, outer), round_edge(center, inner)
    count = len(outside)
    vertices = [(x, z, height) for height in (low, high) for loop in (outside, inside) for x, z in loop]
    faces = []
    for i in range(count):
        j = (i + 1) % count
        faces.extend(((i, j, j + 2 * count, i + 2 * count),
                      (j + count, i + count, i + 3 * count, j + 3 * count),
                      (i + 2 * count, j + 2 * count, j + 3 * count, i + 3 * count),
                      (j, i, i + count, j + count)))
    return mesh(group, name, vertices, faces, color)


def street(group, name, points, width, height, color):
    points = [Vector(p) for p in points]
    normals = [Vector((-d.y, d.x)).normalized() for d in (b - a for a, b in zip(points, points[1:]))]
    offsets = [normals[0] * width / 2]
    for left, right in zip(normals, normals[1:]):
        bisector = (left + right).normalized()
        offsets.append(bisector * (width / 2 / bisector.dot(left)))
    offsets.append(normals[-1] * width / 2)
    a = [tuple(p + n) for p, n in zip(points, offsets)]
    b = [tuple(p - n) for p, n in zip(points, offsets)]
    return prism(group, name, b + a[::-1], height, height + 0.025, color)


def roof(group, name, rect, wall_top, rise, color):
    x0, z0, x1, z1 = rect
    middle = (z0 + z1) / 2
    vertices = [(x, z, y) for x in (x0, x1) for z, y in
                ((z0, wall_top), (z1, wall_top), (middle, wall_top + rise))]
    faces = [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (0, 3, 5, 2), (1, 2, 5, 4)]
    return mesh(group, name, vertices, faces, color)


def front_panel(group, name, x, z, height, width, panel_height, color):
    return box(group, name, (x - width / 2, z, x + width / 2, z + 0.065),
               height, height + panel_height, color)


def front_window(group, x, z, height, width, panel_height):
    front_panel(group, "Window frame", x, z, height, width + 0.16, panel_height + 0.14, TRIM)
    front_panel(group, "Glazing", x, z + 0.07, height + 0.075, width, panel_height, GLASS)
    front_panel(group, "Mullion", x, z + 0.14, height + 0.075, 0.08, panel_height, WOOD)


def arch_panel(group, name, x, z, base, radius, springline, color):
    points = [(x - radius, z, base), (x + radius, z, base)]
    points.extend((x + radius * math.cos(i * math.pi / 12), z,
                   base + springline + radius * math.sin(i * math.pi / 12)) for i in range(13))
    return mesh(group, name, points, [tuple(reversed(range(len(points))))], color)


def awning(group, x, z, height, width, color):
    stripe = width / 7
    for i in range(7):
        a = x - width / 2 + i * stripe
        b = a + stripe
        mesh(group, "Canvas stripe", [(a, z, height), (b, z, height),
             (b, z + 0.78, height - 0.28), (a, z + 0.78, height - 0.28)],
             [(0, 1, 2, 3)], color if i % 2 == 0 else TRIM)


def building(group, spec):
    x0, z0, x1, z1 = spec["rect"]
    x = (x0 + x1) / 2
    width = x1 - x0
    base = spec["base"]
    top = base + spec["wall"]
    kind = spec["kind"]
    color = spec["color"]
    facade = {"restaurant": "#e5bb9b", "home": "#d4c9a2", "academy": "#d4bc99"}.get(kind, STONE)
    box(group, "Walls", spec["rect"], base, top, facade)
    box(group, "Stone base", (x0 - 0.08, z0 - 0.08, x1 + 0.08, z1 + 0.08), base, base + 0.25, WALL)
    roof(group, "Main roof", (x0 - 0.24, z0 - 0.24, x1 + 0.24, z1 + 0.24), top, spec["roof"], color)
    box(group, "Eaves", (x0 - 0.22, z0 - 0.22, x1 + 0.22, z1 + 0.22), top - 0.12, top + 0.03, WOOD)
    if kind == "academy":
        for offset in (-7.4, 7.4):
            a = x + offset
            rect = (a - 1.55, z1 - 2.8, a + 1.55, z1 - 0.12)
            box(group, "Academy tower", rect, base, top + 1.9, TRIM)
            roof(group, "Tower roof", rect, top + 1.9, 2.6, color)
            front_window(group, a, z1 + 0.02, top - 0.2, 0.52, 1.5)
        arch_panel(group, "Portico", x, z1 + 0.06, base, 1.63, 2.38, TRIM)
        arch_panel(group, "Academy doors", x, z1 + 0.12, base, 1.25, 2.18, WOOD)
        front_panel(group, "Door seam", x, z1 + 0.12, base, 0.055, 2.95, TRIM)
        for offset in (-4.8, 4.8):
            front_window(group, x + offset, z1, base + 1.75, 0.85, 2.05)
        return

    front_panel(group, "Door surround", x, z1, base, 1.35, 2.25, TRIM)
    front_panel(group, "Door", x, z1 + 0.07, base, 0.98, 1.99, WOOD)
    for offset in (-0.31 * width, 0.31 * width):
        front_window(group, x + offset, z1, base + 0.82, min(1.45, width / 5), 1.05)
        if spec["wall"] >= 3.65:
            front_window(group, x + offset, z1, base + 2.65, 0.82, 0.96)
    if kind in ("shop", "restaurant"):
        awning(group, x, z1 + 0.12, base + 2.68, width * 0.86, color)
    if kind in ("inn", "home", "rowhouse"):
        chimney = (x1 - 1.65, z0 + 1.5, x1 - 1.12, z0 + 2.05)
        box(group, "Chimney", chimney, top, top + spec["roof"] + 0.38, WALL)


def steps(group, spec):
    x0, z0, x1, z1 = spec["rect"]
    rise = spec["high"] - spec["low"]
    count = round(rise / 0.2)
    tread = (z1 - z0) / count
    for i in range(count):
        run = (x0, z0 + tread * i, x1, z0 + tread * (i + 1))
        height = spec["high"] - i * rise / count
        box(group, f"Tread {i + 1:02}", run, spec["low"], height, TRIM if i % 2 else STONE)


def lantern(group, x, z, ground):
    box(group, "Lamp base", (x - 0.2, z - 0.2, x + 0.2, z + 0.2), ground, ground + 0.3, STONE)
    box(group, "Lamp post", (x - 0.075, z - 0.075, x + 0.075, z + 0.075), ground + 0.3, ground + 2.1, WOOD)
    box(group, "Lantern glass", (x - 0.17, z - 0.17, x + 0.17, z + 0.17), ground + 1.97, ground + 2.36, GLASS)
    roof(group, "Lantern cap", (x - 0.22, z - 0.22, x + 0.22, z + 0.22), ground + 2.36, 0.18, WOOD)


def tree(group, x, z, ground, scale):
    for dx, dz, radius, start, end, color in ((0, 0, 0.19, 0, 2.6, WOOD),
            (-0.48, 0, 1.2, 2.0, 3.6, "#6b8565"), (0.45, 0.2, 1.05, 2.15, 3.8, LEAF),
            (0, -0.22, 0.97, 2.75, 4.2, "#a1a67b")):
        outline = round_edge((x + dx * scale, z + dz * scale), radius * scale, 7)
        prism(group, "Tree canopy" if start else "Tree trunk", outline,
              ground + start * scale, ground + end * scale, color)


def scenery(scene, water):
    detail = collection(scene, "04 Street furniture and landmarks")
    for item in water:
        center, radius = item["center"], item["radius"]
        fountain = item["id"] == "north_star"
        rim = 0.55 if fountain else 0.28
        ring(detail, "Stone rim", center, radius, radius - 0.24, 0.03, rim, STONE)
        # Fill the opening below the rim with a separate, flat water surface.
        prism(detail, "Water", round_edge(center, radius - 0.24), 0.025, rim - 0.10, "#509ca1")
        if fountain:
            ring(detail, "Lapis mosaic", center, 3.9, 3.1, 0.055, 0.075, "#3b6488")
            ring(detail, "Brass mosaic edge", center, 4.03, 3.9, 0.055, 0.075, "#bd9356")
            prism(detail, "Fountain pedestal", round_edge(center, 0.48, 10), 0.35, 1.65, TRIM)
            x, z = center
            star = []
            for i in range(8):
                angle = i * math.tau / 8
                length = 0.8 if i % 2 == 0 else 0.25
                star.append((x + math.cos(angle) * length, z, 2.10 + math.sin(angle) * length))
            mesh(detail, "North star", star, [tuple(range(8))], "#d0a756")
    for x, z, y in ((-3.1, 13, 0), (3.1, 13, 0), (-11.5, -6, 0), (12.2, 7.2, 0),
                    (16, -5.6, 0), (20, -13.2, 0), (28, -13.2, 0), (-8, -17.25, 1.2), (6, -17.25, 1.2)):
        lantern(detail, x, z, y)
    for x, z, ground, scale in ((-10.2, 8, 0, 1.12), (-13.5, 6.6, 0, 0.94), (-11.2, 12.6, 0, 0.97),
                                 (8, 10, 0, 0.92), (16.8, 7, 0, 1.07), (20.8, -11.6, 0, .82),
                                 (32.6, -11.7, 0, .88), (28.2, 9.5, 0, .98), (-21, -14, 0, 0.78),
                                 (-20.5, -25.5, 2.4, 0.74), (8.3, -28.2, 2.4, 0.93)):
        tree(detail, x, z, ground, scale)
    for x, color in ((-11.8, "#af674d"), (-6.5, "#6b897a"), (2.8, "#ba8a57")):
        z = -21.55
        box(detail, "Market counter", (x - 0.8, z, x + 0.8, z + 0.65), 1.2, 2.0, WOOD)
        for post in (x - 0.69, x + 0.69):
            box(detail, "Market post", (post - 0.055, z + 0.58, post + 0.055, z + 0.69), 1.2, 3.0, WOOD)
        awning(detail, x, z + 0.04, 3.05, 1.9, color)
    for x, z in ((-7.9, 5.7), (1.4, -17.42)):
        height = 1.2 if z < 0 else 0
        box(detail, "Bench seat", (x - 0.84, z - 0.2, x + 0.84, z + 0.2), height + 0.36, height + 0.47, WOOD)
        box(detail, "Bench back", (x - 0.84, z - 0.23, x + 0.84, z - 0.15), height + 0.5, height + 0.78, WOOD)
        for foot in (x - 0.62, x + 0.62):
            box(detail, "Bench support", (foot - 0.08, z - 0.18, foot + 0.08, z + 0.16),
                height, height + 0.49, WALL)


def configure_scene(scene):
    target = Vector((8, 2.0, 0.5))
    direction = Vector((math.sqrt(3 / 8), -math.sqrt(3 / 8), 0.5))
    data = bpy.data.cameras.new("2 to 1 orthographic")
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    camera.location = target + 100 * direction
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    data.type = "ORTHO"
    data.ortho_scale = 94
    scene.camera = camera

    sun_data = bpy.data.lights.new("Afternoon sun", "SUN")
    sun = bpy.data.objects.new(sun_data.name, sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(26), math.radians(-36), math.radians(-29))
    sun_data.energy = 2.5
    sun_data.angle = 0.10
    scene.world = bpy.data.worlds.new("Outdoor sky")
    if scene.world.node_tree is None:
        scene.world.use_nodes = True
    background = next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND")
    background.inputs["Color"].default_value = (0.58, 0.69, 0.84, 1)
    background.inputs["Strength"].default_value = 0.55
    scene.view_settings.view_transform = "AgX"
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1040
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                space = area.spaces.active
                space.region_3d.view_location = target
                space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
                space.region_3d.view_distance = 72
                space.region_3d.view_perspective = "ORTHO"
                space.shading.color_type = "MATERIAL"
                space.overlay.show_overlays = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layout", type=Path, default=HERE / "layout.json")
    parser.add_argument("--blend", type=Path, default=HERE / "arcana-terraced-plaza.blend")
    parser.add_argument("--render", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    layout = json.loads(args.layout.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Arcana · Terraced Plaza Study"
    terrain = collection(scene, "01 Ground and terraces")
    box(terrain, "64 by 64 site", layout["bounds"], -0.8, 0, "#aab391")
    for terrace in layout["terraces"]:
        rect = terrace["rect"]
        height = terrace["height"]
        box(terrain, terrace["id"], rect, 0, height - 0.12, WALL)
        box(terrain, "Terrace coping and paving", rect, height - 0.12, height, STONE)
    for stair in layout["stairs"]:
        steps(terrain, stair)
    roads = collection(scene, "02 Streets and forecourt")
    for surface in layout.get("paved_areas", []):
        prism(roads, surface["id"], surface["points"], surface["base"], surface["height"], STONE)
    for i, route in enumerate(layout["roads"]):
        street(roads, f"Existing route {i + 1:02}", route["points"], route["width"], i * 0.0002, PATH)
    for i, route in enumerate(layout.get("lanes", [])):
        # Layer intersecting surfaces so Cycles resolves the crossing consistently.
        surface_height = route["height"] + 0.004 + i * 0.0002
        street(roads, "New lane", route["points"], route["width"], surface_height, "#c7a983")
    for spec in layout["buildings"]:
        group = collection(scene, f"03 Building · {spec['id']}")
        building(group, spec)
    scenery(scene, layout["water"])
    configure_scene(scene)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))
    scene.render.filepath = str(args.render.resolve())
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
