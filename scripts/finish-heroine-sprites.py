"""Deterministic pixel finishing: palette, bone-anchored facial clusters and 1px ink.
This processes our Blender renders, never downsizes the concept illustration.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json, math, sys
import numpy as np

ROOT=Path(sys.argv[1])
SOURCE=ROOT/'art-studies/arcana-hero/white-bob-heroine/pixel'
BAKE=ROOT/'.runtime/heroine-sprites'
metadata=json.loads((BAKE/'bake.json').read_text(encoding='utf8'))
SOURCE.mkdir(parents=True,exist_ok=True)
palette=[]
for line in (ROOT/'godot-arcana/art/source/arcana-world-64.gpl').read_text().splitlines():
    p=line.split()
    if len(p)>=3 and all(s.isdigit() for s in p[:3]): palette.append(tuple(map(int,p[:3])))
# Shared world colors, deliberately restrained for the small heroine.
indices=[1,2,3,4,5,6,7,11,12,14,15,16,18,24,28,30,31,50,51,52,53,58,59,60]
colors=np.array([palette[i] for i in indices],dtype=float)
lut=Image.open(ROOT/'godot-arcana/art/export/arcana-palette-lut.png').convert('RGB')
def final_color(rgb):
    r,g,b=[int(math.floor(float(v)*31/255+.5)) for v in rgb]
    return lut.getpixel((b*32+r,g))
# Explicit fixed points survive the existing presentation LUT, avoiding a second shift.
colors=np.array(list(dict.fromkeys(final_color(c) for c in colors)),dtype=float)
def c(index): return tuple(final_color(palette[index]))
rules_path=SOURCE/'face-retouch.json'
rules=json.loads(rules_path.read_text(encoding='utf8')) if rules_path.exists() else {}
INK=tuple(rules.get('ink',c(2)))
LASH=tuple(rules.get('lash',c(1)))
IRIS=tuple(rules.get('iris',c(58)))
LIGHT=tuple(rules.get('iris_light',c(60)))
CATCH=tuple(rules.get('catchlight',c(7)))
BLUSH=tuple(rules.get('blush',c(51)))
MOUTH=tuple(rules.get('mouth',c(50)))

def finish(record):
    image=Image.open(BAKE/'raw'/record['file']).convert('RGBA')
    pixels=np.array(image)
    a=pixels[:,:,3]>=128
    flat=pixels[:,:,:3].astype(float)
    lit=np.array(Image.open(BAKE/'raw'/('lit_'+record['file'])).convert('RGBA'))[:,:,:3].astype(float)
    rgb=flat*.85+lit*.15
    distance=((rgb[:,:,None,:]-colors[None,None,:,:])**2*np.array([.30,.59,.11])).sum(axis=3)
    result=colors[distance.argmin(axis=2)].astype(np.uint8)
    names=list(metadata['material_colors'])
    material_colors=np.array(list(metadata['material_colors'].values()),dtype=float)
    material=((flat[:,:,None,:]-material_colors[None,None,:,:])**2).sum(axis=3).argmin(axis=2)
    shade=np.clip(lit.sum(axis=2)/np.maximum(1,flat.sum(axis=2)),0,1)
    # Art-directed, material-specific toon ramps retain pale hair/skin and blue cloth.
    ramps={
        'Pearl_white_hair':[5,6,7], 'White_hair_glints':[6,7,7],
        'Bob_underlayer':[4,5,6], 'Cape_periwinkle':[28,30,31],
        'Blue_collar_edge':[28,30,31], 'Dress_ivory':[12,14,15],
        'Dress_floral_hem':[11,14,15], 'Pearl_skin':[52,53,14],
    }
    bands=np.where(shade<.46,0,np.where(shade<.67,1,2))
    for name,ramp in ramps.items():
        mask=(material==names.index(name))&a
        result[mask]=np.array([c(i) for i in ramp],dtype=np.uint8)[bands[mask]]
    result[~a]=0
    image=Image.fromarray(np.dstack([result,a.astype(np.uint8)*255]),'RGBA')
    draw=ImageDraw.Draw(image)
    # Projected from actual animated head landmarks, so retouch moves with the skeleton.
    d=record['direction']
    frontal=rules.get('frontal_directions',[0,1,7])
    profile=rules.get('profile_directions',[2,6])
    if d in frontal+profile:
        points=record['landmarks']
        eyes=['eye_l','eye_r'] if d in frontal else (['eye_l'] if d==2 else ['eye_r'])
        for key in eyes:
            x,y=[int(round(v-.5)) for v in points[key]]
            if not (2<=x<61 and 2<=y<77) or not a[y,x]: continue
            # Three-pixel almond, cool iris, single bright catchlight.
            draw.line((x-int(rules.get('eye_width',3))//2,y-1,x+int(rules.get('eye_width',3))//2,y-1),fill=(*LASH,255))
            draw.point((x-1,y),fill=(*CATCH,255))
            draw.point((x,y),fill=(*IRIS,255))
            draw.point((x+1,y),fill=(*IRIS,255))
            draw.point((x,y+1),fill=(*LIGHT,255))
            draw.point((x-1,y+1),fill=(*BLUSH,255))
        x,y=[int(round(v-.5)) for v in points['mouth']]
        if a[y,x] and d in frontal: draw.point((x,y),fill=(*MOUTH,255))
    # Four-connected, external-only ink; keep all internal face/cloth colors intact.
    arr=np.array(image); mask=arr[:,:,3]>0
    expanded=mask.copy()
    expanded[1:]|=mask[:-1]; expanded[:-1]|=mask[1:]
    expanded[:,1:]|=mask[:,:-1]; expanded[:,:-1]|=mask[:,1:]
    border=expanded&~mask
    arr[border,:3]=INK
    arr[border,3]=255
    return Image.fromarray(arr,'RGBA')

atlas=Image.new('RGBA',(1024,480))
sheet=Image.new('RGBA',(64*12,80*8),(0,0,0,0))
finished=[]
masters=[]
for record in metadata['frames']:
    image=finish(record)
    index=record['direction']*12+(record['frame'] if record['animation']=='idle' else 4+record['frame'])
    cell=[index%16,index//16]
    atlas.paste(image,(cell[0]*64,cell[1]*80))
    sheet.paste(image,((index%12)*64,record['direction']*80))
    record['atlas_cell']=cell
    record['bounds']=image.getbbox()
    finished.append(image)
    if record['animation']=='idle' and record['frame']==0:
        if record['direction'] in (0,1): masters.append(image)
        image.save(SOURCE/f"master-{record['heading'].lower()}.png")
# Readability preview uses integer enlargement of the real 64x80 frames.
preview=Image.new('RGB',(64*6*2,80*6),(107,128,153))
for i,image in enumerate(masters):
    preview.paste(image.resize((384,480),Image.Resampling.NEAREST),(i*384,0),image.resize((384,480),Image.Resampling.NEAREST))
preview.save(SOURCE/'bake-preview.png')
if len(metadata['frames'])!=96:
    print('Preview only: '+str(SOURCE/'bake-preview.png'))
    sys.exit(0)
for record,image in zip(metadata['frames'],finished):
    arr=np.array(image)
    assert set(np.unique(arr[:,:,3])).issubset({0,255})
    assert image.getbbox()[0]>0 and image.getbbox()[2]<64, record['file']
    assert image.getbbox()[1]>0 and image.getbbox()[3]<80, record['file']
    for rgb in np.unique(arr[:,:,:3][arr[:,:,3]>0],axis=0):
        assert final_color(rgb)==tuple(rgb), ('LUT changes sprite color',rgb)
output=ROOT/'godot-arcana/art/export/heroine-pixel.png'
atlas.save(output,optimize=True)
sheet.save(SOURCE/'heroine-directions.png',optimize=True)
walk_y=[r['ankles']['L'][1] for r in metadata['frames'] if r['animation']=='walk' and r['direction']==0]
# A full cycle covers twice the stance foot's fore/aft excursion.
# world.gd accumulates gait by .20 per map pixel; 16 map pixels = one 3D unit.
gait_cycle=max(.5,2*(max(walk_y)-min(walk_y))*16*.20)
metadata.update(palette=[list(map(int,rgb)) for rgb in colors],atlas_size=[1024,480],
    atlas_columns=16,clips={'idle':{'count':4,'fps':2},'walk':{'count':8,'gait_cycle':gait_cycle}},
    game_texture='art/export/heroine-pixel.png',
    retouch='head-bone projected 3px eyes, violet iris, blush, 1px mouth; 4-connected external ink',
    rgba_bytes=1024*480*4,source_texture_bytes=output.stat().st_size)
(SOURCE/'heroine-sprites.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf8')
# Rules kept separately for editing/rebaking without touching the illustration.
(SOURCE/'face-retouch.json').write_text(json.dumps(dict(eye_width=rules.get('eye_width',3),frontal_directions=rules.get('frontal_directions',[0,1,7]),
    profile_directions=rules.get('profile_directions',[2,6]),ink=list(INK),lash=list(LASH),iris=list(IRIS),
    iris_light=list(LIGHT),catchlight=list(CATCH),blush=list(BLUSH),mouth=list(MOUTH)),indent=2)+'\n',encoding='utf8')
print(json.dumps(dict(frames=len(finished),atlas=[1024,480],palette=len(colors),
    idle_heights=[r['bounds'][3]-r['bounds'][1] for r in metadata['frames'] if r['frame']==0 and r['animation']=='idle'],
    rgba_mib=metadata['rgba_bytes']/1024**2,png_bytes=output.stat().st_size)))


spec=ROOT/'godot-arcana/art/resources/heroine_sprite_spec.gd'
spec.write_text("""# Generated by scripts/finish-heroine-sprites.py; do not edit independently.
extends RefCounted
const FRAME_SIZE = Vector2i(64,80)
const FOOT = Vector2i(32,72)
const ATLAS_GRID = Vector2i(16,6)
const PIXELS_PER_UNIT = %.12f
const SOURCE_HEIGHT = 56
const GAIT_CYCLE = %.12f
""" % (metadata['pixels_per_unit'],gait_cycle),encoding='utf8')
import hashlib
resource='res://art/export/heroine-pixel.png'
cache='res://.godot/imported/heroine-pixel.png-'+hashlib.md5(resource.encode()).hexdigest()+'.ctex'
import_file=output.with_suffix('.png.import')
# Disable automatic 3D texture conversion; it otherwise re-enables mipmaps/VRAM loss.
if not import_file.exists():
    import_file.write_text('[remap]\nimporter="texture"\ntype="CompressedTexture2D"\npath="'+cache+'"\nmetadata={"vram_texture":false}\n\n[deps]\nsource_file="'+resource+'"\ndest_files=["'+cache+'"]\n\n[params]\ncompress/mode=0\nmipmaps/generate=false\nprocess/fix_alpha_border=false\ndetect_3d/compress_to=0\n',encoding='utf8')

walk_frames=[]
for frame in range(8):
    source=finished[4+frame]
    preview_frame=Image.new('RGB',(128,160),(107,128,153))
    large=source.resize((128,160),Image.Resampling.NEAREST)
    preview_frame.paste(large,(0,0),large)
    walk_frames.append(preview_frame)
walk_frames[0].save(SOURCE/'walk-front.gif',save_all=True,append_images=walk_frames[1:],duration=100,loop=0)
