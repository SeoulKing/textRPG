"""Restore approved run facial features through actual PixelPen pixel edits.

Keep v6's coupled upper-body motion. Never stamp a generic eye or invent a mouth.
"""
import importlib.util
import json
from pathlib import Path
from PIL import Image,ImageDraw
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SOURCE=c.BASE/'fullbody-v6';DEST=c.BASE/'fullbody-v7'
for folder in [DEST/'plans',DEST/'pixelpen',DEST/'native-frames',DEST/'preview']:
    folder.mkdir(parents=True,exist_ok=True)
old_meta=json.loads((SOURCE/'registration.json').read_text())
anchors={(f['clip'],f['frame']):f for f in old_meta['frames']}
BOX={'s':(35,32,63,59),'se':(43,33,69,59),'e':(54,32,70,58)}
EYES={'s':[(37,41,44,48),(49,41,56,48)],'se':[(48,42,57,50),(60,41,68,49)],'e':[(60,41,68,48)]}
references={};reports={}
for direction in c.DIRS:
    facing={'sw':'se','w':'e','nw':'ne'}.get(direction,direction)
    _,frames=c.native(c.BASE/'run-v1/pixelpen'/f'run-{facing}.pxpen')
    reference=bytearray(frames[1]);shadows=[]
    if facing in BOX:
        left,top,right,bottom=BOX[facing]
        for y in range(top+1,bottom-1):
            for x in range(left+1,right-1):
                i=y*96+x
                if reference[i] not in [15,16]:continue
                if any(a-1<=x<b+1 and t-1<=y<z+1 for a,t,b,z in EYES[facing]):continue
                # Protect the actual approved lips/nose drawing and jaw boundary.
                if y>=50:continue
                if all(frames[1][(y+dy)*96+x+dx] in [13,14,15,16] for dx,dy in [(-1,0),(1,0),(0,-1),(0,1)]):
                    shadows.append([x,y,reference[i],14]);reference[i]=14
    if direction in ['sw','w','nw']:
        reference=bytearray(reference[y*96+96-x] if x else 0 for y in range(136) for x in range(96))
    references[direction]=reference
    reports[direction]={'reference_file':f'run-v1/pixelpen/run-{facing}.pxpen','frame':1,
                        'mirrored':direction in ['sw','w','nw'],'interior_shadow_edits':shadows,
                        'facial_features':'original individual eyes, mouth, nose, jaw; no generic glyph'}
plans=[];records=[];planned={}
for path in sorted((SOURCE/'pixelpen').glob('*.pxpen')):
    name=path.stem;kind,direction=name.split('_');facing={'sw':'se','w':'e'}.get(direction,direction)
    _,frames=c.native(path);edits=[]
    for n,frame in enumerate(frames):
        anchor=anchors[(name,n)];dx,dy=anchor['head_offset'];seat=anchor['seat_offset']
        result=bytearray(frame)
        if facing in BOX:
            left,top,right,bottom=BOX[facing]
            for y in range(top,bottom):
                for x in range(left,right):
                    xx=96-x if direction in ['sw','w'] else x
                    result[(y+seat+dy)*96+xx+dx]=references[direction][y*96+xx]
            if anchor['blink']:
                # Only close the approved eye itself; leave lips and face paint intact.
                for left,top,right,bottom in EYES[facing]:
                    for y in range(top,bottom):
                        for x in range(left,right):
                            xx=96-x if direction in ['sw','w'] else x
                            v=references[direction][y*96+xx]
                            # Preserve hair/outline outside the iris area.
                            if v in [23,24,25,26] or (top+1<=y<bottom-1 and left+1<=x<right-1):
                                result[(y+seat+dy)*96+xx+dx]=14
                    for x in range(left+1,right-1):
                        xx=96-x if direction in ['sw','w'] else x
                        result[(top+3+seat+dy)*96+xx+dx]=16
        for i,(a,b) in enumerate(zip(frame,result)):
            if a!=b:edits.append({'frame':n,'x':i%96,'y':i//96,'expected':a,'index':b})
        records.append(dict(anchor));planned[(name,n)]=result
    plan={'source':path.as_posix(),'output':(DEST/'pixelpen'/path.name).as_posix(),
          'export_dir':(DEST/'native-frames'/name).as_posix(),'edits':edits}
    p=DEST/'plans'/(name+'.json');text=json.dumps(plan,separators=(',',':'))
    changed=not p.exists() or p.read_text()!=text or not Path(plan['output']).exists()
    p.write_text(text,encoding='utf-8')
    if changed:plans.append(p.as_posix())
(DEST/'plans/batch.json').write_text(json.dumps({'plans':plans}),encoding='utf-8')
(DEST/'registration.json').write_text(json.dumps({'source':'saved fullbody-v6 PixelPen','face_policy':'approved original features restored; only isolated interior skin shadow softened','flat_face':False,'references':reports,'frames':records},indent=2),encoding='utf-8')
# Three views, each showing approved / rejected / restored at the same native scale.
board=Image.new('RGBA',(96*9,80),'#8292a7');draw=ImageDraw.Draw(board)
for d,direction in enumerate(['s','se','e']):
    _,original=c.native(c.BASE/'run-v1/pixelpen'/f'run-{direction}.pxpen')
    _,previous=c.native(SOURCE/'pixelpen'/f'idle_{direction}.pxpen')
    for col,(label,data) in enumerate([('reference',original[1]),('previous',previous[0]),('restored',planned[('idle_'+direction,0)])]):
        x=(d*3+col)*96;board.alpha_composite(c.image(data).crop((0,16,96,76)),(x,0));draw.text((x+1,65),label,fill='white')
board.resize((1728,160),Image.Resampling.NEAREST).save(DEST/'preview/reference-previous-restored.png')
print('Native restore plans:',len(plans),'clips /',len(records),'frames.')
print('Interior shadow pixel edits:',{d:len(r['interior_shadow_edits']) for d,r in reports.items()})
