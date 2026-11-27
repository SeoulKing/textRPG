"""Author each forest monster at the origin, with its face along Blender -Y."""

import math
import random
from pathlib import Path

import bpy
from mathutils import Vector


SOURCE = Path(__file__).resolve().parent
PROJECT = SOURCE.parents[4]
OUTPUT = PROJECT / "godot-arcana" / "art" / "source" / "pondside-forest-3d"


def material(name, color, roughness=0.85, glow=0):
    def linear(value):
        return value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    rgba = tuple(linear(int(color[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1,)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = roughness
    if glow:
        shader.inputs["Emission Color"].default_value = rgba
        shader.inputs["Emission Strength"].default_value = glow
    return mat


def mesh(name, vertices, faces, materials, parent):
    geometry = bpy.data.meshes.new(name)
    geometry.from_pydata(vertices, [], faces)
    geometry.update()
    obj = bpy.data.objects.new(name, geometry)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    for mat in materials:
        geometry.materials.append(mat)
    return obj


def ball(name, center, radii, mat, parent, *, rough=False):
    if rough:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=center)
    else:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.scale = radii
    obj.parent = parent
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = not rough
    return obj


def swept_shape(name, points, radii, mats, parent, *, sides=8, z_floor=None):
    centers = [Vector(point) for point in points]
    verts = []
    for index, (center, radius) in enumerate(zip(centers, radii)):
        tangent = (centers[min(index + 1, len(centers) - 1)] - centers[max(0, index - 1)]).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((1, 0, 0))
        u = reference.cross(tangent).normalized()
        v = tangent.cross(u).normalized()
        for side in range(sides):
            angle = math.tau * side / sides
            p = center + radius[0] * math.cos(angle) * u + radius[1] * math.sin(angle) * v
            if z_floor is not None:
                p.z = max(z_floor, p.z)
            verts.append(p)
    faces = [tuple(reversed(range(sides)))]
    for ring in range(len(points) - 1):
        row = ring * sides
        for side in range(sides):
            nxt = (side + 1) % sides
            faces.append((row + side, row + nxt, row + sides + nxt, row + sides + side))
    faces.append(tuple(range(len(verts) - sides, len(verts))))
    obj = mesh(name, verts, faces, mats, parent)
    for index, face in enumerate(obj.data.polygons):
        face.material_index = (index - 1) % sides % len(mats)
        face.use_smooth = len(mats) == 1
    return obj


def leaf(name, centers, widths, mats, parent, side_axis):
    side_axis = Vector(side_axis).normalized()
    vertices = []
    for center, width in zip(centers, widths):
        vein = Vector(center)
        left = vein - side_axis * width
        right = vein + side_axis * width * 0.79
        left.z -= width * 0.32
        right.z -= width * 0.35
        vertices.extend((left, vein, right))
    faces = []
    for row in range(0, len(vertices) - 3, 3):
        faces.extend(((row, row + 3, row + 4, row + 1), (row + 1, row + 4, row + 5, row + 2)))
    blade = mesh(name, vertices, faces, mats[:2], parent)
    for index, polygon in enumerate(blade.data.polygons):
        polygon.material_index = index % 2
    thickness = blade.modifiers.new("Leaf thickness", "SOLIDIFY")
    thickness.thickness = 0.007
    swept_shape(f"{name} midrib", centers, [(r, r) for r in (0.012, 0.011, 0.008, 0.004, 0.002)], [mats[2]], parent, sides=5)


def leaf_palette():
    return [material("Leaf – lime face", "96B94C"), material("Leaf – cool face", "6D9A41"), material("Leaf – pale vein", "A9C955")]


def new_monster(name):
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    root = bpy.data.objects.new(name, None)
    scene.collection.objects.link(root)
    root.empty_display_size = 0.3
    return scene, root


def make_leaf_slime():
    scene, root = new_monster("Leaf Slime")
    glaze = material("Slime – olive lime glaze", "82A63E", 0.32)
    ink = material("Slime – moss-black face", "1B291C", 0.5)
    highlight = material("Slime – eye glint", "FCF4C3", 0.44)
    rings = (
        (0.0, 0.43, 0.365), (0.028, 0.56, 0.43), (0.08, 0.615, 0.47),
        (0.17, 0.64, 0.49), (0.29, 0.615, 0.478), (0.41, 0.57, 0.447),
        (0.54, 0.465, 0.37), (0.64, 0.34, 0.28), (0.705, 0.20, 0.17),
        (0.73, 0.065, 0.059),
    )
    sides = 32
    verts = []
    for z, x_radius, y_radius in rings:
        for i in range(sides):
            angle = math.tau * i / sides
            drift = (z / 0.73) ** 2
            verts.append((x_radius * math.cos(angle) + 0.045 * drift, y_radius * math.sin(angle) + 0.018 * drift, z))
    faces = [tuple(reversed(range(sides)))]
    for ring in range(len(rings) - 1):
        low = ring * sides
        high = low + sides
        for i in range(sides):
            nxt = (i + 1) % sides
            faces.append((low + i, low + nxt, high + nxt, high + i))
    faces.append(tuple(range(len(verts) - sides, len(verts))))
    dome = mesh("Soft dome", verts, faces, [glaze], root)
    for polygon in dome.data.polygons:
        polygon.use_smooth = polygon.index != 0

    for index, x in enumerate((-0.145, 0.145), start=1):
        eye = ball(f"Eye {index}", (x, -0.460, 0.329), (0.049, 0.026, 0.069), ink, root)
        eye.rotation_euler.z = math.copysign(0.18, x)
        ball(f"Eye {index} glint", (x - 0.011, -0.485 + (0.002 if x < 0 else 0), 0.353), (0.014, 0.008, 0.018), highlight, root)
    smile_points = [(-0.067, -0.479, 0.238), (-0.044, -0.488, 0.218), (0, -0.494, 0.211), (0.043, -0.488, 0.221), (0.063, -0.479, 0.245)]
    swept_shape("Smile", smile_points, [(r, r) for r in (0.008, 0.013, 0.014, 0.012, 0.007)], [ink], root)

    greens = leaf_palette()
    stem = [(0.04, 0.014, 0.687), (0.05, 0.010, 0.761), (0.10, -0.012, 0.823)]
    swept_shape("Sprout stem", stem, [(0.023, 0.022), (0.018, 0.017), (0.011, 0.011)], [greens[1]], root)
    leaf("Slime leaf", [(0.081, -0.014, 0.814), (0.17, -0.029, 0.850), (0.28, -0.021, 0.91), (0.39, -0.006, 0.969), (0.46, 0.017, 1.065)], [0.008, 0.090, 0.114, 0.074, 0.001], greens, root, (0, 1, 0))
    return scene


def make_moss_stump():
    scene, root = new_monster("Moss Stump")
    rng = random.Random(27)
    bark = [material("Bark – honey ridges", "926039"), material("Bark – ochre", "785137"), material("Bark – umber grooves", "503823"), material("Bark – moss shade", "695133")]
    cut = material("Heartwood – ochre cut", "B68750")
    growth = material("Heartwood – growth lines", "996939")
    hollow_rim = material("Eye rim – worn wood", "7C4D23")
    hollow = material("Eye hollow – dark wood", "33241C")
    amber = material("Eye – amber glow", "FFC456", 0.62, 0.55)
    ember = material("Eye – yellow core", "FFEA8B", 0.56, 0.72)
    moss = [material("Moss – deep shade", "506437"), material("Moss – warm green", "70843B"), material("Moss – lime tips", "91A44A"), material("Moss – gold tips", "ABAF53")]
    greens = leaf_palette()
    sides = 18
    radial = [1.03, 0.91, 1.12, 1.04, 0.94, 1.05, 1, 0.96, 1.12, 1.02, 0.91, 1.1, 0.96, 1.04, 0.94, 1.1, 0.95, 1.02]
    ring_profile = [(0.035, 0.52, 0.40), (0.13, 0.49, 0.38), (0.30, 0.42, 0.34), (0.54, 0.36, 0.305), (0.76, 0.36, 0.313), (0.97, 0.39, 0.345), (1.16, 0.405, 0.355), (1.235, 0.382, 0.332)]
    verts = []
    for index, (z, x_radius, y_radius) in enumerate(ring_profile):
        for side, noise in enumerate(radial):
            angle = math.tau * side / sides + 0.14 + (z - 0.5) * 0.1
            uneven = 0.045 * math.sin(side * 1.7) if index >= 6 else 0.018 * math.sin(side * 1.7 + z)
            verts.append((x_radius * noise * math.cos(angle) - 0.045 * z, y_radius * noise * math.sin(angle) + 0.034 * z, z + uneven))
    faces = [tuple(reversed(range(sides)))]
    for ring in range(len(ring_profile) - 1):
        for side in range(sides):
            low = ring * sides
            nxt = (side + 1) % sides
            faces.append((low + side, low + nxt, low + sides + nxt, low + sides + side))
    faces.append(tuple(range(len(verts) - sides, len(verts))))
    trunk = mesh("Fluted tapered trunk", verts, faces, bark + [cut], root)
    bark_strips = (0, 1, 0, 2, 1, 3, 0, 1, 2, 0, 1, 3, 0, 2, 1, 0, 1, 2)
    for polygon in trunk.data.polygons:
        polygon.material_index = 4 if polygon.index == len(faces) - 1 else bark_strips[(polygon.index - 1) % sides]

    paws = (
        ("Left walking root", [(-0.24, -0.22, 0.3), (-0.32, -0.39, 0.15), (-0.47, -0.54, 0.08), (-0.59, -0.57, 0.04)], [(0.16, 0.20), (0.15, 0.12), (0.14, 0.072), (0.065, 0.038)]),
        ("Right walking root", [(0.24, -0.21, 0.285), (0.37, -0.35, 0.17), (0.46, -0.54, 0.085), (0.53, -0.635, 0.039)], [(0.17, 0.185), (0.15, 0.12), (0.14, 0.083), (0.077, 0.036)]),
        ("Left buttress", [(-0.28, 0.075, 0.31), (-0.48, 0.10, 0.15), (-0.65, 0.18, 0.06), (-0.75, 0.24, 0.02)], [(0.135, 0.17), (0.12, 0.11), (0.082, 0.05), (0.023, 0.016)]),
        ("Right buttress", [(0.25, 0.105, 0.33), (0.44, 0.14, 0.14), (0.59, 0.21, 0.053), (0.73, 0.19, 0.018)], [(0.14, 0.19), (0.13, 0.11), (0.08, 0.05), (0.02, 0.014)]),
        ("Rear buttress", [(-0.01, 0.25, 0.27), (0.10, 0.39, 0.12), (0.08, 0.54, 0.05), (0.04, 0.60, 0.016)], [(0.15, 0.16), (0.13, 0.08), (0.068, 0.046), (0.023, 0.012)]),
    )
    for name, points, radii in paws:
        swept_shape(name, points, radii, bark[:3], root, z_floor=0)

    rim = ball("Knotted eye socket lip", (-0.031, -0.288, 0.755), (0.221, 0.077, 0.158), hollow_rim, root)
    rim.rotation_euler.y = 0.11
    socket = ball("Shared eye hollow", (-0.031, -0.345, 0.756), (0.186, 0.035, 0.127), hollow, root)
    socket.rotation_euler.y = 0.08
    for index, (x, z, size) in enumerate(((-0.117, 0.741, 0.049), (0.059, 0.768, 0.054)), start=1):
        ball(f"Amber eye {index}", (x, -0.374, z), (size, 0.023, size * 1.28), amber, root)
        ball(f"Amber eye {index} lit center", (x - 0.01, -0.393, z + 0.02), (size * 0.36, 0.006, size * 0.54), ember, root)

    for index, radius in enumerate((0.075, 0.13, 0.198, 0.255)):
        points = [(-0.046 + radius * math.cos(angle), 0.034 + radius * 0.8 * math.sin(angle), 1.253 + 0.008 * math.sin(angle * 2)) for angle in [j * math.tau / 16 for j in range(17)]]
        swept_shape(f"Weathered growth ring {index + 1}", points, [(0.008, 0.006)] * len(points), [growth], root, sides=5)

    for index in range(25):
        angle = 0.28 + (math.tau - 0.42) * index / 25
        radial_size = rng.uniform(0.07, 0.39)
        x = -0.048 + radial_size * math.cos(angle)
        y = 0.035 + radial_size * 0.87 * math.sin(angle)
        if y < -0.045 and -0.15 < x < 0.18:
            continue
        z = 1.22 + rng.uniform(-0.015, 0.08) - max(0, radial_size - 0.26) * 0.28
        scale = rng.uniform(0.062, 0.129)
        cluster = ball(f"Moss crown cluster {index + 1}", (x, y, z), (scale * 1.42, scale * 1.30, scale * 0.76), moss[index % len(moss)], root, rough=True)
        cluster.rotation_euler.z = rng.uniform(-math.pi, math.pi)
    for index, (x, y, z, size) in enumerate(((-0.25, -0.25, 1.16, 0.10), (-0.29, -0.269, 1.09, 0.084), (-0.31, -0.25, 1.01, 0.058), (0.31, -0.105, 1.15, 0.10), (0.32, -0.115, 1.06, 0.064), (0.28, -0.2, 1.1, 0.07))):
        ball(f"Trailing moss {index + 1}", (x, y, z), (size, size * 0.70, size * 0.95), moss[(index + 1) % len(moss)], root, rough=True)

    sprout = [(-0.12, 0.096, 1.22), (-0.10, 0.09, 1.421), (-0.039, 0.082, 1.552)]
    swept_shape("Crown sprout", sprout, [(0.022, 0.021), (0.016, 0.016), (0.008, 0.007)], [greens[1]], root)
    leaf("High leaf", [(-0.075, 0.086, 1.482), (-0.023, 0.080, 1.527), (0.053, 0.087, 1.58), (0.127, 0.11, 1.619), (0.188, 0.128, 1.63)], [0.006, 0.054, 0.064, 0.038, 0.001], greens, root, (0, 1, 0))
    leaf("Low leaf", [(-0.102, 0.087, 1.394), (-0.168, 0.073, 1.433), (-0.231, 0.047, 1.455), (-0.281, 0.037, 1.465), (-0.322, 0.013, 1.446)], [0.005, 0.045, 0.057, 0.034, 0.001], greens, root, (0, -1, 0))

    bpy.context.view_layer.update()
    ground_gap = min((part.matrix_world @ vertex.co).z for part in root.children for vertex in part.data.vertices)
    for part in root.children:
        part.location.z -= ground_gap
    return scene


def export(scene, name):
    bpy.context.window.scene = scene
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT / f"{name}.glb"),
        export_format="GLB",
        export_apply=True,
        use_active_scene=True,
    )


def main():
    initial_scene = bpy.context.scene
    slime = make_leaf_slime()
    stump = make_moss_stump()
    bpy.data.scenes.remove(initial_scene)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    export(slime, "leaf-slime")
    export(stump, "moss-stump")
    bpy.context.window.scene = slime
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "forest-monsters.blend"), compress=True)


if __name__ == "__main__":
    main()
