from pathlib import Path
from PIL import Image
import json
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'godot-arcana/art/source/heroine/motion-v2'
source=Image.open(ROOT/'art-studies/arcana-hero/white-bob-heroine/motion-v2/idle-masters.png').convert('RGBA')
palette=[tuple(bytes.fromhex(c[1:])) for c in json.loads((ROOT/'godot-arcana/art/source/heroine/run-v1/registration.json').read_text())['palette']]
cache={}
for d,name in enumerate(['s','se','e','ne','n','nw','w','sw']):
    col=d%4;row=d//4
    im=source.crop((round(col*source.width/4),round(row*source.height/2),round((col+1)*source.width/4),round((row+1)*source.height/2)))
    pixels=im.load();groups=[];seen=set()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=pixels[x,y]
            if a<224 or (r>165 and b>135 and g<90):pixels[x,y]=(0,0,0,0)
            else:pixels[x,y]=(r,g,b,255)
    for y in range(im.height):
        for x in range(im.width):
            if pixels[x,y][3]==0 or (x,y) in seen:continue
            todo=[(x,y)];seen.add((x,y));group=[]
            while todo:
                xx,yy=todo.pop();group.append((xx,yy))
                for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                    nx,ny=xx+dx,yy+dy
                    if 0<=nx<im.width and 0<=ny<im.height and (nx,ny) not in seen and pixels[nx,ny][3]:seen.add((nx,ny));todo.append((nx,ny))
            groups.append(group)
    keep=set(max(groups,key=len))
    for group in groups:
        if group[0] not in keep:
            for x,y in group:pixels[x,y]=(0,0,0,0)
    cut=im.crop(im.getbbox());cut=cut.resize((round(cut.width*106/cut.height),106),Image.Resampling.NEAREST)
    frame=Image.new('RGBA',(96,136));frame.alpha_composite(cut,(48-cut.width//2,10));px=frame.load()
    for y in range(136):
        for x in range(96):
            r,g,b,a=px[x,y]
            if not a:continue
            key=(r,g,b)
            if key not in cache:cache[key]=min(palette,key=lambda c:sum((c[k]-key[k])**2 for k in range(3)))
            px[x,y]=cache[key]+(255,)
    frame.save(OUT/f'idle-{name}.png')
    if d==0:frame.resize((576,816),Image.Resampling.NEAREST).save(OUT/'idle-front-6x.png')
print('Eight neutral masters prepared; no existing runtime assets replaced.')
