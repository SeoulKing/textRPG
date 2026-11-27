"""Apply the shop floor's pixel-art oak atlas to the existing bench."""
from pathlib import Path
import bpy

folder = Path(__file__).resolve().parent
root = folder.parents[2]
bpy.ops.wm.open_mainfile(filepath=str(folder / 'wooden-bench.blend'))
atlas_path = root / 'godot-arcana/art/source/shop-oak-planks-v2/oak-plank-floor_Oak grain per plank.png'
atlas = bpy.data.images.load(str(atlas_path), check_existing=True)
atlas.name = 'Shop oak grain - pixel sized'
atlas.scale(atlas.size[0] // 4, atlas.size[1] // 4)
atlas.pack()
atlas.colorspace_settings.name = 'sRGB'
width, height = atlas.size

wood_tints = {
    'Honey oak': (0.78, 0.70, 0.63, 1),
    'Oak seat': (1.0, 0.91, 0.81, 1),
    'Dark walnut structure': (0.48, 0.39, 0.32, 1),
}
for name, tint in wood_tints.items():
    mat = bpy.data.materials[name]
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    image = nodes.new('ShaderNodeTexImage')
    image.name = 'Shop floor pixel grain - nearest'
    image.image = atlas
    image.interpolation = 'Closest'
    image.extension = 'EXTEND'
    mix = nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    mix.inputs[2].default_value = tint
    links.new(image.outputs['Color'], mix.inputs[1])
    links.new(mix.outputs[0], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.84

# Pick one 64x16 painted atlas tile per piece and orient its long axis along
# that face's longest dimension.  Keep bevels and each object independently editable.
count = 0
for obj in bpy.data.collections['Bench | editable parts'].objects:
    if obj.type != 'MESH' or not obj.data.materials or obj.data.materials[0].name not in wood_tints:
        continue
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name='Wood grain')
    col = count % 8
    row = (count // 8) % max(1, height // 16)
    mins = [min(v.co[i] for v in mesh.vertices) for i in range(3)]
    spans = [max(v.co[i] for v in mesh.vertices) - mins[i] for i in range(3)]
    for poly in mesh.polygons:
        normal_axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        axes = sorted((i for i in range(3) if i != normal_axis), key=lambda i: spans[i], reverse=True)
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            u = (v[axes[0]] - mins[axes[0]]) / max(spans[axes[0]], 0.0001)
            w = (v[axes[1]] - mins[axes[1]]) / max(spans[axes[1]], 0.0001)
            uv.data[li].uv = ((col * 64 + 0.5 + u * 63) / width,
                              (row * 16 + 0.5 + w * 15) / height)
    count += 1

scene = bpy.context.scene
scene.render.filepath = '//bench-wood-grain-preview.png'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'wooden-bench-wood-grain.blend'))
bpy.ops.render.render(write_still=True)
print('Applied floor atlas to', count, 'wooden parts; atlas', width, 'x', height)
