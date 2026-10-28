"""Package the approved generated sheet as registered sprites and editable PixelPen clips.
No in-between frames are invented: the eight supplied poses are used verbatim.
"""
from pathlib import Path
from PIL import Image
import json, zipfile, math
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'art-studies/arcana-hero/white-bob-heroine/pixel-run-v1/run-sheet-draft.png'
OUT=ROOT/'godot-arcana/art/source/heroine/run-v1'
EXPORT=ROOT/'godot-arcana/art/export/heroine-run-v1'
DIRS=['s','se','e','ne','n','nw','w','sw']
W,H=96,136
# Shared across every pose, including the matching idle master.
PALETTE=['#302442','#493c57','#635469','#82738a','#a59aab','#c4bcc7','#ded9de','#f6f0df','#fff9e8','#dfd3bc','#baad9d','#978c89','#ffe6cf','#edc3b1','#cc968e','#a16b78','#9ebbd8','#7f9fc3','#6585ae','#4b668e','#394c70','#293a59','#192943','#b7a3d8','#8971bb','#61469a','#d4b77b','#a58958','#74646b','#554a5b','#3a3447','#232333']
RGB=[tuple(bytes.fromhex(c[1:])) for c in PALETTE]
for p in [OUT,EXPORT,OUT/'frames',OUT/'pixelpen',OUT/'preview']: p.mkdir(parents=True,exist_ok=True)
source=Image.open(SOURCE).convert('RGBA')
# Alpha threshold also removes the semi-transparent generated fringe.
def clean(im):
    im=im.copy(); px=im.load()
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if a<192 or (r>165 and b>135 and g<90): px[x,y]=(0,0,0,0)
            else: px[x,y]=(r,g,b,255)
    # Reject disconnected fragments spilling from a neighbouring cell.
    seen=set(); groups=[]
    for y in range(im.height):
        for x in range(im.width):
            if (x,y) in seen or px[x,y][3]==0:continue
            stack=[(x,y)];seen.add((x,y));group=[]
            while stack:
                xx,yy=stack.pop();group.append((xx,yy))
                for dx,dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]:
                    nx,ny=xx+dx,yy+dy
                    if 0<=nx<im.width and 0<=ny<im.height and (nx,ny) not in seen and px[nx,ny][3]>0:
                        seen.add((nx,ny));stack.append((nx,ny))
            groups.append(group)
    if groups:
        keep=set(max(groups,key=len))
        for group in groups:
            if group and group[0] not in keep:
                for x,y in group:px[x,y]=(0,0,0,0)
    return im
cache={}
def indexed(im):
    indices=bytearray(W*H); result=Image.new('RGBA',(W,H)); dest=result.load()
    for y in range(H):
        for x in range(W):
            r,g,b,a=im.getpixel((x,y))
            if a==0:continue
            key=(r,g,b)
            if key not in cache:cache[key]=min(range(len(RGB)),key=lambda i:sum((key[k]-RGB[i][k])**2 for k in range(3)))
            i=cache[key];indices[y*W+x]=i+1;dest[x,y]=RGB[i]+(255,)
    return result,bytes(indices)
frames=[];indices=[];records=[]
# One common scale, never a separate stretch for individual limbs or poses.
scale=106/(source.height/8)
for row,d in enumerate(DIRS):
    for col in range(8):
        bounds=(round(col*source.width/8),round(row*source.height/8),round((col+1)*source.width/8),round((row+1)*source.height/8))
        crop=clean(source.crop(bounds)); box=crop.getbbox()
        if box is None:raise ValueError(f'Empty frame {d}/{col}')
        cut=crop.crop(box)
        cut=cut.resize((max(1,round(cut.width*scale)),max(1,round(cut.height*scale))),Image.Resampling.NEAREST)
        canvas=Image.new('RGBA',(W,H))
        # Intentional small airborne lift; frame origins remain identical.
        lift=[0,0,1,2,0,0,1,2][col]
        position=(48-cut.width//2,116-cut.height-lift)
        canvas.alpha_composite(cut,position)
        image,data=indexed(canvas);frames.append(image);indices.append(data)
        image.save(OUT/'frames'/f'run-{d}-{col:02}.png')
        records.append({'direction':d,'frame':col,'source_rect':bounds,'placement':list(position),'foot':[48,116]})
# No independent idle was supplied: hold the least airborne source pose.
idle_frames=[frames[d*8+1] for d in range(8)]
idle_frames[0].save(OUT/'idle-front.png')
all_frames=frames+idle_frames
atlas=Image.new('RGBA',(W*8,H*9))
for i,im in enumerate(all_frames):atlas.alpha_composite(im,((i%8)*W,(i//8)*H))
atlas.save(EXPORT/'heroine-run.png')
# Godot native SpriteFrames: eight looping run clips plus directional stills.
lines=['[gd_resource type="SpriteFrames" load_steps=74 format=3]','', '[ext_resource type="Texture2D" path="res://art/export/heroine-run-v1/heroine-run.png" id="1"]','']
for i in range(72):lines += [f'[sub_resource type="AtlasTexture" id="F{i}"]','atlas = ExtResource("1")',f'region = Rect2({i%8*W}, {i//8*H}, {W}, {H})','']
clips=[]
for d,name in enumerate(DIRS):
    for kind,ids,fps in [('run',range(d*8,d*8+8),14),('idle',[64+d],1)]:
        cells=', '.join('{"duration": 1.0, "texture": SubResource("F%d")}'%i for i in ids)
        clips.append('{"frames": [%s], "loop": true, "name": &"%s_%s", "speed": %.1f}'%(cells,kind,name,fps))
lines += ['[resource]','animations = ['+',\n'.join(clips)+']','']
(EXPORT/'heroine-run.tres').write_text('\n'.join(lines),encoding='utf-8')
# Native PixelPen v1.1.4 file format. Separate direction projects loop correctly.
def uid(i):return f'Vector3i({i}, 281026, 1)'
def make_project(name,frame_ids):
    path=OUT/'pixelpen'/f'run-{name}.pxpen'; pools=[];timeline=[]
    for n,i in enumerate(frame_ids):
        pools.append({'frame_uid':uid(n*3+1),'layer_active_uid':uid(n*3+2),'layers':[{'layer_uid':uid(n*3+2),'label':f'run-{DIRS[i//8]}-{i%8:02}','size':'Vector2i(96, 136)','visible':True}]})
        timeline.append({'cell_uid':uid(n*3+3),'frame_uid':uid(n*3+1)})
    colors=['Color(0, 0, 0, 0)']+['Color(%s, %s, %s, 1)'%tuple(format(v/255,'.9f') for v in c) for c in RGB]
    cfg={'compatibility_version':3,'project_name':'Heroine run '+name,'file_path':path.as_posix(),'last_export_file_path':'','canvas_size':'Vector2i(96, 136)','palette':{'color_index':colors,'grid_color_index':list(range(1,len(colors)))},'pool_frames':pools,'canvas_pool_frame_uid':uid(1),'show_timeline':True,'animation_timeline':timeline,'animation_frame_index':0,'animation_fps':14.0,'animation_loop':True,'onion_skinning':True,'layer_index_counter':len(frame_ids),'active_layer_uid':uid(2),'use_sample':False,'_sample_offset':'Vector2i(0, 0)','_cache_canvas_size':'Vector2i(0, 0)','_cache_pool_frames':[],'_cache_canvas_pool_frame_uid':'Vector3i(0, 0, 0)','show_grid':False,'show_tile':False,'show_preview':True,'show_symetric_vertical':False,'show_symetric_horizontal':False,'symetric_guid':'Vector2(48, 68)','background_color':'0','uid_counter':len(frame_ids)*3}
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.json',json.dumps(cfg))
        for n,i in enumerate(frame_ids):z.writestr(f'pool_frames/{n*3+1}_281026_1.0.bin',indices[i])
for d,name in enumerate(DIRS):make_project(name,list(range(d*8,d*8+8)))
make_project('all-directions',list(range(64)))
# Review artifact: eight simultaneous direction loops at exact integer magnification.
previews=[]
for f in range(8):
    board=Image.new('RGBA',(W*4,H*2),'#8292a7')
    for d in range(8):board.alpha_composite(frames[d*8+f],((d%4)*W,(d//4)*H))
    previews.append(board.resize((W*8,H*4),Image.Resampling.NEAREST).convert('RGB'))
previews[0].save(OUT/'preview'/'run-8-directions.gif',save_all=True,append_images=previews[1:],duration=70,loop=0)
atlas.resize((W*16,H*18),Image.Resampling.NEAREST).save(OUT/'preview'/'atlas-2x.png')
meta={'source':str(SOURCE.relative_to(ROOT)),'size':[W,H],'foot':[48,116],'pixels_per_unit':64,'directions':DIRS,'run_frames':8,'run_cycle_map_units':20,'palette':PALETTE,'frames':records,'limitations':['Generated rear diagonals have weak separation from rear/side views.','Idles hold the second supplied run pose; independent standing frames were not supplied.','Fixed default outfit; alternate outfits retain the existing Blender renderer.']}
(OUT/'registration.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Packaged {len(frames)} run frames, 8 idles, 9 PixelPen projects; atlas {atlas.size}.')
