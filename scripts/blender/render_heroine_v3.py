"""Read the editable V3 source; render real 3D poses and inspect evaluated IK."""
import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(sys.argv[sys.argv.index('--')+1]);P=ROOT/'art-studies/arcana-hero/white-bob-heroine/blender-v3'
bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v3.blend'))
s=bpy.context.scene;r=bpy.data.objects['HeroineV3Rig'];cam=s.camera
s.render.resolution_x=96;s.render.resolution_y=144;s.render.resolution_percentage=100;cam.data.ortho_scale=144/64;cam.data.shift_y=44/144
cam.location=(0,-6,6);cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.render.film_transparent=True
out=P/'poses';out.mkdir(exist_ok=True)
report={'poses':[],'stretch':False,'max_leg_length_error':0,'max_target_error':0,'boot_minimum_z':1,'cycle_distance_world':1.04}
rest={side:[(r.data.bones['thigh.'+side].head_local-r.data.bones['shin.'+side].head_local).length,(r.data.bones['shin.'+side].head_local-r.data.bones['foot.'+side].head_local).length] for side in ['L','R']}
for clip in ['Walk','Run']:
 r.animation_data.action=bpy.data.actions[clip]
 for d in range(8):
  r.rotation_euler.z=d*math.tau/8
  for f in range(24):
   s.frame_set(1+f*2);bpy.context.view_layer.update()
   if d==0:
    pose={}
    for side in ['L','R']:
     thigh=r.pose.bones['thigh.'+side];knee=r.pose.bones['shin.'+side];ankle=r.pose.bones['foot.'+side];target=r.pose.bones['CTRL_foot.'+side]
     lengths=[(thigh.head-knee.head).length,(knee.head-ankle.head).length]
     err=max(abs(lengths[i]-rest[side][i]) for i in [0,1]);target_err=(ankle.head-target.head).length
     report['max_leg_length_error']=max(report['max_leg_length_error'],err);report['max_target_error']=max(report['max_target_error'],target_err)
     pose[side]={'hip':list(thigh.head),'knee':list(knee.head),'ankle':list(ankle.head),'target':list(target.head),'lengths':lengths}
    report['poses'].append(pose)
    deps=bpy.context.evaluated_depsgraph_get();ob=bpy.data.objects['Heroine_boots_taupe'];ev=ob.evaluated_get(deps);me=ev.to_mesh();z=min((ev.matrix_world@v.co).z for v in me.vertices);ev.to_mesh_clear();report['boot_minimum_z']=min(report['boot_minimum_z'],z)
   if d==0 or f in [0,6,12,18]:
    s.render.filepath=str(out/f'{clip.lower()}-{d}-{f}.png');bpy.ops.render.render(write_still=True)
# Actual source turntable for continuous rotation, not direction-image splicing.
r.animation_data.action=bpy.data.actions['Idle'];s.frame_set(1)
for f in range(48):
 r.rotation_euler.z=f*math.tau/48;s.render.filepath=str(out/f'turn-{f}.png');bpy.ops.render.render(write_still=True)
r.rotation_euler.z=0;r.animation_data.action=bpy.data.actions['Idle'];s.frame_set(1)
s.render.resolution_x=480;s.render.resolution_y=640;cam.data.ortho_scale=2.85;cam.data.shift_y=0
cam.location=(1.5,-6,2.9);cam.rotation_euler=(Vector((0,0,1.18))-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.filepath=str(P/'model-beauty.png');bpy.ops.render.render(write_still=True)
(P/'rig-audit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print('V3_RIG_AUDIT',json.dumps({k:v for k,v in report.items() if k!='poses'}),flush=True)
