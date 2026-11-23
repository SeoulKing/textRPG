"""Build independently placeable Arcana brunch tables and chairs.

Run with Blender --background --factory-startup --python on this file. The
Blender source keeps editable parts in separate collections. Each GLB contains
one combined mesh and has its pivot at the centre of the assembly's floor.
"""

from math import cos, pi, sin, sqrt
from pathlib import Path
from types import SimpleNamespace

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "godot-arcana" / "art" / "source" / "restaurant-brunch" / "furniture" / "dining"
TABLE_TOP = 0.77


def material(name, hex_color, roughness=0.77):
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    rgb = tuple(channel / 12.92 if channel <= 0.04045 else
                ((channel + 0.055) / 1.055) ** 2.4 for channel in srgb)
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    shader = next(node for node in result.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    result.diffuse_color = (*rgb, 1.0)
    return result


def palette():
    return SimpleNamespace(
        oak=material("Oak / honey", "ad7041"),
        edge=material("Oak / dark endgrain", "714226"),
        light=material("Oak / lit edges", "c8925a"),
        cane=material("Cane / straw", "b6834b"),
        weave=material("Cane / bright weave", "e1b979"),
        linen=material("Linen / ivory", "eddbb9"),
        blue=material("Ceramic and linen / harbor blue", "427188"),
        white=material("Porcelain / milk white", "f4e9d6", 0.38),
        coffee=material("Coffee / dark roast", "573725", 0.25),
        bread=material("Pastry / baked crust", "ac5626"),
        crust=material("Pastry / golden flakes", "df923f"),
        berry=material("Jam and berries / plum", "913754", 0.45),
        green=material("Leaves / sage", "587246"),
        flower=material("Flowers and lemon / butter yellow", "e6b750"),
    )


def mesh(collection, name, vertices, faces, surface):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(surface)
    return obj


def ring_mesh(collection, name, rings, surface, caps=True):
    count = len(rings[0])
    faces = []
    for i in range(len(rings) - 1):
        for j in range(count):
            start = i * count
            k = (j + 1) % count
            faces.append((start + j, start + k, start + k + count, start + j + count))
    if caps:
        faces += [tuple(reversed(range(count))), tuple(range(len(rings) * count - count, len(rings) * count))]
    return mesh(collection, name, [point for ring in rings for point in ring], faces, surface)


def panel(collection, name, x, y, bottom, width, depth, height, surface, chamfer=0.02):
    w, d = width / 2, depth / 2
    c = min(chamfer, w / 3, d / 3)
    rim = [(-w + c, -d), (w - c, -d), (w, -d + c), (w, d - c),
           (w - c, d), (-w + c, d), (-w, d - c), (-w, -d + c)]
    rings = [[(x + dx, y + dy, z) for dx, dy in rim] for z in (bottom, bottom + height)]
    return ring_mesh(collection, name, rings, surface)


def profile(collection, name, x, y, heights_and_radii, surface, sides=12, y_scale=1.0, caps=True):
    angles = [2 * pi * i / sides for i in range(sides)]
    rings = [[(x + r * cos(a), y + r * sin(a) * y_scale, z) for a in angles]
             for z, r in heights_and_radii]
    return ring_mesh(collection, name, rings, surface, caps)


def tube(collection, name, points, radius, surface, sides=6):
    points = [Vector(point) for point in points]
    rings = []
    for index, point in enumerate(points):
        tangent = (points[min(index + 1, len(points) - 1)] - points[max(index - 1, 0)]).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < 0.8 else Vector((0, 1, 0))
        across = tangent.cross(reference).normalized()
        up = tangent.cross(across).normalized()
        rings.append([point + radius * (cos(2 * pi * side / sides) * across +
                                        sin(2 * pi * side / sides) * up)
                      for side in range(sides)])
    return ring_mesh(collection, name, rings, surface)


def chair(collection, m):
    # The chair faces Blender -Y, or Godot +Z after export.
    panel(collection, "Bentwood seat rim", 0, 0, 0.43, 0.47, 0.48, 0.045, m.edge, 0.07)
    panel(collection, "Woven seat", 0, 0, 0.472, 0.421, 0.43, 0.019, m.cane, 0.07)
    for side in (-1, 1):
        for end in (-1, 1):
            tube(collection, "Splayed bentwood leg", [
                (0.197 * side, 0.216 * end, 0.022),
                (0.178 * side, 0.195 * end, 0.20),
                (0.171 * side, 0.167 * end, 0.448),
            ], 0.022, m.oak)
            profile(collection, "Grounded chair foot", 0.197 * side, 0.216 * end,
                    [(0, 0.020), (0.04, 0.027)], m.edge, 8)
        tube(collection, "Curved back stave", [
            (0.166 * side, 0.165, 0.45), (0.18 * side, 0.206, 0.60), (0.14 * side, 0.235, 0.75),
        ], 0.022, m.oak)
        tube(collection, "Bentwood side stretcher", [
            (0.188 * side, -0.188, 0.20), (0.174 * side, 0, 0.16), (0.188 * side, 0.188, 0.20),
        ], 0.013, m.oak)

    outer = [(0.191 * cos(a * pi / 12), 0.222 + 0.033 * sin(a * pi / 12),
              0.742 + 0.211 * sin(a * pi / 12)) for a in range(25)]
    tube(collection, "Oval bentwood back frame", outer, 0.023, m.light, 8)
    fill = [(0.172 * cos(a * pi / 12), 0.224 + 0.033 * sin(a * pi / 12),
             0.742 + 0.192 * sin(a * pi / 12)) for a in range(24)]
    mesh(collection, "Cane back panel", fill, [tuple(reversed(range(24)))], m.cane)
    for delta in (-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12):
        span_z = 0.188 * sqrt(1 - (delta / 0.172) ** 2)
        span_x = 0.169 * sqrt(1 - (delta / 0.192) ** 2)
        for offset in (-0.007, 0.007):
            tube(collection, "Cane vertical weave", [(delta, 0.224 + offset + height * 0.17,
                                                     0.742 + height) for height in (-span_z, span_z)],
                 0.004, m.weave, 4)
            tube(collection, "Cane horizontal weave", [(-span_x, 0.224 + offset + delta * 0.17, 0.742 + delta),
                                                       (span_x, 0.224 + offset + delta * 0.17, 0.742 + delta)],
                 0.004, m.weave, 4)
        tube(collection, "Cane seat weave", [(-0.19, delta, 0.495), (0.19, delta, 0.495)],
             0.006, m.weave, 4)

def table(collection, width, depth, m):
    for side_x in (-1, 1):
        for side_y in (-1, 1):
            x, y = side_x * (width / 2 - 0.118), side_y * (depth / 2 - 0.113)
            profile(collection, "Turned table leg", x, y, [
                (0, 0.037), (0.047, 0.043), (0.11, 0.032), (0.43, 0.042),
                (0.54, 0.059), (0.59, 0.049), (0.69, 0.054),
            ], m.oak, 10)
            profile(collection, "Turned leg collar", x, y, [(0.533, 0.055), (0.550, 0.063), (0.563, 0.052)], m.edge, 10)

    panel(collection, "Recessed apron", 0, 0, 0.617, width - 0.20, depth - 0.20, 0.085, m.edge)
    panel(collection, "Tabletop molded rim", 0, 0, TABLE_TOP - 0.071, width, depth, 0.061, m.oak, 0.034)
    panel(collection, "Tabletop light bevel", 0, 0, TABLE_TOP - 0.021,
          width - 0.027, depth - 0.027, 0.021, m.light, 0.032)
    for offset in (-0.23, 0.23):
        panel(collection, "Tabletop plank join", 0, offset * depth, TABLE_TOP,
              width - 0.073, 0.008, 0.001, m.oak, 0.001)


def cloth(collection, width, depth, axis, m):
    # Drape follows its own strip and falls a short distance past the table rim.
    if axis == "x":
        along, across = width, 0.34
    else:
        along, across = depth, 0.26

    direction = 1 if axis == "x" else -1

    def strip(name, width_of_strip, lateral, surface, lift=0):
        sections = [(-along / 2 - 0.018, TABLE_TOP - 0.15),
                    (-along / 2 - 0.018, TABLE_TOP + 0.013),
                    (along / 2 + 0.018, TABLE_TOP + 0.013),
                    (along / 2 + 0.018, TABLE_TOP - 0.15)]
        vertices = []
        for position, height in sections:
            for side in (-1, 1):
                offset = lateral + side * width_of_strip / 2
                if direction == 1:
                    vertices.append((position, offset, height + lift))
                else:
                    vertices.append((offset, position, height + lift))
        faces = [(i, i + 1, i + 3, i + 2) for i in (0, 2, 4)]
        if direction == 1:
            faces = [tuple(reversed(face)) for face in faces]
        mesh(collection, name, vertices, faces, surface)

    strip("Ivory linen runner", across, 0, m.linen)
    for side in (-1, 1):
        strip("Woven indigo border", 0.017, side * (across / 2 - 0.036), m.blue, 0.003)


def dish(collection, x, y, size, meal, m):
    z = TABLE_TOP + 0.016
    profile(collection, "Porcelain brunch plate", x, y,
            [(z, size * 0.66), (z + 0.011, size), (z + 0.028, size), (z + 0.020, size * 0.64)], m.white, 16)
    profile(collection, "Painted plate lip", x, y,
            [(z + 0.029, size * 0.97), (z + 0.030, size * 0.85)], m.blue, 16, caps=False)
    if meal == "pastry":
        parts = [(-0.059, 0.015, 0.028), (-0.035, 0, 0.041), (0, -0.012, 0.051),
                 (0.035, 0, 0.041), (0.059, 0.015, 0.028)]
        for i, (offset_x, offset_y, radius) in enumerate(parts):
            profile(collection, "Layered croissant", x + offset_x, y + offset_y,
                    [(z + 0.022, radius * 0.77), (z + 0.06, radius), (z + 0.089, radius * 0.6)],
                    m.crust if i % 2 == 0 else m.bread, 10, 0.75)
    else:
        profile(collection, "Brunch toast", x, y, [(z + 0.020, size * 0.49), (z + 0.049, size * 0.57)], m.bread, 8, 0.84)
        profile(collection, "Egg white", x - 0.013, y, [(z + 0.049, 0.062), (z + 0.058, 0.048)], m.white, 11, 0.89)
        profile(collection, "Egg yolk", x - 0.026, y, [(z + 0.059, 0.018), (z + 0.075, 0.014)], m.flower, 9)
        for offset in (-0.025, 0.012, 0.036):
            profile(collection, "Berry garnish", x + 0.064, y + offset,
                    [(z + 0.021, 0.010), (z + 0.038, 0.017), (z + 0.046, 0.010)], m.berry, 7)


def cup(collection, x, y, m):
    z = TABLE_TOP + 0.015
    profile(collection, "Porcelain saucer", x, y,
            [(z, 0.064), (z + 0.011, 0.075), (z + 0.014, 0.074)], m.white)
    profile(collection, "Coffee cup", x, y, [(z + 0.014, 0.034), (z + 0.075, 0.046),
                                              (z + 0.084, 0.047), (z + 0.078, 0.041)], m.white)
    profile(collection, "Brewed coffee", x, y, [(z + 0.079, 0.039), (z + 0.080, 0.039)], m.coffee)
    points = [(x + 0.041 + 0.027 * sin(a * pi / 8), y, z + 0.05 + 0.025 * cos(a * pi / 8))
              for a in range(9)]
    tube(collection, "Coffee cup handle", points, 0.007, m.white)


def vase(collection, x, y, size, m):
    z = TABLE_TOP + 0.015
    profile(collection, "Painted ceramic flower vase", x, y,
            [(z, 0.05 * size), (z + 0.066 * size, 0.071 * size), (z + 0.139 * size, 0.031 * size),
             (z + 0.151 * size, 0.036 * size)], m.white)
    profile(collection, "Vase blue glaze band", x, y,
            [(z + 0.061 * size, 0.0715 * size), (z + 0.071 * size, 0.070 * size)], m.blue, caps=False)
    for i, (dx, dy, height) in enumerate(((-0.05, -0.02, 0.26), (0.04, -0.03, 0.23),
                                          (0.038, 0.058, 0.255), (-0.038, 0.04, 0.28), (0, 0, 0.305))):
        px, py, pz = x + dx * size, y + dy * size, z + height * size
        tube(collection, "Flower stem", [(x, y, z + 0.13 * size), (px, py, pz)], 0.009 * size, m.green)
        for petal in range(5):
            a = petal * 2 * pi / 5
            profile(collection, "Small bouquet petal", px + 0.022 * cos(a) * size,
                    py + 0.022 * sin(a) * size, [(pz, 0.017 * size), (pz + 0.017 * size, 0.015 * size)],
                    m.white if i % 2 else m.flower, 6)
        profile(collection, "Small bouquet pollen", px, py, [(pz, 0.015 * size), (pz + 0.020 * size, 0.013 * size)],
                m.flower, 6)


def build_dining(scene, name, width, depth, settings, drape, bouquet, m):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    table(collection, width, depth, m)
    cloth(collection, width, depth, drape, m)
    for x, y, dx, dy, meal in settings:
        dish(collection, x, y, 0.123, meal, m)
        cup(collection, x + dx, y + dy, m)
    vase(collection, *bouquet, m)
    return collection


def export_collection(collection):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = collection.objects[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = collection.name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    coords = [merged.matrix_world @ Vector(corner) for corner in merged.bound_box]
    print(collection.name, "bounds", [(min(p[i] for p in coords), max(p[i] for p in coords)) for i in range(3)])
    filepath = DEST / (collection.name + ".glb")
    bpy.ops.export_scene.gltf(filepath=str(filepath), export_format="GLB", use_selection=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.scene.unit_settings.system = "METRIC"
    DEST.mkdir(parents=True, exist_ok=True)
    m = palette()
    scene = bpy.context.scene
    dining_chair = bpy.data.collections.new("dining-chair")
    scene.collection.children.link(dining_chair)
    chair(dining_chair, m)
    window = build_dining(scene, "dining-window", 0.88, 0.76,
                          [(-0.225, -0.15, 0, 0.26, "pastry"), (0.225, 0.15, 0, -0.26, "eggs")],
                          "y", (0, 0.13, 0.65), m)
    four = build_dining(scene, "dining-four", 1.24, 1.19,
                        [(-0.35, -0.14, 0, 0.27, "pastry"), (0.35, 0.14, 0, -0.27, "eggs"),
                         (-0.16, 0.37, 0.32, 0, "eggs"), (0.16, -0.37, -0.32, 0, "pastry")],
                        "y", (0, 0.07, 0.8), m)
    shared_settings = []
    for i, x in enumerate((-0.83, 0, 0.83)):
        for side in (-1, 1):
            shared_settings.append((x - 0.11 * side, 0.39 * side, 0.26 * side, -0.022 * side,
                                    "eggs" if (i + side) % 2 else "pastry"))
    shared = build_dining(scene, "dining-shared", 2.55, 1.28, shared_settings,
                          "x", (0, 0, 1.05), m)
    dish(shared, -0.97, 0, 0.148, "pastry", m)
    dish(shared, 0.97, 0, 0.148, "eggs", m)

    # Separate the editable displays in Blender; provide no offsets in individual GLBs.
    spacing = {dining_chair: -4.25, window: -2.75, four: -0.65, shared: 2.35}
    for collection, offset in spacing.items():
        for obj in collection.objects:
            obj.location.x += offset
    bpy.ops.wm.save_as_mainfile(filepath=str(DEST / "dining.blend"))
    for collection, offset in spacing.items():
        for obj in collection.objects:
            obj.location.x -= offset
        export_collection(collection)


if __name__ == "__main__":
    main()
