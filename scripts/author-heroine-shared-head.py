"""Author a reversible shared-head candidate from saved indexed PixelPen clips.

No independently generated faces. Original approved full-body poses remain archived.
"""
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('continuity', Path(__file__).with_name('author-heroine-continuity.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
SOURCE = c.BASE / 'continuity-v4'
c.SRC = SOURCE
OUT = c.ROOT / 'godot-arcana/art/export/heroine-continuity-v4'
for folder in [SOURCE / 'pixelpen', SOURCE / 'frames', SOURCE / 'preview', OUT]:
    folder.mkdir(parents=True, exist_ok=True)


def head_only(neutral):
    data = bytearray(c.W * c.H)
    data[:54 * c.W] = neutral[:54 * c.W]
    return data


def replace_head(frame, reference, neutral):
    result = bytearray(frame)
    # A per-row silhouette envelope, rather than a horizontal body cut.
    # Outside the head envelope, elevated casting hands remain untouched.
    for y in range(58):
        points = [x for x in range(c.W) if reference[y * c.W + x]]
        if not points:
            continue
        left, right = max(0, min(points) - 3), min(c.W, max(points) + 4)
        for x in range(left, right):
            if y < 54 or result[y * c.W + x] in range(1, 13):
                result[y * c.W + x] = 0
    for i, value in enumerate(head_only(neutral)):
        if value:
            result[i] = value
    return result


def author():
    if list((SOURCE / 'pixelpen').glob('*.pxpen')):
        if '--revise-candidate' not in __import__('sys').argv:
            raise SystemExit('Candidate already exists. Preserve manual edits; use --sync.')
        import zipfile
        from datetime import datetime
        with zipfile.ZipFile(SOURCE / ('previous-native-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.zip'), 'w') as archive:
            for path in (SOURCE / 'pixelpen').glob('*.pxpen'):
                archive.write(path, path.name)
    for direction in c.DIRS:
        _, idle = c.native(c.BASE / 'continuity-v3/pixelpen' / f'idle_{direction}.pxpen')
        _, cast = c.native(c.BASE / 'continuity-v3/pixelpen' / f'cast_{direction}.pxpen')
        body_direction = {'nw': 'ne', 'w': 'e', 'sw': 'se'}.get(direction, direction)
        _, run = c.native(c.BASE / 'run-v1/pixelpen' / f'run-{body_direction}.pxpen')
        if body_direction != direction:
            reflected = []
            for frame in run:
                result = bytearray(c.W * c.H)
                for y in range(c.H):
                    for x in range(1, c.W):
                        result[y * c.W + x] = frame[y * c.W + (96 - x)]
                reflected.append(result)
            run = reflected
        c.save_native('idle_' + direction, idle, 4, True)
        c.save_native('cast_' + direction, [cast[0]] + [replace_head(f, cast[1], idle[0]) for f in cast[1:-1]] + [cast[-1]], 10, False)
        c.save_native('run_' + direction, [replace_head(f, f, idle[0]) for f in run], 12, True)
    _, bench = c.native(c.BASE / 'continuity-v3/pixelpen/bench_s.pxpen')
    c.save_native('bench_s', bench, 8, False)


def sync():
    report = {'head_source': 'continuity-v3 idle neutral, same direction', 'head_neck_y': 54,
              'mirrored_full_pose_bodies': {'nw': 'ne', 'w': 'e', 'sw': 'se'},
              'status': 'shared heads; approved pose bodies with mirrored directional corrections', 'clips': {}}
    for kind, columns in [('idle', 4), ('cast', 6), ('run', 8), ('bench', 4)]:
        atlas = Image.new('RGBA', (columns * c.W, (2 if kind == 'bench' else (9 if kind == 'run' else 8)) * c.H))
        board = Image.new('RGBA', atlas.size, '#8292a7')
        draw = ImageDraw.Draw(board)
        for row, direction in enumerate(['s'] if kind == 'bench' else c.DIRS):
            name = kind + '_' + direction
            _, frames = c.native(SOURCE / 'pixelpen' / (name + '.pxpen'))
            report['clips'][name] = len(frames)
            for f, data in enumerate(frames):
                im = c.image(data)
                im.save(SOURCE / 'frames' / f'{name}-{f:02}.png')
                point = ((f % columns) * c.W, (f // columns if kind == 'bench' else row) * c.H)
                atlas.alpha_composite(im, point)
                board.alpha_composite(im, point)
                draw.text((point[0] + 2, point[1] + 123), f'{direction} {f}', fill='white')
        atlas.save(OUT / f'heroine-{kind}.png')
        board.save(SOURCE / 'preview' / f'{kind}-all-poses.png')
        if kind == 'run':
            for col, direction in enumerate(c.DIRS):
                _, idle = c.native(SOURCE / 'pixelpen' / f'idle_{direction}.pxpen')
                atlas.alpha_composite(c.image(idle[0]), (col * c.W, 8 * c.H))
            atlas.save(OUT / 'heroine-run.png')
            original = (c.ROOT / 'godot-arcana/art/export/heroine-run-v1/heroine-run.tres').read_text(encoding='utf-8')
            (OUT / 'heroine-run.tres').write_text(original.replace('heroine-run-v1/heroine-run.png', 'heroine-continuity-v4/heroine-run.png'), encoding='utf-8')
    (SOURCE / 'registration.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    timeline = [('idle', 0, 600)] + [('run', n, 52) for _ in range(2) for n in range(8)] + [('idle', 0, 400)] + [('cast', n, ms) for n, ms in enumerate([40, 80, 200, 160, 120, 80])] + [('idle', 0, 600)]
    clips = {}
    pictures = []
    for kind, f, _ in timeline:
        board = Image.new('RGBA', (c.W * 4, c.H * 2), '#8292a7')
        for d, direction in enumerate(c.DIRS):
            key = kind + '_' + direction
            if key not in clips:
                _, clips[key] = c.native(SOURCE / 'pixelpen' / (key + '.pxpen'))
            board.alpha_composite(c.image(clips[key][f]), ((d % 4) * c.W, (d // 4) * c.H))
        pictures.append(board.resize((768, 544), Image.Resampling.NEAREST).convert('RGB'))
    pictures[0].save(SOURCE / 'preview/state-flow.gif', save_all=True, append_images=pictures[1:], duration=[ms for _, _, ms in timeline], loop=0)
    print('25 native shared-head clips and complete state-flow preview synced.')


if __name__ == '__main__':
    import sys
    if '--sync' not in sys.argv:
        author()
    sync()
