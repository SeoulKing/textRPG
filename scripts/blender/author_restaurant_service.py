"""Author the coastal brunch café service assets in Blender background mode.

Run Blender with --background --factory-startup --python-exit-code 1
--python scripts/blender/author_restaurant_service.py to save the layered source
and export each collection at its floor pivot. X is across the furniture and
Blender -Y is toward the customer (Godot +Z).
"""

from math import cos, pi, sin, tau
from pathlib import Path
from random import Random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector


OUTPUT = Path(__file__).resolve().parents[2] / "godot-arcana/art/source/restaurant-brunch/furniture/kitchen"


def material(name, color, roughness=0.65, metallic=0.0, alpha=1.0):
    srgb = [int(color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    rgb = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in srgb]
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*rgb, alpha)
    result.use_nodes = True
    shader = next(node for node in result.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Alpha"].default_value = alpha
    if alpha < 1.0:
        result.surface_render_method = "BLENDED"
    return result


def palette():
    return {
        "oak": material("Honey oak", "A86737"),
        "oak_light": material("Warm polished oak", "C68C52"),
        "oak_dark": material("Oak end grain", "784527"),
        "olive": material("Sage painted joinery", "83906A"),
        "olive_light": material("Sage panel highlight", "A0A581"),
        "olive_dark": material("Sage joinery in shade", "626C4F"),
        "cream": material("Ivory counter stone", "F1DBAF"),
        "brass": material("Cast brass", "BE822B", 0.35, 0.55),
        "brass_light": material("Polished brass edges", "E1AA49", 0.32, 0.52),
        "iron": material("Blackened iron", "424345", 0.52, 0.18),
        "porcelain": material("Warm ivory porcelain", "ECE1C3", 0.37),
        "blue": material("Cobalt ceramic glaze", "526E9D", 0.4),
        "terracotta": material("Fired earthenware", "A66345"),
        "preserve": material("Apricot preserve", "D59336"),
        "bread": material("Baked crust", "CB7E36"),
        "crumb": material("Flour on scoring", "F0BF7A"),
        "glass": material("Clear pale cloche glass", "D8EDF2", 0.13, alpha=0.18),
        "leaf": material("Olive leaf", "747D37"),
        "leaf_dark": material("Shaded olive leaf", "4A5D35"),
        "leaf_light": material("Sunlit olive leaf", "9EA054"),
        "soil": material("Potting soil", "4F392B"),
        "linen": material("Unbleached flax", "E6D1A9"),
        "coffee": material("Coffee", "542E20", 0.42),
    }


def obj_from_bmesh(group, name, mesh_data, mat):
    mesh = bpy.data.meshes.new(name)
    mesh_data.to_mesh(mesh)
    mesh_data.free()
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    mesh.materials.append(mat)
    return obj


def box(group, name, x, depth, z, width, length, height, mat, bevel=0.012):
    geometry = bmesh.new()
    bmesh.ops.create_cube(geometry, size=1)
    bmesh.ops.transform(geometry, matrix=Matrix.Diagonal((width, length, height, 1)), verts=list(geometry.verts))
    obj = obj_from_bmesh(group, name, geometry, mat)
    obj.location = (x, -depth, z)
    if bevel:
        edge = obj.modifiers.new("Softened edges", "BEVEL")
        edge.width = bevel
        edge.segments = 1
        obj.modifiers.new("Planar face normals", "WEIGHTED_NORMAL")
    return obj


def oval(group, name, x, depth, z, width, length, height, mat, segments=12):
    geometry = bmesh.new()
    bmesh.ops.create_uvsphere(geometry, u_segments=segments, v_segments=7, radius=0.5)
    bmesh.ops.transform(geometry, matrix=Matrix.Diagonal((width, length, height, 1)), verts=list(geometry.verts))
    for face in geometry.faces:
        face.smooth = True
    obj = obj_from_bmesh(group, name, geometry, mat)
    obj.location = (x, -depth, z)
    return obj


def lathe(group, name, x, depth, z, profile, mat, sides=16, cap_bottom=True):
    geometry = bmesh.new()
    rings = [
        [geometry.verts.new((r * cos(tau * index / sides), r * sin(tau * index / sides), height)) for index in range(sides)]
        for r, height in profile
    ]
    for lower, upper in zip(rings, rings[1:]):
        for index in range(sides):
            end = (index + 1) % sides
            face = geometry.faces.new((lower[index], lower[end], upper[end], upper[index]))
            face.smooth = True
    if cap_bottom:
        geometry.faces.new(tuple(reversed(rings[0])))
    geometry.faces.new(rings[-1])
    obj = obj_from_bmesh(group, name, geometry, mat)
    obj.location = (x, -depth, z)
    return obj


def line(group, name, points, mat, radius):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = 1
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for knot, (x, depth, z) in zip(spline.points, points):
        knot.co = (x, -depth, z, 1)
    data.materials.append(mat)
    result = bpy.data.objects.new(name, data)
    group.objects.link(result)
    return result


def cabinet(group, p, width, depth, height, count, front, body, light, shadow):
    top = height - 0.08
    frame_width = 0.08
    box(group, "Solid recessed plinth", 0, 0, 0.065, width - 0.07, depth - 0.11, 0.13, shadow)
    box(group, "Cabinet carcass", 0, -0.025, (0.13 + top) / 2, width - 0.026, depth - 0.07, top - 0.13, body)
    box(group, "Lower moulding", 0, 0, 0.16, width - 0.02, depth, 0.075, shadow)
    box(group, "Upper moulding", 0, 0, top - 0.025, width, depth, 0.095, light)
    box(group, "Door case backing", 0, front - 0.038, (0.13 + top) / 2, width - 0.05, 0.045, top - 0.13, shadow)
    door_width = (width - 0.13) / count
    door_height = top - 0.29
    for index in range(count):
        x = (index - (count - 1) / 2) * door_width
        center_height = (top + 0.10) / 2
        box(group, "Door frame", x, front - 0.018, center_height, door_width - 0.023, 0.043, door_height, light)
        box(group, "Recessed door panel", x, front + 0.007, center_height, door_width - 2 * frame_width, 0.026, door_height - 0.13, body)
        handle_x = x + (-1 if index % 2 else 1) * (door_width / 2 - 0.12)
        oval(group, "Round brass pull", handle_x, front + 0.036, center_height + 0.15, 0.065, 0.052, 0.065, p["brass_light"])


def cup(group, p, x, depth, z, blue=False):
    color = p["blue"] if blue else p["porcelain"]
    lathe(group, "Espresso cup", x, depth, z, [(0.056, 0), (0.077, 0.015), (0.094, 0.105), (0.081, 0.107), (0.064, 0.02)], color, 12)
    handle = [(x + 0.079 + 0.057 * sin(pi * step / 9), depth, z + 0.025 + 0.061 * step / 9) for step in range(10)]
    line(group, "Cup handle", handle, color, 0.012)


def plate(group, p, x, depth, z, radius=0.15, color="porcelain"):
    lathe(group, "Rimmed dish", x, depth, z, [(radius * 0.82, 0), (radius, 0.021), (radius, 0.036), (radius * 0.75, 0.022)], p[color], 16)


def loaf(group, p, x, depth, z, scale=1.0):
    oval(group, "Golden pastry", x, depth, z + 0.075 * scale, 0.38 * scale, 0.22 * scale, 0.15 * scale, p["bread"])
    for offset in (-0.079, 0, 0.079):
        points = [(x + (offset - 0.022) * scale, depth + 0.050 * scale, z + 0.131 * scale),
                  (x + offset * scale, depth, z + 0.146 * scale),
                  (x + (offset + 0.028) * scale, depth - 0.052 * scale, z + 0.131 * scale)]
        line(group, "Pastry scoring", points, p["crumb"], 0.008 * scale)


def display_cloche(group, p, x, depth, z, radius=0.42):
    lathe(group, "Pastry display stand", x, depth, z, [(radius * 0.45, 0), (radius * 0.45, 0.035), (radius * 0.23, 0.06), (radius * 0.24, 0.125), (radius * 0.91, 0.145), (radius, 0.163), (radius, 0.185)], p["porcelain"], 20)
    for dx, dd in ((-0.18, 0), (0.14, 0.10), (0.12, -0.14)):
        loaf(group, p, x + dx * radius / 0.42, depth + dd * radius / 0.42, z + 0.185, 0.65 * radius / 0.42)
    shape = [(radius * 0.96, 0.19), (radius * 0.96, 0.30), (radius * 0.84, 0.43),
             (radius * 0.65, 0.52), (radius * 0.38, 0.57), (radius * 0.055, 0.60)]
    # Open-bottom dome keeps the pastries readable through mobile GLB alpha blending.
    lathe(group, "Handblown pastry cloche", x, depth, z, shape, p["glass"], 20, cap_bottom=False)
    oval(group, "Brass cloche handle", x, depth, z + 0.625, 0.094, 0.094, 0.085, p["brass_light"])


def coffee_maker(group, p, x, depth, z):
    box(group, "Coffee machine iron base", x, depth, z + 0.075, 0.95, 0.73, 0.15, p["iron"], 0.027)
    box(group, "Brass machine rail", x, depth, z + 0.112, 0.98, 0.75, 0.045, p["brass_light"], 0.025)
    box(group, "Brass machine back", x, depth - 0.21, z + 0.405, 0.84, 0.22, 0.56, p["brass"], 0.037)
    for dx in (-0.348, 0.348):
        lathe(group, "Turned brass espresso pillar", x + dx, depth + 0.15, z + 0.14,
              [(0.084, 0), (0.073, 0.06), (0.04, 0.13), (0.042, 0.48), (0.076, 0.53)], p["brass_light"], 12)
    box(group, "Brass manifold", x, depth + 0.021, z + 0.62, 0.92, 0.64, 0.17, p["brass"], 0.045)
    lathe(group, "Rounded brass boiler dome", x, depth - 0.035, z + 0.69,
          [(0.39, 0), (0.39, 0.048), (0.31, 0.164), (0.19, 0.238), (0.08, 0.26)], p["brass_light"], 16)
    oval(group, "Boiler finial", x, depth - 0.035, z + 0.979, 0.132, 0.132, 0.1, p["brass"])
    box(group, "Espresso drain grate", x, depth + 0.154, z + 0.15, 0.55, 0.31, 0.035, p["iron"])
    for index in range(6):
        box(group, "Grate rib", x + (index - 2.5) * 0.079, depth + 0.155, z + 0.174, 0.029, 0.29, 0.013, p["porcelain"], 0.002)
    for dx in (-0.18, 0.18):
        head = x + dx
        lathe(group, "Espresso brew head", head, depth + 0.12, z + 0.45, [(0.1, 0), (0.108, 0.04), (0.1, 0.1)], p["brass_light"], 12)
        line(group, "Portafilter handle", [(head, depth + 0.155, z + 0.495), (head, depth + 0.374, z + 0.47)], p["iron"], 0.026)
    dial = lathe(group, "Porcelain pressure dial", x, depth + 0.36, z + 0.632,
                 [(0.09, 0), (0.093, 0.025), (0.085, 0.032)], p["porcelain"], 16)
    dial.rotation_euler.x = pi / 2
    line(group, "Gauge needle", [(x, depth + 0.395, z + 0.632), (x + 0.038, depth + 0.395, z + 0.682)], p["iron"], 0.007)
    cup(group, p, x - 0.16, depth + 0.17, z + 0.18)


def build_counter(group, p):
    cabinet(group, p, 5.64, 1.23, 1.17, 5, 0.588, p["olive"], p["olive_light"], p["olive_dark"])
    box(group, "Ivory stone worktop", 0, 0, 1.16, 5.75, 1.35, 0.14, p["cream"], 0.043)
    top = 1.23
    coffee_maker(group, p, -0.20, 0.03, top)
    display_cloche(group, p, 1.82, 0.065, top)
    box(group, "Oak service tray", -1.68, 0.13, top + 0.025, 0.72, 0.46, 0.05, p["oak_light"], 0.037)
    for index, x in enumerate((-1.91, -1.69, -1.46)):
        plate(group, p, x, 0.12, top + 0.05, 0.103, "blue" if index == 1 else "porcelain")
        cup(group, p, x, 0.12, top + 0.081, blue=index == 1)
    box(group, "Flax service cloth", 2.32, 0.38, top + 0.008, 0.39, 0.54, 0.017, p["linen"], 0.008)
    box(group, "Hanging end of service cloth", 2.32, 0.671, top - 0.09, 0.39, 0.008, 0.206, p["linen"], 0.004)
    for x in (2.18, 2.22):
        box(group, "Woven blue stripe", x, 0.38, top + 0.018, 0.012, 0.54, 0.006, p["blue"], 0.002)
        box(group, "Woven stripe on hanging end", x, 0.677, top - 0.09, 0.012, 0.005, 0.206, p["blue"], 0.002)


def canister(group, p, x, depth, z, radius, height, color):
    lathe(group, "Preserve jar", x, depth, z, [(radius * 0.88, 0), (radius, 0.021), (radius, height - 0.04), (radius * 0.74, height - 0.015)], p[color], 12)
    lathe(group, "Jar lid", x, depth, z + height - 0.019, [(radius * 0.83, 0), (radius * 0.83, 0.027)], p["oak_light"], 12)


def build_hutch(group, p):
    cabinet(group, p, 4.86, 0.94, 1.13, 4, 0.432, p["olive"], p["olive_light"], p["olive_dark"])
    box(group, "Hutch work surface", 0, 0, 1.12, 4.90, 0.98, 0.12, p["oak_light"], 0.028)
    box(group, "Oak back board", 0, -0.405, 1.96, 4.72, 0.095, 1.65, p["oak_dark"], 0.008)
    for x in (-2.34, 0, 2.34):
        box(group, "Grounded oak case upright", x, -0.055, 1.966, 0.13, 0.81, 1.59, p["oak"], 0.023)
        box(group, "Upright edge trim", x, 0.365, 1.986, 0.135, 0.056, 1.57, p["oak_light"], 0.014)
    for z in (1.183, 1.69, 2.18, 2.73):
        box(group, "Open oak shelf", 0, -0.02, z, 4.80, 0.81, 0.085, p["oak"], 0.024)
        box(group, "Shelf lip", 0, 0.39, z + 0.006, 4.81, 0.056, 0.067, p["oak_light"], 0.014)
    box(group, "Wide oak crown", 0, -0.023, 2.82, 4.90, 0.92, 0.106, p["oak_light"], 0.028)
    for level, z in enumerate((1.226, 1.733, 2.223)):
        for slot in range(8):
            x = (slot - 3.5) * 0.52
            group_type = (2 * level + slot) % 5
            if group_type in (0, 3):
                for stack in range(3 + (slot % 2)):
                    plate(group, p, x, 0.06, z + stack * 0.033, 0.167 + level * 0.011, "blue" if group_type == 3 and stack == 0 else "porcelain")
            elif group_type == 1:
                cup(group, p, x - 0.105, 0.16, z, blue=slot % 2 == 0)
                cup(group, p, x + 0.123, 0.11, z, blue=slot % 2 == 1)
            elif group_type == 2:
                canister(group, p, x, 0.07, z, 0.119, 0.26 + level * 0.028, "terracotta" if level == 1 else "blue")
            else:
                canister(group, p, x - 0.085, 0.09, z, 0.09, 0.19, "preserve")
                canister(group, p, x + 0.123, 0.02, z, 0.081, 0.24, "porcelain")


def build_sideboard(group, p):
    body = 0.86
    box(group, "Sideboard grounded cabinet foot", 0, 0, 0.065, 1.76, 0.80, 0.13, p["oak_dark"], 0.02)
    box(group, "Sideboard oak case", 0, 0, 0.43, 1.82, 0.85, 0.64, p["oak"], 0.027)
    box(group, "Pastry buffet top", 0, 0, 0.78, 1.90, 0.94, 0.16, p["oak_light"], 0.036)
    for z in (0.31, 0.57):
        box(group, "Full-width buffet drawer", 0, 0.428, z, 1.73, 0.042, 0.213, p["oak_light"], 0.02)
        for x in (-0.48, 0.48):
            oval(group, "Buffet drawer pull", x, 0.461, z, 0.091, 0.055, 0.058, p["brass"])
    display_cloche(group, p, -0.36, 0.023, body, 0.40)
    plate(group, p, 0.6, 0.07, body, 0.24, "blue")
    for x, depth, z in ((0.52, -0.036, 0.97), (0.72, 0.04, 0.96), (0.57, 0.15, 0.955), (0.62, 0.032, 1.105)):
        oval(group, "Lemon", x, depth, z, 0.19, 0.127, 0.14, p["preserve"])


def wheel(group, p, x, depth, radius):
    result = lathe(group, "Cart rubberised wheel", x, depth, radius, [(radius, -0.025), (radius, 0.025)], p["iron"], 14)
    result.rotation_euler.x = pi / 2
    hub = lathe(group, "Wheel brass hub", x, depth + 0.026, radius, [(radius * 0.43, 0), (radius * 0.43, 0.021)], p["brass"], 12)
    hub.rotation_euler.x = pi / 2


def olive_tree(group, p, x, depth, seed):
    rng = Random(seed)
    lathe(group, "Olive tree earthenware planter", x, depth, 0, [(0.215, 0), (0.27, 0.08), (0.335, 0.33), (0.29, 0.49), (0.32, 0.52), (0.305, 0.565), (0.265, 0.565), (0.258, 0.48)], p["terracotta"], 16)
    lathe(group, "Visible potting soil", x, depth, 0.495, [(0.254, 0), (0.254, 0.018)], p["soil"], 16)
    start = (x, depth, 0.505)
    fork = (x + 0.035, depth, 1.24)
    line(group, "Olive trunk", [start, (x + 0.06, depth - 0.027, 0.86), fork], p["oak_dark"], 0.039)
    for index in range(9):
        angle = index * 2.4
        width = 0.155 + rng.random() * 0.2
        tip = (fork[0] + width * cos(angle), depth + width * 0.85 * sin(angle), 1.55 + rng.random() * 0.40)
        line(group, "Olive twig", [fork, ((fork[0] + tip[0]) / 2, (fork[1] + tip[1]) / 2, 1.44), tip], p["oak_dark"], 0.013)
        for leaf_index in range(5):
            spread = 0.075 + 0.023 * leaf_index
            leaf = oval(group, "Narrow olive leaf", tip[0] + spread * cos(angle + leaf_index),
                        tip[1] + spread * sin(angle + leaf_index), tip[2] + (leaf_index - 2) * 0.066,
                        0.18, 0.062, 0.024, p[("leaf", "leaf_light", "leaf_dark")[leaf_index % 3]], 7)
            leaf.rotation_euler = Euler((0.25, rng.uniform(-0.55, 0.55), angle + leaf_index))


def build_cart(group, p):
    x = -0.42
    for z in (0.25, 0.77):
        box(group, "Bread cart shelf", x, -0.012, z, 0.98, 0.67, 0.07, p["oak_light"], 0.028)
        box(group, "Front shelf lip", x, 0.306, z + 0.028, 1.0, 0.055, 0.085, p["oak"], 0.016)
        box(group, "Rear shelf lip", x, -0.335, z + 0.028, 1.0, 0.055, 0.085, p["oak"], 0.016)
    for foot in (x - 0.41, x + 0.41):
        for depth in (-0.247, 0.247):
            box(group, "Cart upright", foot, depth, 0.48, 0.071, 0.071, 0.71, p["oak"], 0.013)
            wheel(group, p, foot, depth, 0.12)
    for index in range(3):
        plate(group, p, x - 0.21, 0.025, 0.286 + index * 0.035, 0.17)
    cup(group, p, x + 0.22, 0.13, 0.287, blue=True)
    lathe(group, "Woven bread basket", x, 0, 0.803, [(0.27, 0), (0.295, 0.1), (0.365, 0.153), (0.36, 0.18), (0.335, 0.16), (0.275, 0.026)], p["oak"], 20)
    for i in range(5):
        oval(group, "Basket bread", x + (i - 2) * 0.112, (i % 2) * 0.080, 0.995 + (i % 2) * 0.044, 0.14, 0.136, 0.29, p["bread"]).rotation_euler.y = (i - 2) * 0.23
    olive_tree(group, p, 0.53, -0.04, 351)


def pack(group, graph):
    """Evaluate source curves and bevels and merge each asset into two draw groups."""
    packed = []
    for transparent in (False, True):
        result = bmesh.new()
        material_slots = {}
        for obj in group.objects:
            evaluated = obj.evaluated_get(graph)
            mesh = evaluated.to_mesh()
            if not mesh or not mesh.materials:
                evaluated.to_mesh_clear()
                continue
            mat = mesh.materials[0]
            if (mat.diffuse_color[3] < 1.0) == transparent:
                slot = material_slots.setdefault(mat, len(material_slots))
                vertices = [result.verts.new(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices]
                for polygon in mesh.polygons:
                    face = result.faces.new([vertices[index] for index in polygon.vertices])
                    face.material_index = slot
                    face.smooth = polygon.use_smooth
            evaluated.to_mesh_clear()
        if result.faces:
            suffix = "Glass" if transparent else "Furniture"
            name = f"{group.name} {suffix}"
            mesh = bpy.data.meshes.new(name)
            for mat in material_slots:
                mesh.materials.append(mat)
            result.to_mesh(mesh)
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            packed.append(obj)
        result.free()
    return packed


BUILDERS = {
    "service-counter": build_counter,
    "service-hutch": build_hutch,
    "service-sideboard": build_sideboard,
    "service-cart": build_cart,
}


def main():
    if not bpy.app.background:
        raise RuntimeError("Run this asset author in Blender background mode.")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    p = palette()
    for name, builder in BUILDERS.items():
        group = bpy.data.collections.new(name)
        group["pivot"] = (0.0, 0.0, 0.0)
        bpy.context.scene.collection.children.link(group)
        builder(group, p)
    bpy.context.preferences.filepaths.save_version = 0
    # Separate editable collection origins in the Blender source. GLBs use local floor pivots.
    groups = [bpy.data.collections[name] for name in BUILDERS]
    for group, distance in zip(groups, (0, 4, 8, 11)):
        for obj in group.objects:
            obj.location.y += distance
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "service.blend"))
    for group, distance in zip(groups, (0, 4, 8, 11)):
        for obj in group.objects:
            obj.location.y -= distance
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        packed = pack(group, graph)
        if not packed:
            raise RuntimeError(f"No export geometry for {group.name}")
        bpy.ops.object.select_all(action="DESELECT")
        for obj in packed:
            obj.select_set(True)
        path = OUTPUT / f"{group.name}.glb"
        result = bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                                          export_yup=True, export_animations=False, export_cameras=False, export_lights=False)
        if "FINISHED" not in result:
            raise RuntimeError(f"Could not export {path}")
        corners = [obj.matrix_world @ Vector(corner) for obj in packed for corner in obj.bound_box]
        bounds = tuple(round(max(corner[index] for corner in corners) - min(corner[index] for corner in corners), 3) for index in range(3))
        print(f"{path.name}: {bounds}", flush=True)
        for obj in packed:
            bpy.data.objects.remove(obj, do_unlink=True)


if __name__ == "__main__":
    main()
