"""Soften actual eyelid/brow shapes and the over-bright nose paint."""
import bpy,bmesh,sys,math
from pathlib import Path
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v7-head.blend'));C=bpy.data.collections['V7 editable head'];root=bpy.data.objects['V7 MASTER']
if root.get('v7_expression_softened'):raise RuntimeError('Expression already edited; preserve source')
for o in C.objects:
 if o.type!='MESH' or not o.name.startswith('Face V5 topology'):continue
 is_brow=o.name.endswith('4')
 for v in o.data.vertices:
  x,y,z=v.co;front=max(0,min(1,(.05-y)/.15));outer=max(0,min(1,(abs(x)-.12)/.17));eyezone=math.exp(-((z-.415)/.135)**6)*math.exp(-((abs(x)-.155)/.16)**6)
  if is_brow:v.co.z+=.010-.035*outer
  else:v.co.z+=front*eyezone*((z-.415)*.08-.016*outer)
  if o.name.endswith('7'):
   q=math.exp(-((z-.15)/.11)**2-((abs(x)-.18)/.14)**2)*front;v.co.x+=math.tanh(x/.04)*.009*q
 o.data.update()
# The inverted hull follows the edited face, not the stale surface.
o=bpy.data.objects['Face V5 topology 7'];outline=bpy.data.objects['Contour Face V5 topology 7'];ink=outline.data.materials[0];d=o.data.copy()
for v in d.vertices:v.co+=v.normal*.0009
bm=bmesh.new();bm.from_mesh(d);bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(d);bm.free();d.materials.clear();d.materials.append(ink);outline.data=d
# A small local paint correction on the actual UV-shaded nose surface.
m=o.data.materials[0];n=m.node_tree.nodes;l=m.node_tree.links;em=next(x for x in n if x.type=='EMISSION');old=em.inputs[0].links[0].from_socket;co=n.new('ShaderNodeTexCoord');dist=n.new('ShaderNodeVectorMath');dist.operation='DISTANCE';nose=min(o.data.vertices,key=lambda v:v.co.y).co;dist.inputs[1].default_value=nose;l.new(co.outputs['Object'],dist.inputs[0]);fall=n.new('ShaderNodeMapRange');fall.interpolation_type='SMOOTHSTEP';fall.inputs['From Min'].default_value=0;fall.inputs['From Max'].default_value=.035;fall.inputs['To Min'].default_value=.70;fall.inputs['To Max'].default_value=0;l.new(dist.outputs['Value'],fall.inputs['Value']);mix=n.new('ShaderNodeMixRGB');mix.inputs[2].default_value=(1,.61,.42,1);l.new(fall.outputs[0],mix.inputs[0]);l.new(old,mix.inputs[1]);l.new(mix.outputs[0],em.inputs[0]);root['v7_expression_softened']=True;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v7-head.blend'));print('V7_EXPRESSION_SOFTENED',flush=True)
