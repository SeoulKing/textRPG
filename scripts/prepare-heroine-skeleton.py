from pathlib import Path
from PIL import Image,ImageDraw
import json,shutil
root=Path('godot-arcana/art/source/heroine');out=root/'skeletal';out.mkdir(exist_ok=True)
backup=Path('art-studies/arcana-reference-v1/before-skeleton');backup.mkdir(exist_ok=True)
for file in ['godot-arcana/art/export/reference/hero-original.png','godot-arcana/art/resources/heroine_layered.gdshader','godot-arcana/scripts/heroine_sprite.gd']:
 target=backup/Path(file).name
 if not target.exists():shutil.copyfile(file,target)
changes={};dirs=['s','se','e','ne','n','nw','w','sw'];layers=['body','hair','dress','shawl','boots-taupe','blouse','skirt','boots-navy']
for d in dirs:
 for layer in layers:
  im=Image.open(root/'masters'/f'{layer}-{d}.png').convert('RGBA');before=im.copy();under=Image.new('RGBA',im.size);p=ImageDraw.Draw(under)
  if layer=='body':
   # Explicit underpainting, only revealed inside the shared neck/hip joints.
   skin=im.getpixel((48,35));skin=skin if skin[3] else (233,198,165,255)
   stocking=im.getpixel((44,95));stocking=stocking if stocking[3] else (83,69,69,255)
   p.polygon([(46,38),(52,38),(54,48),(44,48)],fill=skin)
   for cx in ([47,51] if d in ['e','w'] else [44,53]):
    p.polygon([(cx-3,74),(cx+3,74),(cx+3,94),(cx+2,103),(cx-2,103),(cx-3,94)],fill=stocking)
   im=Image.alpha_composite(under,im)
  
  if not (out/f'{layer}-{d}.png').exists():im.save(out/f'{layer}-{d}.png')
  delta={f'{x},{y}':'#%02x%02x%02x'%im.getpixel((x,y))[:3] for y in range(136) for x in range(96) if im.getpixel((x,y))!=before.getpixel((x,y))}
  if delta:changes[f'{layer}-{d}']=delta
  if layer=='body':
   upper=im.copy();upper.paste((0,0,0,0),(0,101,96,136));upper.save(out/f'body-upper-{d}.png')
if not (out/'joint-patches.json').exists():(out/'joint-patches.json').write_text(json.dumps(changes,indent=2)+'\n',encoding='utf8')
print('Joint pixels painted:',sum(map(len,changes.values())))
