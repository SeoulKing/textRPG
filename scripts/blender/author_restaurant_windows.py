"""Build and export the open arched window and its two coastal views."""

from math import cos, pi, sin
from pathlib import Path
from random import Random

import bpy
from mathutils import Vector


OUTPUT = Path(__file__).resolve().parents[2] / "godot-arcana/art/source/restaurant-brunch/architecture"
RADIUS = 1.05
SPRING = 1.0
ARCH_STEPS = 24


def rgba(hex_rgb):
    channels = [int(hex_rgb[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    linear = [channel / 12.92 if channel < 0.04045 else
              ((channel + 0.055) / 1.055) ** 2.4 for channel in channels]
    return (*linear, 1.0)


def material(name, rgb, roughness=0.75, metallic=0.0, unlit=False):
    result = bpy.data.materials.new(name)
    color = rgba(rgb)
    result.diffuse_color = color
    result.use_nodes = True
    nodes = result.node_tree.nodes
    if unlit:
        nodes.clear()
        output = nodes.new("ShaderNodeOutputMaterial")
        ray = nodes.new("ShaderNodeLightPath")
        mix = nodes.new("ShaderNodeMixShader")
        transparent = nodes.new("ShaderNodeBsdfTransparent")
        emission = nodes.new("ShaderNodeEmission")
        emission.inputs[0].default_value = color
        links = result.node_tree.links
        links.new(ray.outputs["Is Camera Ray"], mix.inputs[0])
        links.new(transparent.outputs[0], mix.inputs[1])
        links.new(emission.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], output.inputs["Surface"])
    else:
        shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Roughness"].default_value = roughness
        shader.inputs["Metallic"].default_value = metallic
    return result


def collection(name):
    group = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(group)
    return group


class MeshSet:
    """Batch simple solids and relief silhouettes with named surfaces."""

    def __init__(self):
        self.parts = {}

    def add(self, name, vertices, faces, finish):
        vertices_out, faces_out, finishes = self.parts.setdefault(name, ([], [], []))
        offset = len(vertices_out)
        vertices_out.extend(vertices)
        faces_out.extend(tuple(index + offset for index in face) for face in faces)
        finishes.extend([finish] * len(faces))

    def prism(self, name, outline, front, back, finish):
        # The outline is counter-clockwise in X/Z, so its front faces -Y.
        n = len(outline)
        vertices = [(x, depth, z) for depth in (front, back) for x, z in outline]
        faces = [tuple(range(n)), tuple(reversed(range(n, n * 2)))]
        for index in range(n):
            next_index = (index + 1) % n
            faces.append((index, index + n, next_index + n, next_index))
        self.add(name, vertices, faces, finish)

    def box(self, name, left, right, bottom, top, front, back, finish):
        self.prism(name, [(left, bottom), (right, bottom), (right, top), (left, top)],
                   front, back, finish)

    def plane(self, name, points, depth, finish):
        self.add(name, [(x, depth, z) for x, z in points], [tuple(range(len(points)))], finish)

    def rectangle(self, name, left, right, bottom, top, depth, finish):
        self.plane(name, [(left, bottom), (right, bottom), (right, top), (left, top)],
                   depth, finish)

    def cylinder(self, name, start, end, radius, finish, sides=8, end_radius=None):
        axis = Vector(end) - Vector(start)
        normal = axis.normalized()
        reference = Vector((0, 1, 0)) if abs(normal.y) < 0.9 else Vector((1, 0, 0))
        u = normal.cross(reference).normalized()
        v = normal.cross(u)
        vertices = []
        for center, width in ((start, radius), (end, end_radius or radius)):
            for index in range(sides):
                theta = 2 * pi * index / sides
                vertices.append(Vector(center) + width * (cos(theta) * u + sin(theta) * v))
        faces = [tuple(reversed(range(sides))), tuple(range(sides, 2 * sides))]
        for index in range(sides):
            following = (index + 1) % sides
            faces.append((index, following, following + sides, index + sides))
        self.add(name, vertices, faces, finish)

    def create(self, parent):
        for name, (vertices, faces, finishes) in self.parts.items():
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(vertices, [], faces)
            mesh.update()
            slots = {}
            for polygon, finish in zip(mesh.polygons, finishes):
                if finish not in slots:
                    slots[finish] = len(slots)
                    mesh.materials.append(finish)
                polygon.material_index = slots[finish]
            obj = bpy.data.objects.new(name, mesh)
            parent.objects.link(obj)


def arc_point(radius, angle):
    return (radius * cos(angle), SPRING + radius * sin(angle))


def arc_segment(geometry, name, inner, outer, start, stop, front, back, finish):
    geometry.prism(name, [arc_point(inner, start), arc_point(outer, start),
                         arc_point(outer, stop), arc_point(inner, stop)],
                   front, back, finish)


def make_window(parent):
    geometry = MeshSet()
    stone = [material("Limestone • " + label, color) for label, color in
             (("warm", "D8BC91"), ("pale", "E9CC9F"), ("sand", "CBAC81"))]
    blue = material("Sea-blue linseed paint", "467585")
    blue_light = material("Sea-blue frame edge", "6B99A4")
    blue_shadow = material("Sea-blue painted rebate", "325766")
    brass = material("Old satin brass", "AD7F42", 0.4, 0.25)
    linen = [material("Ecru curtain • " + label, color) for label, color in
             (("light", "F3E3BD"), ("fold", "E3CE9D"), ("crease", "D0BA8F"))]
    stripe = material("Woven blue thread", "6F97A5")
    clay = material("Sill pot • hand-fired clay", "A96546")
    rim = material("Sill pot • rubbed edge", "CF9064")
    soil = material("Sill pot • soil", "5F4936")
    leaf = material("Sill thyme • green", "6F8749")
    leaf_light = material("Sill thyme • sunlit green", "91A355")

    # The stone trim straddles the inner edge of the masonry aperture.
    outside = 1.195
    for index in range(ARCH_STEPS):
        start = index * pi / ARCH_STEPS
        stop = (index + 1) * pi / ARCH_STEPS
        arch_color = stone[(0, 1, 0, 2, 0, 1)[index % 6]]
        arc_segment(geometry, "Dressed limestone arch", 1.052, outside, start, stop,
                    -0.086, 0.028, arch_color)
        arc_segment(geometry, "Limestone rolled inner edge", 1.033, 1.065, start, stop,
                    -0.102, 0.064, stone[1])
        arc_segment(geometry, "Blue sash arch", 0.966, 1.047, start, stop,
                    -0.038, 0.096, blue)
        arc_segment(geometry, "Blue sash inner bead", 0.953, 0.975, start, stop,
                    -0.051, 0.006, blue_light)
        arc_segment(geometry, "Blue sash depth", 0.974, 1.047, start, stop,
                    0.097, 0.139, blue_shadow)

    for sign in (-1, 1):
        left, right = sorted((sign * RADIUS, sign * outside))
        geometry.box("Dressed limestone jambs", left, right, 0, SPRING,
                     -0.086, 0.028, stone[0])
        left, right = sorted((sign * 1.033, sign * 1.065))
        geometry.box("Limestone rolled inner edge", left, right, 0, SPRING,
                     -0.102, 0.064, stone[1])
        left, right = sorted((sign * 0.966, sign * 1.047))
        geometry.box("Blue sash jambs", left, right, 0, SPRING,
                     -0.038, 0.139, blue)
        left, right = sorted((sign * 0.953, sign * 0.975))
        geometry.box("Blue sash inner bead", left, right, 0.035, SPRING,
                     -0.051, 0.006, blue_light)

    geometry.box("Cut limestone sill", -1.225, 1.225, -0.085, 0.006,
                 -0.302, 0.16, stone[0])
    geometry.box("Cut limestone sill nosing", -1.245, 1.245, -0.036, 0.013,
                 -0.313, -0.248, stone[1])
    geometry.box("Blue sash foot", -1.047, 1.047, 0.014, 0.071, -0.037, 0.105, blue)
    geometry.box("Blue sash mullion", -0.034, 0.034, 0.054, 1.99, -0.031, 0.091, blue)
    geometry.box("Blue spring line transom", -0.975, 0.975, 0.972, 1.031,
                 -0.033, 0.091, blue)
    geometry.box("Mullion highlight", -0.026, -0.014, 0.065, 1.985,
                 -0.038, -0.032, blue_light)

    for sign in (-1, 1):
        inner, outer = sorted((sign * 0.875, sign * 1.246))
        rod_height = 1.48
        geometry.cylinder("Brass curtain rails", (inner - 0.028, -0.180, rod_height),
                          (outer + 0.028, -0.180, rod_height), 0.013, brass, 10)
        for x in (inner - 0.025, outer + 0.025):
            geometry.cylinder("Brass curtain brackets", (x, -0.02, rod_height),
                              (x, -0.183, rod_height), 0.016, brass, 8)
        segments = 12
        heights = (0.152, 0.205, 0.219, 0.258, 0.276, 0.510, 1.437)
        vertices = []
        for z in heights:
            spread = 1.0 if z < 0.5 else 0.88
            for index in range(segments + 1):
                ratio = index / segments
                x = inner + (outer - inner) * ratio * spread
                y = -0.192 - 0.066 * cos(index * pi / 2) - 0.018 * (z / rod_height)
                vertices.append((x, y, z - 0.014 * cos(index * pi / 2)))
        for row in range(len(heights) - 1):
            for index in range(segments):
                base = row * (segments + 1) + index
                face = (base, base + 1, base + segments + 2, base + segments + 1)
                finish = stripe if row in (1, 3) else linen[(0, 1, 2, 1)[index % 4]]
                geometry.add("Blue-striped linen side panels",
                             [vertices[vertex] for vertex in face], [(0, 1, 2, 3)], finish)
        for index in range(6):
            x = inner + (outer - inner) * (index + 0.25) / 6 * 0.88
            geometry.cylinder("Curtain loops", (x, -0.184, 1.437),
                              (x, -0.184, 1.486), 0.008, brass, 6)

    x, y = 0.64, -0.185
    geometry.cylinder("Terracotta thyme pot", (x, y, 0.014), (x, y, 0.148),
                      0.062, clay, 10, 0.091)
    geometry.cylinder("Terracotta thyme pot", (x, y, 0.138), (x, y, 0.163),
                      0.095, rim, 10)
    geometry.cylinder("Terracotta thyme pot", (x, y, 0.161), (x, y, 0.166),
                      0.079, soil, 10)
    for index in range(8):
        angle = index * pi / 4 + 0.17
        reach = 0.061 + 0.012 * (index % 3)
        tip = Vector((x + cos(angle) * reach, y + sin(angle) * reach,
                      0.27 + 0.022 * (index % 4)))
        geometry.cylinder("Thyme stems", (x, y, 0.165), tip, 0.004, leaf, 5)
        for altitude in (-0.037, 0.0):
            base = tip + Vector((0, 0, altitude))
            forward = Vector((cos(angle), sin(angle), 0.65))
            side = Vector((-sin(angle), cos(angle), 0))
            points = (base, base + forward * 0.016 + side * 0.014,
                      base + forward * 0.042, base + forward * 0.016 - side * 0.014,
                      base + forward * 0.021 + Vector((0, 0, 0.008)))
            geometry.add("Thyme leaves", points, [(0, 1, 4), (1, 2, 4)], leaf_light)
            geometry.add("Thyme leaves", points, [(2, 3, 4), (3, 0, 4)], leaf)
    geometry.create(parent)


def make_harbor(parent, view):
    geometry = MeshSet()
    palette = {
        "sky": "9BD2E7", "haze": "E5E9DF", "cloud": "F6EFD5",
        "hill": "8AAD96", "headland": "709B83", "harbor": "6AAEB2",
        "water": "5EA8B6", "near_water": "89BEC2", "wave": "A6D2C7",
        "foam": "C6DBCC", "shadow_water": "4D9BA7", "quay": "A89877",
        "quay_dark": "706655", "light_wood": "CDB484", "wood": "9D7854",
        "wood_dark": "6D513F", "sail": "EEE0B8", "sail_shadow": "D3C29E",
        "plaster": "EDD5A9", "plaster_shade": "D8BC93", "roof": "B57D60",
        "roof_shade": "825649", "shutter": "5D8B91", "blue_dark": "4A6973",
    }
    finish = {key: material(f"Harbor view • {key}", rgb, unlit=True)
              for key, rgb in palette.items()}
    rng = Random(704 + 31 * view)

    def rect(name, l, r, b, t, depth, tone):
        geometry.rectangle(name, l, r, b, t, depth, finish[tone])

    def shape(name, depth, tone, points):
        geometry.plane(name, points, depth, finish[tone])

    rect("Sky and water", -1.59, 1.59, -0.46, 2.20, 0.490, "sky")
    rect("Sky and water", -1.59, 1.59, -0.46, 0.83, 0.488, "water")
    rect("Sky and water", -1.59, 1.59, 0.61, 0.83, 0.485, "harbor")
    rect("Sky and water", -1.59, 1.59, 0.82, 0.94, 0.485, "haze")

    for x, z, width in ((-1.30, 1.67, 0.66), (-0.16, 1.93, 0.74), (0.72, 1.59, 0.87)):
        shape("Stepped seaside clouds", 0.480, "cloud",
              [(x, z), (x + width, z), (x + width, z + 0.055),
               (x + width * 0.79, z + 0.055), (x + width * 0.79, z + 0.105),
               (x + width * 0.56, z + 0.105), (x + width * 0.56, z + 0.16),
               (x + width * 0.29, z + 0.16), (x + width * 0.29, z + 0.105),
               (x + width * 0.14, z + 0.105), (x + width * 0.14, z + 0.055),
               (x, z + 0.055)])

    shape("Distant coast", 0.472, "hill",
          [(-1.59, 0.725), (1.59, 0.725), (1.59, 0.98), (1.28, 1.14),
           (0.84, 1.18), (0.40, 0.98), (-0.18, 0.91), (-0.71, 1.02),
           (-1.18, 1.20), (-1.59, 1.18)])
    shape("Distant coast", 0.470, "headland",
          [(-1.59, 0.73), (0.26, 0.73), (0.26, 0.80), (-0.19, 0.85),
           (-0.79, 0.97), (-1.27, 0.96), (-1.59, 1.08)])

    if view == 0:
        buildings = ((-1.46, 0.20, 0.27), (0.84, 0.24, 0.25), (1.08, 0.21, 0.29))
    else:
        buildings = ((-1.36, 0.26, 0.30), (-1.10, 0.27, 0.43), (-0.82, 0.30, 0.34),
                     (-0.50, 0.27, 0.37), (-0.19, 0.28, 0.42), (0.11, 0.25, 0.33),
                     (0.37, 0.26, 0.28), (0.64, 0.27, 0.38), (0.98, 0.25, 0.27))
    for index, (left, width, height) in enumerate(buildings):
        right = left + width
        base = 0.76
        upper = base + height
        rect("Small limestone harbor houses", left, right, base, upper, 0.451, "plaster")
        rect("Small limestone harbor houses", right - width * 0.26, right, base, upper,
             0.447, "plaster_shade")
        roof_tone = "roof_shade" if index % 3 == 0 else "roof"
        shape("Low terracotta rooftops", 0.444, roof_tone,
              [(left - 0.035, upper - 0.01), (right + 0.035, upper - 0.01),
               (right - 0.02, upper + 0.065), (left + width * 0.34, upper + 0.095)])
        rect("Painted shutters", left + 0.045, left + 0.087, base + 0.13, base + 0.22,
             0.442, "shutter")
        rect("Painted shutters", right - 0.09, right - 0.045, base + 0.125, base + 0.215,
             0.442, "shutter")
        rect("Painted shutters", left + width * 0.35, left + width * 0.51, base,
             base + 0.098, 0.442, "blue_dark")

    rect("Quay stones", -1.59, 1.59, 0.685, 0.758, 0.435, "quay_dark")
    for index in range(23):
        start = -1.58 + index * 0.14
        rect("Quay stones", start, min(1.59, start + 0.122), 0.712, 0.745, 0.431, "quay")

    for index in range(89):
        z = rng.uniform(-0.28, 0.673)
        x = rng.uniform(-1.58, 1.53)
        width = rng.uniform(0.05, 0.18) * (1.35 - z * 0.5)
        tone = rng.choice(("near_water", "wave", "shadow_water", "foam", "water"))
        offset = (index % 3) * 0.0005
        rect("Short sunlit ripples", x, min(1.59, x + width), z,
             z + rng.uniform(0.009, 0.021), 0.422 + offset, tone)

    if view == 0:
        # Foreground sailboat. The warm sail shape sits against a blue inlet.
        x = 0.08
        z = 0.21
        shape("Sailboat hull and mast", 0.385, "wood_dark",
              [(x - 0.46, z + 0.17), (x - 0.34, z + 0.02), (x + 0.27, z - 0.015),
               (x + 0.52, z + 0.20), (x + 0.16, z + 0.12), (x - 0.25, z + 0.14)])
        shape("Sailboat hull and mast", 0.383, "light_wood",
              [(x - 0.46, z + 0.17), (x - 0.25, z + 0.10), (x + 0.16, z + 0.075),
               (x + 0.52, z + 0.20), (x + 0.16, z + 0.13), (x - 0.25, z + 0.15)])
        rect("Sailboat hull and mast", x - 0.008, x + 0.023, z + 0.113, z + 1.17,
             0.382, "wood_dark")
        shape("Linen sails", 0.381, "sail",
              [(x - 0.37, z + 0.29), (x - 0.027, z + 0.27), (x - 0.024, z + 1.12),
               (x - 0.08, z + 0.90), (x - 0.20, z + 0.52)])
        shape("Linen sails", 0.380, "sail_shadow",
              [(x + 0.039, z + 0.25), (x + 0.33, z + 0.29), (x + 0.155, z + 0.50),
               (x + 0.042, z + 0.95)])
        shape("Sailboat pennant", 0.379, "roof",
              [(x + 0.019, z + 1.14), (x + 0.24, z + 1.16),
               (x + 0.135, z + 1.22), (x + 0.019, z + 1.23)])

    # Near boardwalk at the bottom, with enough overdraw for the angled camera.
    shape("Near oak boardwalk", 0.335, "wood",
          [(-1.59, -0.46), (1.59, -0.46), (1.59, 0.10), (-1.59, -0.06)])
    shape("Near oak boardwalk", 0.330, "light_wood",
          [(-1.59, -0.062), (1.59, 0.10), (1.59, 0.155), (-1.59, -0.008)])
    for index in range(20):
        x = -1.55 + index * 0.16
        z = -0.061 + (x + 1.59) * 0.05
        shape("Near oak boardwalk", 0.329, "wood_dark",
              [(max(-1.59, x - 0.15), -0.46), (max(-1.59, x - 0.128), -0.46), (x + 0.018, z),
               (x, z)])
    for x in (-1.14, 0.75):
        z = -0.047 + (x + 1.59) * 0.05
        rect("Mooring posts", x - 0.057, x + 0.052, z - 0.14, z + 0.20,
             0.310, "wood_dark")
        rect("Mooring posts", x - 0.074, x + 0.069, z + 0.17, z + 0.224,
             0.308, "light_wood")
    geometry.create(parent)


def export_group(group, filename):
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / filename), export_format="GLB",
                              collection=group.name, export_cameras=False,
                              export_lights=False)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    frame = collection("Open window • inward-facing")
    harbor = collection("Harbor backdrop • sailboat")
    quay = collection("Harbor backdrop • village quay")
    make_window(frame)
    make_harbor(harbor, 0)
    make_harbor(quay, 1)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    export_group(frame, "window-arch.glb")
    export_group(harbor, "window-harbor.glb")
    export_group(quay, "window-harbor-quay.glb")
    # The two backdrops share the same local origin. Preview one at a time.
    quay.hide_viewport = True
    quay.hide_render = True
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "windows.blend"))


if __name__ == "__main__":
    main()
