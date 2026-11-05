"""Refine saved native V7 surfaces; preserve the editable sculpt."""
import bpy,sys,math,json
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';V=P/'review';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v7-head.blend'));root=bpy.data.objects['V7 MASTER'];head=bpy.data.objects['V7 HEAD POSE'];C=bpy.data.collections['V7 editable head']
if root.get('v7_native_finish'):raise RuntimeError('Finish exists; edit saved master rather than reapply')
# Put the continuity patch beneath the authored fringe, rather than crossing its surface.
o=bpy.data.objects['V7 sculpted forehead curved bridge']
for v in o.data.vertices:v.co.y+=.043
# Tuck the narrow near-side lock behind the ear instead of forming a hanging loop.
o=bpy.data.objects['V7 sculpted right ear frame']
for v in o.data.vertices:
 if v.co.z<.62:
  w=min(1,(.62-v.co.z)/.22);v.co.y+=.13*w;v.co.x+=.018*w
for o in C.objects:
 if o.type=='MESH' and o.name.startswith(('V7 sculpted','V7 fine')):
  uv=o.data.uv_layers.new(name='FlowUV')
  for lp in o.data.loops:
   i=lp.vertex_index;row,side=divmod(i,12);uv.data[lp.index].uv=(.39+.12*(math.cos(side*math.tau/12)*.5+.5),1-row/56)
# Colour is evaluated in the original strand coordinates; it does not move with the camera.
image=bpy.data.images.load(str(P.parent/'blender-v6/textures/hair-longitudinal-v6.png'),check_existing=True);image.pack()
for material,uvname,amount in [('V7 pearl bob - native cel','FlowUV',.65),('V7 pearl authored bob paint','AuthoredHairUV',.40)]:
 m=bpy.data.materials[material];n=m.node_tree.nodes;l=m.node_tree.links;em=next(x for x in n if x.type=='EMISSION');old=em.inputs[0].links[0].from_socket;tx=n.new('ShaderNodeTexImage');tx.image=image;uv=n.new('ShaderNodeUVMap');uv.uv_map=uvname;l.new(uv.outputs[0],tx.inputs[0]);mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=amount;l.new(old,mul.inputs[1]);l.new(tx.outputs['Color'],mul.inputs[2]);l.new(mul.outputs[0],em.inputs[0])
 # Three-quarter light is part of the material model, independent of the review camera.
 geo=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.45,-.6,.66);l.new(geo.outputs['Normal'],dot.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=-.35;ramp.color_ramp.elements[0].color=(.64,.62,.73,1);ramp.color_ramp.elements[1].position=.55;ramp.color_ramp.elements[1].color=(1,.99,.97,1);l.new(dot.outputs['Value'],ramp.inputs[0]);shade=n.new('ShaderNodeMixRGB');shade.blend_type='MULTIPLY';shade.inputs[0].default_value=.60;l.new(mul.outputs[0],shade.inputs[1]);l.new(ramp.outputs[0],shade.inputs[2]);l.new(shade.outputs[0],em.inputs[0])
root['v7_native_finish']=True;root['review_status']='Further work required; not user approved';head.rotation_euler.y=0;s=bpy.context.scene;cam=s.camera;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.34;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=32;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v7-head.blend'));s.render.filepath=str(V/'portrait-native-v7.png');bpy.ops.render.render(write_still=True);print('V7_NATIVE_FINISH_SAVED',flush=True)
