"""Remove the explicitly rejected nose speckle, preserving every other pixel."""
import importlib.util,json
from pathlib import Path
from PIL import Image,ImageDraw
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SOURCE=c.BASE/'fullbody-v7';DEST=c.BASE/'fullbody-v8'
for folder in [DEST/'plans',DEST/'pixelpen',DEST/'native-frames',DEST/'preview']:folder.mkdir(parents=True,exist_ok=True)
meta=json.loads((SOURCE/'registration.json').read_text());anchors={(r['clip'],r['frame']):r for r in meta['frames']}
NOSE={'s':(45,48,51,52),'se':(58,49,62,52),'e':(62,49,66,52)}
plans=[];records=[];preview={}
for path in sorted((SOURCE/'pixelpen').glob('*.pxpen')):
    name=path.stem;_,direction=name.split('_');facing={'sw':'se','w':'e'}.get(direction,direction)
    _,frames=c.native(path);edits=[]
    for n,frame in enumerate(frames):
        anchor=anchors[(name,n)];dx,dy=anchor['head_offset'];seat=anchor['seat_offset'];result=bytearray(frame);pixels=[]
        if facing in NOSE:
            left,top,right,bottom=NOSE[facing]
            for y in range(top,bottom):
                for x in range(left,right):
                    xx=96-x if direction in ['sw','w'] else x;px=xx+dx;py=y+seat+dy;i=py*96+px
                    if result[i] in [13,15,16,27,28]:
                        pixels.append([px,py,result[i],14]);result[i]=14
        for x,y,a,b in pixels:edits.append({'frame':n,'x':x,'y':y,'expected':a,'index':b})
        records.append({**anchor,'nose_pixel_edits':pixels})
        preview[(name,n)]=result
    plan={'source':path.as_posix(),'output':(DEST/'pixelpen'/path.name).as_posix(),'export_dir':(DEST/'native-frames'/name).as_posix(),'edits':edits}
    p=DEST/'plans'/(name+'.json');text=json.dumps(plan,separators=(',',':'))
    changed=not p.exists() or p.read_text()!=text or not Path(plan['output']).exists();p.write_text(text,encoding='utf-8')
    if changed:plans.append(p.as_posix())
(DEST/'plans/batch.json').write_text(json.dumps({'plans':plans}),encoding='utf-8')
(DEST/'registration.json').write_text(json.dumps({'source':'saved fullbody-v7 PixelPen','policy':'nose speckle removal only; all other pixels unchanged','nose_local_boxes':NOSE,'frames':records},indent=2),encoding='utf-8')
board=Image.new('RGBA',(96*6,66),'#8292a7');draw=ImageDraw.Draw(board)
for d,direction in enumerate(['s','se','e']):
    _,original=c.native(SOURCE/'pixelpen'/f'idle_{direction}.pxpen')
    for col,(label,data) in enumerate([('before',original[0]),('cleaned',preview[(f'idle_{direction}',0)])]):
        x=(d*2+col)*96;board.alpha_composite(c.image(data).crop((0,16,96,68)),(x,0));draw.text((x+2,54),label,fill='white')
board.resize((1728,198),Image.Resampling.NEAREST).save(DEST/'preview/nose-before-after.png')
print('Native nose-only edit plans:',len(plans),'clips;',sum(len(r['nose_pixel_edits']) for r in records),'pixel corrections.')
