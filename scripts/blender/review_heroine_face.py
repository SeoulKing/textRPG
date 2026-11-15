"""Read-only native face comparison; fixed cameras and preserved baseline."""
import bpy,sys,math,json,hashlib,struct
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);B=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';P=B/'face-refinement';V=P/'review/final';V.mkdir(exist_ok=True);source=P/'heroine-face.blend';baseline=B/'heroine-v7-head.blend';before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source,baseline]};previous=json.loads((V/'render-evidence.json').read_text()) if (V/'render-evidence.json').exists() else {};reuse_baseline=previous.get('baseline_sha256')==before[str(baseline)] and all((V/(n+'.png')).exists() for n in ['before-front','before-three-quarter']);bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;cam=s.camera;head=bpy.data.objects['V7 HEAD POSE'];head.rotation_euler.y=0;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=24

def look(name,pos,target,scale):
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;s.render.filepath=str(V/(name+'.png'));bpy.ops.render.render(write_still=True)
def hairhash():
 h=hashlib.sha256()
 for o in sorted(bpy.data.collections['V7 editable head'].objects,key=lambda o:o.name):
  if not o.name.startswith(('V7 CC0','V7 sculpted','V7 fine','V7 crown')):continue
  h.update(o.name.encode())
  if o.type=='MESH':
   for v in o.data.vertices:h.update(struct.pack('<3f',*v.co))
  elif o.type=='CURVE':
   for sp in o.data.splines:
    for v in sp.bezier_points:h.update(struct.pack('<3f',*v.co))
 return h.hexdigest()
hair_after=hairhash()
look('portrait',(2.3,-6,.65),(0,-.025,.45),1.34);look('front',(0,-6,.52),(0,-.13,.29),.82);look('three-quarter',(2.3,-6,.52),(0,-.13,.29),.82);look('profile',(6,-.05,.44),(0,0,.32),.88)
pose=json.loads((B/'reference-fit.json').read_text());head.rotation_euler.y=pose['head_roll'];yaw,pitch=pose['yaw'],pose['pitch'];cam.location=(6*math.sin(yaw)*math.cos(pitch),-6*math.cos(yaw)*math.cos(pitch),6*math.sin(pitch));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));cam.location+=right*((945-pose['tx'])/pose['scale'])+up*((pose['ty']-262.5)/pose['scale']);cam.data.ortho_scale=610/pose['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-pose.png');bpy.ops.render.render(write_still=True);head.rotation_euler.y=0;s.render.resolution_x=s.render.resolution_y=900
# Use actual material removal to judge the head shape independently of paint and hair.
clay=bpy.data.materials.new('Face focus review clay');clay.use_nodes=True;bs=clay.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.55,.55,.55,1);bs.inputs['Roughness'].default_value=.9
for o in bpy.data.collections['V7 editable head'].objects:
 if o.type not in ['MESH','CURVE']:continue
 if not (o.name in ['Face V5 topology 1','Face V5 topology 7','Face V5 topology 8','V7 anatomical rear head and nape']):o.hide_render=True;continue
 for i in range(len(o.data.materials)):o.data.materials[i]=clay
look('clay',(2.3,-6,.52),(0,-.13,.29),.82)
# Reload the preserved baseline for exactly the same close cameras.
bpy.ops.wm.open_mainfile(filepath=str(baseline));s=bpy.context.scene;cam=s.camera;bpy.data.objects['V7 HEAD POSE'].rotation_euler.y=0;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=24
if not reuse_baseline:
 look('before-front',(0,-6,.52),(0,-.13,.29),.82);look('before-three-quarter',(2.3,-6,.52),(0,-.13,.29),.82)
assert hairhash()==hair_after
for p in [source,baseline]:assert hashlib.sha256(p.read_bytes()).hexdigest()==before[str(p)]
(V/'render-evidence.json').write_text(json.dumps({'source_sha256':before[str(source)],'baseline_sha256':before[str(baseline)],'source_and_baseline_unchanged':True,'fixed_cameras':True,'baseline_render_reused':reuse_baseline,'game_or_browser_testing':False,'images_are_native_blender_renders':True,'hair_geometry_unchanged':True,'hair_geometry_sha256':hair_after},indent=2),encoding='utf8');print('FACE_READ_ONLY_COMPARISON_COMPLETE',flush=True)
