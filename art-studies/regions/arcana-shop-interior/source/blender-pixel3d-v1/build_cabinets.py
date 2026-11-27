"""Model three Arcana shop cabinets in Blender; dimensions are 2 x 0.5 x 3."""
import bpy, math, os
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def mat(name, color, metallic=0.0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    shader=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value=(*color,1)
    shader.inputs["Metallic"].default_value=metallic
    shader.inputs["Roughness"].default_value=.65
    return m
wood=mat("Walnut",(0.25,0.085,0.032)); woodlight=mat("Warm oak",(0.46,0.21,0.074))
shadow=mat("Recess",(0.062,0.033,0.027)); gold=mat("Antique brass",(0.68,0.40,0.11),.35)
navy=mat("Midnight blue",(0.025,0.046,0.11))
colors=[mat("Potion cyan",(0.06,0.52,0.54)),mat("Potion blue",(0.08,0.23,0.58)),mat("Potion violet",(0.39,0.12,0.51)),mat("Potion amber",(0.79,0.29,0.045))]
leaf=mat("Herbs green",(0.16,0.35,0.09)); violet=mat("Herbs violet",(0.36,0.15,0.42))
cream=mat("Parchment",(0.70,0.53,0.28)); brown=mat("Leather",(0.28,0.13,0.055))
created=[]
def cube(name, loc, scale, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob=bpy.context.object; ob.name=name; ob.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(material); created.append(ob); return ob
def cylinder(name, loc, radius, depth, material, vertices=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    ob=bpy.context.object; ob.name=name; ob.data.materials.append(material); created.append(ob); return ob
def bottle(x,z,y,color,index):
    radius=0.065 if index%3 else 0.085
    cylinder("Bottle", (x,y,z+0.11),radius,0.22,color)
    cylinder("Bottle neck",(x,y,z+0.25),radius*.42,0.08,color)
    cylinder("Cork",(x,y,z+0.30),radius*.4,0.035,brown)
    cube("Bottle glint",(x-radius*.42,y-.061,z+.15),(.018,.012,.085),cream)
def build(kind):
    global created
    created=[]
    # Blender -Y faces the player; glTF importer maps this to Godot +Z.
    cube("Back", (1,-.045,1.5),(2,.09,3),shadow)
    for x in (.06,1.94):
        cube("Side post",(x,-.25,1.5),(.12,.50,3),woodlight)
        cube("Post edging",(x,-.507,1.5),(.035,.025,2.95),gold)
    for z,thick in [(.09,.18),(.60,.09),(1.15,.09),(1.70,.09),(2.25,.09),(2.92,.16)]:
        cube("Shelf",(1,-.25,z),(1.9,.5,thick),woodlight)
        cube("Shelf edge",(1,-.508,z),(1.88,.018,.025),gold)
    cube("Crown",(1,-.26,2.97),(2.0,.52,.06),wood)
    cube("Lower doors",(1,-.26,.35),(1.78,.48,.39),wood)
    for x in (.55,1.45):
        cube("Door panel",(x,-.509,.35),(.78,.025,.25),navy if kind=="travel" else woodlight)
        cylinder("Knob",(x+.25,-.531,.35),.027,.022,gold,8).rotation_euler.x=math.pi/2
    if kind=="potion":
        for row,z in enumerate((.65,1.20,1.75,2.30)):
            for i,x in enumerate((.32,.63,.94,1.25,1.56)):
                bottle(x,z,-.31,colors[(i+row)%4],i+row)
    elif kind=="herb":
        for row,z in enumerate((.65,1.20,1.75)):
            for i,x in enumerate((.36,.79,1.22,1.65)):
                cube("Herb basket",(x,-.32,z+.10),(.32,.25,.20),brown)
                for j in range(3):
                    cylinder("Herb foliage",(x-.09+j*.09,-.32,z+.27),.065,.16,leaf if (i+j+row)%3 else violet,6)
        for i,x in enumerate((.35,.70,1.05,1.40,1.70)):
            cube("Hanging herb stem",(x,-.31,2.55),(.018,.018,.36),brown)
            for j in range(3):
                ob=cube("Hanging leaves",(x+(-1 if j%2 else 1)*.05,-.31,2.44+j*.085),(.13,.04,.055),leaf if i%2 else violet)
                ob.rotation_euler.y=(-1 if j%2 else 1)*.45
    else:
        for row,z in enumerate((.65,1.20,1.75,2.30)):
            for i,x in enumerate((.35,.66,.97,1.28,1.59)):
                cube("Book",(x,-.29,z+.14),(.19,.24,.26),[navy,brown,woodlight][(i+row)%3])
                cube("Book spine band",(x,-.416,z+.15),(.19,.012,.025),gold)
    return list(created)

sets={}
for kind in ("herb","potion","travel"):
    objs=build(kind); sets[kind]=objs
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.export_scene.gltf(filepath=str(OUT / (kind+"-cabinet.glb")),export_format="GLB",use_selection=True)
    for ob in objs: ob.location.x += {"herb":0,"potion":2.2,"travel":4.4}[kind]

bpy.ops.object.light_add(type="AREA", location=(-3,-5,8))
lamp=bpy.context.object; lamp.data.energy=1400; lamp.data.shape="DISK"; lamp.data.size=5
bpy.ops.object.camera_add(location=(3.2,-10,9))
camera=bpy.context.object
camera.rotation_euler=(Vector((3.2,0,1.3))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"; camera.data.ortho_scale=7.5
scene=bpy.context.scene; scene.camera=camera
scene.render.engine="BLENDER_EEVEE"
scene.render.resolution_x=900; scene.render.resolution_y=540; scene.render.resolution_percentage=100
scene.world.color=(0.18,0.18,0.18)
scene.view_settings.view_transform="Standard"
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(OUT/"cabinet-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"shop-cabinets.blend"))
bpy.ops.render.render(write_still=True)
print("Completed cabinet assets:",OUT)
