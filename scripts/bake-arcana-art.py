"""Arcana's offline source -> palette PNG -> Godot resource pipeline.

Pillow is used for the requested sprite extraction/palette/pixel cleanup, never to
turn a composed concept painting into the playable map. Source PNGs are retained.
Run: python scripts/bake-arcana-art.py [--check]
"""
from pathlib import Path
from PIL import Image, ImageDraw
import argparse
import json
import math
import random

ROOT = Path(__file__).resolve().parents[1] / 'godot-arcana/art'
OUT = ROOT / 'export'
RES = ROOT / 'resources'
SOURCE = ROOT / 'source'
# 64 shared, opaque source colors; lighting colors are deliberately separate.
COLORS = '''253c40 344b4b 465b55 596a5e 728071 8f9780
6b695e 8c8270 a4977e b6ab8e cbbd9d dccdAD e9dbb9 f6e9ce
403d35 574735 72543c 8b6846 a57e50 bc965f d3b176 e3c88d
21444d 285963 326e76 43858b 579da0 75b5b2 9acac0 beddd0
253f36 34543e 46694a 597d53 6e915e 87a570 a2b980 c1cc98 405b57 789663
5b4240 81514b a46a57 c78a68 e3ad82 f4cd9b
343c50 485671 617491 8297af
255c6d 327d8a 46a1ab 6abdc1 9cdbd3 d6eee1
735b74 9d7a94 c7a0ab e2bec1 d5a44f f2cf79 f9e7a6 9e633e'''.split()
assert len(COLORS) == 64
RGB = [tuple(bytes.fromhex(s)) for s in COLORS]
PALETTE = Image.new('P', (1, 1))
PALETTE.putpalette([c for rgb in RGB for c in rgb] + list(RGB[0]) * (256 - 64))

def limited(im):
    """Binary alpha, no dithering, one fixed palette across the entire kit."""
    im = im.convert('RGBA')
    alpha = im.getchannel('A').point(lambda a: 255 if a >= 160 else 0)
    result = im.convert('RGB').quantize(palette=PALETTE, dither=Image.Dither.NONE).convert('RGBA')
    result.putalpha(alpha)
    # Zero invisible RGB to avoid dirty fringes in external editors.
    result.paste((0, 0, 0, 0), mask=alpha.point(lambda a: 255 - a))
    return result

def extract(sheet, rect, size, fit):
    im = sheet.crop(rect).convert('RGBA')
    a = im.getchannel('A').point(lambda x: 255 if x >= 160 else 0)
    bounds = a.getbbox()
    if not bounds:
        raise ValueError(f'Empty source cell: {rect}')
    im = im.crop(bounds)
    ratio = min(fit[0] / im.width, fit[1] / im.height)
    im = limited(im.resize((round(im.width * ratio), round(im.height * ratio)), Image.Resampling.BOX))
    canvas = Image.new('RGBA', size)
    canvas.alpha_composite(im, ((size[0] - im.width) // 2, size[1] - im.height - 4))
    return canvas

def save(name, im):
    override = SOURCE / 'overrides' / f'{name}.png'
    if override.exists():
        replacement = Image.open(override).convert('RGBA')
        if replacement.size != im.size: raise ValueError(f'Override dimensions: {name}')
        im = limited(replacement)
    im.save(OUT / f'{name}.png', optimize=True)

def tex_sub(name, atlas, region):
    return f'''[sub_resource type="AtlasTexture" id="{name}"]
atlas = ExtResource("1")
region = Rect2({', '.join(map(str, region))})
'''

def character(sheet, row, name):
    # Shared identity and 32x48 feet anchors; eight poses express contact/pass/lift.
    atlas = Image.new('RGBA', (256, 384))
    animations, resources = [], []
    directions = ['south', 'north', 'west', 'east']
    for d, direction in enumerate(directions):
        sw, sh = sheet.width // 4, sheet.height // 2
        base = extract(sheet, (d*sw, row*sh, (d+1)*sw, (row+1)*sh), (32,48), (24,44))
        grounded = Image.new('RGBA', (32,48))
        grounded.alpha_composite(base, (0,3))
        base = grounded
        # Keep the head/torso intact; animate the legs and outer sleeves separately.
        for f in range(8):
            phase = f * math.tau / 8
            stride = math.sin(phase)
            frame = base.copy()
            frame.paste((0,0,0,0), (0,36,32,48))
            for left, right, sign in [(0,16,1),(16,32,-1)]:
                leg = base.crop((left,36,right,47))
                lift = round(max(0, stride*sign)*2)
                reach = round(stride*sign*2) if d in (2,3) else 0
                if d == 2: reach = -reach
                frame.alpha_composite(leg, (left+reach,36-lift))
            # Sleeves follow the opposite leg. Avoid face, torso and shoulder seams.
            if d in (0,1):
                for left, right, sign in [(5,11,-1),(22,27,1)]:
                    sleeve = base.crop((left,24,right,34))
                    frame.paste((0,0,0,0), (left,24,right,34))
                    frame.alpha_composite(sleeve,(left,24+round(stride*sign)))
            atlas.alpha_composite(frame,(f*32,d*48))
            resources.append(tex_sub(f'w{d}{f}',name,[f*32,d*48,32,48]))
        for f in range(2):
            # Feet stay planted; one shoulder pixel breath every few seconds.
            frame = base.copy()
            if f == 1:
                chest = base.crop((9,22,23,32))
                frame.alpha_composite(chest,(9,21))
            atlas.alpha_composite(frame,(f*32,(4+d)*48))
            resources.append(tex_sub(f'i{d}{f}',name,[f*32,(4+d)*48,32,48]))
        for prefix,count,fps,label in [('w',8,12,'walk'),('i',2,.6,'idle')]:
            frames = ', '.join(f'{{"duration":1.0,"texture":SubResource("{prefix}{d}{f}")}}' for f in range(count))
            animations.append(f'{{"frames":[{frames}],"loop":true,"name":&"{label}_{direction}","speed":{float(fps)}}}')
    save(name,atlas)
    resource = f'''[gd_resource type="SpriteFrames" load_steps=42 format=3]
[ext_resource type="Texture2D" path="res://art/export/{name}.png" id="1"]
''' + '\n'.join(resources) + '\n[resource]\nanimations = [' + ',\n'.join(animations) + ']\n'
    (RES/f'{name}.tres').write_text(resource,encoding='utf-8')

def terrain():
    """Hand-authored material clusters + 16 corner masks, shared-edge continuity."""
    stone = Image.new('RGBA', (128, 128), '#b6ab8e')
    pen = ImageDraw.Draw(stone)
    # 128px periodic block with irregular slab lengths and missing mortar joins.
    for row in range(8):
        y = row * 16
        joins = [-18, 18, 54, 92, 128, 164] if row % 2 else [-1, 36, 74, 108, 144]
        for col,(x,end) in enumerate(zip(joins,joins[1:])):
            fill = '#cbbd9d' if (row*7+col*3)%7 else '#dccdad'
            pen.rounded_rectangle((x+1,y+1,end-1,y+15),radius=2,fill=fill)
            if (row+col)%3 == 0: pen.line((x+3,y+2,min(end-3,x+16),y+2),fill='#dccdad')
    for points in [[(36,34),(34,38),(38,41)],[(94,99),(91,102),(93,106)]]:
        pen.line(points,fill='#b6ab8e')
    dirt = Image.new('RGBA', (128, 128), '#b6ab8e')
    dp = ImageDraw.Draw(dirt)
    for box in [(3, 5, 6, 5), (19, 23, 22, 23), (26, 10, 28, 10)]: dp.rectangle(box, fill='#cbbd9d')
    grass = Image.new('RGBA', (128,128), '#6e915e')
    gp = ImageDraw.Draw(grass)
    rng = random.Random(271026)
    # Continuous periodic clusters, not per-tile noise or a flat green rectangle.
    for y in range(128):
        for x in range(128):
            cluster = math.sin(math.tau*x/128 + .8*math.sin(math.tau*y/128)) + .6*math.cos(math.tau*y/64)
            if cluster > .95: grass.putpixel((x,y),(*RGB[35],255))
            elif cluster < -.95: grass.putpixel((x,y),(89,125,83,255))
    for i in range(270):
        x, y = rng.randrange(128), rng.randrange(128)
        height = rng.choice([2,3,3,4])
        shadow = '#597d53'
        light = '#87a570' if i % 5 else '#a2b980'
        # Each tuft is a deliberate three-blade cluster, wrapping at texture edges.
        for dx, dy, color in [(0,0,shadow),(1,-1,shadow),(-1,-height,light),(0,-height+1,light),(2,-height+2,light)]:
            grass.putpixel(((x+dx)%128,(y+dy)%128),tuple(bytes.fromhex(color[1:]))+(255,))
    for i in range(14):
        x,y = rng.randrange(128),rng.randrange(128)
        color = '#c1cc98' if i%3 else '#c7a0ab'
        gp.point((x,y),fill=color)
        if i%3 == 0: gp.point(((x+1)%128,y),fill='#e2bec1')
    # Small warm earth/gravel clusters use all sixteen material variants.
    for i in range(65):
        x,y = rng.randrange(128),rng.randrange(128)
        dp.line((x,y,min(127,x+1+i%3),y),fill='#a4977e' if i%3 else '#cbbd9d')
    atlas = Image.new('RGBA', (512, 1056))
    for x in range(16): atlas.paste(grass.crop((0,0,32,32)), (x*32, 0))
    # Corner bits NW NE SW SE. Bilinear value is identical on shared edges.
    for variant in range(16):
      for pair, lower, upper in [(1, grass, dirt), (2, dirt, stone)]:
        row = 1 + variant * 2 + pair - 1
        for mask in range(16):
            tile = Image.new('RGBA', (32, 32))
            for y in range(32):
                for x in range(32):
                    u, v = x/31, y/31
                    value = ((mask & 1)>0)*(1-u)*(1-v) + ((mask & 2)>0)*u*(1-v) + ((mask & 4)>0)*(1-u)*v + ((mask & 8)>0)*u*v
                    # Offset only inside cells: endpoint continuity is retained.
                    edge = .5 + .07*math.sin(x*.7+y*.5)*math.sin(math.pi*u)*math.sin(math.pi*v)
                    source_point = (x + variant % 4 * 32, y + variant // 4 * 32)
                    if value > edge: color = upper.getpixel(source_point)
                    elif pair == 1 and value > edge - .10 and mask not in (0,15): color = (89,125,83,255)
                    else: color = lower.getpixel(source_point)
                    tile.putpixel((x,y), color)
            atlas.paste(tile, (mask*32, row*32))
    save('terrain', atlas)
    text = '''[gd_resource type="TileSet" load_steps=3 format=3]
[ext_resource type="Texture2D" path="res://art/export/terrain.png" id="1"]
[sub_resource type="TileSetAtlasSource" id="Atlas"]
texture = ExtResource("1")
texture_region_size = Vector2i(32, 32)
'''
    for y in range(33):
        for x in range(16): text += f'{x}:{y}/0 = 0\n'
    text += '\n[resource]\ntile_size = Vector2i(32, 32)\nsources/0 = SubResource("Atlas")\n'
    (RES/'terrain.tres').write_text(text, encoding='utf-8')

def pixel_palette_shader():
    """Keep one authoritative world palette builder, separate from legacy sprites."""
    import runpy
    runpy.run_path(str(Path(__file__).with_name('build-arcana-palette.py')), run_name='__main__')

def bake():
    OUT.mkdir(exist_ok=True)
    RES.mkdir(exist_ok=True)
    pixel_palette_shader()
    manifest = json.loads((SOURCE/'kit.json').read_text(encoding='utf-8'))
    sheets = {}
    for asset in manifest['assets']:
        file = asset['source']
        if file not in sheets: sheets[file] = Image.open(SOURCE/file)
        nominal = tuple(asset.get('source_size', (1536, 1024) if file == 'environment-v1.png' else (1024, 1280)))
        rect = [round(v * sheets[file].size[i % 2] / nominal[i % 2]) for i,v in enumerate(asset['crop'])]
        save(asset['id'], extract(sheets[file], rect, tuple(asset['size']), asset['fit']))
    people = Image.open(SOURCE/'characters-v1.png')
    character(people, 0, 'hero')
    character(people, 1, 'traveler')
    terrain()
    # Small pixel light cookie; only lamps use real-time lights, no bloom.
    glow = Image.new('RGBA', (64,64))
    for y in range(64):
        for x in range(64):
            a = max(0, 1 - math.hypot(x-31.5,y-31.5)/32)**2
            glow.putpixel((x,y), (255,255,255,round(255*a)))
    save('lamp-light', glow)
    (SOURCE/'arcana-64.gpl').write_text('GIMP Palette\nName: Arcana Plaza 64\nColumns: 8\n#\n' + '\n'.join(f'{r:3} {g:3} {b:3}\t{c}' for (r,g,b),c in zip(RGB,COLORS))+'\n', encoding='utf-8')
    check(manifest)

def check(manifest):
    # Local asset contract, intentionally independent from the server/game state.
    unique = set()
    for item in manifest['assets'] + [{'id':'hero','size':[256,384]}, {'id':'traveler','size':[256,384]}, {'id':'terrain','size':[512,1056]}]:
        id_ = item['id']
        if id_ in unique: raise ValueError(f'Duplicate id: {id_}')
        unique.add(id_)
        im = Image.open(OUT/f'{id_}.png').convert('RGBA')
        if list(im.size) != item['size']: raise ValueError(f'Wrong dimensions: {id_}')
        pixels = im.get_flattened_data() if hasattr(im,'get_flattened_data') else im.getdata()
        opaque = {(r,g,b) for r,g,b,a in pixels if a}
        if not opaque.issubset(set(RGB)): raise ValueError(f'Outside shared palette: {id_}')
        if set(im.getchannel('A').tobytes()) - {0,255}: raise ValueError(f'Soft pixels: {id_}')
    print(f'Arcana art: {len(unique)} PNG contracts, 64-color palette, binary alpha OK.')

if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--check', action='store_true')
    args.add_argument('--palette-only', action='store_true')
    options = args.parse_args()
    if options.palette_only: pixel_palette_shader()
    elif options.check: check(json.loads((SOURCE/'kit.json').read_text(encoding='utf-8')))
    else: bake()
