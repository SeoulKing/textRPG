"""Export the active signed Astra scene without rebuilding its editable geometry.
Run inside Blender with Shop Astra Full or Shop Astra Reference active.
Vertex R is ambient visibility and G is the authored bevel mask.
"""
import bpy
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree

BASE = "D:/BANG/project/textRPG"
SOURCE = BASE + "/art-studies/regions/arcana-shop-interior/source/shop-astra"
EXPORT = BASE + "/godot-arcana/art/source/shop-astra"
scene = bpy.context.scene
scene_name = scene.name
if scene_name not in ("Shop Astra Full", "Shop Astra Reference"):
    raise RuntimeError("Activate Shop Astra Full or Shop Astra Reference before export.")
ASTRA_FULL = scene_name == "Shop Astra Full"
if bool(scene.get("reference_only", True)) == ASTRA_FULL:
    raise RuntimeError("The active scene's reference_only flag does not match its name.")
roots = [o for o in scene.objects if o.get("astra_version") and o.get("layout_signature")]
if len(roots) != 1:
    raise RuntimeError("Expected exactly one signed Astra root in the active scene.")
root = roots[0]

def group(prefix):
    matches = [o for o in root.children if o.name.startswith(prefix) and o.name in scene.objects]
    if len(matches) != 1:
        raise RuntimeError("Expected exactly one root child group: " + prefix)
    return matches[0]

architecture_group = group("AstraArchitecture")
floor_group = group("AstraFloor")
shade_group = group("AstraLightBlockers")

def top_group(obj):
    node = obj
    while node.parent and node.parent != root:
        node = node.parent
    if node.parent != root:
        raise RuntimeError("Object is not under the signed Astra root: " + obj.name)
    return node

def in_group(obj, group_node):
    return top_group(obj) == group_node

authored_meshes = []
for obj in scene.objects:
    if obj.type != "MESH":
        continue
    node = obj
    while node.parent and node.parent != root:
        node = node.parent
    if node.parent == root:
        authored_meshes.append(obj)
if not authored_meshes:
    raise RuntimeError("No meshes under the signed Astra root.")

# Bake a separate, non-colour, floor ambient visibility mask from the actual authored meshes.
# This is local hemisphere occlusion, not a hand-painted positional shadow patch.
bpy.context.view_layer.update()
depsgraph=bpy.context.evaluated_depsgraph_get()
ao_vertices=[]
ao_faces=[]
for obj in authored_meshes:
    if in_group(obj, floor_group) or in_group(obj, shade_group):
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
old_export = bpy.data.scenes.get(scene_name + " Export")
if old_export:
    # Unlink only the export scene; shared objects remain linked to other scenes.
    old_objects = list(old_export.objects)
    bpy.data.scenes.remove(old_export)
    for old_object in old_objects:
        if not old_object.users_scene:
            bpy.data.objects.remove(old_object, do_unlink=True)
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
for obj in authored_meshes:
    evaluated=obj.evaluated_get(depsgraph)
    mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=depsgraph)
    colours=mesh.color_attributes.get("AstraSurfaceData")
    if not colours:
        colours=mesh.color_attributes.new(name="AstraSurfaceData",type="FLOAT_COLOR",domain="CORNER")
    ao=float(obj.get("astra_ao",1.0))
    baked_ao={}
    if not any(in_group(obj, group_node) for group_node in (floor_group, shade_group, architecture_group)):
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
    group_name=top_group(obj).name
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
