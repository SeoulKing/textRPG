"""Native PixelPen patches: clean face paint and coupled head/neck/shoulder motion.

Reads the actual saved v5 projects; never reruns their original authoring recipes.
"""
import importlib.util
import json
from pathlib import Path
from PIL import Image
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SOURCE=c.BASE/'fullbody-v5';DEST=c.BASE/'fullbody-v6'
for folder in [DEST/'plans',DEST/'pixelpen',DEST/'native-frames',DEST/'preview']:
    folder.mkdir(parents=True,exist_ok=True)
anchors={(f['clip'],f['frame']):f for f in json.loads((SOURCE/'registration.json').read_text())['frames']}
FACE_BOX={'s':(35,32,63,59),'se':(43,33,69,59),'e':(54,32,70,58)}
CHEEK={'s':[(38,48),(56,48),(58,51),(54,55),(49,57),(43,56),(39,53)],
       'se':[(48,49),(65,49),(64,53),(59,57),(52,57),(47,54)],
       'e':[(61,48),(67,48),(67,52),(63,55),(58,56),(57,53)]}
MOUTH={'s':[(47,54),(48,54)],'se':[(57,55),(58,55)],'e':[(64,53)]}


def inside(x,y,polygon):
    odd=False
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:odd=not odd
    return odd


def clean_face(frame,direction,seat,blink):
    result=bytearray(frame)
    facing={'w':'e','sw':'se'}.get(direction,direction)
    if facing not in FACE_BOX:return result,0
    mirrored=direction in ['w','sw']
    left,top,right,bottom=FACE_BOX[facing]
    for y in range(top,bottom):
        for x in range(left,right):
            xx=96-x if mirrored else x;i=(y+seat)*96+xx
            # Only skin paint is flattened; preserve ink, iris, and hair clusters.
            if result[i] in [13,14,15,16]:result[i]=14
            # Gold/grey speckle on the nose and cheeks is not a facial feature.
            if inside(x+.5,y+.5,CHEEK[facing]):result[i]=14
    for x,y in MOUTH[facing]:
        xx=96-x if mirrored else x
        result[(y+seat)*96+xx]=16
    if blink:
        boxes={'s':[(37,41,44,48),(49,41,56,48)],'se':[(48,42,55,49),(61,42,66,49)],'e':[(60,41,66,48)]}
        for left,top,right,bottom in boxes[facing]:
            for y in range(top,bottom):
                for x in range(left,right):
                    xx=96-x if mirrored else x
                    result[(y+seat)*96+xx]=16 if y==top+3 and left+1<=x<right-1 else 14
    return result,sum(a!=b for a,b in zip(frame,result))


def offset(kind,n):
    if kind=='run':return [(0,0),(0,1),(1,0),(0,-2),(0,0),(0,1),(-1,0),(0,-2)][n]
    if kind=='idle':return [(0,0),(0,-1),(0,0),(0,0)][n]
    if kind=='cast':return [(0,0),(0,0),(0,-1),(0,1),(0,0),(0,0)][n]
    return (0,-1) if n==4 else (0,0)


def move_upper(data,dx,dy,seat):
    # Same transform for head, neck and shoulders; fade only below the chest.
    # Feet/ground contact remain fixed. No independently sliding head overlay.
    if dx==0 and dy==0:return bytearray(data)
    upper=72+seat;lower=min(113,94+seat//2)
    result=bytearray(len(data))
    for y in range(136):
        weight=1.0 if y<upper else max(0,(lower-y)/(lower-upper))
        sy=y-round(dy*weight);shift=round(dx*weight)
        for x in range(96):
            sx=x-shift
            if 0<=sx<96 and 0<=sy<136:result[y*96+x]=data[sy*96+sx]
    return result


plans=[];records=[];all_images={}
for path in sorted((SOURCE/'pixelpen').glob('*.pxpen')):
    name=path.stem;kind,direction=name.split('_');_,frames=c.native(path);edits=[]
    for n,frame in enumerate(frames):
        seat=anchors[(name,n)]['target_neck']-58
        blink=(kind=='idle' and n==3) or (kind=='bench' and n==5)
        cleaned,count=clean_face(frame,direction,seat,blink)
        dx,dy=offset(kind,n)
        final=move_upper(cleaned,dx,dy,seat)
        records.append({'clip':name,'frame':n,'head_offset':[dx,dy],'seat_offset':seat,
                        'upper_transform_full_until_y':72+seat,'blend_end_y':min(113,94+seat//2),
                        'face_pixel_edits':count,'blink':blink})
        for i,(a,b) in enumerate(zip(frame,final)):
            if a!=b:edits.append({'frame':n,'x':i%96,'y':i//96,'expected':a,'index':b})
        all_images[(name,n)]=final
    plan={'source':path.as_posix(),'output':(DEST/'pixelpen'/path.name).as_posix(),
          'export_dir':(DEST/'native-frames'/name).as_posix(),'edits':edits}
    target=DEST/'plans'/(name+'.json');text=json.dumps(plan,separators=(',',':'))
    changed=not target.exists() or target.read_text()!=text or not Path(plan['output']).exists()
    target.write_text(text,encoding='utf-8')
    if changed:plans.append(target.as_posix())
(DEST/'plans/batch.json').write_text(json.dumps({'plans':plans}),encoding='utf-8')
(DEST/'registration.json').write_text(json.dumps({'source':'saved fullbody-v5 PixelPen','skin_base':'#edc3b1','flat_face':True,'frames':records},indent=2),encoding='utf-8')
board=Image.new('RGBA',(96*6,80),'#8292a7')
for d,direction in enumerate(['s','se','e']):
    _,old=c.native(SOURCE/'pixelpen'/('idle_'+direction+'.pxpen'))
    for i,data in enumerate([old[0],all_images[('idle_'+direction,0)]]):
        board.alpha_composite(c.image(data).crop((0,16,96,76)),((d*2+i)*96,0))
board.resize((1728,240),Image.Resampling.NEAREST).save(DEST/'preview/face-before-after.png')
print('Native correction plans:',len(plans),'clips /',len(records),'frames.')
