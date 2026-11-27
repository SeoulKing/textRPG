"""Independent teleport VFX. Never writes heroine animation projects or atlases."""
import importlib.util,json,argparse
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('c',ROOT/'scripts/author-heroine-continuity.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SRC=ROOT/'godot-arcana/art/source/effects/teleport-v1';REF=c.BASE/'reference-bright-v10';OUT=ROOT/'godot-arcana/art/export/effects/teleport-v1'
ORIGINAL=json.loads((REF/'registration.json').read_text())['palette'];FX=['#fbf7f0','#bdefff','#63bcec','#5072c6','#7668ad']+['#171036']*27
c.RGB=[(0,0,0,0)]+[tuple(bytes.fromhex(v[1:]))+(255,) for v in ORIGINAL]
for folder in ['plans','pixelpen','native-frames','preview']:(SRC/folder).mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
def contour(data,color=2):
 out=bytearray(96*136)
 for y in range(1,135):
  for x in range(1,95):
   i=y*96+x
   if data[i] and any(not data[i+o] for o in [-1,1,-96,96]):out[i]=color
 return out

def shape(mask,scale):
 out=bytearray(96*136)
 # Inverse pixel sampling closes compression cracks, preserving the foot anchor.
 for y in range(136):
  for x in range(96):
   sx=round(48+(x-48)/scale)
   if 0<=sx<96 and mask[y*96+sx]:out[y*96+x]=1
 rim=contour(out)
 for i,v in enumerate(rim):
  if v:out[i]=v
 return out

def slit(short=False):
 out=bytearray(96*136);top=62 if short else 15;bottom=82 if short else 116
 for y in range(top,bottom):
  half=0 if short else (1 if y<top+10 or y>bottom-10 else 2)
  for dx in range(-half-1,half+2):out[y*96+48+dx]=1 if dx==0 else 2 if abs(dx)<=half else 4
 for dx in range(-5,6):out[72*96+48+dx]=1 if abs(dx)<2 else 2
 return out

def plan():
 plans=[]
 for d in c.DIRS:
  source=REF/'pixelpen'/('run_'+d+'.pxpen');_,before=c.native(source);_,idle=c.native(REF/'pixelpen'/('idle_'+d+'.pxpen'));base=idle[0]
  echo=bytearray(96*136)
  for i,v in enumerate(contour(base,4)):
   if v and i%96>=4:echo[i-4]=v
  targets=[contour(base),shape(base,.42),slit(),slit(True),slit(),shape(base,.70),echo,bytearray(96*136)]
  edits=[{'frame':n,'x':i%96,'y':i//96,'expected':a,'index':b} for n,data in enumerate(targets) for i,(a,b) in enumerate(zip(before[n],data)) if a!=b]
  p=SRC/'plans'/('blink_'+d+'.json');p.write_text(json.dumps({'source':source.as_posix(),'output':(SRC/'pixelpen'/('blink_'+d+'.pxpen')).as_posix(),'export_dir':(SRC/'native-frames'/('blink_'+d)).as_posix(),'palette':FX,'edits':edits,'frame_count':8}),encoding='utf8');plans.append(p.as_posix())
 (SRC/'plans/batch.json').write_text(json.dumps({'plans':plans}),encoding='utf8');print('Prepared independent PixelPen VFX plans, 8 directions x 8 frames.')
def sync():
 c.RGB=[(0,0,0,0)]+[tuple(bytes.fromhex(v[1:]))+(255,) for v in FX]
 atlas=Image.new('RGBA',(768,1088));clips={}
 for row,d in enumerate(c.DIRS):
  _,data=c.native(SRC/'pixelpen'/('blink_'+d+'.pxpen'));assert len(data)==8
  clips[d]=[c.image(f) for f in data]
  for n,im in enumerate(clips[d]):atlas.alpha_composite(im,(n*96,row*136))
 atlas.save(OUT/'teleport-effect.png')
 # Comparison board uses original reference PNGs only for display; never exports them as animations.
 board=Image.new('RGBA',(768,272),'#26334b');draw=ImageDraw.Draw(board)
 original=Image.open(REF/'native-frames/idle_e/frame-00.png').convert('RGBA')
 for n in range(8):
  if n in [0,6,7]:board.alpha_composite(original,(n*96,0))
  board.alpha_composite(clips['e'][n],(n*96,0));draw.text((n*96+5,120),str(n+1),fill='white')
 for row,d in enumerate(c.DIRS):board.alpha_composite(clips[d][5],(row*96,136))
 board.resize((1536,544),Image.Resampling.NEAREST).save(SRC/'preview/effect-stages.png')
 frames=[]
 for n in range(8):
  im=Image.new('RGBA',(224,144),'#26334b');x=16 if n<4 else 112
  if n in [0,6,7]:im.alpha_composite(original,(x,0))
  im.alpha_composite(clips['e'][n],(x,0));frames.append(im.resize((672,432),Image.Resampling.NEAREST).convert('RGB'))
 frames[0].save(SRC/'preview/teleport-preview.gif',save_all=True,append_images=frames[1:]+[frames[-1]],duration=[20]*8+[650],loop=0)
 # Keep the user-approved, hand-pixelled 64x64 PixelPen thumbnail.
 from shutil import copyfile
 copyfile(ROOT/'godot-arcana/art/source/spells/blink-thumbnail-v1/blink-03.png', ROOT/'godot-arcana/art/export/spells/teleport.png')
 (SRC/'registration.json').write_text(json.dumps({'reference':'heroine/reference-bright-v10 (read only silhouette)','canvas':[96,136],'foot':[48,116],'directions':c.DIRS,'frames':8,'durations_ms':[20]*8,'palette':FX,'effect_only':True,'character_animation_modified':False,'runtime':'res://art/export/effects/teleport-v1/teleport-effect.png'},indent=2),encoding='utf8')
 print('Packaged 64 saved native VFX frames and separate thumbnail; heroine atlases untouched.')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--sync',action='store_true');a=p.parse_args();sync() if a.sync else plan()
