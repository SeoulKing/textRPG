"""Build the 22 × 30 plaza flagstones and export the Godot mesh."""
from math import cos, sin, tau
from pathlib import Path
import re
from random import Random

import bpy
from mathutils import Matrix, Vector


SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[4]
OUTPUT = ROOT / "godot-arcana/art/source/plaza-stone-paving/plaza-stone-paving.glb"
PALETTE = (
    "#9c8972", "#aa967d", "#b09c83", "#b6a189",
    "#bca890", "#c1ae96", "#c7b59d", "#cebea6",
)
MORTAR = "#927f6a"
RANDOM = Random(813)


def material(name, hex_color):
    srgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [(channel / 12.92 if channel < 0.04045 else
               ((channel + 0.055) / 1.055) ** 2.4) for channel in srgb]
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = (*linear, 1.0)
    surface = next(node for node in result.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    surface.inputs["Base Color"].default_value = result.diffuse_color
    surface.inputs["Roughness"].default_value = 0.94
    return result


def placement(scene, name, parent="."):
    """Read a saved Node3D placement, expressed in Godot coordinates."""
    header = f'[node name="{name}"'
    block = next(block for block in scene.split("\n\n")
                 if block.startswith(header) and f'parent="{parent}"' in block.splitlines()[0])
    values = re.search(r"^transform = Transform3D\(([^)]*)\)", block, re.M)
    if values:
        v = [float(item) for item in values[1].split(",")]
        return Matrix([(*v[0:3], v[9]), (*v[3:6], v[10]), (*v[6:9], v[11]), (0, 0, 0, 1)])
    position = re.search(r"^position = Vector3\(([^)]*)\)", block, re.M)
    if position:
        return Matrix.Translation(Vector(tuple(float(item) for item in position[1].split(","))))
    raise ValueError(f"Missing placement for {parent}/{name}")


def plan_point(location):
    # glTF's Y-up conversion maps Blender +Y to Godot -Z.
    return Vector((location.x, -location.z))


def course_joints(length, low, high, previous=()):
    """Partition an entire course on a 1/16-unit grid, with full stones at both ends."""
    count = round(length / ((low + high) / 2)) + RANDOM.choice((-1, 0, 1))
    joints = [0]
    for remaining in range(count - 1, 0, -1):
        first = max(joints[-1] + low, length - remaining * high)
        last = min(joints[-1] + high, length - remaining * low)
        options = list(range(first, last + 1))
        # Prefer T joints. Near a boundary a full end stone takes priority.
        staggered = [p for p in options if all(abs(p - old) >= 3 for old in previous)]
        joints.append(RANDOM.choice(staggered or options))
    return joints + [length]


def distance_to_path(point, start, end):
    direction = end - start
    t = max(0.0, min(1.0, (point - start).dot(direction) / direction.length_squared))
    return (point - (start + t * direction)).length


class PavingMesh:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.tones = []

    def loop(self, points, height):
        start = len(self.vertices)
        self.vertices.extend((x, y, height) for x, y in points)
        return tuple(range(start, len(self.vertices)))

    def face(self, indices, tone):
        self.faces.append(indices)
        self.tones.append(tone)

    def cap(self, points, height, tone):
        self.face(self.loop(points, height), tone)

    def slab(self, lower, upper, bottom, top, tone):
        base = self.loop(lower, bottom)
        lid = self.loop(upper, top)
        self.face(lid, tone)
        for i in range(len(lid)):
            j = (i + 1) % len(lid)
            dx = upper[j][0] - upper[i][0]
            dy = upper[j][1] - upper[i][1]
            edge_tone = tone + (1 if dx + dy < 0 else -1)
            self.face((base[i], base[j], lid[j], lid[i]), max(0, min(7, edge_tone)))

    def finish(self, root):
        mesh = bpy.data.meshes.new("Hand-cut limestone courses")
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        surface = bpy.data.objects.new("StoneTileSurface", mesh)
        bpy.context.collection.objects.link(surface)
        surface.parent = root
        for i, color in enumerate(PALETTE):
            mesh.materials.append(material(f"Limestone {i + 1}", color))
        mesh.materials.append(material("Sage in sheltered joints", "#898664"))
        mesh.materials.append(material("Warm joint bed", MORTAR))
        mesh.polygons.foreach_set("material_index", self.tones)
        return surface


def chipped_rectangle(w, e, s, n, cuts):
    a, b, c, d = cuts
    return [(w + a, s), (e - b, s), (e, s + b), (e, n - c),
            (e - c, n), (w + d, n), (w, n - d), (w, s + a)]


def grain(paving, x, y, height, tone, unit):
    # A few connected steps stay visible at game zoom and don't shimmer like isolated specks.
    stamp = RANDOM.choice((
        ((0, 0), (3, 0), (3, 1), (5, 1), (5, 2), (2, 2), (2, 1), (0, 1)),
        ((0, 0), (2, 0), (2, 1), (4, 1), (4, 2), (6, 2), (6, 3),
         (3, 3), (3, 2), (1, 2), (1, 1), (0, 1)),
        ((0, 1), (1, 1), (1, 0), (3, 0), (3, 1), (4, 1), (4, 2),
         (2, 2), (2, 3), (0, 3)),
    ))
    sign = RANDOM.choice((-1, 1))
    points = [(x + sign * u * unit, y + v * unit) for u, v in stamp]
    paving.cap(points if sign > 0 else points[::-1], height, tone)


def lay_course(paving, previous, south, north, slopes, doors, paths):
    joints = course_joints(22 * 16, 10, 20, previous[1:-1])
    for left, right in zip(joints, joints[1:]):
        w, e = -11 + left / 16 + 0.012, -11 + right / 16 - 0.012
        s, n = south + 0.016, north - 0.016
        x, y = (w + e) / 2, (s + n) / 2
        point = Vector((x, y))
        distance = min(distance_to_path(point, a, b) for a, b in paths)
        polish = max(0.0, 1.0 - distance / 1.75)
        tone = RANDOM.choices(range(1, 6), (1, 4, 6, 4, 1))[0]
        if RANDOM.random() < 0.62 * polish:
            tone += 1
        cuts = [RANDOM.uniform(0.025, 0.087) for _ in range(4)]
        if RANDOM.random() < 0.16:
            cuts[RANDOM.randrange(4)] += 0.045
        top = RANDOM.uniform(-0.004, 0.001)

        def lean(points):
            # Both neighboring courses use the same straight boundary at every T junction.
            return [(u, v + u * (slopes[0] + (slopes[1] - slopes[0]) *
                                   (v - south) / (north - south))) for u, v in points]

        lower = lean(chipped_rectangle(w, e, s, n, cuts))
        inset = RANDOM.uniform(0.015, 0.026)
        upper = lean(chipped_rectangle(w + inset, e - inset, s + inset, n - inset, cuts))
        paving.slab(lower, upper, -0.019, top, tone)
        # A broken light catch along one part of the rim, with occasional mineral flecks.
        if RANDOM.random() < 0.60:
            length = RANDOM.uniform(0.16, 0.35)
            left_tip = RANDOM.uniform(w + 0.11, e - length - 0.11)
            edge = n - inset - 0.006
            lip = [(left_tip, edge - 0.042), (left_tip + length * 0.64, edge - 0.042),
                   (left_tip + length * 0.64, edge - 0.063), (left_tip + length, edge - 0.063),
                   (left_tip + length - 0.03, edge), (left_tip + 0.025, edge)]
            paving.cap(lean(lip), top + 0.0025, min(7, tone + 2))
        if RANDOM.random() < 0.48 - polish * 0.20:
            # Corner spalls hug the clipped outline, leaving most of the face undisturbed.
            flip = RANDOM.choice((-1, 1))
            cut = cuts[3 if flip == 1 else 2]
            start = w + inset if flip == 1 else e - inset
            depth = RANDOM.uniform(0.048, 0.087)
            end = RANDOM.uniform(0.12, 0.24)
            spall = [(cut, 0), (cut + end, 0), (cut + end - 0.035, depth * 0.48),
                     (cut + 0.055, depth * 0.48), (cut + 0.025, depth),
                     (0.035, cut + depth), (0, cut + depth), (0, cut)]
            patch = [(start + u * flip, n - inset - v) for u, v in spall]
            chipped_tone = max(0, tone - RANDOM.choice((1, 2)))
            paving.cap(lean(patch[::-1] if flip == 1 else patch), top + 0.0045, chipped_tone)
        if RANDOM.random() < 0.46 - polish * 0.21:
            gx, gy = x + RANDOM.uniform(-0.065, 0.065), y + RANDOM.uniform(-0.07, 0.025)
            tone_shift = RANDOM.choice((-2, -1, 2))
            grain(paving, gx, gy, top + 0.003, max(0, min(7, tone + tone_shift)),
                  RANDOM.uniform(0.033, 0.046))
            if RANDOM.random() < 0.38:
                grain(paving, gx, gy - 0.065, top + 0.003, min(7, tone + 2), 0.018)
        if any(1.0 < abs(x - door.x) < 4.15 and 0.1 < y - door.y < 1.15 for door in doors):
            if RANDOM.random() < 0.35:
                grain(paving, x, n - 0.048 + x * slopes[1], top + 0.0045,
                      len(PALETTE), 0.031)
    return joints


def fountain_border(paving, center):
    count = 60
    inner, outer = 4.085, 4.49
    def arc(start, end, r1, r2):
        def at(radius, angle):
            return (center.x + radius * cos(angle), center.y + radius * sin(angle))
        return [at(r1, start), at(r2, start), at(r2, end), at(r1, end)]
    for i in range(count):
        a, b = tau * i / count, tau * (i + 1) / count
        paving.cap(arc(a, b, inner, outer), 0.009, len(PALETTE) + 1)
        lower = arc(a + 0.002, b - 0.002, inner, outer - 0.012)
        upper = arc(a + 0.006, b - 0.006, inner + 0.012, outer - 0.027)
        paving.slab(lower, upper, 0.0095, 0.018, RANDOM.choice((2, 3, 4, 4, 5, 6)))


def stone_tiles(root):
    scene = (ROOT / "godot-arcana/scenes/plaza_3d_v2.tscn").read_text(encoding="utf-8-sig")
    fountain = plan_point(placement(scene, "Fountain").translation)
    inn = placement(scene, "Inn") @ placement(scene, "InteractionPoint", "Inn")
    shop = placement(scene, "Shop")
    doors = [plan_point(inn.translation), plan_point(shop.translation + shop.col[2].xyz.normalized() * 0.5)]
    paths = [(doors[0], fountain), (doors[1], fountain), (doors[0], doors[1])]
    paving = PavingMesh()
    rows = [value / 16 - 15 for value in course_joints(30 * 16, 7, 12)]
    slopes = [0.0] + [RANDOM.uniform(-0.004, 0.004) for _ in rows[1:-1]] + [0.0]
    previous = []
    for i, (south, north) in enumerate(zip(rows, rows[1:])):
        previous = lay_course(paving, previous, south, north, slopes[i:i + 2], doors, paths)
    fountain_border(paving, fountain)
    return paving.finish(root)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    floor = bpy.data.objects.new("PlazaStonePaving", None)
    bpy.context.collection.objects.link(floor)
    surface = stone_tiles(floor)
    bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, -0.114))
    bed = bpy.context.object
    bed.name = "StoneBedding"
    bed.scale = (11, 15, 0.095)
    bed.parent = floor
    bed.data.materials.append(material("Recessed mortar", MORTAR))

    bpy.ops.object.select_all(action="DESELECT")
    for obj in (floor, surface, bed):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = surface
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), use_selection=True, export_extras=True)

    # Review the horizontal courses at the live plaza camera pitch.
    bpy.ops.object.camera_add(location=(0, -19.05, 11))
    camera = bpy.context.object
    camera.rotation_euler = (-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 12.5
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.light = "FLAT"
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 570
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(SOURCE / "plaza-stone-paving-preview.png")
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "plaza-stone-paving.blend"))
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
