"""Smooth continuous eyelid authoring, replacing the nearest-point prototype."""
import bpy,sys,math,numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7/face-refinement';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-face.blend'));root=bpy.data.objects['V7 MASTER'];head=bpy.data.objects['V7 HEAD POSE']
if root.get('face_curve_finish'):raise RuntimeError('Curve finish exists; edit saved source')
# The original native sculpt is deterministic; do not compound the failed pointwise contraction.
code=(R/'scripts/blender/refine_heroine_face.py').read_text(encoding='utf-8-sig');exec(code[code.index('def g('):code.index('def keydriver(')])
bpy.context.view_layer.update();white=bpy.data.objects['Face V5 topology 1'].evaluated_get(bpy.context.evaluated_depsgraph_get());groups={}
for v in white.data.vertices:groups.setdefault(round(abs(v.co.x),3),[]).append(v.co.z)
x=np.array(sorted(groups));z=np.array([max(groups[a]) for a in x]);poly=np.polyfit(x,z,3)
for index,amount in [(2,.82),(3,.92)]:
 o=bpy.data.objects['Face V5 topology '+str(index)];key=o.data.shape_keys.key_blocks['Face - gentle proportions']
 for i,v in enumerate(o.data.vertices):
  p=sculpt(v.co,index);a=abs(p.x);upper=float(np.polyval(poly,min(max(a,.05),.27)));t=max(0,min(1,(p.z-.355)/.05));t=t*t*(3-2*t);p.z+=t*((upper+(p.z-upper)*amount)-p.z)
  if a>.27:p.x=math.copysign(.27+(a-.27)*.84,p.x)
  key.data[i].co=p
for index in [2,3,4]:
 o=bpy.data.objects['Face V5 topology '+str(index)];mods=[m for m in o.modifiers if m.type=='SUBSURF'];m=mods[0] if mods else o.modifiers.new('Smooth continuous eye surface','SUBSURF');m.levels=m.render_levels=2 if index==2 else 1;m.uv_smooth='PRESERVE_BOUNDARIES'
# Reduce the remaining hard painted nose reflection on its local native surface.
o=bpy.data.objects['Face V5 topology 7'];n=o.data.materials[0].node_tree.nodes
for q in n:
 if q.type=='MAP_RANGE':q.inputs['From Max'].default_value=.055;q.inputs['To Min'].default_value=.92
root['face_curve_finish']=True;bpy.context.view_layer.update();s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=24;cam.location=(0,-6,.52);cam.rotation_euler=(Vector((0,-.13,.29))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.82;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-face.blend'));s.render.filepath=str(P/'review/front-face-c.png');bpy.ops.render.render(write_still=True);print('FACE_CONTINUOUS_CURVE_SAVED',flush=True)
