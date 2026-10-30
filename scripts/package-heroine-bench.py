"""Register the approved bench motion with one common scale and foot baseline."""
from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parent.parent
SRC=ROOT/'godot-arcana/art/source/heroine/bench-v1'
OUT=ROOT/'godot-arcana/art/export/heroine-bench-v1'
OUT.mkdir(parents=True,exist_ok=True)
(SRC/'frames').mkdir(exist_ok=True)
source=Image.open(SRC/'bench-sheet-source.png').convert('RGBA')
palette=json.loads((ROOT/'godot-arcana/art/source/heroine/cast-v1/spec.json').read_text(encoding='utf-8'))['palette']
colors=[tuple(bytes.fromhex(c)) for c in palette]
crops=[]
for row in range(2):
    for col in range(4):
        im=source.crop((col*source.width//4,row*source.height//2,(col+1)*source.width//4,(row+1)*source.height//2))
        im.putalpha(im.getchannel('A').point(lambda a:255 if a>=192 else 0))
        # Preserve only the connected heroine silhouette; discard detached fringe pixels.
        px=im.load(); seen=set(); groups=[]
        for y in range(im.height):
            for x in range(im.width):
                if (x,y) in seen or not px[x,y][3]:continue
                todo=[(x,y)]; seen.add((x,y)); group=[]
                while todo:
                    xx,yy=todo.pop();group.append((xx,yy))
                    for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                        nx,ny=xx+dx,yy+dy
                        if 0<=nx<im.width and 0<=ny<im.height and (nx,ny) not in seen and px[nx,ny][3]:seen.add((nx,ny));todo.append((nx,ny))
                groups.append(group)
        keep=max(groups,key=len)
        for group in groups:
            if group is not keep:
                for x,y in group:px[x,y]=(0,0,0,0)
        crops.append(im.crop(im.getbbox()))
standing=Image.open(ROOT/'godot-arcana/art/source/heroine/run-v1/idle-front.png')
scale=(standing.getbbox()[3]-standing.getbbox()[1])/crops[0].height
atlas=Image.new('RGBA',(384,272));cache={}
for i,im in enumerate(crops):
    im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.NEAREST)
    canvas=Image.new('RGBA',(96,136));canvas.alpha_composite(im,(48-im.width//2,116-im.height))
    px=canvas.load()
    for y in range(136):
        for x in range(96):
            if not px[x,y][3]:px[x,y]=(0,0,0,0);continue
            rgb=px[x,y][:3]
            if rgb not in cache:cache[rgb]=min(colors,key=lambda c:sum((rgb[k]-c[k])**2 for k in range(3)))
            px[x,y]=cache[rgb]+(255,)
    canvas.save(SRC/'frames'/f'bench-{i}.png')
    atlas.alpha_composite(canvas,((i%4)*96,(i//4)*136))
atlas.save(OUT/'heroine-bench.png')
atlas.resize((1152,816),Image.Resampling.NEAREST).save(SRC/'registered-preview.png')
spec={'frame':[96,136],'foot':[48,116],'grid':[4,2],'direction':'s','pixels_per_unit':64,'common_scale':scale,'palette':palette,'alpha':[0,255],'poses':['stand','bend','lower','seated','breathe','blink','rise','straighten'],'sit':{'frames':[0,1,2,3],'duration':0.52},'stand':{'frames':[3,6,7,0],'duration':0.42},'generator':'built-in image_gen','design':'approved-concept.png','source':'bench-sheet-source.png'}
(SRC/'spec.json').write_text(json.dumps(spec,indent=2),encoding='utf-8')
print('Registered 8 bench poses with common scale',round(scale,4))
