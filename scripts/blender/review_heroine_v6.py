"""Render saved V6 native model; no saves, game connections or source reconstruction."""
import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v6';V=P/'review';M=V/'turntable';M.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v6-head.blend'));s=bpy.context.scene;cam=s.camera;root=bpy.data.objects['V6 MASTER - neutral'];head=bpy.data.objects['V6 HEAD POSE - art comparison only'];head.rotation_euler.y=0;s.render.resolution_x=s.render.resolution_y=800;s.eevee.taa_render_samples=32
for name,position in [('front-v6',(0,-6,.60)),('portrait-v6',(2.3,-6,.65)),('side-v6',(6,-.03,.56)),('rear-v6',(0,6,.60))]:
 cam.location=position;cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.30;s.render.filepath=str(V/(name+'.png'));bpy.ops.render.render(write_still=True)
# A physical clay override on every mesh/curve, restored before paint renders.
clay=bpy.data.materials.new('V6 review only clay');clay.use_nodes=True;bs=clay.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.55,.55,.55,1);bs.inputs['Roughness'].default_value=.88;slots=[(o,list(o.data.materials)) for o in bpy.data.collections['V6 EDITABLE head and supporting bust'].objects if o.type in ['MESH','CURVE'] and not o.name.startswith('Contour ')]
contours=[o for o in bpy.data.collections['V6 EDITABLE head and supporting bust'].objects if o.name.startswith('Contour ')]
for o in contours:o.hide_render=True
for o,materials in slots:
 for i in range(len(o.data.materials)):o.data.materials[i]=clay
cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/'clay-v6.png');bpy.ops.render.render(write_still=True)
for o,materials in slots:
 for i,m in enumerate(materials):o.data.materials[i]=m
for o in contours:o.hide_render=False
pose=json.loads((P/'reference-registration.json').read_text());head.rotation_euler.y=pose['head_roll'];yaw,pitch=pose['yaw'],pose['pitch'];cam.location=(6*math.sin(yaw)*math.cos(pitch),-6*math.cos(yaw)*math.cos(pitch),6*math.sin(pitch));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));cam.location+=right*((945-pose['tx'])/pose['scale'])+up*((pose['ty']-262.5)/pose['scale']);cam.data.ortho_scale=610/pose['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-pose-v6.png');bpy.ops.render.render(write_still=True)
head.rotation_euler.y=0;cam.location=(0,-6,.60);cam.rotation_euler=(Vector((0,0,.42))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.45;s.render.resolution_x=s.render.resolution_y=400;s.eevee.taa_render_samples=8
for i in range(24):
 root.rotation_euler.z=i*math.tau/24;s.render.filepath=str(M/f'{i:02d}.png');bpy.ops.render.render(write_still=True)
print('V6_SAVED_SOURCE_REVIEW_COMPLETE',flush=True)
