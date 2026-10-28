"""Image-guided native face sculpt and scalp-conforming 3D fringe for V7."""
import bpy,bmesh,math,sys,json,numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';V=P/'review';
if (P/'heroine-v7-projection-study.blend').exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Projection study exists; preserve it unless explicitly rebuilt')
bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v7-seed.blend'));C=bpy.data.collections['V7 editable head'];head=bpy.data.objects['V7 HEAD POSE'];root=bpy.data.objects['V7 MASTER']
if root.get('v7_image_fit'):raise RuntimeError('Image fit already saved; use saved source')
skin=bpy.data.objects['Face V5 topology 7'];eye=bpy.data.objects['Face V5 topology 5'];white=bpy.data.objects['Face V5 topology 1']
def mid(o,sign):
 v=[p.co for p in o.data.vertices if p.co.x*sign>0];return np.array([(min(p[k] for p in v)+max(p[k] for p in v))/2 for k in range(3)])
def extreme(o,sign,outer):
 vs=[v.co for v in o.data.vertices if v.co.x*sign>0];x=(max if outer else min)(v.x*sign for v in vs)*sign;near=[v for v in vs if abs(v.x-x)<.0015];return np.mean([tuple(v) for v in near],0)
anchors=[mid(eye,-1),mid(eye,1),np.array(tuple(min((v.co for v in skin.data.vertices),key=lambda p:p.z))),np.array(tuple(min((v.co for v in skin.data.vertices if abs(v.co.x)<.03),key=lambda p:p.y))),np.array([0,-.221,.17])]
targets=[[852,316],[968,252],[940,412],[902,327],[929,357]]
yaw,pitch=.41,.075;right=np.array([math.cos(yaw),math.sin(yaw),0]);up=np.array([-math.sin(yaw)*math.sin(pitch),math.cos(yaw)*math.sin(pitch),math.cos(pitch)]);view=np.array([math.sin(yaw)*math.cos(pitch),-math.cos(yaw)*math.cos(pitch),math.sin(pitch)])
def H(roll):return np.array([[math.cos(roll),0,math.sin(roll)],[0,1,0],[-math.sin(roll),0,math.cos(roll)]])@np.diag([1,1,.82])
def project(points,param):
 roll,scale,tx,ty=param;p=np.asarray(points)@H(roll).T;return np.stack([p@right*scale+tx,-p@up*scale+ty],-1)
a=np.array([-.4,430,975,425.],float);base=np.asarray(anchors);targets0=np.asarray(targets)
for step in range(35):
 residual=(project(base,a)-targets0).ravel();J=np.zeros((len(residual),4))
 for k,eps in enumerate([1e-4,.05,.05,.05]):b=a.copy();b[k]+=eps;J[:,k]=((project(base,b)-project(base,a))/eps).ravel()
 delta=np.linalg.lstsq(J.T@J+np.eye(4)*.01,J.T@residual,rcond=None)[0];delta[0]=np.clip(delta[0],-.08,.08);delta[1:]=np.clip(delta[1:],-15,15);a-=delta
# Eye contours and brow anchors constrain the expression, not only iris centers.
anchors.extend([extreme(white,-1,True),extreme(white,-1,False),extreme(white,1,False),extreme(white,1,True),mid(bpy.data.objects['Face V5 topology 4'],-1),mid(bpy.data.objects['Face V5 topology 4'],1),np.array([-.050,-.220,.170]),np.array([.050,-.220,.185])]);targets.extend([[815,306],[878,311],[930,267],[1008,233],[838,276],[969,212],[912,365],[949,350]])
# Use true visible lower-face contour vertices as jaw anchors.
transform=H(a[0]);normalmatrix=np.linalg.inv(transform).T;polys=skin.data.polygons;front=[np.dot(normalmatrix@np.array(tuple(p.normal)),view)>0 for p in polys];edges={}
for p in polys:
 ids=list(p.vertices)
 for i,v in enumerate(ids):edges.setdefault(tuple(sorted((v,ids[(i+1)%len(ids)]))),[]).append(p.index)
silhouette=set()
for e,faces in edges.items():
 if len(faces)==2 and front[faces[0]]!=front[faces[1]]:silhouette.update(e)
candidates=[np.array(tuple(skin.data.vertices[i].co)) for i in silhouette if skin.data.vertices[i].co.z<.36 and abs(skin.data.vertices[i].co.x)>.07]
for target in [[837,374],[873,395],[1001,368],[1025,331]]:
 if candidates:
  projected=project(candidates,a);idx=int(np.argmin(np.sum((projected-np.asarray(target))**2,axis=1)));anchors.append(candidates[idx]);targets.append(target)
A=np.asarray(anchors);targets=np.asarray(targets,float);basis_centers=[(.15,.41,.12,.10),(.065,.42,.042,.055),(.24,.43,.050,.060),(.16,.55,.13,.065),(0,.255,.060,.080),(0,.17,.11,.065),(0,.02,.14,.09),(.20,.16,.13,.12),(.28,.30,.10,.13),(.14,.73,.23,.20)]
def basis(p):
 x,y,z=p;return np.array([math.exp(-((abs(x)-cx)/sx)**2-((z-cz)/sz)**2) for cx,cz,sx,sz in basis_centers])
B=np.array([basis(p) for p in A]);count=len(basis_centers);J=np.zeros((len(A)*2,count*3));scale=a[1]
for i,p in enumerate(A):
 for axis in range(3):
  v=transform[:,axis];proj=np.array([np.dot(v,right),-np.dot(v,up)])*scale;sign=math.tanh(p[0]/.045) if axis==0 else 1
  for k in range(count):J[2*i:2*i+2,axis*count+k]=proj*B[i,k]*sign
rhs=(targets-project(A,a)).ravel();penalty=(scale*.35)**2;coeff=np.linalg.solve(J.T@J+np.eye(count*3)*penalty,J.T@rhs).reshape(3,count);coeff=np.clip(coeff,-.055,.055)
def deform(p):
 p=np.array(p,float);b=basis(p);d=coeff@b;d[0]*=math.tanh(p[0]/.045);return p+d
before_rms=float(np.sqrt(np.mean((project(A,a)-targets)**2)));pred=np.array([deform(p) for p in A]);after_rms=float(np.sqrt(np.mean((project(pred,a)-targets)**2)))
for o in list(C.objects):
 if o.type=='MESH' and o.name.startswith('Face V5 topology'):
  for v in o.data.vertices:
   p=np.array(tuple(v.co));weight=1 if o.name.endswith('8') or p[2]<.32 else np.clip((.12-p[1])/.16,0,1);v.co=p+(deform(p)-p)*weight
  o.data.update()
# Rebuild existing face contours around the modified surface.
for name in ['Face V5 topology 7','Face V5 topology 8']:
 o=bpy.data.objects[name];contour=bpy.data.objects.get('Contour '+name)
 if contour:
  ink=contour.data.materials[0];d=o.data.copy()
  for v in d.vertices:v.co+=v.normal*.00115
  bm=bmesh.new();bm.from_mesh(d);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free();d.materials.clear();d.materials.append(ink);contour.data=d
pose={'yaw':yaw,'pitch':pitch,'head_roll':float(a[0]),'scale':float(a[1]),'tx':float(a[2]),'ty':float(a[3]),'camera_below_face':False,'before_landmark_rms':before_rms,'after_landmark_rms':after_rms,'source_landmarks':A.tolist(),'target_pixels':targets.tolist(),'symmetric_sculpt_coefficients':coeff.tolist()};(P/'reference-fit.json').write_text(json.dumps(pose,indent=2),encoding='utf8')
# Reference albedo is fixed UV paint on the actual surface, never screen coordinates.
ref=bpy.data.images.load(str(P.parent/'blender-v6/approved-concept.png'),check_existing=True);ref.pack();transform=H(a[0]);inv=np.linalg.inv(transform)
def pixel(p):return project([p],a)[0]
def add_uv(o):
 uv=o.data.uv_layers.get('ReferencePaintUV') or o.data.uv_layers.new(name='ReferencePaintUV')
 for lp in o.data.loops:
  px,py=pixel(tuple(o.data.vertices[lp.vertex_index].co));uv.data[lp.index].uv=(float(px/1536),float(1-py/1024))
for o in C.objects:
 if o.type=='MESH' and o.name.startswith('Face V5 topology'):add_uv(o)
for obj in C.objects:
 if obj.type=='MESH' and obj.name.startswith('Face V5 topology'):
  original_uv=obj.data.uv_layers[0].name
  for material in obj.data.materials:
   if material and material.use_nodes:
    for node in list(material.node_tree.nodes):
     if node.type=='TEX_IMAGE' and node.image!=ref:
      uvnode=material.node_tree.nodes.new('ShaderNodeUVMap');uvnode.uv_map=original_uv;material.node_tree.links.new(uvnode.outputs[0],node.inputs[0])
# Blend only true skin-colour regions; occluded forehead/back keep the authored skin UV.
for index in [7,8]:
 o=bpy.data.objects['Face V5 topology '+str(index)];m=o.data.materials[0].copy();m.name='V7 reference-guided skin '+str(index);o.data.materials[0]=m;nd=m.node_tree.nodes;lk=m.node_tree.links;old=next(n for n in nd if n.type=='TEX_IMAGE');dest=[l.to_socket for l in list(old.outputs['Color'].links)];uv=nd.new('ShaderNodeUVMap');uv.uv_map='ReferencePaintUV';tx=nd.new('ShaderNodeTexImage');tx.image=ref;lk.new(uv.outputs[0],tx.inputs[0]);sep=nd.new('ShaderNodeSeparateColor');sep.mode='RGB';lk.new(tx.outputs['Color'],sep.inputs[0]);rg=nd.new('ShaderNodeMath');rg.operation='SUBTRACT';lk.new(sep.outputs[0],rg.inputs[0]);lk.new(sep.outputs[1],rg.inputs[1]);threshold=nd.new('ShaderNodeMapRange');threshold.inputs['From Min'].default_value=.012;threshold.inputs['From Max'].default_value=.07;threshold.inputs['To Min'].default_value=0;threshold.inputs['To Max'].default_value=.88;lk.new(rg.outputs[0],threshold.inputs['Value']);rb=nd.new('ShaderNodeMath');rb.operation='SUBTRACT';lk.new(sep.outputs[0],rb.inputs[0]);lk.new(sep.outputs[2],rb.inputs[1]);warm=nd.new('ShaderNodeMapRange');warm.inputs['From Min'].default_value=.035;warm.inputs['From Max'].default_value=.09;lk.new(rb.outputs[0],warm.inputs['Value']);lum=nd.new('ShaderNodeRGBToBW');lk.new(tx.outputs['Color'],lum.inputs[0]);bright=nd.new('ShaderNodeMapRange');bright.inputs['From Min'].default_value=.44;bright.inputs['From Max'].default_value=.72;lk.new(lum.outputs[0],bright.inputs['Value']);gate=nd.new('ShaderNodeMath');gate.operation='MULTIPLY';lk.new(threshold.outputs[0],gate.inputs[0]);lk.new(warm.outputs[0],gate.inputs[1]);allgate=nd.new('ShaderNodeMath');allgate.operation='MULTIPLY';lk.new(gate.outputs[0],allgate.inputs[0]);lk.new(bright.outputs[0],allgate.inputs[1]);mix=nd.new('ShaderNodeMixRGB');lk.new(allgate.outputs[0],mix.inputs[0]);lk.new(old.outputs['Color'],mix.inputs[1]);lk.new(tx.outputs['Color'],mix.inputs[2])
 for socket in dest:lk.new(mix.outputs[0],socket)
# Iris colour transfer uses the same curved iris geometry and original alpha mask.
o=bpy.data.objects['Face V5 topology 5'];m=o.data.materials[0].copy();m.name='V7 reference-guided iris paint';o.data.materials[0]=m;nd=m.node_tree.nodes;lk=m.node_tree.links;em=next(n for n in nd if n.type=='EMISSION');old=em.inputs[0].links[0].from_socket;uv=nd.new('ShaderNodeUVMap');uv.uv_map='ReferencePaintUV';tx=nd.new('ShaderNodeTexImage');tx.image=ref;lk.new(uv.outputs[0],tx.inputs[0]);mix=nd.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.82;lk.new(old,mix.inputs[1]);lk.new(tx.outputs['Color'],mix.inputs[2]);lk.new(mix.outputs[0],em.inputs[0])
# Remove blunt stock bangs, preserving the authored back/side topology.
for o in list(C.objects):
 if o.name.startswith('V7 CC0 bob strip'):
  k=int(o.name.split()[-1])
  if k in list(range(20,46)):bpy.data.objects.remove(o,do_unlink=True)
# Scalp ray intersections give each traced flow a genuine curved 3D depth.
center=np.array([0,.03,.53]);radii=np.array([.40,.31,.57]);local_view=inv@view

def unproject(px,py,back=False):
 qx=(px-a[2])/a[1];qy=(a[3]-py)/a[1];origin=right*qx+up*qy;local_origin=inv@origin;d=(local_origin-center)/radii;v=local_view/radii;aa=np.dot(v,v);bb=2*np.dot(d,v);cc=np.dot(d,d)-1;disc=bb*bb-4*aa*cc;depth=(-bb+(1 if not back else -1)*math.sqrt(max(0,disc)))/(2*aa);depth+=.018 if not back else -.008;return inv@(origin+view*depth)

def cat(ps,t):
 ps=[Vector(p) for p in ps];u=t*(len(ps)-1);k=min(len(ps)-2,int(u));q=u-k;a0,b,c,d=ps[max(0,k-1)],ps[k],ps[k+1],ps[min(len(ps)-1,k+2)];return .5*((2*b)+(-a0+c)*q+(2*a0-5*b+4*c-d)*q*q+(-a0+3*b-3*c+d)*q*q*q)
# Real surface colour projection is locked in UV, so rotation does not slide the paint.
hair=bpy.data.materials.new('V7 fixed-UV reference hair paint');hair.use_nodes=True;nd=hair.node_tree.nodes;nd.clear();lk=hair.node_tree.links;tx=nd.new('ShaderNodeTexImage');tx.image=ref;uv=nd.new('ShaderNodeUVMap');uv.uv_map='ReferencePaintUV';lk.new(uv.outputs[0],tx.inputs[0]);em=nd.new('ShaderNodeEmission');out=nd.new('ShaderNodeOutputMaterial');mix=nd.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.76;mix.inputs[1].default_value=(.79,.76,.84,1);lk.new(tx.outputs['Color'],mix.inputs[2]);lk.new(mix.outputs[0],em.inputs[0]);lk.new(em.outputs[0],out.inputs[0])
sep=nd.new('ShaderNodeSeparateColor');lk.new(tx.outputs['Color'],sep.inputs[0]);rb=nd.new('ShaderNodeMath');rb.operation='SUBTRACT';lk.new(sep.outputs[0],rb.inputs[0]);lk.new(sep.outputs[2],rb.inputs[1]);neutral=nd.new('ShaderNodeMath');neutral.operation='LESS_THAN';neutral.inputs[1].default_value=.055;lk.new(rb.outputs[0],neutral.inputs[0]);lum=nd.new('ShaderNodeRGBToBW');lk.new(tx.outputs['Color'],lum.inputs[0]);bright=nd.new('ShaderNodeMapRange');bright.inputs['From Min'].default_value=.40;bright.inputs['From Max'].default_value=.78;bright.inputs['To Max'].default_value=.90;lk.new(lum.outputs[0],bright.inputs['Value']);gate=nd.new('ShaderNodeMath');gate.operation='MULTIPLY';lk.new(neutral.outputs[0],gate.inputs[0]);lk.new(bright.outputs[0],gate.inputs[1]);lk.new(gate.outputs[0],mix.inputs[0])
# Traces follow the approved large fringe and lower-bob silhouette, not generic parallel paths.
traces=[
 ([[959,45],[858,87],[797,157],[752,228],[714,279],[735,286]],[3,19,23,18,9,.3]),
 ([[971,48],[911,101],[862,187],[832,260],[802,310],[796,335]],[3,19,24,19,10,.3]),
 ([[982,50],[937,125],[917,212],[883,273],[849,307],[845,319]],[2,16,21,17,9,.25]),
 ([[991,58],[966,138],[950,210],[932,243],[904,271],[890,283]],[2,15,17,13,6,.25]),
 ([[999,48],[1052,107],[1084,173],[1096,225],[1101,260],[1085,268]],[2,18,25,20,10,.3]),
 ([[1001,55],[1025,133],[1042,205],[1036,258],[1042,307],[1066,324]],[2,12,15,12,6,.25]),
 ([[1015,43],[1114,86],[1168,160],[1180,244],[1200,295],[1186,314]],[2,20,25,21,12,.3]),
 ([[1100,137],[1164,208],[1184,281],[1170,350],[1135,404],[1105,410]],[2,20,25,20,10,.3]),
 ([[1125,195],[1170,260],[1170,330],[1152,383],[1121,413],[1092,399]],[2,15,20,16,9,.3]),
 ([[742,222],[713,312],[728,373],[756,414],[797,438],[823,420]],[2,17,24,20,12,.3]),
 ([[785,243],[744,340],[765,400],[825,429],[870,423],[884,402]],[2,18,23,17,10,.3]),
 ([[1099,255],[1118,328],[1090,382],[1048,412],[1010,407],[1001,390]],[2,14,18,15,8,.3]),
 ([[850,139],[771,206],[695,278],[664,323],[682,340]],[2,11,13,7,.3]),
 ([[802,208],[742,277],[704,344],[718,395],[753,420]],[2,13,16,11,.3])]
trace_meta=[]
for k,(screen,width) in enumerate(traces):
 path=[unproject(x,y) for x,y in screen];vs=[];uvs=[];fs=[];rows=44;n=10;camnormal=Vector(local_view).normalized()
 for j in range(rows+1):
  t=j/rows;p=cat(path,t);tan=(cat(path,min(1,t+.004))-cat(path,max(0,t-.004))).normalized();across=tan.cross(camnormal).normalized();normal=across.cross(tan).normalized();w=float(np.interp(t,np.linspace(0,1,len(width)),width))/a[1]
  for i in range(n):
   angle=i*math.tau/n;co=p+across*math.cos(angle)*w+normal*math.sin(angle)*w*.12;vs.append(co);px,py=pixel(tuple(co));uvs.append((px/1536,1-py/1024))
 for j in range(rows):
  for i in range(n):b=j*n+i;c=j*n+(i+1)%n;fs.append((b,c,c+n,b+n))
 fs.extend([tuple(reversed(range(n))),tuple(rows*n+i for i in range(n))]);d=bpy.data.meshes.new('V7 scalp curved reference flow '+str(k));d.from_pydata(vs,[],fs);d.update();d.materials.append(hair);layer=d.uv_layers.new(name='ReferencePaintUV')
 for lp in d.loops:layer.data[lp.index].uv=uvs[lp.vertex_index]
 for p in d.polygons:p.use_smooth=True
 o=bpy.data.objects.new('V7 fitted hair flow '+str(k),d);C.objects.link(o);o.parent=head;mod=o.modifiers.new('Editable reference curvature','SUBSURF');mod.levels=1;trace_meta.append({'pixels':screen,'half_width_pixels':width,'scalp_path':[list(p) for p in path]})
(P/'reference-hair-paths.json').write_text(json.dumps(trace_meta,indent=2),encoding='utf8');root['v7_image_fit']=True;root['surface_paint']='Fixed UV transfer from approved reference, blended with existing skin/iris paint; actual curved geometry';head.rotation_euler.y=0
s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=800;s.eevee.taa_render_samples=32;cam.data.ortho_scale=1.35;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v7-projection-study.blend'));s.render.filepath=str(V/'neutral-fit-b.png');bpy.ops.render.render(write_still=True)
head.rotation_euler.y=a[0];cam.location=Vector(view)*6;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.location+=Vector(right)*((945-a[2])/a[1])+Vector(up)*((a[3]-262.5)/a[1]);cam.data.ortho_scale=610/a[1];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-fit-b.png');bpy.ops.render.render(write_still=True);print('V7_IMAGE_GUIDED_NATIVE_MODEL',before_rms,after_rms,flush=True)
