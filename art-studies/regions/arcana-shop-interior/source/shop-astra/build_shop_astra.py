"""Arcana shop Astra v1: editable Blender authoring, metres, Godot Y-up export.
Run in Blender's scripting workspace. Set ASTRA_FULL for the complete five-cabinet room.
Vertex data: R ambient visibility, G bevel mask; lighting is never baked into colour.
"""
import bpy
import math
import random
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ASTRA_FULL = True
BASE = "D:/BANG/project/textRPG"
SOURCE = BASE + "/art-studies/regions/arcana-shop-interior/source/shop-astra"
EXPORT = BASE + "/godot-arcana/art/source/shop-astra"
rng = random.Random(2811)
original = bpy.data.objects.get("ArcanaShop")
signature = original.get("layout_signature") if original else None
if not signature:
    signature = next((o.get("layout_signature") for o in bpy.data.objects if o.get("astra_version")), None)
if not signature:
    raise RuntimeError("An original signed shop root is required; do not infer a different gameplay layout.")
scene_name = "Shop Astra Full" if ASTRA_FULL else "Shop Astra Reference"
existing = bpy.data.scenes.get(scene_name)
for owned_scene_name in [scene_name,scene_name+" Export"]:
    owned_scene=bpy.data.scenes.get(owned_scene_name)
    if owned_scene:
        for owned_object in list(owned_scene.objects):
            bpy.data.objects.remove(owned_object,do_unlink=True)
        bpy.data.scenes.remove(owned_scene)
scene = bpy.data.scenes.new(scene_name)
bpy.context.window.scene = scene
scene.world = bpy.data.worlds.new(scene_name + " World")
scene.world.color = (0.3, 0.3, 0.3)
root = bpy.data.objects.new("AstraShop", None)
scene.collection.objects.link(root)
root["layout_signature"] = signature
root["astra_version"] = "1"
root["art_direction"] = "warm soft pixel planes; west window; front ortho 45"
groups = {}
def group(name):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    obj.parent = root
    groups[name] = obj
    return obj
architecture = group("AstraArchitecture")
floor_group = group("AstraFloor")
counter_group = group("AstraCounter")
shade_group = group("AstraLightBlockers")
shade_group["shadow_only"] = True
state = {'group': architecture}

def lin(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
def rgba(h):
    return tuple(lin(int(h[i:i+2],16)/255) for i in (0,2,4)) + (1.0,)
mats = {}
def mat(name, colour):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    col = rgba(colour)
    material.diffuse_color = col
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = col
    bsdf.inputs["Roughness"].default_value = 1.0
    mats[name] = material
    return material
for name,col in [
    ("AstraStone","ded7c4"),("AstraStoneCap","eee0c3"),("AstraStoneSeam","bebeb4"),
    ("AstraOak","b79a70"),("AstraOakLight","c4a77e"),("AstraOakDark","7e786c"),
    ("AstraNavy","526775"),("AstraNavyInset","657986"),("AstraBrass","cab17b"),
    ("AstraPaper","e2d4ac"),("AstraCream","d6c7a3"),("AstraSage","829976"),
    ("AstraLeaf","729073"),("AstraLeafLight","9caf7e"),("AstraLavender","a694bd"),
    ("AstraTeal","7baea3"),("AstraRose","c39c95"),("AstraBlue","849eaf"),("AstraAmber","c8a16e"),
    ("AstraInk","727f88"),("AstraCork","b09871"),("AstraSky","b9cbd0"),
]:
    mat(name,col)
grain = mat("AstraOakGrain","ffffff")
image = bpy.data.images.load(BASE + "/godot-arcana/art/export/shop-astra/oak-grain.png", check_existing=True)
image.reload()
tex = grain.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = image
tex.interpolation = "Closest"
bsdf = next(n for n in grain.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
grain.node_tree.links.new(tex.outputs["Color"],bsdf.inputs["Base Color"])
grain.diffuse_color = rgba("c0a886")
wood_surface=grain.copy()
wood_surface.name="AstraOakSurface"
mats["AstraOakSurface"]=wood_surface

def attach(obj, material, ao=1.0):
    scene.collection.objects.link(obj)
    obj.parent = state['group']
    obj.data.materials.append(mats[material])
    obj["astra_ao"] = ao
    return obj
def box(name, pos, size, material, bevel=0.02, ao=1.0):
    # Inputs use world x, Godot floor z, height.
    x,z,h = pos
    sx,sz,sy = size
    verts = [(a*sx/2,b*sz/2,c*sy/2) for a,b,c in
             [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
              (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    faces = [(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj = attach(bpy.data.objects.new(name,mesh),material,ao)
    obj.location = (x,-z,h)
    if bevel:
        modifier = obj.modifiers.new("Soft one-plane edge","BEVEL")
        modifier.width = min(bevel,min(size)/3)
        modifier.segments = 1
    # Plane-aligned UVs, kept independent from bevel/AO.
    uv = mesh.uv_layers.new(name="SurfaceUV")
    for p in mesh.polygons:
        for li in p.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv = ((v.x/sx)+0.5, (v.y/sz)+0.5) if abs(p.normal.z)>.5 else ((v.x+v.y)/max(sx,sz)+.5,v.z/sy+.5)
    return obj

def lathe(name, x,z,h, rings, material, segments=12):
    verts=[]
    for radius,height in rings:
        verts += [(radius*math.cos(2*math.pi*j/segments),radius*math.sin(2*math.pi*j/segments),height) for j in range(segments)]
    faces=[]
    for r in range(len(rings)-1):
        for j in range(segments):
            faces.append((r*segments+j,r*segments+(j+1)%segments,(r+1)*segments+(j+1)%segments,(r+1)*segments+j))
    faces += [tuple(reversed(range(segments))),tuple((len(rings)-1)*segments+j for j in range(segments))]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    obj=attach(bpy.data.objects.new(name,mesh),material)
    obj.location=(x,-z,h)
    for p in mesh.polygons[:-2]:
        p.use_smooth=True
    return obj

def bottle(name,x,z,h,colour,scale=1.0,shape=0):
    s=scale
    if shape==0:
        profile=[(.11*s,0),(.16*s,.045*s),(.17*s,.25*s),(.12*s,.34*s),(.065*s,.38*s),(.065*s,.47*s)]
    else:
        profile=[(.10*s,0),(.145*s,.04*s),(.145*s,.28*s),(.09*s,.32*s),(.09*s,.39*s)]
    lathe(name,x,z,h,profile,colour)
    top=profile[-1][1]
    lathe(name+" cork",x,z,h+top,[(.072*s,0),(.073*s,.05*s)],"AstraCork")
    box(name+" label",(x,z+.143*s,h+.18*s),(.15*s,.012,.10*s),"AstraPaper",.006)

def emblem(name,x,z,h,r,material):
    # Flat eight-ray shop sigil, actual inset face instead of screen effect.
    vertices=[]
    for i in range(16):
        a=math.pi/2+i*math.pi/8
        radius=r if i%2==0 else r*.36
        vertices.append((x+math.cos(a)*radius,-z,h+math.sin(a)*radius))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],[tuple(range(16))])
    mesh.update()
    obj=attach(bpy.data.objects.new(name,mesh),material)
    obj["no_shadow"]=True

def leaf(name,at,angle,scale,colour):
    x,z,h=at
    # A bent broad leaf, two softly distinct planes.
    direction=Vector((math.cos(angle),math.sin(angle),.7))*scale
    side=Vector((-math.sin(angle),math.cos(angle),0))*scale*.30
    origin=Vector((x,-z,h))
    mid=origin+direction*.55
    verts=[origin,mid+side,origin+direction,mid-side,mid+Vector((0,0,.07*scale))]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],[(4,1,0),(4,2,1),(4,3,2),(4,0,3)])
    mesh.update()
    return attach(bpy.data.objects.new(name,mesh),colour)
def herb(name,x,z,h,size=.65):
    lathe(name+" pot",x,z,h,[(.13*size,0),(.19*size,.27*size),(.20*size,.29*size)],"AstraCream")
    for j in range(7):
        leaf(name+" leaf", (x,z,h+.24*size), j*2.4, (.34+.07*(j%3))*size,
             ["AstraLeaf","AstraSage","AstraLeafLight"][j%3])
def book(name,x,z,h,colour,w=.13,height=.42,lean=0):
    obj=box(name,(x,z,h+height/2),(w,.29,height),colour,.012)
    obj.rotation_euler.y=lean
    box(name+" gold mark",(x,z+.15,h+height*.20),(w*.8,.012,.025),"AstraBrass",.002)
def scroll(name,x,z,h):
    obj=lathe(name,x,z,h,[(.08,0),(.08,.42)],"AstraPaper",10)
    obj.rotation_euler.y=math.pi/2
    lathe(name+" tie",x+.21,z,h,[(.085,0),(.085,.04)],"AstraNavy",10).rotation_euler.y=math.pi/2


def panel_shape(name, points, depth, material):
    verts=[(x,-z,h) for x,z,h in points]
    n=len(verts)
    verts += [(x,y+depth,h) for x,y,h in verts]
    faces=[tuple(range(n)),tuple(reversed(range(n,n*2)))]
    for i in range(n):
        faces.append((i,(i+1)%n,(i+1)%n+n,i+n))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    return attach(bpy.data.objects.new(name,mesh),material)
def arch(name,x,z,h,r,thickness,material):
    verts=[]
    for i in range(17):
        a=math.pi*i/16
        for radius in [r,r-thickness]:
            verts.append((x+math.cos(a)*radius,-z,h+math.sin(a)*radius*.40))
    faces=[(i*2+2,i*2+3,i*2+1,i*2) for i in range(16)]
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    return attach(bpy.data.objects.new(name,mesh),material)
def bundle(name,x,z,h,colour):
    # Tied hanging herb: visible stems and a broad clustered silhouette.
    box(name+" tie",(x,z,h),(.08,.055,.065),"AstraBrass",.01)
    for j in range(5):
        dx=(j-2)*.055
        stem=box(name+" stem",(x+dx*.5,z,h-.14),(.022,.025,.29),"AstraLeaf",.006)
        stem.rotation_euler.y=-(j-2)*.11
        for k in range(2):
            leaf(name+" leaves",(x+dx,z,h-.22-k*.065),j*2.5+k,.23,colour if k==0 else "AstraLeafLight")
def satchel(name,x,z,h):
    box(name+" body",(x,z,h+.19),(.58,.34,.38),"AstraOakDark",.065)
    box(name+" flap",(x,z+.018,h+.34),(.61,.35,.18),"AstraOak",.055)
    box(name+" strap",(x,z+.197,h+.21),(.07,.025,.30),"AstraBrass",.008)
    box(name+" buckle",(x,z+.22,h+.24),(.13,.022,.11),"AstraBrass",.018)
    box(name+" buckle inset",(x,z+.235,h+.24),(.06,.01,.05),"AstraOakDark",.006)

# Pale cutaway shell and structural wall details.
box("Foundation",(12,8.5,-.14),(14.35,9.35,.28),"AstraStoneSeam",.07)
box("Rear limestone wall",(12,3.94,1.80),(14.25,.32,3.6),"AstraStone",.025)
box("Rear blue dado",(12,4.13,.77),(14.05,.10,.72),"AstraNavyInset",.01)
for h in [.40,1.15]:
    box("Dado oak rail",(12,4.21,h),(14.07,.07,.065),"AstraOakLight",.01)
for row in range(3):
    h=1.57+row*.63
    box("Limestone course",(12,4.107,h),(13.95,.012,.016),"AstraStoneSeam",0)
    for j in range(8):
        x=5.5+j*1.7+(.85 if row%2 else 0)
        if x<18.8:
            box("Limestone joint",(x,4.109,h-.30),(.013,.014,.55),"AstraStoneSeam",0)
box("Rear foot course",(12,4.13,.22),(14.3,.18,.44),"AstraStoneSeam",.025)
box("Rear crown",(12,3.98,3.65),(14.5,.56,.18),"AstraStoneCap",.035)
for x in [5.12,6.65,17.35,18.88]:
    box("Stone pilaster",(x,4.18,1.75),(.30,.34,3.45),"AstraStone",.035)
    box("Pilaster capital",(x,4.18,3.38),(.48,.44,.16),"AstraStoneCap",.035)
for x in [5.02,18.98]:
    box("Cutaway sidewall",(x,8.5,.28),(.30,9,.56),"AstraStone",.035)
    box("Cutaway side coping",(x,8.5,.59),(.42,9.08,.12),"AstraStoneCap",.025)
for x,width in [(8,6),(16,6)]:
    box("Front cutaway wall",(x,13.02,.20),(width,.30,.40),"AstraStone",.025)
    box("Front coping",(x,13.02,.43),(width+.08,.44,.10),"AstraStoneCap",.025)
box("Entry threshold",(12,12.88,.025),(2,.55,.12),"AstraStoneCap",.025)
for x in [11,13]:
    box("Entry post",(x,13.03,.41),(.32,.40,.82),"AstraStone",.04)
    box("Entry post cap",(x,13.03,.84),(.44,.48,.12),"AstraStoneCap",.03)
# West window is an actual opening at the fixed camera; jambs reveal its thickness.
def window_x(z):
    return 5.15-.23*(z-5.85)
sill=box("West window sill",(window_x(7.35),7.35,1.12),(.40,3.1,.18),"AstraStoneCap",.035)
sill.rotation_euler.z=-math.atan(.23)
for z in [5.85,8.85]:
    box("West window jamb",(window_x(z),z,2.22),(.20,.23,2.3),"AstraStone",.025)
lintel=box("West window lintel",(window_x(7.35),7.35,3.34),(.28,3.25,.23),"AstraStoneCap",.035)
lintel.rotation_euler.z=-math.atan(.23)
for z in [6.85,7.85]:
    box("Window mullion",(window_x(z)+.015,z,2.23),(.10,.08,2.1),"AstraOakLight",.01)
crossbar=box("Window crossbar",(window_x(7.35)+.02,7.35,2.25),(.11,3,.08),"AstraOakLight",.01)
crossbar.rotation_euler.z=-math.atan(.23)
state['group']=group("AstraWindowSky")
mesh=bpy.data.meshes.new("Window pale sky")
mesh.from_pydata([(window_x(z)-.025,-z,h) for z,h in [(5.95,1.22),(5.95,3.22),(8.75,3.22),(8.75,1.22)]],[],[(0,1,2,3)])
mesh.update()
pane=attach(bpy.data.objects.new("Opaque sky beyond window",mesh),"AstraSky")
pane["no_shadow"]=True
state['group']=architecture
# Hidden-from-camera architecture still casts the real sun shadow in Godot.
state['group']=shade_group
box("Shadow front wall",(12,13.28,1.94),(14.6,.18,3.88),"AstraStone",0)
box("Shadow roof",(12,8.5,3.83),(14.4,9.4,.20),"AstraStone",0)
box("Shadow west below window",(4.78,8.5,.55),(.18,9.5,1.1),"AstraStone",0)
box("Shadow west above window",(4.78,8.5,3.62),(.18,9.5,.60),"AstraStone",0)
box("Shadow west rear",(4.78,4.83,2.2),(.18,1.94,2.25),"AstraStone",0)
box("Shadow west front",(4.78,11.4,2.2),(.18,5.2,2.25),"AstraStone",0)
for o in list(shade_group.children):
    o["shadow_only"]=True
# Quiet, staggered wood boards with PixelPen albedo; real seams below a pixel at base zoom.
state['group']=floor_group
box('Floor underlay',(12,8.5,-.008),(14,9,.04),'AstraOak',0)
for row in range(24):
    depth=9/24
    z=4+depth*(row+.5)
    start=5-(1.4 if row%2 else 0)
    while start<19:
        end=min(start+2.8,19)
        a=max(start,5)
        if end>a:
            box("Oak floor board",(a+(end-a)/2,z,-.005),(end-a-.006,depth-.006,.065),"AstraOakGrain",.006)
        start+=2.8
# A new solid counter with framed blue panels, deep top lip and stone base.
state['group']=counter_group
box("Counter plinth",(12,7.5,.11),(4.05,1.04,.22),"AstraStoneSeam",.035)
box("Counter solid body",(12,7.5,.53),(3.91,.91,.80),"AstraOak",.025)
box("Counter navy inset",(12,7.975,.53),(3.64,.045,.59),"AstraNavy",.018,.90)
for x in [10.17,11.07,12.93,13.83]:
    box("Counter front stile",(x,8.012,.54),(.09,.075,.70),"AstraOakLight",.012)
for h in [.21,.88]:
    box("Counter long rail",(12,8.015,h),(3.8,.075,.09),"AstraOakLight",.012)
box("Counter thick top",(12,7.5,1.015),(4.15,1.13,.19),"AstraOakLight",.035)
box("Counter top centre",(12,7.5,1.119),(3.90,.91,.025),"AstraOakSurface",.012)
emblem("Counter eight ray emblem",12,8.041,.55,.245,"AstraBrass")
for x in [11.54,12.46]:
    box("Emblem small dot",(x,8.046,.55),(.045,.012,.045),"AstraBrass",.012)
# Small grouped counter stock, with an open area for trade.
bottle("Counter teal jar",10.48,7.48,1.14,"AstraTeal",.66,1)
bottle("Counter cream jar",10.73,7.47,1.14,"AstraCream",.55,1)
box("Ledger paper",(13.22,7.54,1.16),(.50,.35,.06),"AstraPaper",.012)
box("Ledger navy cover",(13.22,7.54,1.125),(.54,.39,.035),"AstraNavy",.012)
# Cabinets keep the exact original gameplay coordinates and footprint.
def cabinet(cx,kind,index):
    state['group']=group("AstraCabinet_"+kind+"_"+str(index))
    state["group"]["shop_asset"]=kind+"-cabinet"
    state["group"]["layout_origin"]=[cx-1,4.5]
    capheight=3.04 if kind=="potion" else 2.94
    box("Cabinet plinth",(cx,4.75,.13),(1.96,.58,.22),"AstraOakDark",.025)
    box("Cabinet back",(cx,4.52,1.55),(1.82,.09,2.68),"AstraOakDark",.01,.62)
    for x in [cx-.90,cx+.90]:
        box("Cabinet side",(x,4.77,1.55),(.14,.52,2.70),"AstraOak",.018)
        box("Side foot",(x,4.82,.14),(.20,.48,.24),"AstraOakLight",.02)
    box("Cabinet crown lower",(cx,4.76,capheight-.13),(2.01,.60,.12),"AstraOakLight",.025)
    box("Cabinet crown",(cx,4.76,capheight),(2.09,.65,.17),"AstraOakSurface",.055)
    box("Cabinet cornice highlight",(cx,4.77,capheight+.09),(1.99,.57,.045),"AstraOakLight",.012)
    for height in [.63,1.36,2.09]:
        box("Shelf board",(cx,4.80,height),(1.76,.49,.105),"AstraOakLight",.012)
        box("Shelf front lip",(cx,5.055,height-.015),(1.77,.075,.13),"AstraOak",.012)
    box("Cabinet lower drawer",(cx,4.88,.43),(1.69,.33,.29),"AstraOak",.025)
    box("Drawer inner panel",(cx,5.055,.43),(1.47,.035,.17),"AstraOakDark",.012)
    box("Drawer warm face",(cx,5.077,.44),(1.37,.018,.13),"AstraOak",.009)
    box("Drawer pull",(cx,5.11,.44),(.25,.055,.055),"AstraBrass",.012)
    for x in [cx-.85,cx+.85]:
        box("Crown bracket",(x,4.95,2.74),(.19,.20,.22),"AstraOakLight",.035)
    # A restrained little brass sign on the crown.
    box("Category plaque",(cx,5.09,capheight-.03),(.35,.035,.16),"AstraNavy",.018)
    emblem("Plaque sigil",cx,5.111,capheight-.03,.057,"AstraBrass")
    if kind=="herb":
        for j in range(3):
            bundle("Hanging herb",cx-.52+j*.50,4.90,2.72,["AstraSage","AstraLeaf","AstraLavender"][j])
        for k,h in enumerate([.685,1.415]):
            herb("Herb bundle",cx+(-.52 if index==1 else .50),4.84,h,.70 if k<2 else .82)
            bottle("Apothecary jar",cx+(.01 if index==1 else -.50),4.82,h,["AstraCream","AstraSage","AstraLavender"][(k+index-1)%3],.76,1)
            bottle("Companion jar",cx+(.45 if index==1 else -.02),4.82,h,["AstraSage","AstraCream","AstraTeal"][(k+index-1)%3],.64,1)
    elif kind=="potion":
        points=[(cx-.78,5.14,3.02),(cx+.78,5.14,3.02)]
        for j in range(17):
            a=math.pi*j/16
            points.append((cx+.78*math.cos(a),5.14,3.02+.30*math.sin(a)))
        panel_shape("Potion arched sign",points,.12,"AstraNavy")
        arch("Arch brass curve",cx,5.155,3.02,.78,.045,"AstraBrass")
        # Little moon icon offset rings as an explicit crescent silhouette.
        moon_points=[]
        for j in range(17):
            a=math.pi*.35+math.pi*1.3*j/16
            moon_points.append((cx+.12*math.cos(a),5.17,3.15+.12*math.sin(a)))
        for j in range(16,-1,-1):
            a=math.pi*.35+math.pi*1.3*j/16
            moon_points.append((cx+.055+.095*math.cos(a),5.17,3.15+.095*math.sin(a)))
        panel_shape("Moon plaque",moon_points,.008,"AstraBrass")
        for k,h in enumerate([.685,1.415,2.145]):
            for j in range(4):
                bottle("Potion",cx-.57+j*.38,4.82,h,
                       ["AstraTeal","AstraBlue","AstraLavender","AstraAmber"][(j+k)%4],
                       [.8,.95,.72,.83][(j+k)%4])
    elif kind=="travel" and index==2:
        for j in range(3):
            box("Travel folded cloth",(cx-.42,4.82,2.21+j*.12),(.62,.30,.105),
                ["AstraCream","AstraBlue","AstraCream"][j],.025)
        bedroll=lathe("Rolled blanket",cx+.08,4.84,2.34,[(.17,0),(.19,.06),(.19,.48),(.17,.54)],"AstraBlue")
        bedroll.rotation_euler.y=math.pi/2
        lathe("Blanket tie",cx+.32,4.84,2.34,[(.195,0),(.195,.055)],"AstraPaper").rotation_euler.y=math.pi/2
        satchel("Travel satchel",cx-.42,4.82,1.415)
        scroll("Folded map",cx+.18,4.83,1.54)
        scroll("Second map",cx+.18,4.83,1.70)
        box("Supply chest",(cx-.40,4.83,.86),(.67,.35,.35),"AstraOak",.035)
        box("Chest lid",(cx-.40,4.83,1.045),(.70,.37,.08),"AstraOakLight",.02)
        lathe("Linen bag",cx+.37,4.83,.685,[(.13,0),(.21,.07),(.19,.28),(.10,.39),(.12,.43)],"AstraCream")
        lathe("Bag tie",cx+.37,4.83,1.06,[(.115,0),(.115,.035)],"AstraCork")
    else:
        for k,h in enumerate([.685,1.415,2.145]):
            for j in range(3):
                book("Travel book",cx-.60+j*.17,4.85,h,
                     ["AstraNavyInset","AstraSage","AstraRose"][(j+k)%3],.13,.44+j*.035)
            if k==1:
                for j in range(2):
                    scroll("Map roll",cx+.20,4.86,h+.11+j*.17)
            elif k==0:
                satchel("Travel satchel",cx+.37,4.83,h)
            else:
                box("Folded linen",(cx+.39,4.81,h+.09),(.57,.30,.16),"AstraCream",.045)
                box("Folded blue cloth",(cx+.39,4.82,h+.23),(.55,.29,.12),"AstraBlue",.035)
cabinet(8,"herb",1)
if ASTRA_FULL:
    cabinet(10,"herb",2)
    cabinet(12,"potion",1)
    cabinet(14,"travel",1)
    cabinet(16,"travel",2)
# Blender author's camera mirrors the actual game front orthographic projection.
camera_data=bpy.data.cameras.new(scene_name+" Camera")
camera=bpy.data.objects.new(scene_name+" Camera",camera_data)
scene.collection.objects.link(camera)
camera.location=(12,-22.4,15.7)
target=Vector((12,-8.4,1.7))
camera.rotation_euler=(target-camera.location).to_track_quat("-Z","Y").to_euler()
camera_data.type="ORTHO"
camera_data.ortho_scale=17.3
scene.camera=camera
scene.render.resolution_x=1280
scene.render.resolution_y=800
scene.render.resolution_percentage=100
scene["astra_source"]="build_shop_astra.py"
scene["reference_only"]=not ASTRA_FULL
# A viewport preview; all production shading is supplied by Godot's shared profile.
scene.display.shading.light="STUDIO"
scene.display.shading.color_type="MATERIAL"
for obj in scene.objects:
    if obj.type=="MESH":
        colours=obj.data.color_attributes.new(name="AstraSurfaceData",type="FLOAT_COLOR",domain="CORNER")
        ao=float(obj.get("astra_ao",1.0))
        for entry in colours.data:
            entry.color=(ao,0,1,1)

# Bake a separate, non-colour, floor ambient visibility mask from the actual authored meshes.
# This is local hemisphere occlusion, not a hand-painted positional shadow patch.
bpy.context.view_layer.update()
depsgraph=bpy.context.evaluated_depsgraph_get()
ao_vertices=[]
ao_faces=[]
for obj in scene.objects:
    if obj.type!="MESH" or obj.parent==floor_group or obj.parent==shade_group:
        continue
    mesh=obj.evaluated_get(depsgraph).to_mesh()
    first=len(ao_vertices)
    ao_vertices.extend([obj.matrix_world @ v.co for v in mesh.vertices])
    ao_faces.extend([tuple(first+i for i in p.vertices) for p in mesh.polygons])
    obj.evaluated_get(depsgraph).to_mesh_clear()
bvh=BVHTree.FromPolygons(ao_vertices,ao_faces)
rays=[]
for j in range(20):
    height=.12+.83*(j+.5)/20
    a=j*2.39996323
    r=math.sqrt(1-height*height)
    rays.append(Vector((math.cos(a)*r,math.sin(a)*r,height)))
width,height=280,180
pixels=[]
for row in range(height):
    z=4+9*(row+.5)/height
    for col in range(width):
        x=5+14*(col+.5)/width
        origin=Vector((x,-z,.045))
        occ=0.0
        for ray in rays:
            hit,normal,index,distance=bvh.ray_cast(origin,ray,.50)
            if hit is not None:
                occ+=(1-distance/.50)**.5
        value=max(.20,1-occ/len(rays)*1.65)
        value=math.floor(value*5+.5)/5
        pixels.extend((value,value,value,1.0))
ao_image=bpy.data.images.new(scene_name+" floor AO",width=width,height=height,alpha=False)
ao_image.colorspace_settings.name="Non-Color"
ao_image.pixels.foreach_set(pixels)
ao_image.filepath_raw=EXPORT+("/floor-ao.png" if ASTRA_FULL else "/reference-floor-ao.png")
ao_image.file_format="PNG"
ao_image.save()
root["astra_floor_ao"]="res://art/source/shop-astra/"+("floor-ao.png" if ASTRA_FULL else "reference-floor-ao.png")

# Export evaluated copies, joined per assembly/material; originals remain editable with modifiers.
export_scene=bpy.data.scenes.new(scene_name+" Export")
bpy.context.window.scene=export_scene
export_root=bpy.data.objects.new("AstraShop",None)
export_scene.collection.objects.link(export_root)
for key in root.keys():
    export_root[key]=root[key]
depsgraph=bpy.context.evaluated_depsgraph_get()
# Evaluate in the authoring scene, then link immutable export copies.
bpy.context.window.scene=scene
depsgraph=bpy.context.evaluated_depsgraph_get()
batches={}
for obj in list(scene.objects):
    if obj.type!="MESH":
        continue
    evaluated=obj.evaluated_get(depsgraph)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
    colours=mesh.color_attributes.get("AstraSurfaceData")
    if not colours:
        colours=mesh.color_attributes.new(name="AstraSurfaceData",type="FLOAT_COLOR",domain="CORNER")
    ao=float(obj.get("astra_ao",1.0))
    baked_ao={}
    if obj.parent not in [floor_group,shade_group,architecture]:
        for poly in mesh.polygons:
            normal=obj.matrix_world.to_3x3() @ poly.normal
            rotation=Vector((0,0,1)).rotation_difference(normal)
            directions=[rotation @ ray for ray in rays[::2]]
            for li in poly.loop_indices:
                vertex=mesh.vertices[mesh.loops[li].vertex_index]
                origin=obj.matrix_world @ vertex.co + normal*.018
                key=(tuple(vertex.co),tuple(poly.normal))
                if key not in baked_ao:
                    occ=0.0
                    for ray in directions:
                        hit,norm,index,distance=bvh.ray_cast(origin,ray,.70)
                        if hit is not None:
                            occ+=(1-distance/.70)**.5
                    baked_ao[key]=max(.30,1-occ/len(directions)*1.4)
    for p in mesh.polygons:
        diagonal=sum(abs(c)>.1 for c in p.normal)>1
        # Round jars/leaf faces are not contour trim. Only authored box bevels carry G.
        edge=1.0 if diagonal and len(obj.modifiers)>0 else 0.0
        for li in p.loop_indices:
            key=(tuple(mesh.vertices[mesh.loops[li].vertex_index].co),tuple(p.normal))
            visibility=ao*baked_ao.get(key,1.0)
            colours.data[li].color=(visibility,edge,1,1)
    mesh.color_attributes.active_color=colours
    copy=bpy.data.objects.new(obj.name,mesh)
    copy.matrix_world=obj.matrix_world
    export_scene.collection.objects.link(copy)
    copy.parent=export_root
    for key in obj.keys():
        copy[key]=obj[key]
    group_name=obj.parent.name
    batches.setdefault(group_name,[]).append(copy)
bpy.context.window.scene=export_scene
for group_name,objects in batches.items():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    joined=bpy.context.object
    joined.name=group_name
    if group_name.startswith("AstraLightBlockers"):
        joined["shadow_only"]=True
bpy.ops.object.select_all(action="SELECT")
export_path=EXPORT+("/arcana-shop-astra.glb" if ASTRA_FULL else "/reference.glb")
bpy.ops.export_scene.gltf(filepath=export_path,export_format="GLB",use_selection=True,
    export_extras=True,export_yup=True,export_materials="EXPORT",export_animations=False,
    use_active_scene=True,export_vertex_color="ACTIVE",
    export_cameras=False,export_lights=False)
bpy.context.window.scene=scene
for obj in scene.objects:
    obj.select_set(False)
root.select_set(True)
bpy.context.view_layer.objects.active=root
# The exported copy is retained as a separate scene for auditing; authoring is the active scene.
bpy.ops.wm.save_as_mainfile(filepath=SOURCE+("/arcana-shop-astra.blend" if ASTRA_FULL else "/reference.blend"),copy=True)
print({"astra_scene":scene.name,"full":ASTRA_FULL,"author_objects":len(scene.objects),
       "export_meshes":sum(o.type=="MESH" for o in export_scene.objects),"export":export_path})
