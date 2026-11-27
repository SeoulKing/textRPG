"""Build the Arcana restaurant shell. Run with Blender --background --python."""
from math import cos, pi, sin
from pathlib import Path
from random import Random

import bpy
import bmesh


OUT = Path(__file__).resolve().parents[2] / "godot-arcana/art/source/restaurant-brunch/architecture"
WIDTH, DEPTH = 14.0, 12.0
WINDOWS = (3.5, 8.5)
ENTRANCE_LEFT, ENTRANCE_RIGHT = 6.0, 8.0
SILL, SPRING, RADIUS = 0.94, 1.0, 1.05
WALL_TOP, CAP_TOP = 3.36, 3.50
ARCH_STEPS = 24


def material(name, hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    rgb = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4
           for value in channels]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1.0)
    shader.inputs["Roughness"].default_value = 0.88
    mat.diffuse_color = (*rgb, 1.0)
    return mat


def mesh_object(name, vertices, faces, palette, indices=(), closed=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    if closed:
        topology = bmesh.new()
        topology.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
        topology.to_mesh(mesh)
        topology.free()
    mesh.update()
    for mat in palette:
        mesh.materials.append(mat)
    for face, index in zip(mesh.polygons, indices):
        face.material_index = index
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def prism(name, front, back, mat):
    # Points use gameplay axes (X, depth, height). Blender depth is -Y.
    count = len(front)
    vertices = [(x, -depth, height) for x, depth, height in [*front, *back]]
    faces = [tuple(range(count)), tuple(range(count, count * 2))]
    faces.extend((i, (i + 1) % count, (i + 1) % count + count, i + count)
                 for i in range(count))
    return mesh_object(name, vertices, faces, [mat], closed=True)


def block(name, x0, depth0, x1, depth1, bottom, top, mat):
    outline = [(x0, depth0), (x1, depth0), (x1, depth1), (x0, depth1)]
    return prism(name, [(x, z, bottom) for x, z in outline],
                 [(x, z, top) for x, z in outline], mat)


def plank_floor():
    palette = [material(f"Oak plank {i + 1}", color) for i, color in enumerate(
        ("a16e49", "a97750", "b08056", "b28258", "b78458", "b88a60", "bf8d61"))]
    seam = material("Oak end grain and joints", "936645")
    grain = [material("Soft oak grain light", "bf8a5d"),
             material("Soft oak grain mid", "ae7e55")]
    block("Continuous floor substrate", 0.0, 0.0, WIDTH, DEPTH, -1.0, -0.012, seam)
    vertices, faces, indices = [], [], []

    def strip(x0, d0, x1, d1, height, color):
        start = len(vertices)
        vertices.extend(((x0, -d0, height), (x0, -d1, height),
                         (x1, -d1, height), (x1, -d0, height)))
        faces.append((start, start + 1, start + 2, start + 3))
        indices.append(color)

    rng = Random(319)
    depth = 0.0
    while depth < DEPTH:
        next_depth = min(depth + rng.uniform(0.24, 0.35), DEPTH)
        x = 0.0
        while x < WIDTH:
            length = rng.uniform(0.9, 3.4) if x == 0.0 else rng.uniform(2.7, 5.2)
            end = min(x + length, WIDTH)
            strip(x, depth, end - 0.012 if end < WIDTH else end,
                  next_depth - 0.009 if next_depth < DEPTH else next_depth, 0.0,
                  rng.choices(range(len(palette)), weights=(1, 3, 5, 5, 4, 3, 1))[0])
            if end - x > 1.0 and next_depth - depth > 0.18 and rng.random() < 0.50:
                line_start = x + rng.uniform(0.12, (end - x) * 0.5)
                line_end = min(end - 0.11, line_start + rng.uniform(0.32, 1.30))
                across = depth + rng.uniform(0.06, next_depth - depth - 0.08)
                strip(line_start, across, line_end, across + rng.uniform(0.012, 0.025),
                      0.0007, len(palette) + rng.randrange(len(grain)))
            x = end
        depth = next_depth
    mesh_object("Long oak boards and grain", vertices, faces, palette + grain, indices)


def west_arch(center, plaster):
    curve = [(center - RADIUS * cos(pi * i / ARCH_STEPS),
              SILL + SPRING + RADIUS * sin(pi * i / ARCH_STEPS))
             for i in range(ARCH_STEPS + 1)]
    for i, ((z0, h0), (z1, h1)) in enumerate(zip(curve, curve[1:])):
        profile = [(z0, h0), (z1, h1), (z1, WALL_TOP), (z0, WALL_TOP)]
        prism(f"Window {center:g} arch infill {i + 1:02d}",
              [(0.0, z, y) for z, y in profile], [(-1.0, z, y) for z, y in profile], plaster)


def room_textiles():
    canvas = material("Warm woven linen", "c9b78e")
    binding = material("Indigo woven border", "5a7486")
    thread = material("Faded blue embroidery", "788c98")
    for name, x0, z0, x1, z1 in (
        ("Counter runner", 4.4, 4.30, 10.8, 5.14),
        ("Shared table rug", 8.75, 7.20, 12.25, 10.80),
    ):
        block(name, x0, z0, x1, z1, 0.003, 0.015, canvas)
        for inset, line, mat in ((0.055, 0.044, binding), (0.138, 0.025, thread)):
            a, b, c, d = x0 + inset, z0 + inset, x1 - inset, z1 - inset
            block(f"{name} long edge", a, b, c, b + line, 0.015, 0.019, mat)
            block(f"{name} long edge", a, d - line, c, d, 0.015, 0.019, mat)
            block(f"{name} short edge", a, b + line, a + line, d - line, 0.015, 0.019, mat)
            block(f"{name} short edge", c - line, b + line, c, d - line, 0.015, 0.019, mat)
        if name == "Counter runner":
            z = (z0 + z1) * 0.5
            inner_margin = 0.138 + 0.025
            for index in range(4):
                x = x0 + (x1 - x0) * (index + 0.5) / 4
                if not (x0 + inner_margin <= x - 0.105 and x + 0.105 <= x1 - inner_margin
                        and z0 + inner_margin <= z - 0.074 and z + 0.074 <= z1 - inner_margin):
                    continue
                motif = [(x - 0.105, z), (x, z - 0.074), (x + 0.105, z), (x, z + 0.074)]
                prism("Runner lozenge", [(a, b, 0.015) for a, b in motif],
                      [(a, b, 0.020) for a, b in motif], binding)


def wall_wainscot(panel, trim):
    # Each band wraps the inside corner as one piece, with no overlapping top faces.
    for name, projection, bottom, top, mat in (
        ("Wainscot panel", 0.026, 0.09, 0.78, panel),
        ("Wainscot baseboard", 0.052, 0.0, 0.11, trim),
        ("Wainscot chair rail", 0.058, 0.76, 0.84, trim),
    ):
        outline = [(-0.03, -0.03), (WIDTH, -0.03), (WIDTH, projection),
                   (projection, projection), (projection, DEPTH), (-0.03, DEPTH)]
        prism(name, [(x, z, bottom) for x, z in outline], [(x, z, top) for x, z in outline], mat)
    pitch, bead_width = 0.37, 0.015
    for index in range(1, int((WIDTH - bead_width) / pitch) + 1):
        x = index * pitch
        block("North wainscot bead", x, 0.025, x + bead_width, 0.029, 0.11, 0.76, trim)
    for index in range(1, int((DEPTH - bead_width) / pitch) + 1):
        z = index * pitch
        block("West wainscot bead", 0.025, z, 0.029, z + bead_width, 0.11, 0.76, trim)


def room_shell():
    plaster = material("Warm lime plaster", "e7ceb0")
    wood = material("Dark oak joinery", "724b33")
    cap = material("Oiled oak rail cap", "a97952")
    blue = material("Hazy blue wainscot", "596f7b")
    blue_trim = material("Wainscot rails", "778d96")
    stone = material("Limestone entry", "899394")

    block("North underframe", -1.0, -1.0, WIDTH, 0.0, -1.0, 0.0, wood)
    block("North plaster wall", -1.0, -1.0, WIDTH, 0.0, 0.0, WALL_TOP, plaster)
    block("North wall cap", -1.0, -1.0, WIDTH, 0.04, WALL_TOP, CAP_TOP, cap)

    block("West underframe", -1.0, 0.0, 0.0, DEPTH, -1.0, 0.0, wood)
    block("West plaster below sills", -1.0, 0.0, 0.0, DEPTH, 0.0, SILL, plaster)
    block("West wall cap", -1.0, 0.0, 0.04, DEPTH, WALL_TOP, CAP_TOP, cap)
    wall_wainscot(blue, blue_trim)
    start = 0.0
    for center in WINDOWS:
        block("West wall between arches", -1.0, start, 0.0, center - RADIUS, SILL, WALL_TOP, plaster)
        west_arch(center, plaster)
        start = center + RADIUS
    block("West wall end", -1.0, start, 0.0, DEPTH, SILL, WALL_TOP, plaster)

    for name, x0, z0, x1, z1 in (
        ("East", WIDTH, -1.0, WIDTH + 1.0, DEPTH),
        ("South left", -1.0, DEPTH, ENTRANCE_LEFT, DEPTH + 1.0),
        ("South right", ENTRANCE_RIGHT, DEPTH, WIDTH + 1.0, DEPTH + 1.0),
    ):
        block(f"{name} platform face", x0, z0, x1, z1, -1.0, -0.11, wood)
        block(f"{name} flush boundary strip", x0, z0, x1, z1, -0.11, 0.0, cap)
    block("Two-cell limestone threshold", ENTRANCE_LEFT, DEPTH, ENTRANCE_RIGHT, DEPTH + 1.0,
          -1.0, -0.045, stone)
    block("Threshold walking surface", ENTRANCE_LEFT, DEPTH, ENTRANCE_RIGHT, DEPTH + 0.88,
          -0.045, 0.0, stone)
    block("Threshold nosing", ENTRANCE_LEFT, DEPTH + 0.88, ENTRANCE_RIGHT, DEPTH + 1.0, -0.045, 0.0,
          material("Limestone nosing", "a3aba9"))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.context.scene.tool_settings.use_snap = True
    bpy.context.scene.tool_settings.snap_elements = {"INCREMENT"}
    room_shell()
    plank_floor()
    room_textiles()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "room.blend"))
    bpy.ops.export_scene.gltf(filepath=str(OUT / "room.glb"), export_format="GLB",
                             export_lights=False, export_cameras=False)


if __name__ == "__main__":
    main()
