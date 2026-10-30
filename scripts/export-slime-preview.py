"""Render review artifacts from the existing baked atlas; never overwrite pixel source."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'godot-arcana/art'
data = json.loads((ART / 'source/monsters/slime.pixel.json').read_text(encoding='utf-8'))
atlas = Image.open(ART / 'export/monsters/slime.png').convert('RGBA')
w, h = data['size']
out = ART / 'reference/slime'
out.mkdir(parents=True, exist_ok=True)
offsets = {}
index = 0
for name, spec in data['animations'].items():
    offsets[name] = index
    index += spec['count']
def cell(name, frame):
    i = offsets[name] + frame
    x, y = i % 16 * w, i // 16 * h
    return atlas.crop((x, y, x + w, y + h))
def stage(name, frame, scale=3):
    im = Image.new('RGB', (w*scale, h*scale+40), '#253c40')
    dr = ImageDraw.Draw(im)
    dr.text((10,8), f'{name.upper()}   {frame+1:02}/{data["animations"][name]["count"]}', fill='#f8eedc')
    # 64 source dots equals one tile; guide follows the common ground anchor.
    dr.line([(0,40+74*scale),(w*scale,40+74*scale)],fill='#6b617c')
    im.paste(cell(name,frame).resize((w*scale,h*scale),Image.Resampling.NEAREST),(0,40),cell(name,frame).resize((w*scale,h*scale),Image.Resampling.NEAREST))
    return im
frames=[]; durations=[]
for name in ['idle','hop','prepare','attack','hit','death']:
    spec=data['animations'][name]
    for f in range(spec['count']):
        frames.append(stage(name,f));durations.append(round(1000/spec['fps']))
frames[0].save(out/'slime-motion.gif',save_all=True,append_images=frames[1:],duration=durations,loop=0,optimize=False)
contact = Image.new('RGB',(6*w*2,6*(h*2+24)),'#253c40')
dr=ImageDraw.Draw(contact)
for row,(name,spec) in enumerate(data['animations'].items()):
    for col in range(6):
        f=round(col*(spec['count']-1)/5)
        image=cell(name,f).resize((w*2,h*2),Image.Resampling.NEAREST)
        point=(col*w*2,row*(h*2+24)+24)
        contact.paste(image,point,image)
        dr.text((point[0]+6,point[1]-18),f'{name} {f:02}',fill='#f8eedc')
contact.save(out/'slime-frames.png')
print(f'Rendered source-derived GIF and contact sheet: {index} frames, {w}x{h}, 1 tile footprint.')
