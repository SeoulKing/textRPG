"""Read saved V5 head: review only, does not save or rebuild authoring source."""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v5';V=P/'review';M=V/'turntable';M.mkdir(exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v5-head.blend'));s=bpy.context.scene;cam=s.camera;root=bpy.data.objects['V5 HEAD MASTER - neutral axis']
s.render.resolution_x=s.render.resolution_y=800;s.eevee.taa_render_samples=32;cam.data.ortho_scale=1.28
for name,pos in [('face-front',(0,-6,.59)),('face-three-quarter',(2.30,-6,.73)),('face-side',(6,-.03,.59))]:
 cam.location=pos;cam.rotation_euler=(Vector((0,-.025,.535))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/(name+'.png'));bpy.ops.render.render(write_still=True)
# Material override proves native head and hair volume without painted colours.
clay=bpy.data.materials.new('Review only - clay');clay.diffuse_color=(.55,.55,.55,1);clay.use_nodes=True;bs=clay.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.55,.55,.55,1);bs.inputs['Roughness'].default_value=.85
slots=[(o,list(o.data.materials)) for o in bpy.data.collections['V5 EDITABLE - face hair and costume bust'].objects if o.type in ['MESH','CURVE']]
for o,materials in slots:
 for i in range(len(o.data.materials)):o.data.materials[i]=clay
cam.location=(2.30,-6,.73);cam.rotation_euler=(Vector((0,-.025,.535))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/'face-clay.png');bpy.ops.render.render(write_still=True)
for o,materials in slots:
 for i,m in enumerate(materials):o.data.materials[i]=m
s.render.resolution_x=800;s.render.resolution_y=1000;cam.data.ortho_scale=1.8
for name,pos in [('front',(0,-6,.56)),('side',(6,-.03,.66)),('rear',(0,6,.70))]:
 cam.location=pos;cam.rotation_euler=(Vector((0,0,.35))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/(name+'.png'));bpy.ops.render.render(write_still=True)
s.render.resolution_x=s.render.resolution_y=400;s.eevee.taa_render_samples=4;cam.data.ortho_scale=1.60;cam.location=(0,-6,.70);cam.rotation_euler=(Vector((0,0,.42))-cam.location).to_track_quat('-Z','Y').to_euler()
for i in range(24):
 root.rotation_euler.z=i*math.tau/24;s.render.filepath=str(M/f'{i:02d}.png');bpy.ops.render.render(write_still=True)
root.rotation_euler.z=0
records=[]
for o in bpy.data.collections['V5 EDITABLE - face hair and costume bust'].objects:
 if o.type=='MESH':records.append({'name':o.name,'vertices':len(o.data.vertices),'faces':len(o.data.polygons),'dimensions':[round(v,5) for v in o.dimensions]})
(P/'model-inspection.json').write_text(json.dumps({'scope':'head and hair master; no game integration','mesh_count':len(records),'meshes':records,'turntable_frames':24,'reference_image_rendered':False},indent=2),encoding='utf8')
print('V5_SAVED_SOURCE_REVIEW_DONE',len(records),'mesh objects',flush=True)
