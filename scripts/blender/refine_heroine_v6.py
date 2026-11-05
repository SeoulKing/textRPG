"""V6 native sculpt refinement: long bangs, irregular split ends, finer lids and jaw."""
import bpy,bmesh,sys,math,json,numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v6';V=P/'review';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v6-head.blend'));root=bpy.data.objects['V6 MASTER - neutral'];head=bpy.data.objects['V6 HEAD POSE - art comparison only'];C=bpy.data.collections['V6 EDITABLE head and supporting bust']
if root.get('v6_split_refinement'):raise RuntimeError('Sculpt refinement already applied; use saved source')
locks=json.loads((P/'hair-authoring-v6.json').read_text());hairmat=bpy.data.materials['V6 pearl directional paint']
def cat(ps,t):
 ps=[Vector(p) for p in ps];u=t*(len(ps)-1);k=min(len(ps)-2,int(u));q=u-k;a,b,c,d=ps[max(0,k-1)],ps[k],ps[k+1],ps[min(len(ps)-1,k+2)];return .5*((2*b)+(-a+c)*q+(2*a-5*b+4*c-d)*q*q+(-a+3*b-3*c+d)*q*q*q)
def frame(ps,t,front):
 p=cat(ps,t);tan=(cat(ps,min(1,t+.004))-cat(ps,max(0,t-.004))).normalized();n=Vector((0,-1,0)) if front else Vector((p.x,p.y-.035,.1)).normalized();across=tan.cross(n).normalized();return p,across,across.cross(tan).normalized()
def update_contour(o):
 contour=bpy.data.objects.get('Contour '+o.name)
 if not contour:return
 ink=contour.data.materials[0];data=o.data.copy();amount=.00115 if o.name.startswith('Face') else .0009
 for v in data.vertices:v.co+=v.normal*amount
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free();data.materials.clear();data.materials.append(ink);contour.data=data
# Longer asymmetrical fringe crosses the far eye instead of stopping above the brow.
changes={0:[(-.41,-.30,.32),(-.34,-.30,.23)],1:[(-.27,-.36,.43),(-.25,-.32,.29)],2:[(-.18,-.37,.47),(-.145,-.34,.34)],3:[(-.068,-.36,.48),(-.085,-.34,.385)]}
for k,ps in changes.items():
 spec=locks[k];spec['path'][-2:]=ps;o=bpy.data.objects[spec['name']];points=spec['path'];width=spec['half_width']
 for j in range(51):
  t=j/50;p,across,normal=frame(points,t,True);w=float(np.interp(t,np.linspace(0,1,len(width)),width))
  for i in range(10):a=i*math.tau/10;q=math.cos(a);o.data.vertices[j*10+i].co=p+across*(q*w*(1+.025*math.sin(t*17+k)))+normal*(math.sin(a)*w*.105)
 o.data.update();update_contour(o)
 for lane in [-.42,.26]:
  curve=bpy.data.objects.get(spec['name']+' fine flow '+str(lane))
  if curve:
   for bp,t in zip(curve.data.splines[0].bezier_points,np.linspace(.12,.97,16)):
    p,across,normal=frame(points,float(t),True);w=float(np.interp(t,np.linspace(0,1,len(width)),width));bp.co=p+across*w*lane+normal*(w*.109)
# Gentle pointed jaw; preserve all eye and lip positions.
skin=bpy.data.objects['Face V5 topology 7']
for v in skin.data.vertices:v.co.x/=1+.22*math.exp(-((v.co.z-.075)/.10)**2)
skin.data.update();update_contour(skin)
# Smaller ear anchored at the same root, rather than enlarged head-side pads.
ear=bpy.data.objects['Face V5 topology 8']
for v in ear.data.vertices:
 sign=1 if v.co.x>0 else -1;anchor=Vector((sign*.31,.07,.34));v.co=anchor+(v.co-anchor)*.82
ear.data.update();update_contour(ear)
# Shrink the UV nose reflection without changing the saved paint image.
for lp in skin.data.uv_layers.active.data:
 uv=lp.uv;d=uv-Vector((.5,.35));f=1+.38*math.exp(-d.length_squared/.035**2);lp.uv=Vector((.5,.35))+d*f
# Narrow only lash thickness above the actual white-eye upper rim.
white=bpy.data.objects['Face V5 topology 1']
for k in [2,3]:
 o=bpy.data.objects['Face V5 topology '+str(k)]
 for v in o.data.vertices:
  x,y,z=v.co;near=[p.co.z for p in white.data.vertices if p.co.x*x>0 and abs(p.co.x-x)<.018]
  if near:
   upper=max(near)
   if z>upper:v.co.z=upper+(z-upper)*.65
 o.data.update()
# Lower contrast and fewer painted lines within every sculpted lock.
nd=hairmat.node_tree.nodes;lk=hairmat.node_tree.links;tx=next(n for n in nd if n.type=='TEX_IMAGE');vc=next(n for n in nd if n.type=='VERTEX_COLOR');dest=[l.to_socket for l in list(tx.outputs['Color'].links)];mix=nd.new('ShaderNodeMixRGB');mix.blend_type='MIX';mix.inputs[0].default_value=.38;lk.new(vc.outputs['Color'],mix.inputs[1]);lk.new(tx.outputs['Color'],mix.inputs[2])
for socket in dest:lk.new(mix.outputs[0],socket)
for k,spec in enumerate(locks):
 o=bpy.data.objects[spec['name']];u0=.08+(k*.137)% .78
 for lp in o.data.loops:
  i=lp.vertex_index%10;j=lp.vertex_index//10;o.data.uv_layers.active.data[lp.index].uv=(u0+.08*(1+math.cos(i*math.tau/10))/2,1-j/50)
scalp=bpy.data.objects['V6 recessed scalp'];attr=scalp.data.color_attributes.get('V6Paint') or scalp.data.color_attributes.new(name='V6Paint',type='FLOAT_COLOR',domain='POINT')
for value in attr.data:value.color=(.81,.79,.86,1)
# Add physically separate small split ends with independent endpoint positions.
count=0
for k,spec in enumerate(locks):
 front=not spec['name'].startswith('V6 outward');points=spec['path'];width=spec['half_width']
 for side in [-1,1]:
  ps=[]
  for j,t in enumerate([.57,.70,.84,.95,1.]):
   p,across,normal=frame(points,t,front);w=float(np.interp(t,np.linspace(0,1,len(width)),width));p+=across*side*(w*.64+.010*(j/4)**2)+normal*(w*.13+.0015);p.z+=.012*math.sin(k*1.71+side)*(j/4)**2
   if j==4:p+=across*side*(.012+.008*math.sin(k));p.z+=.018*math.sin(k*.9+side)
   ps.append(p)
  vs=[];fs=[];uv=[];rows=24;n=8
  for j in range(rows+1):
   t=j/rows;p,across,normal=frame(ps,t,front);w=float(np.interp(t,[0,.28,.62,.86,1],[.003,.009,.008,.0035,.0002]))
   for i in range(n):a=i*math.tau/n;q=math.cos(a);vs.append(p+across*q*w+normal*math.sin(a)*w*.09);uv.append((.12+(k*.121)% .72+.07*(q+1)/2,1-t))
  for j in range(rows):
   for i in range(n):a=j*n+i;b=j*n+(i+1)%n;fs.append((a,b,b+n,a+n))
  fs.extend([tuple(reversed(range(n))),tuple(rows*n+i for i in range(n))]);d=bpy.data.meshes.new('V6 split end surface');d.from_pydata(vs,[],fs);d.update();d.materials.append(hairmat);layer=d.uv_layers.new(name='Longitudinal hair paint');col=d.color_attributes.new(name='V6Paint',type='FLOAT_COLOR',domain='POINT')
  for lp in d.loops:layer.data[lp.index].uv=uv[lp.vertex_index]
  for value in col.data:value.color=(.84,.82,.88,1)
  for p in d.polygons:p.use_smooth=True
  o=bpy.data.objects.new('V6 split end '+str(k)+' '+str(side),d);C.objects.link(o);o.parent=head;mod=o.modifiers.new('Soft split curvature','SUBSURF');mod.levels=1;count+=1
# Bring the supporting collar closer to the jaw, keeping the neck root intact.
for o in C.objects:
 if o.name.startswith(('Ivory ','Periwinkle ','Cape ','Clasp ')):o.location.z+=.055
root['v6_split_refinement']=True;root['sculpt_changes']='Longer eye-crossing fringe; independently separated split ends; tapered lids; pointed jaw; smaller ears';(P/'hair-authoring-v6.json').write_text(json.dumps(locks,indent=2),encoding='utf8');head.rotation_euler.y=0
s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=800;cam.data.ortho_scale=1.3;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();s.eevee.taa_render_samples=32;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v6-head.blend'));s.render.filepath=str(V/'neutral-d.png');bpy.ops.render.render(write_still=True)
pose=json.loads((P/'reference-registration.json').read_text());head.rotation_euler.y=pose['head_roll'];yaw,pitch=pose['yaw'],pose['pitch'];cam.location=(6*math.sin(yaw)*math.cos(pitch),-6*math.cos(yaw)*math.cos(pitch),6*math.sin(pitch));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));cam.location+=right*((945-pose['tx'])/pose['scale'])+up*((pose['ty']-262.5)/pose['scale']);cam.data.ortho_scale=610/pose['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-pose-d.png');bpy.ops.render.render(write_still=True);print('V6_SCULPT_REFINED',count,'independent split ends',flush=True)
