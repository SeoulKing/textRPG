"""Build the south river and its limestone bridge from the plaza's gameplay layout.

Run with Blender in background/factory-startup mode. All measurements below use
Godot's (x, height, z) world coordinates. Geometry is converted once at export.
"""
import json
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector


SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[4]
ART = ROOT / "godot-arcana/art/source/plaza-south-river"
layout = json.loads((ROOT / "godot-arcana/data/plaza-terraces.json").read_text(encoding="utf-8-sig"))
spans = layout["river"]["spans"]
left, start, right, end = layout["bridge"]["rect"]
fishing_x, fishing_z = layout["fishingAccess"]
water_y = layout["river"]["height"]
rng = random.Random(19427)
palette = {}


def srgb(value):
    c = int(value, 16) / 255
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def material(name, color):
    mat = bpy.data.materials.new(name)
    rgb = tuple(srgb(color[i:i + 2]) for i in (0, 2, 4))
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*rgb, 1)
    node.inputs["Roughness"].default_value = .91
    palette[name] = mat


class Part:
    """One editable mesh per material family / feature, batched for export."""
    def __init__(self, name):
        self.name = name
        self.vertices = []
        self.polygons = []
        self.colors = []

    def face(self, points, color):
        ids = []
        for x, h, z in points:
            ids.append(len(self.vertices))
            self.vertices.append((x, -z, h))
        self.polygons.append(ids)
        self.colors.append(color)

    def solid(self, base, top, wall, cap=None):
        self.face(base[::-1], wall)
        self.face(top, cap or wall)
        for i in range(len(base)):
            j = (i + 1) % len(base)
            self.face([base[i], base[j], top[j], top[i]], wall)

    def box(self, x0, x1, z0, z1, bottom, top, wall, cap=None):
        corners = [(x0, z0), (x0, z1), (x1, z1), (x1, z0)]
        self.solid([(x, bottom, z) for x, z in corners],
                   [(x, top, z) for x, z in corners], wall, cap)

    def finish(self):
        if not self.polygons:
            return
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices, [], self.polygons)
        mesh.update()
        slots = {}
        for polygon, color in zip(mesh.polygons, self.colors):
            if color not in slots:
                slots[color] = len(mesh.materials)
                mesh.materials.append(palette[color])
            polygon.material_index = slots[color]
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


def tri_up(mesh, points, mat):
    # The top normal in Godot coordinates is +Y.
    a, b, c = points
    cross_y = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2])
    mesh.face(points if cross_y >= 0 else points[::-1], mat)


def interpolate(a, b, t):
    return a + (b - a) * t


def strip_bank(north):
    name = "Northern" if north else "Southern"
    bank = Part(name + " meadow and exposed soil")
    wet_index = 2 if north else 3
    sign = -1 if north else 1
    stations = []
    for i, span in enumerate(spans):
        x0, x1 = span[:2]
        wet = span[wet_index]
        if i == 0:
            stations.append((x0, wet))
        if stations[-1][1] != wet:
            stations.append((x0, wet))
        steps = max(2, math.ceil(x1 - x0))
        for step in range(1, steps + 1):
            stations.append((interpolate(x0, x1, step / steps), wet))
    rings = []
    for x, wet in stations:
        # The water boundary stays exactly on the authoritative span. The outer
        # turf edge and high-water mark have broader, independent silhouettes.
        wave = math.sin(x * .42 + sign) * .18 + math.sin(x * .79 - sign) * .09
        landing = (max(0, 1 - abs(x - fishing_x) / 3.0) if north else 0)
        near_bridge = max(0, 1 - max(left - x, x - right, 0) / 1.0)
        outer = 2.05 + wave + math.sin(x * .20) * .27
        heights = [water_y - .025, -.13, .012, .15 - .065 * landing,
                   .18 - .07 * landing, .115, .082]
        offsets = [-.025, .24, .50 + wave * .2, .84 + wave * .55 + landing * .22,
                   1.09 + wave * .7 + landing * .47, outer - .26, outer]
        ring = []
        for k, (offset, height) in enumerate(zip(offsets, heights)):
            bank_height = interpolate(height, min(height, .077), near_bridge)
            ring.append((x, bank_height, wet + sign * offset))
        rings.append(ring)
    for (x0, _), (x1, _), a, b in zip(stations, stations[1:], rings, rings[1:]):
        landing = north and abs((x0 + x1) / 2 - fishing_x) < 2.2
        materials = ["wet silt", "damp pebbles", "sandy shelf" if landing else "clay seam",
                     "sandy shelf" if landing else "turf edge", "meadow sage", "meadow rim"]
        for k, mat in enumerate(materials):
            if x0 == x1:
                points = [a[k], b[k], b[k + 1], a[k + 1]]
                bank.face(points if (north == (b[k][2] > a[k][2])) else points[::-1], mat)
            else:
                tri_up(bank, [a[k], b[k], b[k + 1]], mat)
                tri_up(bank, [a[k], b[k + 1], a[k + 1]], mat)
    bank.finish()


def water():
    surface = Part("RiverWater")
    for x0, x1, north, south in spans:
        surface.face([(x0, water_y, north), (x0, water_y, south),
                      (x1, water_y, south), (x1, water_y, north)], "river blue")
    obj = surface.finish()
    mesh = obj.data
    river_uv = mesh.uv_layers.new(name="Across the river")
    # Adjacent spans meet at stepped corners. Use the same average shoreline
    # at each shared X so the channel colour is continuous across those seams.
    cross_sections = {spans[0][0]: spans[0][2:4], spans[-1][1]: spans[-1][2:4]}
    for previous, current in zip(spans, spans[1:]):
        cross_sections[current[0]] = ((previous[2] + current[2]) * .5,
                                      (previous[3] + current[3]) * .5)
    for loop in mesh.loops:
        x, negative_z, _ = mesh.vertices[loop.vertex_index].co
        north, south = cross_sections[x]
        across = (-negative_z - north) / (south - north)
        river_uv.data[loop.index].uv = (across, x / 7)


def wet_edge(x, north):
    for x0, x1, n, s in spans:
        if x0 <= x < x1 or (x == x1 == spans[-1][1]):
            return n if north else s
    raise ValueError(x)


def stone(mesh, x, h, z, sx, sy, sz, tone):
    phase = rng.random() * math.tau
    n = 7
    radii = [rng.uniform(.83, 1.07) for _ in range(n)]
    def ring(scale, height, shift):
        points = []
        for i, r in enumerate(radii):
            a = phase - i * math.tau / n
            points.append((x + math.cos(a) * sx * r * scale + shift,
                           h + sy * height, z + math.sin(a) * sz * r * scale))
        return points
    foot, shoulder, top = ring(.76, -.32, 0), ring(1, .23, 0), ring(.62, .82, sx * .08)
    for i in range(n):
        j = (i + 1) % n
        mesh.face([foot[i], foot[j], shoulder[j], shoulder[i]], tone)
        mesh.face([shoulder[i], shoulder[j], top[j], top[i]], tone)
    mesh.face(top, tone)


def plant(mesh, x, h, z, blade_count, blade_height, reeds=False):
    for blade in range(blade_count):
        a = (blade + rng.random() * .55) * math.tau / blade_count
        length = blade_height * rng.uniform(.56, 1.14)
        width = (.065 if reeds else .075) * rng.uniform(.65, 1.28)
        lean = length * rng.uniform(.20, .57)
        dx, dz = math.cos(a), math.sin(a)
        root_x = x + dx * rng.uniform(.005, .12)
        root_z = z + dz * rng.uniform(.005, .12)
        side = (-dz * width, dx * width)
        split = (root_x + lean * dx * .35, h + .50 * length, root_z + lean * dz * .35)
        end_point = (root_x + lean * dx, h + length, root_z + lean * dz)
        # A folded lance has thickness and holds its shape from both shorelines.
        center = (split[0] - dx * width * .45, split[1], split[2] - dz * width * .45)
        l = (split[0] + side[0], split[1], split[2] + side[1])
        r = (split[0] - side[0], split[1], split[2] - side[1])
        base = (root_x, h, root_z)
        for vertices, mat in (([base, l, center], "leaf shadow"), ([l, end_point, center], "leaf sage"),
                              ([base, center, r], "leaf olive"), ([center, end_point, r], "leaf tip")):
            mesh.face(vertices, mat)
            mesh.face(vertices[::-1], mat)


def vegetation():
    for north in (True, False):
        direction = -1 if north else 1
        prefix = "North" if north else "South"
        stones = Part(prefix + " shingle and boulders")
        leaves = Part(prefix + " sedges and meadow grass")
        for x0, x1, _, _ in spans:
            # Unequal clusters leave broad clean water and an open fishing platform.
            for i in range(1 + int((x1 - x0) / 2)):
                cx = rng.uniform(x0 + .3, x1 - .3)
                if left - .8 < cx < right + .8 or (north and abs(cx - fishing_x) < 1.85):
                    continue
                for j in range(rng.randrange(2, 6)):
                    x = min(spans[-1][1] - .2, max(spans[0][0] + .2, cx + rng.uniform(-.75, .75)))
                    offset = rng.uniform(-.2, .42)
                    z = wet_edge(x, north) + direction * offset
                    r = rng.uniform(.10, .25) * (1.55 if j == 0 else 1)
                    stone(stones, x, water_y + .11 + .4 * offset, z, r * 1.28, r * .94,
                          r, rng.choice(["pebble slate", "pebble warm", "pebble moss"]))
                for j in range(rng.randrange(2, 5)):
                    x = max(spans[0][0], min(spans[-1][1], cx + rng.uniform(-.64, .64)))
                    offset = rng.choice([.34, 1.24, 1.5])
                    z = wet_edge(x, north) + direction * offset
                    plant(leaves, x, -.08 if offset < .5 else .155, z,
                          rng.randint(5, 9), rng.uniform(.42, .85) if offset < .5 else rng.uniform(.18, .33), offset < .5)
        # Flat, broad stones on either side of the approach at the casting ledge.
        if north:
            for x, radius in ((fishing_x - 1.55, .56), (fishing_x - 1.94, .32),
                              (fishing_x + 1.72, .44)):
                stone(stones, x, -.035, wet_edge(x, True) - .40, radius,
                      .18, radius * .70, "pebble warm")
        stones.finish()
        leaves.finish()


def bridge():
    deck = Part("Limestone span and paved deck")
    arch = Part("Segmental arch and dressed voussoirs")
    cap = Part("Low parapets and weathered copings")
    center = (start + end) / 2
    length = end - start
    half_opening = (wet_edge(0, False) - wet_edge(0, True)) * .5
    def road_height(z):
        t = max(0, 1 - abs(z - center) / (length * .5))
        return layout["bridge"]["edgeHeight"] + layout["bridge"]["rise"] * math.sin(t * math.pi / 2)
    def intrados(z):
        r = min(1, abs((z - center) / half_opening))
        return -.62 + .64 * math.sqrt(max(0, 1 - r * r))
    steps = 32
    depths = [interpolate(start, end, i / steps) for i in range(steps + 1)]
    for z0, z1 in zip(depths, depths[1:]):
        y0, y1, h0, h1 = intrados(z0), intrados(z1), road_height(z0), road_height(z1)
        deck.face([(left, h0, z0), (left, h1, z1), (right, h1, z1), (right, h0, z0)], "paving joint")
        deck.face([(left, y0, z0), (right, y0, z0), (right, y1, z1), (left, y1, z1)], "arch shadow")
        for x, d in ((left, -1), (right, 1)):
            outer = x + d * .35
            band = [(outer, y0, z0), (outer, y1, z1), (outer, h1, z1), (outer, h0, z0)]
            arch.face(band if d < 0 else band[::-1], "arch stone")
            arch.face([(x, y0, z0), (outer, y0, z0), (outer, y1, z1), (x, y1, z1)], "arch shadow")
    for i in range(19):
        z0 = interpolate(start, end, i / 19) + .013
        z1 = interpolate(start, end, (i + 1) / 19) - .013
        x = left
        width = .9
        while x < right - .02:
            x1 = min(right, x + (width * .56 if x == left and i % 2 else width))
            deck.face([(x + .014, road_height(z0) + layout["bridge"]["pavingThickness"], z0), (x + .014, road_height(z1) + layout["bridge"]["pavingThickness"], z1),
                       (x1 - .014, road_height(z1) + layout["bridge"]["pavingThickness"], z1), (x1 - .014, road_height(z0) + layout["bridge"]["pavingThickness"], z0)],
                       rng.choice(["deck cream", "deck sand", "deck pearl"]))
            x = x1
    for x, d in ((left, -1), (right, 1)):
        xa, xb = sorted((x, x + .34 * d))
        for i in range(17):
            z0, z1 = interpolate(start, end, i / 17), interpolate(start, end, (i + 1) / 17)
            mid = (z0 + z1) * .5
            h = road_height(mid)
            cap.box(xa, xb, z0 + .012, z1 - .012, h - .035, h + .38, "wall cream")
            cap.box(xa - .045, xb + .045, z0 + .012, z1 - .012, h + .38, h + .50, "cap ochre", "cap sun")
        for z in (start + .19, center, end - .19):
            h = road_height(z)
            cap.box(xa - .045, xb + .045, z - .20, z + .20, h, h + .62, "pier limestone")
            cap.box(xa - .09, xb + .09, z - .25, z + .25, h + .62, h + .73, "cap ochre", "cap sun")
        # Individual cut stones outline the arch rather than a solid rectangular slab.
        for i in range(17):
            a = (i + .055) * math.pi / 17
            b = (i + .945) * math.pi / 17
            xx = x + d * .355
            voussoir = [(xx, -.62 + rise * math.sin(t), center + radius * math.cos(t))
                        for t, radius, rise in ((a, half_opening, .64), (b, half_opening, .64),
                        (b, half_opening + .19, .735), (a, half_opening + .19, .735))]
            arch.face(voussoir if d > 0 else voussoir[::-1], "cap sun" if i == 8 else "pier limestone")
    deck.finish()
    arch.finish()
    cap.finish()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    colors = {
        "river blue":"288fa6", "wet silt":"725944", "damp pebbles":"97846c",
        "sandy shelf":"bbaa7a", "clay seam":"947653", "turf edge":"718054",
        "meadow sage":"899663", "meadow rim":"9a9d6d", "pebble warm":"a99f89",
        "pebble moss":"808368", "pebble slate":"858982", "leaf shadow":"4c6244",
        "leaf olive":"748545", "leaf sage":"87965a", "leaf tip":"a2a65e",
        "paving joint":"aa997b", "arch shadow":"746852", "arch stone":"b4a380",
        "deck cream":"dac9a3", "deck sand":"d6c29b", "deck pearl":"e2d1af",
        "wall cream":"d6c4a1", "cap ochre":"c6b18b", "cap sun":"ebd9b5",
        "pier limestone":"caba98",
    }
    for name, color in colors.items():
        material(name, color)
    water()
    strip_bank(True)
    strip_bank(False)
    vegetation()
    bridge()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.preferences.filepaths.save_version = 0
    # Keep imported vertex positions local to the plaza origin for the water shader.
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "south-river.blend"))
    bpy.ops.export_scene.gltf(filepath=str(ART / "south-river.glb"),
                              export_format="GLB", export_yup=True,
                              export_extras=False, export_cameras=False,
                              export_lights=False, export_animations=False)
    print("SOUTH_RIVER", len(bpy.context.scene.objects), "editable meshes", len(spans), "water spans")


if __name__ == "__main__":
    main()
