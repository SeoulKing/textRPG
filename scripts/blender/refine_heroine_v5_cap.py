import bpy,math,sys,numpy as np
from pathlib import Path
from mathutils import Vector
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v5'
bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v5-head.blend'))
profile=np.array([(0,.020,.038),(.035,.084,.079),(.09,.158,.122),(.18,.225,.162),(.28,.285,.194),(.40,.322,.213),(.52,.332,.215),(.65,.322,.222),(.78,.303,.234),(.90,.260,.218),(1.00,.152,.145),(1.035,.010,.012)])
slopes=np.gradient(profile[:,1:],profile[:,0],axis=0)
def rad(z):
 t=np.clip(z,0,1.035);i=min(len(profile)-2,max(0,int(np.searchsorted(profile[:,0],t)-1)));d=profile[i+1,0]-profile[i,0];q=(t-profile[i,0])/d
 return (2*q**3-3*q*q+1)*profile[i,1:]+(q**3-2*q*q+q)*d*slopes[i]+(-2*q**3+3*q*q)*profile[i+1,1:]+(q**3-q*q)*d*slopes[i+1]

def head_center_y(z):return -.010-.110*math.exp(-((z-.015)/.19)**2)
vs=[];uv=[];fs=[];N=112;J=36
for j in range(J+1):
 t=(j+.02)/(J+.02)
 for i in range(N):
  a=i*math.tau/N;front=max(0,-math.sin(a));cut=np.clip((front-.35)/.60,0,1);cut=cut*cut*(3-2*cut);maximum=2.54-1.16*cut
  transition=np.clip((math.sin(a)-.35)/.30,0,1);transition=transition*transition*(3-2*transition);limit=math.acos((.565+.020*max(0,math.cos(a))-.537)/.535);maximum=min(maximum,limit+(2.54-limit)*transition);theta=t*maximum
  z=.537+.535*math.cos(theta);rx,ry=rad(min(1.035,z));crown=math.sin(min(math.pi/2,theta)*.95)
  rx=rx+.035*crown;ry=ry+.055*crown
  rx-=.065*math.exp(-((z-.34)/.14)**2)*max(0,math.cos(a))**8
  vs.append((rx*math.cos(a),head_center_y(z)-.012+ry*math.sin(a),z));uv.append((i/N,1-t))

for j in range(J):
 for i in range(N):
  a=j*N+i;b=j*N+(i+1)%N;fs.append((a,a+N,b+N,b))

o=bpy.data.objects['Hair - recessed scalp and underbob'];old=o.data;material=old.materials[0];d=bpy.data.meshes.new('V5 continuous smooth cap hem');d.from_pydata(vs,[],fs);d.update();d.materials.append(material);layer=d.uv_layers.new(name='PaintUV')
for lp in d.loops:layer.data[lp.index].uv=uv[lp.vertex_index]
for poly in d.polygons:poly.use_smooth=True
o.data=d
if old.users==0:bpy.data.meshes.remove(old)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v5-head.blend'));print('V5_CAP_HEM_REFINED')
