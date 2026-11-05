"""Native sculpt pass: no camera projection, fixed paint or generated portrait substitution."""
import bpy,bmesh,sys,math,json,numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';V=P/'review';dest=P/'heroine-v7-head.blend'
if dest.exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Preserve edited master; explicit rebuild required')
bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v7-seed.blend'));C=bpy.data.collections['V7 editable head'];head=bpy.data.objects['V7 HEAD POSE'];root=bpy.data.objects['V7 MASTER']
fit=json.loads((P/'reference-fit.json').read_text());coeff=np.array(fit['symmetric_sculpt_coefficients']);centers=[(.15,.41,.12,.10),(.065,.42,.042,.055),(.24,.43,.050,.060),(.16,.55,.13,.065),(0,.255,.060,.080),(0,.17,.11,.065),(0,.02,.14,.09),(.20,.16,.13,.12),(.28,.30,.10,.13),(.14,.73,.23,.20)]
for o in C.objects:
 if o.type=='MESH' and o.name.startswith('Face V5 topology'):
  for v in o.data.vertices:
   x,y,z=v.co;b=np.array([math.exp(-((abs(x)-cx)/sx)**2-((z-cz)/sz)**2) for cx,cz,sx,sz in centers]);d=coeff@b;d[0]*=math.tanh(x/.045);weight=1 if o.name.endswith('8') or z<.32 else np.clip((.12-y)/.16,0,1);v.co+=Vector(d*weight)
  o.data.update()
# Rebuild the real thin face outline after sculpting.
for name in ['Face V5 topology 7','Face V5 topology 8']:
 o=bpy.data.objects[name];outline=bpy.data.objects.get('Contour '+name)
 if outline:
  mat=outline.data.materials[0];d=o.data.copy()
  for v in d.vertices:v.co+=v.normal*.0009
  bm=bmesh.new();bm.from_mesh(d);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free();d.materials.clear();d.materials.append(mat);outline.data=d
# Retain authored crown and rear foundation, delete the generic blunt fringe.
for o in list(C.objects):
 if o.name.startswith('V7 CC0 bob strip'):
  k=int(o.name.split()[-1])
  if k>=20:bpy.data.objects.remove(o,do_unlink=True)
  else:
   for v in o.data.vertices:
    x,y,z=v.co;low=max(0,min(1,(.65-z)/.55));v.co.x*=.96+.07*math.sin(low*math.pi);v.co.z+=.03*low;v.co.y-=.025*low
   o.data.update()
# Continuous painted cel values remain attached to the actual geometry.
def linear(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
m=bpy.data.materials.new('V7 pearl bob - native cel');m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links;out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');vc=n.new('ShaderNodeVertexColor');vc.layer_name='FlowPaint';l.new(vc.outputs['Color'],em.inputs['Color']);l.new(em.outputs[0],out.inputs[0])
# A closed softly flattened cross section, with width along the scalp tangent.
def cat(points,t):
 p=[Vector(q) for q in points];u=t*(len(p)-1);k=min(len(p)-2,int(u));q=u-k;a,b,c,d=p[max(0,k-1)],p[k],p[k+1],p[min(len(p)-1,k+2)];return .5*((2*b)+(-a+c)*q+(2*a-5*b+4*c-d)*q*q+(-a+3*b-3*c+d)*q*q*q)
author=[]
def lock(name,points,widths,depth=.0035):
 vs=[];cs=[];fs=[];rows=56;ring=12
 for j in range(rows+1):
  t=j/rows;p=cat(points,t);tan=(cat(points,min(1,t+.003))-cat(points,max(0,t-.003))).normalized();radial=Vector((p.x*.75,p.y-.04,(p.z-.53)*.4)).normalized();across=tan.cross(radial).normalized();normal=across.cross(tan).normalized();w=float(np.interp(t,np.linspace(0,1,len(widths)),widths));thickness=depth*max(.12,math.sin(math.pi*t)**.4)
  for i in range(ring):
   theta=i*math.tau/ring;ac=math.cos(theta);co=p+across*(ac*w)+normal*(math.sin(theta)*thickness);vs.append(co)
   # Longitudinal bands: subtle violet edges, off-centre pearl highlight, soft root shading.
   edge=abs(ac)**3;band=math.exp(-((ac+.25)/.36)**2)*(.07+.025*math.cos(t*12));shine=math.exp(-((t-.30)/.12)**2)*.04;back=.035 if math.sin(theta)<0 else 0;rootshade=.04*math.exp(-t/.10);rgb=(.945-.075*edge+band*.45+shine-back-rootshade,.925-.095*edge+band*.45+shine-back-rootshade,.96-.055*edge+band*.3+shine-back-rootshade);cs.append((*[linear(min(.995,max(0,c))) for c in rgb],1))
 for j in range(rows):
  for i in range(ring):a=j*ring+i;b=j*ring+(i+1)%ring;fs.append((a,b,b+ring,a+ring))
 fs.extend([tuple(reversed(range(ring))),tuple(rows*ring+i for i in range(ring))]);d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();d.materials.append(m);col=d.color_attributes.new(name='FlowPaint',type='FLOAT_COLOR',domain='POINT')
 for i,c in enumerate(cs):col.data[i].color=c
 for p in d.polygons:p.use_smooth=True
 o=bpy.data.objects.new(name,d);C.objects.link(o);o.parent=head;mod=o.modifiers.new('Editable curved lock','SUBSURF');mod.levels=1;author.append({'name':name,'points':points,'half_width':widths,'thickness':depth});return o
# Side part: the large swept fringe runs down the forehead toward the far cheek.
flows=[
 ('sweep outer',[(.10,-.025,1.07),(-.12,-.155,1.02),(-.30,-.235,.84),(-.38,-.235,.62),(-.415,-.215,.47),(-.39,-.25,.40)],[.008,.095,.095,.065,.025,.0007]),
 ('sweep left',[(.12,-.035,1.075),(-.04,-.205,.96),(-.17,-.265,.78),(-.25,-.276,.60),(-.32,-.265,.45),(-.37,-.25,.42)],[.006,.085,.10,.078,.035,.0007]),
 ('sweep center',[(.135,-.045,1.07),(.025,-.235,.94),(-.055,-.29,.77),(-.12,-.29,.60),(-.21,-.28,.49),(-.25,-.27,.485)],[.005,.066,.080,.062,.025,.0005]),
 ('sweep fine',[(.15,-.050,1.067),(.10,-.242,.91),(.055,-.292,.75),(.005,-.307,.61),(-.075,-.302,.48),(-.135,-.287,.445)],[.004,.062,.065,.055,.025,.0005]),
 ('forehead curved bridge',[(.14,-.04,1.075),(.14,-.19,.96),(.17,-.26,.80),(.255,-.26,.66),(.32,-.21,.59),(.345,-.17,.59)],[.006,.105,.10,.066,.025,.0005]),
 ('part right inner',[(.16,-.035,1.07),(.235,-.18,.96),(.285,-.235,.81),(.31,-.225,.68),(.34,-.18,.58),(.37,-.14,.55)],[.005,.055,.055,.04,.02,.0006]),
 ('part right outer',[(.165,-.015,1.07),(.30,-.10,.96),(.39,-.135,.78),(.42,-.11,.59),(.445,-.075,.46),(.47,-.055,.45)],[.004,.07,.076,.058,.025,.0007]),
 ('part right crown',[(.17,.00,1.067),(.32,-.035,.97),(.435,-.035,.77),(.46,.015,.54),(.465,.025,.34),(.435,.015,.29)],[.004,.065,.075,.065,.035,.0007]),
 ('left cheek outer',[(-.12,-.09,1.03),(-.34,-.12,.85),(-.43,-.13,.61),(-.455,-.15,.37),(-.40,-.19,.16),(-.31,-.20,.15)],[.01,.06,.068,.060,.03,.0007]),
 ('left cheek inner',[(-.25,-.14,.86),(-.375,-.20,.61),(-.415,-.22,.39),(-.38,-.25,.22),(-.29,-.24,.17),(-.25,-.22,.19)],[.008,.05,.056,.046,.02,.0006]),
 ('left curled edge',[(-.39,-.08,.67),(-.47,-.08,.46),(-.47,-.05,.25),(-.395,-.10,.10),(-.31,-.15,.10),(-.285,-.16,.125)],[.005,.04,.046,.04,.017,.0006]),
 ('right ear frame',[(.30,-.14,.79),(.35,-.19,.62),(.34,-.18,.45),(.32,-.14,.31),(.35,-.105,.255),(.39,-.08,.27)],[.004,.024,.025,.020,.008,.0005]),
 ('right lower curl',[(.415,-.035,.65),(.45,-.03,.43),(.435,-.07,.23),(.365,-.12,.14),(.29,-.13,.15),(.27,-.115,.18)],[.005,.046,.05,.043,.02,.0006]),
 ('right outward wisp',[(.405,.01,.67),(.48,.00,.51),(.50,-.015,.34),(.475,-.075,.21),(.40,-.12,.15),(.36,-.12,.16)],[.004,.025,.030,.026,.014,.0004])]
for name,points,width in flows:lock('V7 sculpted '+name,points,width)
# Narrow secondary splits follow the same forms, rather than sticking out as antennas.
for sign in [-1,1]:
 for k in range(3):
  x=sign*(.43+.01*k);z=.56-.08*k;lock('V7 fine edge %s %s'%(sign,k),[(x,-.08,z),(x+sign*.025,-.10,z-.10),(x+sign*.015,-.13,z-.20),(x-sign*.045,-.17,z-.24)],[.003,.013,.009,.0003],.0025)
# Couple a few true flyaway curves to the crown, keeping their roots under the hair.
for k,points in enumerate([[(.16,.025,1.07),(.01,-.04,1.125),(-.18,-.11,1.09),(-.35,-.15,.94)],[(.19,.025,1.065),(.34,.015,1.09),(.45,-.005,.94),(.48,-.02,.79)]]):
 d=bpy.data.curves.new('V7 flyaway curve','CURVE');d.dimensions='3D';d.bevel_depth=.00125;d.bevel_resolution=2;sp=d.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
 for i,(b,co) in enumerate(zip(sp.bezier_points,points)):b.co=co;b.handle_left_type=b.handle_right_type='AUTO';b.radius=.65 if i==len(points)-1 else 1
 fly=bpy.data.materials.get('V7 pale flyaway')
 if not fly:
  fly=bpy.data.materials.new('V7 pale flyaway');fly.use_nodes=True;nd=fly.node_tree.nodes;nd.clear();em=nd.new('ShaderNodeEmission');em.inputs[0].default_value=(.65,.61,.71,1);out=nd.new('ShaderNodeOutputMaterial');fly.node_tree.links.new(em.outputs[0],out.inputs[0])
 d.materials.append(fly);o=bpy.data.objects.new('V7 crown flyaway '+str(k),d);C.objects.link(o);o.parent=head
root['surface_paint']='Existing authored skin and iris UV only; no reference projection';root['status']='Unapproved native head sculpt candidate';head.rotation_euler.y=0
(P/'native-hair-authoring.json').write_text(json.dumps(author,indent=2),encoding='utf8')
s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=32;cam.data.ortho_scale=1.34;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();bpy.ops.wm.save_as_mainfile(filepath=str(dest));s.render.filepath=str(V/'native-sculpt-d.png');bpy.ops.render.render(write_still=True)
head.rotation_euler.y=fit['head_roll'];yaw,pitch=fit['yaw'],fit['pitch'];cam.location=(6*math.sin(yaw)*math.cos(pitch),-6*math.cos(yaw)*math.cos(pitch),6*math.sin(pitch));cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();right=cam.rotation_euler.to_matrix()@Vector((1,0,0));up=cam.rotation_euler.to_matrix()@Vector((0,1,0));cam.location+=right*((945-fit['tx'])/fit['scale'])+up*((fit['ty']-262.5)/fit['scale']);cam.data.ortho_scale=610/fit['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;s.render.filepath=str(V/'reference-native-d.png');bpy.ops.render.render(write_still=True);print('V7_NATIVE_SCULPT_SAVED',flush=True)
