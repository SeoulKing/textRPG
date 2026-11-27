"""Export edited V3 .blend without rebuilding geometry or changing the source file."""
import bpy,sys
from pathlib import Path
ROOT=Path(sys.argv[sys.argv.index('--')+1]);p=ROOT/'art-studies/arcana-hero/white-bob-heroine/blender-v3/heroine-v3.blend'
bpy.ops.wm.open_mainfile(filepath=str(p))
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
for mat in bpy.data.materials:
 if not mat.use_nodes:continue
 nodes=mat.node_tree.nodes;nodes.clear();bs=nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Base Color'].default_value=mat.diffuse_color;bs.inputs['Roughness'].default_value=.85
 out=nodes.new('ShaderNodeOutputMaterial');mat.node_tree.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
 image=bpy.data.images.get(mat.name+'_paint')
 if image and mat.get("uses_paint",True):
  tex=nodes.new('ShaderNodeTexImage');tex.image=image;mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
for obj in bpy.data.objects:
 for modifier in obj.modifiers:
  if modifier.type=='MASK':modifier.show_viewport=False;modifier.show_render=False
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
 if obj.name.startswith('Heroine_') or obj.name=='HeroineV3Rig':obj.hide_set(False);obj.select_set(True)
rig=bpy.data.objects['HeroineV3Rig'];bpy.context.view_layer.objects.active=rig
options=dict(filepath=str(ROOT/'godot-arcana/art/models/heroine-v3/heroine-v3.glb'),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=True,export_animation_mode='ACTIONS',export_all_armature_actions=True,export_force_sampling=True,export_def_bones=True,export_extras=True)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in valid})
print('Edited V3 source exported; .blend was not overwritten')
