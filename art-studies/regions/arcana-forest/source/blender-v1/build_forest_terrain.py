"""Build the Pondside Forest floor, pond, and bank details in Blender.

Run with Blender in background mode using --python and this script's path.
The authored world coordinates use Godot X/Z on the ground and Y for height.
"""

from math import atan2, cos, floor, hypot, pi, sin
from pathlib import Path
from random import Random
from struct import pack
from tempfile import TemporaryDirectory
from zlib import compress, crc32

import bpy


SOURCE = Path(__file__).resolve().parent
PROJECT = SOURCE.parents[4]
OUTPUT = PROJECT / "godot-arcana/art/source/pondside-forest-3d"
SIZE = 32
WATER_HEIGHT = -0.115
POND_CENTER = (8.3, 18.4)
PATH = ((16.15, 32), (15.75, 28), (15.72, 26), (14.85, 23.5),
        (14.6, 21.7), (15.45, 19.6), (17.2, 17.5), (17.85, 15.5),
        (17.9, 13.4), (18.0, 11.4))
CLEARING_PATH = ((16.2, 18.6), (19.3, 18.65), (21.05, 17.9), (23.3, 17.1))
BANK_PATH = ((15.3, 19.95), (14.35, 19.5), (12.85, 19.5))
RANDOM = Random(111826)


def position(x, z, height):
    return x, -z, height


def clamp(value, low=0.0, high=1.0):
    return min(high, max(low, value))


def mix(a, b, weight):
    return a + (b - a) * weight


def smoothstep(low, high, value):
    t = clamp((value - low) / (high - low))
    return t * t * (3.0 - 2.0 * t)


def grid_noise(x, z, salt=0):
    h = ((x * 2017 + z * 3253 + salt * 6029) * 2654435761) & 0xffffffff
    h = ((h ^ (h >> 16)) * 0x45d9f3b) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffff) / 65535.0


def noise(x, z, scale, salt=0):
    x, z = x / scale, z / scale
    ix, iz = floor(x), floor(z)
    u, v = smoothstep(0, 1, x - ix), smoothstep(0, 1, z - iz)
    north = mix(grid_noise(ix, iz, salt), grid_noise(ix + 1, iz, salt), u)
    south = mix(grid_noise(ix, iz + 1, salt), grid_noise(ix + 1, iz + 1, salt), u)
    return mix(north, south, v)


def pond_radius(angle):
    return 1 + 0.087 * sin(3 * angle + 1.1) + 0.040 * cos(5 * angle - 0.65) + 0.025 * sin(7 * angle)


def pond_ratio(x, z):
    x, z = (x - POND_CENTER[0]) / 4.65, (z - POND_CENTER[1]) / 5.8
    return hypot(x, z) / pond_radius(atan2(z, x))


def pond_point(angle, ratio):
    radius = pond_radius(angle) * ratio
    return POND_CENTER[0] + cos(angle) * 4.65 * radius, POND_CENTER[1] + sin(angle) * 5.8 * radius


def ground_height(x, z):
    ratio = pond_ratio(x, z)
    return (mix(-0.58, WATER_HEIGHT, smoothstep(0.64, 1.0, ratio))
            + 0.115 * smoothstep(1.0, 1.105, ratio))


def polyline_dist(x, z, points):
    best = 32 * 32
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        dx, dz = bx - ax, bz - az
        ox, oz = x - ax, z - az
        t = clamp((ox * dx + oz * dz) / (dx * dx + dz * dz))
        best = min(best, (ox - t * dx) ** 2 + (oz - t * dz) ** 2)
    return best ** 0.5


def clearing_amount(x, z):
    clearing = hypot((x - 23.45) / 4.45, (z - 16.95) / 3.7)
    return 1 - smoothstep(0.30, 1.0, clearing + 0.13 * (noise(x, z, 1.25, 61) - 0.5))


def ground_color(x, z, pixel_x, pixel_z):
    distant = noise(x, z, 4.8, 4)
    mottling = noise(x, z, 1.0, 9)
    flecks = grid_noise(pixel_x, pixel_z, 5) - 0.5
    tone = distant * 0.76 + mottling * 0.24
    grass = tuple(mix(shadow, sun, tone) for shadow, sun in zip((50, 71, 48), (137, 151, 84)))
    clearing = clearing_amount(x, z)
    grass = tuple(mix(channel, sun, clearing * 0.58) for channel, sun in zip(grass, (150, 151, 84)))

    path_distance = polyline_dist(x, z, PATH)
    main = 1 - smoothstep(0.8, 1.72, path_distance + (mottling - 0.5) * 0.52)
    spur = 1 - smoothstep(0.30, 0.98, polyline_dist(x, z, CLEARING_PATH) + (mottling - 0.5) * 0.36)
    shore = 1 - smoothstep(0.27, 0.85, polyline_dist(x, z, BANK_PATH) + (mottling - 0.5) * 0.34)
    dust = round((mottling * 0.49 + distant * 0.51) * 6) / 6
    path = tuple(mix(a, b, dust) for a, b in zip((137, 105, 67), (181, 151, 96)))
    grass = tuple(mix(a, b, max(main, spur * 0.60, shore * 0.67)) for a, b in zip(grass, path))

    pond = pond_ratio(x, z)
    wet = 1 - smoothstep(1.018, 1.105 + (mottling - 0.5) * 0.04, pond)
    silt = tuple(mix(a, b, mottling) for a, b in zip((78, 78, 52), (115, 106, 68)))
    color = [mix(a, b, wet) for a, b in zip(grass, silt)]
    if flecks > 0.467:
        flecks *= 2.5
    return tuple(int(clamp(value + flecks * 12, 0, 255)) for value in color)


def pond_color(x, z, pixel_x, pixel_z):
    ratio = pond_ratio(x, z)
    current = noise(x + z * 0.48, z * 1.8, 1.12, 18)
    fine = noise(x, z * 2.95, 0.52, 27)
    tide = clamp(0.74 * smoothstep(0.40, 1.0, ratio) + (current - 0.15) * 0.25)
    shine = (fine - 0.50) * 9 + (grid_noise(pixel_x, pixel_z, 24) - 0.5) * 3
    return tuple(int(clamp(mix(a, b, tide) + shine, 0, 255))
                 for a, b in zip((28, 79, 77), (94, 156, 133)))


def png_chunk(tag, data):
    return pack(">I", len(data)) + tag + data + pack(">I", crc32(tag + data))


def packed_texture(name, bounds, resolution, color_at):
    left, top, width, height = bounds
    rows = bytearray()
    for row in range(resolution):
        rows.append(0)
        z = top + (row + 0.5) * height / resolution
        for column in range(resolution):
            x = left + (column + 0.5) * width / resolution
            rows.extend(color_at(x, z, column, row))
    header = pack(">IIBBBBB", resolution, resolution, 8, 2, 0, 0, 0)
    with TemporaryDirectory() as staging:
        path = Path(staging) / f"{name}.png"
        path.write_bytes(b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header)
                         + png_chunk(b"IDAT", compress(rows, 6)) + png_chunk(b"IEND", b""))
        image = bpy.data.images.load(str(path))
        image.pack()
        image.filepath = f"//{name}.png"
    return image


def linear(srgb):
    if srgb <= 0.04045:
        return srgb / 12.92
    return ((srgb + 0.055) / 1.055) ** 2.4


def material(name, rgb, roughness=0.92, image=None, two_sided=False):
    result = bpy.data.materials.new(name)
    color = tuple(linear(value / 255) for value in rgb) + (1.0,)
    result.diffuse_color = color
    result.use_nodes = True
    result.use_backface_culling = not two_sided
    nodes = result.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = 0.24
    if image:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = image
        texture.interpolation = "Closest"
        result.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return result


class MeshParts:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.materials = []

    def add(self, vertices, faces, materials=0):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(offset + index for index in face) for face in faces)
        self.materials.extend([materials] * len(faces) if isinstance(materials, int) else materials)

    def object(self, name, palette, collection, uv_bounds=None):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        for shading in palette:
            mesh.materials.append(shading)
        for face, index in zip(mesh.polygons, self.materials):
            face.material_index = index
        if uv_bounds:
            left, top, width, height = uv_bounds
            layer = mesh.uv_layers.new(name="UVMap")
            for loop in mesh.loops:
                x, y, _ = mesh.vertices[loop.vertex_index].co
                layer.data[loop.index].uv = (x - left) / width, 1.0 - (-y - top) / height
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return obj


def floor_mesh(collection):
    divisions = 128
    row = divisions + 1
    vertices = [position(x / 4, z / 4, ground_height(x / 4, z / 4))
                for z in range(row) for x in range(row)]
    quads = [(index, index + row, index + row + 1, index + 1)
             for z in range(divisions) for x in range(divisions) for index in (z * row + x,)]
    uv_bounds = (0, 0, SIZE, SIZE)
    texture = packed_texture("Forest Floor Color", uv_bounds, 384, ground_color)
    mesh = MeshParts()
    mesh.add(vertices, quads)
    mesh.object("WoodlandFloor", [material("Moss and Path", (104, 123, 72), image=texture)],
                collection, uv_bounds)


def terrain_edge(collection):
    boundary = ([(x, 0) for x in range(SIZE)] + [(SIZE, z) for z in range(SIZE)]
                + [(x, SIZE) for x in range(SIZE, 0, -1)] + [(0, z) for z in range(SIZE, 0, -1)])
    count = len(boundary)
    vertices = [position(x, z, depth) for ring in range(4) for x, z in boundary
                for depth in ((0.0, -0.10 - noise(x, z, 1.75, 30) * 0.13,
                               -0.38 - noise(x, z, 2.1, 31) * 0.23, -0.79)[ring],)]
    faces = []
    indices = []
    for ring in range(3):
        for i, (x, z) in enumerate(boundary):
            nxt = (i + 1) % count
            faces.append((ring * count + i, ring * count + nxt, (ring + 1) * count + nxt,
                          (ring + 1) * count + i))
            entrance = ring == 0 and z == SIZE and 14 < x < 18
            indices.append(6 if entrance else ring * 2 + (grid_noise(x, z, 46) >= 0.50))
    faces.append(tuple(range(count * 3, count * 4)))
    indices.append(4)
    edge = MeshParts()
    edge.add(vertices, faces, indices)
    colors = ((75, 98, 55), (89, 108, 61), (94, 77, 52), (106, 86, 58),
              (62, 61, 46), (75, 65, 49), (158, 125, 79))
    edge.object("ExposedSoilEdge", [material(f"Bank Soil {i + 1}", rgb) for i, rgb in enumerate(colors)], collection)


def pond_mesh(collection):
    steps = 96
    rim = [position(*pond_point(i / steps * 2 * pi, 1.024), WATER_HEIGHT) for i in range(steps)]
    faces = [(0, (i + 1) % steps + 1, i + 1) for i in range(steps)]
    uv_bounds = (2.2, 11.9, 12.2, 13.2)
    texture = packed_texture("Pond Water Color", uv_bounds, 192, pond_color)
    water = MeshParts()
    water.add([position(*POND_CENTER, WATER_HEIGHT)] + rim, faces)
    water.object("PondWater", [material("Still Pond Water", (49, 112, 105), roughness=0.68, image=texture)],
                 collection, uv_bounds)


def ring_strip(parts, x, z, radius_x, radius_z, width, start, span, height, shading):
    steps = max(3, round(span * 7))
    vertices = [position(x + cos(angle) * (radius_x + inset), z + sin(angle) * (radius_z + inset), height)
                for i in range(steps + 1) for angle in (start + span * i / steps,)
                for inset in (0, width * sin(pi * i / steps))]
    parts.add(vertices, [(i, i + 1, i + 3, i + 2) for i in range(0, 2 * steps, 2)], shading)


def pond_details(collection):
    ripples = MeshParts()
    for _ in range(70):
        x, z = RANDOM.uniform(3.7, 13.0), RANDOM.uniform(13.1, 23.5)
        if pond_ratio(x, z) > 0.89:
            continue
        length, width = RANDOM.uniform(0.11, 0.49), RANDOM.uniform(0.025, 0.070)
        vertices = [position(x + dx, z + dz, WATER_HEIGHT + 0.008)
                    for dx, dz in ((-length, 0), (-length * 0.28, width), (length, width * 0.18),
                                   (length * 0.66, -width * 0.58))]
        ripples.add(vertices, [(0, 1, 2, 3)], RANDOM.randrange(3))
    for x, z, radius in ((7.25, 15.2, 0.54), (10.6, 20.7, 0.77), (6.0, 20.7, 0.33)):
        for size, start, span in ((1, 0.3, 1.6), (1, 3.4, 1.03), (1.34, 1.9, 1.37), (0.62, 5.1, 1.54)):
            ring_strip(ripples, x, z, radius * size, radius * size, 0.04, start, span, WATER_HEIGHT + 0.012, 2)
    ripples.object("WaterGlints", [material("Waterline Soft", (69, 130, 118), two_sided=True),
                                    material("Waterline Medium", (87, 147, 131), two_sided=True),
                                    material("Waterline Light", (113, 163, 141), two_sided=True)], collection)

    lilies = MeshParts()
    blossoms = MeshParts()
    for group_x, group_z, count in ((5.2, 17.2, 6), (10.65, 22.1, 5), (7.7, 14.65, 3)):
        for i in range(count):
            x, z = group_x + RANDOM.uniform(-0.85, 0.85), group_z + RANDOM.uniform(-0.7, 0.7)
            height = WATER_HEIGHT + 0.025 + 0.003 * i
            size = RANDOM.uniform(0.13, 0.28)
            azimuth = RANDOM.uniform(0, 2 * pi)
            points = [position(x, z, height)]
            points.extend(position(x + cos(angle) * size, z + sin(angle) * size, height)
                          for sector in range(8) for angle in (azimuth + 0.27 + sector / 7 * (2 * pi - 0.54),))
            lilies.add(points, [(0, j + 1, j) for j in range(1, 8)], RANDOM.randrange(3))
            if i == 0:
                for petal in range(5):
                    angle = 2 * pi * petal / 5
                    petal_verts = [position(x + cos(angle + shift) * length, z + sin(angle + shift) * length, height + lift)
                                   for shift, length, lift in ((0, 0, 0.04), (-0.6, 0.081, 0.058),
                                                                 (0, 0.137, 0.097), (0.6, 0.081, 0.058))]
                    blossoms.add(petal_verts, [(0, 3, 2, 1)], petal % 2)
    lilies.object("WaterLilyPads", [material("Lily Olive", (87, 118, 66)), material("Lily Jade", (75, 126, 79)),
                                    material("Lily Moss", (116, 143, 76))], collection)
    blossoms.object("WaterLilyFlowers", [material("Water Lily Petal", (201, 166, 183), two_sided=True),
                                          material("Water Lily Petal Light", (230, 197, 203), two_sided=True)], collection)


def rock(parts, x, z, radius, height):
    base = ground_height(x, z) - 0.07
    direction = RANDOM.random() * pi
    ring = [((cos(angle) * radius * RANDOM.uniform(0.86, 1.13)), (sin(angle) * radius * RANDOM.uniform(0.67, 0.91)))
            for i in range(7) for angle in (direction + i * 2 * pi / 7,)]
    vertices = [position(x + dx, z + dz, base) for dx, dz in ring]
    vertices.extend(position(x + dx * 0.71 - radius * 0.13, z + dz * 0.70, base + height * RANDOM.uniform(0.71, 1.09))
                    for dx, dz in ring)
    vertices.append(position(x - radius * 0.18, z + radius * 0.10, base + height * 1.05))
    sides, top, colors = [], [], []
    for i in range(7):
        nxt = (i + 1) % 7
        sides.append((i, i + 7, nxt + 7, nxt))
        top.append((14, nxt + 7, i + 7))
        colors.append(RANDOM.randrange(3))
    parts.add(vertices, sides + top, colors + [RANDOM.choice((2, 3, 3, 4)) for _ in top])


def plant(parts, x, z, base, height, color, blades, width):
    for blade in range(blades):
        azimuth = blade * 2 * pi / blades + RANDOM.uniform(-0.3, 0.3)
        turn_x, turn_z = cos(azimuth), sin(azimuth)
        lean = height * RANDOM.uniform(0.18, 0.92)
        h = height * RANDOM.uniform(0.52, 1.1)
        shift = width * 0.48
        vertices = [position(x + sideways * turn_z + front * turn_x, z - sideways * turn_x + front * turn_z, base + y)
                    for sideways, front, y in ((-shift, 0, 0), (shift, 0, 0), (shift * 0.78, lean * 0.39, h * 0.63),
                                                (0, lean, h), (-shift * 0.68, lean * 0.39, h * 0.63))]
        parts.add(vertices, [(0, 1, 2, 4), (4, 2, 3)], [color, min(color + 1, 3)])


def shoreline(collection):
    rock_parts = MeshParts()
    plant_parts = MeshParts()
    reeds = MeshParts()
    for group, angle in enumerate((0.42, 0.67, 1.04, 1.48, 2.14, 2.65, 3.30, 4.0, 4.55, 5.05, 5.6, 5.84)):
        for j in range(RANDOM.randint(3, 6)):
            x, z = pond_point(angle + RANDOM.uniform(-0.12, 0.12), RANDOM.uniform(1.0, 1.13))
            size = RANDOM.uniform(0.16, 0.53) if j == 0 else RANDOM.uniform(0.10, 0.30)
            rock(rock_parts, x, z, size, size * RANDOM.uniform(0.58, 0.89))
        for j in range(RANDOM.randint(4, 8)):
            x, z = pond_point(angle + RANDOM.uniform(-0.22, 0.22), RANDOM.uniform(1.037, 1.23))
            if polyline_dist(x, z, BANK_PATH) < 0.55:
                continue
            h = RANDOM.uniform(0.26, 0.66)
            plant(plant_parts, x, z, ground_height(x, z), h, RANDOM.randrange(3), RANDOM.randint(3, 6), 0.045)
        if group in (0, 3, 5, 7, 10, 11):
            for _ in range(RANDOM.randint(3, 6)):
                x, z = pond_point(angle + RANDOM.uniform(-0.09, 0.09), RANDOM.uniform(1.0, 1.07))
                base, h = ground_height(x, z), RANDOM.uniform(0.44, 0.91)
                for facing in (0, pi * 0.5):
                    dx, dz = cos(facing), sin(facing)
                    for lower, upper, width, shading in ((0, 0.80, 0.016, 0), (0.80, 1.0, 0.048, 1)):
                        points = [position(x + dx * width * side, z + dz * width * side, base + y * h)
                                  for side, y in ((-1, lower), (1, lower), (1, upper), (-1, upper))]
                        reeds.add(points, [(0, 1, 2, 3)], shading)
    rock_colors = ((78, 83, 73), (99, 103, 87), (116, 117, 97), (136, 132, 111), (118, 125, 83))
    rock_parts.object("PondShoreStones", [material(f"Shore Stone {i + 1}", rgb)
                                          for i, rgb in enumerate(rock_colors)], collection)
    plant_parts.object("Sedges", plant_palette(), collection)
    reeds.object("Cattails", [material("Cattail Stalk", (98, 112, 61), two_sided=True),
                              material("Cattail Spikes", (130, 90, 54), two_sided=True)], collection)


def plant_palette():
    colors = ((63, 88, 48), (86, 108, 56), (110, 132, 69), (143, 151, 77))
    return [material(f"Forest Grass {i + 1}", rgb, two_sided=True) for i, rgb in enumerate(colors)]


def undergrowth(collection):
    grass_parts = MeshParts()
    leaf_parts = MeshParts()
    for _ in range(640):
        x, z = RANDOM.uniform(0.25, 31.75), RANDOM.uniform(0.25, 31.75)
        if (pond_ratio(x, z) < 1.15 or polyline_dist(x, z, PATH) < 1.5
                or polyline_dist(x, z, CLEARING_PATH) < 0.74 or clearing_amount(x, z) > 0.53
                or noise(x, z, 2.1, 16) < 0.34):
            continue
        height = RANDOM.uniform(0.11, 0.28)
        color = RANDOM.randrange(3)
        plant(grass_parts, x, z, 0, height, color, RANDOM.randint(2, 4), 0.032)
        if RANDOM.random() < 0.42:
            azimuth = RANDOM.uniform(0.0, 2 * pi)
            size = RANDOM.uniform(0.03, 0.12)
            points = [position(x + cos(azimuth + shift) * size * grow, z + sin(azimuth + shift) * size * grow, 0.014)
                      for shift, grow in ((0, 1), (0.8, 0.45), (pi, 0.68), (-1.2, 0.38))]
            leaf_parts.add(points, [(0, 3, 2, 1)], RANDOM.randrange(3))
    grass_parts.object("WoodlandGrass", plant_palette(), collection)
    leaf_parts.object("LeafLitter", [material("Ochre Leaf", (144, 117, 63)), material("Russet Leaf", (140, 98, 54)),
                                     material("Olive Leaf", (102, 107, 56))], collection)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    root = bpy.context.scene.collection
    ground = bpy.data.collections.new("01 Terrain")
    pond = bpy.data.collections.new("02 Pond and Shore")
    vegetation = bpy.data.collections.new("03 Ground Cover")
    for collection in (ground, pond, vegetation):
        root.children.link(collection)
    floor_mesh(ground)
    terrain_edge(ground)
    pond_mesh(pond)
    pond_details(pond)
    shoreline(pond)
    undergrowth(vegetation)

    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "forest-terrain.blend"))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "forest-terrain.glb"), export_format="GLB",
                              export_yup=True, export_cameras=False, export_lights=False, export_animations=False)


if __name__ == "__main__":
    build()
