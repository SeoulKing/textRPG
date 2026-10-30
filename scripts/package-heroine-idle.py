"""Register the approved idle artwork separately from manually edited run frames."""
from pathlib import Path
from PIL import Image, ImageOps
import json

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'godot-arcana/art/source/heroine/idle-v1'
OUT = ROOT / 'godot-arcana/art/export/heroine-idle-v1'
OUT.mkdir(parents=True, exist_ok=True)
(SRC / 'frames').mkdir(exist_ok=True)
source = Image.open(SRC / 'idle-sheet-source.png').convert('RGBA')
palette = json.loads((SRC.parent / 'run-v1/registration.json').read_text())['palette']
colors = [tuple(bytes.fromhex(c.lstrip('#'))) for c in palette]
cache = {}

def clean(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            fringe = (r > 165 and b > 135 and g < 90) or (b > 150 and b > r * 1.8 and b > g * 1.8)
            px[x, y] = (0, 0, 0, 0) if a < 192 or fringe else (r, g, b, 255)
    seen = set()
    groups = []
    for y in range(im.height):
        for x in range(im.width):
            if (x, y) in seen or not px[x, y][3]:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            group = []
            while stack:
                xx, yy = stack.pop()
                group.append((xx, yy))
                for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)]:
                    nx, ny = xx + dx, yy + dy
                    if 0 <= nx < im.width and 0 <= ny < im.height and (nx, ny) not in seen and px[nx, ny][3]:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            groups.append(group)
    if not groups:
        raise ValueError('Empty source cell')
    largest = max(groups, key=len)
    for group in groups:
        if group is not largest:
            for x, y in group:
                px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())

# Measured cell boundaries: generation leaves a wide left/right margin.
xs = [150, 360, 565, 770, 980]
ys = [0, 280, 556, 852, 1128, 1402]
masters = []
for row in range(5):
    frames = []
    for col in range(4):
        im = clean(source.crop((xs[col], ys[row], xs[col + 1], ys[row + 1])))
        im = im.resize((round(im.width * 106 / im.height), 106), Image.Resampling.NEAREST)
        frame = Image.new('RGBA', (96, 136))
        frame.alpha_composite(im, (48 - im.width // 2, 10))
        px = frame.load()
        for y in range(136):
            for x in range(96):
                if not px[x, y][3]:
                    continue
                rgb = px[x, y][:3]
                if rgb not in cache:
                    cache[rgb] = min(colors, key=lambda c: sum((rgb[k] - c[k]) ** 2 for k in range(3)))
                px[x, y] = cache[rgb] + (255,)
        frames.append(frame)
    masters.append(frames)

directions = ['s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw']
atlas = Image.new('RGBA', (384, 1088))
clips = []
for d, name in enumerate(directions):
    row = d if d <= 4 else 8 - d
    frames = masters[row]
    for col, frame in enumerate(frames):
        if d > 4:
            # Mirror around x=48, preserving the registered foot rather than x=47.5.
            reflected = Image.new('RGBA', (96, 136))
            reflected.alpha_composite(ImageOps.mirror(frame), (1, 0))
            frame = reflected
        frame.save(SRC / 'frames' / f'idle-{name}-{col}.png')
        atlas.alpha_composite(frame, (col * 96, d * 136))
    clips.append({'direction': name, 'durations': [1.15, 1.0, 1.85, .13]})
atlas.save(OUT / 'heroine-idle.png')
atlas.resize((768, 2176), Image.Resampling.NEAREST).save(SRC / 'registered-preview.png')
front = [Image.open(SRC / 'frames' / f'idle-s-{i}.png').resize((288, 408), Image.Resampling.NEAREST) for i in [0, 1, 2, 3, 0]]
front[0].save(SRC / 'idle-preview.gif', save_all=True, append_images=front[1:], duration=[1150, 1000, 1850, 130, 500], loop=0, disposal=2)
spec = {'frame': [96, 136], 'foot': [48, 116], 'grid': [4, 8], 'pixelsPerUnit': 64,
        'directions': directions, 'poses': ['neutral', 'inhale', 'exhale', 'blink'],
        'clips': clips, 'palette': palette, 'alpha': [0, 255],
        'sourceCropX': xs, 'sourceCropY': ys, 'mirroredRows': {'nw': 'ne', 'w': 'e', 'sw': 'se'},
        'design': 'approved-concept.png', 'generator': 'built-in image_gen'}
(SRC / 'spec.json').write_text(json.dumps(spec, indent=2), encoding='utf-8')
print('Registered 32 idle poses; run and cast artwork preserved.')
