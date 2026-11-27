"""Add practical lights and separate lamp models to the Library Lane home."""

import math
import bpy
import bmesh
from mathutils import Matrix, Vector

if not bpy.data.filepath.replace("\\", "/").endswith("/player-home-campus-a.blend"):
    raise RuntimeError("The open scene is not the Library Lane home.")
if bpy.context.mode != "OBJECT":
    raise RuntimeError("Exit Edit Mode before adding the home lights.")
if bpy.data.collections.get("living-study-lamp") or bpy.data.collections.get("kitchen-task-lantern"):
    raise RuntimeError("This home already has the practical-light collections.")

scene = bpy.context.scene
brass = bpy.data.materials["Brass | aged and polished"]
iron = bpy.data.materials["Iron | blackened"]


def finish(name, color, roughness, emission=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*color, 1)
    principled = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    principled.inputs["Base Color"].default_value = material.diffuse_color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Emission Color"].default_value = material.diffuse_color
    principled.inputs["Emission Strength"].default_value = emission
    return material


green_glass = finish("Library Lane | deep green desk shade", (.084, .253, .157), .28, .12)
warm_white = finish("Library Lane | warm lamp diffuser", (1, .834, .615), .47, 1.10)


def asset(name, x, z, y):
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    collection["pivot"] = (x, y, z)
    return collection


def mesh_part(group, name, points, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    return obj


def primitive(group, name, x, z, y, size, material, round_shape=False):
    bm = bmesh.new()
    if round_shape:
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=18, radius1=.5, radius2=.5, depth=1)
    else:
        bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((*size, 1))), verts=list(bm.verts))
    for face in bm.faces:
        face.smooth = round_shape and len(face.verts) == 4
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = (x, -z, y)
    bevel = obj.modifiers.new("Soft-edged metal", "BEVEL")
    bevel.width = .012
    bevel.segments = 2
    obj.modifiers.new("Corner normals", "WEIGHTED_NORMAL")
    return obj


def rod(group, name, points, material, radius):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = radius
    data.bevel_resolution = 2
    line = data.splines.new("POLY")
    line.points.add(len(points)-1)
    for knot, (x, z, y) in zip(line.points, points):
        knot.co = (x, -z, y, 1.0)
    data.materials.append(material)
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)


def practical(group, name, position, color, energy, radius):
    x, z, y = position
    data = bpy.data.lights.new(name, "POINT")
    data.energy = energy
    data.color = color
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    obj.location = (x, -z, y)


# A small reading light fits against the back edge of the study table.
x, z, y = 14.64, 11.88, 1.091
desk_lamp = asset("living-study-lamp", x, z, y)
primitive(desk_lamp,"Study lamp brass foot",x,z,y+.033,(.37,.23,.064),brass,True)
primitive(desk_lamp,"Study lamp lower ring",x,z,y+.077,(.22,.17,.039),iron,True)
rod(desk_lamp,"Curved brass lamp stem",[(x,z,y+.082),(x,z-.026,y+.267),
    (x,z-.081,y+.456),(x,z-.069,y+.547),(x,z+.051,y+.582)],brass,.025)
hood_z=z+.064
hood_y=y+.47
width=.447
vertices=[(x+side*width/2,-hood_z+math.cos(i*math.pi/12)*.136,hood_y+math.sin(i*math.pi/12)*.165)
    for side in (-1, 1) for i in range(13)]
faces=[(i,i+1,i+14,i+13) for i in range(12)]
hood=mesh_part(desk_lamp,"Curved green-glass reading shade",vertices,faces,green_glass)
hood.modifiers.new("Shade thickness", "SOLIDIFY").thickness=.016
for end in (-1,1):
    rod(desk_lamp,"Brass shade lip",[(x+end*width/2,hood_z-.136*math.cos(i*math.pi/12),
        hood_y+.165*math.sin(i*math.pi/12)) for i in range(13)],brass,.010)
primitive(desk_lamp,"Warm reading lamp diffuser",x,hood_z,hood_y+.018,(.395,.222,.049),warm_white)
rod(desk_lamp,"Reading lamp pull chain",[(x+.18,hood_z+.095,hood_y),(x+.18,hood_z+.106,hood_y-.13),
     (x+.182,hood_z+.112,hood_y-.17)],brass,.007)
primitive(desk_lamp,"Reading lamp chain pull",x+.182,hood_z+.112,hood_y-.18,(.039,.037,.049),brass,True)
practical(desk_lamp,"Reading light onto the worktable",(x,hood_z+.099,hood_y-.035),(1.0,.78,.51),31,.21)

# An amber lantern sits at the far end of the kitchen counter.
x, z, y = 3.82, 6.15, 1.165
kitchen_lamp = asset("kitchen-task-lantern", x, z, y)
primitive(kitchen_lamp,"Kitchen lantern heavy base",x,z,y+.035,(.30,.30,.069),iron)
primitive(kitchen_lamp,"Kitchen lantern brass ring",x,z,y+.084,(.26,.26,.033),brass,True)
amber = finish("Library Lane | lantern honey glass", (.56, .23, .056), .46, .46)
shaded_amber = finish("Library Lane | lantern shaded amber glass", (.34, .135, .028), .46, .30)
panes = primitive(kitchen_lamp,"Kitchen lantern amber enclosure",x,z,y+.211,(.186,.186,.236),amber)
panes.data.materials.append(shaded_amber)
for face in panes.data.polygons:
    face.material_index = int(abs(face.normal.y) < .5)
for dx in (-.099,.099):
    for dz in (-.099,.099):
        rod(kitchen_lamp,"Lantern protective upright",[(x+dx,z+dz,y+.084),(x+dx,z+dz,y+.335)],iron,.023)
primitive(kitchen_lamp,"Kitchen lantern cap",x,z,y+.345,(.26,.26,.060),iron,True)
primitive(kitchen_lamp,"Kitchen lantern chimney",x,z,y+.397,(.114,.114,.075),brass,True)
rod(kitchen_lamp,"Kitchen lantern carry handle",[(x-.069,z,y+.396),(x-.05,z,y+.445),
    (x,z,y+.472),(x+.052,z,y+.442),(x+.071,z,y+.396)],brass,.023)
practical(kitchen_lamp,"Amber light on the counter",(x+.10,z+.11,y+.274),(1.0,.69,.39),27,.18)

lighting = bpy.data.collections.new("Library Lane | practical lights")
scene.collection.children.link(lighting)
practical(lighting,"Warm bedside pool",(16.78,5.05,1.49),(1.0,.72,.43),32,.29)
practical(lighting,"Cast-iron stove fire",(4.56,12.61,.66),(1.0,.54,.26),26,.22)

def preview_fill(position, target):
    x, z, y = position
    data=bpy.data.lights.new("Cool window bounce", "AREA")
    data.energy=82
    data.size=2.7
    data.color=(.53,.68,.96)
    obj=bpy.data.objects.new("Cool window bounce",data)
    lighting.objects.link(obj)
    obj.location=(x,-z,y)
    a,b,c=target
    obj.rotation_euler=(Vector((a,-b,c))-obj.location).to_track_quat("-Z","Y").to_euler()

preview_fill((16.43, 4.47, 2.48),(17.24, 6.4, .4))

bpy.context.view_layer.update()
old_save_version = bpy.context.preferences.filepaths.save_version
try:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, compress=True)
finally:
    bpy.context.preferences.filepaths.save_version = old_save_version

print("Saved both lamp models and five Blender light sources to", bpy.data.filepath)
