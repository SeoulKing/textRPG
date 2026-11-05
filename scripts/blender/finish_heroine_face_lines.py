"""Preserve painted lash coverage and reduce the actual upper-lid thickness."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7/face-refinement';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-face.blend'));root=bpy.data.objects['V7 MASTER'];head=bpy.data.objects['V7 HEAD POSE']
if root.get('face_line_finish'):raise RuntimeError('Line finish already saved; preserve source')
def col(h):
 def lin(v):return v/12.92 if v<.04045 else ((v+.055)/1.055)**2.4
 return tuple(lin(int(h[i:i+2],16)/255) for i in [0,2,4])+(1,)
for index,color in [(2,'71505F'),(3,'5C3E50'),(4,'B29A9A')]:
 o=bpy.data.objects['Face V5 topology '+str(index)];mix=next(n for n in o.data.materials[0].node_tree.nodes if n.type=='MIX_RGB');mix.blend_type='MULTIPLY';mix.inputs[2].default_value=col(color)
bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();white=bpy.data.objects['Face V5 topology 1'].evaluated_get(deps);pts=[v.co.copy() for v in white.data.vertices]
for index,shrink in [(2,.60),(3,.78)]:
 o=bpy.data.objects['Face V5 topology '+str(index)];key=o.data.shape_keys.key_blocks['Face - gentle proportions']
 for v in key.data:
  x,y,z=v.co
  if z<.37:continue
  near=sorted((p for p in pts if p.x*x>0),key=lambda p:abs(p.x-x))[:5];upper=max(p.z for p in near)
  v.co.z=upper+(z-upper)*shrink
  if abs(x)>.27:v.co.x=math.copysign(.27+(abs(x)-.27)*.76,x)
root['face_line_finish']=True;bpy.context.view_layer.update();s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=24;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.34;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-face.blend'));s.render.filepath=str(P/'review/portrait-face-b.png');bpy.ops.render.render(write_still=True);cam.location=(0,-6,.52);cam.rotation_euler=(Vector((0,-.13,.29))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.82;s.render.filepath=str(P/'review/front-face-b.png');bpy.ops.render.render(write_still=True);print('FACE_LINE_FINISH_SAVED',flush=True)
