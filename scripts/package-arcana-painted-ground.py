"""Register a unique, non-repeating city ground painting, preserving the master."""
from pathlib import Path
from PIL import Image
import json, re
ROOT=Path(__file__).resolve().parents[1]
REGION=ROOT/'art-studies/regions/arcana-city-center'
source=REGION/'source/painted-ground-v1/paving-master.png'
output=ROOT/'godot-arcana/art/export/regions/arcana-city-center/paving-painted-v1.png'
image=Image.open(source).convert('RGB')
lut=Image.open(ROOT/'godot-arcana/art/export/arcana-palette-lut.png').convert('RGB').tobytes()
mapped=[]
for r,g,b in image.getdata():
    index=(round(g*31/255)*1024+round(b*31/255)*32+round(r*31/255))*3
    mapped.append(tuple(lut[index:index+3]))
image.putdata(mapped)
image.save(output)
import_path=output.with_suffix('.png.import')
if not import_path.exists():
    template=(ROOT/'godot-arcana/art/export/fountain-paving/mosaic-ring.png.import').read_text(encoding='utf-8')
    template=re.sub(r'^uid=.*\n','',template,flags=re.M)
    cache='res://.godot/imported/paving-painted-v1.png.ctex'
    runtime='res://art/export/regions/arcana-city-center/paving-painted-v1.png'
    template=re.sub(r'^path=".*"','path="'+cache+'"',template,flags=re.M)
    template=re.sub(r'^source_file=".*"','source_file="'+runtime+'"',template,flags=re.M)
    template=re.sub(r'^dest_files=.*','dest_files=["'+cache+'"]',template,flags=re.M)
    import_path.write_text(template,encoding='utf-8')
spec={'generator':'built-in image_gen','master':'source/painted-ground-v1/paving-master.png',
      'prompt':'source/painted-ground-v1/prompt.txt','size':list(image.size),
      'worldBoundsXZ':[0,0,72,56],'sampling':'one non-repeating image over full city bounds; nearest; no mipmaps',
      'palette':'existing arcana world LUT','display':'illustrated_ground.gdshader painted mode',
      'surfaceMask':'continuous plaza/roads minus rounded garden areas from saved plaza.tscn',
      'preserved':'buildings, collisions, doors, fountain mosaic, terrain data for material logic'}
(REGION/'painted-ground-v1.json').write_text(json.dumps(spec,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Registered unique ground:',image.size,'world bounds 0,0,72,56; no repeat')