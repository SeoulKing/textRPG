"""Registered tapered sleeves; four overlapping, editable cutout parts per arm.
The complete image is the painting master; crops do not add dark joint borders.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json
r=Path('godot-arcana/art/source/heroine/skeletal')
palette=json.loads(Path('art-studies/arcana-reference-v1/manifest.json').read_text(encoding='utf8'))['palette']
def color(c):return tuple(min(palette,key=lambda p:sum((p[i]-c[i])**2 for i in range(3))))+(255,)
ink=color((119,104,115));shade=color((199,180,161));cream=color((238,224,200));light=color((255,244,220));skin=color((236,185,157));skinlight=color((255,215,181))
config={}
for d in ['s','se','e','ne','n','nw','w','sw']:
 if d=='e':points={'L':[(47,54),(45,65),(45,76)],'R':[(51,54),(50,64),(51,75)]}
 elif d=='w':points={'L':[(45,54),(46,64),(45,75)],'R':[(49,54),(51,65),(51,76)]}
 elif d in ['se','ne']:points={'L':[(38,54),(35,65),(36,76)],'R':[(58,54),(60,64),(59,75)]}
 elif d in ['sw','nw']:points={'L':[(38,54),(36,64),(37,75)],'R':[(58,54),(61,65),(60,76)]}
 else:points={'L':[(35,54),(33,65),(34,76)],'R':[(61,54),(63,65),(62,76)]}
 config[d]=points
 for side,(shoulder,elbow,wrist) in points.items():
  sx,sy=shoulder;ex,ey=elbow;wx,wy=wrist
  im=Image.new('RGBA',(96,136));p=ImageDraw.Draw(im)
  # A rounded upper sleeve and tapered forearm, with one-pixel exterior only.
  p.polygon([(sx-2,sy),(sx+2,sy),(sx+3,sy+4),(ex+2,ey),(wx+2,wy-3),(wx+1,wy),(wx-1,wy),(wx-2,wy-3),(ex-2,ey),(sx-3,sy+5)],fill=cream)
  p.line([(sx-2,sy+1),(sx-3,sy+5),(ex-2,ey),(wx-2,wy-3),(wx-1,wy)],fill=ink)
  p.line([(sx+2,sy+1),(sx+3,sy+4),(ex+2,ey),(wx+2,wy-3),(wx+1,wy)],fill=shade)
  p.line([(sx-1,sy+3),(ex-1,ey-1),(wx,wy-4)],fill=light)
  p.line([(ex,ey+1),(ex+1,ey+3)],fill=shade)
  # Narrow cuff, small relaxed hand; avoid square, outlined fists.
  p.line([(wx-1,wy-2),(wx+1,wy-2)],fill=light)
  p.line([(wx-1,wy),(wx+1,wy)],fill=shade)
  p.polygon([(wx-1,wy+1),(wx+1,wy+1),(wx+1,wy+4),(wx,wy+5),(wx-1,wy+4)],fill=skin)
  p.point((wx,wy+2),fill=skinlight);p.point((wx,wy+5),fill=shade)
  bare=im.copy()
  for yy in range(sy,wy+1):
   for xx in range(96):
    c=bare.getpixel((xx,yy))
    if c[3]:bare.putpixel((xx,yy),shade if c==ink else skin if c in [shade,cream] else skinlight)
  side_name='left' if side=='L' else 'right'
  for prefix,full in [('arm',im),('bare-arm',bare)]:
   full.save(r/f'{prefix}-{d}-{side_name}.png')
   # Two-pixel hidden overlap, painted from the same master at each seam.
   for part,lo,hi in [('upper',sy,ey+2),('fore',ey-1,wy-1),('cuff',wy-3,wy+1),('hand',wy,wy+6)]:
    segment=Image.new('RGBA',full.size);segment.paste(full.crop((0,lo,96,hi)),(0,lo))
    segment.save(r/f'{prefix}-{part}-{d}-{side_name}.png')
(r/'arm-joints.json').write_text(json.dumps(config,indent=2)+'\n',encoding='utf8')
(r/'arm-parts.json').write_text(json.dumps({'revision':3,'parts':['upper','fore','cuff','hand'],'joints':['Shoulder','Elbow','Wrist'],'seam_overlap_pixels':2,'source':'complete arm master; no added joint outlines'},indent=2)+'\n',encoding='utf8')
