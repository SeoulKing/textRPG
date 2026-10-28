"""Lighten the approved character's skin material, retaining all outlines/features."""
import importlib.util,json
from pathlib import Path
from PIL import Image,ImageDraw
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SOURCE=c.BASE/'reference-match-v9';DEST=c.BASE/'reference-bright-v10'
meta=json.loads((SOURCE/'registration.json').read_text())
anchors={(r['clip'],r['frame']):r for r in meta['frames']}
c.RGB=[(0,0,0,0)]+[tuple(bytes.fromhex(h.lstrip('#')))+(255,) for h in meta['palette']]
for folder in [DEST/'plans',DEST/'pixelpen',DEST/'native-frames',DEST/'preview']:folder.mkdir(parents=True,exist_ok=True)
# These five entries were sampled specifically from the original face's skin.
# Use its lightest sampled tone as the base; keep just one gentle shade step.
remap={21:21,22:21,23:21,24:21,25:22}
plans=[];audit={'frames':0,'skin_pixel_edits':0,'non_skin_pixel_edits':0,'skin_base_before':meta['skin_base'],
               'skin_base_after':meta['palette'][20],'shade':meta['palette'][21],'remap':remap}
sample={}
for path in sorted((SOURCE/'pixelpen').glob('*.pxpen')):
    _,frames=c.native(path);edits=[]
    for n,frame in enumerate(frames):
        _,direction=path.stem.split('_');anchor=anchors[(path.stem,n)];dx,dy=anchor['head_offset'];seat=anchor['seat_offset']
        facing={'nw':'ne','w':'e','sw':'se'}.get(direction,direction)
        box={'s':(35,32,63,59),'se':(43,33,69,59),'e':(54,32,70,58),'ne':(60,42,71,59)}.get(facing)
        final=bytearray(frame);audit['frames']+=1
        for i,v in enumerate(frame):
            x=i%96-dx;y=i//96-seat-dy
            face=False
            if box:
                xx=96-x if direction in ['nw','w','sw'] else x
                face=box[0]<=xx<box[2] and box[1]<=y<box[3]
            exposed_body=58<=y<92-seat//2
            raised_hand=44<=y<58 and (x<31 or x>70)
            if face or exposed_body or raised_hand:final[i]=remap.get(v,v)
        for i,(a,b) in enumerate(zip(frame,final)):
            if a!=b:edits.append({'frame':n,'x':i%96,'y':i//96,'expected':a,'index':b});audit['skin_pixel_edits']+=1
        if path.stem in ['idle_s','run_s']:sample[(path.stem,n)]=(frame,final)
    plan={'source':path.as_posix(),'output':(DEST/'pixelpen'/path.name).as_posix(),
          'export_dir':(DEST/'native-frames'/path.stem).as_posix(),'edits':edits}
    p=DEST/'plans'/(path.stem+'.json');text=json.dumps(plan,separators=(',',':'));p.write_text(text,encoding='utf-8');plans.append(p.as_posix())
(DEST/'plans/batch.json').write_text(json.dumps({'plans':plans}),encoding='utf-8')
meta['source']='saved reference-match-v9 PixelPen';meta['skin_base']=meta['palette'][20];meta['skin_policy']=audit
(DEST/'registration.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
board=Image.new('RGBA',(96*4,136),'#8292a7');draw=ImageDraw.Draw(board)
for col,(label,data) in enumerate([('before',sample[('idle_s',0)][0]),('brighter',sample[('idle_s',0)][1]),
                                   ('before run',sample[('run_s',1)][0]),('brighter run',sample[('run_s',1)][1])]):
    board.alpha_composite(c.image(data),(col*96,0));draw.text((col*96+2,123),label,fill='white')
board.resize((768,272),Image.Resampling.NEAREST).save(DEST/'preview/skin-before-after.png')
print(json.dumps(audit,indent=2))
