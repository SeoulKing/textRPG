from pathlib import Path
import bpy

folder = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(folder / 'wooden-bench-wood-grain.blend'))
for name in ('Honey oak', 'Oak seat', 'Dark walnut structure'):
    material = bpy.data.materials[name]
    mix = next(node for node in material.node_tree.nodes if node.type == 'MIX_RGB' and node.blend_type == 'MULTIPLY')
    tint = mix.inputs[2].default_value
    tint[0] *= 0.78
    tint[1] *= 0.76
    tint[2] *= 0.74
    material.diffuse_color = (material.diffuse_color[0] * 0.78, material.diffuse_color[1] * 0.76, material.diffuse_color[2] * 0.74, 1.0)

bpy.context.scene.render.filepath = '//bench-dark-wood-preview.png'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'wooden-bench-dark-wood.blend'))
bpy.ops.render.render(write_still=True)
