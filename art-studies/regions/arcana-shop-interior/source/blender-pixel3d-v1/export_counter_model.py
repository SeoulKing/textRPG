"""Export the currently edited .blend without rebuilding its model."""
from pathlib import Path
import bpy
from mathutils import Vector
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
BLEND = HERE / 'counter-model.blend'
GLB = ROOT / 'godot-arcana/art/source/shop-room-blender/counter-model.glb'
PREVIEW = HERE / 'counter-model-preview.png'
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
collection=bpy.data.collections['Counter - editable parts']
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.objects: obj.select_set(True)
bpy.context.view_layer.objects.active=next(iter(collection.objects))
bpy.ops.object.join()
obj=bpy.context.object; obj.name='CounterModel'
bpy.context.scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_animations=False)
print('EXPORTED',GLB, 'vertices',len(obj.data.vertices),'polygons',len(obj.data.polygons), flush=True)
# CPU preview avoids requiring a GPU context in background mode.
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=8
scene.world=bpy.data.worlds.new('Preview environment'); scene.world.use_nodes=True
background=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
background.inputs['Color'].default_value=(0.38,0.38,0.38,1); background.inputs['Strength'].default_value=.8
lamp=bpy.data.lights.new('Preview softbox','AREA'); lamp.energy=450; lamp.shape='DISK'; lamp.size=5
light=bpy.data.objects.new('Preview softbox',lamp); scene.collection.objects.link(light); light.location=(-3,-4,6)
light.rotation_euler=(Vector((0,0,.4))-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=800; scene.render.resolution_y=368; scene.render.resolution_percentage=100
scene.render.filepath=str(PREVIEW)
bpy.ops.render.render(write_still=True)
print('PREVIEW',PREVIEW,flush=True)
