"""V4 isolated 3D art candidate. Never writes Godot runtime, assets or Web output."""
import bpy,bmesh,math,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v4';T=P/'textures';P.mkdir(exist_ok=True)
if (P/'heroine-v4.blend').exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Saved V4 exists: use the saved-source export/review tools, or --replace-candidate explicitly')
bpy.ops.wm.open_mainfile(filepath=str(R/'art-studies/arcana-hero/white-bob-heroine/blender-v3/heroine-v3.blend'))
rig=bpy.data.objects['HeroineV3Rig'];rig.name='HeroineV4Rig';rig.data.name='HeroineV4Skeleton';body=bpy.data.objects['Heroine_body']
rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
for o in bpy.context.selected_objects:o.select_set(False)
# Remove the old head as geometry, retaining body, skin weights and clothing masks.
head_index=body.vertex_groups['head'].index;bm=bmesh.new();bm.from_mesh(body.data);deform=bm.verts.layers.deform.verify()
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v[deform].get(head_index,0)>.8],context='VERTS');bm.to_mesh(body.data);bm.free();body.data.update()
bpy.data.objects.remove(bpy.data.objects['Heroine_hair'],do_unlink=True)
# Recover physically lit materials from the V3 cel preview, preserving packed paint.
def lin(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
def col(h):return tuple(lin(int(h[i:i+2],16)/255) for i in (0,2,4))
def restore(m):
 c=m.diffuse_color[:];m.use_nodes=True;n=m.node_tree.nodes;n.clear();bs=n.new('ShaderNodeBsdfPrincipled');bs.inputs['Base Color'].default_value=c;bs.inputs['Roughness'].default_value=.76;bs.inputs['Specular IOR Level'].default_value=.22
 if 'Silver' in m.name:bs.inputs['Metallic'].default_value=.65;bs.inputs['Roughness'].default_value=.32
 out=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(bs.outputs[0],out.inputs[0]);image=bpy.data.images.get(m.name+'_paint')
 if image and m.get('uses_paint',True):
  tex=n.new('ShaderNodeTexImage');tex.image=image;m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
 return bs
for m in bpy.data.materials:restore(m)
def material(name,hex,texture=None,rough=.7,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col(hex),1);bs=restore(m);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 if texture:
  image=bpy.data.images.load(str(T/texture),check_existing=True);image.pack();tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Base Color'].default_value=(1,1,1,1)
 return m
skin=material('V4 porcelain skin','F8D9C5');face_mat=material('V4 painted face','F8D9C5','face-painted.png');eyes=material('V4 painted violet eyes','FFFFFF','eyes-violet-painted.png',.48)
ink=material('V4 plum lashes','352A47');brow=material('V4 ash brows','A79BAE');lips=material('V4 rose lips','B6797E');lip_light=material('V4 lower lip warmth','E8B3AD')
hair=material('V4 painted pearl hair','E8E6EC','hair-pearl-painted.png',.82);hair_dark=material('V4 violet underhair','A2A0B8',rough=.62)
silver=material('V4 silver thread','C7D0DC',rough=.35,metal=.55);embroidery=material('V4 blue embroidery','A4B4CD');gem=material('V4 pale sapphire','829FCB',rough=.23,metal=.08)
next(n for n in hair.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Specular IOR Level'].default_value=.10
bs=next(n for n in hair.node_tree.nodes if n.type=='BSDF_PRINCIPLED');source=bs.inputs['Base Color'].links[0].from_socket;soft=hair.node_tree.nodes.new('ShaderNodeMixRGB');soft.blend_type='MULTIPLY';soft.inputs[0].default_value=1;soft.inputs[2].default_value=(.85,.85,.85,1);hair.node_tree.links.new(source,soft.inputs[1]);hair.node_tree.links.new(soft.outputs[0],bs.inputs['Base Color'])
navy=bpy.data.materials['Sash_navy'];ivory=bpy.data.materials['Dress_ivory']
coll=bpy.data.collections.new('V4 hand-shaped details');bpy.context.scene.collection.children.link(coll)
parts=[]
def finish(name,verts,faces,mat,bone='head',uv=None,sub=0):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update();o=bpy.data.objects.new(name,data);coll.objects.link(o);data.materials.append(mat)
 for p in data.polygons:p.use_smooth=True
 if uv:
  layer=data.uv_layers.new(name='PaintUV')
  for loop in data.loops:layer.data[loop.index].uv=uv[loop.vertex_index]
 if bone:g=o.vertex_groups.new(name=bone);g.add(list(range(len(data.vertices))),1,'REPLACE')
 if sub:
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Sculpted curvature','SUBSURF');mod.levels=sub;bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
 parts.append(o);return o

def tube(name,points,radius,mat,bone='head'):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=8;c.bevel_depth=radius;c.bevel_resolution=3;s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
 for b,p in zip(s.bezier_points,points):b.co=p;b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,c);coll.objects.link(o);bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');parts.append(o);o.select_set(False);return o

def sphere(name,pos,scale,mat,bone='head'):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=16,location=pos);o=bpy.context.object;o.name=name;o.scale=scale;bpy.ops.object.transform_apply(location=True,rotation=False,scale=True)
 for c in list(o.users_collection):c.objects.unlink(o)
 coll.objects.link(o);o.data.materials.append(mat)
 for p in o.data.polygons:p.use_smooth=True
 g=o.vertex_groups.new(name=bone);g.add(list(range(len(o.data.vertices))),1,'REPLACE');parts.append(o);o.select_set(False);return o

# Real neck and a pose-space level-head control, with a neutral bind pose.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');eb=rig.data.edit_bones
neck=eb.new('neck');neck.head=(0,0,1.56);neck.tail=(0,0,1.69);neck.parent=eb['spine'];eb['head'].head=(0,0,1.69);eb['head'].tail=(0,0,2.22);eb['head'].parent=neck
look=eb.new('CTRL_head_level');look.head=(0,0,1.69);look.tail=(0,0,2.22);look.parent=eb['root'];look.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT');level=rig.pose.bones['head'].constraints.new('COPY_ROTATION');level.name='Neutral head / cancel torso pitch and roll';level.target=rig;level.subtarget='CTRL_head_level';level.owner_space='POSE';level.target_space='POSE'
for action in list(bpy.data.actions):
 rig.animation_data.action=action
 count=121 if action.name=='Idle' else 49 if action.name in ['Walk','Run'] else 19
 for f in range(count):
  t=f/(count-1);pb=rig.pose.bones['head'];pb.rotation_euler=(0,0,0);pb.keyframe_insert('rotation_euler',frame=f+1,group='head')
  gaze=rig.pose.bones['CTRL_head_level'];gaze.rotation_mode='XYZ';gaze.rotation_euler=(0,(.14 if action.name=='TurnRight' else -.14)*math.sin(math.pi*t) if action.name.startswith('Turn') else 0,0);gaze.keyframe_insert('rotation_euler',frame=f+1,group='CTRL_head_level')
rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
# Soft anime face lighting avoids the muddy hard hair shadows of the PBR draft.
for mat in [skin,face_mat,eyes]:
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    em=nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=1.0
    if bs.inputs['Base Color'].is_linked:links.new(bs.inputs['Base Color'].links[0].from_socket,em.inputs['Color'])
    else:em.inputs['Color'].default_value=bs.inputs['Base Color'].default_value
    if mat!=eyes:
        geom=nodes.new('ShaderNodeNewGeometry');dot=nodes.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.25,-.80,.45);links.new(geom.outputs['Normal'],dot.inputs[0])
        ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=0;ramp.color_ramp.elements[0].color=(.88,.84,.89,1);ramp.color_ramp.elements[1].position=.85;ramp.color_ramp.elements[1].color=(1,1,1,1);links.new(dot.outputs['Value'],ramp.inputs[0])
        multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
        if em.inputs['Color'].is_linked:links.new(em.inputs['Color'].links[0].from_socket,multiply.inputs[1])
        else:multiply.inputs[1].default_value=em.inputs['Color'].default_value
        links.new(ramp.outputs[0],multiply.inputs[2]);links.new(multiply.outputs[0],em.inputs['Color'])
    mix=nodes.new('ShaderNodeMixShader');mix.inputs[0].default_value=.92 if mat!=eyes else .85
    links.new(bs.outputs[0],mix.inputs[1]);links.new(em.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],out.inputs['Surface'])

# Delicate, continuous cheek/jaw planes with a nose sculpted into the surface.
profile=np.array([(1.69,.050,.045),(1.715,.090,.075),(1.76,.148,.115),(1.80,.191,.146),(1.88,.224,.170),(1.97,.233,.177),(2.06,.222,.173),(2.15,.17,.137),(2.22,.04,.037)])
def radii(z):return np.interp(z,profile[:,0],profile[:,1]),np.interp(z,profile[:,0],profile[:,2])
def front_y(x,z):
 rx,ry=radii(z);y=-.008-ry*math.sqrt(max(.025,1-(x/rx)**2));nose=.014*math.exp(-(x/.028)**2-((z-1.870)/.028)**2)+.008*math.exp(-(x/.023)**2-((z-1.92)/.065)**2)
 return y-nose
verts=[];uv=[];faces=[];n=64;rows=48
for j in range(rows+1):
 z=1.69+j/rows*.53;rx,ry=radii(z)
 for i in range(n):
  a=i*math.tau/n;x=rx*math.cos(a);y=-.008+ry*math.sin(a)
  if math.sin(a)<0:y=front_y(x,z)
  verts.append((x,y,z));uv.append((i/n,j/rows))
for j in range(rows):
 for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
faces.extend([tuple(reversed(range(n))),tuple(rows*n+i for i in range(n))]);finish('V4 continuous face and jaw',verts,faces,face_mat,uv=uv,sub=1)
# Neck overlaps beneath the collar and jaw, not a detached head pedestal.
verts=[];faces=[]
for j,z in enumerate([1.56,1.61,1.66,1.71]):
 for i in range(24):a=i*math.tau/24;verts.append((.047*math.cos(a),.043*math.sin(a),z))
for j in range(3):
 for i in range(24):a=j*24+i;b=j*24+(i+1)%24;faces.append((a,b,b+24,a+24))
o=finish('V4 connected neck',verts,faces,skin,'neck',sub=1)
# Painted irises on curved almond surfaces; tapered lashes, soft lids and brows.
for sign in [-1,1]:
 cx=sign*.096;cz=1.945;rx=.070;rz=.038
 v=[(cx,front_y(cx,cz)-.005,cz)];uv=[(.5,.5)];outline=[]
 for i in range(64):
  a=i*math.tau/64;q=math.cos(a);t=(q+1)/2;zz=(.65 if math.sin(a)>=0 else .70)*math.sin(a)+.08*t
  x=cx+q*rx;z=cz+zz*rz;v.append((x,front_y(x,z)-.005,z));uv.append(((q+1)/2,(zz+1)/2))
 finish('V4 almond eye',v,[(0,i+1,(i+1)%64+1) for i in range(64)],eyes,uv=uv)
 upper=[];lashverts=[]
 for i in range(25):
  t=i/24;q=2*t-1;x=cx+q*rx;z=cz+rz*(.65*math.sin(math.pi*t)+.08*t);thick=.002+.005*math.sin(math.pi*t)**.5
  lashverts.extend([(x,front_y(x,z)-.008,z),(x,front_y(x,z+thick)-.008,z+thick)])
  upper.append((x,front_y(x,z+.007)-.003,z+.007))
 finish('V4 tapered upper lash',lashverts,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(24)],ink)
 tube('V4 upper lid',upper,.0025,skin)
 outer=cx+sign*rx;tube('V4 outer lash flick',[(outer-sign*.009,front_y(outer-sign*.009,cz+.008)-.007,cz+.008),(outer+sign*.012,front_y(outer,cz+.014)-.008,cz+.014)],.0023,ink)
 tube('V4 soft brow',[(cx-.055,front_y(cx-.055,1.999)-.003,1.999),(cx,front_y(cx,2.009)-.004,2.009),(cx+.053,front_y(cx+.053,2.000)-.003,2.000)],.0024,brow)
 sphere('V4 ear',(sign*.229,-.005,1.89),(.025,.023,.044),skin)
 tube('V4 pearl earring wire',[(sign*.235,-.026,1.866),(sign*.243,-.028,1.823),(sign*.235,-.027,1.807)],.0022,silver)
 sphere('V4 earring sapphire',(sign*.235,-.027,1.800),(.008,.006,.014),gem)
tube('V4 small closed smile',[(x,front_y(x,z)-.0025,z) for x,z in [(-.027,1.790),(0,1.787),(.029,1.795)]],.0014,lips)
tube('V4 lower lip softness',[(x,front_y(x,z)-.002,z) for x,z in [(-.012,1.785),(0,1.783),(.012,1.786)]],.0008,lip_light)
# A sculpted bob shell and broad swept locks, with root-to-tip paint UVs.
hair_parts_start=len(parts);verts=[];uv=[];faces=[];n=72;rows=30
for j in range(rows+1):
 t=(j+.02)/(rows+.02)
 for i in range(n):
  a=i*math.tau/n;cut=np.clip((max(0,-math.sin(a))-.60)/.32,0,1);cut=cut*cut*(3-2*cut);theta=t*(2.45-1.40*cut)
  verts.append((.284*math.sin(theta)*math.cos(a),.015+.229*math.sin(theta)*math.sin(a),1.97+.335*math.cos(theta)));uv.append((i/n,1-t))
for j in range(rows):
 for i in range(n):a=j*n+i;b=j*n+(i+1)%n;faces.append((a,a+n,b+n,b))
faces.append(tuple(range(n)));finish('V4 rounded bob foundation',verts,faces,hair,uv=uv,sub=1)
def interp_path(points,t):
 points=[Vector(v) for v in points];u=t*(len(points)-1);k=min(len(points)-2,int(u));q=u-k;p0=points[max(0,k-1)];p1=points[k];p2=points[k+1];p3=points[min(len(points)-1,k+2)]
 return .5*((2*p1)+(-p0+p2)*q+(2*p0-5*p1+4*p2-p3)*q*q+(-p0+3*p1-3*p2+p3)*q*q*q)
def lock(name,path,widths,side=None):
 verts=[];uv=[];faces=[];rows=32;count=12
 for j in range(rows+1):
  t=j/rows;p=interp_path(path,t);tan=(interp_path(path,min(1,t+.01))-interp_path(path,max(0,t-.01))).normalized();across=Vector((0,1,0)) if side else Vector((1,0,0));across=(across-tan*across.dot(tan)).normalized();normal=tan.cross(across).normalized();w=float(np.interp(t,np.linspace(0,1,len(widths)),widths))
  for i in range(count):
   a=i*math.tau/count;ridge=1+.06*math.cos(a*3);verts.append(p+across*(math.cos(a)*w)+normal*(math.sin(a)*w*.16*ridge));uv.append((i/count,1-t))
 for j in range(rows):
  for i in range(count):a=j*count+i;b=j*count+(i+1)%count;faces.append((a,b,b+count,a+count))
 faces.extend([tuple(reversed(range(count))),tuple(rows*count+i for i in range(count))]);o=finish(name,verts,faces,hair,uv=uv,sub=1)
 if side:
  g=o.vertex_groups.new(name='hair.'+side);h=o.vertex_groups['head']
  for v in o.data.vertices:
   w=np.clip((1.94-v.co.z)*1.1,0,.24);g.add([v.index],float(w),'REPLACE');h.add([v.index],1-float(w),'REPLACE')
 return o
lock('V4 large side-swept fringe',[(.075,-.035,2.275),(.018,-.188,2.225),(-.118,-.247,2.085),(-.205,-.180,1.927)],[.019,.060,.051,.0025])
lock('V4 inner swept fringe',[(.10,-.015,2.28),(.10,-.17,2.245),(.025,-.252,2.10),(-.062,-.235,1.99)],[.018,.048,.041,.002])
lock('V4 right temple fringe',[(.112,.005,2.26),(.205,-.125,2.15),(.236,-.167,2.025),(.192,-.181,1.916)],[.019,.042,.035,.002])
def shell_x(y,z):
    vertical=np.clip((max(z,1.72)-1.97)/.335,-.77,.99);sine=math.sqrt(max(.01,1-vertical*vertical));ry=.229*sine
    return .284*sine*math.sqrt(max(.025,1-((y-.015)/ry)**2))
for sign,suffix in [(-1,'L'),(1,'R')]:
 for k in range(4):
  y=-.065+k*.055
  # Each lock follows the ellipsoid instead of floating on a fixed-X sheet.
  path=[(sign*shell_x(y,2.20)*.96,y,2.20),(sign*(shell_x(y,2.07)+.002),y,2.07),(sign*(shell_x(y+.014,1.835)+.002),y+.014,1.835),(sign*shell_x(y+.014,1.72)*.98,y+.014,1.70+.030*math.sin(k*1.3+(0 if sign>0 else .6)))]
  lock('V4 sculpted bob lock '+suffix+str(k),path,[.024,.048,.044,.003],suffix)
# Merge the rebuilt face into the body; give hair its own editable skinned item.
def join_into(target,objects):
 bpy.ops.object.select_all(action='DESELECT');target.hide_set(False);target.select_set(True)
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=target;bpy.ops.object.join();return target
head_parts=parts[:hair_parts_start];newhair=parts[hair_parts_start:];join_into(body,head_parts)
hair_obj=newhair[0];join_into(hair_obj,newhair[1:]);hair_obj.name='Heroine_hair';hair_obj.parent=rig;mod=hair_obj.modifiers.new('Shared anatomical skin','ARMATURE');mod.object=rig
dress=bpy.data.objects['Heroine_dress'];remove=set()
for poly in dress.data.polygons:
    if dress.data.materials[poly.material_index].name=='Sash_navy':remove.update(poly.vertices)
bm=bmesh.new();bm.from_mesh(dress.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS');bm.to_mesh(dress.data);bm.free();dress.data.update()
parts=[];verts=[];faces=[]
for j,z in enumerate([1.078,1.113,1.126]):
    for i in range(48):a=i*math.tau/48;verts.append((.152*math.cos(a),.106*math.sin(a),z))
for j in range(2):
    for i in range(48):a=j*48+i;b=j*48+(i+1)%48;faces.append((a,b,b+48,a+48))
finish('V4 silk waistband',verts,faces,navy,'pelvis',sub=1)
def silk(name,path,widths,bone):
    verts=[];faces=[]
    for i in range(41):
        t=i/40;p=interp_path(path,t);tangent=(interp_path(path,min(1,t+.01))-interp_path(path,max(0,t-.01))).normalized();side=Vector((-tangent.z,0,tangent.x)).normalized();w=float(np.interp(t,np.linspace(0,1,len(widths)),widths))
        for q in [-1,-.5,0,.5,1]:verts.append(p+side*q*w*.5+Vector((0,-.003*(1-q*q),0)))
    for i in range(40):
        for q in range(4):a=i*5+q;faces.append((a,a+1,a+6,a+5))
    return finish(name,verts,faces,navy,bone,sub=1)
for sign in [-1,1]:
    silk('V4 folded silk bow',[(0,-.129,1.109),(sign*.072,-.151,1.142),(sign*.108,-.140,1.120),(sign*.066,-.157,1.086),(0,-.136,1.109)],[.010,.025,.024,.020,.008],'pelvis')
    silk('V4 flowing silk tail',[(sign*.014,-.131,1.094),(sign*.030,-.165,.978),(sign*.047,-.211,.865),(sign*.068,-.248,.742 if sign>0 else .805)],[.028,.040,.044,.040],'ribbon')
sphere('V4 silk knot',(0,-.147,1.11),(.018,.011,.024),navy,'pelvis')
join_into(dress,parts)
# Remove the old cuboid jewelry beneath the new floral mount.
shawl=bpy.data.objects['Heroine_shawl'];allowed=set()
for poly in shawl.data.polygons:
    if shawl.data.materials[poly.material_index].name in ['Silver_filigree','Brooch_blue']:allowed.update(poly.vertices)
bm=bmesh.new();bm.from_mesh(shawl.data);bm.verts.ensure_lookup_table();victims=[bm.verts[i] for i in allowed if abs(bm.verts[i].co.x)<.080 and 1.52<bm.verts[i].co.z<1.63 and bm.verts[i].co.y<-.075]
bmesh.ops.delete(bm,geom=victims,context='VERTS');bm.to_mesh(shawl.data);bm.free();shawl.data.update()

# Tailored thread work and a layered silver/blue brooch, bound to the same skeleton.
parts=[]
for j in range(8):
 a=j*math.tau/8;center=Vector((math.cos(a)*.335,math.sin(a)*.238,.714));tangent=Vector((-math.sin(a),math.cos(a),0))
 for k in range(5):
  b=k*math.tau/5;pos=center+tangent*math.cos(b)*.016+Vector((0,0,math.sin(b)*.020));sphere('V4 hem flower stitch',pos,(.006,.006,.010),embroidery,'pelvis')
 tube('V4 hem leaf stem',[center+Vector((0,0,-.035)),center,center+Vector((0,0,.025))],.0018,embroidery,'pelvis')
for o in parts:
 for v in o.data.vertices:
  x,y,z=v.co;amount=float(np.clip((1.12-z)/.50,0,.85));raw={'skirt.L':max(0,-x)**2,'skirt.R':max(0,x)**2,'skirt.front':max(0,-y)**2,'skirt.back':max(0,y)**2};total=sum(raw.values()) or 1;o.vertex_groups['pelvis'].add([v.index],1-amount,'REPLACE')
  for key,value in raw.items():g=o.vertex_groups.get(key) or o.vertex_groups.new(name=key);g.add([v.index],amount*value/total,'REPLACE')
join_into(bpy.data.objects['Heroine_dress'],parts)
parts=[]
edge=[]
for i in range(97):
 a=-math.pi/2+.64+i/96*(math.tau-1.28);edge.append((math.cos(a)*.279,math.sin(a)*.156,1.324+.003*math.cos(a*12)))
tube('V4 shawl silver embroidery edge',edge,.0025,silver,'spine')
for sign in [-1,1]:
 for j in range(3):
  x=sign*(.14+j*.043);z=1.35+.012*math.sin(j);y=-.13+j*.022
  tube('V4 shawl embroidered sprig',[(x-sign*.014,y,z-.010),(x,y-.003,z+.009),(x+sign*.010,y,z+.025)],.0018,silver,'spine')
for k in range(5):
 a=k*math.tau/5;radial=Vector((math.cos(a),0,math.sin(a)));side=Vector((-math.sin(a),0,math.cos(a)));center=Vector((0,-.114,1.576));v=[]
 for j in range(9):
  t=j/8;p=center+radial*(.010+.034*t);w=.011*math.sin(math.pi*t)**.7
  v.extend([p-side*w+Vector((0,-.003*math.sin(math.pi*t),0)),p+side*w+Vector((0,-.003*math.sin(math.pi*t),0))])
 finish('V4 silver flower petal',v,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(8)],silver,'spine',sub=1)
sphere('V4 brooch cabochon',(0,-.125,1.576),(.015,.009,.021),gem,'spine')
join_into(bpy.data.objects['Heroine_shawl'],parts)
# Correct assignment remains explicit for every new part; hands and limbs stay unchanged.
for o in [body,hair_obj,bpy.data.objects['Heroine_dress'],bpy.data.objects['Heroine_shawl']]:
 for poly in o.data.polygons:poly.use_smooth=True
# Source-specific state; no shared project assets or runtime are modified.
rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
for obj in list(bpy.data.objects):
 if obj.type in ['CAMERA','LIGHT']:bpy.data.objects.remove(obj,do_unlink=True)
studio=bpy.data.collections.new('V4 studio - not exported');bpy.context.scene.collection.children.link(studio)
floor_mat=material('V4 studio blue slate','536579',rough=.9)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));floor=bpy.context.object;floor.name='V4 Studio Floor';floor.data.materials.append(floor_mat)
def light(name,position,power,size,color):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(name,d);studio.objects.link(o);o.location=position;o.rotation_euler=(Vector((0,0,1.2))-o.location).to_track_quat('-Z','Y').to_euler()
light('V4 warm key',(-3,-4,5.5),300,4,(1,.94,.89));light('V4 pearl fill',(4,-2,3.5),150,3,(.86,.92,1));light('V4 silver rim',(1.5,3,4),350,3,(.85,.91,1))
d=bpy.data.cameras.new('V4 beauty camera');cam=bpy.data.objects.new('V4 beauty camera',d);studio.objects.link(cam);cam.location=(2.5,-7,3.1);cam.rotation_euler=(Vector((0,0,1.2))-cam.location).to_track_quat('-Z','Y').to_euler();d.type='ORTHO';d.ortho_scale=2.90
scene=bpy.context.scene;scene.camera=cam;scene.render.engine='BLENDER_EEVEE_NEXT';scene.eevee.taa_render_samples=64;scene.render.resolution_x=800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.film_transparent=False
scene.world.use_nodes=True;scene.world.node_tree.nodes.get('Background').inputs[0].default_value=(.24,.29,.38,1);scene.world.node_tree.nodes.get('Background').inputs[1].default_value=.40
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(P/'beauty-v4.png')
# Export a standalone review model, then restore the author's clothed view.
review=P/'review';review.mkdir(exist_ok=True);bpy.ops.object.select_all(action='DESELECT');masks=[]
for o in bpy.data.objects:
 if o.name.startswith('Heroine_') or o==rig:
  o.hide_set(False);o.select_set(True)
  for m in o.modifiers:
   if m.type=='MASK':masks.append(m);m.show_viewport=False;m.show_render=False
bpy.context.view_layer.objects.active=rig
options=dict(filepath=str(review/'heroine-v4-review.glb'),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=True,export_animation_mode='ACTIONS',export_all_armature_actions=True,export_force_sampling=True,export_def_bones=True)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in valid})
for m in masks:m.show_viewport=True;m.show_render=True
for key in ['blouse','skirt','boots_navy']:bpy.data.objects['Heroine_'+key].hide_set(True);bpy.data.objects['Heroine_'+key].hide_render=True
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=3.5;area.spaces.active.region_3d.view_location=(0,0,1.2);area.spaces.active.region_3d.view_rotation=cam.rotation_euler.to_quaternion();area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v4.blend'))
bpy.ops.render.render(write_still=True)
# Neutral front close-up exposes the real face, not a camera-bent head.
cam.location=(0,-4,2.14);cam.rotation_euler=(Vector((0,-.03,1.97))-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=.90;scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.filepath=str(P/'face-v4.png');bpy.ops.render.render(write_still=True)
print('V4_REVIEW_BUILT',str(P/'heroine-v4.blend'),flush=True)
