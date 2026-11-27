"""Build reusable half-unit wooden floor panels and a 3D window frame."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[5]
STUDY=Path(__file__).resolve().parent
OUT=ROOT / "godot-arcana/art/source/shop-wood-floor-v1"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

img=bpy.data.images.load(str(ROOT/"godot-arcana/art/export/shop-interior/floor-room-v2.png"))
img.pack()
wood=bpy.data.materials.new("Unlit wood grain from approved floor")
wood.use_nodes=True
bsdf=next(n for n in wood.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
bsdf.inputs["Roughness"].default_value=.92
texture=wood.node_tree.nodes.new("ShaderNodeTexImage")
texture.image=img; texture.interpolation="Closest"
wood.node_tree.links.new(texture.outputs["Color"],bsdf.inputs["Base Color"])

def mat(name,color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bsdf=next(n for n in m.node_tree.nodes if n.type=="BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value=(*color,1)
    bsdf.inputs["Roughness"].default_value=.85
    return m
dark=mat("Wood plank edges",(.20,.088,.038))
windowwood=mat("Window walnut",(.32,.15,.055))
gold=mat("Window brass",(.60,.34,.08))

def tile(i):
    verts=[]; polygons=[]; uvs=[]; matids=[]
    def face(points, uv, material):
        start=len(verts); verts.extend(points); polygons.append(tuple(range(start,start+len(points))))
        uvs.append(uv); matids.append(material)
    for row in range(2):
        y0=-.25+row*.25+.003; y1=-.25+(row+1)*.25-.003
        split = ((i+row)%3==0)
        segments=[(-.25,0.04),(.046,.25)] if split else [(-.25,.25)]
        for part,(x0,x1) in enumerate(segments):
            bottom=-.035; top=0.0
            # All samples come from unlit wood on the right side of the original art.
            px=570 + ((i*67+row*39+part*17)%250)
            py=48 + ((i*23+row*19)%80)
            w=(x1-x0)*64; h=(y1-y0)*64
            def uv(x,y):return (x/896.0,1.0-y/576.0)
            face([(x0,y0,top),(x1,y0,top),(x1,y1,top),(x0,y1,top)],
                 [uv(px,py),uv(px+w,py),uv(px+w,py+h),uv(px,py+h)],0)
            face([(x0,y0,bottom),(x0,y0,top),(x1,y0,top),(x1,y0,bottom)],[(0,0)]*4,1)
            face([(x1,y1,bottom),(x1,y1,top),(x0,y1,top),(x0,y1,bottom)],[(0,0)]*4,1)
    mesh=bpy.data.meshes.new("Wooden floor module")
    mesh.from_pydata(verts,[],polygons); mesh.update()
    layer=mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        poly.material_index=matids[poly.index]
        for j,li in enumerate(poly.loop_indices): layer.data[li].uv=uvs[poly.index][j]
    ob=bpy.data.objects.new("FloorTile"+str(i),mesh); bpy.context.collection.objects.link(ob)
    mesh.materials.append(wood); mesh.materials.append(dark)
    return ob

def cube(loc,size,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object; ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(material); return ob

tiles=[tile(i) for i in range(4)]
bars=[]
for y in (-1.5,0,1.5):
    bars.append(cube((0,y,2.1),(.16,.09,2.32),windowwood))
for z in (1.0,2.1,3.2):
    bars.append(cube((0,0,z),(.16,3.08,.09),windowwood))
for y in (-1.45,1.45):
    bars.append(cube((-.09,y,2.1),(.025,.02,2.14),gold))
bpy.ops.object.select_all(action="DESELECT")
for ob in bars: ob.select_set(True)
bpy.context.view_layer.objects.active=bars[0]
bpy.ops.object.join()
frame=bpy.context.object; frame.name="WindowFrame"
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)

bpy.ops.object.select_all(action="DESELECT")
for ob in tiles+[frame]: ob.select_set(True)
bpy.context.view_layer.objects.active=tiles[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/"wood-floor-window.glb"),export_format="GLB",use_selection=True)

for i,ob in enumerate(tiles): ob.location=(i*.65,0,0)
frame.location=(3.2,0,0)
bpy.ops.object.camera_add(location=(1.0,-8.0,6.5))
camera=bpy.context.object
camera.rotation_euler=(Vector((1.0,0,.8))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"; camera.data.ortho_scale=6.0
scene=bpy.context.scene; scene.camera=camera; scene.render.engine="BLENDER_WORKBENCH"
scene.display.shading.color_type="TEXTURE"; scene.display.shading.light="STUDIO"
scene.render.resolution_x=900; scene.render.resolution_y=600
scene.render.image_settings.file_format="PNG"; scene.render.filepath=str(STUDY/"floor-window-preview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(STUDY/"floor-window-v1.blend"))
bpy.ops.render.render(write_still=True)
print("Floor and window assets:",OUT)