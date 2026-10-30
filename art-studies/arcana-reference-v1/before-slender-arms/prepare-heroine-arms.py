from pathlib import Path
from PIL import Image,ImageDraw
import json,shutil
r=Path('godot-arcana/art/source/heroine/skeletal');palette=json.loads(Path('art-studies/arcana-reference-v1/manifest.json').read_text())['palette']
def color(c):return tuple(min(palette,key=lambda p:sum((p[i]-c[i])**2 for i in range(3))))+(255,)
ink=color((83,69,82));shade=color((189,172,159));cream=color((238,224,200));light=color((255,244,220));skin=color((236,185,157));skinlight=color((255,215,181))
config={}
for d in ['s','se','e','ne','n','nw','w','sw']:
 if d=='e':points={'L':[(46,53),(43,65),(40,77)],'R':[(50,53),(48,64),(46,75)]}
 elif d=='w':points={'L':[(46,53),(48,64),(50,75)],'R':[(50,53),(53,65),(56,77)]}
 elif d in ['se','ne']:points={'L':[(37,53),(32,65),(29,77)],'R':[(60,53),(63,64),(65,75)]}
 elif d in ['sw','nw']:points={'L':[(36,53),(33,64),(31,75)],'R':[(59,53),(64,65),(67,77)]}
 else:points={'L':[(32,53),(27,65),(25,77)],'R':[(64,53),(69,65),(71,77)]}
 config[d]=points
 for side,(shoulder,elbow,wrist) in points.items():
  im=Image.new('RGBA',(96,136));p=ImageDraw.Draw(im);sx,sy=shoulder;ex,ey=elbow;wx,wy=wrist
  p.polygon([(sx if side=='L' else sx-6,sy),(sx+6 if side=='L' else sx,sy),(ex+4,ey),(wx+3,wy-1),(wx+2,wy+1),(wx-3,wy+1),(wx-5,wy-5),(ex-4,ey)],fill=cream,outline=ink)
  p.line([(sx-2,sy+3),(ex-3,ey),(wx-3,wy-3)],fill=shade,width=2)
  p.line([(sx+1,sy+2),(ex+1,ey-1),(wx+1,wy-3)],fill=light,width=2)
  p.line([(wx-3,wy-1),(wx+2,wy-1)],fill=shade,width=1)
  p.polygon([(wx-2,wy+1),(wx+2,wy+1),(wx+3,wy+4),(wx+1,wy+6),(wx-2,wy+5),(wx-3,wy+3)],fill=skin,outline=ink)
  p.line([(wx,wy+2),(wx+1,wy+4)],fill=skinlight)
  im.save(r/('arm-'+d+'-'+('left' if side=='L' else 'right')+'.png'))
  bare=im.copy()
  for yy in range(53,wy+1):
   for xx in range(96):
    c=bare.getpixel((xx,yy))
    if c[3] and c!=ink:bare.putpixel((xx,yy),skin if c in [shade,cream] else skinlight)
  bare.save(r/('bare-arm-'+d+'-'+('left' if side=='L' else 'right')+'.png'))
(r/'arm-joints.json').write_text(json.dumps(config,indent=2)+'\n')
