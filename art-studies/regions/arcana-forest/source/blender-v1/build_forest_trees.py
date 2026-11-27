"""Build the two pondside forest oak meshes and export their per-tree GLBs.

Run with Blender in background mode from any working directory.
"""

from math import cos, sin, tau
from pathlib import Path
from random import Random

import bmesh
import bpy
from mathutils import Vector


SOURCE = Path(__file__).resolve().parent
PROJECT = SOURCE.parents[4]
EXPORT = PROJECT / "godot-arcana/art/source/pondside-forest-3d"

BARK = [
    ("Deep bark", "3B2B24"),
    ("Cool bark", "604130"),
    ("Warm bark", "80573B"),
    ("Raised bark", "A57346"),
    ("Peeling bark", "B78B57"),
]
FOLIAGE = [
    ("Deep canopy", "203C35"),
    ("Cool canopy", "2D5140"),
    ("Forest leaf", "3E6442"),
    ("Leaf", "567845"),
    ("Olive leaf", "748A4A"),
    ("Sunlit leaf", "8FA14F"),
    ("New growth", "ADB665"),
]


class MeshBuilder:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.material_indices = []

    def face(self, indices, material):
        self.faces.append(tuple(indices))
        self.material_indices.append(material)

    def add_mesh(self, vertices, faces, materials):
        start = len(self.vertices)
        self.vertices.extend(Vector(point) for point in vertices)
        for face, material in zip(faces, materials, strict=True):
            self.face((start + index for index in face), material)

    def make_object(self, name, collection, materials):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        for material in materials:
            mesh.materials.append(material)
        for face, material in zip(mesh.polygons, self.material_indices, strict=True):
            face.material_index = material
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def linear_srgb(value):
    channel = int(value, 16) / 255.0
    return channel / 12.92 if channel < 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def build_materials(palette, two_sided=False):
    result = []
    for name, rgb in palette:
        color = tuple(linear_srgb(rgb[i : i + 2]) for i in (0, 2, 4)) + (1.0,)
        material = bpy.data.materials.new(name)
        material.diffuse_color = color
        material.use_nodes = True
        material.use_backface_culling = not two_sided
        surface = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        surface.inputs["Base Color"].default_value = color
        surface.inputs["Roughness"].default_value = 0.94
        result.append(material)
    return result


def branch(mesh, path, rng, sides):
    points = [Vector(p[:3]) for p in path]
    radii = [p[3] for p in path]
    ridges = [rng.uniform(0.82, 1.18) for _ in range(sides)]
    pitch = rng.uniform(0, tau)
    shades = [rng.choices(range(5), weights=(2, 4, 6, 3, 1))[0] for _ in range(sides)]
    vertices = []
    for row, (point, radius) in enumerate(zip(points, radii, strict=True)):
        tangent = (points[min(row + 1, len(points) - 1)] - points[max(row - 1, 0)]).normalized()
        facing = Vector((0, 1, 0))
        if abs(tangent.dot(facing)) > 0.92:
            facing = Vector((1, 0, 0))
        across = facing.cross(tangent).normalized()
        normal = tangent.cross(across).normalized()
        for spoke in range(sides):
            angle = pitch + spoke * tau / sides + 0.063 * row
            local_radius = radius * ridges[spoke] * rng.uniform(0.94, 1.06)
            ring_point = point + local_radius * (cos(angle) * across + sin(angle) * normal)
            ring_point.z = max(0.0, ring_point.z)
            vertices.append(ring_point)
    faces = [tuple(reversed(range(sides)))]
    materials = [1]
    for row in range(len(path) - 1):
        for spoke in range(sides):
            a = row * sides + spoke
            b = row * sides + (spoke + 1) % sides
            faces.append((a, b, b + sides, a + sides))
            materials.append(shades[spoke] if rng.random() > 0.18 else min(shades[spoke] + 1, 4))
    faces.append(tuple(range(len(vertices) - sides, len(vertices))))
    materials.append(2)
    mesh.add_mesh(vertices, faces, materials)


def icosphere(subdivisions):
    seed = bmesh.new()
    bmesh.ops.create_icosphere(seed, subdivisions=subdivisions, radius=1.0)
    seed.verts.index_update()
    vertices = [vertex.co.copy() for vertex in seed.verts]
    faces = [tuple(vertex.index for vertex in face.verts) for face in seed.faces]
    seed.free()
    return vertices, faces


def leaf_cluster(mesh, sprigs, template, center, size, level, rng):
    shell, faces = template
    angle = rng.uniform(0, tau)
    vertices = []
    for vertex in shell:
        lobed = rng.uniform(0.86, 1.15)
        x = (vertex.x * cos(angle) - vertex.y * sin(angle)) * size[0] * lobed
        y = (vertex.x * sin(angle) + vertex.y * cos(angle)) * size[1] * lobed
        vertices.append((center[0] + x, center[1] + y, center[2] + vertex.z * size[2] * lobed))

    materials = []
    for face in faces:
        height = sum(shell[index].z for index in face) / len(face)
        shade = level + (1 if height > 0.28 else -1 if height < -0.23 else 0)
        if rng.random() < 0.20:
            shade += rng.choice((-1, 1))
        materials.append(min(max(shade, 0), 6))
    mesh.add_mesh(vertices, faces, materials)

    for index, local in enumerate(shell):
        if local.z < 0.15 or rng.random() > 0.26:
            continue
        anchor = Vector(vertices[index])
        radial = (anchor - Vector(center)).normalized()
        turn = radial.cross(Vector((0.0, 0.0, 1.0))).normalized()
        growth = (0.57 * radial + Vector((0.0, 0.0, 0.28))).normalized()
        up = growth.cross(turn).normalized()
        length = rng.uniform(0.16, 0.35) * min(size)
        width = length * rng.uniform(0.38, 0.68)
        for side in (-1, 1):
            axis = (growth + turn * side * 0.69).normalized()
            rim = up.cross(axis).normalized()
            middle = anchor + axis * length * 0.53
            positions = [
                anchor,
                middle + rim * width,
                anchor + axis * length,
                middle - rim * width,
                middle + up * width * 0.45,
            ]
            sprigs.add_mesh(
                positions,
                ((0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)),
                (min(level + 1, 6), min(level + 2, 6), min(level + 2, 6), min(level + 1, 6)),
            )


def grow_tree(mature, seed):
    rng = Random(seed)
    trunk = MeshBuilder()
    crown = MeshBuilder()
    sprigs = MeshBuilder()
    primary = [
        (0.00, 0.00, 0.00, 0.26),
        (0.01, 0.00, 0.17, 0.20),
        (-0.04, 0.00, 0.55, 0.14),
        (0.03, 0.02, 0.94, 0.11),
        (-0.04, 0.06, 1.30, 0.09),
        (0.02, 0.03, 1.66, 0.06),
        (0.11, 0.07, 2.08, 0.025),
    ]
    if mature:
        primary = [
            (0.00, 0.00, 0.00, 0.70),
            (0.04, 0.01, 0.35, 0.53),
            (-0.13, 0.01, 0.90, 0.43),
            (-0.06, 0.02, 1.48, 0.36),
            (0.20, 0.10, 2.05, 0.31),
            (0.16, 0.13, 2.62, 0.24),
            (-0.23, 0.19, 3.23, 0.16),
            (-0.47, 0.25, 4.18, 0.08),
        ]
    branch(trunk, primary, rng, 13 if mature else 10)

    root_count = 8 if mature else 6
    for index in range(root_count):
        angle = index * tau / root_count + rng.uniform(-0.20, 0.20)
        distance = rng.uniform(1.22, 2.04) if mature else rng.uniform(0.26, 0.48)
        width = rng.uniform(0.18, 0.30) if mature else rng.uniform(0.075, 0.105)
        axis = Vector((cos(angle), sin(angle), 0))
        sideways = Vector((-axis.y, axis.x, 0)) * rng.uniform(-0.20, 0.20) * distance
        start = axis * (0.18 if mature else 0.07)
        bend = axis * (distance * 0.42) + sideways
        end = axis * distance + sideways * 0.50
        branch(
            trunk,
            [
                (start.x, start.y, width * 1.8, width),
                (bend.x, bend.y, width * 0.7, width * 0.82),
                (end.x * 0.78, end.y * 0.78, width * 0.36, width * 0.52),
                (end.x, end.y, width * 0.14, width * 0.12),
            ],
            rng,
            8 if mature else 6,
        )
        if mature and index % 2 == 0:
            fork = end + sideways * 2.1
            branch(
                trunk,
                [(bend.x, bend.y, width * 0.65, width * 0.53), (fork.x, fork.y, width * 0.2, width * 0.08)],
                rng,
                6,
            )

    # Endpoints group the crown into a clear dome with uneven, staggered shoulders.
    if mature:
        terminals = [
            (-2.04, -0.52, 3.14, 0.83), (-1.44, -1.67, 3.67, 0.84),
            (0.05, -1.91, 3.25, 0.79), (1.66, -1.21, 3.73, 0.83),
            (2.14, 0.20, 3.46, 0.81), (1.52, 1.49, 3.98, 0.90),
            (-0.12, 1.87, 3.34, 0.83), (-1.42, 1.35, 4.09, 0.81),
            (-0.65, -0.82, 4.83, 0.91), (0.85, -0.32, 4.61, 0.86),
            (0.29, 0.97, 4.88, 0.88), (-0.48, 0.19, 5.25, 0.82),
        ]
    else:
        terminals = [
            (-0.57, -0.16, 1.65, 0.30), (-0.31, -0.48, 1.96, 0.32),
            (0.24, -0.47, 1.80, 0.33), (0.59, 0.00, 1.88, 0.32),
            (0.26, 0.45, 1.92, 0.31), (-0.32, 0.39, 1.78, 0.33),
            (-0.23, -0.04, 2.25, 0.37), (0.25, 0.19, 2.31, 0.35),
            (0.01, -0.13, 2.48, 0.33),
        ]

    core_template = icosphere(3 if mature else 2)
    tuft_template = icosphere(2)
    for i, (x, y, z, radius) in enumerate(terminals):
        base = primary[min(len(primary) - 2, (3 + (i % 3)) + (i >= root_count))]
        start = Vector(base[:3])
        tip = Vector((x, y, z))
        bend = start.lerp(tip, 0.48)
        bend.z -= 0.26 if mature else 0.07
        wrist = start.lerp(tip, 0.79)
        thickness = (0.13 + 0.017 * (i % 4)) if mature else (0.055 + 0.009 * (i % 3))
        branch(trunk, [(*start, thickness * 1.55), (*bend, thickness), (*wrist, thickness * 0.66), (*tip, thickness * 0.18)], rng, 9 if mature else 7)

        height_tier = int(i >= len(terminals) - 4)
        level = rng.randint(2, 3) + height_tier
        leaf_cluster(crown, sprigs, core_template, tip, (radius, radius * 0.92, radius * 0.65), level, rng)
        tuft_count = 9 if mature else 7
        offset = rng.uniform(0, tau)
        for j in range(tuft_count):
            angle = offset + j * tau / tuft_count
            spread = radius * rng.uniform(0.44, 0.83)
            dx = cos(angle) * spread
            dy = sin(angle) * spread
            dz = radius * rng.uniform(-0.36, 0.59)
            outer_tip = tip + Vector((dx, dy, dz))
            tuft = radius * rng.uniform(0.28, 0.53)
            shade = level + (1 if dz > radius * 0.10 else 0)
            if j % 2 == 0:
                branch(trunk, [(*wrist, thickness * 0.48), (*tip, thickness * 0.37), (*outer_tip, thickness * 0.09)], rng, 5)
            leaf_cluster(crown, sprigs, tuft_template, outer_tip, (tuft, tuft * 0.96, tuft * 0.69), shade, rng)

    return trunk, crown, sprigs


def fit_bounds(builders, width, depth, height):
    vertices = [point for builder in builders for point in builder.vertices]
    minimum = [min(point[axis] for point in vertices) for axis in range(3)]
    maximum = [max(point[axis] for point in vertices) for axis in range(3)]
    for point in vertices:
        point.x *= (width * 0.5) / (maximum[0] if point.x >= 0 else -minimum[0])
        point.y *= (depth * 0.5) / (maximum[1] if point.y >= 0 else -minimum[1])
        point.z = (point.z - minimum[2]) * height / (maximum[2] - minimum[2])
    fitted_min = tuple(round(min(v[axis] for v in vertices), 4) for axis in range(3))
    fitted_max = tuple(round(max(v[axis] for v in vertices), 4) for axis in range(3))
    return fitted_min, fitted_max


def make_tree(name, filename, mature, dimensions, seed, bark_materials, leaf_materials):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    tree = grow_tree(mature, seed)
    minimum, maximum = fit_bounds(tree, *dimensions)
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    collection.objects.link(root)
    parts = [
        tree[0].make_object("Trunk and roots", collection, bark_materials),
        tree[1].make_object("Crown", collection, leaf_materials),
        tree[2].make_object("Leaves", collection, leaf_materials),
    ]
    for obj in parts:
        obj.parent = root

    bpy.ops.object.select_all(action="DESELECT")
    for obj in (root, *parts):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(EXPORT / filename), export_format="GLB",
        use_selection=True, export_yup=True,
    )
    print(f"{filename} Blender bounds {minimum} through {maximum}", flush=True)
    return collection


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    EXPORT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bark_materials = build_materials(BARK)
    leaf_materials = build_materials(FOLIAGE, two_sided=True)
    young = make_tree("Young Oak", "young-oak.glb", False, (2.0, 2.0, 2.8), 643, bark_materials, leaf_materials)
    mature = make_tree("Timber Oak", "timber-oak.glb", True, (6.2, 5.7, 6.05), 430, bark_materials, leaf_materials)
    # Keep the exported pivots at zero. Lay out the two editable sources side by side.
    bpy.data.objects["Young Oak"].location.x = -4.2
    bpy.data.objects["Timber Oak"].location.x = 0.95
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = None
    for collection in (young, mature):
        collection.color_tag = "COLOR_04"
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "forest-trees.blend"))


if __name__ == "__main__":
    main()

