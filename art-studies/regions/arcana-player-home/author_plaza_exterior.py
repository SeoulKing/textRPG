"""Author the A-home exterior in Blender and export the plaza model."""

import math
import random
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "player-home-campus-a.blend"
DESTINATION = HERE.parents[2] / "godot-arcana/art/source/player-home-campus-a"
if not bpy.app.background or Path(bpy.data.filepath).resolve() != SOURCE:
    raise RuntimeError("Open the A-home source in Blender background mode.")

sys.path.insert(0, str(HERE.parent / "arcana-inn-interior/source/blender-v1"))
from export_inn import pack_group

scene = bpy.context.scene
scene.name = "Arcana | Library Lane street facade"
rng = random.Random(684)
materials = bpy.data.materials
plaster = materials["Library Lane | cream lime plaster"]
mortar = materials["Library Lane | mortar"]
limestone = [materials[f"Library Lane | limestone {i}"] for i in range(5)]
slate = materials["Library Lane | blue slate"]
indigo = materials["Library Lane | indigo wood paint"]
wood = materials["Oak | dark carved frames"]
brass = materials["Brass | aged and polished"]
iron = materials["Iron | blackened"]
leaf = materials["Library Lane | leaf"]
leaf_light = materials["Library Lane | fresh leaf"]
flower = materials["Library Lane | lavender"]
clay = materials["Library Lane | fired clay"]
for obj in list(scene.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for group in list(scene.collection.children):
    scene.collection.children.unlink(group)


def paint(name, hex_color, roughness=.69, emission=0.0):
    channels = [int(hex_color[i:i+2], 16)/255 for i in (0,2,4)]
    rgb = tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in channels)
    mat = materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb,1)
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Emission Color"].default_value = mat.diffuse_color
    shader.inputs["Emission Strength"].default_value = emission
    return mat


glass = paint("Exterior | dusty blue old glass", "526789", .18, .18)
lamp = paint("Exterior | amber lantern glass", "FFBA61", .44, 1.28)
roof_palette = [paint(f"Exterior | slate shingle {i}", c) for i,c in enumerate(
    ("3D4864","465373","4A5677","535D7B","3B465F","4B5371","414C69"))]


def collection(name):
    result = bpy.data.collections.new(name)
    scene.collection.children.link(result)
    return result


def box(group, name, x,z,y,w,d,h,mat,bevel=.018,shape="box"):
    bm = bmesh.new()
    if shape == "round":
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=14, radius1=.5, radius2=.5, depth=1)
    elif shape == "leaf":
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=.5)
    else:
        bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((w,d,h,1))), verts=list(bm.verts))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = (x,-z,y)
    if bevel and shape != "leaf":
        rounded = obj.modifiers.new("Worn chamfer", "BEVEL")
        rounded.width = bevel
        rounded.segments = 2
        obj.modifiers.new("Weighted corners", "WEIGHTED_NORMAL")
    return obj


def beam(group, name, a, b, width, mat):
    v0,v1=(Vector((x,-z,y)) for x,z,y in (a,b))
    mid=(v0+v1)/2
    obj=box(group,name,mid.x,-mid.y,mid.z,width,width,(v1-v0).length,mat,.008)
    obj.rotation_euler=(v1-v0).to_track_quat("Z","Y").to_euler()


base=collection("Stone walls and foundation")
roof=collection("Indigo slate roof")
joinery=collection("Door windows and porch")
garden=collection("Flower boxes and lavender")
box(base,"Low limestone foundation",0,-.04,.091,5.76,4.03,.182,mortar,.036)
box(base,"Stone plinth ledge",0,-.04,.19,5.81,4.07,.102,limestone[2],.023)
box(base,"Back limewashed wall",0,-1.91,1.44,5.66,.20,2.53,plaster)
for x in (-2.73,2.73):
    box(base,"Side limewashed wall",x,-.01,1.44,.20,3.79,2.53,plaster)
# Make the street openings read as recesses instead of pasting panes on flat masonry.
for left,right,bottom,top in [(-2.82,-2.22,.24,2.66),(-.92,-.48,.24,2.66),
    (.48,.92,.24,2.66),(2.22,2.82,.24,2.66),
    (-2.22,-.92,.24,.96),(.92,2.22,.24,.96),
    (-2.22,-.92,2.02,2.66),(.92,2.22,2.02,2.66),
    (-.48,.48,2.015,2.66)]:
    box(base,"Street masonry section",(left+right)/2,1.91,(bottom+top)/2,
        right-left,.22,top-bottom,mortar,.008)
    rows=max(1,round((top-bottom)/.205))
    for row in range(rows):
        h=(top-bottom)/rows
        at=left
        first=True
        while at < right-.017:
            size=min(right-at, (.30 if row%2 else .54) if first else rng.uniform(.44,.66))
            if right-at-size < .14: size=right-at
            box(base,"Cream ashlar",(at+size/2),2.039,bottom+h*(row+.5),
                size-.018,.060,h-.018,rng.choice(limestone),.012)
            first=False
            at+=size
for x in (-2.77,2.77):
    for i in range(11):
        y=.33+i*.217
        box(base,"Turned corner quoin",x,1.999,y,.233,.214,.195,limestone[i%3],.018)
    box(base,"Side oak sill",x,0,.42,.09,3.67,.10,wood)
box(base,"Street eave oak beam",0,1.99,2.69,5.84,.28,.18,wood,.027)

# Roof ridges and individual staggered slate courses.
eave=2.74
rise=1.36
run=2.24
angle=math.atan2(rise,run)
for side in (-1,1):
    shell=box(roof,"Pitched slate bed",0,side*run/2,eave+rise/2,6.00,math.hypot(run,rise),.105,slate,.022)
    shell.rotation_euler.x=side*angle
    for row in range(8):
        z=side*(.125+row*.283)
        center=eave+rise*(1-abs(z)/run)+.081
        x=-2.99
        while x<2.99-.02:
            width=min(2.99-x,rng.uniform(.27,.41) if x>-2.98 else (.194 if row%2 else .31))
            if 2.99-x-width < .125: width=2.99-x
            shingle=box(roof,"Overlapping indigo shingle",x+width/2,z,center,
               width-.010,.39,.061,rng.choice(roof_palette),.011)
            shingle.rotation_euler.x=side*angle
            x += width
for i in range(13):
    box(roof,"Continuous lapped ridge cap",-2.84+i*.47,0,eave+rise+.105,.48,.31,.126,roof_palette[i%7],.035)
for x in (-2.83,2.83):
    points=[(x,-1.95,eave),(x,1.95,eave),(x,0,eave+rise*.87)]
    vertices=[(a,-b,c) for a,b,c in points]
    data=bpy.data.meshes.new("Gable triangle")
    data.from_pydata(vertices,[],[(0,1,2) if x<0 else (2,1,0)])
    data.materials.append(plaster)
    obj=bpy.data.objects.new("Cream gable end",data)
    roof.objects.link(obj)
    obj.modifiers.new("Gable thickness","SOLIDIFY").thickness=.12
    for side in (-1,1):
        beam(roof,"Dark rake trim",(x,side*2.28,eave),(x,0,eave+rise+.07),.11,indigo)

for row in range(6):
    box(roof,"Chimney limestone course",-1.78,-.88,3.46+.175*row,.51,.55,.166,limestone[row%5],.012)
box(roof,"Chimney dark cap",-1.78,-.88,4.52,.66,.65,.11,slate,.024)
box(roof,"Chimney soot opening",-1.78,-.88,4.576,.325,.29,.009,iron,.008)

# Recessed indigo door, stone lintels and flower-box windows.
box(joinery,"Recessed indigo door",0,1.961,1.079,.88,.106,1.80,indigo,.028)
for x in (-.449,.449):
    box(joinery,"Oak door jamb",x,2.031,1.087,.104,.22,1.85,wood)
box(joinery,"Deep stone lintel",0,2.067,2.068,1.12,.34,.196,limestone[2],.028)
for x in (-.219,.219):
    for y in (.666,1.404):
        box(joinery,"Recessed blue door panel",x,2.023,y,.346,.035,.57,slate,.015)
        box(joinery,"Blue inset door field",x,2.048,y,.278,.020,.487,indigo,.013)
box(joinery,"Brass letter slot",0,2.078,1.17,.234,.04,.045,brass,.009)
box(joinery,"Brass back plate",.296,2.082,1.066,.087,.036,.158,brass,.009)
box(joinery,"Brass door knob",.297,2.113,1.1,.066,.065,.067,brass,.010,"round")
for z,y,w,d,h in ((2.13,.103,1.17,.34,.195),(2.41,.048,1.29,.32,.087)):
    box(joinery,"Rounded limestone doorstep",0,z,y,w,d,h,limestone[2],.027)
for x in (-1.57,1.57):
    box(joinery,"Indigo window sash",x,1.98,1.485,1.24,.17,1.01,indigo,.026)
    box(joinery,"Blue paned glass",x,2.077,1.49,1.033,.040,.794,glass,.018)
    for dx in (-.173,.173):
        box(joinery,"Window vertical glazing bar",x+dx,2.106,1.49,.047,.047,.826,indigo,.009)
    box(joinery,"Window horizontal glazing bar",x,2.103,1.49,1.078,.054,.044,indigo,.009)
    for y in (.944,2.039):
        box(joinery,"Pale stone window trim",x,2.07,y,1.37,.296,.120,limestone[2],.026)
    box(garden,"Oak herb window box",x,2.179,.855,1.166,.333,.224,wood,.024)
    for i in range(12):
        dx=rng.uniform(-.535,.535)
        depth=2.16+rng.uniform(-.08,.11)
        height=.99+rng.uniform(.025,.12)
        box(garden,"Herb leaf cluster",x+dx,depth,height,.17,.128,.20,rng.choice([leaf,leaf_light]),
            0,"leaf")
        if i%3==0:
            box(garden,"Paired lavender sprigs",x+dx,depth,height+.117,.078,.067,.125,flower,0,"leaf")

# A small lantern identifies the walkable threshold from across the fountain.
beam(joinery,"Iron lantern bracket",(.652,2.056,1.872),(.652,2.31,1.872),.043,iron)
box(joinery,"Warm amber lantern",.652,2.274,1.673,.165,.153,.21,lamp,.014)
for y in (1.55,1.792):
    box(joinery,"Iron lantern crown",.652,2.28,y,.226,.208,.054,iron,.013)
for dx,dz in ((-.086,-.08),(-.086,.08),(.086,-.08),(.086,.08)):
    beam(joinery,"Lantern frame",(.652+dx,2.274+dz,1.56),(.652+dx,2.274+dz,1.794),.018,iron)
box(garden,"Terracotta stoop pot",-.916,2.186,.147,.302,.302,.283,clay,.024,"round")
for i in range(9):
    dx=rng.uniform(-.16,.16)
    dz=rng.uniform(-.127,.127)
    tip=.4+rng.uniform(.05,.20)
    beam(garden,"Herb stem",(-.916,2.186,.22),(-.916+dx,2.186+dz,tip),.013,leaf)
    box(garden,"Lavender tip",-.916+dx,2.186+dz,tip,.064,.057,.121,flower,0,"leaf")

review=collection("Preview camera and lights")
camera_data=bpy.data.cameras.new("Street facade orthographic")
camera_data.type="ORTHO"
camera_data.ortho_scale=8.9
camera=bpy.data.objects.new("Review camera",camera_data)
review.objects.link(camera)
focus=Vector((0,-.13,2.01))
camera.location=focus+Vector((5,-13,8.0))
camera.rotation_euler=(focus-camera.location).to_track_quat("-Z","Y").to_euler()
scene.camera=camera
for name,pos,energy,size,color in [
    ("Warm plaza daylight",(1,-7,9),1250,7,(1,.90,.77)),
    ("Cool slate fill",(-5,3,6),900,8,(.71,.80,1)),
]:
    data=bpy.data.lights.new(name,"AREA")
    data.energy,data.size,data.color=energy,size,color
    light=bpy.data.objects.new(name,data)
    review.objects.link(light)
    light.location=pos
    light.rotation_euler=(focus-light.location).to_track_quat("-Z","Y").to_euler()

scene.render.engine="CYCLES"
scene.cycles.samples=18
scene.cycles.use_denoising=True
scene.render.resolution_x=1130
scene.render.resolution_y=840
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath="//plaza-exterior-blender.png"
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"player-home-plaza-exterior.blend"),compress=True)
bpy.ops.render.render(write_still=True)

# Keep the architecture and plant groups independently addressable within the GLB.
graph=bpy.context.evaluated_depsgraph_get()
output=[]
for group in (base,roof,joinery,garden):
    pivot=bpy.data.objects.new(group.name,None)
    scene.collection.objects.link(pivot)
    bpy.context.view_layer.update()
    packed=pack_group(pivot,list(group.all_objects),graph)
    output.extend(packed)
for material in (wood,):
    shader=next(node for node in material.node_tree.nodes if node.type=="BSDF_PRINCIPLED")
    for channel in ("Base Color","Normal"):
        for link in list(shader.inputs[channel].links):
            if link.from_node.type!="TEX_IMAGE":
                material.node_tree.links.remove(link)

bpy.ops.object.select_all(action="DESELECT")
for obj in output:
    obj.select_set(True)
temp=DESTINATION/"plaza-home-exterior.tmp.glb"
result=bpy.ops.export_scene.gltf(filepath=str(temp),export_format="GLB",use_selection=True,
    export_animations=False,export_cameras=False,export_lights=False)
if "FINISHED" not in result:
    raise RuntimeError("Exterior GLB export failed.")
temp.replace(DESTINATION/"plaza-home-exterior.glb")
