import bpy, math, os
from mathutils import Vector

root = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(root,'cafe-furniture.blend'))
for o in bpy.data.collections['Cafe_Chair'].objects:
    o.location.x -= 1.7

bpy.ops.mesh.primitive_plane_add(size=200)
ground=bpy.context.object
ground.name='Preview ground'
m=bpy.data.materials.new('Preview stone'); m.diffuse_color=(.48,.41,.33,1); m.use_nodes=True
next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'].default_value=(.48,.41,.33,1)
ground.data.materials.append(m)
bpy.ops.object.camera_add(location=(-.65,-8,8))
camera=bpy.context.object
camera.rotation_euler=(Vector((-.65,0,1.35))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=5.3
bpy.context.scene.camera=camera
bpy.ops.object.light_add(type='AREA', location=(-3,-4,7))
bpy.context.object.data.energy=900; bpy.context.object.data.shape='DISK'; bpy.context.object.data.size=5
bpy.ops.object.light_add(type='AREA', location=(4,1,5))
bpy.context.object.data.energy=500; bpy.context.object.data.size=4
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=16
scene.render.resolution_x=1200; scene.render.resolution_y=950; scene.render.resolution_percentage=100
scene.world.color=(.20,.20,.20)
scene.render.image_settings.file_format='PNG'
scene.render.filepath=os.path.join(root,'preview.png')
bpy.ops.render.render(write_still=True)
