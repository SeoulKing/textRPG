"""Balance the actual lip/chin profile and smooth the native facial volume."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7/face-refinement';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-face.blend'));root=bpy.data.objects['V7 MASTER'];head=bpy.data.objects['V7 HEAD POSE']
if root.get('face_profile_balanced'):raise RuntimeError('Profile is already edited; preserve source')
for name in ['Face V5 topology 7','Contour Face V5 topology 7']:
 o=bpy.data.objects[name];key=o.data.shape_keys.key_blocks[1]
 for v in key.data:
  x,y,z=v.co;f=max(0,min(1,(.02-y)/.12));v.co.y+=f*math.exp(-(x/.11)**2)*(-.023*math.exp(-((z-.163)/.055)**2)+.010*math.exp(-((z-.06)/.05)**2))
 mods=[m for m in o.modifiers if m.type=='SUBSURF'];m=mods[0] if mods else o.modifiers.new('Smooth facial volume','SUBSURF');m.levels=m.render_levels=2;m.uv_smooth='PRESERVE_BOUNDARIES'
root['face_profile_balanced']=True;bpy.context.view_layer.update();s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=24;cam.location=(0,-6,.52);cam.rotation_euler=(Vector((0,-.13,.29))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.82;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-face.blend'));s.render.filepath=str(P/'review/front-face-d.png');bpy.ops.render.render(write_still=True);cam.location=(6,-.05,.44);cam.rotation_euler=(Vector((0,0,.32))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.88;s.render.filepath=str(P/'review/profile-face-d.png');bpy.ops.render.render(write_still=True);print('FACE_PROFILE_BALANCED',flush=True)
