"""Read the saved native PixelPen clips; do not regenerate or overwrite manual edits."""
from pathlib import Path
from PIL import Image
import json,zipfile,re
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'godot-arcana/art/source/heroine/motion-v2';OUT=ROOT/'godot-arcana/art/export/heroine-motion-v2'
meta=json.loads((SOURCE/'motion.json').read_text());w,h=meta['size'];columns,rows=meta['grid'];atlas=Image.new('RGBA',(w*columns,h*rows));images={}
for clip in meta['clips']:
    with zipfile.ZipFile(SOURCE/'pixelpen'/(clip['name']+'.pxpen')) as z:
        cfg=json.loads(z.read('config.json'));palette=[]
        for color in cfg['palette']['color_index']:
            values=list(map(float,color.split('(',1)[1].rstrip(')').split(',')));palette.append(tuple(round(max(0,min(1,v))*255) for v in values))
        if len(cfg['animation_timeline'])!=len(clip['ids']):raise ValueError('Keep clip frame count: '+clip['name'])
        pool={frame['frame_uid']:frame for frame in cfg['pool_frames']}
        for n,cell in enumerate(cfg['animation_timeline']):
            frame=pool[cell['frame_uid']];uid='_'.join(re.findall(r'-?\d+',frame['frame_uid'].split('(',1)[1]));result=Image.new('RGBA',(w,h))
            for index in reversed(range(len(frame['layers']))):
                if not frame['layers'][index]['visible']:continue
                raw=z.read(f'pool_frames/{uid}.{index}.bin')
                if len(raw)!=w*h:raise ValueError('Keep96x136 layer size')
                layer=Image.new('RGBA',(w,h));layer.putdata([palette[v] for v in raw]);result.alpha_composite(layer)
            result.putalpha(result.getchannel('A').point(lambda v:255 if v>=128 else 0));i=clip['ids'][n]
            atlas.alpha_composite(result,((i%columns)*w,(i//columns)*h));images[i]=result
            result.save(SOURCE/'frames'/(clip['name']+f'-{n:02}.png'))
atlas.save(OUT/'heroine-motion.png')
# One complete sequence for reviewing transitions, rather than a count of added frames.
clips={clip['name']:clip for clip in meta['clips']};boards=[];timings=[]
sequence=[('idle',0,500)]+[('start',i,65) for i in range(3)]+[('run',i,50) for _ in range(2) for i in range(12)]+[('run',2,50)]+[('stop_left',i,65) for i in range(3)]+[('idle',0,650)]
for kind,f,duration in sequence:
    board=Image.new('RGBA',(w*4,h*2),'#8292a7')
    for d,name in enumerate(meta['directions']):board.alpha_composite(images[clips[kind+'_'+name]['ids'][f]],((d%4)*w,(d//4)*h))
    boards.append(board.resize((w*8,h*4),Image.Resampling.NEAREST).convert('RGB'));timings.append(duration)
boards[0].save(SOURCE/'preview'/'idle-start-run-stop.gif',save_all=True,append_images=boards[1:],duration=timings,loop=0)
for kind in ['idle','run']:
    board=Image.new('RGBA',(w*4,h*2),'#8292a7')
    for d,name in enumerate(meta['directions']):board.alpha_composite(images[clips[kind+'_'+name]['ids'][0]],((d%4)*w,(d//4)*h))
    board.resize((w*8,h*4),Image.Resampling.NEAREST).save(SOURCE/'preview'/(kind+'-8directions.png'))
print('Native PixelPen edits synced to runtime atlas and transition review GIF.')
