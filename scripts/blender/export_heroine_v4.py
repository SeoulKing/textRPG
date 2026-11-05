"""Read the saved V4 candidate; export only to its isolated review folder."""
import bpy,sys
from pathlib import Path
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v4';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v4.blend'))
if bpy.context.object and bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
# A portable unlit face approximates the painted Blender face without engine-specific nodes.
for name in ['V4 painted face','V4 porcelain skin','V4 painted violet eyes']:
 m=bpy.data.materials[name];nodes=m.node_tree.nodes;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');color=bs.inputs['Base Color'].default_value[:];image=None
 if bs.inputs['Base Color'].is_linked:
  node=bs.inputs['Base Color'].links[0].from_node
  if node.type=='TEX_IMAGE':image=node.image
 nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');em.inputs['Color'].default_value=color
 if image:
  tex=nodes.new('ShaderNodeTexImage');tex.image=image;m.node_tree.links.new(tex.outputs['Color'],em.inputs['Color'])
 m.node_tree.links.new(em.outputs[0],out.inputs['Surface'])
bpy.ops.object.select_all(action='DESELECT');rig=bpy.data.objects['HeroineV4Rig']
for o in bpy.data.objects:
 if o.name.startswith('Heroine_') or o==rig:
  o.hide_set(False);o.select_set(True)
  for m in o.modifiers:
   if m.type=='MASK':m.show_viewport=False;m.show_render=False
bpy.context.view_layer.objects.active=rig
options=dict(filepath=str(P/'review/heroine-v4-review.glb'),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=True,export_animation_mode='ACTIONS',export_all_armature_actions=True,export_force_sampling=True,export_def_bones=True)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in valid})
print('V4 review GLB exported; source and game files unchanged')
