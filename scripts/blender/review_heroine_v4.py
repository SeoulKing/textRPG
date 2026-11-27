"""Offline V4 head posture audit and review renders; no gameplay or deployment."""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v4';O=P/'motion';O.mkdir(exist_ok=True)
def angles(path,rig_name):
 bpy.ops.wm.open_mainfile(filepath=str(path));r=bpy.data.objects[rig_name];result={}
 for clip in ['Idle','Walk','Run','TurnLeft','TurnRight']:
  r.animation_data.action=bpy.data.actions[clip];values=[]
  for i in range(49 if clip in ['Walk','Run'] else 19):
   bpy.context.scene.frame_set(i+1);bpy.context.view_layer.update();up=(r.matrix_world@r.pose.bones['head'].matrix).to_3x3()@Vector((0,1,0));values.append(math.degrees(math.acos(max(-1,min(1,up.normalized().dot(Vector((0,0,1))))))))
  result[clip]={'maximum_head_tilt_degrees':max(values),'samples':len(values)}
 return result
before=angles(R/'art-studies/arcana-hero/white-bob-heroine/blender-v3/heroine-v3.blend','HeroineV3Rig');after=angles(P/'heroine-v4.blend','HeroineV4Rig')
assert after['Run']['maximum_head_tilt_degrees']<.1,after
s=bpy.context.scene;r=bpy.data.objects['HeroineV4Rig'];cam=s.camera;floor=bpy.data.objects['V4 Studio Floor'];r.animation_data.action=bpy.data.actions['Idle'];s.frame_set(1)
s.render.resolution_x=800;s.render.resolution_y=1000;s.eevee.taa_render_samples=32;s.render.film_transparent=False;cam.data.ortho_scale=2.90;cam.data.shift_y=0;cam.location=(2.5,-7,3.1);cam.rotation_euler=(Vector((0,0,1.2))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(P/'beauty-v4.png');bpy.ops.render.render(write_still=True)
cam.location=(0,-4,2.14);cam.rotation_euler=(Vector((0,-.03,1.97))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.90;s.render.resolution_x=800;s.render.resolution_y=800;s.render.filepath=str(P/'face-v4.png');bpy.ops.render.render(write_still=True)
# Small outputs are actual model renders, with a neutral head at both camera pitches.
floor.hide_render=True;s.render.film_transparent=True;s.eevee.taa_render_samples=1;s.render.resolution_x=128;s.render.resolution_y=176;cam.data.ortho_scale=176/64
for pitch in [30,45]:
 a=math.radians(pitch);cam.location=(0,-6*math.cos(a),6*math.sin(a));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.location+=cam.rotation_euler.to_matrix()@Vector((0,60/64,0))
 for d in range(8):
  r.rotation_euler.z=d*math.tau/8;s.render.filepath=str(P/f'dot-{pitch}-{d}.png');bpy.ops.render.render(write_still=True)
r.rotation_euler.z=0
# Two complete moving cycles. Lights and camera track the actor; the floor stays fixed.
floor.hide_render=False;s.render.film_transparent=False;s.eevee.taa_render_samples=8;s.render.resolution_x=400;s.render.resolution_y=500;cam.data.ortho_scale=2.9
mat=floor.data.materials[0];bs=mat.node_tree.nodes.get('Principled BSDF');check=mat.node_tree.nodes.new('ShaderNodeTexChecker');coord=mat.node_tree.nodes.new('ShaderNodeTexCoord');check.inputs['Scale'].default_value=.625;check.inputs['Color1'].default_value=(.087,.126,.188,1);check.inputs['Color2'].default_value=(.103,.145,.204,1);mat.node_tree.links.new(coord.outputs['Object'],check.inputs['Vector']);mat.node_tree.links.new(check.outputs['Color'],bs.inputs['Base Color'])
lights=[(o,o.location.copy()) for o in bpy.data.objects if o.type=='LIGHT'];r.animation_data.action=bpy.data.actions['Run']
for view,position in [('front',Vector((1.0,-7,3.3))),('side',Vector((7,-1.4,3.1)))]:
 base=position;target=Vector((0,0,1.2));cam.rotation_euler=(target-base).to_track_quat('-Z','Y').to_euler()
 for i in range(48):
  phase=(i%24)/24;r.location=Vector((0,-1.6*i/24,0));s.frame_set(1+(i%24)*2);cam.location=base+r.location
  for light,p in lights:light.location=p+r.location
  s.render.filepath=str(O/f'run-{view}-{i}.png');bpy.ops.render.render(write_still=True)
report={'status':'isolated candidate; game integration held','before':before,'after':after,'neutral_head_control':'neck + CTRL_head_level, pose-space rotation copy; no fixed 22-degree pitch','head_samples':sum(v['samples'] for v in after.values()),'review_dot_frame':[128,176],'review_foot':[64,148],'pixels_per_unit':64,'studio_views':['beauty','front face','moving run front','moving run side'],'game_runtime_changed':False,'web_exported':False,'art_acceptance':'not final; candidate for further art review'}
(P/'head-posture-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print('V4_HEAD_AUDIT',json.dumps(after),flush=True)
