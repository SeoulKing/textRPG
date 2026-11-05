"""Read-only evidence rendering of the saved V7 Blender master."""
import bpy,sys,math,json,hashlib
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';V=P/'review';T=V/'turntable';T.mkdir(exist_ok=True);source=P/'heroine-v7-head.blend';before=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;cam=s.camera;root=bpy.data.objects['V7 MASTER'];head=bpy.data.objects['V7 HEAD POSE'];head.rotation_euler.y=0;s.render.resolution_x=s.render.resolution_y=800;s.eevee.taa_render_samples=24
for name,position in [('front-native-v7',(0,-6,.60)),('portrait-native-v7',(2.3,-6,.65)),('side-native-v7',(6,-.03,.56)),('rear-native-v7',(0,6,.60))]:
 cam.location=position;cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.34;s.render.filepath=str(V/(name+'.png'));bpy.ops.render.render(write_still=True)
clay=bpy.data.materials.new('V7 review only clay');clay.use_nodes=True;bs=clay.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.55,.55,.55,1);bs.inputs['Roughness'].default_value=.88;slots=[(o,list(o.data.materials)) for o in bpy.data.collections['V7 editable head'].objects if o.type in ['MESH','CURVE'] and not o.name.startswith('Contour ')];outlines=[o for o in bpy.data.collections['V7 editable head'].objects if o.name.startswith('Contour ')]
for o in outlines:o.hide_render=True
for o,materials in slots:
 for i in range(len(materials)):o.data.materials[i]=clay
cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/'clay-native-v7.png');bpy.ops.render.render(write_still=True)
for o,materials in slots:
 for i,m in enumerate(materials):o.data.materials[i]=m
for o in outlines:o.hide_render=False
pose=json.loads((P/'reference-fit.json').read_text());head.rotation_euler.y=pose['head_roll'];yaw,pitch=pose['yaw'],pose['pitch'];cam.location=(6*math.sin(yaw)*math.cos(pitch),-6*math.cos(yaw)*math.cos(pitch),6*math.sin(pitch));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));cam.location+=right*((945-pose['tx'])/pose['scale'])+up*((pose['ty']-262.5)/pose['scale']);cam.data.ortho_scale=610/pose['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-pose-native-v7.png');bpy.ops.render.render(write_still=True)
head.rotation_euler.y=0;cam.location=(0,-6,.60);cam.rotation_euler=(Vector((0,0,.42))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.45;s.render.resolution_x=s.render.resolution_y=400;s.eevee.taa_render_samples=12
for i in range(16):
 root.rotation_euler.z=i*math.tau/16;s.render.filepath=str(T/f'{i:02d}.png');bpy.ops.render.render(write_still=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==before
(V/'render-evidence.json').write_text(json.dumps({'source_sha256':before,'source_unmodified':True,'turntable_frames':16,'game_or_browser_testing':False,'source':'heroine-v7-head.blend'},indent=2),encoding='utf8');print('V7_READ_ONLY_RENDER_COMPLETE',flush=True)
