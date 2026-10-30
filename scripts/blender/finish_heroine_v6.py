import bpy,sys,math,json,numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v6';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v6-head.blend'));root=bpy.data.objects['V6 MASTER - neutral'];head=bpy.data.objects['V6 HEAD POSE - art comparison only'];C=bpy.data.collections['V6 EDITABLE head and supporting bust']
if root.get('v6_final_paint'):raise RuntimeError('Final hair pass already saved; review current source')
def lin(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
for o in C.objects:
 if o.type=='MESH' and o.name.startswith(('V6 swept fringe','V6 curved temple','V6 outward bob')) and 'fine flow' not in o.name:
  attr=o.data.color_attributes.get('V6Paint')
  for v in o.data.vertices:
   q=math.cos((v.index%10)*math.tau/10);t=(v.index//10)/50;shade=.944-.218*abs(q)**1.4+.017*math.exp(-((q+.15)/.28)**2)-.025*max(0,1-t*5);col=[shade+.032,shade+.016,shade+.058];attr.data[v.index].color=(*[lin(float(np.clip(c,0,1))) for c in col],1)
# Replace evenly parallel antennae by independently shaped, scalp-rooted wisps.
for o in list(C.objects):
 if o.name.startswith('V6 silhouette curl'):bpy.data.objects.remove(o,do_unlink=True)
mat=bpy.data.materials['V6 pearl silhouette fibers']
def curve(name,ps,r):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=16;d.bevel_depth=r;d.bevel_resolution=2;sp=d.splines.new('BEZIER');sp.bezier_points.add(len(ps)-1)
 for i,(bp,p) in enumerate(zip(sp.bezier_points,ps)):bp.co=p;bp.handle_left_type=bp.handle_right_type='AUTO';bp.radius=.1 if i==len(ps)-1 else .3 if i==0 else 1
 o=bpy.data.objects.new(name,d);C.objects.link(o);d.materials.append(mat);o.parent=head
paths=[[(.12,-.07,.98),(.37,-.24,.75),(.55,-.25,.54),(.59,-.25,.44),(.54,-.30,.46)],[(.17,-.1,.92),(.40,-.26,.67),(.60,-.25,.38),(.55,-.30,.31),(.46,-.31,.34)],[(.28,-.12,.72),(.52,-.24,.44),(.59,-.23,.22),(.52,-.30,.18),(.45,-.31,.22)],[(.34,-.09,.44),(.50,-.24,.27),(.54,-.20,.11),(.48,-.23,.07),(.42,-.27,.12)]]
for sign in [-1,1]:
 for k,ps in enumerate(paths):curve('V6 airy asymmetric wisp '+str(sign)+' '+str(k),[(sign*x,y+(0.018*k if sign>0 else 0),z+(.025*math.sin(k+1) if sign>0 else 0)) for x,y,z in ps],.0009+.0002*(k%2))
 curve('V6 cheek curl '+str(sign),[(sign*.35,.015,.43),(sign*.47,-.09,.30),(sign*.40,-.25,.22),(sign*.30,-.32,.255)],.0014)
root['v6_final_paint']=True;head.rotation_euler.y=0;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v6-head.blend'));print('V6_FINAL_NATIVE_HAIR_PASS_SAVED')
