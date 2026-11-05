import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v7-head.blend'));s=bpy.context.scene;cam=s.camera;head=bpy.data.objects['V7 HEAD POSE'];p=json.loads((P/'reference-fit.json').read_text());head.rotation_euler.y=p['head_roll'];yaw,pitch=p['yaw'],p['pitch'];view=Vector((math.sin(yaw)*math.cos(pitch),-math.cos(yaw)*math.cos(pitch),math.sin(pitch)));right=Vector((math.cos(yaw),math.sin(yaw),0));up=Vector((-math.sin(yaw)*math.sin(pitch),math.cos(yaw)*math.sin(pitch),math.cos(pitch)));cam.location=view*6;cam.rotation_euler=(-cam.location).to_track_quat('-Z','Y').to_euler();cam.location+=right*((945-p['tx'])/p['scale'])+up*((p['ty']-262.5)/p['scale']);cam.data.ortho_scale=610/p['scale'];s.render.resolution_x=1220;s.render.resolution_y=1050;bpy.context.view_layer.update()
ref=next(im for im in bpy.data.images if im.name.startswith('approved-concept'));print('REFSIZE',list(ref.size));o=bpy.data.objects['Face V5 topology 5'];uv=o.data.uv_layers['ReferencePaintUV'];errors=[]
for lp in o.data.loops:
 pos=world_to_camera_view(s,cam,o.matrix_world@o.data.vertices[lp.vertex_index].co);pixel=(pos.x*1220/2+640,(1-pos.y)*1050/2);paint=(uv.data[lp.index].uv.x*ref.size[0],(1-uv.data[lp.index].uv.y)*ref.size[1]);errors.append(max(abs(pixel[i]-paint[i]) for i in [0,1]))
print('UV_PROJECTION_MAX_ERROR',max(errors),'POSE',p['head_roll'],p['scale']);print('REF_IMAGES',[(im.name,list(im.size)) for im in bpy.data.images if 'approved' in im.name])
