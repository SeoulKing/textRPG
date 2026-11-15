"""Face-only native refinement of the preserved V7 sculpt."""
import bpy,sys,math,json,hashlib,struct
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);B=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';P=B/'face-refinement';V=P/'review';V.mkdir(parents=True,exist_ok=True);dest=P/'heroine-face.blend'
if dest.exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Preserve the edited face master; rebuild only explicitly')
bpy.ops.wm.open_mainfile(filepath=str(B/'heroine-v7-head.blend'));C=bpy.data.collections['V7 editable head'];root=bpy.data.objects['V7 MASTER'];head=bpy.data.objects['V7 HEAD POSE'];root['face_refinement_weight']=1.0;root.id_properties_ui('face_refinement_weight').update(min=0,max=1,description='Coherent native jaw, cheek, nose, lip and eye refinement; 0 preserves the previous sculpt')
def hairhash():
 h=hashlib.sha256()
 for o in sorted(C.objects,key=lambda o:o.name):
  if not o.name.startswith(('V7 CC0','V7 sculpted','V7 fine','V7 crown')):continue
  h.update(o.name.encode())
  if o.type=='MESH':
   for v in o.data.vertices:h.update(struct.pack('<3f',*v.co))
  elif o.type=='CURVE':
   for s in o.data.splines:
    for v in s.bezier_points:h.update(struct.pack('<3f',*v.co))
 return h.hexdigest()
hair_before=hairhash()
def g(x,c,w):return math.exp(-((x-c)/w)**2)
def sculpt(p,index):
 x,y,z=p;f=max(0,min(1,(.02-y)/.12));xx=x;yy=y;zz=z
 # Round the lower chin without enlarging the whole jaw.
 xx+=math.tanh(x/.035)*.012*g(abs(x),.095,.080)*g(z,.065,.07)*f
 zz+=.010*g(x,0,.10)*g(z,.015,.06)*f
 # A small convex cheek, compact nose and rising smile corners.
 yy-=.008*g(abs(x),.19,.115)*g(z,.235,.125)*f
 yy+=.013*g(x,0,.050)*g(z,.25,.070)*f
 mouth=g(x,0,.080)*g(z,.172,.040)*f
 xx+=x*.065*mouth;zz+=.006*g(abs(x),.046,.028)*g(z,.173,.035)*f
 zz+=.0025*g(abs(x),.15,.12)*g(z,.423,.04)*f
 if index==4:zz+=.006*g(abs(x),.15,.07)
 if index==5:zz+=.0035;yy-=.001
 return Vector((xx,yy,zz))
def keydriver(key):
 d=key.driver_add('value').driver;d.type='SCRIPTED';var=d.variables.new();var.name='weight';var.targets[0].id=root;var.targets[0].data_path='["face_refinement_weight"]';d.expression='weight'
changes={};deltas={}
for index in [1,2,3,4,5,7]:
 o=bpy.data.objects['Face V5 topology '+str(index)]
 if not o.data.shape_keys:o.shape_key_add(name='Basis')
 key=o.shape_key_add(name='Face - gentle proportions');key.value=1;ds=[]
 for i,v in enumerate(o.data.vertices):q=sculpt(v.co,index);key.data[i].co=q;ds.append(q-v.co)
 keydriver(key);deltas[index]=ds;changes[o.name]={'vertices':len(ds),'max_displacement':max(d.length for d in ds)}
 if index==7:
  outline=bpy.data.objects['Contour '+o.name]
  if not outline.data.shape_keys:outline.shape_key_add(name='Basis')
  ok=outline.shape_key_add(name='Face - same continuous contour');ok.value=1
  for i,v in enumerate(outline.data.vertices):ok.data[i].co=v.co+ds[i]
  keydriver(ok)
# Preserve the alpha painting and change only the actual colour of the line surfaces.
def srgb(h):
 def lin(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
 return tuple(lin(int(h[i:i+2],16)/255) for i in [0,2,4])+(1,)
for index,color in [(2,'513440'),(3,'452B39'),(4,'9C7A7A')]:
 o=bpy.data.objects['Face V5 topology '+str(index)];m=o.data.materials[0].copy();m.name='Face focus warm line '+str(index);o.data.materials[0]=m;mix=next(n for n in m.node_tree.nodes if n.type=='MIX_RGB');mix.blend_type='MIX';mix.inputs[0].default_value=1;mix.inputs[2].default_value=srgb(color)
# Upper-lid occlusion stays fixed in iris UV, and the original iris albedo/alpha survives.
o=bpy.data.objects['Face V5 topology 5'];m=o.data.materials[0].copy();m.name='Face focus iris depth';o.data.materials[0]=m;n=m.node_tree.nodes;l=m.node_tree.links;em=next(n for n in n if n.type=='EMISSION');old=em.inputs[0].links[0].from_socket;uv=n.new('ShaderNodeUVMap');uv.uv_map=o.data.uv_layers[0].name;sep=n.new('ShaderNodeSeparateXYZ');l.new(uv.outputs[0],sep.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=(1,.97,1,1);ramp.color_ramp.elements[1].position=.80;ramp.color_ramp.elements[1].color=(.49,.43,.61,1);mid=ramp.color_ramp.elements.new(.52);mid.color=(.96,.88,1,1);l.new(sep.outputs['Y'],ramp.inputs[0]);mul=n.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=.68;l.new(old,mul.inputs[1]);l.new(ramp.outputs[0],mul.inputs[2])
def mathnode(op,a=None,b=None):
 q=n.new('ShaderNodeMath');q.operation=op
 for i,v in enumerate([a,b]):
  if v is None:continue
  if isinstance(v,(int,float)):q.inputs[i].default_value=v
  else:l.new(v,q.inputs[i])
 return q.outputs[0]
u=mathnode('MULTIPLY',sep.outputs['X'],2);u=mathnode('FRACT',u);u=mathnode('SUBTRACT',u,.5);u=mathnode('DIVIDE',u,.3073);v=mathnode('SUBTRACT',sep.outputs['Y'],.514);v=mathnode('DIVIDE',v,.3206);px=mathnode('DIVIDE',u,.235);py=mathnode('DIVIDE',v,.355);r=mathnode('SQRT',mathnode('ADD',mathnode('MULTIPLY',px,px),mathnode('MULTIPLY',py,py)));fall=n.new('ShaderNodeMapRange');fall.inputs['From Min'].default_value=.82;fall.inputs['From Max'].default_value=1.10;fall.inputs['To Min'].default_value=.92;fall.inputs['To Max'].default_value=0;fall.interpolation_type='SMOOTHSTEP';l.new(r,fall.inputs['Value']);mix=n.new('ShaderNodeMixRGB');mix.inputs[2].default_value=srgb('30233E');l.new(fall.outputs[0],mix.inputs[0]);l.new(mul.outputs[0],mix.inputs[1]);l.new(mix.outputs[0],em.inputs[0])
# Sclera is warm and gently shaded beneath the top lid, rather than a pure white cut-out.
o=bpy.data.objects['Face V5 topology 1'];m=o.data.materials[0].copy();m.name='Face focus warm sclera';o.data.materials[0]=m;n=m.node_tree.nodes;l=m.node_tree.links;em=next(q for q in n if q.type=='EMISSION');old=em.inputs[0].links[0].from_socket;co=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');l.new(co.outputs['Object'],sep.inputs[0]);r=n.new('ShaderNodeMapRange');r.inputs['From Min'].default_value=.36;r.inputs['From Max'].default_value=.44;r.inputs['To Min'].default_value=.0;r.inputs['To Max'].default_value=.18;l.new(sep.outputs['Z'],r.inputs['Value']);mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[2].default_value=(.88,.71,.79,1);l.new(r.outputs[0],mix.inputs[0]);l.new(old,mix.inputs[1]);l.new(mix.outputs[0],em.inputs[0])
# Keep the facial shading mild but sufficient to read the newly curved cheek.
o=bpy.data.objects['Face V5 topology 7'];m=o.data.materials[0].copy();m.name='Face focus soft cheek and nose';o.data.materials[0]=m
for q in m.node_tree.nodes:
 if q.type=='VALTORGB':q.color_ramp.elements[0].color=(.87,.845,.91,1)
 if q.type=='VECT_MATH' and q.operation=='DISTANCE':q.inputs[1].default_value=sculpt(q.inputs[1].default_value,7)
root['face_focus_status']='Face refinement candidate; no game application';head.rotation_euler.y=0;bpy.context.view_layer.update();assert hair_before==hairhash();s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=900;s.eevee.taa_render_samples=24;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=1.34;bpy.ops.wm.save_as_mainfile(filepath=str(dest));(P/'authoring.json').write_text(json.dumps({'source':'../heroine-v7-head.blend','source_sha256':hashlib.sha256((B/'heroine-v7-head.blend').read_bytes()).hexdigest(),'hair_geometry_sha256':hair_before,'hair_geometry_preserved':True,'face_shape_key_control':'V7 MASTER[face_refinement_weight]','changes':changes},indent=2),encoding='utf8');s.render.filepath=str(V/'portrait-face-a.png');bpy.ops.render.render(write_still=True);cam.location=(0,-6,.52);cam.rotation_euler=(Vector((0,-.13,.29))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.82;s.render.filepath=str(V/'front-face-a.png');bpy.ops.render.render(write_still=True);print('FACE_ONLY_NATIVE_REFINEMENT_SAVED',flush=True)
