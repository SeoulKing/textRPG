import bpy,sys,math
from pathlib import Path
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v5';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v5-head-artist-topology.blend'));mat=bpy.data.materials['V5 pearl white - approved flowing strand atlas']
if bpy.data.objects['V5 HEAD MASTER - neutral axis'].get('hair_texture_applied'):raise RuntimeError('Hair UV balancing already applied; use the saved master')
for node in mat.node_tree.nodes:
 if node.type=='MIX_RGB' and node.blend_type=='MIX':node.inputs[0].default_value=.58
for o in bpy.data.collections['V5 EDITABLE - face hair and costume bust'].objects:
 if o.type!='MESH' or not o.name.startswith('Hair '):continue
 if 'recessed scalp' in o.name:
  o.data.materials[0]=mat
  for lp in o.data.uv_layers.active.data:lp.uv=(.035/4+.93/4*lp.uv.x,.18+.70*lp.uv.y)
 else:
  for lp in o.data.uv_layers.active.data:
   u=lp.uv.x;lane=min(3,int(u*4));q=(u*4-lane-.035)/.93;lp.uv=((lane+.28+.44*q)/4,.18+.70*lp.uv.y)
root=bpy.data.objects['V5 HEAD MASTER - neutral axis'];root['hair_texture_applied']=True
bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v5-head-artist-topology.blend'));print('V5_HAIR_TEXTURE_BALANCED')
