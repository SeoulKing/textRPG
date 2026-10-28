"""Register generated cast poses without changing the approved run atlas."""
from pathlib import Path
from PIL import Image, ImageOps
import json, statistics

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'godot-arcana/art/source/heroine/cast-v1'
OUT = ROOT / 'godot-arcana/art/export/heroine-cast-v1'
OUT.mkdir(parents=True, exist_ok=True)
(SRC / 'frames').mkdir(exist_ok=True)
source = Image.open(SRC / 'cast-sheet-source.png').convert('RGBA')
# Same shared 32 colors as the approved run sheet.
palette = ['302442','493c57','635469','82738a','a59aab','c4bcc7','ded9de','f6f0df','fff9e8','dfd3bc','baad9d','978c89','ffe6cf','edc3b1','cc968e','a16b78','9ebbd8','7f9fc3','6585ae','4b668e','394c70','293a59','192943','b7a3d8','8971bb','61469a','d4b77b','a58958','74646b','554a5b','3a3447','232333']
colors = [tuple(bytes.fromhex(c)) for c in palette]
cache = {}
def clean(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a = px[x,y]
            fringe = (r>165 and b>135 and g<90) or (b>150 and b>r*1.8 and b>g*1.8)
            px[x,y] = (0,0,0,0) if a<192 or fringe else (r,g,b,255)
    # Isolated generated fragments are not part of the silhouette.
    seen=set(); groups=[]
    for y in range(im.height):
        for x in range(im.width):
            if (x,y) in seen or px[x,y][3]==0: continue
            stack=[(x,y)]; seen.add((x,y)); group=[]
            while stack:
                xx,yy=stack.pop(); group.append((xx,yy))
                for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                    nx,ny=xx+dx,yy+dy
                    if 0<=nx<im.width and 0<=ny<im.height and (nx,ny) not in seen and px[nx,ny][3]:
                        seen.add((nx,ny)); stack.append((nx,ny))
            groups.append(group)
    if groups:
        largest=max(groups,key=len)
        for group in groups:
            if group is not largest:
                for x,y in group: px[x,y]=(0,0,0,0)
    return im
crops=[]
for row in range(8):
    for col in range(4):
        box=(round(col*source.width/4),round(row*source.height/8),round((col+1)*source.width/4),round((row+1)*source.height/8))
        im=clean(source.crop(box)); crops.append(im.crop(im.getbbox()))
# The generated NW row showed a face. Use the registered NE mirror for true back-facing NW.
for col in range(4): crops[5*4+col]=ImageOps.mirror(crops[3*4+col])
# Mirror pairs also keep the two front diagonals and profiles consistent.
for col in range(4):
    crops[6*4+col]=ImageOps.mirror(crops[2*4+col])
    crops[7*4+col]=ImageOps.mirror(crops[1*4+col])
scale=106/statistics.median(im.height for im in crops)
atlas=Image.new('RGBA',(96*4,136*8))
for i,im in enumerate(crops):
    im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.NEAREST)
    canvas=Image.new('RGBA',(96,136)); canvas.alpha_composite(im,(48-im.width//2,116-im.height))
    px=canvas.load()
    for y in range(136):
        for x in range(96):
            if not px[x,y][3]:continue
            rgb=px[x,y][:3]
            if rgb not in cache:cache[rgb]=min(colors,key=lambda c:sum((rgb[k]-c[k])**2 for k in range(3)))
            px[x,y]=cache[rgb]+(255,)
    canvas.save(SRC/'frames'/f'cast-{i//4}-{i%4}.png')
    atlas.alpha_composite(canvas,((i%4)*96,(i//4)*136))
atlas.save(OUT/'heroine-cast.png')
atlas.resize((768,2176),Image.Resampling.NEAREST).save(SRC/'registered-preview.png')
(SRC/'spec.json').write_text(json.dumps({'frame':[96,136],'foot':[48,116],'grid':[4,8],'directions':['s','se','e','ne','n','nw','w','sw'],'poses':['prepare','gather','release','recover'],'common_scale':scale,'palette':palette,'alpha':[0,255],'mirrored_rows':{'nw':'ne','w':'e','sw':'se'},'generator':'built-in image_gen','design':'approved-concept.png'},indent=2),encoding='utf-8')
print('Packaged 32 cast poses: 96x136, foot (48,116), shared 32-color palette.')
