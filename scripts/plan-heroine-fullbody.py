"""Frame-specific indexed corrections against the approved run full-body standard.

Produces native PixelPen edit plans, never writes replacement PixelPen archives.
Apply with tools/patch_heroine_fullbody.gd, then review native PNG outputs.
"""
import importlib.util
import json
import statistics
from pathlib import Path
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('c', Path(__file__).with_name('author-heroine-continuity.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
DEST = c.BASE / 'fullbody-v5'
for folder in [DEST / 'pixelpen', DEST / 'plans', DEST / 'preview', DEST / 'native-frames']:
    folder.mkdir(parents=True, exist_ok=True)


def bounds(data, end=58):
    points = [(i % 96, i // 96) for i, v in enumerate(data[:end * 96]) if v]
    return min(x for x, y in points), min(y for x, y in points), max(x for x, y in points) + 1, max(y for x, y in points) + 1


def inverse(y, source, target):
    for a, b, ta, tb in zip(source, source[1:], target, target[1:]):
        if ta <= y < tb:
            return min(135, round(a + (y - ta) * (b - a) / (tb - ta)))
    return min(135, source[-1])


def body_width(data):
    widths=[]
    for y in range(80,93):
        if not data[y*96+48]:continue
        left=right=48
        while left>0 and data[y*96+left-1]:left-=1
        while right<95 and data[y*96+right+1]:right+=1
        widths.append(right-left+1)
    return statistics.median(widths)


EYE_BOXES={'s':[(37,41,44,48),(49,41,56,48)],'se':[(48,42,55,49),(61,42,66,49)],'e':[(60,41,66,48)]}
_,front_source=c.native(c.BASE/'run-v1/pixelpen/run-s.pxpen')
EYE_TEMPLATE=[[front_source[1][y*96+x] for x in range(37,44)] for y in range(41,48)]


def normalized_eyes(reference,direction):
    result=bytearray(reference)
    facing={'sw':'se','w':'e'}.get(direction,direction)
    for left,top,right,bottom in EYE_BOXES.get(facing,[]):
        for y in range(top,bottom):
            for x in range(left,right):
                target_x=96-x if direction in ['sw','w'] else x
                result[y*96+target_x]=EYE_TEMPLATE[y-top][(x-left)*7//(right-left)]
    return result


def remove_islands(data):
    remaining = {i for i,v in enumerate(data) if v}
    groups = []
    while remaining:
        start=remaining.pop(); group=[start]; todo=[start]
        while todo:
            i=todo.pop(); x,y=i%96,i//96
            for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                nx,ny=x+dx,y+dy; j=ny*96+nx
                if 0<=nx<96 and 0<=ny<136 and j in remaining:
                    remaining.remove(j); group.append(j); todo.append(j)
        groups.append(group)
    keep=set(max(groups,key=len))
    return bytearray(v if i in keep else 0 for i,v in enumerate(data))


def correct(frame, neutral, reference, kind, n, direction, body_master):
    if kind == 'cast' and n in [0, 5]:
        kind = 'idle'
    old = bounds(neutral, 54)
    ref = bounds(reference, 58)
    scale_x = 1.0 if kind=='run' else body_width(reference)/body_width(neutral if kind=='idle' else body_master)
    top = min(i // 96 for i, v in enumerate(frame) if v)
    seated_offset = max(0, top - old[1]) if kind == 'bench' else 0
    neck_source = {'idle': 54, 'run': 58, 'cast': 58, 'bench': 54}[kind] + seated_offset
    neck_target = 58 + seated_offset
    # Preserve pose bends, with a common registered neck/waist/hem/foot system.
    source_y = [0, top, neck_source, max(neck_source + 4, 74 + seated_offset // 2), max(neck_source + 8, 92 + seated_offset // 3), 116, 136]
    target_y = [0, ref[1] + seated_offset, neck_target, max(neck_target + 4, 76 + seated_offset // 2), max(neck_target + 8, 94 + seated_offset // 3), 116, 136]
    if kind=='run':source_y=[0,top,58,76,94,116,136];target_y=[0,ref[1],58,76,94,116,136]
    result = bytearray(96 * 136)
    for y in range(136):
        sy = inverse(y, source_y, target_y)
        for x in range(96):
            sx = round(48 + (x - 48) / scale_x)
            if 0 <= sx < 96:
                v = frame[sy * 96 + sx]
                # Run source uses edc3b1 as dominant skin; keep its shadow ramp.
                result[y * 96 + x] = 14 if v == 13 and kind!='run' else v
    registered_pose = bytearray(result)
    # Remove only the registered old head silhouette; leave raised arms outside it.
    left = max(0, round(48 + (old[0] - 48) * scale_x) - 3)
    right = min(96, round(48 + (old[2] - 48) * scale_x) + 3)
    for yy in range(neck_target):
        for x in range(left, right):
            result[yy * 96 + x] = 0
    for y in range(ref[1], 58):
        for x in range(96):
            v = reference[y * 96 + x]
            if v:
                result[(y + seated_offset) * 96 + x] = v
    if kind == 'cast' and n in [2,3] and direction != 's':
        # Restore the actual registered sleeve/hand path that crosses the head box.
        # This copies existing pixels, never draws a new limb or covers the face.
        left_facing=direction in ['nw','w','sw']
        a=(43 if left_facing else 53,64)
        b=(17 if left_facing else 79,52) if n==3 else (25 if left_facing else 71,60)
        dx,dy=b[0]-a[0],b[1]-a[1]
        for y in range(46,65):
            for x in range(10,87):
                t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
                if (x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2<=25 and not reference[y*96+x]:
                    result[y*96+x]=registered_pose[y*96+x]
    if (kind == 'idle' and n == 3) or (kind == 'bench' and n == 5):
        facing = {'sw':'se','w':'e'}.get(direction,direction)
        for left,upper,right,lower in EYE_BOXES.get(facing,[]):
            if direction in ['w','sw']:left,right=97-right,97-left
            upper+=seated_offset;lower+=seated_offset
            for yy in range(upper,lower):
                for xx in range(left,right):
                    result[yy*96+xx]=14
            for xx in range(left+1,right-1):result[(upper+3)*96+xx]=16
    return remove_islands(result), {'source_neck': neck_source, 'target_neck': neck_target, 'scale_x': scale_x,
                    'source_y': source_y, 'target_y': target_y}


plans = []
manifest = {'standard': 'run-v1 saved PixelPen, frame 1, full body', 'status': 'native review pass, not final', 'frames': []}
board = Image.new('RGBA', (96 * 6, 136 * 8), '#8292a7')
draw = ImageDraw.Draw(board)
for direction in c.DIRS:
    _, neutral_frames = c.native(c.BASE / 'continuity-v4/pixelpen' / f'idle_{direction}.pxpen')
    reference_direction = {'nw': 'ne', 'w': 'e', 'sw': 'se'}.get(direction, direction)
    _, references = c.native(c.BASE / 'run-v1/pixelpen' / f'run-{reference_direction}.pxpen')
    reference = references[1]
    if reference_direction != direction:
        reference = bytearray(reference[y * 96 + (96 - x)] if x > 0 else 0 for y in range(136) for x in range(96))
    reference = normalized_eyes(reference,direction)
    # Keep the saved approved complete pose as the authoritative full-body reference.
    for kind in ['idle', 'run', 'cast', 'bench']:
        if kind == 'bench' and direction != 's':
            continue
        name = kind + '_' + direction
        source = c.BASE / 'continuity-v4/pixelpen' / (name + '.pxpen')
        _, frames = c.native(source)
        edits = []
        for n, frame in enumerate(frames):
            result, anchors = correct(frame, neutral_frames[0], reference, kind, n, direction, frames[1 if kind=='cast' else 0])
            for i, (a, b) in enumerate(zip(frame, result)):
                if a != b:
                    edits.append({'frame': n, 'x': i % 96, 'y': i // 96, 'expected': a, 'index': b})
            manifest['frames'].append({'clip': name, 'frame': n, **anchors})
            if kind == 'idle' and n == 0 or kind == 'run' and n == 1 or kind == 'cast' and n == 3:
                col = {'idle': 1, 'run': 3, 'cast': 5}[kind]
                row = c.DIRS.index(direction)
                board.alpha_composite(c.image(frame), ((col - 1) * 96, row * 136))
                board.alpha_composite(c.image(result), (col * 96, row * 136))
                draw.text(((col - 1) * 96 + 1, row * 136 + 123), kind + ' before', fill='white')
                draw.text((col * 96 + 1, row * 136 + 123), kind + ' corrected', fill='white')
        plan = {'source': source.as_posix(), 'output': (DEST / 'pixelpen' / (name + '.pxpen')).as_posix(),
                'export_dir': (DEST / 'native-frames' / name).as_posix(), 'edits': edits}
        path = DEST / 'plans' / (name + '.json')
        text=json.dumps(plan, separators=(',', ':'))
        changed=not path.exists() or path.read_text(encoding='utf-8')!=text or not Path(plan['output']).exists()
        path.write_text(text, encoding='utf-8')
        if changed:plans.append(path.as_posix())
(DEST / 'plans/batch.json').write_text(json.dumps({'plans': plans}), encoding='utf-8')
(DEST / 'registration.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
board.save(DEST / 'preview/fullbody-before-after.png')
print('Prepared per-pixel native plans:', len(plans), 'clips /', len(manifest['frames']), 'frames. Review before applying.')
