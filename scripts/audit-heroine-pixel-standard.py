"""Measure eye geometry in the saved PixelPen frames against the run-based grid."""
import importlib.util
import json
import argparse
from pathlib import Path
from collections import Counter
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
parser=argparse.ArgumentParser();parser.add_argument('--source',default='fullbody-v5');args=parser.parse_args()
root=c.BASE/args.source
registration=json.loads((root/'registration.json').read_text())
anchors={(f['clip'],f['frame']):f for f in registration['frames']}
_,front=c.native(c.BASE/'run-v1/pixelpen/run-s.pxpen')
template=[[front[1][y*96+x] for x in range(37,44)] for y in range(41,48)]
boxes={'s':[(37,41,44,48),(49,41,56,48)],'se':[(48,42,55,49),(61,42,66,49)],'e':[(60,41,66,48)]}
report={'basis':'approved run-v1 front eye, frame 1; coordinates in 96x136 source pixels',
        'directions':{},'checked_eye_windows':0,'mismatched_pixels':0,'blink_windows':0}
for direction in c.DIRS:
    facing={'sw':'se','w':'e'}.get(direction,direction)
    records=[]
    for left,top,right,bottom in boxes.get(facing,[]):
        left2,right2=(97-right,97-left) if direction in ['sw','w'] else (left,right)
        iris=[];hist=Counter()
        for y in range(top,bottom):
            for x in range(left,right):
                v=template[y-top][(x-left)*7//(right-left)]
                if registration.get('flat_face',False) and v in [13,14,15,16]:v=14
                xx=96-x if direction in ['sw','w'] else x
                hist[v]+=1
                if v in [24,25,26]:iris.append((xx,y))
        record={'outer_box_xyxy':[left2,top,right2,bottom],'outer_size':[right-left,bottom-top],
                'iris_pixels':len(iris),'iris_box_xyxy':[min(x for x,y in iris),min(y for x,y in iris),max(x for x,y in iris)+1,max(y for x,y in iris)+1],
                'palette_pixel_counts':dict(hist)}
        records.append(record)
    report['directions'][direction]=records
for path in (root/'pixelpen').glob('*.pxpen'):
    kind,direction=path.stem.split('_');_,frames=c.native(path)
    facing={'sw':'se','w':'e'}.get(direction,direction)
    for n,data in enumerate(frames):
        anchor=anchors[(path.stem,n)]
        motion=anchor.get('head_offset',[0,0])
        offset=anchor.get('seat_offset',anchor.get('target_neck',58)-58)+motion[1]
        blink=(kind=='idle' and n==3) or (kind=='bench' and n==5)
        for left,top,right,bottom in boxes.get(facing,[]):
            report['checked_eye_windows']+=1
            if blink:report['blink_windows']+=1
            for y in range(top,bottom):
                for x in range(left,right):
                    xx=96-x if direction in ['sw','w'] else x
                    expected=template[y-top][(x-left)*7//(right-left)]
                    if registration.get('flat_face',False) and expected in [13,14,15,16]:expected=14
                    if blink:
                        expected=16 if y==top+3 and left+1<=x<right-1 else 14
                    report['mismatched_pixels']+=data[(y+offset)*96+xx+motion[0]]!=expected
report['front_eye_center_distance_px']=12
report['standard_skin_base']='#edc3b1'
report['status']='matches saved native frames' if report['mismatched_pixels']==0 else 'needs correction'
(root/'pixel-standard.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:report[k] for k in ['checked_eye_windows','blink_windows','mismatched_pixels','status']},indent=2))
