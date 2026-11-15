"""Bake the approved Blender heroine at the game's pitch; fixed camera/foot origin.
Run with scripts/build-heroine-sprites.ps1. Raw renders stay under .runtime.
The editable pixel profile is a sibling of the preserved real-time 3D source.
"""
import bpy, json, math, sys
import numpy as np
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(sys.argv[sys.argv.index('--') + 1])
SOURCE = ROOT / 'art-studies/arcana-hero/white-bob-heroine'
OUT = ROOT / '.runtime/heroine-sprites'
RAW = OUT / 'raw'
RAW.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'blender/heroine.blend'))
scene = bpy.context.scene
body = bpy.data.objects['HeroineMesh']
rig = bpy.data.objects['HeroineRig']
for obj in scene.objects:
    obj.hide_render = obj not in (body, rig)
# Readable ~5-head pixel profile: enlarge the actual head mesh, not a screen overlay.
head_group = body.vertex_groups['head'].index
pivot = Vector((0, 0, 1.61))
for vertex in body.data.vertices:
    weight = next((g.weight for g in vertex.groups if g.group == head_group), 0)
    if weight:
        delta = vertex.co - pivot
        delta.x *= 1 + .18 * weight
        delta.y *= 1 + .08 * weight
        delta.z *= 1 + .08 * weight
        vertex.co = pivot + delta
# Reduce muddy paint at game scale; preserve broad material identities and silver detail.
colors = {
    'Dress_ivory': (.88,.85,.77), 'Dress_floral_hem': (.85,.82,.73),
    'Cape_periwinkle': (.29,.44,.68), 'Blue_collar_edge': (.43,.58,.78),
    'Pearl_skin': (1,.60,.37), 'Pearl_white_hair': (.77,.81,.91),
    'White_hair_glints': (.96,.97,1), 'Bob_underlayer': (.40,.45,.58),
    'Lavender_iris': (.33,.13,.58), 'Iris_lilac': (.58,.32,.76),
}
for name, color in colors.items():
    mat = bpy.data.materials.get(name)
    if mat: mat.diffuse_color = (*color,1)

camera_data = bpy.data.cameras.new('Pixel bake camera - fixed feet 32 72')
camera = bpy.data.objects.new('Pixel bake camera', camera_data)
scene.collection.objects.link(camera)
camera.hide_render = False
pitch_sine = .75
camera.location = (0, -6 * math.sqrt(1-pitch_sine**2), 6*pitch_sine)
camera.rotation_euler = (-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type = 'ORTHO'
scene.camera = camera
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 64
scene.render.resolution_y = 80
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.display.shading.light = 'FLAT'
scene.display.shading.studiolight_rotate_z = -.6
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = False
scene.display.shading.show_cavity = False
scene.display.shading.show_specular_highlight = False
scene.display.shading.show_object_outline = False
scene.display.render_aa = 'OFF'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1

# Edit the stored curves: render evaluation can restore keyed values over pose overrides.
for action in bpy.data.actions:
    for fc in action.fcurves:
        head_tilt = fc.data_path == 'pose.bones["head"].rotation_euler' and fc.array_index == 0
        leg = action.name == 'Walk' and fc.array_index == 0 and any(
            fc.data_path == f'pose.bones["{part}{side}"].rotation_euler'
            for part in ('thigh.','shin.','foot.') for side in ('L','R'))
        if not (head_tilt or leg): continue
        for key in fc.keyframe_points:
            for point in (key.co,key.handle_left,key.handle_right):
                point.y = -.65 if head_tilt else point.y*.38
        fc.update()

def sample(action, phase):
    rig.animation_data.action = bpy.data.actions[action]
    start, end = rig.animation_data.action.frame_range
    scene.frame_set(int(start + phase*(end-start)), subframe=(start+phase*(end-start))%1)
    # Lift the face toward the elevated camera, leaving the neck attached.
    rig.pose.bones['head'].rotation_euler.x = -.65
    bpy.context.view_layer.update()

sample('Idle',0)
evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
up = camera.rotation_euler.to_matrix() @ Vector((0,1,0))
values = [up.dot(evaluated.matrix_world @ v.co) for v in evaluated.data.vertices]
# 54 source pixels of geometry plus one pixel of external ink at either end.
ppu = 54 / (max(values)-min(values))
camera_data.ortho_scale = 80/ppu
camera_data.shift_y = .4
bpy.context.view_layer.update()

def project(point):
    v = world_to_camera_view(scene,camera,point)
    return [round(v.x*64,4), round((1-v.y)*80,4)]

# Calibrate against rendered alpha, not invisible/back-facing vertex bounds.
scene.render.filepath = str(OUT/'calibration.png')
bpy.ops.render.render(write_still=True)
cal = bpy.data.images.load(scene.render.filepath,check_existing=False)
alpha = np.array(cal.pixels[:]).reshape((80,64,4))[:,:,3] > .5
rows = np.where(alpha)[0]
geometry_height = int(rows.max()-rows.min()+1)
camera_data.ortho_scale *= geometry_height/54
ppu = 80/camera_data.ortho_scale
bpy.data.images.remove(cal)
bpy.context.view_layer.update()
records = []
directions = ['S','SE','E','NE','N','NW','W','SW']
only_preview = '--preview' in sys.argv
for direction, name in enumerate(directions):
    if only_preview and direction not in (0,1): continue
    rig.rotation_euler.z = direction*math.tau/8
    for label,count in [('Idle',4),('Walk',8)]:
        if only_preview and label != 'Idle': continue
        for frame in range(count):
            if only_preview and frame: continue
            sample(label,frame/count)
            filename = f'{label.lower()}_{name}_{frame:02d}.png'
            scene.render.filepath = str(RAW / filename)
            scene.display.shading.light = 'FLAT'
            bpy.ops.render.render(write_still=True)
            scene.display.shading.light = 'STUDIO'
            scene.render.filepath = str(RAW / ('lit_' + filename))
            bpy.ops.render.render(write_still=True)
            scene.display.shading.light = 'FLAT'
            bone = rig.pose.bones['head']
            transform = rig.matrix_world @ bone.matrix @ bone.bone.matrix_local.inverted()
            def head_point(p):
                q = Vector(p)-pivot
                q.x *= 1.18; q.y *= 1.08; q.z *= 1.08
                return project(transform @ (pivot+q))
            records.append(dict(file=filename,direction=direction,heading=name,
                animation=label.lower(),frame=frame,foot=project(Vector((0,0,0))),
                ankles={side:list(rig.matrix_world @ rig.pose.bones['foot.'+side].head) for side in ('L','R')},
                landmarks={
                    'eye_l':head_point((-.070,-.14,1.823)),
                    'eye_r':head_point((.070,-.14,1.823)),
                    'mouth':head_point((0,-.126,1.719)),
                    'nose':head_point((0,-.15,1.778)),
                    'face':head_point((0,-.14,1.79)),
                }))
            print('BAKED '+filename,flush=True)
rig.rotation_euler.z = 0
sample('Idle',0)
pixel_source = SOURCE / 'pixel'
pixel_source.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(pixel_source/'heroine-pixel.blend'))
def srgb(v): return round(255*(12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055))
metadata = dict(material_colors={m.name:[srgb(v) for v in m.diffuse_color[:3]] for m in body.data.materials},frame_size=[64,80],foot=[32,72],target_body_pixels=56,
    pixels_per_unit=ppu,pitch_sine=pitch_sine,directions=directions,
    frames=records,source='pixel/heroine-pixel.blend',
    game_projected_height=56/ppu,alpha='binary',filter='nearest')
(OUT/'bake.json').write_text(json.dumps(metadata,indent=2),encoding='utf8')
print('HEROINE_SPRITES '+json.dumps(dict(count=len(records),ppu=ppu,foot=project(Vector((0,0,0))))),flush=True)

