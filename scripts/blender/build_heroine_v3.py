"""Build approved white-bob heroine candidate 2 as an editable, painted and rigged Blender asset.
Run through scripts/build-blender-hero.ps1; all inputs/outputs stay in this project.
"""
import bpy, math, json, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi, tau

ROOT=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-studies/arcana-hero/white-bob-heroine/blender-v3'
GAME=ROOT/'godot-arcana/art/models/heroine-v3'
SOURCE.mkdir(parents=True,exist_ok=True); GAME.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for coll in list(bpy.data.collections):
    if coll.name != 'Collection' and coll.users == 0: bpy.data.collections.remove(coll)
character=bpy.data.collections.new('CHARACTER - painted hero'); bpy.context.scene.collection.children.link(character)
studio=bpy.data.collections.new('STUDIO - render only'); bpy.context.scene.collection.children.link(studio)
parts=[]

def material(name, color, paint=None, metal=0):
    m=bpy.data.materials.new(name);m['uses_paint']=paint is not None; m.diffuse_color=(*color,1); m.use_nodes=True
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

ivory=material('Dress_ivory',(.93,.865,.735))
skirt_paint=material('Dress_floral_hem',(.91,.84,.70),'dress')
blue=material('Cape_periwinkle',(.32,.48,.74),'cape')
blue_light=material('Blue_collar_edge',(.35,.49,.67),'cloth')
ribbon=material('Sash_navy',(.028,.055,.13))
stockings=material('Stockings_charcoal',(.055,.060,.085),'cloth')
boots=material('Boots_taupe',(.38,.29,.25),'leather')
boot_edges=material('Boot_stitch',(.51,.42,.36))
sole=material('Boot_soles',(.045,.04,.04))
silver=material('Silver_filigree',(.63,.68,.73),metal=.20)
skin=material('Pearl_skin',(.95,.66,.53))
rose=material('Soft_lips',(.55,.30,.31))
hair=material('Pearl_white_hair',(.87,.89,.96))
hair_light=material('White_hair_glints',(.98,.965,.94))
hair_shadow=material('Bob_underlayer',(.43,.47,.61))
hair_mid=material('Pearl_hair_mid',(.65,.69,.80))
eye_white=material('Eye_ivory',(.95,.94,.91))
iris=material('Lavender_iris',(.20,.09,.34))
iris_light=material('Iris_lilac',(.51,.35,.66))
ink=material('Soft_violet_lashes',(.025,.021,.045))
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
    rings=[(.635,.355,.245),(.665,.37,.255),(.735,.34,.24),(.85,.29,.205),(.995,.20,.14),(1.085,.151,.103),(1.115,.145,.10)]
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
    hem_points.append((cos(a)*.355*pleat,sin(a)*.25*pleat,.650+.018*cos(a)+.012*cos(a*3)))
hem=curve('Ivory rolled hem',hem_points,.0045,ivory,'pelvis');cloth_weights(hem)
loft('Navy waist sash',[(1.065,.150,.105,0),(1.13,.153,.107,0)],ribbon,'pelvis',24,0,1)
for sign in [-1,1]:
    strap('Bow loop',[(0,-.116,1.105),(sign*.09,-.145,1.155),(sign*.145,-.126,1.12),(sign*.075,-.156,1.085),(0,-.13,1.105)],.032,ribbon,'pelvis')
    tail=strap('Trailing blue ribbon',[(sign*.022,-.13,1.09),(sign*.04,-.164,.96),(sign*.055,-.205,.80),(sign*.08,-.23,.74)],.060,ribbon,'ribbon')
box('Silk bow knot',(0,-.143,1.105),(.045,.032,.055),ribbon,'pelvis',.014)
# An open shawl curves from the raised collar to the upper arms.
loft('Periwinkle shoulder shawl',[(1.31,.33,.17,.003),(1.34,.34,.17,0),(1.44,.335,.165,0),(1.50,.30,.15,0),(1.59,.11,.075,0),(1.63,.075,.065,0)],blue,'spine',32,.64,2)
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
    ax=sign*.225
    sleeve=loft('Ivory blouse sleeve '+suffix,[(.91,.046,.048,0),(.97,.058,.055,0),(1.07,.063,.060,0),(1.19,.055,.055,0),(1.32,.065,.063,0),(1.48,.062,.057,0)],ivory,'upper_arm.'+suffix,16,0,2);sleeve.location.x=ax
    for v in sleeve.data.vertices:
        v.co.x+=sign*float(np.interp(v.co.z,[.91,1.19,1.48],[.02,.01,0]))
    cuff=loft('Frilled wrist cuff '+suffix,[(.90,.058,.055,0),(.92,.061,.059,0),(.95,.052,.050,0)],ivory,'forearm.'+suffix,16,0,1);cuff.location.x=ax+sign*.02
    curve('Soft cuff lace '+suffix,[(ax+sign*.02+cos(a)*.056,sin(a)*.054,.906+.004*cos(a*10)) for a in [i*tau/80 for i in range(81)]],.003,ivory,'forearm.'+suffix)
    ellipsoid('Slender palm '+suffix,(ax+sign*.02,-.005,.857),(.029,.025,.043),skin,'hand.'+suffix)
    for j in range(4):
        fx=ax+sign*.02+(j-1.5)*.011
        curve('Finger '+suffix,[(fx,-.010,.845),(fx,-.019,.817-abs(j-1.5)*.003),(fx,-.03,.807-abs(j-1.5)*.003)],.0055,skin,'hand.'+suffix)
    curve('Thumb '+suffix,[(ax-sign*.01,-.008,.874),(ax-sign*.03,-.027,.852),(ax-sign*.023,-.037,.838)],.008,skin,'hand.'+suffix)
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
    eye_patch('Almond eye',x,1.823,.048,.023,eye_white,.006)
    eye_patch('Lavender iris',x-sign*.004,1.822,.020,.020,iris,.008)
    eye_patch('Iris lilac light',x-sign*.005,1.812,.015,.010,iris_light,.009)
    eye_patch('Soft pupil',x-sign*.004,1.825,.008,.017,ink,.010)
    eye_patch('Eye glint',x-sign*.011,1.836,.005,.0065,highlight,.012)
    eye_patch('Small eye glint',x+sign*.003,1.81,.0025,.0035,highlight,.012)
    lid=[(x-sign*.043,1.824),(x,1.85),(x+sign*.044,1.835)]
    curve('Fine upper eyelash',[(px,face_y(px,pz)-.008,pz) for px,pz in lid],.0055,ink,'head')
    curve('Outer eyelash',[(x+sign*.036,face_y(x+sign*.036,1.836)-.009,1.836),(x+sign*.052,face_y(x+sign*.045,1.84)-.006,1.844)],.0033,ink,'head')
    brow=[(x-sign*.039,1.886),(x,1.89),(x+sign*.037,1.881)]
    curve('Soft silver eyebrow',[(px,face_y(px,pz)+.001,pz) for px,pz in brow],.0025,brow_mat,'head')
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
for i,(points,widths) in enumerate(fringes):hair_lock('Swept white fringe '+str(i),points,widths,hair_light if i==1 else hair_mid if i==3 else hair)
for sign in [-1,1]:
    for i in range(6):
        y=-.055+i*.036
        obj=hair_lock('Soft bob strand',[(sign*.15,y,1.98),(sign*.206,y,1.88),(sign*.198,y+.006,1.735),(sign*.15,y-.007,1.657)],[.022,.033,.030,.0015],hair_light if i%3==0 else hair_shadow if i%3==1 else hair_mid)
        # A small lower-hair influence gives a soft moving hem without detaching the crown.
        head_group=obj.vertex_groups['head'];sway=obj.vertex_groups.new(name='hair.'+('L' if sign<0 else 'R'))
        for v in obj.data.vertices:
            w=max(0,min(.22,(1.87-v.co.z)*.8));head_group.add([v.index],1-w,'REPLACE');sway.add([v.index],w,'REPLACE')
# A continuous rounded bob cap: no stacked crown disks or helmet seam.
for obj in list(parts):
    if obj.name.startswith(('White bob underlayer','White bob outer shell','Rounded crown')):
        parts.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
verts=[];faces=[];n=64;rows=22
for row in range(rows+1):
    t=(row+.025)/(rows+.025)
    for i in range(n):
        a=i*tau/n
        front=max(0,-sin(a));front_cut=max(0,min(1,(front-.63)/.30));front_cut=front_cut*front_cut*(3-2*front_cut)
        theta=t*(2.45-1.36*front_cut)
        verts.append((.211*sin(theta)*cos(a),.015+.181*sin(theta)*sin(a),1.857+.232*cos(theta)))
for row in range(rows):
    for i in range(n):
        a=row*n+i;b=row*n+(i+1)%n;faces.append((a,a+n,b+n,b))
faces.append(tuple(range(n)))
mesh('White bob seamless cap',verts,faces,hair,'head',sub=1)

# A separate soft petticoat keeps the dress hem layered at game resolution.
petticoat=loft('Ivory petticoat',[(.605,.34,.235,0),(.622,.357,.25,0),(.65,.345,.24,0),(.70,.32,.22,0)],ivory,'pelvis',48,0,1)
for v in petticoat.data.vertices:
    a=math.atan2(v.co.y,v.co.x);v.co.z+=.008*cos(a*16)
cloth_weights(petticoat)

# V3: original identity, larger readable anime head, narrow shoulders and hands.
# Apply object transforms before skinning so every item uses the same bind space.
for obj in parts:
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);obj.select_set(False)
    is_head=obj.vertex_groups.get('head') is not None and obj.name!='Neck'
    if is_head:
        for v in obj.data.vertices:
            v.co.x*=1.38;v.co.y*=1.22;v.co.z=1.65+(v.co.z-1.65)*1.42
    if 'shawl' in obj.name.lower() or obj.name.startswith('Shawl'):
        for v in obj.data.vertices:v.co.x*=.84;v.co.y*=.90
    if obj.name.startswith('Ivory blouse sleeve'):
        sign=-1 if obj.name.endswith('L') else 1
        for v in obj.data.vertices:
            center=sign*(.225+float(np.interp(v.co.z,[.91,1.19,1.48],[.02,.01,0])))
            v.co.x=center+(v.co.x-center)*.77;v.co.y*=.82
    if obj.name.startswith(('Frilled wrist','Soft cuff')):
        sign=-1 if obj.name.endswith('L') else 1
        for v in obj.data.vertices:v.co.x=sign*.245+(v.co.x-sign*.245)*.73;v.co.y*=.77
# Proper hidden skin volume: not a collection of floating sleeve cylinders.
for sign,suffix in [(-1,'L'),(1,'R')]:
    arm_skin=loft('Base arm '+suffix,[(.89,.025,.025,0),(.98,.029,.028,0),(1.12,.035,.033,0),(1.23,.034,.034,0),(1.36,.038,.036,0),(1.49,.041,.037,0)],skin,'upper_arm.'+suffix,16,0,2)
    arm_skin.location.x=sign*.225
base=loft('Base fitted underbody',[(.96,.125,.080,0),(1.13,.13,.085,0),(1.34,.154,.098,0),(1.49,.168,.098,0),(1.57,.060,.054,0)],ivory,'spine',24,0,2)
# Larger, readable embroidery clusters instead of random tiny dots.
for j in range(12):
    a=j*tau/12
    center=Vector((cos(a)*.349,sin(a)*.245,.702+.01*cos(a*3)))
    tangent=Vector((-sin(a),cos(a),0))
    for k in range(4):
        q=k*tau/4
        pos=center+tangent*cos(q)*.013+Vector((0,0,sin(q)*.019))
        flower=ellipsoid('Hem flower',pos,(.008,.008,.014),blue_light,'pelvis',8,6)
        cloth_weights(flower)
    leaf=curve('Hem embroidered stem',[center+Vector((0,0,-.035)),center,center+Vector((0,0,.025))],.0025,blue_light,'pelvis');cloth_weights(leaf)
# Keep the meshes modular for shared-skeleton clothing changes.
def item_for(obj):
    n=obj.name.lower()
    if n.startswith(('base ','neck','soft heroine','small ear','almond eye','lavender iris','iris lilac','soft pupil','eye glint','small eye glint','fine upper eyelash','outer eyelash','soft silver eyebrow','tiny earring','earring pearl','small nose','nose tip','gentle closed','slender palm','finger','thumb','continuous stocking')):return 'body'
    if n.startswith(('white bob','rounded crown','swept white','soft bob')):return 'hair'
    if n.startswith(('ankle boot','rounded almond boot','curved sole','short heel','boot ')):return 'boots-taupe'
    if 'shawl' in n or n.startswith(('silver brooch','pale-blue brooch')):return 'shawl'
    return 'dress'
items={key:[] for key in ['body','hair','dress','shawl','boots-taupe','blouse','skirt','boots-navy']}
for obj in parts:items[item_for(obj)].append(obj)
# Alternatives share topology, pivots and skin weights with the original outfit.
for obj in list(items['dress']):
    n=obj.name.lower()
    if n.startswith(('ivory fitted','ivory blouse','frilled wrist','soft cuff','high ivory','scalloped collar','bodice front')):target='blouse'
    elif n.startswith(('soft pleated','ivory rolled','ivory petticoat','hem flower','hem embroidered','navy waist','bow loop','silk bow','trailing blue')):target='skirt'
    else:continue
    alt=obj.copy();alt.data=obj.data.copy();character.objects.link(alt);alt.name='Separate '+obj.name;items[target].append(alt)
navy_boot=material('Boots_navy',(.11,.18,.31))
for obj in items['boots-taupe']:
    alt=obj.copy();alt.data=obj.data.copy();character.objects.link(alt);alt.name='Navy '+obj.name
    for i,m in enumerate(alt.data.materials):
        if m==boots:alt.data.materials[i]=navy_boot
    items['boots-navy'].append(alt)
for obj in list(items['body']):
    if obj.name.startswith('Small nose bridge'):
        items['body'].remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
# One export mesh per clothing slot; all remain independently editable in source.
meshes={}
for key,objects in items.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object
    obj.name='Heroine_'+key.replace('-','_');obj['item_id']=key;obj['approved_identity']='white bob / candidate 2'
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    meshes[key]=obj
# Keep the complete legs, but tag the upper stocking surface covered by a skirt.
body=meshes['body'];covered=stockings.copy();covered.name='Stockings_covered';covered['uses_paint']=False
body.data.materials.append(covered);covered_index=len(body.data.materials)-1;hidden=set()
for poly in body.data.polygons:
    if body.data.materials[poly.material_index].name.startswith('Stockings_charcoal') and sum(body.data.vertices[i].co.z for i in poly.vertices)/len(poly.vertices)>.63:
        poly.material_index=covered_index;hidden.update(poly.vertices)
group=body.vertex_groups.new(name='Covered upper legs - disable mask to edit full body');group.add(list(hidden),1,'REPLACE')
mask=body.modifiers.new('Clothed preview only - full legs retained','MASK');mask.vertex_group=group.name;mask.invert_vertex_group=True

# Native humanoid with ankle targets, knee poles and toe/heel control.
arm=bpy.data.armatures.new('HeroineV3Skeleton');rig=bpy.data.objects.new('HeroineV3Rig',arm);character.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None,deform=True):
    b=arm.edit_bones.new(name);b.head=head;b.tail=tail;b.use_deform=deform
    if parent:b.parent=arm.edit_bones[parent]
    return b
bone('root',(0,0,0),(0,0,.2));bone('pelvis',(0,0,1.01),(0,0,1.14),'root');bone('spine',(0,0,1.14),(0,0,1.61),'pelvis');bone('head',(0,0,1.61),(0,0,2.15),'spine')
for sign,suffix in [(-1,'L'),(1,'R')]:
    x=sign*.105;ax=sign*.225
    bone('thigh.'+suffix,(x,0,1.02),(x,-.025,.56),'pelvis');bone('shin.'+suffix,(x,-.025,.56),(x,0,.14),'thigh.'+suffix);bone('foot.'+suffix,(x,0,.14),(x,-.14,.05),'shin.'+suffix)
    bone('upper_arm.'+suffix,(ax,0,1.48),(ax+sign*.01,-.012,1.19),'spine');bone('forearm.'+suffix,(ax+sign*.01,-.012,1.19),(ax+sign*.02,0,.93),'upper_arm.'+suffix);bone('hand.'+suffix,(ax+sign*.02,0,.93),(ax+sign*.02,0,.82),'forearm.'+suffix)
    bone('hair.'+suffix,(sign*.18,.025,2.03),(sign*.2,.025,1.66),'head')
    bone('CTRL_foot.'+suffix,(x,0,.14),(x,-.14,.05),'root',False)
    bone('CTRL_knee.'+suffix,(x,-1,.56),(x,-1,.7),'root',False)
for key,tail in [('L',(-.30,0,.64)),('R',(.30,0,.64)),('front',(0,-.24,.64)),('back',(0,.24,.64))]:bone('skirt.'+key,(0,0,1.08),tail,'pelvis')
bone('ribbon',(0,-.13,1.1),(0,-.2,.68),'pelvis');bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
for suffix in ['L','R']:
    shin=rig.pose.bones['shin.'+suffix]
    ik=shin.constraints.new('IK');ik.name='Planted ankle / fixed lengths';ik.target=rig;ik.subtarget='CTRL_foot.'+suffix;ik.chain_count=2;ik.use_stretch=False;ik.pole_target=rig;ik.pole_subtarget='CTRL_knee.'+suffix;ik.pole_angle=-pi/2
    rig.pose.bones['thigh.'+suffix].ik_stretch=0;shin.ik_stretch=0
    rot=rig.pose.bones['foot.'+suffix].constraints.new('COPY_ROTATION');rot.target=rig;rot.subtarget='CTRL_foot.'+suffix;rot.target_space='POSE';rot.owner_space='POSE'
for key,obj in meshes.items():
    mod=obj.modifiers.new('Shared anatomical skin','ARMATURE');mod.object=rig;obj.parent=rig
    # Smooth only the joint neighborhood; never change bone lengths or scale.
    for suffix in ['L','R']:
        for upper_name,lower_name,z0,z1 in [('upper_arm.','forearm.',1.11,1.25),('thigh.','shin.',.50,.63)]:
            upper=obj.vertex_groups.get(upper_name+suffix)
            if not upper:continue
            lower=obj.vertex_groups.get(lower_name+suffix) or obj.vertex_groups.new(name=lower_name+suffix)
            for v in obj.data.vertices:
                assigned={g.group:g.weight for g in v.groups}
                if upper.index not in assigned and lower.index not in assigned:continue
                w=max(0,min(1,(z1-v.co.z)/(z1-z0)));w=w*w*(3-2*w)
                upper.add([v.index],1-w,'REPLACE');lower.add([v.index],w,'REPLACE')
    # Export costs are bounded per mesh, without reducing face and eye topology.
    if key in ['dress','skirt','shawl','boots-taupe','boots-navy','blouse']:
        triangles=sum(len(p.vertices)-2 for p in obj.data.polygons)
        if triangles>9000:
            bpy.context.view_layer.objects.active=obj;obj.select_set(True)
            dec=obj.modifiers.new('Cloth game topology','DECIMATE');dec.ratio=9000/triangles
            bpy.ops.object.modifier_move_up(modifier=dec.name);bpy.ops.object.modifier_apply(modifier=dec.name);obj.select_set(False)
# Animate in Blender: feet are planted in world space over each support interval.
# A 1.04-unit cycle at 3 units/sec is a brisk 0.347 s walk; speed remains gameplay-owned.
rig.animation_data_create();scene=bpy.context.scene;scene.render.fps=60
cycle_distance=1.04
clips=[('Idle',121),('Walk',49),('Run',49),('TurnLeft',19),('TurnRight',19)]
def foot_target(u,running=False):
    u=u%1;stance=.42 if running else .60;reach=.336 if running else .312
    if u<stance:
        t=u/stance
        return -reach+2*reach*t,0.0,(-.10*(1-t/.20) if t<.20 else .20*(t-.77)/.23 if t>.77 else 0)
    t=(u-stance)/(1-stance);s=t*t*(3-2*t)
    return reach-2*reach*s,(.16*sin(pi*t)**.65 if running else .105*sin(pi*t)**1.25),-.15*sin(pi*t)
for label,count in clips:
    action=bpy.data.actions.new(label);rig.animation_data.action=action
    for f in range(count):
        u=f/(count-1);a=u*tau
        for pb in rig.pose.bones:pb.rotation_mode='XYZ';pb.location=(0,0,0);pb.rotation_euler=(0,0,0);pb.scale=(1,1,1)
        rig.pose.bones['head'].rotation_euler.x=-.38
        rig.pose.bones['pelvis'].location=arm.bones['pelvis'].matrix_local.to_3x3().inverted()@Vector((0,0,-.06))
        if label in ['Walk','Run']:
            running=label=='Run'
            hip_z=-.06-.02*cos(a*2)
            if running:
                half=u%.5
                hip_z=-.075-.015*sin(pi*half/.42) if half<.42 else -.075+.055*sin(pi*(half-.42)/.08)
            hip=Vector((.012*cos(a),0,hip_z))
            rig.pose.bones['pelvis'].location=arm.bones['pelvis'].matrix_local.to_3x3().inverted()@hip
            rig.pose.bones['pelvis'].rotation_euler.y=.025*sin(a)
            rig.pose.bones['spine'].rotation_euler.y=-.035*sin(a)
            rig.pose.bones['spine'].rotation_euler.x=.025
            for sign,suffix,offset in [(-1,'L',0),(1,'R',.5)]:
                phase=(u+offset)%1;y,lift,rock=foot_target(phase,running)
                target=Vector((0,y,lift+max(0,rock)*.085))
                ctrl=rig.pose.bones['CTRL_foot.'+suffix]
                ctrl.location=arm.bones[ctrl.name].matrix_local.to_3x3().inverted()@target
                ctrl.rotation_euler.x=rock
                rig.pose.bones['upper_arm.'+suffix].rotation_euler.x=-sin(a+offset*tau)*(.34 if running else .22)-.025
                rig.pose.bones['forearm.'+suffix].rotation_euler.x=(-.36 if running else -.13)-max(0,-sin(a+offset*tau))*.07
                rig.pose.bones['hand.'+suffix].rotation_euler.x=.035*sin(a+offset*tau-.2)
                rig.pose.bones['hair.'+suffix].rotation_euler.x=.025*sin(a-.55)
                rig.pose.bones['skirt.'+suffix].rotation_euler.x=.055*sin(a+offset*tau-.35)
            rig.pose.bones['skirt.front'].rotation_euler.x=(-.15-.35*sin(a)**2) if running else (-.04-.15*sin(a)**2)
            rig.pose.bones['skirt.back'].rotation_euler.x=.035*sin(a+.2)
            rig.pose.bones['ribbon'].rotation_euler.x=(-.15-.35*sin(a-.1)**2) if running else (-.04-.15*sin(a-.1)**2)
        elif label=='Idle':
            rig.pose.bones['spine'].rotation_euler.x=.006*sin(a)
            for suffix in ['L','R']:rig.pose.bones['forearm.'+suffix].rotation_euler.x=-.09
            rig.pose.bones['ribbon'].rotation_euler.x=.018*sin(a-.4)
        else:
            sign=1 if label=='TurnLeft' else -1
            rig.pose.bones['head'].rotation_euler.y=sign*.18*sin(pi*u)
            rig.pose.bones['spine'].rotation_euler.y=sign*.07*sin(pi*u-.2)
            rig.pose.bones['pelvis'].rotation_euler.y=-sign*.035*sin(pi*u)
        for pb in rig.pose.bones:
            pb.keyframe_insert('location',frame=f+1,group=pb.name);pb.keyframe_insert('rotation_euler',frame=f+1,group=pb.name)
    action.use_fake_user=True
# Bake evaluated deformation bones to an export armature. Authoring IK remains editable.
rig.animation_data.action=bpy.data.actions['Idle'];scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes.values():obj.select_set(True)
rig.select_set(True);bpy.context.view_layer.objects.active=rig
options=dict(filepath=str(GAME/'heroine-v3.glb'),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=True,export_animation_mode='ACTIONS',export_all_armature_actions=True,export_force_sampling=True,export_def_bones=True,export_extras=True,export_materials='EXPORT')
mask.show_viewport=False;mask.show_render=False
valid=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in valid})
mask.show_viewport=True;mask.show_render=True
# Render explicit three-tone cel materials, avoiding Workbench studio-gray lighting.
for mat in bpy.data.materials:
    if not mat.use_nodes:continue
    nodes=mat.node_tree.nodes;nodes.clear();links=mat.node_tree.links
    output=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission')
    geom=nodes.new('ShaderNodeNewGeometry');dot=nodes.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.27,-.63,.73)
    links.new(geom.outputs['Normal'],dot.inputs[0]);ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='CONSTANT'
    r=ramp.color_ramp;r.elements.remove(r.elements[1]);r.elements[0].position=0;r.elements[0].color=(.63,.63,.72,1)
    e=r.elements.new(.18);e.color=(.84,.85,.92,1);e=r.elements.new(.50);e.color=(1,1,1,1)
    if mat.name=='Pearl_skin':
        r.elements[0].color=(.86,.80,.83,1);r.elements[1].color=(.96,.94,.96,1)
    links.new(dot.outputs['Value'],ramp.inputs[0]);mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[1].default_value=mat.diffuse_color
    links.new(ramp.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],em.inputs[0]);links.new(em.outputs[0],output.inputs[0])
# A camera at the game's pitch; actual low-resolution model renders, not concept art.
for key,obj in meshes.items():
    alt=key in ['blouse','skirt','boots-navy'];obj.hide_render=alt;obj.hide_set(alt)
data=bpy.data.cameras.new('Game front 45deg');camera=bpy.data.objects.new('Game front 45deg',data);studio.objects.link(camera)
camera.location=(0,-6,6);camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';scene.camera=camera
scene.render.engine='BLENDER_EEVEE_NEXT'
if hasattr(scene.eevee,'taa_render_samples'):scene.eevee.taa_render_samples=1;scene.display.shading.light='STUDIO';scene.display.shading.studiolight_rotate_z=-.4
scene.display.shading.color_type='MATERIAL';scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=False;scene.display.shading.show_specular_highlight=False;scene.display.shading.show_object_outline=True;scene.display.shading.object_outline_color=(.19,.16,.26)
scene.display.render_aa='OFF';scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
# Pixel density and registration use the old master only as a contract, never as artwork.
scene.render.resolution_x=96;scene.render.resolution_y=144;scene.render.resolution_percentage=100;data.ortho_scale=144/64
# Camera shift puts the ground origin at (48,116).
data.shift_y=(116-72)/144
scene.frame_end=49
report=dict(version=3,source='heroine-v3.blend',game='heroine-v3.glb',bones=len(arm.bones),control_bones=4,mesh_items=list(meshes),cycle_distance_world=cycle_distance,run_cycle_distance_world=1.60,stretch=False,pixel_frame=[96,144],nominal_frame=[96,136],foot=[48,116],palette='existing Arcana world palette',reference='approved candidate 2 and heroine-pixel-gameplay-target-v1.png',mesh_triangles={key:sum(len(p.vertices)-2 for p in obj.data.polygons) for key,obj in meshes.items()})
(SOURCE/'production.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
bpy.ops.object.select_all(action='DESELECT');meshes['body'].select_set(True);bpy.context.view_layer.objects.active=meshes['body']
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            space=area.spaces.active;space.region_3d.view_distance=3.4;space.region_3d.view_location=(0,0,1.15);space.region_3d.view_rotation=camera.rotation_euler.to_quaternion();space.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'heroine-v3.blend'))
if '--no-render' not in sys.argv:
    for d in range(8):
        rig.rotation_euler.z=d*tau/8
        scene.render.filepath=str(SOURCE/f'direction-{d}.png');bpy.ops.render.render(write_still=True)
    rig.rotation_euler.z=0
    scene.render.resolution_x=480;scene.render.resolution_y=640;data.ortho_scale=2.85;data.shift_y=0
    camera.location=(1.5,-6,2.9);camera.rotation_euler=(Vector((0,0,1.18))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(SOURCE/'model-beauty.png');bpy.ops.render.render(write_still=True)
print('HEROINE_V3 '+json.dumps(report),flush=True)
