"""Blender 5.3: Arcana 3D cabinet frames and individually modeled shelf wares."""
import bpy, math, random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[5]
STUDY = Path(__file__).resolve().parent
OUTPUT = ROOT / "godot-arcana/art/source/shop-cabinets-3d-v3"
PAINT = ROOT / "godot-arcana/art/export/shop-cabinet-face-v2"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def material(name, color, metallic=0.0):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1.0); mat.use_nodes=True
    shader=next(n for n in mat.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value=(*color,1)
    shader.inputs["Roughness"].default_value=.74
    shader.inputs["Metallic"].default_value=metallic
    return mat

wood=material("Deep walnut",(.20,.075,.028))
oak=material("Honey wood",(.40,.185,.061))
lightwood=material("Oak edge",(.54,.29,.105))
dark=material("Shadowed shelf interior",(.045,.024,.019))
gold=material("Warm brass",(.68,.40,.10),.20)
ivory=material("Aged parchment",(.72,.59,.36))
linen=material("Natural linen",(.52,.37,.20))
leather=material("Leather chestnut",(.34,.15,.055))
leather_dark=material("Leather umber",(.20,.075,.028))
navy=material("Midnight blue fabric",(.035,.072,.16))
blue=material("Blue book",(.075,.15,.27))
red=material("Red book",(.34,.085,.055))
green=material("Herb forest",(.10,.27,.065))
green2=material("Herb fresh",(.22,.42,.10))
green3=material("Herb sage",(.34,.46,.15))
violet=material("Lavender flower",(.42,.17,.48))
purple=material("Deep violet bottle",(.27,.075,.37))
cyan=material("Turquoise bottle",(.045,.43,.44))
brightcyan=material("Turquoise highlight",(.22,.68,.61))
cobalt=material("Cobalt bottle",(.055,.17,.39))
amber=material("Amber bottle",(.65,.24,.035))
rose=material("Rose bottle",(.58,.11,.14))
pale=material("Bottle label",(.76,.66,.42))
materials=[cyan,cobalt,purple,amber,rose]

def atlas(kind):
    mat=bpy.data.materials.new(kind+" painted wood")
    mat.use_nodes=True
    shader=next(n for n in mat.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value=1.0
    tex=mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image=bpy.data.images.load(str(PAINT/(kind+"-cabinet.png")),check_existing=True)
    tex.image.pack(); tex.interpolation="Closest"
    mat.node_tree.links.new(tex.outputs["Color"],shader.inputs["Base Color"])
    return mat

parts=[]
def add_cube(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob=bpy.context.object; ob.name=name; ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat); parts.append(ob); return ob

def add_cylinder(name, loc, radius, depth, mat, vertices=8, front=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    ob=bpy.context.object; ob.name=name
    if front: ob.rotation_euler.x=math.pi/2
    ob.data.materials.append(mat); parts.append(ob); return ob

def front_patch(name, xmin, xmax, top, bottom, texture, depth=-.502):
    # Coordinates are in the original 128 x 224 cabinet atlas.
    x0,x1=xmin/64.,xmax/64.
    z0,z1=(224-bottom)/64.,(224-top)/64.
    verts=[(x0,depth,z1),(x0,depth,z0),(x1,depth,z0),(x1,depth,z1)]
    uv=[(xmin/128.,1-top/224.),(xmin/128.,1-bottom/224.),
        (xmax/128.,1-bottom/224.),(xmax/128.,1-top/224.)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],[(0,1,2,3)]); mesh.update()
    layer=mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for li in poly.loop_indices: layer.data[li].uv=uv[mesh.loops[li].vertex_index]
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(texture); parts.append(obj)

def top_patch(texture):
    mesh=bpy.data.meshes.new("wood top")
    mesh.from_pydata([(0,0,3),(0,-.5,3),(2,-.5,3),(2,0,3)],[],[(0,1,2,3)])
    layer=mesh.uv_layers.new(name="UVMap")
    uv=[(0,1),(0,192/224),(1,192/224),(1,1)]
    for poly in mesh.polygons:
        for li in poly.loop_indices: layer.data[li].uv=uv[mesh.loops[li].vertex_index]
    ob=bpy.data.objects.new("Wood grain top",mesh); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(texture); parts.append(ob)

def shelf_top(texture, z):
    # Reuse the existing hand-painted top strip rather than a flat brown surface.
    mesh=bpy.data.meshes.new("Painted shelf top")
    mesh.from_pydata([(.08,-.015,z),(.08,-.485,z),(1.92,-.485,z),(1.92,-.015,z)],
                     [],[(0,1,2,3)])
    layer=mesh.uv_layers.new(name="UVMap")
    uv=[(.04,1),(.04,192/224),(.96,192/224),(.96,1)]
    for poly in mesh.polygons:
        for li in poly.loop_indices: layer.data[li].uv=uv[mesh.loops[li].vertex_index]
    ob=bpy.data.objects.new("Painted shelf top",mesh); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(texture); parts.append(ob)

def cabinet_frame(kind):
    paint=atlas(kind)
    add_cube("Solid back",(1,-.035,1.5),(1.92,.07,2.95),dark)
    for x in (.07,1.93):
        add_cube("Solid side", (x,-.25,1.5),(.14,.5,3),wood)
        add_cube("Corner bead",(x,-.514,1.5),(.035,.03,2.90),oak)
        for z in (.15,.72,1.26,1.82,2.47,2.88):
            add_cube("Brass stud",(x,-.537,z),(.034,.012,.034),gold)
    add_cube("Base cupboard",(1,-.25,.30),(1.86,.5,.60),wood)
    add_cube("Carved crown",(1,-.25,2.79),(1.86,.5,.42),wood)
    front_patch("Painted left post",0,10,32,224,paint,-.516)
    front_patch("Painted right post",118,128,32,224,paint,-.516)
    front_patch("Painted crown",10,118,32,62,paint,-.507)
    front_patch("Painted drawers",10,118,187,224,paint,-.507)
    top_patch(paint)
    for z in (.60,1.20,1.80):
        add_cube("Deep shelf",(1,-.25,z),(1.84,.47,.07),oak)
        shelf_top(paint,z+.0355)
        add_cube("Shelf edge",(1,-.494,z+.005),(1.84,.018,.028),lightwood)
        add_cube("Shelf gold line",(1,-.507,z-.019),(1.82,.009,.01),gold)

def bottle(x,y,z,width,height,color,variant=0):
    # Rotational, faceted bottle body with a narrow neck, cork and separate highlight.
    r=width/2; h=height
    profile=([(0,.62),(.06,.92),(.52,1),(.70,.72),(.79,.32),(.94,.28),(1,.30)]
             if variant%2==0 else
             [(0,.65),(.05,.9),(.42,1),(.62,.82),(.76,.36),(.95,.30),(1,.33)])
    vertices=[]; n=10
    for f,scale in profile:
        for i in range(n):
            a=2*math.pi*i/n
            vertices.append((x+r*scale*math.cos(a),y+r*scale*math.sin(a),z+h*f))
    faces=[]
    faces.append(tuple(reversed(range(n))))
    for j in range(len(profile)-1):
        for i in range(n):
            k=(i+1)%n
            faces.append((j*n+i,j*n+k,(j+1)*n+k,(j+1)*n+i))
    faces.append(tuple((len(profile)-1)*n+i for i in range(n)))
    mesh=bpy.data.meshes.new("Bottle mesh"); mesh.from_pydata(vertices,[],faces); mesh.update()
    ob=bpy.data.objects.new("Faceted potion",mesh); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(color); parts.append(ob)
    add_cylinder("Bottle lip",(x,y,z+h*.95),r*.34,h*.07,gold)
    add_cylinder("Cork",(x,y,z+h*1.02),r*.28,h*.09,leather)
    add_cube("Glass shine",(x-r*.35,y-r*.90,z+h*.43),(r*.20,.008,h*.22),brightcyan if color==cyan else pale)
    if variant%3==0:
        add_cube("Bottle label",(x+r*.18,y-r*.94,z+h*.30),(r*.65,.009,h*.14),pale)

def book(x,y,z,w,h,d,color,rotation=0.0):
    ob=add_cube("Leather bound book",(x,y,z+h/2),(w,d,h),color)
    if rotation: ob.rotation_euler.y=rotation
    add_cube("Book pages",(x,y-d*.15,z+h/2),(w*.77,d*.75,h*.88),ivory)
    add_cube("Spine gilding",(x,y-d*.52,z+h*.26),(w*.82,.009,.012),gold)
    add_cube("Spine gilding",(x,y-d*.52,z+h*.75),(w*.82,.009,.012),gold)

def box(x,y,z,w,d,h,body=leather):
    add_cube("Travel case",(x,y,z+h/2),(w,d,h),body)
    for dx in (-w*.28,w*.28):
        add_cube("Leather strap",(x+dx,y-d*.51,z+h/2),(.022,.012,h*.95),gold)
    add_cube("Case clasp",(x,y-d*.52,z+h*.50),(.045,.016,.045),gold)
    add_cube("Case top rim",(x,y,z+h*.94),(w*1.02,d*1.03,.02),lightwood)

def stem_between(name, start, end, radius, mat):
    a,b=Vector(start),Vector(end); vec=b-a
    ob=add_cylinder(name, (a+b)*.5, radius, vec.length, mat, 6)
    ob.rotation_euler=vec.to_track_quat("Z","Y").to_euler()

def leaf(x,y,z,dx,dz,mat):
    # Two angled triangles form a faceted leaf in depth.
    start=Vector((x,y,z)); tip=start+Vector((dx,0,dz))
    mid=(start+tip)*.5
    tangent=Vector((-dz,0,dx)).normalized()*.027
    vertices=[tuple(start),tuple(mid+tangent),tuple(tip),tuple(mid-tangent),
              tuple(mid+Vector((0,-.017,0)))]
    mesh=bpy.data.meshes.new("Leaf"); mesh.from_pydata(vertices,[],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)])
    ob=bpy.data.objects.new("Individual leaf",mesh); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat); parts.append(ob)

def herb_bunch(x,y,z,shade,hang=False):
    direction=-1 if hang else 1
    stem_between("Herb stem",(x,y,z),(x,y,z+direction*.27),.009,leather_dark)
    for j in range(4):
        base=z+direction*(.05+j*.047)
        side=-1 if j%2 else 1
        leaf(x,y-.01,base,side*(.07+j*.008),direction*.07,shade)
        leaf(x,y+.015,base,-side*.055,direction*.07,green2)
        leaf(x,y-.025,base+direction*.018,-side*.075,direction*.045,green3 if shade!=violet else violet)

def basket(x,y,z,w,shade):
    add_cube("Basket",(x,y,z+.075),(w,.23,.15),leather)
    for dx in (-w*.38,0,w*.38):
        add_cube("Basket weave",(x+dx,y-.12,z+.075),(.017,.012,.14),gold)
    add_cube("Basket rim",(x,y,z+.145),(w*1.04,.25,.025),lightwood)
    for j in range(3):
        herb_bunch(x+(j-1)*w*.27,y-.01,z+.14,shade)

def build_herbs():
    for j,x in enumerate((.35,.76,1.18,1.60)):
        stem_between("Hanging string",(x,-.30,2.52),(x,-.30,2.43),.007,gold)
        herb_bunch(x,-.31,2.43,violet if j%2==0 else green,True)
    for i,x in enumerate((.40,.83,1.26,1.67)):
        basket(x,-.29,1.24,.29,[green,green2,violet,green3][i])
    for i,x in enumerate((.38,.79,1.20,1.62)):
        if i==1: bottle(x,-.28,.64,.18,.34,amber,i)
        else: basket(x,-.29,.64,.28,[green2,green3,violet][i%3])

def build_potions():
    for row,z in enumerate((.64,1.24,1.84)):
        for i,x in enumerate((.30,.64,.98,1.32,1.66)):
            width=(.17,.21,.18,.22,.16)[(i+row)%5]
            height=(.35,.39,.31,.36,.32)[(i+row)%5]
            bottle(x,-.30,z,width,height,materials[(i+2*row)%len(materials)],i+row)

def scroll(x,y,z,length,mat):
    ob=add_cylinder("Rolled fabric",(x,y,z+.07),.07,length,mat,10)
    ob.rotation_euler.y=math.pi/2
    for dx in (-length*.33,length*.33):
        add_cube("Roll tie",(x+dx,y-.07,z+.07),(.02,.015,.12),gold)

def build_travel():
    box(.42,-.27,1.84,.34,.27,.38)
    box(.85,-.27,1.84,.27,.27,.32,leather_dark)
    scroll(1.40,-.27,1.84,.47,navy)
    scroll(1.40,-.27,1.99,.44,blue)
    for i,x in enumerate((.26,.44,.62,.80)):
        book(x,-.27,1.24,.14,.30,.25,[red,blue,leather,navy][i])
    box(1.12,-.27,1.24,.32,.26,.28)
    add_cylinder("Compass brass case",(1.53,-.30,1.37),.14,.08,gold,12,True)
    add_cylinder("Compass dial",(1.53,-.348,1.37),.104,.015,ivory,12,True)
    add_cube("Compass needle",(1.53,-.36,1.37),(.022,.008,.14),red)
    box(.39,-.27,.64,.37,.27,.28,leather_dark)
    scroll(.93,-.27,.64,.42,ivory)
    scroll(.93,-.27,.79,.39,linen)
    box(1.52,-.27,.64,.38,.27,.30,leather)

for i,kind in enumerate(("herb","potion","travel")):
    parts=[]
    cabinet_frame(kind)
    {"herb":build_herbs,"potion":build_potions,"travel":build_travel}[kind]()
    bpy.ops.object.select_all(action="DESELECT")
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    combined=bpy.context.object; combined.name=kind.title()+" Cabinet with 3D Wares"
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT/(kind+"-cabinet.glb")),export_format="GLB",use_selection=True)
    combined.location.x += i*2.2

bpy.ops.object.camera_add(location=(3.2,-10,9))
camera=bpy.context.object
camera.rotation_euler=(Vector((3.2,0,1.3))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"; camera.data.ortho_scale=7.3
scene=bpy.context.scene; scene.camera=camera; scene.render.engine="BLENDER_WORKBENCH"
scene.display.shading.color_type="TEXTURE"; scene.display.shading.light="STUDIO"
scene.render.resolution_x=1000; scene.render.resolution_y=600; scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"; scene.render.filepath=str(STUDY/"cabinet-3d-wares-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(STUDY/"shop-cabinets-3d-wares.blend"))
bpy.ops.render.render(write_still=True)
print("Created 3D shelf wares:",OUTPUT)
