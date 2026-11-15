import bpy,sys,math
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v5';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v5-head-artist-topology.blend'));C=bpy.data.collections['V5 EDITABLE - face hair and costume bust']
if bpy.data.objects['V5 HEAD MASTER - neutral axis'].get('hair_texture'):raise RuntimeError('Hair paint already authored; edit saved master, or rebuild the candidate face recipe first')
original=bpy.data.materials['V5 pearl swept locks'];painted=original.copy();painted.name='V5 pearl white - approved flowing strand atlas';tex=next(n for n in painted.node_tree.nodes if n.type=='TEX_IMAGE');im=bpy.data.images.load(str(P/'textures/pearl-hair-atlas-v1.png'));im.pack();tex.image=im
links=painted.node_tree.links;soft=painted.node_tree.nodes.new('ShaderNodeMixRGB');soft.blend_type='MIX';soft.inputs[0].default_value=.22;soft.inputs[2].default_value=(.97,.94,.97,1);links.new(tex.outputs['Color'],soft.inputs[1]);dest=[link.to_socket for link in list(tex.outputs['Color'].links) if link.to_node!=soft]
for socket in dest:links.new(soft.outputs[0],socket)
for i,o in enumerate(sorted([o for o in C.objects if o.type=='MESH' and o.name.startswith('Hair ')],key=lambda o:o.name)):
 if 'recessed scalp' in o.name:continue
 for k,m in enumerate(o.data.materials):
  if m==original:o.data.materials[k]=painted
 if o.data.uv_layers.active:
  for loop in o.data.uv_layers.active.data:loop.uv.x=(i%4+.035+.93*loop.uv.x)/4
for o in list(C.objects):
 if 'curved fine strand' in o.name:bpy.data.objects.remove(o,do_unlink=True)
root=bpy.data.objects['V5 HEAD MASTER - neutral axis'];root['face_source']='pixiv Inc. Sendagaya Shino, CC0; geometry proportions and eye/nose/lip materials modified';root['face_source_url']='https://vroid.pixiv.help/hc/en-us/articles/360013482714-Sendagaya-Shino';root['hair_texture']='imagegen UV albedo atlas, approved concept as hair colour/paint reference';root['game_integration']='None'
s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=800;cam.data.ortho_scale=1.30;cam.location=(2.3,-6,.73);cam.rotation_euler=(Vector((0,-.025,.535))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(P/'review/painted-hair-model.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v5-head-artist-topology.blend'));print('NATIVE_MODEL_WITH_PAINTED_HAIR_SAVED',flush=True)
