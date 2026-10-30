"""Motion authoring from shared directional paintings, with alternating planted feet.
Art remains indexed/editable in PixelPen; no frame blending or independently redrawn faces.
"""
from pathlib import Path
from PIL import Image,ImageDraw
import math,json,zipfile
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'godot-arcana/art/source/heroine/motion-v2'
EXPORT=ROOT/'godot-arcana/art/export/heroine-motion-v2'
DIRECTIONS=['s','se','e','ne','n','nw','w','sw'];W,H=96,136;COLUMNS=16
COLORS=json.loads((ROOT/'godot-arcana/art/source/heroine/run-v1/registration.json').read_text())['palette']
RGB=[tuple(bytes.fromhex(c[1:])) for c in COLORS];cache={}
for folder in [EXPORT,OUT/'frames',OUT/'pixelpen',OUT/'preview']:folder.mkdir(parents=True,exist_ok=True)

def quantize(im):
    out=Image.new('RGBA',(W,H));data=bytearray(W*H);px=out.load()
    for y in range(H):
        for x in range(W):
            r,g,b,a=im.getpixel((x,y))
            if a<128:continue
            key=(r,g,b)
            if key not in cache:cache[key]=min(range(len(RGB)),key=lambda i:sum((key[k]-RGB[i][k])**2 for k in range(3)))
            i=cache[key];px[x,y]=RGB[i]+(255,);data[y*W+x]=i+1
    return out,bytes(data)
def mix(a,b,t):return a+(b-a)*t
def smooth(t):return t*t*(3-2*t)
def project(x,forward,height,d):
    angle=d*math.pi/4
    return (48+x*math.cos(angle)+forward*math.sin(angle),116+(-x*math.sin(angle)+forward*math.cos(angle))*math.sqrt(.5)-height*math.sqrt(.5))
def capsule(draw,a,b,r,fill):
    dx,dy=b[0]-a[0],b[1]-a[1];length=max(.01,math.hypot(dx,dy));nx,ny=-dy/length*r,dx/length*r
    points=[(round(a[0]+nx),round(a[1]+ny)),(round(b[0]+nx),round(b[1]+ny)),(round(b[0]-nx),round(b[1]-ny)),(round(a[0]-nx),round(a[1]-ny))]
    draw.polygon(points,fill=fill)
    for point in [a,b]:draw.ellipse((round(point[0]-r),round(point[1]-r),round(point[0]+r),round(point[1]+r)),fill=fill)
def leg_pose(t):
    t%=1
    if t<.35:return 14-80*t,0,True
    u=(t-.35)/.65
    return mix(-14,14,smooth(u)),12*math.sin(math.pi*u),False

def hip_height(phase):
    t=phase%.5
    keys=[(0,34),(.08,32.5),(.30,34),(.40,36),(.50,34)]
    for (a,va),(b,vb) in zip(keys,keys[1:]):
        if a<=t<=b:return mix(va,vb,smooth((t-a)/(b-a)))
    return 34
def prepare_parts(master,d):
    body=master.copy();body.paste((0,0,0,0),(0,92,96,136));arms=[]
    # Keep boots from the actual painting; each leg owns a complete boot.
    if d in [2,6]:
        boot=master.crop((38,103,66,116));bbox=boot.getbbox();boot=boot.crop(bbox) if bbox else boot
        # Profile silhouettes overlap; use one complete boot-shaped painted region.
        if boot.width>15:boot=boot.crop((0 if d==6 else boot.width-15,0,15 if d==6 else boot.width,boot.height))
        boots=[boot,boot.copy()]
    else:
        boots=[]
        for bounds in [(32,103,48,116),(48,103,65,116)]:
            im=master.crop(bounds);box=im.getbbox();boots.append(im.crop(box) if box else Image.new('RGBA',(8,12)))
    return body,arms,boots

def pose(master,parts,d,phase,amount=1,stop=False,start=False):
    body,arms,boots=parts
    if amount<=0:return master.copy(),[]
    hip=mix(34,hip_height(phase),amount);bob=round(-(hip-34)*math.sqrt(.5));theta=d*math.pi/4
    rendered=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(rendered);leg_info=[]
    leg_records=[]
    for leg in range(2):
        local=(phase+leg*.5)%1
        forward,lift,support=leg_pose(local)
        if start:
            # Left foot pushes back from under the hips, right foot swings forward.
            forward=-12*amount if leg==0 else 12*smooth(amount)
            lift=0 if leg==0 else 7*math.sin(math.pi*amount)
            support=leg==0 or amount>=.999
        else:forward*=amount;lift*=amount
        lateral=-3.4 if leg==0 else 3.4
        ankle_height=6+lift;dx=forward;dy=ankle_height-hip
        reach=max(.01,math.hypot(dx,dy));a=(18**2-16**2+reach**2)/(2*reach);bend=math.sqrt(max(0,18**2-a*a));ux,uy=dx/reach,dy/reach
        knee_f=a*ux+bend*(-uy);knee_h=hip+a*uy+bend*ux
        hip_point=project(lateral,0,hip,d);knee=project(lateral,knee_f,knee_h,d);ankle=project(lateral,forward,ankle_height,d);foot=project(lateral,forward,lift,d)
        depth=-lateral*math.sin(theta)+forward*math.cos(theta)
        leg_records.append((depth,leg,hip_point,knee,ankle,foot,support,forward,lift))
    for depth,leg,hp,knee,ankle,foot,support,forward,lift in sorted(leg_records):
        far=(leg==0) if math.sin(theta)>=0 else (leg==1)
        outline=RGB[0]+(255,);base=RGB[2 if far else 3]+(255,);highlight=RGB[3 if far else 4]+(255,)
        capsule(draw,hp,knee,3.1,outline);capsule(draw,knee,ankle,2.6,outline)
        capsule(draw,hp,knee,2.1,base);capsule(draw,knee,ankle,1.6,base)
        draw.line([(round(hp[0]-1),round(hp[1])),(round(knee[0]-1),round(knee[1]))],fill=highlight,width=1)
        boot=boots[leg]
        rendered.alpha_composite(boot,(round(foot[0]-boot.width/2),round(foot[1]-boot.height)))
        leg_info.append({'leg':leg,'support':support,'forward':round(forward,4),'lift':round(lift,4),'hip':hp,'knee':knee,'ankle':ankle,'foot':foot,'bone_lengths':[18,16]})
    # Preserve the approved running painting; new anatomy sits under its hem.
    if amount>=.5 and d not in [3,5]:
        key=int(phase*8)%8
        body=Image.open(ROOT/'godot-arcana/art/source/heroine/run-v1/frames'/f'run-{DIRECTIONS[d]}-{key:02}.png').convert('RGBA')
        body.paste((0,0,0,0),(0,92,96,136))
        # Remove the old stocking remnants under high skirt poses.
        for yy in range(84,92):
            for xx in range(36,61):
                r,g,b,a=body.getpixel((xx,yy))
                if a and max(r,g,b)<135 and b<r*1.35:body.putpixel((xx,yy),(0,0,0,0))
        rendered.alpha_composite(body,(0,bob))
    else:
        body=master.copy();body.paste((0,0,0,0),(0,92,96,136))
        if d in [3,5] and amount>=.5:
            # The old rear diagonals face the wrong way. Use the correct back master
            # and move its two painted cuffs/hands in opposite projected directions.
            for side in [-1,1]:
                points=[(x,y) for y in range(73,88) for x in range(18,79) if (x<43 if side<0 else x>53) and body.getpixel((x,y))[:3] in RGB[12:16] and body.getpixel((x,y))[3]]
                if not points:continue
                left=min(x for x,y in points)-1;right=max(x for x,y in points)+2
                top=min(y for x,y in points)-3;bottom=max(y for x,y in points)+2
                hand=body.crop((left,top,right,bottom));body.paste((0,0,0,0),(left,top,right,bottom))
                swing=side*math.cos(phase*math.tau)*2
                dx=round(swing*math.sin(theta));dy=round(swing*math.cos(theta)*math.sqrt(.5))
                bridge=ImageDraw.Draw(body);bridge.line([(round((left+right)/2),top),(round((left+right)/2)+dx,top+dy+2)],fill=RGB[7]+(255,),width=3)
                body.alpha_composite(hand,(left+dx,top+dy))
        rendered.alpha_composite(body,(0,bob))
    return rendered,leg_info

all_frames=[];clips=[];audit=[]
for d,name in enumerate(DIRECTIONS):
    master=Image.open(OUT/f'idle-{name}.png').convert('RGBA');parts=prepare_parts(master,d)
    specs=[('idle',[(0,0,False)],2),('run',[(i/12,1,False) for i in range(12)],20),('start',[(0,a,True) for a in [.18,.55,1]],20),('stop_left',[(.175,a,False) for a in [.7,.35,0]],20),('stop_right',[(.675,a,False) for a in [.7,.35,0]],20)]
    for kind,poses,fps in specs:
        ids=[]
        for f,(phase,amount,start) in enumerate(poses):
            image,legs=pose(master,parts,d,phase,amount,start=start)
            image,data=quantize(image);ids.append(len(all_frames));all_frames.append((image,data))
            image.save(OUT/'frames'/f'{kind}-{name}-{f:02}.png')
            audit.append({'clip':kind+'_'+name,'frame':f,'phase':phase,'amount':amount,'legs':legs})
        clips.append({'name':kind+'_'+name,'ids':ids,'fps':fps,'loop':kind in ['idle','run']})
# Flat frames stay editable. Runtime clips and PixelPen share this exact index order.
atlas=Image.new('RGBA',(COLUMNS*W,math.ceil(len(all_frames)/COLUMNS)*H))
for i,(image,data) in enumerate(all_frames):atlas.alpha_composite(image,((i%COLUMNS)*W,(i//COLUMNS)*H))
atlas.save(EXPORT/'heroine-motion.png')
lines=[f'[gd_resource type="SpriteFrames" load_steps={len(all_frames)+2} format=3]','', '[ext_resource type="Texture2D" path="res://art/export/heroine-motion-v2/heroine-motion.png" id="1"]','']
for i in range(len(all_frames)):lines += [f'[sub_resource type="AtlasTexture" id="F{i}"]','atlas = ExtResource("1")',f'region = Rect2({i%COLUMNS*W}, {i//COLUMNS*H}, {W}, {H})','']
blocks=[]
for clip in clips:
    frames=', '.join('{"duration": 1.0, "texture": SubResource("F%d")}'%i for i in clip['ids'])
    blocks.append('{"frames": [%s], "loop": %s, "name": &"%s", "speed": %.1f}'%(frames,str(clip['loop']).lower(),clip['name'],clip['fps']))
lines+=['[resource]','animations = ['+',\n'.join(blocks)+']',''];(EXPORT/'heroine-motion.tres').write_text('\n'.join(lines),encoding='utf-8')

def uid(i):return f'Vector3i({i}, 281026, 2)'
for clip in clips:
    pools=[];timeline=[];path=OUT/'pixelpen'/(clip['name']+'.pxpen')
    for n,i in enumerate(clip['ids']):
        pools.append({'frame_uid':uid(n*3+1),'layer_active_uid':uid(n*3+2),'layers':[{'layer_uid':uid(n*3+2),'label':clip['name']+f'-{n:02}','size':'Vector2i(96, 136)','visible':True}]});timeline.append({'cell_uid':uid(n*3+3),'frame_uid':uid(n*3+1)})
    colors=['Color(0, 0, 0, 0)']+['Color(%s, %s, %s, 1)'%tuple(format(v/255,'.9f') for v in c) for c in RGB]
    cfg={'compatibility_version':3,'project_name':'Heroine '+clip['name'],'file_path':path.as_posix(),'last_export_file_path':'','canvas_size':'Vector2i(96, 136)','palette':{'color_index':colors,'grid_color_index':list(range(1,len(colors)))},'pool_frames':pools,'canvas_pool_frame_uid':uid(1),'show_timeline':True,'animation_timeline':timeline,'animation_frame_index':0,'animation_fps':float(clip['fps']),'animation_loop':clip['loop'],'onion_skinning':True,'layer_index_counter':len(pools),'active_layer_uid':uid(2),'use_sample':False,'_sample_offset':'Vector2i(0, 0)','_cache_canvas_size':'Vector2i(0, 0)','_cache_pool_frames':[],'_cache_canvas_pool_frame_uid':'Vector3i(0, 0, 0)','show_grid':False,'show_tile':False,'show_preview':True,'show_symetric_vertical':False,'show_symetric_horizontal':False,'symetric_guid':'Vector2(48, 68)','background_color':'0','uid_counter':len(pools)*3}
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('config.json',json.dumps(cfg))
        for n,i in enumerate(clip['ids']):z.writestr(f'pool_frames/{n*3+1}_281026_2.0.bin',all_frames[i][1])
meta={'size':[W,H],'grid':[COLUMNS,math.ceil(len(all_frames)/COLUMNS)],'foot':[48,116],'cycle_map_units':20,'clips':clips,'directions':DIRECTIONS,'palette':COLORS,'source':'idle-masters.png','authoring':'Approved running upper paintings preserved. Fixed-length two-bone legs; stance .35 cycle; alternating .5-phase feet. Complete painted directional boots. Independent neutral masters.'}
(OUT/'motion.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8');(OUT/'gait-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
(EXPORT/'motion.json').write_text(json.dumps(meta,ensure_ascii=False),encoding='utf-8')
# Compact review boards for actual poses, not frame-count claims.
for d in [0,2]:
    run=next(c for c in clips if c['name']=='run_'+DIRECTIONS[d]);board=Image.new('RGBA',(W*6,H*2),'#8292a7');animation=[]
    for n,i in enumerate(run['ids']):
        board.alpha_composite(all_frames[i][0],((n%6)*W,(n//6)*H));frame=Image.new('RGBA',(W,H),'#8292a7');frame.alpha_composite(all_frames[i][0]);animation.append(frame.resize((384,544),Image.Resampling.NEAREST).convert('RGB'))
    board.resize((W*12,H*4),Image.Resampling.NEAREST).save(OUT/'preview'/f'run-{DIRECTIONS[d]}-poses.png')
    animation[0].save(OUT/'preview'/f'run-{DIRECTIONS[d]}.gif',save_all=True,append_images=animation[1:],duration=50,loop=0)
print(f'Prepared {len(all_frames)} motion frames in {len(clips)} editable PixelPen clips. Not applied yet.')
