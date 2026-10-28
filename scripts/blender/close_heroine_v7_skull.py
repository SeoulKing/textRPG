"""Close the rear skull and make facial surfaces genuinely one-sided."""
import bpy,bmesh,sys,math
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v7-head.blend'));C=bpy.data.collections['V7 editable head'];head=bpy.data.objects['V7 HEAD POSE'];root=bpy.data.objects['V7 MASTER']
if root.get('v7_rear_closed'):raise RuntimeError('Rear already repaired; preserve saved edits')
for o in C.objects:
 if o.name.startswith('Face V5 topology'):
  for m in o.data.materials:m.use_backface_culling=True
 if o.name.startswith('V7 CC0 bob strip'):
  k=int(o.name.split()[-1])
  for v in o.data.vertices:
   low=max(0,min(1,(.52-v.co.z)/.36));v.co.z+=low*(-.13+.018*math.sin(k*2.1));v.co.x*=1-.025*low
  o.data.update()
# A true curved occiput/nape, absent from the face-only source topology.
bm=bmesh.new();bmesh.ops.create_uvsphere(bm,u_segments=48,v_segments=32,radius=1)
for v in bm.verts:v.co=(v.co.x*.305,.045+v.co.y*.215,.51+v.co.z*.49)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.y<.045-.00001],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));d=bpy.data.meshes.new('V7 closed rear skull surface');bm.to_mesh(d);bm.free()
for p in d.polygons:p.use_smooth=True
m=bpy.data.materials.new('V7 nape skin - no face UV');m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links;out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');geo=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.5,-.7,.6);l.new(geo.outputs['Normal'],dot.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=-.6;ramp.color_ramp.elements[0].color=(.64,.385,.32,1);ramp.color_ramp.elements[1].position=.6;ramp.color_ramp.elements[1].color=(1,.77,.65,1);l.new(dot.outputs['Value'],ramp.inputs[0]);l.new(ramp.outputs[0],em.inputs[0]);l.new(em.outputs[0],out.inputs[0]);d.materials.append(m);o=bpy.data.objects.new('V7 anatomical rear head and nape',d);C.objects.link(o);o.parent=head
root['v7_rear_closed']=True;head.rotation_euler.y=0;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v7-head.blend'));print('V7_REAR_GEOMETRY_REPAIRED',flush=True)
