"""V7 hair-structure evaluation: CC0 authored bob, reshaped to the approved white bob."""
import bpy,sys,math,json,struct,numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';Q=P/'reference-topology';V=P/'review';
if (P/'heroine-v7-seed.blend').exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Seed exists; preserve edits unless explicitly rebuilt')
bpy.ops.wm.open_mainfile(filepath=str(P.parent/'blender-v6/heroine-v6-head.blend'));C=bpy.data.collections['V6 EDITABLE head and supporting bust'];C.name='V7 editable head';root=bpy.data.objects['V6 MASTER - neutral'];root.name='V7 MASTER';head=bpy.data.objects['V6 HEAD POSE - art comparison only'];head.name='V7 HEAD POSE'
for o in list(C.objects):
 if o.name.startswith(('V6 swept','V6 curved','V6 outward','V6 split','V6 airy','V6 cheek','V6 recessed','Contour V6')):bpy.data.objects.remove(o,do_unlink=True)
b=(Q/'Sendagaya_Shibu.vrm').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binary=b[28+n:];assert j['extensions']['VRM']['meta']['licenseName']=='CC0'
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];types={5126:'f4',5123:'u2',5125:'u4',5121:'u1'};count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.frombuffer(binary,dtype=types[a['componentType']],count=a['count']*count,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,count)
def lin(c):return c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4
m=bpy.data.materials.new('V7 pearl authored bob paint');m.use_nodes=True;nd=m.node_tree.nodes;nd.clear();lk=m.node_tree.links;out=nd.new('ShaderNodeOutputMaterial');em=nd.new('ShaderNodeEmission');vc=nd.new('ShaderNodeVertexColor');vc.layer_name='V7Paint';geom=nd.new('ShaderNodeNewGeometry');dot=nd.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.5,-.7,.6);lk.new(geom.outputs['Normal'],dot.inputs[0]);ramp=nd.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=-.2;ramp.color_ramp.elements[0].color=(.75,.74,.83,1);ramp.color_ramp.elements[1].position=.7;ramp.color_ramp.elements[1].color=(1,1,1,1);lk.new(dot.outputs['Value'],ramp.inputs[0]);mul=nd.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1;lk.new(vc.outputs['Color'],mul.inputs[1]);lk.new(ramp.outputs[0],mul.inputs[2]);lk.new(mul.outputs[0],em.inputs[0]);lk.new(em.outputs[0],out.inputs[0])
summary=[]
for k,pr in enumerate(j['meshes'][2]['primitives']):
 material=j['materials'][pr['material']]['name']
 if 'Hair' not in material:continue
 xyz=acc(pr['attributes']['POSITION']);uv=acc(pr['attributes']['TEXCOORD_0']);indices=acc(pr['indices']).flatten();used=np.unique(indices);remap={v:i for i,v in enumerate(used)};vv=[]
 for i in used:
  x,y,z=xyz[i];xx=(x-.0003)*4.05;zz=(y-1.354)*4.25;yy=z*2.8+.075
  # Loosen the lower silhouette into uneven natural inward curls.
  w=max(0,min(1,(.55-zz)/.45));xx*=1+.06*w;yy-=.02*w;zz+=.018*w*math.sin(k*1.73)
  vv.append((float(xx),float(yy),float(zz)))
 fs=[tuple(remap[v] for v in f[::-1]) for f in indices.reshape(-1,3)];d=bpy.data.meshes.new('V7 authored curved hair strip '+str(k));d.from_pydata(vv,[],fs);d.update();d.materials.append(m);col=d.color_attributes.new(name='V7Paint',type='FLOAT_COLOR',domain='POINT');paintuv=d.uv_layers.new(name='AuthoredHairUV')
 for lp in d.loops:paintuv.data[lp.index].uv=(float(uv[used[lp.vertex_index]][0]),1-float(uv[used[lp.vertex_index]][1]))
 for i,old in enumerate(used):
  u,v=uv[old];tone=.915+.025*math.sin(float(u)*17+k*.3);shade=.04*abs(math.sin(float(u)*math.pi));rgb=[tone+.025-shade,tone+.013-shade,tone+.047-shade*.65];col.data[i].color=(*[lin(float(min(1,c))) for c in rgb],1)
 for p in d.polygons:p.use_smooth=True
 o=bpy.data.objects.new('V7 CC0 bob strip %02d'%k,d);C.objects.link(o);o.parent=head;summary.append({'strip':k,'material':material,'vertices':len(vv)})
root['hair_basis']='pixiv Sendagaya Shibu CC0, white albedo and bob shape modified';root['game_integration']=False;head.rotation_euler.y=0
s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=800;s.eevee.taa_render_samples=24;cam.data.ortho_scale=1.3;cam.location=(2.3,-6,.65);cam.rotation_euler=(Vector((0,-.025,.45))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/'authored-bob-evaluation.png');bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v7-seed.blend'));bpy.ops.render.render(write_still=True);(P/'hair-source.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print('V7_AUTHORED_BOB_EVALUATED',len(summary),'strips',flush=True)
