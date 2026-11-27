"""Build the original Arcana B hero as an editable, painted and rigged Blender asset.
Run through scripts/build-blender-hero.ps1; all inputs/outputs stay in this project.
"""
import bpy, math, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi, tau

ROOT=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-studies/arcana-hero/blender'
GAME=ROOT/'godot-arcana/art/models/hero'
SOURCE.mkdir(parents=True,exist_ok=True); GAME.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for coll in list(bpy.data.collections):
    if coll.name != 'Collection' and coll.users == 0: bpy.data.collections.remove(coll)
character=bpy.data.collections.new('CHARACTER - painted hero'); bpy.context.scene.collection.children.link(character)
studio=bpy.data.collections.new('STUDIO - render only'); bpy.context.scene.collection.children.link(studio)
parts=[]

def material(name, color, paint=None, metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=.72 if not metal else .38
    bs.inputs['Metallic'].default_value=metal
    if paint:
        size=512
        y,x=np.mgrid[0:size,0:size].astype(np.float32)/(size-1)
        field=.88+.15*y+.035*np.sin(x*19+y*5)+.018*np.sin(x*67-y*11)
        if paint=='hair': field=.71+.24*np.sin(x*pi)**2+.18*np.exp(-((y-.65)/.18)**2)+.035*np.sin(x*97+y*8)
        elif paint=='leather': field=.77+.19*y+.045*np.sin(x*16)+.025*np.cos(y*23+x*5)
        elif paint=='skin': field=.88+.12*y+.035*np.cos(x*tau)
        rgb=np.clip(field[...,None]*np.array(color,dtype=np.float32),0,1)
        if paint=='skin':
            blush=np.exp(-((x-.65)/.045)**2-((y-.47)/.12)**2)+np.exp(-((x-.85)/.045)**2-((y-.47)/.12)**2)
            rgb=rgb*(1-blush[...,None]*.15)+np.array([.78,.29,.24])*blush[...,None]*.15
        image=bpy.data.images.new(name+'_paint',width=size,height=size,alpha=True)
        image.pixels.foreach_set(np.concatenate([rgb,np.ones((size,size,1),dtype=np.float32)],axis=2).astype(np.float32).ravel())
        image.filepath_raw=str(SOURCE/(name+'_paint.png')); image.file_format='PNG'; image.save(); image.pack()
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
        m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    return m

coat=material('Coat_teal',(.12,.34,.38),'cloth')
coat_light=material('Coat_lapel',(.18,.43,.45),'cloth')
lining=material('Coat_lining',(.065,.20,.25),'cloth')
shirt=material('Ivory_shirt',(.89,.84,.71),'cloth')
trousers=material('Charcoal_trousers',(.17,.20,.23),'cloth')
leather=material('Chestnut_leather',(.30,.15,.075),'leather')
leather_light=material('Leather_edges',(.47,.27,.12),'leather')
sole=material('Boot_soles',(.025,.018,.012))
gold=material('Antique_gold',(.65,.43,.16),metal=.25)
thread=material('Ochre_stitch',(.62,.45,.23))
skin=material('Warm_skin',(.95,.69,.43),'skin')
rose=material('Lips_and_ear',(.35,.12,.09))
hair=material('Chestnut_hair',(.28,.14,.065),'hair')
hair_light=material('Hair_highlight',(.39,.215,.095),'hair')
eye_white=material('Eye_ivory',(.94,.90,.78))
iris=material('Brown_iris',(.31,.16,.065))
ink=material('Lashes_and_pupil',(.07,.045,.025))
highlight=material('Eye_catchlight',(1,.97,.85))

def link(obj,coll=character):
    for c in list(obj.users_collection): c.objects.unlink(obj)
    coll.objects.link(obj)

def finish(obj, mat, bone, bevel=0, sub=0):
    link(obj); obj.data.materials.append(mat)
    for poly in obj.data.polygons: poly.use_smooth=True
    bpy.context.view_layer.objects.active=obj; obj.select_set(True)
    if bevel:
        mod=obj.modifiers.new('Soft tailored edges','BEVEL'); mod.width=bevel; mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if sub:
        mod=obj.modifiers.new('Sculpted surface','SUBSURF'); mod.levels=sub
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if not obj.data.uv_layers:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=.025); bpy.ops.object.mode_set(mode='OBJECT')
    if bone:
        group=obj.vertex_groups.new(name=bone); group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    parts.append(obj); obj.select_set(False)
    return obj

def mesh(name, verts, faces, mat, bone, bevel=0, sub=0, uvs=None):
    data=bpy.data.meshes.new(name); data.from_pydata(verts,[],faces); data.update()
    obj=bpy.data.objects.new(name,data); character.objects.link(obj)
    if uvs:
        uv=data.uv_layers.new(name='PaintUV')
        for poly in data.polygons:
            for index in poly.loop_indices: uv.data[index].uv=uvs[data.loops[index].vertex_index]
    return finish(obj,mat,bone,bevel,sub)

def loft(name,rings,mat,bone,segments=16,opening=0,sub=1):
    # z, radius x, radius y, y offset; front is Blender -Y / Godot +Z.
    verts=[]; uvs=[]; faces=[]
    count=segments+1 if opening else segments
    for row,(z,rx,ry,cy) in enumerate(rings):
        for col in range(count):
            u=col/(count-1) if opening else col/segments
            angle=-pi/2+opening+u*(tau-2*opening) if opening else u*tau
            verts.append((cos(angle)*rx,cy+sin(angle)*ry,z)); uvs.append((u,row/(len(rings)-1)))
    for row in range(len(rings)-1):
        for col in range(count-1 if opening else count):
            a=row*count+col;b=row*count+(col+1)%count
            faces.append((a,b,b+count,a+count))
    if not opening:
        faces.append(tuple(reversed(range(count)))); faces.append(tuple((len(rings)-1)*count+i for i in range(count)))
    obj=mesh(name,verts,faces,mat,bone,sub=sub,uvs=uvs)
    if opening:
        bpy.context.view_layer.objects.active=obj
        mod=obj.modifiers.new('Real cloth thickness','SOLIDIFY');mod.thickness=.009
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def ellipsoid(name,center,scale,mat,bone,segments=20,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=center)
    obj=bpy.context.object;obj.name=name;obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,mat,bone)

def box(name,center,size,mat,bone,bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=center)
    obj=bpy.context.object;obj.name=name;obj.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(obj,mat,bone,bevel)

def curve(name,points,radius,mat,bone):
    data=bpy.data.curves.new(name,'CURVE');data.dimensions='3D';data.resolution_u=8
    data.bevel_depth=radius;data.bevel_resolution=2
    spline=data.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for p,co in zip(spline.bezier_points,points): p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,data);character.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target='MESH'); obj=bpy.context.object
    return finish(obj,mat,bone)

def strap(name,points,width,mat,bone):
    verts=[]
    for i,co in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        side=tangent.cross(Vector((0,1,0))).normalized()*width/2
        verts.extend([Vector(co)+side,Vector(co)-side])
    faces=[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(points)-1)]
    obj=mesh(name,verts,faces,mat,bone,sub=1)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Leather thickness','SOLIDIFY');mod.thickness=.009;bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def hair_lock(name,points,widths,mat=hair):
    verts=[];faces=[];uvs=[];n=8
    for row,co in enumerate(points):
        tangent=(Vector(points[min(row+1,len(points)-1)])-Vector(points[max(row-1,0)])).normalized()
        side=Vector((1,0,0));side=(side-tangent*side.dot(tangent)).normalized()
        if side.length<.1: side=Vector((0,1,0))
        normal=tangent.cross(side).normalized()
        for i in range(n):
            angle=tau*i/n
            verts.append(Vector(co)+side*cos(angle)*widths[row]+normal*sin(angle)*widths[row]*.26)
            uvs.append((i/n,row/(len(points)-1)))
    for row in range(len(points)-1):
        for i in range(n):
            a=row*n+i;b=row*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    faces.append(tuple(reversed(range(n)))); faces.append(tuple((len(points)-1)*n+i for i in range(n)))
    return mesh(name,verts,faces,mat,'head',sub=1,uvs=uvs)

# Anatomical core and open, tailored coat.
loft('Shirt body',[(.80,.19,.12,0),(.94,.205,.13,0),(1.20,.255,.16,0),(1.36,.245,.145,0),(1.43,.105,.085,0)],shirt,'spine',sub=2)
loft('Open teal coat',[(.83,.225,.145,0),(.96,.228,.155,0),(1.23,.278,.185,0),(1.36,.26,.17,0),(1.43,.115,.10,0)],coat,'spine',24,.44,2)
# Long split hem. The pale shirt and trousers remain visible through the front opening.
loft('Flowing coat skirt',[(.43,.325,.22,.015),(.50,.32,.215,.012),(.68,.275,.185,.005),(.86,.228,.15,0)],coat,'pelvis',24,.68,2)
# Golden edging follows actual garment contours.
for sign in [-1,1]:
    curve('Coat front edging',[(sign*.203,-.143,.45),(sign*.17,-.137,.66),(sign*.10,-.148,.89),(sign*.12,-.18,1.14),(sign*.10,-.12,1.42)],.0055,thread,'spine')
    curve('Ivory collar',[(sign*.028,-.094,1.47),(sign*.094,-.112,1.40),(sign*.065,-.16,1.34)],.015,shirt,'spine')
# Shoulder cape: a curved open garment with thickness, a raised collar and stitched hem.
loft('Short shoulder mantle',[(1.195,.365,.225,.01),(1.23,.35,.22,.005),(1.37,.28,.19,0),(1.465,.13,.115,0)],coat_light,'spine',24,.61,2)
hem=[]
for i in range(33):
    a=-pi/2+.61+i/32*(tau-1.22);hem.append((cos(a)*.363,sin(a)*.226+.01,1.204+.006*cos(a*2)))
curve('Mantle gold hem',hem,.0065,thread,'spine')
loft('Raised coat collar',[(1.405,.12,.105,0),(1.46,.12,.105,0),(1.48,.105,.092,0)],coat,'spine',16,.6,1)
# Fine stitches form a readable seam rather than random surface noise.
for sign in [-1,1]:
    for i in range(8):
        z=.53+i*.075
        curve('Coat stitch',[(sign*(.192-(z-.53)*.17),-.155,z),(sign*(.188-(z-.53)*.17),-.155,z+.012)],.0017,thread,'spine')
loft('Waist belt',[(.845,.231,.155,0),(.895,.235,.157,0)],leather,'pelvis',24,0,1)
for cx,cz,sx,sz in [(0,.871,.10,.012),(0,.821,.10,.012),(-.05,.846,.012,.05),(.05,.846,.012,.05)]:
    box('Gold belt buckle',(cx,-.166,cz),(sx,.018,sz),gold,'pelvis',.004)
# Diagonal strap, front and back, with a formed bag on the right hip.
strap('Satchel strap front',[(-.15,-.14,1.43),(-.10,-.22,1.27),(.06,-.205,1.03),(.27,-.14,.82)],.047,leather,'spine')
strap('Satchel strap back',[(-.15,.13,1.43),(-.09,.205,1.23),(.08,.18,1.02),(.28,.10,.82)],.047,leather,'spine')
bag=box('Formed leather satchel',(.31,-.035,.77),(.225,.17,.245),leather,'pelvis',.025)
box('Satchel folded flap',(.31,-.13,.825),(.235,.033,.13),leather_light,'pelvis',.017)
for x in [.245,.375]:
    box('Satchel strap',(x,-.154,.77),(.022,.012,.115),leather,'pelvis',.004)
    box('Satchel clasp',(x,-.164,.79),(.035,.012,.033),gold,'pelvis',.004)
# A subtle center seam and buttons keep the shirt readable through the coat opening.
curve('Shirt placket',[(0,-.135,.94),(0,-.165,1.20),(.015,-.11,1.40)],.004,thread,'spine')
for z in [1.02,1.14,1.26]: ellipsoid('Shirt button',(0,-.17,z),(.009,.006,.009),gold,'spine',12,8)
# Trousers, shaped boots, cuffs and hands with individual fingers.
for sign,suffix in [(-1,'L'),(1,'R')]:
    x=sign*.125
    leg=loft('Trouser '+suffix,[(.44,.085,.085,0),(.53,.095,.095,0),(.71,.115,.115,0),(.84,.12,.115,0)],trousers,'thigh.'+suffix,16,0,2);leg.location.x=x
    boot=loft('Boot shaft '+suffix,[(.105,.075,.085,0),(.20,.078,.09,0),(.37,.094,.10,0),(.445,.105,.108,0)],leather,'shin.'+suffix,16,0,2);boot.location.x=x
    cuff=loft('Folded boot cuff '+suffix,[(.405,.11,.115,0),(.445,.115,.12,0),(.46,.11,.115,0)],leather_light,'shin.'+suffix,16,0,1);cuff.location.x=x
    box('Sculpted boot vamp '+suffix,(x,-.065,.088),(.18,.29,.115),leather,'foot.'+suffix,.036)
    box('Boot heel '+suffix,(x,.04,.034),(.155,.10,.055),sole,'foot.'+suffix,.008)
    box('Layered sole '+suffix,(x,-.07,.025),(.19,.33,.035),sole,'foot.'+suffix,.025)
    curve('Boot toe seam '+suffix,[(x-.075,-.15,.10),(x,-.19,.13),(x+.075,-.15,.10)],.004,leather_light,'foot.'+suffix)
    for z in [.235,.32]:
        curve('Boot cross strap '+suffix,[(x-.06,-.07,z),(x,-.093,z-.006),(x+.06,-.07,z)],.008,leather_light,'shin.'+suffix)
    # Arms are slightly open in bind pose and use smoothly tapered sleeves.
    ax=sign*.305
    upper=loft('Continuous tailored sleeve '+suffix,[(.815,.068,.068,0),(.88,.075,.075,0),(.99,.080,.082,0),(1.06,.085,.087,0),(1.18,.094,.10,0),(1.29,.10,.10,0),(1.35,.085,.09,0)],coat,'upper_arm.'+suffix,16,0,2);upper.location.x=ax
    cuff=loft('Gold sleeve cuff '+suffix,[(.81,.079,.077,0),(.846,.082,.079,0)],leather_light,'forearm.'+suffix,16,0,1);cuff.location.x=ax
    linen=loft('Linen wrist '+suffix,[(.765,.064,.059,0),(.815,.07,.066,0)],shirt,'hand.'+suffix,16,0,1);linen.location.x=ax
    ellipsoid('Hand palm '+suffix,(ax,-.003,.726),(.06,.04,.068),skin,'hand.'+suffix)
    for j in range(4):
        fx=ax+(j-1.5)*.022
        curve('Finger '+suffix,[(fx,-.011,.715),(fx,-.022,.678-abs(j-1.5)*.005),(fx,-.04,.666-abs(j-1.5)*.005)],.0115,skin,'hand.'+suffix)
    curve('Thumb '+suffix,[(ax-sign*.042,-.007,.745),(ax-sign*.069,-.026,.718),(ax-sign*.061,-.048,.697)],.017,skin,'hand.'+suffix)
# Face: sculpted jaw, cheek plane, brow ridge and small nose.
loft('Neck',[(1.40,.065,.063,0),(1.55,.072,.065,0)],skin,'head',16,0,2)
loft('Sculpted face',[(1.475,.065,.072,-.005),(1.505,.105,.10,-.005),(1.565,.165,.142,0),(1.66,.205,.163,.005),(1.755,.20,.165,.01),(1.825,.165,.14,.02),(1.865,.08,.08,.02)],skin,'head',24,0,2)
def face_y(x,z):
    # Forehead/cheek curvature from the head loft, offset only millimetres.
    return .004-.160*math.sqrt(max(.15,1-(x/.212)**2))
def eye_patch(name,cx,cz,rx,rz,mat,offset):
    verts=[(cx,face_y(cx,cz)-offset,cz)];uvs=[(.5,.5)]
    for i in range(32):
        a=i*tau/32;x=cx+cos(a)*rx;z=cz+sin(a)*rz
        verts.append((x,face_y(x,z)-offset,z));uvs.append((.5+.5*cos(a),.5+.5*sin(a)))
    return mesh(name,verts,[(0,i+1,(i+1)%32+1) for i in range(32)],mat,'head',uvs=uvs)
for sign in [-1,1]:
    ellipsoid('Ear', (sign*.198,.002,1.65),(.032,.027,.057),skin,'head')
    ellipsoid('Ear inset',(sign*.211,-.019,1.65),(.012,.008,.027),rose,'head',16,8)
    x=sign*.082
    eye_patch('Inset almond eye',x,1.674,.053,.029,eye_white,.003)
    eye_patch('Brown iris',x-sign*.004,1.675,.021,.026,iris,.0045)
    eye_patch('Pupil',x-sign*.004,1.676,.009,.018,ink,.006)
    eye_patch('Eye light',x-sign*.011,1.687,.0055,.007,highlight,.008)
    eyelid=[(x-sign*.050,1.677),(x,1.702),(x+sign*.047,1.689)]
    curve('Upper eyelid',[(px,face_y(px,pz)-.005,pz) for px,pz in eyelid],.0045,ink,'head')
    brow=[(x-sign*.045,1.747),(x,1.755),(x+sign*.042,1.744)]
    curve('Eyebrow',[(px,face_y(px,pz)+.004,pz) for px,pz in brow],.006,hair,'head')
ellipsoid('Nose bridge',(0,-.153,1.65),(.018,.017,.038),skin,'head')
ellipsoid('Nose tip',(0,-.170,1.624),(.019,.018,.015),skin,'head')
curve('Gentle smile',[(-.027,-.136,1.563),(0,-.145,1.560),(.027,-.136,1.566)],.003,rose,'head')
# Swept cap and individually sculpted tapered locks preserve the approved hairstyle.
loft('Hair crown',[(1.69,.205,.15,.035),(1.79,.235,.19,.025),(1.89,.19,.17,.025),(1.955,.11,.10,.02),(1.98,.018,.018,.015)],hair,'head',24,0,2)
fringes=[
([(-.20,-.03,1.84),(-.16,-.13,1.91),(-.095,-.185,1.84),(-.15,-.183,1.72)],[.05,.075,.06,.002]),
([(-.13,-.04,1.91),(-.08,-.14,1.955),(.005,-.19,1.875),(-.06,-.183,1.76)],[.055,.077,.058,.002]),
([(-.045,-.025,1.95),(.035,-.13,1.96),(.105,-.19,1.855),(.055,-.192,1.74)],[.055,.075,.05,.002]),
([(.03,-.01,1.95),(.13,-.10,1.93),(.195,-.155,1.82),(.16,-.17,1.73)],[.05,.07,.055,.002])]
for i,(points,widths) in enumerate(fringes):hair_lock('Swept fringe '+str(i),points,widths,hair_light if i==1 else hair)
for sign in [-1,1]:
    for i in range(4):
        hair_lock('Side lock',[(sign*.16,.015+i*.024,1.85-i*.023),(sign*.23,.015+i*.03,1.81-i*.035),(sign*.245,.04+i*.04,1.72-i*.036),(sign*.19,.035+i*.04,1.65-i*.035)],[.06,.066,.042,.001])
    hair_lock('Sideburn',[(sign*.185,-.075,1.78),(sign*.203,-.093,1.71),(sign*.183,-.085,1.62)],[.035,.03,.001])
for i in range(5):
    x=(i-2)*.07
    hair_lock('Nape lock',[(x,.10,1.84),(x,.19,1.76),(x*.95,.185,1.63),(x*.8,.14,1.59)],[.055,.055,.035,.001])
hair_lock('Signature forelock',[(-.025,.03,1.93),(.015,.015,2.01),(.07,.005,2.04),(.055,-.018,1.99)],[.032,.028,.018,.001],hair_light)
# All parts become one skinned mesh with separate painted material slots.
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join()
body=bpy.context.object;body.name='HeroMesh'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# Deforming bone hierarchy in the rest pose. No billboard geometry.
arm=bpy.data.armatures.new('HeroSkeleton');rig=bpy.data.objects.new('HeroRig',arm);character.objects.link(rig)
bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
    return b
bone('root',(0,0,0),(0,0,.20));bone('pelvis',(0,0,.80),(0,0,.94),'root');bone('spine',(0,0,.94),(0,0,1.43),'pelvis');bone('head',(0,0,1.43),(0,0,1.85),'spine')
for sign,suffix in [(-1,'L'),(1,'R')]:
    x=sign*.125;ax=sign*.305
    bone('thigh.'+suffix,(x,0,.82),(x,0,.46),'pelvis');bone('shin.'+suffix,(x,0,.46),(x,0,.13),'thigh.'+suffix);bone('foot.'+suffix,(x,0,.13),(x,-.17,.055),'shin.'+suffix)
    bone('upper_arm.'+suffix,(ax,0,1.35),(ax,0,1.06),'spine');bone('forearm.'+suffix,(ax,0,1.06),(ax,0,.805),'upper_arm.'+suffix);bone('hand.'+suffix,(ax,0,.805),(ax,0,.675),'forearm.'+suffix)
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
modifier=body.modifiers.new('Hero armature','ARMATURE');modifier.object=rig;body.parent=rig
# Turn rigid part boundaries into smooth sleeve transitions around the elbow.
for suffix in ['L','R']:
    upper=body.vertex_groups.get('upper_arm.'+suffix);lower=body.vertex_groups.get('forearm.'+suffix)
    for v in body.data.vertices:
        assigned={g.group:g.weight for g in v.groups}
        if upper.index in assigned or lower.index in assigned:
            blend=max(0,min(1,(1.11-v.co.z)/.12));upper.add([v.index],1-blend,'REPLACE');lower.add([v.index],blend,'REPLACE')
# Two named, baked game actions. Playback rate in Godot follows actual distance.
rig.animation_data_create()
for label,count in [('Idle',61),('Walk',25)]:
    action=bpy.data.actions.new(label);rig.animation_data.action=action
    for frame in range(1,count+1):
        t=(frame-1)/(count-1)*tau
        for pose in rig.pose.bones:
            pose.rotation_mode='XYZ';pose.rotation_euler=(0,0,0);pose.location=(0,0,0)
        if label=='Walk':
            swing=sin(t)*.48
            for sign,suffix in [(1,'L'),(-1,'R')]:
                rig.pose.bones['thigh.'+suffix].rotation_euler.x=sign*swing
                rig.pose.bones['shin.'+suffix].rotation_euler.x=max(0,sign*sin(t))*.66
                rig.pose.bones['foot.'+suffix].rotation_euler.x=-sign*swing*.35
                rig.pose.bones['upper_arm.'+suffix].rotation_euler.x=-sign*swing*.80-.08
                rig.pose.bones['forearm.'+suffix].rotation_euler.x=-.12-max(0,-sign*swing)*.25
            rig.pose.bones['spine'].rotation_euler.z=sin(t)*.025
            rig.pose.bones['root'].location.y=abs(sin(t))*.018
        else:
            rig.pose.bones['spine'].rotation_euler.x=sin(t)*.012
            rig.pose.bones['head'].rotation_euler.z=sin(t)*.018
        for pose in rig.pose.bones:
            pose.keyframe_insert(data_path='rotation_euler',frame=frame,group=pose.name)
            pose.keyframe_insert(data_path='location',frame=frame,group=pose.name)
    action.use_fake_user=True
rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
# Export a lighter copy, retaining the complete editable source mesh.
game_body=body.copy();game_body.data=body.data.copy();character.objects.link(game_body);game_body.name='HeroGameMesh'
bpy.ops.object.select_all(action='DESELECT');game_body.select_set(True);bpy.context.view_layer.objects.active=game_body
reduce=game_body.modifiers.new('Game topology reduction','DECIMATE');reduce.ratio=.38;reduce.use_collapse_triangulate=True
bpy.ops.object.modifier_move_up(modifier=reduce.name)
bpy.ops.object.modifier_apply(modifier=reduce.name)
game_triangles=sum(len(poly.vertices)-2 for poly in game_body.data.polygons)
rig.select_set(True);bpy.context.view_layer.objects.active=rig
options=dict(filepath=str(GAME/'hero.blender.glb'),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=True,export_animation_mode='ACTIONS',export_all_armature_actions=True,export_force_sampling=True)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();options={k:v for k,v in options.items() if k in valid}
bpy.ops.export_scene.gltf(**options)
bpy.data.objects.remove(game_body,do_unlink=True)
# A small studio in the editable .blend and an actual Blender beauty render.
def studio_link(obj):link(obj,studio);return obj
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02));floor=studio_link(bpy.context.object);floor.name='Studio ground'
floor.data.materials.append(material('Studio taupe',(.23,.265,.26)))
def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Warm key',(-3,-4,6),450,4,(1,.85,.68));area('Cool fill',(3,-2,3),230,3,(.67,.80,1));area('Hair rim',(1,3,4),600,3,(1,.78,.52))
camera_data=bpy.data.cameras.new('Hero portrait camera');camera=bpy.data.objects.new('Hero portrait camera',camera_data);studio.objects.link(camera)
camera.location=(3,-6,3.0);camera.rotation_euler=(Vector((0,0,1.02))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=2.65
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=768;scene.render.resolution_y=896;scene.render.resolution_percentage=100
scene.world.color=(.16,.18,.21);scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(SOURCE/'hero-blender-beauty.png')
scene.frame_end=61
# Record the measurable mesh contract for Godot and future edits.
triangles=sum(len(poly.vertices)-2 for poly in body.data.polygons)
report=dict(blender=bpy.app.version_string,vertices=len(body.data.vertices),triangles=triangles,game_triangles=game_triangles,bones=len(arm.bones),materials=len(body.data.materials),actions=['Idle','Walk'],source='hero.blend',game_asset='godot-arcana/art/models/hero/hero.blender.glb',design='Approved B: brown hair, teal coat/mantle, ivory shirt, leather satchel and boots')
(SOURCE/'production.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
# Select the real mesh for immediate editing when the file is opened.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
for screen in bpy.data.screens:
    for space in screen.areas:
        if space.type=='VIEW_3D':
            space.spaces.active.region_3d.view_distance=3.3;space.spaces.active.region_3d.view_location=(0,0,1);space.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            space.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'hero.blend'))
if '--no-render' not in sys.argv: bpy.ops.render.render(write_still=True)
print('ARCANA_HERO_PRODUCTION '+json.dumps(report),flush=True)
