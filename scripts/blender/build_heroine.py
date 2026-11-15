"""Build approved white-bob heroine candidate 2 as an editable, painted and rigged Blender asset.
Run through scripts/build-blender-hero.ps1; all inputs/outputs stay in this project.
"""
import bpy, math, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi, tau

ROOT=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-studies/arcana-hero/white-bob-heroine/blender'
GAME=ROOT/'godot-arcana/art/models/heroine'
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
        field=.95+.055*y+.018*np.cos(x*3*tau+y*2)
        if paint=='hair': field=.71+.24*np.sin(x*pi)**2+.18*np.exp(-((y-.65)/.18)**2)+.012*np.sin(x*31+y*6)
        elif paint=='leather': field=.77+.19*y+.045*np.sin(x*16)+.025*np.cos(y*23+x*5)
        elif paint=='skin': field=.88+.12*y+.035*np.cos(x*tau)
        rgb=np.clip(field[...,None]*np.array(color,dtype=np.float32),0,1)
        if paint=='skin':
            blush=np.exp(-((x-.65)/.045)**2-((y-.47)/.12)**2)+np.exp(-((x-.85)/.045)**2-((y-.47)/.12)**2)
            rgb=rgb*(1-blush[...,None]*.15)+np.array([.78,.29,.24])*blush[...,None]*.15
        if paint in ['dress','cape']:
            # Painted stems, paired leaves and six-petal flowers near the hem.
            mark=np.zeros_like(x)
            for j in range(7):
                u=(j+.5)/7
                stem=np.exp(-((x-u-.007*np.sin((y-.08)*30))/.002)**2)*((y>.07)&(y<.25))
                mark=np.maximum(mark,stem)
                for v in [.12,.18]:
                    for side in [-1,1]:
                        dx=(x-u-side*.012);dy=(y-v)
                        leaf=np.exp(-((dx+side*dy*.30)/.014)**2-((dy-side*dx*.7)/.008)**2)
                        mark=np.maximum(mark,leaf*.85)
                for petal in range(6):
                    a=petal*tau/6
                    flower=np.exp(-((x-u-cos(a)*.013)/.008)**2-((y-.26-sin(a)*.018)/.011)**2)
                    mark=np.maximum(mark,flower)
            band=np.exp(-((y-.035)/.006)**2)
            mark=np.maximum(mark,band)
            color=np.array([.38,.44,.52] if paint=='dress' else [.69,.74,.81],dtype=np.float32)
            rgb=rgb*(1-mark[...,None]*.65)+color*mark[...,None]*.65
        image=bpy.data.images.new(name+'_paint',width=size,height=size,alpha=True)
        image.pixels.foreach_set(np.concatenate([rgb,np.ones((size,size,1),dtype=np.float32)],axis=2).astype(np.float32).ravel())
        image.filepath_raw=str(SOURCE/(name+'_paint.png')); image.file_format='PNG'; image.save(); image.pack()
        tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
        m.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
    return m

ivory=material('Dress_ivory',(.82,.80,.73),'cloth')
skirt_paint=material('Dress_floral_hem',(.82,.80,.73),'dress')
blue=material('Cape_periwinkle',(.25,.38,.58),'cape')
blue_light=material('Blue_collar_edge',(.35,.49,.67),'cloth')
ribbon=material('Sash_navy',(.065,.14,.26),'cloth')
stockings=material('Stockings_charcoal',(.055,.060,.085),'cloth')
boots=material('Boots_taupe',(.38,.29,.25),'leather')
boot_edges=material('Boot_stitch',(.51,.42,.36))
sole=material('Boot_soles',(.045,.04,.04))
silver=material('Silver_filigree',(.63,.68,.73),metal=.20)
skin=material('Pearl_skin',(.95,.76,.65),'skin')
rose=material('Soft_lips',(.55,.30,.31))
hair=material('Pearl_white_hair',(.82,.85,.91),'hair')
hair_light=material('White_hair_glints',(.92,.94,.96),'hair')
hair_shadow=material('Bob_underlayer',(.55,.59,.66),'hair')
eye_white=material('Eye_ivory',(.95,.94,.91))
iris=material('Lavender_iris',(.32,.18,.49))
iris_light=material('Iris_lilac',(.51,.35,.66))
ink=material('Soft_violet_lashes',(.07,.065,.10))
brow_mat=material('Silver_eyebrow',(.30,.31,.36))
highlight=material('Eye_catchlight',(1,.98,.97))
gem=material('Brooch_blue',(.26,.38,.60),metal=.10)

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

# Candidate 2: fitted ivory dress, layered periwinkle mantle, a silver-white bob.
loft('Ivory fitted bodice',[(1.065,.14,.09,0),(1.14,.148,.10,0),(1.30,.177,.108,-.004),(1.43,.193,.112,0),(1.535,.16,.095,0),(1.61,.064,.058,0)],ivory,'spine',24,0,2)
# Cloth controls blend through the whole hem, rather than making rigid panels.
def cloth_weights(obj):
    groups={name:obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name) for name in ['pelvis','skirt.L','skirt.R','skirt.front','skirt.back']}
    for v in obj.data.vertices:
        x,y,z=v.co;amount=max(0,min(.85,(1.12-z)/.50))
        raw={'skirt.L':max(0,-x)**2,'skirt.R':max(0,x)**2,'skirt.front':max(0,-y)**2,'skirt.back':max(0,y)**2}
        total=sum(raw.values()) or 1
        groups['pelvis'].add([v.index],1-amount,'REPLACE')
        for key,weight in raw.items():groups[key].add([v.index],amount*weight/total,'REPLACE')

def dress_skirt():
    rings=[(.665,.30,.225),(.685,.325,.24),(.735,.315,.23),(.85,.275,.195),(.995,.20,.14),(1.085,.151,.103),(1.115,.145,.10)]
    n=48;verts=[];uvs=[];faces=[]
    for row,(z,rx,ry) in enumerate(rings):
        drop=(1.12-z)/.46
        for i in range(n):
            a=i*tau/n;pleat=1+.038*drop*cos(a*12)
            hem_curve=.018*drop*cos(a)+.012*drop*cos(a*3)
            verts.append((cos(a)*rx*pleat,sin(a)*ry*pleat,z+hem_curve));uvs.append((i/n,row/(len(rings)-1)))
    for row in range(len(rings)-1):
        for i in range(n):
            a=row*n+i;b=row*n+(i+1)%n;faces.append((a,b,b+n,a+n))
    obj=mesh('Soft pleated ivory skirt',verts,faces,skirt_paint,'pelvis',sub=2,uvs=uvs)
    bpy.context.view_layer.objects.active=obj
    mod=obj.modifiers.new('Lined dress thickness','SOLIDIFY');mod.thickness=.008;bpy.ops.object.modifier_apply(modifier=mod.name)
    cloth_weights(obj)
    return obj
skirt=dress_skirt()
# A fine ivory hem and a dark-blue waist bow preserve the illustration's landmarks.
hem_points=[]
for i in range(65):
    a=i*tau/64;pleat=1+.038*cos(a*12)
    hem_points.append((cos(a)*.305*pleat,sin(a)*.23*pleat,.677+.018*cos(a)+.012*cos(a*3)))
hem=curve('Ivory rolled hem',hem_points,.0045,ivory,'pelvis');cloth_weights(hem)
loft('Navy waist sash',[(1.065,.150,.105,0),(1.13,.153,.107,0)],ribbon,'pelvis',24,0,1)
for sign in [-1,1]:
    strap('Bow loop',[(0,-.116,1.105),(sign*.09,-.145,1.155),(sign*.145,-.126,1.12),(sign*.075,-.156,1.085),(0,-.13,1.105)],.032,ribbon,'pelvis')
    tail=strap('Trailing blue ribbon',[(sign*.022,-.13,1.09),(sign*.04,-.164,.96),(sign*.055,-.205,.80),(sign*.08,-.23,.74)],.044,ribbon,'ribbon')
box('Silk bow knot',(0,-.143,1.105),(.045,.032,.055),ribbon,'pelvis',.014)
# An open shawl curves from the raised collar to the upper arms.
loft('Periwinkle shoulder shawl',[(1.275,.345,.205,.003),(1.32,.35,.208,0),(1.43,.34,.205,0),(1.49,.30,.19,0),(1.56,.17,.13,0),(1.61,.085,.075,0)],blue,'spine',32,.64,2)
for sign in [-1,1]:
    curve('Shawl front silver edging',[(sign*.205,-.17,1.29),(sign*.145,-.15,1.43),(sign*.08,-.09,1.59)],.0045,silver,'spine')
    curve('Shawl seam',[(sign*.19,-.155,1.31),(sign*.13,-.13,1.45),(sign*.077,-.083,1.59)],.002,blue_light,'spine')
# Scalloped ivory collar, center jewel and restrained silver scrollwork.
loft('High ivory collar',[(1.55,.071,.063,0),(1.62,.069,.061,0),(1.65,.063,.055,0)],ivory,'spine',24,0,1)
curve('Scalloped collar lace',[(cos(a)*.065,sin(a)*.058,1.643+.004*cos(a*12)) for a in [i*tau/96 for i in range(97)]],.003,ivory,'spine')
box('Silver brooch mount',(0,-.095,1.575),(.055,.018,.073),silver,'spine',.012)
ellipsoid('Pale-blue brooch',(0,-.108,1.577),(.017,.010,.026),gem,'spine',12,8)
for sign in [-1,1]:
    curve('Silver brooch scroll',[(sign*.022,-.105,1.57),(sign*.063,-.128,1.55),(sign*.06,-.13,1.525),(sign*.04,-.122,1.535)],.003,silver,'spine')
    curve('Bodice front seam',[(sign*.035,-.075,1.55),(sign*.06,-.108,1.36),(sign*.045,-.105,1.16)],.0025,ivory,'spine')
# Slim legs, charcoal stockings and formed taupe ankle boots.
for sign,suffix in [(-1,'L'),(1,'R')]:
    x=sign*.105
    leg=loft('Continuous stocking leg '+suffix,[(.14,.048,.053,0),(.28,.055,.060,0),(.45,.064,.068,0),(.56,.066,.067,0),(.68,.078,.079,0),(.88,.09,.087,0),(1.02,.092,.09,0)],stockings,'thigh.'+suffix,16,0,2);leg.location.x=x
    boot=loft('Ankle boot '+suffix,[(.095,.053,.065,0),(.17,.06,.07,0),(.27,.071,.08,0),(.30,.069,.077,0)],boots,'shin.'+suffix,16,0,2);boot.location.x=x
    vamp=loft('Rounded almond boot vamp '+suffix,[(.03,.067,.12,-.05),(.055,.073,.128,-.05),(.10,.065,.112,-.04),(.14,.052,.068,-.01)],boots,'foot.'+suffix,20,0,2);vamp.location.x=x
    outsole=loft('Curved sole '+suffix,[(.015,.071,.126,-.05),(.034,.073,.128,-.05)],sole,'foot.'+suffix,20,0,1);outsole.location.x=x
    box('Short heel '+suffix,(x,.035,.032),(.115,.080,.049),boots,'foot.'+suffix,.009)
    curve('Boot fine seam '+suffix,[(x-.055,-.12,.10),(x,-.145,.116),(x+.055,-.12,.10)],.0025,boot_edges,'foot.'+suffix)
    curve('Boot cuff edge '+suffix,[(x-.055,-.045,.28),(x,-.073,.26),(x+.055,-.045,.28)],.004,boot_edges,'shin.'+suffix)
    ellipsoid('Boot silver clasp '+suffix,(x,-.080,.226),(.010,.006,.013),silver,'shin.'+suffix,12,8)
    # Blouse sleeves form continuous surfaces with deforming elbow weights.
    ax=sign*.245
    sleeve=loft('Ivory blouse sleeve '+suffix,[(.91,.046,.048,0),(.97,.058,.055,0),(1.07,.063,.060,0),(1.19,.055,.055,0),(1.32,.065,.063,0),(1.48,.062,.057,0)],ivory,'upper_arm.'+suffix,16,0,2);sleeve.location.x=ax
    for v in sleeve.data.vertices:
        v.co.x+=sign*float(np.interp(v.co.z,[.91,1.19,1.48],[.02,.01,0]))
    cuff=loft('Frilled wrist cuff '+suffix,[(.90,.058,.055,0),(.92,.061,.059,0),(.95,.052,.050,0)],ivory,'forearm.'+suffix,16,0,1);cuff.location.x=ax+sign*.02
    curve('Soft cuff lace '+suffix,[(ax+sign*.02+cos(a)*.056,sin(a)*.054,.906+.004*cos(a*10)) for a in [i*tau/80 for i in range(81)]],.003,ivory,'forearm.'+suffix)
    ellipsoid('Slender palm '+suffix,(ax+sign*.02,-.005,.857),(.045,.030,.052),skin,'hand.'+suffix)
    for j in range(4):
        fx=ax+sign*.02+(j-1.5)*.016
        curve('Finger '+suffix,[(fx,-.010,.845),(fx,-.019,.817-abs(j-1.5)*.003),(fx,-.03,.807-abs(j-1.5)*.003)],.0085,skin,'hand.'+suffix)
    curve('Thumb '+suffix,[(ax-sign*.01,-.008,.874),(ax-sign*.03,-.027,.852),(ax-sign*.023,-.037,.838)],.012,skin,'hand.'+suffix)
# Adult anime heroine face: fine jaw, cheek plane and almond eyes fitted to the skin.
loft('Neck',[(1.56,.050,.047,0),(1.73,.054,.049,0)],skin,'head',16,0,2)
loft('Soft heroine face',[(1.655,.046,.050,-.004),(1.687,.085,.081,-.003),(1.745,.142,.116,0),(1.823,.174,.137,.004),(1.90,.170,.140,.009),(1.965,.135,.11,.014),(1.99,.052,.05,.015)],skin,'head',24,0,2)
def face_y(x,z):return .004-.137*math.sqrt(max(.15,1-(x/.184)**2))
def eye_patch(name,cx,cz,rx,rz,mat,offset):
    verts=[(cx,face_y(cx,cz)-offset,cz)];uvs=[(.5,.5)]
    for i in range(32):
        a=i*tau/32;x=cx+cos(a)*rx;z=cz+sin(a)*rz
        verts.append((x,face_y(x,z)-offset,z));uvs.append((.5+.5*cos(a),.5+.5*sin(a)))
    return mesh(name,verts,[(0,i+1,(i+1)%32+1) for i in range(32)],mat,'head',uvs=uvs)
for sign in [-1,1]:
    ellipsoid('Small ear',(sign*.169,.004,1.811),(.025,.024,.046),skin,'head')
    x=sign*.070
    eye_patch('Almond eye',x,1.823,.046,.027,eye_white,.006)
    eye_patch('Lavender iris',x-sign*.004,1.822,.020,.024,iris,.008)
    eye_patch('Iris lilac light',x-sign*.005,1.812,.015,.012,iris_light,.009)
    eye_patch('Soft pupil',x-sign*.004,1.825,.008,.017,ink,.010)
    eye_patch('Eye glint',x-sign*.011,1.836,.005,.0065,highlight,.012)
    eye_patch('Small eye glint',x+sign*.003,1.81,.0025,.0035,highlight,.012)
    lid=[(x-sign*.043,1.824),(x,1.85),(x+sign*.044,1.835)]
    curve('Fine upper eyelash',[(px,face_y(px,pz)-.008,pz) for px,pz in lid],.0035,ink,'head')
    curve('Outer eyelash',[(x+sign*.036,face_y(x+sign*.036,1.836)-.009,1.836),(x+sign*.052,face_y(x+sign*.045,1.84)-.006,1.844)],.0022,ink,'head')
    brow=[(x-sign*.039,1.886),(x,1.89),(x+sign*.037,1.881)]
    curve('Soft silver eyebrow',[(px,face_y(px,pz)+.001,pz) for px,pz in brow],.004,brow_mat,'head')
    curve('Tiny earring',[(sign*.173,-.013,1.79),(sign*.178,-.016,1.767),(sign*.169,-.018,1.75)],.0025,silver,'head')
    ellipsoid('Earring pearl',(sign*.17,-.02,1.751),(.007,.005,.012),gem,'head',12,8)
ellipsoid('Small nose bridge',(0,-.128,1.800),(.008,.008,.022),skin,'head')
ellipsoid('Nose tip',(0,-.140,1.778),(.009,.010,.008),skin,'head')
curve('Gentle closed smile',[(-.022,-.115,1.721),(0,-.126,1.719),(.023,-.115,1.726)],.0025,rose,'head')
# Pearl-white rounded bob: a continuous underlayer and swept, thin hair ribbons.
loft('White bob underlayer',[(1.635,.146,.106,.022),(1.675,.181,.145,.02),(1.80,.202,.167,.016),(1.94,.187,.162,.014),(2.02,.125,.115,.01)],hair_shadow,'head',32,.69,2)
loft('White bob outer shell',[(1.642,.153,.112,.024),(1.69,.19,.15,.02),(1.83,.209,.178,.016),(1.965,.177,.16,.012),(2.04,.11,.105,.006)],hair,'head',32,.72,2)
loft('Rounded crown',[(1.89,.19,.162,.016),(1.97,.184,.165,.014),(2.045,.117,.112,.008),(2.075,.018,.018,0)],hair,'head',24,0,2)
fringes=[
 ([(.075,-.015,2.04),(.015,-.115,2.055),(-.095,-.165,1.966),(-.168,-.139,1.842)],[.028,.050,.045,.002]),
 ([(.095,-.015,2.035),(.07,-.12,2.035),(.012,-.173,1.962),(-.052,-.168,1.89)],[.027,.047,.037,.0015]),
 ([(.11,-.015,2.025),(.145,-.108,1.988),(.165,-.145,1.91),(.144,-.147,1.82)],[.024,.040,.034,.0015]),
 ([(-.01,.006,2.045),(-.10,-.09,2.015),(-.172,-.12,1.91),(-.18,-.106,1.79)],[.024,.040,.035,.0015])]
for i,(points,widths) in enumerate(fringes):hair_lock('Swept white fringe '+str(i),points,widths,hair_light if i==1 else hair)
for sign in [-1,1]:
    for i in range(6):
        y=-.055+i*.036
        obj=hair_lock('Soft bob strand',[(sign*.15,y,1.98),(sign*.206,y,1.88),(sign*.198,y+.006,1.735),(sign*.15,y-.007,1.657)],[.022,.033,.030,.0015],hair_light if i%3==0 else hair)
        # A small lower-hair influence gives a soft moving hem without detaching the crown.
        head_group=obj.vertex_groups['head'];sway=obj.vertex_groups.new(name='hair.'+('L' if sign<0 else 'R'))
        for v in obj.data.vertices:
            w=max(0,min(.22,(1.87-v.co.z)*.8));head_group.add([v.index],1-w,'REPLACE');sway.add([v.index],w,'REPLACE')
# One skin with shared material slots. Studio and old male source remain separate.
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();body=bpy.context.object;body.name='HeroineMesh';body['design_reference']='white-bob-candidates-v1.png / candidate 2'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
arm=bpy.data.armatures.new('HeroineSkeleton');rig=bpy.data.objects.new('HeroineRig',arm);character.objects.link(rig)
bpy.context.view_layer.objects.active=rig;bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
    return b
bone('root',(0,0,0),(0,0,.20));bone('pelvis',(0,0,1.01),(0,0,1.14),'root');bone('spine',(0,0,1.14),(0,0,1.61),'pelvis');bone('head',(0,0,1.61),(0,0,1.98),'spine')
for sign,suffix in [(-1,'L'),(1,'R')]:
    x=sign*.105;ax=sign*.245
    bone('thigh.'+suffix,(x,0,1.02),(x,0,.56),'pelvis');bone('shin.'+suffix,(x,0,.56),(x,0,.14),'thigh.'+suffix);bone('foot.'+suffix,(x,0,.14),(x,-.14,.05),'shin.'+suffix)
    bone('upper_arm.'+suffix,(ax,0,1.48),(ax+sign*.01,0,1.19),'spine');bone('forearm.'+suffix,(ax+sign*.01,0,1.19),(ax+sign*.02,0,.93),'upper_arm.'+suffix);bone('hand.'+suffix,(ax+sign*.02,0,.93),(ax+sign*.02,0,.82),'forearm.'+suffix)
    bone('hair.'+suffix,(sign*.13,.02,1.92),(sign*.15,.02,1.65),'head')
for key,tail in [('L',(-.25,0,.65)),('R',(.25,0,.65)),('front',(0,-.20,.65)),('back',(0,.20,.65))]:bone('skirt.'+key,(0,0,1.08),tail,'pelvis')
bone('ribbon',(0,-.13,1.1),(0,-.2,.68),'pelvis')
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
mod=body.modifiers.new('Heroine skin','ARMATURE');mod.object=rig;body.parent=rig
for suffix in ['L','R']:
    upper=body.vertex_groups.get('upper_arm.'+suffix);lower=body.vertex_groups.get('forearm.'+suffix)
    for v in body.data.vertices:
        assigned={g.group:g.weight for g in v.groups}
        if upper.index in assigned or lower.index in assigned:
            w=max(0,min(1,(1.24-v.co.z)/.13));upper.add([v.index],1-w,'REPLACE');lower.add([v.index],w,'REPLACE')
for suffix in ['L','R']:
    thigh=body.vertex_groups.get('thigh.'+suffix);shin=body.vertex_groups.get('shin.'+suffix)
    for v in body.data.vertices:
        assigned={g.group:g.weight for g in v.groups}
        if thigh.index in assigned or shin.index in assigned:
            w=max(0,min(1,(.615-v.co.z)/.11));thigh.add([v.index],1-w,'REPLACE');shin.add([v.index],w,'REPLACE')
rig.animation_data_create()
for label,count in [('Idle',61),('Walk',25)]:
    action=bpy.data.actions.new(label);rig.animation_data.action=action
    for frame in range(1,count+1):
        t=(frame-1)/(count-1)*tau
        for pose in rig.pose.bones:pose.rotation_mode='XYZ';pose.rotation_euler=(0,0,0);pose.location=(0,0,0)
        rig.pose.bones['head'].rotation_euler.x=-.14 # A gentle lift exposes the face to the game camera.
        if label=='Walk':
            swing=sin(t)*.34
            for sign,suffix in [(1,'L'),(-1,'R')]:
                rig.pose.bones['thigh.'+suffix].rotation_euler.x=sign*swing
                rig.pose.bones['shin.'+suffix].rotation_euler.x=max(0,sign*sin(t))*.48
                rig.pose.bones['foot.'+suffix].rotation_euler.x=-sign*swing*.25
                rig.pose.bones['upper_arm.'+suffix].rotation_euler.x=-sign*swing*.65-.035
                rig.pose.bones['forearm.'+suffix].rotation_euler.x=-.10-max(0,-sign*swing)*.15
                rig.pose.bones['skirt.'+suffix].rotation_euler.x=sin(t+sign*.4)*.045
                rig.pose.bones['hair.'+suffix].rotation_euler.x=sin(t-.4)*.04
            rig.pose.bones['skirt.front'].rotation_euler.x=sin(t*2)*.045
            rig.pose.bones['skirt.back'].rotation_euler.x=sin(t*2-.6)*.045
            rig.pose.bones['ribbon'].rotation_euler.x=sin(t-.7)*.10
            rig.pose.bones['spine'].rotation_euler.z=sin(t)*.017
            rig.pose.bones['root'].location.y=abs(sin(t))*.012
        else:
            rig.pose.bones['spine'].rotation_euler.x=sin(t)*.009
            rig.pose.bones['head'].rotation_euler.z=sin(t)*.011
            rig.pose.bones['hair.L'].rotation_euler.x=sin(t-.3)*.018
            rig.pose.bones['hair.R'].rotation_euler.x=sin(t-.3)*.018
            rig.pose.bones['ribbon'].rotation_euler.x=sin(t)*.025
        for pose in rig.pose.bones:
            pose.keyframe_insert(data_path='rotation_euler',frame=frame,group=pose.name);pose.keyframe_insert(data_path='location',frame=frame,group=pose.name)
    action.use_fake_user=True
rig.animation_data.action=bpy.data.actions['Idle'];bpy.context.scene.frame_set(1)
# Keep a rich editable surface and a reduced, skinned game export.
game_body=body.copy();game_body.data=body.data.copy();character.objects.link(game_body);game_body.name='HeroineGameMesh'
bpy.ops.object.select_all(action='DESELECT');game_body.select_set(True);bpy.context.view_layer.objects.active=game_body
reduce=game_body.modifiers.new('Game topology','DECIMATE');reduce.ratio=min(1.0,28000/sum(len(p.vertices)-2 for p in body.data.polygons));reduce.use_collapse_triangulate=True
bpy.ops.object.modifier_move_up(modifier=reduce.name);bpy.ops.object.modifier_apply(modifier=reduce.name)
game_triangles=sum(len(p.vertices)-2 for p in game_body.data.polygons)
rig.select_set(True);bpy.context.view_layer.objects.active=rig
options=dict(filepath=str(GAME/'heroine.glb'),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=True,export_animation_mode='ACTIONS',export_all_armature_actions=True,export_force_sampling=True)
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in valid})
bpy.data.objects.remove(game_body,do_unlink=True)
# Actual Blender portrait, softly lit without losing the white bob against the background.
def studio_link(obj):link(obj,studio);return obj
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));floor=studio_link(bpy.context.object);floor.data.materials.append(material('Studio slate',(.15,.19,.23)))
def area(name,loc,power,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=loc;obj.rotation_euler=(Vector((0,0,1.05))-obj.location).to_track_quat('-Z','Y').to_euler()
area('Soft warm key',(-3,-4,6),400,4,(1,.93,.88));area('Cool fill',(3,-2,3),200,3,(.82,.88,1));area('Pearl rim',(1,3,4),450,3,(.90,.94,1))
camera_data=bpy.data.cameras.new('Heroine portrait');camera=bpy.data.objects.new('Heroine portrait',camera_data);studio.objects.link(camera)
camera.location=(2.5,-6,3.0);camera.rotation_euler=(Vector((0,0,1.08))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=2.62
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=768;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.world.color=(.16,.18,.21);scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(SOURCE/'heroine-beauty.png');scene.frame_end=61
triangles=sum(len(p.vertices)-2 for p in body.data.polygons)
report=dict(blender=bpy.app.version_string,vertices=len(body.data.vertices),triangles=triangles,game_triangles=game_triangles,bones=len(arm.bones),materials=len(body.data.materials),actions=['Idle','Walk'],source='heroine.blend',game_asset='godot-arcana/art/models/heroine/heroine.glb',reference='white-bob-candidates-v1.png / candidate 2',features=['pearl-white side-swept bob','lavender eyes','periwinkle shawl','ivory floral dress','navy waist bow','charcoal stockings','taupe ankle boots'])
(SOURCE/'production.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
for screen in bpy.data.screens:
    for area_ in screen.areas:
        if area_.type=='VIEW_3D':
            space=area_.spaces.active;space.region_3d.view_distance=3.4;space.region_3d.view_location=(0,0,1.1);space.region_3d.view_rotation=camera.rotation_euler.to_quaternion();space.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'heroine.blend'))
if '--no-render' not in sys.argv:bpy.ops.render.render(write_still=True)
print('ARCANA_HEROINE_PRODUCTION '+json.dumps(report),flush=True)
