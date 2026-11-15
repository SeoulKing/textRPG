"""Native V6 revision: measured face landmarks, controlled face paint and rebuilt flowing bob."""
import bpy,math,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v6';V=P/'review';T=P/'textures'
for p in [P,V,T]:p.mkdir(exist_ok=True)
if (P/'heroine-v6-head.blend').exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Saved V6 exists; review saved source or explicitly rebuild candidate')
bpy.ops.wm.open_mainfile(filepath=str(P.parent/'blender-v5/heroine-v5-head.blend'));C=bpy.data.collections['V5 EDITABLE - face hair and costume bust'];C.name='V6 EDITABLE head and supporting bust';root=bpy.data.objects['V5 HEAD MASTER - neutral axis'];root.name='V6 MASTER - neutral'
# Read real geometry landmarks before revising. Positions are authoring coordinates.
def bounds_center(o,sign):
 vs=[v.co for v in o.data.vertices if v.co.x*sign>0];return (Vector(tuple(min(v[k] for v in vs) for k in range(3)))+Vector(tuple(max(v[k] for v in vs) for k in range(3))))*.5
skin=bpy.data.objects['Face V5 topology 7'];eyes=bpy.data.objects['Face V5 topology 5'];landmarks={'iris_L':bounds_center(eyes,-1),'iris_R':bounds_center(eyes,1),'chin':min((v.co.copy() for v in skin.data.vertices),key=lambda p:p.z),'nose':min((v.co.copy() for v in skin.data.vertices if abs(v.co.x)<.03),key=lambda p:p.y)}
landmarks['mouth']=Vector((0,-.221,.170));targets=np.array([(852,316),(968,252),(940,412),(902,327),(929,357)],float);pts=np.array([tuple(landmarks[k]) for k in ['iris_L','iris_R','chin','nose','mouth']]);pts[:,2]*=.82
def project(param):
 yaw,pitch,roll,scale,tx,ty=param;rot=np.array([[math.cos(roll),0,math.sin(roll)],[0,1,0],[-math.sin(roll),0,math.cos(roll)]]);p=pts@rot.T;right=np.array([math.cos(yaw),math.sin(yaw),0]);up=np.array([-math.sin(yaw)*math.sin(pitch),math.cos(yaw)*math.sin(pitch),math.cos(pitch)]);return np.stack([p@right*scale+tx,-p@up*scale+ty],-1)
a=np.array([math.radians(22),math.radians(3),math.radians(-22),370,940,410],float)
for i in range(35):
 residual=(project(a)-targets).ravel();J=np.zeros((len(residual),6));eps=[1e-4,1e-4,1e-4,.05,.05,.05]
 for k in range(6):b=a.copy();b[k]+=eps[k];J[:,k]=((project(b)-project(a))/eps[k]).ravel()
 step=np.linalg.lstsq(J.T@J+np.eye(6)*.002,J.T@residual,rcond=None)[0];step[:3]=np.clip(step[:3],-.08,.08);step[3:]=np.clip(step[3:],-20,20);a-=step;a[0]=np.clip(a[0],0,.9);a[1]=np.clip(a[1],-.25,.3);a[2]=np.clip(a[2],-.65,.65)
pose={'yaw':float(a[0]),'pitch':float(a[1]),'head_roll':float(a[2]),'scale':float(a[3]),'tx':float(a[4]),'ty':float(a[5]),'landmark_rms_pixels':float(np.sqrt(np.mean((project(a)-targets)**2))),'reference_landmarks':targets.tolist(),'fitted_landmarks':project(a).tolist()};(P/'reference-registration.json').write_text(json.dumps(pose,indent=2),encoding='utf8')
# No facial portrait is projected. New skin paint is vertex colour on the 3D surface.
def lin(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
def rgb(h):return tuple(lin(int(h[i:i+2],16)/255) for i in [0,2,4])
def material(name,h,shade=.12,vertex=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb(h),1);n=m.node_tree.nodes;n.clear();lk=m.node_tree.links;out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');color=n.new('ShaderNodeRGB');color.outputs[0].default_value=(*rgb(h),1);source=color.outputs[0]
 if vertex:color=n.new('ShaderNodeVertexColor');color.layer_name='V6Paint';source=color.outputs['Color']
 geom=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.4,-.7,.6);lk.new(geom.outputs['Normal'],dot.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=-.25;ramp.color_ramp.elements[0].color=(1-shade,1-shade*1.2,1-shade*.6,1);ramp.color_ramp.elements[1].position=.75;ramp.color_ramp.elements[1].color=(1,1,1,1);lk.new(dot.outputs['Value'],ramp.inputs[0]);mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;lk.new(source,mul.inputs[1]);lk.new(ramp.outputs[0],mul.inputs[2]);lk.new(mul.outputs[0],em.inputs[0]);lk.new(em.outputs[0],out.inputs[0]);return m
skinmat=material('V6 delicate peach - painted 3D surface','FFDEC9',.075,True);lipmat=material('V6 muted rose lip line','A8686C',.03);lidmat=material('V6 plum fine lashes','513744',.025);hairmat=material('V6 pearl directional paint','EEE9F0',.11,True);hairunder=material('V6 lavender underhair','DCD5E4',.09);finehair=material('V6 pearl silhouette fibers','E4DDE9',.07);softlip=material('V6 soft lip warmth','F1C3B4',.02)
for o in [skin,bpy.data.objects['Face V5 topology 8']]:
 attr=o.data.color_attributes.new(name='V6Paint',type='FLOAT_COLOR',domain='POINT')
 for v in o.data.vertices:
  x,y,z=v.co;col=np.array([1,.870,.788]);blush=.13*math.exp(-((abs(x)-.218)/.09)**2-((z-.26)/.09)**2);col=col*(1-blush)+np.array([1,.59,.57])*blush
  ear=.15 if o.name.endswith('8') else 0;col=col*(1-ear)+np.array([1,.75,.69])*ear;attr.data[v.index].color=(*[lin(float(c)) for c in col],1)
 o.data.materials.clear();o.data.materials.append(skinmat)
# Remove the oversized prepainted specular, replace iris with controlled violet paint.
for k in [6,9]:
 o=bpy.data.objects.get('Face V5 topology '+str(k))
 if o:bpy.data.objects.remove(o,do_unlink=True)
n=768;u,v=np.meshgrid(np.linspace(-1,1,n),np.linspace(-1,1,n));rr=np.sqrt(u*u+v*v);theta=np.arctan2(v,u);arr=np.ones((n,n,4));bottom=np.clip(-v,0,1);base=np.stack([.36+.28*bottom,.25+.22*bottom,.54+.28*bottom],-1);fib=(np.sin(theta*77+rr*16)+np.sin(theta*113-rr*9))*.018*np.clip(rr-.18,0,1);base+=fib[:,:,None];edge=np.clip((rr-.83)/.14,0,1);base*=1-edge[:,:,None]*.57;pupil=1/(1+np.exp(np.clip((np.sqrt((u/.22)**2+(v/.34)**2)-1)*34,-60,60)));base=base*(1-pupil[:,:,None]*.88)
for x,y,rx,ry in [(-.25,.47,.10,.12),(.29,-.38,.045,.06)]:
 g=np.exp(-(((u-x)/rx)**2+((v-y)/ry)**2)**3*2);base=base*(1-g[:,:,None])+.99*g[:,:,None]
arr[:,:,:3]=np.clip(base,0,1);arr[:,:,3]=np.clip((1-rr)*100,0,1);im=bpy.data.images.new('V6 violet iris hand paint',width=n,height=n,alpha=True);im.pixels.foreach_set(arr.astype(np.float32).ravel());im.filepath_raw=str(T/'iris-violet-v6.png');im.file_format='PNG';im.save();im.pack();m=bpy.data.materials.new('V6 violet iris restrained highlights');m.use_nodes=True;nd=m.node_tree.nodes;nd.clear();lk=m.node_tree.links;tx=nd.new('ShaderNodeTexImage');tx.image=im;em=nd.new('ShaderNodeEmission');out=nd.new('ShaderNodeOutputMaterial');trans=nd.new('ShaderNodeBsdfTransparent');mix=nd.new('ShaderNodeMixShader');lk.new(tx.outputs['Color'],em.inputs[0]);lk.new(tx.outputs['Alpha'],mix.inputs[0]);lk.new(trans.outputs[0],mix.inputs[1]);lk.new(em.outputs[0],mix.inputs[2]);lk.new(mix.outputs[0],out.inputs[0]);eyes.data.materials.clear();eyes.data.materials.append(m)
for sign in [-1,1]:
 co=[p.co for p in eyes.data.vertices if p.co.x*sign>0];xmin,xmax=min(p.x for p in co),max(p.x for p in co);zmin,zmax=min(p.z for p in co),max(p.z for p in co)
 for lp in eyes.data.loops:
  p=eyes.data.vertices[lp.vertex_index].co
  if p.x*sign>0:eyes.data.uv_layers.active.data[lp.index].uv=((p.x-xmin)/(xmax-xmin),(p.z-zmin)/(zmax-zmin))
# Soften the authored lash alpha and tint, without detaching it from lids.
for k in [2,3]:
 o=bpy.data.objects['Face V5 topology '+str(k)];m=o.data.materials[0].copy();m.name='V6 fine plum eye line '+str(k);o.data.materials[0]=m;nd=m.node_tree.nodes;lk=m.node_tree.links;tx=next(n for n in nd if n.type=='TEX_IMAGE');em=next(n for n in nd if n.type=='EMISSION');em.inputs[0].default_value=(*rgb('563947'),1)
 for link in list(em.inputs[0].links):lk.remove(link)
 for mix in [n for n in nd if n.type=='MIX_SHADER']:
  fade=nd.new('ShaderNodeMath');fade.operation='MULTIPLY';fade.inputs[1].default_value=.80;lk.new(tx.outputs['Alpha'],fade.inputs[0]);lk.new(fade.outputs[0],mix.inputs[0])
# Common native mesh/curve authoring helpers.
headparts=[]
def mesh(name,vs,fs,mat,colors=None,sub=1):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();d.materials.append(mat);o=bpy.data.objects.new(name,d);C.objects.link(o);o.parent=root
 for p in d.polygons:p.use_smooth=True
 if colors:
  at=d.color_attributes.new(name='V6Paint',type='FLOAT_COLOR',domain='POINT')
  for i,c in enumerate(colors):at.data[i].color=(*(rgb(c) if isinstance(c,str) else c),1)
 if sub:mod=o.modifiers.new('Editable flowing surface','SUBSURF');mod.levels=sub;mod.render_levels=sub
 headparts.append(o);return o
def tube(name,ps,r,mat):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=12;d.bevel_depth=r;d.bevel_resolution=2;sp=d.splines.new('BEZIER');sp.bezier_points.add(len(ps)-1)
 for i,(b,p) in enumerate(zip(sp.bezier_points,ps)):b.co=p;b.handle_left_type=b.handle_right_type='AUTO';b.radius=.10 if i==len(ps)-1 else .45 if i==0 else 1
 o=bpy.data.objects.new(name,d);C.objects.link(o);d.materials.append(mat);o.parent=root;headparts.append(o);return o
def surface_y(x,z):
 vs=np.array([tuple(v.co) for v in skin.data.vertices if v.co.y<-.08]);dist=(vs[:,0]-x)**2+(vs[:,2]-z)**2;ix=np.argsort(dist)[:5];w=1/(dist[ix]+.00004);return float(np.sum(vs[ix,1]*w)/w.sum())
# Delicate asymmetric closed smile follows actual lip volume; tiny nose reflection.
o=bpy.data.objects.get('Face V5 topology 0')
if o:bpy.data.objects.remove(o,do_unlink=True)
tube('V6 small gentle smile',[(x,surface_y(x,z)-.002,z) for x,z in [(-.045,.174),(-.018,.173),(.008,.179),(.034,.191),(.049,.202)]],.0019,lipmat)
tube('V6 lower lip soft accent',[(x,surface_y(x,z)-.002,z) for x,z in [(-.016,.163),(.008,.164),(.028,.178)]],.0009,softlip)
# Preserve only the inner scalp. Remove all V5 artificial straight clumps and atlas.
for o in list(C.objects):
 if o.name.startswith('Hair '):
  if 'recessed scalp' in o.name:o.name='V6 recessed scalp';o.data.materials.clear();o.data.materials.append(hairunder);headparts.append(o)
  else:bpy.data.objects.remove(o,do_unlink=True)
def cat(ps,t):
 ps=[Vector(p) for p in ps];u=t*(len(ps)-1);k=min(len(ps)-2,int(u));q=u-k;p0,p1,p2,p3=ps[max(0,k-1)],ps[k],ps[k+1],ps[min(len(ps)-1,k+2)];return .5*((2*p1)+(-p0+p2)*q+(2*p0-5*p1+4*p2-p3)*q*q+(-p0+3*p1-3*p2+p3)*q*q*q)
locks=[]
def lock(name,ps,widths,front=False,seed=0):
 vs=[];fs=[];colors=[];J=50;N=10
 for j in range(J+1):
  t=j/J;p=cat(ps,t);tan=(cat(ps,min(1,t+.004))-cat(ps,max(0,t-.004))).normalized();normal=Vector((0,-1,0)) if front else Vector((p.x,p.y-.035,.10)).normalized();across=tan.cross(normal).normalized();normal=across.cross(tan).normalized();w=float(np.interp(t,np.linspace(0,1,len(widths)),widths))
  for i in range(N):
   angle=i*math.tau/N;q=math.cos(angle);depth=math.sin(angle)*w*.105;vs.append(p+across*(q*w*(1+.025*math.sin(t*17+seed)))+normal*depth)
   shade=.90-.09*abs(q)**2+.055*math.exp(-((q+.18)/.31)**2)+.018*math.sin(q*17+seed)*math.sin(math.pi*t);base=np.array([shade+.030,shade+.015,shade+.048]);colors.append(tuple(lin(float(np.clip(c,0,1))) for c in base))
 for j in range(J):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
 fs.extend([tuple(reversed(range(N))),tuple(J*N+i for i in range(N))]);o=mesh(name,vs,fs,hairmat,colors);locks.append({'name':name,'path':ps,'half_width':widths})
 # Fine integral surface filaments follow the actual strand flow in three dimensions.
 for lane in [-.42,.26]:
  points=[]
  for t in np.linspace(.12,.97,16):
   p=cat(ps,float(t));tan=(cat(ps,min(1,t+.004))-cat(ps,max(0,t-.004))).normalized();nn=Vector((0,-1,0)) if front else Vector((p.x,p.y-.035,.10)).normalized();across=tan.cross(nn).normalized();normal=across.cross(tan).normalized();w=float(np.interp(t,np.linspace(0,1,len(widths)),widths));points.append(p+across*w*lane+normal*(w*.109))
  tube(name+' fine flow '+str(lane),points,.00065,finehair)
 return o
# Five distinct large fringe flows; varied C/S tips avoid the old stair-step comb.
frontspec=[
 ([(.10,.005,1.060),(.00,-.24,.98),(-.19,-.32,.77),(-.36,-.32,.51),(-.43,-.27,.34),(-.37,-.27,.27)],[.018,.078,.092,.070,.035,.0006]),
 ([(.12,.015,1.075),(.06,-.25,1.01),(-.08,-.34,.83),(-.24,-.36,.62),(-.32,-.31,.45),(-.34,-.26,.39)],[.016,.062,.080,.060,.030,.0005]),
 ([(.14,.020,1.07),(.10,-.26,1.00),(.01,-.34,.82),(-.12,-.36,.64),(-.22,-.34,.50),(-.25,-.31,.44)],[.014,.052,.067,.052,.025,.0005]),
 ([(.15,.025,1.07),(.14,-.24,.99),(.095,-.32,.83),(.027,-.35,.66),(-.075,-.35,.55),(-.10,-.33,.49)],[.010,.047,.062,.048,.022,.0004]),
 ([(.15,.03,1.07),(.20,-.22,.98),(.22,-.31,.81),(.23,-.32,.67),(.29,-.27,.56),(.32,-.20,.51)],[.013,.050,.065,.053,.025,.0006])]
frontspec.extend([
 ([(.15,.025,1.07),(.24,-.23,.98),(.30,-.32,.82),(.34,-.31,.67),(.36,-.23,.55),(.32,-.15,.48)],[.014,.060,.080,.068,.034,.0006]),
 ([(.16,.03,1.07),(.30,-.20,.96),(.37,-.27,.80),(.40,-.24,.64),(.40,-.13,.51),(.37,-.025,.44)],[.012,.054,.070,.053,.028,.0005])])
for k,(ps,w) in enumerate(frontspec):lock('V6 swept fringe '+str(k),ps,w,True,k)
# Parted temple hair turns behind the visible ear, then curls below it.
for sign in [-1,1]:
 for k in range(3):
  q=k/2;ps=[(sign*(.13+.03*q),.05+.02*q,1.06),(sign*(.32+.02*q),-.13+.07*q,.94),(sign*(.43+.01*q),-.18+.13*q,.72),(sign*(.49+.025*q),-.10+.14*q,.43),(sign*(.50+.02*q),-.12+.15*q,.23),(sign*(.41+.03*q),-.20+.14*q,.17)]
  if sign>0:ps[3]=(.45+.025*q,.11+.02*q,.43);ps[4]=(.49+.02*q,.095+.04*q,.22);ps[5]=(.40+.03*q,-.035+.07*q,.15)
  lock('V6 curved temple '+str(sign)+' '+str(k),ps,[.017,.063,.077,.073,.046,.0006],True,10+k+(0 if sign<0 else 3))
# Airy, uneven lower bob, sweeping outward and then back inward.
for k,deg in enumerate([72,96,120,144,168,192,216,240,264,288]):
 a=math.radians(deg);wave=.025*math.sin(k*1.7);radial=lambda rr,yy,z:(math.sin(a)*rr,yy-math.cos(a)*rr*.76,z)
 ps=[radial(.15,.045,1.055),radial(.34,.045,.93),radial(.45,.04,.64),radial(.49+wave,.035,.36),radial(.53+wave,.02,.19),radial(.43+wave,-.015,.13+.035*math.sin(k*1.3))]
 if 0<deg<115:ps[3]=radial(.45,.15,.40);ps[4]=radial(.51,.15,.20)
 lock('V6 outward bob '+str(k),ps,[.017,.073,.095,.085,.050,.0006],False,20+k)
# Sparse independent silhouette curls, rather than parallel straight antennae.
for sign in [-1,1]:
 for k in range(4):
  q=k/3;ps=[(sign*.18,-.07,1.045),(sign*(.37+.025*q),-.22,.88-.03*q),(sign*(.51+.035*q),-.20,.59-.05*q),(sign*(.56+.02*q),-.18,.31-.04*q),(sign*(.49+.02*q),-.26,.24-.04*q)]
  tube('V6 silhouette curl '+str(sign)+' '+str(k),ps,.0010+.00025*(k%2),finehair)
(P/'hair-authoring-v6.json').write_text(json.dumps(locks,indent=2),encoding='utf8')
# Pose control exists only for matched art review; neutral source is kept upright.
head=bpy.data.objects.new('V6 HEAD POSE - art comparison only',None);C.objects.link(head);head.parent=root
for o in list(C.objects):
 if o!=head and (o.name.startswith(('Face V5','V6 swept','V6 curved','V6 outward','V6 silhouette','V6 recessed','V6 small','V6 lower','Ear '))):o.parent=head
root['approved_reference']='../blender-v5/approved-concept.png';root['scope']='Face and rebuilt bob revision; game integration forbidden';root['face_basis']='pixiv Sendagaya Shino CC0, modified';head.rotation_euler=(0,0,0);head.scale.z=.82
for o in C.objects:
 if o.type in ['MESH','CURVE']:
  for material in o.data.materials:
   if material and material.use_nodes and any(n.type=='BSDF_TRANSPARENT' for n in material.node_tree.nodes):material.surface_render_method='BLENDED'
for o in bpy.data.objects:
 if o.type=='MESH' and o.name=='Studio floor':o.hide_render=True
s=bpy.context.scene;cam=s.camera;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=24;s.render.resolution_x=s.render.resolution_y=800;cam.data.ortho_scale=1.40;cam.location=(2.3,-6,.73);cam.rotation_euler=(Vector((0,-.025,.535))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/'neutral-b.png');bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v6-head.blend'));bpy.ops.render.render(write_still=True)
# Fit only pose/camera to the five measured landmarks, retaining neutral validation views.
head.rotation_euler.y=pose['head_roll'];yaw,pitch=pose['yaw'],pose['pitch'];cam.location=(6*math.sin(yaw)*math.cos(pitch),-6*math.cos(yaw)*math.cos(pitch),6*math.sin(pitch));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));centerx=(640+1250)/2;centery=525/2;cam.location+=right*((centerx-pose['tx'])/pose['scale'])+up*((pose['ty']-centery)/pose['scale']);cam.data.ortho_scale=610/pose['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-pose-b.png');bpy.ops.render.render(write_still=True)
print('V6_NATIVE_REVISION_SAVED',len(locks),'locks; pose RMS',pose['landmark_rms_pixels'],flush=True)
