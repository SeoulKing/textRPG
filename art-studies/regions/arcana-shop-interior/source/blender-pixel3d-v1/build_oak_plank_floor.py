"""Author the Arcana shop's individually textured, beveled oak planks in Blender."""
from pathlib import Path
import math
import random

import bpy
import numpy as np

STUDY = Path(__file__).resolve().parent
ROOT = STUDY.parents[4]
OUTPUT = ROOT / "godot-arcana/art/source/shop-oak-planks-v2"
OUTPUT.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
rng = random.Random(87316)
noise_rng = np.random.default_rng(87316)
WIDTH, DEPTH = 14.0, 9.0
TW, TH, COLS = 256, 64, 8
DOT_WIDTH, DOT_HEIGHT = TW // 4, TH // 4


def pixel_grain(tile, index):
    """Keep the board's tone and grain direction in five painted color steps."""
    rgb = tile[:, :, :3].reshape(DOT_HEIGHT, 4, DOT_WIDTH, 4, 3).mean(axis=(1, 3))
    base = rgb.mean(axis=(0, 1))
    grain = rgb[:, :, 0] - base[0]
    # Short horizontal clusters keep the long grain without continuous hairline streaks.
    rng = np.random.default_rng(87316 + index)
    grain *= 0.85
    for _ in range(18):
        row = rng.integers(1, DOT_HEIGHT - 1)
        start = rng.integers(1, DOT_WIDTH - 6)
        length = rng.integers(2, 7)
        grain[row, start:start + length] += rng.choice([-.038, -.025, .025])
    levels = np.digitize(grain, [-.046, -.018, .018, .046])
    shades = np.array([-.077, -.036, 0.0, .030, .062])
    result = np.ones((DOT_HEIGHT, DOT_WIDTH, 4), np.float32)
    result[:, :, :3] = np.clip(base + shades[levels, None] * np.array([1, .84, .67]), 0, 1)
    return result

# Alternate full rows with a half-length offset. Only the wall cuts are shorter.
boards = []
ROW_COUNT = 24
BOARD_LENGTH = 2
for row in range(ROW_COUNT):
    joints = [0, *range(BOARD_LENGTH - row % 2, int(WIDTH), BOARD_LENGTH), WIDTH]
    start_z = row * DEPTH / ROW_COUNT
    end_z = (row + 1) * DEPTH / ROW_COUNT
    boards.extend((left, right, start_z, end_z) for left, right in zip(joints, joints[1:]))

rows = math.ceil(len(boards) / COLS)
atlas_height = 2 ** math.ceil(math.log2(rows * DOT_HEIGHT))
atlas = np.ones((atlas_height, COLS * DOT_WIDTH, 4), np.float32)
xs, ys = np.meshgrid(np.linspace(0, 1, TW), np.linspace(0, 1, TH))

def noise(width, height):
    """Interpolated noise stretched in the direction of the board."""
    source = noise_rng.normal(0, 1, (height, width))
    x = np.linspace(0, width - 1, TW)
    y = np.linspace(0, height - 1, TH)
    across = np.array([np.interp(x, np.arange(width), row) for row in source])
    return np.array([np.interp(y, np.arange(height), column) for column in across.T]).T

for index, (x0, x1, z0, z1) in enumerate(boards):
    warp = ys + 0.017 * noise(5, 12) + 0.022 * np.sin(xs * 7 + rng.uniform(0, 6))
    knot = np.zeros_like(xs)
    if rng.random() < 0.61:
        kx, ky = rng.uniform(0.16, 0.84), rng.uniform(0.18, 0.82)
        radius = np.hypot((xs - kx) * (x1 - x0) * 6, (ys - ky) * 2.7)
        warp += 0.072 * np.exp(-radius ** 2 * 1.9) * np.sign(ys - ky)
        knot = -0.15 * np.exp(-radius ** 2 * 22)
        knot += 0.018 * np.sin(radius * 59) * np.exp(-radius ** 2 * 3)
    fine = 0.023 * np.sin(warp * 268) + 0.017 * np.sin(warp * 613)
    grain = 0.038 * noise(7, 30) + 0.018 * noise(23, 57)
    pores = -0.043 * np.maximum(0, noise(27, 62) - 1.2)
    edge = -0.030 * np.exp(-np.minimum(ys, 1 - ys) * 22)
    tone = rng.uniform(-0.055, 0.068)
    base = np.array([0.65, 0.45, 0.29]) + tone + np.array([rng.uniform(-0.022, 0.021), 0, rng.uniform(-0.019, 0.022)])
    color = base + (fine + grain + pores + edge + knot)[..., None] * np.array([1, .84, .67])
    column, row = index % COLS, index // COLS
    tile = np.ones((TH, TW, 4), np.float32)
    tile[:, :, :3] = np.clip(color, 0, 1)
    atlas[row * DOT_HEIGHT:(row + 1) * DOT_HEIGHT,
          column * DOT_WIDTH:(column + 1) * DOT_WIDTH] = pixel_grain(tile, index)

image = bpy.data.images.new("Oak grain per plank", width=COLS * DOT_WIDTH, height=atlas_height, alpha=True)
image.pixels.foreach_set(atlas.ravel())
image.filepath_raw = str(STUDY / "oak-plank-grain-dot.png")
image.file_format = "PNG"
image.save()
image.pack()

wood = bpy.data.materials.new("Oak grain")
wood.use_nodes = True
bsdf = next(node for node in wood.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
bsdf.inputs["Roughness"].default_value = .84
grain = wood.node_tree.nodes.new("ShaderNodeTexImage")
grain.image = image
grain.interpolation = "Closest"
wood.node_tree.links.new(grain.outputs["Color"], bsdf.inputs["Base Color"])

edges = bpy.data.materials.new("Oak end grain and bevels")
edges.use_nodes = True
edge_bsdf = next(node for node in edges.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
edge_bsdf.inputs["Base Color"].default_value = (.21, .111, .052, 1)
edge_bsdf.inputs["Roughness"].default_value = .92

for index, (x0, x1, z0, z1) in enumerate(boards):
    x0, x1 = x0 + .005, x1 - .005
    z0, z1 = z0 + .005, z1 - .005
    bevel = rng.uniform(.004, .009)
    height = rng.uniform(-.004, .002)
    corners = [(x0, -z1), (x1, -z1), (x1, -z0), (x0, -z0)]
    inset = [(x0+bevel, -z1+bevel), (x1-bevel, -z1+bevel),
             (x1-bevel, -z0-bevel), (x0+bevel, -z0-bevel)]
    verts = [(x,y,-.052) for x,y in corners] + [(x,y,height-bevel) for x,y in corners] + [(x,y,height) for x,y in inset]
    faces = [(8,9,10,11), (3,2,1,0)]
    for side in range(4):
        following = (side+1)%4
        faces.extend([(side,following,following+4,side+4),
                      (side+4,following+4,following+8,side+8)])
    mesh = bpy.data.meshes.new(f"Oak board {index+1:03}")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    mesh.materials.append(wood)
    mesh.materials.append(edges)
    layer = mesh.uv_layers.new()
    u = index % COLS * TW
    v = index // COLS * TH
    uv = [(u+2,v+2),(u+TW-2,v+2),(u+TW-2,v+TH-2),(u+2,v+TH-2)]
    for loop, (tx,ty) in zip(mesh.polygons[0].loop_indices, uv):
        layer.data[loop].uv = (tx/(COLS*TW), ty/(atlas_height*4))
    for face in list(mesh.polygons)[1:]:
        face.material_index = 1
    plank = bpy.data.objects.new(mesh.name, mesh)
    bpy.context.collection.objects.link(plank)
    plank.select_set(True)
    bpy.context.view_layer.objects.active = plank

bpy.ops.wm.save_as_mainfile(filepath=str(STUDY / "oak-plank-floor-v2.blend"))
bpy.ops.object.join()
bpy.context.object.name = "OakPlankFloor"
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "oak-plank-floor.glb"),
                         export_format="GLB", use_selection=True)
print(f"SHOP_OAK_PLANKS {len(boards)} boards, {COLS*DOT_WIDTH}x{atlas_height} grain atlas")
