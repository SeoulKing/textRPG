"""Keep the native eye-hole boundary fixed while smoothing the facial volume."""
import bpy,sys
from pathlib import Path
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7/face-refinement';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-face.blend'));root=bpy.data.objects['V7 MASTER']
if root.get('face_eye_rims_preserved'):raise RuntimeError('Eye rims already preserved; edit saved source')
counts={}
for name in ['Face V5 topology 7','Contour Face V5 topology 7']:
 o=bpy.data.objects[name];d=o.data;usage={}
 for p in d.polygons:
  for e in p.edge_keys:k=tuple(sorted(e));usage[k]=usage.get(k,0)+1
 attr=d.attributes.get('crease_edge') or d.attributes.new('crease_edge','FLOAT','EDGE');count=0
 for e in d.edges:
  a,b=[d.vertices[i].co for i in e.vertices];mid=(a+b)*.5
  if usage.get(tuple(sorted(e.vertices)),0)==1 and .28<mid.z<.54 and .025<abs(mid.x)<.33:
   attr.data[e.index].value=1;count+=1
 if count==0:raise RuntimeError('No eye boundary found; do not save a speculative repair')
 counts[name]=count;d.update()
root['face_eye_rims_preserved']=True;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-face.blend'));print('EYE_RIMS_PRESERVED',counts,flush=True)
