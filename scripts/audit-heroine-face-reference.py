"""Check saved native facial features against the approved original, not a glyph."""
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
root=c.BASE/'fullbody-v7';meta=json.loads((root/'registration.json').read_text())
anchors={(r['clip'],r['frame']):r for r in meta['frames']}
boxes={'s':(35,32,63,59),'se':(43,33,69,59),'e':(54,32,70,58)}
eyes={'s':[(37,41,44,48),(49,41,56,48)],'se':[(48,42,57,50),(60,41,68,49)],'e':[(60,41,68,48)]}
report={'visible_face_frames':0,'reference_pixel_errors':0,'outside_face_pixel_errors':0,'body_and_coupled_head_motion':'preserved from v6'}
references={}
for direction,r in meta['references'].items():
    _,frames=c.native(c.BASE/r['reference_file']);data=bytearray(frames[r['frame']])
    for x,y,a,b in r['interior_shadow_edits']:
        if data[y*96+x]!=a:raise ValueError('Approved source changed')
        data[y*96+x]=b
    if r['mirrored']:data=bytearray(data[y*96+96-x] if x else 0 for y in range(136) for x in range(96))
    references[direction]=data
for path in (root/'pixelpen').glob('*.pxpen'):
    _,frames=c.native(path);_,before=c.native(c.BASE/'fullbody-v6/pixelpen'/path.name)
    _,direction=path.stem.split('_');facing={'sw':'se','w':'e'}.get(direction,direction)
    for n,data in enumerate(frames):
        anchor=anchors[(path.stem,n)];dx,dy=anchor['head_offset'];seat=anchor['seat_offset'];allowed=set()
        if facing in boxes:
            report['visible_face_frames']+=1;left,top,right,bottom=boxes[facing]
            for y in range(top,bottom):
                for x in range(left,right):
                    xx=96-x if direction in ['sw','w'] else x;i=(y+seat+dy)*96+xx+dx;allowed.add(i)
                    if anchor['blink'] and any(l<=x<r and t<=y<b for l,t,r,b in eyes[facing]):continue
                    report['reference_pixel_errors']+=data[i]!=references[direction][y*96+xx]
        report['outside_face_pixel_errors']+=sum(a!=b for i,(a,b) in enumerate(zip(before[n],data)) if i not in allowed)
(root/'reference-audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
