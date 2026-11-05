"""Apply approved-style UV paint to the actual V6 native meshes; no game assets."""
import bpy,bmesh,sys,math,json
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v6';V=P/'review';T=P/'textures';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v6-head.blend'));root=bpy.data.objects['V6 MASTER - neutral'];head=bpy.data.objects['V6 HEAD POSE - art comparison only'];C=bpy.data.collections['V6 EDITABLE head and supporting bust']
if root.get('v6_uv_paint_applied'):raise RuntimeError('UV stage already authored; edit saved source instead of applying twice')
def image(name):
 im=bpy.data.images.load(str(T/name),check_existing=True);im.pack();return im
skin=image('skin-cel-v6.png');iris=image('iris-cel-v6.png');hair=image('hair-longitudinal-v6.png')
# New albedo keeps the exact original face UV islands and three-dimensional nose/lips.
mat=bpy.data.materials['V6 delicate peach - painted 3D surface'];n=mat.node_tree.nodes;lk=mat.node_tree.links;old=next(q for q in n if q.type=='VERTEX_COLOR');dest=[l.to_socket for l in list(old.outputs['Color'].links)];tx=n.new('ShaderNodeTexImage');tx.image=skin
for socket in dest:lk.new(tx.outputs['Color'],socket)
# Recover artist-authored UV coordinates and RGB/alpha eye line paint.
path=str(P.parent/'blender-v5/heroine-v5-head.blend')
with bpy.data.libraries.load(path,link=False) as (src,dst):dst.meshes=['V5 refined CC0 face surface '+str(i) for i in [5,2,3]]
source_iris,line2,line3=dst.meshes;obj=bpy.data.objects['Face V5 topology 5'];assert len(obj.data.loops)==len(source_iris.loops)
for i,lp in enumerate(source_iris.uv_layers.active.data):obj.data.uv_layers.active.data[i].uv=lp.uv
mat=obj.data.materials[0];next(n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE').image=iris;mat.surface_render_method='BLENDED'
for k,source in [(2,line2),(3,line3)]:
 o=bpy.data.objects['Face V5 topology '+str(k)];m=source.materials[0].copy();m.name='V6 painted plum lid '+str(k);o.data.materials[0]=m;m.surface_render_method='BLENDED'
 for n in m.node_tree.nodes:
  if n.type=='MIX_RGB' and n.blend_type=='MULTIPLY':n.inputs[2].default_value=(.075,.035,.048,1)
for name in ['V6 small gentle smile','V6 lower lip soft accent']:
 o=bpy.data.objects.get(name)
 if o:bpy.data.objects.remove(o,do_unlink=True)
# Longitudinal paint follows each modeled curve, so it cannot create feather-shaped patches.
mat=bpy.data.materials['V6 pearl directional paint'];n=mat.node_tree.nodes;lk=mat.node_tree.links;old=next(q for q in n if q.type=='VERTEX_COLOR');dest=[l.to_socket for l in list(old.outputs['Color'].links)];tx=n.new('ShaderNodeTexImage');tx.image=hair
for socket in dest:lk.new(tx.outputs['Color'],socket)
for o in C.objects:
 if o.type!='MESH' or not o.name.startswith(('V6 swept fringe','V6 curved temple','V6 outward bob','V6 recessed scalp')):continue
 if 'recessed scalp' in o.name:o.data.materials.clear();o.data.materials.append(mat)
 else:
  uv=o.data.uv_layers.new(name='Longitudinal hair paint')
  for lp in o.data.loops:
   i=lp.vertex_index%10;j=lp.vertex_index//10;uv.data[lp.index].uv=(.04+.92*(1+math.cos(i*math.tau/10))/2,1-j/50)
# Real inverted hulls give a restrained all-angle contour, not a camera-specific drawn edge.
def ink(name,hex):
 def lin(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
 m=bpy.data.materials.new(name);m.use_nodes=True;m.use_backface_culling=True;nd=m.node_tree.nodes;nd.clear();em=nd.new('ShaderNodeEmission');em.inputs[0].default_value=(*[lin(int(hex[i:i+2],16)/255) for i in [0,2,4]],1);out=nd.new('ShaderNodeOutputMaterial');m.node_tree.links.new(em.outputs[0],out.inputs[0]);return m
faceink=ink('V6 fine rose skin contour','B98483');hairink=ink('V6 fine lavender hair contour','AFA8BE')
for original in list(C.objects):
 if original.type!='MESH':continue
 isface=original.name in ['Face V5 topology 7','Face V5 topology 8'];ishair=original.name.startswith(('V6 swept fringe','V6 curved temple','V6 outward bob')) and 'fine flow' not in original.name
 if not isface and not ishair:continue
 d=original.data.copy();amount=.00115 if isface else .0009
 for v in d.vertices:v.co+=v.normal*amount
 bm=bmesh.new();bm.from_mesh(d);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free();d.materials.clear();d.materials.append(faceink if isface else hairink);o=bpy.data.objects.new('Contour '+original.name,d);C.objects.link(o);o.parent=head
 for mod in original.modifiers:
  if mod.type=='SUBSURF':m=o.modifiers.new('Same contour curvature','SUBSURF');m.levels=mod.levels;m.render_levels=mod.render_levels
root['v6_uv_paint_applied']=True;root['uv_art']='Imagegen edits of CC0 skin/iris UV maps using approved concept; new longitudinal hair albedo';head.rotation_euler.y=0
s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=800;s.eevee.taa_render_samples=32;cam.data.ortho_scale=1.30;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v6-head.blend'));s.render.filepath=str(V/'neutral-c.png');bpy.ops.render.render(write_still=True)
pose=json.loads((P/'reference-registration.json').read_text());head.rotation_euler.y=pose['head_roll'];yaw,pitch=pose['yaw'],pose['pitch'];cam.location=(6*math.sin(yaw)*math.cos(pitch),-6*math.cos(yaw)*math.cos(pitch),6*math.sin(pitch));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));cam.location+=right*((945-pose['tx'])/pose['scale'])+up*((pose['ty']-262.5)/pose['scale']);cam.data.ortho_scale=610/pose['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-pose-c.png');bpy.ops.render.render(write_still=True)
print('V6_UV_PAINT_AND_CONTOURS_SAVED',flush=True)
