"""Package the approved city's independent art; never regenerate the source sheet."""
from pathlib import Path
import json, re, shutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REGION = ROOT / 'art-studies/regions/arcana-city-center'
OUT = ROOT / 'godot-arcana/art/export/regions/arcana-city-center'
OUT.mkdir(parents=True, exist_ok=True)
sheet = Image.open(REGION / 'source/city-kit.png').convert('RGBA')
lut = Image.open(ROOT / 'godot-arcana/art/export/arcana-palette-lut.png').convert('RGB').tobytes()
# Regions follow the actual alpha gutters, not a guessed equal row boundary.
items = [
 ('city-townhouse', (0, 0, 480, 600), 384, [-2.65, -2.5, 5.3, 2.5]),
 ('city-workshops', (480, 0, 1100, 600), 512, [-3.7, -2.6, 7.4, 2.6]),
 ('city-bookshop', (1100, 0, 1536, 600), 320, [-2.2, -2.6, 4.4, 2.6]),
 ('city-market', (0, 600, 535, 1024), 256, [-1.7, -1.4, 3.4, 1.4]),
 ('city-cafe', (535, 600, 1015, 1024), 192, [-1.35, -1.3, 2.7, 1.3]),
 ('city-hedge', (1015, 600, 1536, 1024), 192, [-1.45, -.55, 2.9, .55]),
]
manifest = {'generator': 'built-in image_gen', 'approval': 'User: 오 좋다 이렇게 만등러줘',
 'concept': 'approved-concept.png', 'source': 'source/city-kit.png',
 'projection': {'yaw': 0, 'pitch': 45, 'pixelsPerUnit': 64},
 'palette': 'godot-arcana/art/export/arcana-palette-lut.png', 'assets': {}}
gd = ['@tool', 'extends RefCounted', '## Independent city sprites, registered from the approved source sheet.', 'const ITEMS = {']
import_template = (ROOT / 'godot-arcana/art/export/reference/oak.png.import').read_text(encoding='utf-8')
for name, area, width, collision in items:
    cell = sheet.crop(area)
    mask = cell.getchannel('A').point(lambda a: 255 if a >= 192 else 0)
    bounds = mask.getbbox()
    if bounds is None:
        raise RuntimeError('Empty source asset: ' + name)
    cropped = cell.crop(bounds)
    height = round(cropped.height * width / cropped.width)
    cropped = cropped.resize((width, height), Image.Resampling.NEAREST)
    output = Image.new('RGBA', (width + 8, height + 8))
    mapped, colors = [], set()
    for r, g, b, a in cropped.getdata():
        if a < 192:
            mapped.append((0, 0, 0, 0))
        else:
            index = (round(g * 31 / 255) * 1024 + round(b * 31 / 255) * 32 + round(r * 31 / 255)) * 3
            color = tuple(lut[index:index+3])
            colors.add(color)
            mapped.append((*color, 255))
    cropped.putdata(mapped)
    output.paste(cropped, (4, 4))
    target = OUT / (name + '.png')
    output.save(target)
    crop = [area[0] + bounds[0], area[1] + bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]]
    foot = [output.width / 2, output.height - 4]
    shadow = [round(width / 64 * .65, 3), .65 if name.startswith('city-town') or name in ['city-workshops', 'city-bookshop'] else .35]
    runtime = 'res://art/export/regions/arcana-city-center/' + name + '.png'
    manifest['assets'][name] = {'crop': crop, 'size': list(output.size), 'foot': foot,
        'collision': collision, 'shadow': shadow, 'paletteColors': len(colors), 'alpha': [0,255],
        'runtime': runtime, 'filter': 'nearest', 'mipmaps': False}
    gd.append(' "%s": {"texture":preload("%s"),"foot":Vector2(%s,%s),"shadow":Vector2(%s,%s)},' % (name, runtime, *foot, *shadow))
    import_path = target.with_suffix('.png.import')
    if not import_path.exists():
        imported = re.sub(r'^uid=.*\n', '', import_template, flags=re.M)
        cache = 'res://.godot/imported/' + name + '.png.ctex'
        imported = re.sub(r'^path=".*"', 'path="' + cache + '"', imported, flags=re.M)
        imported = re.sub(r'^source_file=".*"', 'source_file="' + runtime + '"', imported, flags=re.M)
        imported = re.sub(r'^dest_files=.*', 'dest_files=["' + cache + '"]', imported, flags=re.M)
        import_path.write_text(imported, encoding='utf-8')
gd += ['}', '']
(ROOT / 'godot-arcana/art/resources/city_center_assets.gd').write_text('\n'.join(gd), encoding='utf-8')
(REGION / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps({k: {'size': v['size'], 'crop': v['crop']} for k,v in manifest['assets'].items()}, ensure_ascii=False))