from pathlib import Path
import bpy

folder = Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(folder / 'wooden-bench-dark-wood.blend'))
for side in ('L', 'R'):
    leg = bpy.data.objects[f'{side} back leg']
    upright = bpy.data.objects[f'{side} back upright']
    foot = bpy.data.objects[f'{side} back foot']
    # Align the rear foot and leg with the backrest upright, then extend the
    # original textured leg to meet the crest rail as one continuous timber.
    leg.location.y = upright.location.y
    leg.location.z = 0.70
    leg.dimensions.z = 1.40
    foot.location.y = upright.location.y
    bpy.context.view_layer.objects.active = leg
    bpy.ops.object.select_all(action='DESELECT')
    leg.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.data.objects.remove(upright, do_unlink=True)

bpy.context.scene.render.filepath = '//bench-continuous-posts-preview.png'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'wooden-bench-continuous-posts.blend'))
bpy.ops.render.render(write_still=True)
print('Rear posts now run continuously from ground to crest rail')
