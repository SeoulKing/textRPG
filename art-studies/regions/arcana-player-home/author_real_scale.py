"""Build and export the Arcana home's dimensioned single-storey plan.

Open player-home-campus-a.blend in background mode to author the initial editable
real-scale copy. Open player-home-real-scale.blend to export its edited layers.
Pass the names of specific layers after Blender's `--` to export only those.
"""

from math import ceil
from pathlib import Path
import random
import sys

import bmesh
import bpy
from mathutils import Matrix

HERE = Path(__file__).resolve().parent
PALETTE_SOURCE = HERE / "player-home-campus-a.blend"
BLENDER_SOURCE = HERE / "player-home-real-scale.blend"
OUTPUT = HERE.parents[2] / "godot-arcana/art/source/player-home-real-scale"
sys.path.insert(0, str(HERE.parent / "arcana-inn-interior/source/blender-v1"))
from export_inn import pack_group


ORIGIN_X, ORIGIN_Z = 3.0, 4.0
WIDTH, DEPTH = 9.0, 6.25
BATH_WIDTH, BATH_START_Z = 2.35, 4.02
FLOOR_TILE_SIZE = 1.0
EXTERIOR = 0.20
CUT = 0.57
NEAR_CUT = 0.30
WALL_TOP = 2.62
LAYERS = ("architecture", "rear-walls", "upper-walls")


def matte(name, hex_color):
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    rgba = (*(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb), 1)
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Roughness"].default_value = 0.70
    return material


def block(group, name, x0, x1, z0, z1, y0, y1, material, bevel=0.0):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((x1 - x0, z1 - z0, y1 - y0, 1)),
                        verts=list(bm.verts))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = (ORIGIN_X + (x0 + x1) / 2, -ORIGIN_Z - (z0 + z1) / 2, (y0 + y1) / 2)
    if bevel:
        corners = obj.modifiers.new("Soft edges", "BEVEL")
        corners.width = bevel
        corners.segments = 2
        obj.modifiers.new("Corner normals", "WEIGHTED_NORMAL")


def strip(group, name, axis, span, edge, height, material, bevel=0.0):
    x0, x1, z0, z1 = (*span, *edge) if axis == "x" else (*edge, *span)
    block(group, name, x0, x1, z0, z1, *height, material, bevel)


def window_wall(group, name, axis, start, end, edge, windows, inside, plaster, slate, frame, glass):
    """Fill the masonry around clear apertures and seat the frames into the wall."""
    previous = start
    face = edge[1] if inside > 0 else edge[0]
    opening_depth = inset(edge, 0.032)
    frame_depth = tuple(sorted((face - inside * 0.115, face + inside * 0.028)))
    sill_depth = (edge[0] - 0.052, edge[1] + 0.085)
    for left, right, sill, head in windows:
        strip(group, f"{name} pier", axis, (previous, left), edge, (0.0, WALL_TOP), plaster)
        strip(group, f"{name} below sill", axis, (left, right), edge, (0.0, sill), plaster)
        strip(group, f"{name} above lintel", axis, (left, right), edge, (head, WALL_TOP), plaster)
        for jamb in ((left, left + 0.049), (right - 0.049, right)):
            strip(group, f"{name} indigo jamb", axis, jamb, frame_depth, (sill, head), frame, 0.008)
        strip(group, f"{name} lower sash", axis, (left, right), frame_depth, (sill, sill + 0.047), frame, 0.008)
        strip(group, f"{name} upper sash", axis, (left, right), frame_depth, (head - 0.047, head), frame, 0.008)
        mid = (left + right) / 2
        strip(group, f"{name} mullion", axis, (mid - 0.021, mid + 0.021), frame_depth,
              (sill + 0.044, head - 0.044), frame, 0.005)
        strip(group, f"{name} old blue glass", axis, (left + 0.044, right - 0.044), opening_depth,
              (sill + 0.042, head - 0.042), glass)
        strip(group, f"{name} stone sill", axis, (left - 0.038, right + 0.038), sill_depth,
              (sill - 0.063, sill), slate, 0.010)
        previous = right
    strip(group, f"{name} end pier", axis, (previous, end), edge, (0.0, WALL_TOP), plaster)
    strip(group, f"{name} slate coping", axis, (start, end), (edge[0] - 0.023, edge[1] + 0.023),
          (WALL_TOP, WALL_TOP + 0.08), slate, 0.009)


def inset(edge, thickness):
    center = sum(edge) / 2
    return center - thickness / 2, center + thickness / 2


def build_floor(base, plank_materials, stone, slate, mortar):
    block(base, "Continuous limestone foundation", -EXTERIOR, WIDTH + EXTERIOR,
          -EXTERIOR, DEPTH + EXTERIOR, -0.29, -0.074, stone, 0.018)
    block(base, "Slate foundation rail", -0.215, WIDTH + 0.215, -0.215, DEPTH + 0.215,
          -0.135, -0.085, slate, 0.009)
    block(base, "Oak plank subfloor", 0.0, WIDTH, 0.0, DEPTH, -0.08, -0.031, mortar)
    palette = bath_floor_materials()
    grout = matte("Library Lane bath | stone joints", "607974")
    block(base, "Bath stone bed", 0.0, BATH_WIDTH, BATH_START_Z, DEPTH, -0.031, -0.002, grout)
    build_floor_tiles(base, plank_materials, palette)
    return palette


def bath_floor_materials():
    shades = ("8BABA2", "75978F", "83A39C", "87A8A2", "70918F")
    names = [f"Library Lane bath | slate tile {index}" for index in range(len(shades))]
    return [bpy.data.materials.get(name) or matte(name, shade) for name, shade in zip(names, shades)]


def build_floor_tiles(base, oak_materials, bath_materials):
    rng = random.Random(7065)

    def oak_tile(x0, x1, z0, z1):
        block(base, "Oak floor tile", x0 + .002, x1 - .002, z0 + .002, z1 - .002,
              -0.035, 0.0, rng.choice(oak_materials), 0.004)

    # Share the inn's unit grid. Trim edge cells where the floor or bathroom ends.
    for row in range(ceil(DEPTH / FLOOR_TILE_SIZE)):
        z0, z1 = row * FLOOR_TILE_SIZE, min((row + 1) * FLOOR_TILE_SIZE, DEPTH)
        for column in range(ceil(WIDTH / FLOOR_TILE_SIZE)):
            x0, x1 = column * FLOOR_TILE_SIZE, min((column + 1) * FLOOR_TILE_SIZE, WIDTH)
            if x0 >= BATH_WIDTH or z1 <= BATH_START_Z:
                oak_tile(x0, x1, z0, z1)
                continue

            bath_x1, bath_z0 = min(x1, BATH_WIDTH), max(z0, BATH_START_Z)
            if z0 < bath_z0:
                oak_tile(x0, x1, z0, bath_z0)
            if bath_x1 < x1:
                oak_tile(bath_x1, x1, bath_z0, z1)
            block(base, "Blue-green bath flagstone", x0 + .004, bath_x1 - .004,
                  bath_z0 + .004, z1 - .004, -0.025, 0.004, rng.choice(bath_materials), 0.004)


def build():
    scene = bpy.context.scene
    scene.name = "Arcana | Library Lane real-scale floor plan"
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for child in list(scene.collection.children):
        scene.collection.children.unlink(child)

    groups = []
    for name in LAYERS:
        existing = bpy.data.collections.get(name)
        if existing is not None:
            bpy.data.collections.remove(existing)
        group = bpy.data.collections.new(name)
        scene.collection.children.link(group)
        groups.append(group)
    base, rear, optional = groups

    material = bpy.data.materials
    plaster = material["Library Lane | cream lime plaster"]
    mortar = material["Library Lane | mortar"]
    stone = material["Library Lane | limestone 0"]
    pale_stone = material["Library Lane | limestone 2"]
    slate = material["Library Lane | blue slate"]
    indigo = material["Library Lane | indigo wood paint"]
    glass = material["Library Lane | old glass"]
    oak = material["Oak | dark carved frames"]
    warm_oak = material["Oak | polished trim"]
    planks = [material[f"Oak floor | plank {i}"] for i in range(1, 8)]
    tiles = build_floor(base, planks, stone, slate, mortar)

    # The far corner contains both always-visible walls. The living-room east
    # window is on the near wall, which visually cuts away with the partitions.
    window_wall(rear, "North exterior", "x", -EXTERIOR, WIDTH + EXTERIOR, (-EXTERIOR, 0.0),
                ((1.0, 2.65, 1.24, 2.21), (5.6, 6.7, 1.24, 2.15)),
                1, plaster, slate, indigo, glass)
    window_wall(rear, "West exterior", "z", 0.0, DEPTH, (-EXTERIOR, 0.0),
                ((4.71, 5.31, 1.61, 2.08),), 1, plaster, slate, indigo, glass)
    strip(rear, "North oak skirting", "x", (0.0, WIDTH), (0.0, 0.032), (0.0, 0.087), oak)
    strip(rear, "West oak skirting", "z", (0.0, 4.02), (0.0, 0.032), (0.0, 0.087), oak)
    block(rear, "Rear corner timber upright", 0.0, 0.075, 0.0, 0.075, 0.08, WALL_TOP, oak, 0.009)

    for row in range(4):
        y0 = .28 * row
        for n in range(7):
            z0, z1 = 4.02 + (DEPTH - 4.02) * n / 7, 4.02 + (DEPTH - 4.02) * (n + 1) / 7
            block(rear, "Bath west tile wainscot", 0.001, 0.024, z0 + .002, z1 - .002,
                  y0 + .002, y0 + .277, tiles[(n + 2 * row) % len(tiles)], 0.003)
    strip(rear, "Bath slate dado cap", "z", (4.02, DEPTH), (0.0, 0.042), (1.118, 1.157), slate, 0.008)

    # Plan dimensions at the inside faces of the bedroom and bath partitions.
    interior = [
        ("Bedroom west", "z", (0.0, 3.0), (4.53, 4.65)),
        ("Bedroom south left", "x", (4.53, 4.86), (3.0, 3.12)),
        ("Bedroom south right", "x", (5.71, WIDTH), (3.0, 3.12)),
        ("Bath wet wall", "x", (0.0, 2.47), (3.90, 4.02)),
        ("Bath door north jamb", "z", (4.02, 4.15), (2.35, 2.47)),
        ("Bath door pocket jamb", "z", (4.95, DEPTH), (2.35, 2.47)),
    ]
    front = [
        ("Front west wall", "x", (-EXTERIOR, 4.0), (DEPTH, DEPTH + EXTERIOR)),
        ("Front east wall", "x", (4.95, WIDTH + EXTERIOR), (DEPTH, DEPTH + EXTERIOR)),
    ]
    east_wall = ("East wall", "z", (0.0, DEPTH), (WIDTH, WIDTH + EXTERIOR))
    for height, walls in ((CUT, interior), (NEAR_CUT, [*front, east_wall])):
        for name, axis, span, edge in walls:
            strip(base, f"{name} cut body", axis, span, edge, (0.0, height), plaster)
            strip(base, f"{name} cutoff coping", axis, span, (edge[0] - .022, edge[1] + .022),
                  (height - .031, height + .028), slate, 0.009)
            strip(base, f"{name} oak skirting", axis, span, (edge[0] - .021, edge[1] + .021), (0.0, .078), oak, 0.005)

    for height, walls in ((CUT, interior), (NEAR_CUT, front)):
        for name, axis, span, edge in walls:
            strip(optional, f"{name} raised plaster", axis, span, edge, (height, WALL_TOP), plaster)
            strip(optional, f"{name} upper coping", axis, span, (edge[0] - .02, edge[1] + .02),
                  (WALL_TOP, WALL_TOP + .08), slate, .008)

    # The near wall has the real-plan living window at full wall height only.
    north_living, south_living, sill, head = 4.4, 5.75, 1.00, 2.06
    east_edge = (WIDTH, WIDTH + EXTERIOR)
    for span in ((0.0, north_living), (south_living, DEPTH)):
        strip(optional, "East plaster pier", "z", span, east_edge, (NEAR_CUT, WALL_TOP), plaster)
    strip(optional, "East plaster sill", "z", (north_living, south_living), east_edge, (NEAR_CUT, sill), plaster)
    strip(optional, "East plaster lintel", "z", (north_living, south_living), east_edge, (head, WALL_TOP), plaster)
    strip(optional, "East upper slate coping", "z", (0.0, DEPTH), (WIDTH - .023, WIDTH + .223),
          (WALL_TOP, WALL_TOP + .08), slate, .008)
    for left, right in ((north_living, north_living + .045), (south_living - .045, south_living), (5.052, 5.098)):
        strip(optional, "Living window indigo mullion", "z", (left, right), (WIDTH - .015, WIDTH + .1),
              (sill, head), indigo, .007)
    for lower, upper in ((sill, sill + .044), (head - .044, head)):
        strip(optional, "Living window indigo sash", "z", (north_living, south_living),
              (WIDTH - .015, WIDTH + .1), (lower, upper), indigo, .007)
    strip(optional, "Living window glass", "z", (north_living + .04, south_living - .04),
          inset(east_edge, .04), (sill + .04, head - .04), glass)
    strip(optional, "Living window sill", "z", (north_living - .045, south_living + .045),
          (WIDTH - .062, WIDTH + .2), (sill - .051, sill), pale_stone, .008)

    block(base, "Bedroom oak threshold", 4.86, 5.71, 2.988, 3.132, -.023, .017, warm_oak, .006)
    block(base, "Bath stone threshold", 2.34, 2.48, 4.15, 4.95, -.018, .017, pale_stone, .008)
    block(base, "Entrance indigo threshold", 4.0, 4.95, DEPTH - .036, DEPTH + .22, -.042, .027, indigo, .008)
    block(base, "Entrance limestone top step", 3.89, 5.06, DEPTH + .18, DEPTH + .49, -.245, -.076, pale_stone, .02)
    block(base, "Entrance limestone bottom step", 3.84, 5.11, DEPTH + .47, DEPTH + .76, -.29, -.175, stone, .02)
    for x in (3.96, 4.95):
        block(optional, "Entrance indigo jamb", x, x + .04, DEPTH - .02, DEPTH + .215,
              .02, 2.13, indigo, .008)
    block(optional, "Entrance oak lintel", 3.96, 4.99, DEPTH - .02, DEPTH + .215, 2.13, 2.23, oak, .008)
    block(optional, "Entrance above door", 4.0, 4.95, DEPTH, DEPTH + EXTERIOR, 2.23, WALL_TOP, plaster)

    bpy.context.view_layer.update()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLENDER_SOURCE), compress=True)
    return groups


def export(groups):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    graph = bpy.context.evaluated_depsgraph_get()
    for group in groups:
        layer = group.name
        anchor = bpy.data.objects.new(f"{layer}_pivot", None)
        scene.collection.objects.link(anchor)
        bpy.context.view_layer.update()
        parts = [obj for obj in group.all_objects if obj.type in {"MESH", "CURVE"} and not obj.hide_render]
        packed = pack_group(anchor, parts, graph)
        packed[0].name = layer
        bpy.ops.object.select_all(action="DESELECT")
        for obj in packed:
            obj.select_set(True)
            if obj.type != "MESH":
                continue
            for material in obj.data.materials:
                if material is None or material.node_tree is None:
                    continue
                shader = material.node_tree.nodes.get("Principled BSDF")
                if shader is None:
                    continue
                # The approved oak's procedural ramp does not export to glTF.
                # Use its authored shader fallback, as in the Campus A exporter.
                for channel in ("Base Color", "Normal"):
                    for link in list(shader.inputs[channel].links):
                        if link.from_node.type != "TEX_IMAGE":
                            material.node_tree.links.remove(link)
        temporary = OUTPUT / f"{layer}.tmp.glb"
        result = bpy.ops.export_scene.gltf(filepath=str(temporary), export_format="GLB", use_selection=True,
                                           export_animations=False, export_cameras=False, export_lights=False)
        if "FINISHED" not in result:
            raise RuntimeError(f"Could not export {layer}")
        temporary.replace(OUTPUT / f"{layer}.glb")
        for obj in reversed(packed):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.objects.remove(anchor, do_unlink=True)
        print(f"{layer}.glb: {len(parts)} source pieces", flush=True)


if __name__ == "__main__":
    source = Path(bpy.data.filepath).resolve()
    if not bpy.app.background or source not in {PALETTE_SOURCE, BLENDER_SOURCE}:
        raise RuntimeError(f"Open {PALETTE_SOURCE.name} or {BLENDER_SOURCE.name} in Blender background mode.")
    if source == PALETTE_SOURCE and BLENDER_SOURCE.exists():
        raise FileExistsError(f"Open {BLENDER_SOURCE.name} to export the existing editable model.")
    groups = build() if source == PALETTE_SOURCE else [bpy.context.scene.collection.children[name] for name in LAYERS]
    only = set(sys.argv[sys.argv.index("--") + 1:]) if "--" in sys.argv else set(LAYERS)
    if unknown := only.difference(LAYERS):
        raise ValueError(f"Unknown layers: {', '.join(sorted(unknown))}")
    export(group for group in groups if group.name in only)
