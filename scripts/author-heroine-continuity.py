"""Native indexed-pixel corrections; original PixelPen projects remain untouched.

First authoring only. Subsequent manual edits use --sync, never regenerate.
Pillow only decodes/encodes sheets and review boards; pose edits use indexed layers.
"""
from pathlib import Path
import argparse
import copy
import json
import re
import zipfile
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'godot-arcana/art/source/heroine'
SRC = BASE / 'continuity-v3'
OUT = ROOT / 'godot-arcana/art/export/heroine-continuity-v3'
DIRS = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']
W, H = 96, 136
PALETTE = json.loads((BASE / 'motion-v2/motion.json').read_text())['palette']
RGB = [(0, 0, 0, 0)] + [tuple(bytes.fromhex(c.lstrip('#'))) + (255,) for c in PALETTE]
LOOKUP = {c: i for i, c in enumerate(RGB)}


def pixels(path):
    im = Image.open(path).convert('RGBA')
    return bytearray(LOOKUP.get(c, 0) if c[3] else 0 for c in im.getdata())


def native(path):
    """Read all visible saved layers, including manual changes."""
    with zipfile.ZipFile(path) as z:
        cfg = json.loads(z.read('config.json'))
        native_colors = []
        for color in cfg['palette']['color_index']:
            values = map(float, color.split('(', 1)[1].rstrip(')').split(','))
            native_colors.append(tuple(round(max(0, min(1, v)) * 255) for v in values))
        if native_colors != RGB:
            raise ValueError('Keep the shared registered palette: ' + str(path))
        pool = {f['frame_uid']: f for f in cfg['pool_frames']}
        frames = []
        for cell in cfg['animation_timeline']:
            frame = pool[cell['frame_uid']]
            uid = '_'.join(re.findall(r'-?\d+', frame['frame_uid'].split('(', 1)[1]))
            data = bytearray(W * H)
            for index in reversed(range(len(frame['layers']))):
                if not frame['layers'][index]['visible']:
                    continue
                layer = z.read(f'pool_frames/{uid}.{index}.bin')
                for i, value in enumerate(layer):
                    if value:
                        data[i] = value
            frames.append(data)
        return cfg, frames


def save_native(name, frames, fps, loop):
    template, _ = native(BASE / 'motion-v2/pixelpen/idle_s.pxpen')
    cfg = copy.deepcopy(template)
    cfg['project_name'] = 'Heroine continuity ' + name
    cfg['file_path'] = (SRC / 'pixelpen' / (name + '.pxpen')).as_posix()
    cfg['animation_fps'], cfg['animation_loop'] = fps, loop
    cfg['pool_frames'], cfg['animation_timeline'] = [], []
    def uid(i):
        return f'Vector3i({i}, 281026, 3)'
    for n in range(len(frames)):
        cfg['pool_frames'].append({'frame_uid': uid(n * 3 + 1), 'layer_active_uid': uid(n * 3 + 2), 'layers': [
            {'layer_uid': uid(n * 3 + 2), 'label': name + f'-{n:02}', 'size': 'Vector2i(96, 136)', 'visible': True}]})
        cfg['animation_timeline'].append({'cell_uid': uid(n * 3 + 3), 'frame_uid': uid(n * 3 + 1)})
    cfg['canvas_pool_frame_uid'], cfg['active_layer_uid'] = uid(1), uid(2)
    cfg['uid_counter'] = len(frames) * 3
    with zipfile.ZipFile(cfg['file_path'], 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.json', json.dumps(cfg))
        for n, data in enumerate(frames):
            z.writestr(f'pool_frames/{n * 3 + 1}_281026_3.0.bin', data)


def breathe(data, top=55, bottom=92):
    # One-pixel chest lift, tapered to zero at neck and hem. Feet/head stay exact.
    result = bytearray(data)
    for y in range(top, bottom):
        source_y = min(bottom - 1, y + (1 if top + 3 <= y < bottom - 4 else 0))
        result[y * W:(y + 1) * W] = data[source_y * W:(source_y + 1) * W]
    return result


EYES = {'s': [(37, 37, 45, 44), (51, 37, 59, 44)],
        'se': [(43, 37, 51, 44), (57, 36, 63, 43)], 'e': [(60, 35, 65, 43)]}


def blink(data, direction, offset_y=0):
    result = bytearray(data)
    source = {'sw': 'se', 'w': 'e'}.get(direction, direction)
    # Rear views have no visible eyes; keep the same neutral silhouette.
    for left, top, right, bottom in EYES.get(source, []):
        if direction in ['sw', 'w']:
            left, right = 97 - right, 97 - left
        top += offset_y
        bottom += offset_y
        for y in range(top, bottom):
            for x in range(left, right):
                if result[y * W + x]:
                    result[y * W + x] = 13  # palette skin base
        for x in range(left + 1, right - 1):
            y = top + 3 + (1 if x in [left + 1, right - 2] else 0)
            result[y * W + x] = 16  # subdued eyelid, not a new face
    return result


def planted_cast(data, neutral):
    result = bytearray(W * H)
    # Register the full pose first: retain elevated hands and head as one drawing.
    # The old median sheet scale left several cast poses 6px shorter than neutral.
    top = min(i // W for i, v in enumerate(data) if v)
    bottom = max(i // W for i, v in enumerate(data) if v) + 1
    scale = 106 / (bottom - top)
    for y in range(10, 116):
        sy = min(bottom - 1, top + int((y - 10) / scale))
        for x in range(W):
            sx = round(48 + (x - 48) / scale)
            if 0 <= sx < W:
                result[y * W + x] = data[sy * W + sx]
    # Same-direction native stocking/boot layer, anchored at (48,116).
    # Preserve the painted cast skirt; only remove the old running legs below it.
    for y in range(92, H):
        result[y * W:(y + 1) * W] = neutral[y * W:(y + 1) * W]
    for y in range(85, 92):
        for x in range(36, 62):
            i = y * W + x
            if result[i] in [1, 2, 3, 4, 5, 11, 12] and not neutral[i]:
                result[i] = 0
    return result


def bench_head(data, neutral):
    top = min(i // W for i, v in enumerate(data) if v)
    offset = top - 10
    result = bytearray(data)
    # Sitting changes head height, never head shape/scale. Same front head layer.
    result[:(56 + offset) * W] = bytes((56 + offset) * W)
    for y in range(10, 56):
        result[(y + offset) * W:(y + offset + 1) * W] = neutral[y * W:(y + 1) * W]
    return result


def image(data):
    im = Image.new('RGBA', (W, H))
    im.putdata([RGB[i] for i in data])
    return im


def author():
    for d, direction in enumerate(DIRS):
        _, master = native(BASE / 'motion-v2/pixelpen' / ('idle_' + direction + '.pxpen'))
        neutral = master[0]
        save_native('idle_' + direction, [neutral, breathe(neutral), neutral, blink(neutral, direction)], 4, True)
        poses = [planted_cast(pixels(BASE / 'cast-v1/frames' / f'cast-{d}-{f}.png'), neutral) for f in range(4)]
        save_native('cast_' + direction, [neutral] + poses + [neutral], 10, False)
    _, front = native(BASE / 'motion-v2/pixelpen/idle_s.pxpen')
    bench = [pixels(BASE / 'bench-v1/frames' / f'bench-{f}.png') for f in range(8)]
    bench = [bench_head(data, front[0]) for data in bench]
    bench[0] = front[0]
    bench[4] = breathe(bench[3], 73, 98)
    top = min(i // W for i, v in enumerate(bench[3]) if v)
    bench[5] = blink(bench[3], 's', top - 10)
    save_native('bench_s', bench, 8, False)


def sync():
    all_clips = {}
    for kind, columns in [('idle', 4), ('cast', 6), ('bench', 4)]:
        atlas = Image.new('RGBA', (columns * W, (2 if kind == 'bench' else 8) * H))
        for d, direction in enumerate(['s'] if kind == 'bench' else DIRS):
            name = kind + '_' + direction
            _, frames = native(SRC / 'pixelpen' / (name + '.pxpen'))
            all_clips[name] = frames
            for f, data in enumerate(frames):
                im = image(data)
                im.save(SRC / 'frames' / f'{name}-{f:02}.png')
                atlas.alpha_composite(im, ((f % columns) * W, ((f // columns) if kind == 'bench' else d) * H))
        atlas.save(OUT / ('heroine-' + kind + '.png'))
    # Side-by-side state boundaries in the same scale, all eight directions.
    board = Image.new('RGBA', (W * 8, H * 8), '#8292a7')
    draw = ImageDraw.Draw(board)
    labels = ['old idle', 'neutral', 'inhale', 'blink', 'cast prep', 'release', 'recover', 'return']
    for d, direction in enumerate(DIRS):
        imgs = [Image.open(BASE / 'idle-v1/frames' / f'idle-{direction}-0.png').convert('RGBA')]
        imgs += [image(all_clips['idle_' + direction][f]) for f in [0, 1, 3]]
        imgs += [image(all_clips['cast_' + direction][f]) for f in [1, 3, 4, 5]]
        for col, im in enumerate(imgs):
            board.alpha_composite(im, (col * W, d * H))
            draw.text((col * W + 2, d * H + 123), labels[col], fill='white')
    board.save(SRC / 'preview/state-comparison.png')
    for kind, direction, sequence in [
        ('idle', 's', [(0, 1150), (1, 1000), (2, 1850), (3, 130), (0, 400)]),
        ('cast', 'se', [(0, 400), (1, 120), (2, 200), (3, 160), (4, 120), (5, 400)]),
        ('bench', 's', [(0, 400), (1, 130), (2, 130), (3, 500), (4, 600), (3, 500), (5, 130), (3, 400), (6, 105), (7, 105), (0, 400)])]:
        boards = []
        for frame, _ in sequence:
            canvas = Image.new('RGBA', (W, H), '#8292a7')
            canvas.alpha_composite(image(all_clips[kind + '_' + direction][frame]))
            boards.append(canvas.resize((W * 3, H * 3), Image.Resampling.NEAREST).convert('RGB'))
        boards[0].save(SRC / 'preview' / (kind + '.gif'), save_all=True, append_images=boards[1:],
                       duration=[ms for _, ms in sequence], loop=0)
    report = {'frame': [W, H], 'foot': [48, 116], 'palette': PALETTE,
              'directions': DIRS, 'clips': {k: len(v) for k, v in all_clips.items()},
              'native_source': 'pixelpen/*.pxpen', 'manual_edit_sync': 'python scripts/author-heroine-continuity.py --sync',
              'bench_boundary_pixel_differences': sum(a != b for a, b in zip(all_clips['idle_s'][0], all_clips['bench_s'][0])),
              'neutral_boundary_pixel_differences': {d: sum(a != b for a, b in zip(
                  all_clips['idle_' + d][0], all_clips['cast_' + d][-1])) for d in DIRS}}
    (SRC / 'registration.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Synced 17 native clips: idle 32, cast 48 (neutral bookends), bench 8; original projects preserved.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--sync', action='store_true')
    args = parser.parse_args()
    for folder in [SRC / 'pixelpen', SRC / 'frames', SRC / 'preview', OUT]:
        folder.mkdir(parents=True, exist_ok=True)
    if not args.sync:
        if list((SRC / 'pixelpen').glob('*.pxpen')):
            raise SystemExit('Native edits already exist. Use --sync; authoring will not overwrite them.')
        author()
    sync()
