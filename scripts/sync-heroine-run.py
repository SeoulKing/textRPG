"""Apply saved PixelPen direction projects without regenerating or losing manual edits."""
from pathlib import Path
import json, zipfile, re
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'godot-arcana/art/source/heroine/run-v1'
TARGET=ROOT/'godot-arcana/art/export/heroine-run-v1/heroine-run.png'
DIRECTIONS=['s','se','e','ne','n','nw','w','sw']
atlas=Image.new('RGBA',(768,1224))
for row,direction in enumerate(DIRECTIONS):
    with zipfile.ZipFile(SOURCE/'pixelpen'/f'run-{direction}.pxpen') as z:
        cfg=json.loads(z.read('config.json'))
        size=list(map(int,re.findall(r'-?\d+',cfg['canvas_size'].split('(',1)[1])))
        if size!=[96,136]:raise ValueError(f'{direction}: keep the 96x136 canvas')
        palette=[]
        for color in cfg['palette']['color_index']:
            values=list(map(float,color.split('(',1)[1].rstrip(')').split(',')))
            palette.append(tuple(max(0,min(255,round(v*255))) for v in values))
        pool={frame['frame_uid']:frame for frame in cfg['pool_frames']}
        cells=cfg['animation_timeline']
        if len(cells)!=8:raise ValueError(f'{direction}: expected 8 timeline frames')
        for col,cell in enumerate(cells):
            frame=pool[cell['frame_uid']];uid='_'.join(re.findall(r'-?\d+',frame['frame_uid'].split('(',1)[1]))
            result=Image.new('RGBA',(96,136))
            # PixelPen draws the front layer first in its list.
            for index in reversed(range(len(frame['layers']))):
                if not frame['layers'][index]['visible']:continue
                pixels=z.read(f'pool_frames/{uid}.{index}.bin')
                if len(pixels)!=96*136:raise ValueError('PixelPen layer size mismatch')
                layer=Image.new('RGBA',(96,136));layer.putdata([palette[p] for p in pixels]);result.alpha_composite(layer)
            result.putalpha(result.getchannel('A').point(lambda v:255 if v>=128 else 0))
            result.save(SOURCE/'frames'/f'run-{direction}-{col:02}.png')
            atlas.alpha_composite(result,(col*96,row*136))
            if col==1:atlas.alpha_composite(result,(row*96,8*136))
atlas.save(TARGET)
print('Applied the eight saved PixelPen clips to the runtime atlas; source projects preserved.')
