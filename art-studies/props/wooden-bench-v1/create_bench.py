import bpy
import math
from mathutils import Vector

# A self-contained, editable model. Front faces negative Y; ground is Z=0.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != bpy.context.scene.collection.name and not collection.objects:
        bpy.data.collections.remove(collection)

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
model = bpy.data.collections.new('Bench | editable parts')
scene.collection.children.link(model)
studio = bpy.data.collections.new('Presentation | camera and lights')
scene.collection.children.link(studio)

def material(name, color, metallic=0.0, roughness=0.6):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return m

wood = material('Honey oak', (0.36, 0.17, 0.065), roughness=0.7)
wood_light = material('Oak seat', (0.49, 0.255, 0.105), roughness=0.7)
edge = material('Dark walnut structure', (0.16, 0.065, 0.025), roughness=0.72)
gold = material('Antique brass', (0.55, 0.32, 0.095), metallic=0.72, roughness=0.35)
ground = material('Studio floor', (0.12, 0.105, 0.09), roughness=0.85)

def move_to(obj, collection):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)

def block(name, location, dimensions, mat, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    o = bpy.context.object
    o.name = name
    o.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new('Soft crafted edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.affect = 'EDGES'
        o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    move_to(o, model)
    return o

def cylinder(name, location, radius, depth, mat, rotation=(0,0,0), vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(mat)
    bevel = o.modifiers.new('Rounded rim', 'BEVEL')
    bevel.width = min(radius * 0.22, 0.008)
    bevel.segments = 2
    o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    move_to(o, model)
    return o

# Seat is broad and unobstructed, with its upper surface at 0.60 m.
for i, y in enumerate((-0.33, -0.11, 0.11, 0.33), 1):
    block('Seat plank %02d' % i, (0, y, 0.56), (2.40, 0.205, 0.08), wood_light, 0.018)
for x, side in ((-1.02, 'L'), (1.02, 'R')):
    for y, end in ((-0.30, 'front'), (0.30, 'back')):
        block('%s %s leg' % (side, end), (x, y, 0.27), (0.14, 0.14, 0.54), edge, 0.014)
        block('%s %s foot' % (side, end), (x, y, 0.035), (0.19, 0.19, 0.07), wood, 0.012)
    block('%s seat support' % side, (x, 0, 0.48), (0.16, 0.80, 0.13), edge, 0.014)
    block('%s back upright' % side, (x, 0.37, 0.99), (0.14, 0.14, 0.82), edge, 0.015)
    block('%s arm front post' % side, (x, -0.31, 0.71), (0.10, 0.10, 0.37), wood, 0.012)
    block('%s armrest' % side, (x, 0.02, 0.91), (0.18, 0.79, 0.09), wood_light, 0.025)
    for y in (-0.31, 0.30):
        cylinder('%s arm brass pin' % side, (x, y, 0.96), 0.027, 0.012, gold)

block('Front apron', (0, -0.34, 0.43), (1.92, 0.09, 0.14), wood, 0.014)
block('Rear apron', (0, 0.34, 0.43), (1.92, 0.09, 0.14), wood, 0.014)
block('Lower stretcher', (0, 0.16, 0.19), (2.00, 0.10, 0.10), wood, 0.012)
for i, z in enumerate((0.81, 1.05, 1.29), 1):
    block('Backrest plank %02d' % i, (0, 0.39, z), (1.96, 0.09, 0.19), wood, 0.018)
    for x in (-0.91, 0.91):
        cylinder('Backrest brass pin %02d' % i, (x, 0.337, z), 0.025, 0.014, gold, (math.pi/2, 0, 0))
block('Crest rail', (0, 0.39, 1.43), (2.25, 0.16, 0.10), wood_light, 0.025)
block('Crest brass inlay', (0, 0.300, 1.43), (0.72, 0.015, 0.025), gold, 0.006)
for x in (-1.02, 1.02):
    cylinder('Crest finial', (x, 0.39, 1.495), 0.045, 0.035, gold)

# A simple neutral presentation setup, kept separate from the bench parts.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.006))
floor = bpy.context.object
floor.name = 'Presentation floor'
floor.data.materials.append(ground)
move_to(floor, studio)

def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat('-Z', 'Y').to_euler()

def light(name, location, energy, size):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    studio.objects.link(obj)
    obj.location = location
    aim(obj, (0, 0, 0.6))

light('Large warm key', (0, -3.5, 5), 500, 4.0)
light('Soft fill', (-3, -1, 2.7), 220, 3.0)
light('Back rim', (2, 3, 3.5), 350, 3.0)
cam_data = bpy.data.cameras.new('Bench preview camera')
cam = bpy.data.objects.new('Bench preview camera', cam_data)
studio.objects.link(cam)
cam.location = (3.4, -5.0, 2.8)
aim(cam, (0, 0, 0.7))
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 3.55
scene.camera = cam
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 1100
scene.render.resolution_y = 820
scene.render.resolution_percentage = 100
scene.world.color = (0.18, 0.18, 0.18)
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '//bench-preview.png'
bpy.ops.object.select_all(action='DESELECT')
seat = bpy.data.objects['Seat plank 01']
seat.select_set(True)
bpy.context.view_layer.objects.active = seat
bpy.ops.wm.save_as_mainfile(filepath=str(__import__('pathlib').Path(__file__).with_name('wooden-bench.blend')))
bpy.ops.render.render(write_still=True)
