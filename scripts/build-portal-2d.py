from pathlib import Path
from PIL import Image
import math
root=Path(__file__).resolve().parents[1]
src=root/'godot-arcana/art/source/portal/portal-concept-sprite.png'
out=root/'godot-arcana/art/export/reference'
palette=[]
for line in (root/'godot-arcana/art/source/arcana-world-64.gpl').read_text().splitlines():
    parts=line.split()
    if len(parts)>=3 and all(v.isdigit() for v in parts[:3]): palette.append(tuple(map(int,parts[:3])))
im=Image.open(src).convert('RGBA')
a=im.getchannel('A').point(lambda v: 255 if v>=220 else 0)
im.putalpha(a)
im=im.crop(a.getbbox())
im.thumbnail((186,186),Image.Resampling.LANCZOS)
base=Image.new('RGBA',(192,192))
base.alpha_composite(im,((192-im.width)//2,190-im.height))
p=Image.new('P',(1,1)); p.putpalette([v for color in palette for v in color]+[0]*(768-len(palette)*3))
alpha=base.getchannel('A').point(lambda v:255 if v>=128 else 0)
rgb=base.convert('RGB').quantize(palette=p,dither=Image.Dither.NONE).convert('RGBA'); rgb.putalpha(alpha)
rgb.save(out/'portal-2d.png')
atlas=Image.new('RGBA',(192*4,192*2))
for frame in range(8):
    img=rgb.copy(); pixels=img.load()
    for y in range(65,155):
        for x in range(70,123):
            r,g,b,a=pixels[x,y]
            if a and b>r*1.18 and b>g*1.06:
                wave=math.sin(frame*math.pi/4+y*.11+x*.06)
                if wave>.45:
                    pixels[x,y]=(*min(palette,key=lambda c:(c[0]-min(255,r+20))**2+(c[1]-min(255,g+25))**2+(c[2]-min(255,b+30))**2),255)
    atlas.alpha_composite(img,((frame%4)*192,(frame//4)*192))
atlas.save(out/'portal-atlas.png')
print('frame 192x192; atlas 768x384; frames 8; alpha',sorted(set(alpha.getdata())))
