"""V5 head/hair native Blender authoring. Independent of game assets and V4."""
import bpy, math, sys, json, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt
R=Path(sys.argv[sys.argv.index('--')+1]); P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v5';T=P/'textures';V=P/'review'
for p in [P,T,V]:p.mkdir(exist_ok=True)
if (P/'heroine-v5-head-blockout.blend').exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Saved V5 exists; read/export saved source or explicitly --replace-candidate')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials):bpy.data.materials.remove(data)
C=bpy.data.collections.new('V5 EDITABLE - face hair and costume bust');bpy.context.scene.collection.children.link(C)
parts=[]
def lin(x):return x/12.92 if x<.04045 else ((x+.055)/1.055)**2.4
def rgb(h):return tuple(lin(int(h[i:i+2],16)/255) for i in [0,2,4])
def paint(name,array):
 h,w,_=array.shape;im=bpy.data.images.new(name,width=w,height=h,alpha=True);im.pixels.foreach_set(np.clip(array,0,1).astype(np.float32).ravel());im.filepath_raw=str(T/(name+'.png'));im.file_format='PNG';im.save();im.pack();return im
# Authored UV paint, not projected illustration: skin colour and radial iris detail.
w=h=1024;u,v=np.meshgrid(np.linspace(0,1,w),np.linspace(0,1,h));a=np.ones((h,w,4));a[:,:,:3]=np.array([1,.873,.812]);
for ux in [.25-.110,.25+.110]:
 g=np.exp(-((u-ux)/.064)**2-((v-.33)/.095)**2);a[:,:,:3]=a[:,:,:3]*(1-g[:,:,None]*.105)+np.array([1,.40,.40])*g[:,:,None]*.105
warm=np.exp(-((u-.25)/.025)**2-((v-.27)/.035)**2);a[:,:,:3]=a[:,:,:3]*(1-warm[:,:,None]*.07)+np.array([1,.55,.46])*warm[:,:,None]*.07
skinpaint=paint('V5_skin_paint',a)
n=768;u,v=np.meshgrid(np.linspace(-1,1,n),np.linspace(-1,1,n));r=np.sqrt(u*u+v*v);ang=np.arctan2(v,u);a=np.ones((n,n,4));base=np.stack([.44+.23*(1-r),.31+.15*(1-r),.63+.21*(1-r)],-1);fib=(.5+.5*np.sin(ang*84+r*16))*.045*np.clip(r-.3,0,1);base+=fib[:,:,None]
ring=np.clip((r-.80)/.15,0,1);base=base*(1-ring[:,:,None]*.48);pupil=1/(1+np.exp(np.clip((np.sqrt((u/.23)**2+(v/.35)**2)-1)*28,-50,50)));base=base*(1-pupil[:,:,None]*.89);shade=np.clip((v+.20)*.36,0,.4);base*=1-shade[:,:,None]
glow=np.exp(-((r-.64)/.18)**2)*np.clip(-v,0,1);base+=glow[:,:,None]*np.array([.11,.10,.18])
for cx,cy,rx,ry in [(-.32,.43,.13,.14),(.36,-.41,.060,.070),(-.08,-.63,.12,.035)]:
 g=np.exp(-(((u-cx)/rx)**2+((v-cy)/ry)**2)**3*2);base=base*(1-g[:,:,None]*.98)+np.array([1,.97,1])*g[:,:,None]*.98
a[:,:,:3]=base;irispaint=paint('V5_violet_iris_paint',a)
u,v=np.meshgrid(np.linspace(0,1,256),np.linspace(0,1,1024));a=np.ones((1024,256,4));edge=np.abs(u-.5)*2;root=(1-v)**.4;strand=(np.sin(u*70+v*5)+np.sin(u*139-v*8))*.003;light=.91-.14*edge**2+.06*np.exp(-((v-.63)/.13)**2)-.06*v**4+strand
a[:,:,:3]=np.stack([light+.020,light+.009,light+.037],-1);hairpaint=paint('V5_pearl_lock_paint',a)
def mat(name,h,tex=None,shade=.12):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*rgb(h),1);nd=m.node_tree.nodes;nd.clear();lk=m.node_tree.links
 out=nd.new('ShaderNodeOutputMaterial');em=nd.new('ShaderNodeEmission');em.inputs['Color'].default_value=(*rgb(h),1)
 color=nd.new('ShaderNodeRGB');color.outputs[0].default_value=(*rgb(h),1);cs=color.outputs[0]
 if tex:
  tx=nd.new('ShaderNodeTexImage');tx.image=tex;cs=tx.outputs['Color']
 geom=nd.new('ShaderNodeNewGeometry');dot=nd.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.45,-.65,.65);lk.new(geom.outputs['Normal'],dot.inputs[0]);ramp=nd.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=-.3;ramp.color_ramp.elements[0].color=(1-shade,1-shade*1.18,1-shade*.55,1);ramp.color_ramp.elements[1].position=.75;ramp.color_ramp.elements[1].color=(1,1,1,1);lk.new(dot.outputs['Value'],ramp.inputs[0]);mix=nd.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;lk.new(cs,mix.inputs[1]);lk.new(ramp.outputs[0],mix.inputs[2]);lk.new(mix.outputs[0],em.inputs[0]);lk.new(em.outputs[0],out.inputs[0]);return m
skin=mat('V5 warm sculpted skin','F9DDCD',skinpaint,.12);skinplain=mat('V5 skin details','F9DDCD',shade=.12);white=mat('V5 ivory sclera','FFF7F0',shade=.04);iris=mat('V5 violet iris','B399DD',irispaint,.015);lash=mat('V5 plum lashes','4A344B',shade=.025);brow=mat('V5 taupe brows','A28D98',shade=.03);lip=mat('V5 muted rose smile','BC7E81',shade=.02);lipsoft=mat('V5 lip warmth','EDBBB1',shade=.03);crease=mat('V5 lid warmth','C5999A',shade=.04);hair=mat('V5 pearl swept locks','EAE6ED',hairpaint,.22);under=mat('V5 cool lavender underhair','B7B1C4',shade=.13);fine=mat('V5 pearl strands','EAE4EB',shade=.10);ivory=mat('V5 high collar ivory','F7EADB',shade=.12);blue=mat('V5 periwinkle shawl','8FA5C6',shade=.19);navy=mat('V5 navy accent','344A70',shade=.12);silver=mat('V5 soft silver embroidery','D8D8DE',shade=.15);gem=mat('V5 sapphire brooch','7891B9',shade=.14)
def mesh(name,verts,faces,material,uv=None,sub=0):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);C.objects.link(o);d.materials.append(material)
 for p in d.polygons:p.use_smooth=True
 if uv:
  l=d.uv_layers.new(name='PaintUV')
  for lp in d.loops:l.data[lp.index].uv=uv[lp.vertex_index]
 if sub:
  m=o.modifiers.new('Editable smooth surface','SUBSURF');m.levels=sub;m.render_levels=sub
 parts.append(o);return o
def tube(name,ps,radius,material,cyclic=False):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.resolution_u=10;d.bevel_depth=radius;d.bevel_resolution=3;s=d.splines.new('BEZIER');s.bezier_points.add(len(ps)-1);s.use_cyclic_u=cyclic
 for b,p in zip(s.bezier_points,ps):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,d);C.objects.link(o);d.materials.append(material);parts.append(o);return o
def sphere(name,pos,scale,material):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for c in list(o.users_collection):c.objects.unlink(o)
 C.objects.link(o);o.data.materials.append(material)
 for p in o.data.polygons:p.use_smooth=True
 parts.append(o);return o
def cat(ps,t):
 ps=[Vector(p) for p in ps];u=t*(len(ps)-1);k=min(len(ps)-2,int(u));q=u-k;a,b,c,d=ps[max(0,k-1)],ps[k],ps[k+1],ps[min(len(ps)-1,k+2)];return .5*((2*b)+(-a+c)*q+(2*a-5*b+4*c-d)*q*q+(-a+3*b-3*c+d)*q*q*q)
# Subdivision-ready continuous cranial/jaw volume, custom front surface sculpt.
profile=np.array([(0,.020,.038),(.035,.084,.079),(.09,.158,.122),(.18,.225,.162),(.28,.285,.194),(.40,.322,.213),(.52,.332,.215),(.65,.322,.222),(.78,.303,.234),(.90,.260,.218),(1.00,.152,.145),(1.035,.010,.012)])
slopes=np.gradient(profile[:,1:],profile[:,0],axis=0)
def rad(z):
 t=np.clip(z,0,1.035);i=min(len(profile)-2,max(0,int(np.searchsorted(profile[:,0],t)-1)));d=profile[i+1,0]-profile[i,0];q=(t-profile[i,0])/d
 return (2*q**3-3*q*q+1)*profile[i,1:]+(q**3-2*q*q+q)*d*slopes[i]+(-2*q**3+3*q*q)*profile[i+1,1:]+(q**3-q*q)*d*slopes[i+1]

def head_center_y(z):return -.010-.110*math.exp(-((z-.015)/.19)**2)
def fy(x,z):
 rx,ry=rad(z);f=max(0,1-(x/max(.001,rx))**2);y=head_center_y(z)-ry*f**.50
 nose=.047*math.exp(-(x/.036)**2-((z-.29)/.042)**2)+.020*math.exp(-(x/.026)**2-((z-.37)/.10)**2)
 muzzle=.014*math.exp(-(x/.085)**2-((z-.145)/.058)**2);sockets=.018*math.exp(-((abs(x)-.164)/.102)**4-((z-.456)/.080)**4);cheek=.012*math.exp(-((abs(x)-.23)/.075)**2-((z-.31)/.09)**2)
 return y-nose-muzzle+ sockets-cheek
# Constraint triangulation gives exact eyelid borders without slow solid CSG.
def eye(sign,t,upper):
 x=sign*(.064+.188*t);z=.426+.037*t+(.048*(.75+.40*t) if upper else -.032)*math.sin(math.pi*t)**.82;return x,z
def eye_inside(x,z):
 t=(abs(x)-.064)/.188
 if not 0<t<1:return False
 return eye(1,t,False)[1]+1e-6<z<eye(1,t,True)[1]-1e-6
points=[];edges=[]
for j in range(109):
 z=j/108*1.035;rx,_=rad(z)
 for i in range(73):
  x=rx*(i/36-1)
  if not eye_inside(x,z):points.append(Vector((x,z)))
# Constrain the cheek/jaw outline as well, avoiding convex-hull saw teeth.
outline=[(-rad(z)[0],z) for z in np.linspace(0,1.035,109)]+[(rad(z)[0],z) for z in np.linspace(1.035,0,109)]
start=len(points);points.extend(Vector(p) for p in outline);edges.extend((start+i,start+(i+1)%len(outline)) for i in range(len(outline)))
for sign in [-1,1]:
 boundary=[eye(sign,t,True) for t in np.linspace(0,1,49)]+[eye(sign,t,False) for t in np.linspace(1,0,49)[1:-1]];start=len(points);points.extend(Vector((x,z)) for x,z in boundary);edges.extend((start+i,start+(i+1)%len(boundary)) for i in range(len(boundary)))
coords,_,triangles,*_=delaunay_2d_cdt(points,edges,[],0,1e-7)
vs=[(p.x,fy(p.x,p.y),p.y) for p in coords];uv=[(.25+math.asin(np.clip(x/max(.0001,rad(z)[0]),-1,1))/math.tau,z/1.035) for x,y,z in vs];fs=[]
for f in triangles:
 x=sum(coords[i].x for i in f)/len(f);z=sum(coords[i].y for i in f)/len(f)
 if not eye_inside(x,z) and abs(x)<=rad(z)[0]+1e-5:fs.append(tuple(f))
# Back skull shares the silhouette; weld its seam to the custom front.
N=72;J=108;start=len(vs)
for j in range(J+1):
 z=j/J*1.035;rx,ry=rad(z)
 for i in range(N+1):
  a=i/N*math.pi;x=rx*math.cos(a);y=head_center_y(z)+ry*math.sin(a);vs.append((x,y,z));uv.append((.5+i/N*.5,z/1.035))
for j in range(J):
 for i in range(N):a=start+j*(N+1)+i;fs.append((a,a+1,a+N+2,a+N+1))
face=mesh('Face - sculpted cheeks nose jaw and real eye openings',vs,fs,skin,uv)
import bmesh
bm=bmesh.new();bm.from_mesh(face.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00005);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(face.data);bm.free()
for sign,label in [(-1,'L'),(1,'R')]:
 boundary=[eye(sign,t,True) for t in np.linspace(0,1,49)]+[eye(sign,t,False) for t in np.linspace(1,0,49)[1:-1]];nv=len(boundary)
 # Convex eyeball surface behind lids; eyelid and eyeball are different geometry.
 center=Vector((sign*.158,fy(sign*.158,.456)-.018,.452));vv=[tuple(center)];uv=[(.5,.5)]
 for i,(x,z) in enumerate(boundary):
  vv.append((x,fy(x,z)-.001,z));uv.append(((x-sign*.055)/(sign*.222),(z-.38)/.14))
 eyeball=mesh('Eye '+label+' - convex almond sclera',vv,[(0,i+1,(i+1)%nv+1) for i in range(nv)],white,uv,1)
 # Iris disk conforms to convex eyeball rather than sitting on a flat face decal.
 rr=.043;cx=sign*.153;cz=.453;vv=[];uv=[];fs=[];rings=10;seg=72
 for j in range(rings+1):
  q=max(.0001,j/rings)
  for i in range(seg):
   a=i*math.tau/seg;x=cx+rr*q*math.cos(a);z=cz+rr*q*1.12*math.sin(a);bulge=.018*(1-((x-sign*.158)/.123)**2-((z-.452)/.090)**2);y=fy(x,z)-max(0,bulge)-.005;vv.append((x,y,z));uv.append(((1+q*math.cos(a))/2,(1+q*math.sin(a))/2))
 for j in range(rings):
  for i in range(seg):a=j*seg+i;b=j*seg+(i+1)%seg;fs.append((a,b,b+seg,a+seg))
 mesh('Eye '+label+' - painted curved violet iris',vv,fs,iris,uv)
 # Tapered 3D lid rims and expressive outer lash wings.
 for upper in [True,False]:
  ps=[]
  for t in np.linspace(0,1,33):x,z=eye(sign,t,upper);ps.append((x,fy(x,z)-.004,z))
  tube('Eye '+label+(' upper lid rim' if upper else ' lower lid rim'),ps,.005 if upper else .0035,skinplain)
  if upper:
   vv=[]
   for t in np.linspace(0,1,41):
    x,z=eye(sign,t,True);width=.0015+.009*math.sin(math.pi*t)**.6+.002*t;vv.extend([(x,fy(x,z)-.008,z),(x,fy(x,z+width)-.008,z+width)])
   mesh('Eye '+label+' tapered upper lash',vv,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(40)],lash,sub=1)
  else:tube('Eye '+label+' lower line',ps[12:29],.0011,crease)
 x,z=eye(sign,1,True);tube('Eye '+label+' fine lash tip',[(x-sign*.02,fy(x-sign*.02,z+.015)-.009,z+.015),(x+sign*.023,fy(x,z)-.007,z+.021)],.0024,lash)
 for t in [.80,.90]:
  x,z=eye(sign,t,True);tube('Eye '+label+' lash accent',[(x,fy(x,z)-.010,z+.004),(x+sign*.013,fy(x,z)-.012,z+.022)],.0018,lash)
 ps=[]
 for t in np.linspace(.08,.94,16):x,z=eye(sign,t,True);ps.append((x,fy(x,z+.022)-.002,z+.022))
 tube('Eye '+label+' eyelid fold',ps,.0016,crease)
 ps=[]
 for t in np.linspace(0,1,13):x=sign*(.070+.203*t);z=.562+.022*math.sin(math.pi*t)-.011*t;ps.append((x,fy(x,z)-.003,z))
 tube('Eye '+label+' soft brow',ps,.0035,brow)
# Small nose-tip colour is on the actual sculpted surface, never a camera plane.
nose_light=mat('V5 warm nose highlight','FFF0DD',shade=.04);nv=[(-.007,fy(-.007,.304)-.001,.304)];nf=[]
for i in range(20):
 a=i*math.tau/20;x=-.008+math.cos(a)*.009;z=.304+math.sin(a)*.012;nv.append((x,fy(x,z)-.001,z))
mesh('Nose subtle reflected light',nv,[(0,i+1,(i+1)%20+1) for i in range(20)],nose_light)
# Tiny real lips and subtle nostril marks on the sculpted nose tip.
tube('Small smile lip line',[(x,fy(x,z)-.002,z) for x,z in [(-.044,.163),(-.022,.157),(.004,.159),(.029,.168),(.044,.178)]],.0019,lip)
tube('Lower lip reflected warmth',[(x,fy(x,z)-.003,z) for x,z in [(-.016,.148),(.003,.146),(.023,.156)]],.0011,lipsoft)
for sign in [-1,1]:
 tube('Subtle nose wing',[(sign*.018,fy(sign*.018,.273)-.001,.273),(sign*.026,fy(sign*.026,.279)-.001,.279)],.0011,lipsoft)
 ear=sphere('Ear '+str(sign)+' external volume',(sign*.333,.005,.326),(.044,.028,.080),skinplain)
 tube('Ear '+str(sign)+' helix',[(sign*.340,-.024,.375),(sign*.358,-.023,.378),(sign*.367,-.026,.330),(sign*.347,-.029,.280)],.006,skinplain)
 tube('Ear '+str(sign)+' inner cartilage',[(sign*.345,-.029,.354),(sign*.354,-.030,.337),(sign*.345,-.031,.308)],.0035,crease)
 tube('Ear '+str(sign)+' fine earring',[(sign*.350,-.020,.267),(sign*.362,-.025,.199),(sign*.350,-.027,.177)],.0018,silver)
 sphere('Ear '+str(sign)+' pearl drop',(sign*.350,-.027,.165),(.008,.008,.018),silver)
# Neck is actual volume, not a face billboard pedestal.
vs=[];fs=[]
for j,(z,rx,ry) in enumerate([(-.43,.105,.091),(-.25,.086,.083),(-.08,.080,.075),(.065,.094,.079)]):
 for i in range(48):a=i*math.tau/48;vs.append((rx*math.cos(a),.034+ry*math.sin(a),z))
for j in range(3):
 for i in range(48):a=j*48+i;b=j*48+(i+1)%48;fs.append((a,b,b+48,a+48))
mesh('Neck - connected under jaw',vs,fs,skinplain,sub=2)
# Hair cap, cropped in front to expose forehead, no single helmet on outer silhouette.
vs=[];uv=[];fs=[];N=112;J=36
for j in range(J+1):
 t=(j+.02)/(J+.02)
 for i in range(N):
  a=i*math.tau/N;front=max(0,-math.sin(a));cut=np.clip((front-.35)/.60,0,1);cut=cut*cut*(3-2*cut);maximum=2.54-1.16*cut
  transition=np.clip((math.sin(a)-.35)/.30,0,1);transition=transition*transition*(3-2*transition);limit=math.acos((.565+.020*max(0,math.cos(a))-.537)/.535);maximum=min(maximum,limit+(2.54-limit)*transition);theta=t*maximum
  z=.537+.535*math.cos(theta);rx,ry=rad(min(1.035,z));crown=math.sin(min(math.pi/2,theta)*.95)
  rx=rx+.035*crown;ry=ry+.055*crown
  rx-=.065*math.exp(-((z-.34)/.14)**2)*max(0,math.cos(a))**8
  vs.append((rx*math.cos(a),head_center_y(z)-.012+ry*math.sin(a),z));uv.append((i/N,1-t))

for j in range(J):
 for i in range(N):
  a=j*N+i;b=j*N+(i+1)%N;fs.append((a,a+N,b+N,b))
mesh('Hair - recessed scalp and underbob',vs,fs,hair,uv,1)
# Flowing tapered solid locks. Cross sections use actual radial scalp normals.
lockspec=[]
hairline=mat('V5 soft lock striation','C7C2D1',shade=.06)
def lock(name,ps,widths,thickness=.18,front=False):
 vs=[];uv=[];fs=[];J=48;N=12
 for j in range(J+1):
  t=j/J;p=cat(ps,t);tan=(cat(ps,min(1,t+.005))-cat(ps,max(0,t-.005))).normalized();out=Vector((0,-1,0)) if front else Vector((p.x,p.y-.04,.10)).normalized();across=tan.cross(out).normalized();normal=across.cross(tan).normalized();w=float(np.interp(t,np.linspace(0,1,len(widths)),widths))
  for i in range(N):
   a=i*math.tau/N;q=math.cos(a);co=p+across*(q*w)+normal*(math.sin(a)*w*thickness);vs.append(co);uv.append(((1+q)/2,1-t))
 for j in range(J):
  for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
 fs.extend([tuple(reversed(range(N))),tuple(J*N+i for i in range(N))]);o=mesh(name,vs,fs,hair,uv,1);lockspec.append({'name':name,'path':[list(p) for p in ps],'half_widths':widths})
 if front and 'fringe swept' in name:
  for offset in [-.28,.30]:
   line=[]
   for tt in np.linspace(.20,.91,20):
    pp=cat(ps,float(tt));tangent=(cat(ps,min(1,tt+.005))-cat(ps,max(0,tt-.005))).normalized();across=tangent.cross(Vector((0,-1,0))).normalized();ww=float(np.interp(tt,np.linspace(0,1,len(widths)),widths));pp+=across*ww*offset+Vector((0,-ww*thickness-.0006,0));line.append(pp)
   strand=tube(name+' curved fine strand',line,.00065,hairline)
   for j,b in enumerate(strand.data.splines[0].bezier_points):b.radius=.1 if j in [0,len(line)-1] else .8
 return o
# Asymmetrical part swept across forehead, separate fine tips instead of one slab.
for k in range(6):
 q=k/5;tips=[(-.337,.36),(-.290,.405),(-.221,.435),(-.139,.485),(-.048,.555),(.056,.632)];tx,tz=tips[k]
 ps=[(.115+.016*q,-.008+.032*q,1.069),(.070+.030*q,-.223-.012*q,1.000-.012*q),(-.024+.085*q,-.301-.006*q,.831-.025*q),(tx*.62,-.324+.014*q,(tz+.831)/2),(tx,-.294-.025*q,tz)]
 lock('Hair fringe swept '+str(k),ps,[.016,.053,.060,.046,.0008],.13,True)
# Small reverse sweep exposes the part and visible right eyebrow/temple.
for k in range(3):
 q=k/2
 ps=[(.127+.025*q,.006+.034*q,1.064),(.241+.032*q,-.154+.020*q,.975),(.306+.030*q,-.241+.020*q,.795),(.320+.018*q,-.225+.030*q,.682),(.299+.035*q,-.195+.060*q,.560-.025*q)]
 lock('Hair part right sweep '+str(k),ps,[.016,.040,.044,.030,.0015],.16,True)
# A divided small forehead sweep overlaps the foundation and breaks its lower edge.
lock('Hair central right S fringe',[(.12,-.020,1.070),(.145,-.245,.969),(.152,-.299,.820),(.166,-.316,.675),(.223,-.295,.539)],[.014,.046,.065,.055,.0008],.13,True)
lock('Hair inner part fine split',[(.12,-.02,1.070),(.124,-.258,.952),(.095,-.313,.779),(.068,-.327,.657),(.055,-.315,.585)],[.010,.030,.040,.030,.0006],.12,True)
# Main bob: scalp-rooted, overlapping and curved inward at tips.
for k,deg in enumerate(list(range(64,181,17))+list(range(196,297,17))):
 a=math.radians(deg);sx=math.sin(a);cy=math.cos(a);variation=.026*math.sin(k*1.7);tip=.074+.033*math.sin(k*1.32)
 ps=[(.14*sx,.04-.10*cy,1.044),(.332*sx,.04-.262*cy,.892),(.408*sx,.05-.318*cy,.614),((.414+variation)*sx,.05-.319*cy,.327),((.382+.022*math.sin(k*2.1))*sx+.015*math.sin(k),.045-.276*cy,tip)]
 if sx>.85 and cy>0:ps[3]=(.340,.085,.327);ps[4]=(.365,.11,tip)
 lock('Hair bob volume lock %02d'%k,ps,[.020,.075,.100,.085,.035,.0015],.19)
# External accent clumps for wispy asymmetric cheeks, ends lift away from neck.
for sign in [-1,1]:
 for k in range(2):
  q=k
  ps=[(sign*(.20+.03*q),-.075+.05*q,1.015),(sign*(.350+.02*q),-.200+.06*q,.808),(sign*(.402+.025*q),-.201+.075*q,.452),(sign*(.413+.031*q),-.151+.070*q,.243),(sign*(.345+.016*q),-.195+.05*q,.152+.038*q)]
  if sign>0:ps[3]=(.352,.055,.330+.01*q);ps[4]=(.350,.105,.175+.025*q)
  lock('Hair face framing '+str(sign)+' '+str(k),ps,[.013,.035,.046,.032,.0008],.16,True)
# Fine flyaways are 3D curves anchored in the same scalp. Deliberately few.
for sign in [-1,1]:
 for k in range(2):
  q=k
  ps=[(sign*(.14+.04*q),-.045,1.06),(sign*(.32+.02*q),-.18,.95-.03*q),(sign*(.43+.035*q),-.20,.71-.04*q),(sign*(.46+.025*q),-.19,.51-.03*q),(sign*(.405+.025*q),-.24,.44-.06*q)]
  o=tube('Hair fine silhouette wisp '+str(sign)+' '+str(k),ps,.0012+.00025*(k%2),fine)
  for j,b in enumerate(o.data.splines[0].bezier_points):b.radius=.12 if j==len(ps)-1 else .6 if j==0 else 1
tube('Hair crown part wisp',[(.09,.01,1.066),(.13,.01,1.095),(.22,.01,1.096),(.27,.02,1.074)],.0025,fine)
costume_start=len(parts)
# Thin costume bust supports identity, without reusing the old oversized shoulders.
vs=[];fs=[];N=96
for j,(z,rx,ry) in enumerate([(-.73,.36,.18),(-.61,.41,.19),(-.47,.34,.16),(-.30,.17,.11),(-.23,.105,.094)]):
 for i in range(N):a=i*math.tau/N;vs.append((rx*math.cos(a),.034+ry*math.sin(a),z))
for j in range(4):
 for i in range(N):a=j*N+i;b=j*N+(i+1)%N;fs.append((a,b,b+N,a+N))
mesh('Ivory blouse - cropped bust',vs,fs,ivory,sub=2)
vs=[];fs=[]
for j,z in enumerate([-.30,-.255,-.205]):
 for i in range(96):a=i*math.tau/96;wave=.009*math.sin(a*18)*(j/2)**3;vs.append(((.104+wave)*math.cos(a),.034+(.096+wave)*math.sin(a),z+.004*math.cos(a*18)))
for j in range(2):
 for i in range(96):a=j*96+i;b=j*96+(i+1)%96;fs.append((a,b,b+96,a+96))
mesh('Ivory standing ruffle collar',vs,fs,ivory,sub=1)
vs=[];fs=[];N=120
for j in range(11):
 t=j/10;rx=.126+t*.414;ry=.109+t*.133
 for i in range(N):
  a=i*math.tau/N;front=-math.sin(a);openfront=.085*math.exp(-((a-1.5*math.pi)/.24)**2);z=-.285-t*.305+.015*math.sin(a*7)*t*t;vs.append(((rx+openfront)*math.cos(a),.035+ry*math.sin(a),z))
for j in range(10):
 for i in range(N):
  a=j*N+i;b=j*N+(i+1)%N
  # Narrow front slit exposes the ivory collar instead of a sealed cylinder.
  if abs((i/N*math.tau-1.5*math.pi))>.17:fs.append((a,b,b+N,a+N))
mesh('Periwinkle cape - thin tailored cloth',vs,fs,blue,sub=1)
# Silver seam and restrained stems stay physically on the cape surface.
ps=[]
for a in np.linspace(1.5*math.pi+.19,3.5*math.pi-.19,180):ps.append((.540*math.cos(a),.035+.242*math.sin(a),-.587+.015*math.sin(a*7)))
tube('Cape silver edge',ps,.0028,silver)
for sign in [-1,1]:
 for k in range(4):
  x=sign*(.23+.045*k);y=-.157+.027*k;z=-.51-.012*k
  tube('Cape embroidery stem',[(x-sign*.018,y,z-.026),(x,y-.003,z),(x+sign*.009,y,z+.032)],.0018,silver)
  for j in range(2):
   xx=x+sign*.003*j;zz=z+.010*j;tube('Cape embroidery leaf',[(xx,y-.004,zz),(xx+sign*.016,y-.006,zz+.009),(xx+sign*.012,y-.005,zz-.004)],.0015,silver)
# Small flower clasp.
center=Vector((0,-.116,-.294))
for k in range(5):
 a=k*math.tau/5;ray=Vector((math.cos(a),0,math.sin(a)));side=Vector((-math.sin(a),0,math.cos(a)));vs=[]
 for j in range(15):
  t=j/14;p=center+ray*(.011+.040*t);w=.011*math.sin(math.pi*t)**.7;vs.extend([p+side*w+Vector((0,-.004*math.sin(math.pi*t),0)),p-side*w+Vector((0,-.004*math.sin(math.pi*t),0))])
 mesh('Clasp silver flower petal '+str(k),vs,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(14)],silver,sub=1)
sphere('Clasp blue cabochon',(0,-.130,-.294),(.017,.010,.024),gem)
for o in parts[costume_start:]:o.location.z+=.10
# Named pose-neutral root, all parts remain individually editable.
root=bpy.data.objects.new('V5 HEAD MASTER - neutral axis',None);C.objects.link(root)
for o in parts:o.parent=root
root['scope']='Head/hair first milestone; no gameplay connection';root['approved_reference']='../blender-v5-direction/concept-v1.png';root['front_axis']='-Y';root['up_axis']='+Z';root['head_chin_z']=0.0;root['head_crown_z']=1.075
# Reference image is editor-only, never rendered or projected onto geometry.
refc=bpy.data.collections.new('REFERENCE - approved concept - hidden render');bpy.context.scene.collection.children.link(refc);refc.hide_render=True
im=bpy.data.images.load(str(P.parent/'blender-v5-direction/concept-v1.png'));im.pack();empty=bpy.data.objects.new('Approved concept - editor reference only',None);empty.empty_display_type='IMAGE';empty.data=im;empty.empty_display_size=2.5;empty.location=(2,.5,.3);refc.objects.link(empty)
# Quiet studio, orthographic cameras remove flattering perspective distortion.
st=bpy.data.collections.new('STUDIO - nonasset');bpy.context.scene.collection.children.link(st)
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.30,.28,.27,1);world.node_tree.nodes['Background'].inputs[1].default_value=.5
back=mat('Studio warm slate','AFA7A4',shade=.0)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.755));o=bpy.context.object;o.name='Studio floor';o.data.materials.append(back)
for name,pos,energy,size in [('Key',(-3,-4,5),350,4),('Fill',(3,-1,2),180,3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);st.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,.3))-o.location).to_track_quat('-Z','Y').to_euler()
def camera(name,pos,target,scale):
 d=bpy.data.cameras.new(name);d.type='ORTHO';d.ortho_scale=scale;o=bpy.data.objects.new(name,d);st.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
cam=camera('V5 portrait camera',(2.1,-6,1.06),(0,-.02,.30),1.95);s=bpy.context.scene;s.camera=cam;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=32;s.render.resolution_x=800;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';s.view_settings.view_transform='Standard';s.view_settings.look='None';s.render.film_transparent=False
# Soft flat background, source is a true 3D head and individual solid hair locks.
s.world.node_tree.nodes['Background'].inputs[0].default_value=(*rgb('B0AAA9'),1)
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=2.9;area.spaces.active.region_3d.view_location=(0,0,.35);area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();area.spaces.active.shading.type='MATERIAL'
bpy.ops.object.select_all(action='DESELECT');face.select_set(True);bpy.context.view_layer.objects.active=face
(P/'hair-lock-authoring.json').write_text(json.dumps(lockspec,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v5-head-blockout.blend'))
for name,pos,target,scale in [('portrait',(2.1,-6,1.06),(0,-.02,.30),1.95),('front',(0,-6,.56),(0,-.015,.35),1.80),('side',(6,-.03,.66),(0,0,.35),1.80),('three-quarter',(3,-5.2,.85),(0,-.015,.35),1.80),('rear',(0,6,.70),(0,.03,.35),1.80)]:
 cam.location=pos;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;s.render.filepath=str(V/(name+'.png'));bpy.ops.render.render(write_still=True)
print('V5_NATIVE_HEAD_SAVED',len(parts),'parts',len(lockspec),'solid hair locks',flush=True)
