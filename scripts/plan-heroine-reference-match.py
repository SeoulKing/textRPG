"""Use the displayed approved sheet as whole-frame PixelPen paint, not head stamps.

Keep a common 32-colour budget, trained on that sheet instead of an unrelated palette.
The actual .pxpen writes are performed by installed PixelPen's native API.
"""
import importlib.util,json,statistics
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SOURCE=c.BASE/'fullbody-v8';DEST=c.BASE/'reference-match-v9'
for folder in [DEST/'plans',DEST/'pixelpen',DEST/'native-frames',DEST/'preview',DEST/'registered-reference']:
    folder.mkdir(parents=True,exist_ok=True)
sheet_path=c.ROOT/'art-studies/arcana-hero/white-bob-heroine/pixel-run-v1/run-sheet-draft.png'
sheet=Image.open(sheet_path).convert('RGBA');scale=106/(sheet.height/8)


def clean(im):
    data=list(im.getdata());w,h=im.size
    valid={i for i,(r,g,b,a) in enumerate(data) if a>=192 and not(r>165 and b>135 and g<90)}
    groups=[]
    while valid:
        start=valid.pop();todo=[start];group=[start]
        while todo:
            i=todo.pop();x,y=i%w,i//w
            for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                nx,ny=x+dx,y+dy;j=ny*w+nx
                if 0<=nx<w and 0<=ny<h and j in valid:valid.remove(j);todo.append(j);group.append(j)
        groups.append(group)
    keep=set(max(groups,key=len));result=Image.new('RGBA',im.size)
    result.putdata([data[i][:3]+(255,) if i in keep else (0,0,0,0) for i in range(w*h)])
    return result.crop(result.getbbox())


raw={};positions={};opaque=[]
for row,direction in enumerate(c.DIRS):
    for n in range(8):
        box=(round(n*sheet.width/8),round(row*sheet.height/8),round((n+1)*sheet.width/8),round((row+1)*sheet.height/8))
        cut=clean(sheet.crop(box));cut=cut.resize((round(cut.width*scale),round(cut.height*scale)),Image.Resampling.NEAREST)
        pos=(48-cut.width//2,116-cut.height-[0,0,1,2,0,0,1,2][n])
        image=Image.new('RGBA',(96,136));image.alpha_composite(cut,pos);raw[(direction,n)]=image
        image.save(DEST/'registered-reference'/f'run_{direction}-{n:02}.png')
        positions[(direction,n)]={'source_rect':box,'placement':pos}
        opaque.extend(p[:3] for p in image.getdata() if p[3])
# Derive one shared palette from the approved character, without adding colours.
def sampled_palette(samples,count):
    training=Image.new('RGB',(len(samples),1));training.putdata(samples)
    quantized=training.quantize(colors=count,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    return [tuple(quantized.getpalette()[i*3:i*3+3]) for i in range(count)]
# Protect the identity colours that a global median cut otherwise discards:
# violet irises, warm skin, blue cloth and gold. The other20 colours cover the outfit.
skin_samples=[]
for n in range(8):
    im=raw[('s',n)]
    skin_samples.extend((r,g,b) for y in range(47,53) for x in range(36,62)
                        for r,g,b,a in [im.getpixel((x,y))]
                        if a and r>180 and g>110 and b>85 and r-g>12 and 0<g-b<50)
im=raw[('s',1)]
violet_samples=[(r,g,b) for y in range(41,48) for x in range(37,57)
                for r,g,b,a in [im.getpixel((x,y))] if a and b>95 and b>r*1.2 and b>g*1.5]
blue_samples=[(r,g,b) for r,g,b in opaque if b>r*1.12 and g>r*1.1 and b>90]
gold_samples=[(r,g,b) for r,g,b in opaque if r>160 and r>g*1.05 and g-b>40]
rgb=(sampled_palette(opaque,20)+sampled_palette(skin_samples,5)+sampled_palette(violet_samples,3)
     +sampled_palette(blue_samples,2)+sampled_palette(gold_samples,2))
palette=Image.new('P',(1,1));palette.putpalette([v for color in rgb for v in color]+list(rgb[-1])*(256-32))
skin=min(range(32),key=lambda i:sum((rgb[i][k]-(237,195,177)[k])**2 for k in range(3)))+1


def indexed(image):
    indices=list(image.convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE).getdata())
    alpha=list(image.getchannel('A').getdata())
    return bytearray(min(v,31)+1 if a>=128 else 0 for v,a in zip(indices,alpha))


def render(data):
    result=Image.new('RGBA',(96,136));result.putdata([rgb[v-1]+(255,) if v else (0,0,0,0) for v in data]);return result


new_palette=['#'+''.join(f'{v:02x}' for v in color) for color in rgb]
old_meta=json.loads((SOURCE/'registration.json').read_text());anchors={(f['clip'],f['frame']):f for f in old_meta['frames']}
plans=[];records=[];targets={}
for path in sorted((SOURCE/'pixelpen').glob('*.pxpen')):
    kind,direction=path.stem.split('_');_,frames=c.native(path);edits=[]
    for n,frame in enumerate(frames):
        # Every run frame is the complete approved drawing, including its own head,
        # neck, clothes, legs, hands, original facing, and natural pose differences.
        source_direction={'nw':'ne','w':'e','sw':'se'}.get(direction,direction)
        if kind=='run':
            reference=raw[(source_direction,n)]
            if source_direction!=direction:
                reflected=Image.new('RGBA',(96,136));reflected.alpha_composite(ImageOps.mirror(reference),(1,0));reference=reflected
            reference.save(DEST/'registered-reference'/f'run_{direction}-{n:02}.png')
            final=indexed(reference)
        else:final=indexed(c.image(frame))
        if kind!='run':
            anchor=anchors[(path.stem,n)];dx,dy=anchor['head_offset'];seat=anchor['seat_offset']
            facing={'sw':'se','w':'e'}.get(direction,direction)
            if facing in {'s':1,'se':1,'e':1}:
                left,top,right,bottom={'s':(35,32,63,59),'se':(43,33,69,59),'e':(54,32,70,58)}[facing]
                for y in range(top,bottom):
                    for x in range(left,right):
                        xx=96-x if direction in ['sw','w'] else x;i=(y+seat+dy)*96+xx+dx
                        if frame[i] in [13,14,15]:
                            original=c.RGB[frame[i]][:3]
                            final[i]=min(range(20,25),key=lambda p:sum((rgb[p][k]-original[k])**2 for k in range(3)))+1
            for left,top,right,bottom in {'s':[(37,41,44,48),(49,41,56,48)],'se':[(48,42,57,50),(60,41,68,49)],'e':[(60,41,68,48)]}.get(facing,[]):
                for y in range(top,bottom):
                    for x in range(left,right):
                        xx=96-x if direction in ['sw','w'] else x;i=(y+seat+dy)*96+xx+dx
                        if frame[i] in [24,25,26]:final[i]={24:26,25:27,26:28}[frame[i]]
        if kind=='run':
            facing={'w':'e','sw':'se'}.get(direction,direction)
            boxes={'s':(42,47,55,53),'se':(55,47,65,53),'e':(60,47,68,53)}
            if facing in boxes:
                l,t,r,b=boxes[facing]
                for y in range(t,b):
                    for x in range(l,r):
                        xx=96-x if direction in ['w','sw'] else x;i=y*96+xx
                        if not final[i]:continue
                        red,green,blue=rgb[final[i]-1]
                        # Only the previously rejected yellow/gold nasal flecks.
                        if green-blue>red-green+12 and red>160:final[i]=skin
            anchor={'clip':path.stem,'frame':n,'head_offset':[0,0],'seat_offset':0,'whole_reference_frame':True,
                    'source_direction':source_direction,'mirrored':source_direction!=direction,**positions[(source_direction,n)]}
        else:anchor={**anchors[(path.stem,n)],'whole_reference_frame':False}
        targets[(path.stem,n)]=final;records.append(anchor)
        for i,(a,b) in enumerate(zip(frame,final)):
            if a!=b:edits.append({'frame':n,'x':i%96,'y':i//96,'expected':a,'index':b})
    plan={'source':path.as_posix(),'output':(DEST/'pixelpen'/path.name).as_posix(),
          'export_dir':(DEST/'native-frames'/path.stem).as_posix(),'palette':new_palette,'edits':edits}
    p=DEST/'plans'/(path.stem+'.json');text=json.dumps(plan,separators=(',',':'))
    changed=not p.exists() or p.read_text()!=text or not Path(plan['output']).exists()
    p.write_text(text,encoding='utf-8')
    if changed:plans.append(p.as_posix())
(DEST/'plans/batch.json').write_text(json.dumps({'plans':plans}),encoding='utf-8')
(DEST/'registration.json').write_text(json.dumps({'source':str(sheet_path.relative_to(c.ROOT)),
    'palette':new_palette,'palette_policy':'32 shared colours sampled from approved original; no generic palette',
    'skin_base':new_palette[skin-1],'run_policy':'complete approved source pose; no replacement head','frames':records},indent=2),encoding='utf-8')
board=Image.new('RGBA',(96*3,136),'#8292a7');draw=ImageDraw.Draw(board)
_,old=c.native(SOURCE/'pixelpen/run_s.pxpen')
for col,(label,image) in enumerate([('SOURCE',raw[('s',1)]),('CURRENT',c.image(old[1])),('PIXELPEN PLAN',render(targets[('run_s',1)]))]):
    board.alpha_composite(image,(col*96,0));draw.text((col*96+2,123),label,fill='white')
board.resize((864,408),Image.Resampling.NEAREST).save(DEST/'preview/source-current-corrected.png')
print('Prepared approved-source native plans:',len(plans),'clips /',len(records),'frames; palette:',len(rgb),'colours.')
