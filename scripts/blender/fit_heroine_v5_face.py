"""Evaluate an artist-authored CC0 face topology against the approved concept."""
import bpy,sys,math,json,struct,numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v5';Q=P/'reference-topology';V=P/'review'
if (P/'heroine-v5-head-artist-topology.blend').exists() and '--replace-candidate' not in sys.argv:raise RuntimeError('Use saved master for edits; explicit --replace-candidate required for recipe rebuild')
bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v5-head-blockout.blend'));root=bpy.data.objects['V5 HEAD MASTER - neutral axis'];C=bpy.data.collections['V5 EDITABLE - face hair and costume bust']
for o in list(C.objects):
 if o.name.startswith(('Face -','Eye ','Small smile','Lower lip','Subtle nose','Nose subtle','Ear ')):
  # Keep authored earrings; align to new ear position later.
  if 'earring' not in o.name and 'pearl drop' not in o.name:bpy.data.objects.remove(o,do_unlink=True)
b=(Q/'Sendagaya_Shino.vrm').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binary=b[28+n:];meta=j['extensions']['VRM']['meta'];assert meta['licenseName']=='CC0'
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];types={5126:'f4',5123:'u2',5125:'u4',5121:'u1'};count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.frombuffer(binary,dtype=types[a['componentType']],count=a['count']*count,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,count)
materials={}
def material(index):
 if index in materials:return materials[index]
 src=j['materials'][index];ti=src['pbrMetallicRoughness']['baseColorTexture']['index'];imageinfo=j['images'][j['textures'][ti]['source']];view=j['bufferViews'][imageinfo['bufferView']];path=Q/(imageinfo['name']+'.png');path.write_bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]);im=bpy.data.images.load(str(path),check_existing=True);im.pack()
 m=bpy.data.materials.new('V5 artist topology '+src['name']);m.use_nodes=True;nd=m.node_tree.nodes;nd.clear();lk=m.node_tree.links;tx=nd.new('ShaderNodeTexImage');tx.image=im;color=tx.outputs['Color'];em=nd.new('ShaderNodeEmission');out=nd.new('ShaderNodeOutputMaterial')
 if 'EyeIris' in src['name']:
  sep=nd.new('ShaderNodeSeparateColor');sep.mode='HSV';lk.new(color,sep.inputs[0]);combine=nd.new('ShaderNodeCombineColor');combine.mode='HSV';combine.inputs[0].default_value=.752;combine.inputs[1].default_value=.48;lk.new(sep.outputs[2],combine.inputs[2]);color=combine.outputs[0]
 if 'FaceEyeline' in src['name'] or 'FaceEyelash' in src['name'] or 'FaceBrow' in src['name']:
  tint=nd.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(.035,.018,.030,1) if 'Brow' not in src['name'] else (.62,.48,.54,1);lk.new(color,tint.inputs[1]);color=tint.outputs[0]
 if 'Face_00_SKIN' in src['name']:
  # Correct source nose paint locally in object space, preserving actual sculpt.
  tc=nd.new('ShaderNodeTexCoord');dist=nd.new('ShaderNodeVectorMath');dist.operation='DISTANCE';dist.inputs[1].default_value=(0,-.245,.255);lk.new(tc.outputs['Object'],dist.inputs[0]);fall=nd.new('ShaderNodeMapRange');fall.interpolation_type='SMOOTHSTEP';fall.inputs['From Min'].default_value=.008;fall.inputs['From Max'].default_value=.105;fall.inputs['To Min'].default_value=.90;fall.inputs['To Max'].default_value=0;lk.new(dist.outputs['Value'],fall.inputs['Value']);correct=nd.new('ShaderNodeMixRGB');correct.inputs[2].default_value=(.935,.665,.545,1);lk.new(fall.outputs['Result'],correct.inputs[0]);lk.new(color,correct.inputs[1]);color=correct.outputs[0]
  xyz=nd.new('ShaderNodeSeparateXYZ');lk.new(tc.outputs['Object'],xyz.inputs[0]);ab=nd.new('ShaderNodeMath');ab.operation='ABSOLUTE';lk.new(xyz.outputs[0],ab.inputs[0]);ear=nd.new('ShaderNodeMapRange');ear.inputs['From Min'].default_value=.315;ear.inputs['From Max'].default_value=.37;ear.inputs['To Min'].default_value=0;ear.inputs['To Max'].default_value=.52;lk.new(ab.outputs[0],ear.inputs['Value']);soft=nd.new('ShaderNodeMixRGB');soft.inputs[2].default_value=(.92,.65,.57,1);lk.new(ear.outputs['Result'],soft.inputs[0]);lk.new(color,soft.inputs[1]);color=soft.outputs[0]
  geom=nd.new('ShaderNodeNewGeometry');dot=nd.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.4,-.7,.6);lk.new(geom.outputs['Normal'],dot.inputs[0]);ramp=nd.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=-.25;ramp.color_ramp.elements[0].color=(.90,.86,.89,1);ramp.color_ramp.elements[1].position=.75;ramp.color_ramp.elements[1].color=(1,1,1,1);lk.new(dot.outputs['Value'],ramp.inputs[0]);mix=nd.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;lk.new(color,mix.inputs[1]);lk.new(ramp.outputs[0],mix.inputs[2]);color=mix.outputs[0]
 lk.new(color,em.inputs['Color'])
 if src.get('alphaMode') in ['MASK','BLEND']:
  trans=nd.new('ShaderNodeBsdfTransparent');mix=nd.new('ShaderNodeMixShader');lk.new(tx.outputs['Alpha'],mix.inputs[0]);lk.new(trans.outputs[0],mix.inputs[1]);lk.new(em.outputs[0],mix.inputs[2]);lk.new(mix.outputs[0],out.inputs[0])
 else:lk.new(em.outputs[0],out.inputs[0])
 materials[index]=m;return m
for k,pr in enumerate(j['meshes'][0]['primitives']):
 xyz=acc(pr['attributes']['POSITION']);uv=acc(pr['attributes']['TEXCOORD_0']);inds=acc(pr['indices']).flatten();used=np.unique(inds);remap={v:i for i,v in enumerate(used)};vv=[]
 for i in used:
  x,y,z=xyz[i];xx=(x-.0003)*3.60;yy=z*3.3+.090;zz=(y-1.3832)*4.25
  weight=math.exp(-((abs(xx)-.155)/.14)**4-((zz-.410)/.17)**4);zz=.410+(zz-.410)*(1-.29*weight)
  mouth=math.exp(-((zz-.160)/.065)**4-(xx/.085)**6);zz+=(.010 if xx<0 else .018)*(abs(xx)/.075)**2*mouth
  xx*=1+.22*math.exp(-((zz-.075)/.10)**2)
  if k==8:yy-=.055
  vv.append((float(xx),float(yy),float(zz)))
 fs=[tuple(remap[v] for v in f[::-1]) for f in inds.reshape(-1,3)];data=bpy.data.meshes.new('V5 refined CC0 face surface '+str(k));data.from_pydata(vv,[],fs);data.update();data.materials.append(material(pr['material']));layer=data.uv_layers.new(name='ArtistUV')
 for lp in data.loops:layer.data[lp.index].uv=(float(uv[used[lp.vertex_index]][0]),1-float(uv[used[lp.vertex_index]][1]))
 for poly in data.polygons:poly.use_smooth=True
 o=bpy.data.objects.new('Face V5 topology '+str(k),data);C.objects.link(o);o.parent=root;o['base_topology_author']='pixiv Inc., Sendagaya Shino, CC0';o['changes']='Independent fitted face proportions and violet iris shader; original character identity not adopted'
for o in C.objects:
 if 'earring' in o.name or 'pearl drop' in o.name:o.location.x+=.024*(1 if 'Ear 1' in o.name else -1);o.location.y+=.03
# Widen and curl the bob silhouette, retaining editable original objects.
for o in C.objects:
 if o.name.startswith('Hair '):
  if o.type=='MESH':
   for v in o.data.vertices:
    x,y,z=v.co;lower=np.clip((.64-z)/.48,0,1);v.co.x=x*(1.05+.10*lower);v.co.z+=.035*lower
    if 'bob volume lock' in o.name:
     index=int(o.name.split()[-1]);curl=math.exp(-((z-.23)/.155)**2);v.co.x+=(1 if x>0 else -1)*.040*curl*(.65+.35*math.sin(index*1.4));v.co.y-=.028*curl*math.sin(index*.9);v.co.z+=.020*curl*math.sin(index*1.7)
  elif o.type=='CURVE':o.scale.x=1.10
s=bpy.context.scene;cam=s.camera;s.render.resolution_x=s.render.resolution_y=800;cam.data.ortho_scale=1.30;cam.location=(2.3,-6,.73);cam.rotation_euler=(Vector((0,-.025,.535))-cam.location).to_track_quat('-Z','Y').to_euler();s.render.filepath=str(V/'topology-evaluation-03.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v5-head-artist-topology.blend'));print('CC0_HEAD_TOPOLOGY_EVALUATED',flush=True)
