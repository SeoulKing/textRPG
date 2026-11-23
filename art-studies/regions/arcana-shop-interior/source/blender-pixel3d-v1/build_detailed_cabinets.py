"""Create textured, volume-modelled Arcana shop cabinet GLBs in Blender 5.3."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[5]
STUDY = ROOT / "art-studies/regions/arcana-shop-interior/source/blender-pixel3d-v1"
OUTPUT = ROOT / "godot-arcana/art/source/shop-cabinets-3d-v2"
PAINT = ROOT / "godot-arcana/art/export/shop-cabinet-face-v2"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

def surface_material(kind):
    mat = bpy.data.materials.new(kind + " approved paint")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 1.0
    img = bpy.data.images.load(str(PAINT / (kind + "-cabinet.png")), check_existing=True)
    img.pack()
    tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img; tex.interpolation = "Closest"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat

def simple_material(name, color, metallic=0.0):
    mat = bpy.data.materials.new(name); mat.diffuse_color = (*color,1)
    mat.use_nodes=True
    bsdf=next(n for n in mat.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Metallic"].default_value=metallic
    bsdf.inputs["Roughness"].default_value=.8
    return mat

wood=simple_material("Walnut edge",(.20,.075,.027))
wood_light=simple_material("Oak moulding",(.40,.19,.07))
brass=simple_material("Antique brass",(.57,.33,.075),.15)

def face(name, coords, uv, material):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(coords, [], [(0,1,2,3)]); mesh.update()
    layer=mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        for loop_index in poly.loop_indices:
            layer.data[loop_index].uv=uv[mesh.loops[loop_index].vertex_index]
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    return obj

def block(name, location, size, material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=location)
    ob=bpy.context.object; ob.name=name; ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(material)
    return ob

def create_cabinet(kind):
    paint=surface_material(kind)
    # 128x224 atlas: 32 px top and 192 px front; ground is local z=0.
    s=192.0/224.0
    parts=[]
    # Face and top normals point out; -Y is player-facing.
    parts.append(face("Painted front",[(0,-.50,3),(0,-.50,0),(2,-.50,0),(2,-.50,3)],
                      [(0,s),(0,0),(1,0),(1,s)],paint))
    parts.append(face("Painted top",[(0,0,3),(0,-.5,3),(2,-.5,3),(2,0,3)],
                      [(0,1),(0,s),(1,s),(1,1)],paint))
    # Back and side volume make the cabinetry a closed, shadow-casting object.
    parts.append(block("Carcass",(1,-.235,1.495),(1.99,.46,2.99),wood))
    # Thin raised strips follow the existing artwork rather than covering details.
    for x in (.035,1.965):
        parts.append(block("Raised upright",(x,-.515,1.5),(.045,.03,2.92),wood_light))
        for z in (.12,.62,1.14,1.67,2.24,2.88):
            parts.append(block("Brass stud",(x,-.535,z),(.036,.012,.036),brass))
    for z in (.055,2.94):
        parts.append(block("Raised rail",(1,-.51,z),(1.90,.02,.025),wood_light))
    # Merge only the solid relief objects, keeping the atlas UVs intact.
    bpy.ops.object.select_all(action="DESELECT")
    for ob in parts[2:]: ob.select_set(True)
    bpy.context.view_layer.objects.active=parts[2]
    bpy.ops.object.join()
    return [parts[0],parts[1],bpy.context.object]

all_parts=[]
for k,kind in enumerate(("herb","potion","travel")):
    objects=create_cabinet(kind)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (kind+"-cabinet.glb")),
                               export_format="GLB", use_selection=True)
    for ob in objects: ob.location.x += k*2.2
    all_parts.extend(objects)

bpy.ops.object.camera_add(location=(3.2,-10,9))
camera=bpy.context.object
camera.rotation_euler=(Vector((3.2,0,1.3))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"; camera.data.ortho_scale=7.3
scene=bpy.context.scene; scene.camera=camera; scene.render.engine="BLENDER_WORKBENCH"
scene.display.shading.color_type="TEXTURE"
scene.display.shading.light="STUDIO"
scene.render.resolution_x=1000; scene.render.resolution_y=600
scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(STUDY/"cabinet-detailed-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(STUDY/"shop-cabinets-detailed.blend"))
bpy.ops.render.render(write_still=True)
print("Exported detailed shop cabinets to", OUTPUT)
