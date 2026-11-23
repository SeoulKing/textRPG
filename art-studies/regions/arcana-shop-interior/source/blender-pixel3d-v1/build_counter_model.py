"""Initial construction of the editable counter; later edits belong in the .blend."""
from pathlib import Path
import math, random
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
BLEND = HERE / 'counter-model.blend'
GLB = ROOT / 'godot-arcana/art/source/shop-room-blender/counter-model.glb'
PREVIEW = HERE / 'counter-model-preview.png'

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Arcana counter - editable'
collection = bpy.data.collections.new('Counter - editable parts')
scene.collection.children.link(collection)

def mat(name, color):
    m = bpy.data.materials.new(name)
    def linear(v):
        v = v / 255
        return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4
    rgba = tuple(linear(int(color[i:i+2], 16)) for i in (0,2,4)) + (1,)
    m.diffuse_color = rgba
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = .9
    return m

wood = mat('Oak / medium', '956239')
wood_light = mat('Oak / warm', 'B6814D')
wood_top = mat('Oak / top', 'B88957')
wood_top2 = mat('Oak / top alternate', 'AB7848')
wood_dark = mat('Oak / shadow', '5A3A28')
wood_edge = mat('Oak / edge', '71482C')
grain = mat('Oak / grain', '9B6C42')
blue = mat('Enamel / midnight blue', '172349')
blue_inner = mat('Enamel / deep blue', '202E58')
gold = mat('Brass / gold', 'D7AA58')
gold_light = mat('Brass / bright', 'EACA83')

def box(name, pos, size, material, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.name = name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collection.objects.link(obj)
    for v in obj.data.vertices:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('Softened edges', 'BEVEL')
        mod.width = bevel; mod.segments = 1
        mod.affect = 'EDGES'
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

# All geometry remains inside the previous 4 x 1 x 1 envelope.
box('Body / dark inset carcass', (0,0,.46), (3.92,.90,.86), wood_dark, .012)
for x in (-1.91,1.91):
    box('Body / corner stile', (x,0,.465), (.13,.94,.85), wood, .012)
for y in (-.466,.466):
    box('Body / base rail', (0,y,.05), (3.88,.052,.10), wood_edge, .009)
    box('Body / upper apron', (0,y,.81), (3.88,.052,.10), wood, .009)
# Broad timber top: separate boards retain a physical join.
box('Worktop / dark supporting edge', (0,0,.902), (4,.98,.09), wood_edge, .018)
for i in range(3):
    box('Worktop / plank %02d' % (i+1), (0,-.305+i*.305,.962), (3.75,.298,.064), wood_top if i != 1 else wood_top2, .012)
# Raised end caps and modest short grain marks, all below the top plane.
for x in (-1.93,1.93):
    box('Worktop / end cap', (x,0,.968), (.10,.94,.052), wood_light, .01)
random.seed(103)
for i in range(29):
    x = random.uniform(-1.78,1.78); y = random.uniform(-.42,.42)
    length = random.uniform(.055,.32)
    box('Worktop / subtle grain %02d' % (i+1), (x,y,.995), (length,.007,.002), grain)
# Clear empty workspace; corner fittings sit flush with its surface.
for x in (-1.91,1.91):
    for y in (-.42,.42):
        box('Worktop / brass corner', (x,y,.997), (.09,.09,.006), gold, .006)

# Front inlay is framed relief, with the face and decorations contained by y=-0.5.
box('Front / recessed blue panel', (0,-.470,.440), (3.63,.026,.51), blue)
box('Front / panel inner field', (0,-.485,.440), (3.48,.006,.405), blue_inner)
for z in (.212,.668):
    box('Front / outer wood rail', (0,-.482,z), (3.75,.035,.060), wood_light, .005)
for x in (-1.83,1.83):
    box('Front / outer wood stile', (x,-.482,.44), (.065,.035,.46), wood_light, .005)
for z in (.248,.632):
    box('Front / fine brass border', (0,-.497,z), (3.47,.006,.012), gold)
for x in (-1.73,1.73):
    box('Front / fine brass border', (x,-.497,.44), (.012,.006,.39), gold)

# Constellation motifs are thin actual meshes rather than an image.
def star(name, x, z, rx, rz, material):
    verts=[]
    for i in range(16):
        a = math.pi/2 + i * math.pi/8
        r = 1 if i % 2 == 0 else .22
        verts.append((x+math.cos(a)*rx*r, -.4995, z+math.sin(a)*rz*r))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts, [], [list(range(16))]); mesh.update()
    ob=bpy.data.objects.new(name,mesh); collection.objects.link(ob); mesh.materials.append(material)

def wire(name, a, b):
    dx=b[0]-a[0]; dz=b[1]-a[1]
    mid=((a[0]+b[0])/2,-.498,(a[1]+b[1])/2)
    ob=box(name, mid, (math.hypot(dx,dz),.003,.006), gold)
    ob.rotation_euler[1] = -math.atan2(dz,dx)

star('Front / central compass star',0,.44,.105,.105,gold_light)
for side in (-1,1):
    points=[(.24,.44),(.52,.48),(.85,.40),(1.16,.50),(1.50,.43)]
    points=[(side*x,z) for x,z in points]
    for i in range(len(points)-1): wire('Front / constellation line', points[i], points[i+1])
    for i,(x,z) in enumerate(points): star('Front / constellation star',x,z,.025 if i != 2 else .033,.028 if i != 2 else .037,gold_light)
    for x,z in ((.37,.55),(.69,.34),(1.34,.33),(1.56,.55)):
        star('Front / small star',side*x,z,.012,.015,gold)
# Side and rear wood framing make the asset editable from every direction.
for x in (-1.98,1.98):
    box('Side / inset panel', (x,0,.43), (.025,.72,.52), wood, .005)
    for z in (.17,.70): box('Side / horizontal molding', (x,0,z), (.03,.82,.045), wood_light, .004)
for x in (-1.25,0,1.25):
    box('Rear / cabinet panel', (x,.468,.43), (1.17,.025,.53), wood, .008)
    box('Rear / handle', (x,.485,.59), (.12,.018,.02), gold, .003)

# Camera at the Arcana 45-degree front view, useful when opened for editing.
cam_data=bpy.data.cameras.new('45 degree orthographic')
cam=bpy.data.objects.new('45 degree orthographic',cam_data); scene.collection.objects.link(cam)
target=Vector((0,0,.46)); cam.location=target+Vector((0,-6,6))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); cam_data.type='ORTHO'; cam_data.ortho_scale=4.6
scene.camera=cam
scene.render.engine='BLENDER_WORKBENCH'
scene.display.shading.light='STUDIO'
scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_shadows=True
scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH'
scene.render.resolution_x=1000; scene.render.resolution_y=460; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=True
scene.render.filepath=str(PREVIEW)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.color_type='MATERIAL'
# save editable parts, then join only in memory for a compact game model.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
# Preview is rendered from the saved file by export_counter_model.py using CPU.
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.objects: obj.select_set(True)
bpy.context.view_layer.objects.active=collection.objects[0]
bpy.ops.object.join()
obj=bpy.context.object; obj.name='CounterModel'
bpy.context.scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True, export_animations=False)
print('CREATED',BLEND,GLB,PREVIEW, 'vertices',len(obj.data.vertices),'polygons',len(obj.data.polygons))
