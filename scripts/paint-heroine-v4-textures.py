from pathlib import Path
import numpy as np
from PIL import Image
P=Path('art-studies/arcana-hero/white-bob-heroine/blender-v4/textures')
def rgb(v):return np.array(v,dtype=float)/255
# A painted face atlas. Front is U=.75; V increases from jaw to crown.
h=w=1024;y,x=np.mgrid[0:h,0:w].astype(float);u=x/(w-1);v=1-y/(h-1)
base=np.broadcast_to(rgb([248,217,198]),(h,w,3)).copy()
cheeks=np.exp(-((u-.649)/.034)**2-((v-.35)/.075)**2)+np.exp(-((u-.851)/.034)**2-((v-.35)/.075)**2)
base=base*(1-cheeks[...,None]*.25)+rgb([239,151,151])*cheeks[...,None]*.25
warm=np.exp(-((u-.75)/.045)**2-((v-.30)/.045)**2);base=base*(1-warm[...,None]*.11)+rgb([243,181,160])*warm[...,None]*.11
shadow=np.clip((.20-v)/.25,0,.18);base=base*(1-shadow[...,None])+rgb([214,170,165])*shadow[...,None]
Image.fromarray(np.uint8(np.clip(base,0,1)*255)).save(P/'face-painted.png')
# Broad iris gradients, a soft pupil, lower radial fibers, and restrained highlights.
h=512;w=768;y,x=np.mgrid[0:h,0:w].astype(float);xx=x/(w-1)*2-1;zz=1-y/(h-1)*2
im=np.broadcast_to(rgb([251,244,235]),(h,w,3)).copy();r=np.sqrt((xx/.405)**2+((zz-.03)/.91)**2);theta=np.arctan2((zz-.03)/.91,xx/.405)
inside=r<=1;g=np.clip((zz+.8)/1.6,0,1);iris=rgb([181,143,214])[None,None,:]*(1-g[...,None])+rgb([76,49,118])[None,None,:]*g[...,None]
fiber=(np.sin(theta*22+r*7)*.5+.5)*np.clip((r-.30)/.45,0,1)*np.clip(-zz+.35,0,1)
iris=np.clip(iris+fiber[...,None]*rgb([23,17,27]),0,1);ring=np.clip((r-.87)/.13,0,1);iris=iris*(1-ring[...,None])+rgb([54,42,82])*ring[...,None]
im[inside]=iris[inside];pupil=(xx/.155)**2+((zz-.14)/.59)**2<1;im[pupil]=rgb([39,29,63])
for cx,cz,rx,rz,c in [(-.135,.43,.095,.18,[255,253,245]),(.14,-.37,.040,.074,[255,240,239]),(-.24,-.35,.022,.040,[211,202,243])]:
 mask=((xx-cx)/rx)**2+((zz-cz)/rz)**2<1;im[mask]=rgb(c)
Image.fromarray(np.uint8(np.clip(im,0,1)*255)).save(P/'eyes-violet-painted.png')
# Strand UV: U goes across the broad clump; V=1 at its root.
h=1024;w=256;y,x=np.mgrid[0:h,0:w].astype(float);t=y/(h-1);q=x/(w-1)
base=rgb([224,224,235])*(1-t[...,None])+rgb([231,225,231])*t[...,None]
edge=np.abs(q-.5)*2;shade=(.10*edge**2+.10*np.exp(-(t/.16)**2))
base=base*(1-shade[...,None])+rgb([146,145,173])*shade[...,None]
shine=np.exp(-((q-.34)/.22)**2)*np.exp(-((t-.43)/.24)**2)*.33
base=base*(1-shine[...,None])+rgb([255,248,232])*shine[...,None]
Image.fromarray(np.uint8(np.clip(base,0,1)*255)).save(P/'hair-pearl-painted.png')
print('V4 face, iris and pearl hair textures created')
