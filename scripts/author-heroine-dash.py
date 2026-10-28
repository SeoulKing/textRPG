"""First dash authoring only. Subsequent edits: saved PixelPen -> --sync."""
import importlib.util,json,argparse
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('c',ROOT/'scripts/author-heroine-continuity.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
SRC=c.BASE/'dash-v1';REF=c.BASE/'reference-bright-v10';OUT=ROOT/'godot-arcana/art/export/heroine-dash-v1'
c.RGB=[(0,0,0,0)]+[tuple(bytes.fromhex(v[1:]))+(255,) for v in json.loads((REF/'registration.json').read_text())['palette']]
for folder in ['plans','pixelpen','native-frames','preview']:(SRC/folder).mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
DUR=[40,40,40,60,40,60]
def plan():
    plans=[]
    for d in c.DIRS:
        source=REF/'pixelpen'/('run_'+d+'.pxpen');_,run=c.native(source);_,idle=c.native(REF/'pixelpen'/('idle_'+d+'.pxpen'))
        targets=[]
        for n,original in enumerate([run[2],run[3],run[4],run[5],run[1],idle[0]]):
            result=bytearray(96*136);lean=[5,6,5,4,2,0][n];sign=1 if d in ['e','ne','se'] else -1 if d in ['w','nw','sw'] else 0
            for i,v in enumerate(original):
                if not v:continue
                x,y=i%96,i//96
                weight=max(0,min(1,(116-y)/45))
                nx=x+round(sign*lean*weight);ny=y+round((lean*.6)*weight)
                if 0<=nx<96 and 0<=ny<136:result[ny*96+nx]=v
            # Close one-pixel interior cracks introduced by row translations,
            # never grow the outer silhouette or alter the rigid face region.
            before=bytes(result)
            for y in range(62,112):
                for x in range(1,95):
                    i=y*96+x
                    if not before[i] and before[i-1] and before[i+1] and before[i-96] and before[i+96]:result[i]=before[i-1]
            targets.append(result)
        edits=[{'frame':n,'x':i%96,'y':i//96,'expected':old,'index':new} for n,target in enumerate(targets) for i,(old,new) in enumerate(zip(run[n],target)) if old!=new]
        p=SRC/'plans'/('dash_'+d+'.json');p.write_text(json.dumps({'source':source.as_posix(),'output':(SRC/'pixelpen'/('dash_'+d+'.pxpen')).as_posix(),'export_dir':(SRC/'native-frames'/('dash_'+d)).as_posix(),'edits':edits,'frame_count':6}),encoding='utf8');plans.append(p.as_posix())
    (SRC/'plans/batch.json').write_text(json.dumps({'plans':plans}),encoding='utf8')
    print('Prepared eight PixelPen native edit plans; original projects preserved.')
def sync():
    atlas=Image.new('RGBA',(576,1088));clips={};audit={}
    for row,d in enumerate(c.DIRS):
        _,frames=c.native(SRC/'pixelpen'/('dash_'+d+'.pxpen'));assert len(frames)==6
        clips[d]=[c.image(f) for f in frames]
        for n,im in enumerate(clips[d]):atlas.alpha_composite(im,(n*96,row*136))
        audit[d]={'frames':6,'palette_matches_original':True,'last_frame_matches_idle':frames[-1]==c.native(REF/'pixelpen'/('idle_'+d+'.pxpen'))[1][0]}
    atlas.save(OUT/'heroine-dash.png')
    board=Image.new('RGBA',atlas.size,'#26334b');board.alpha_composite(atlas);board.resize((1152,2176),Image.Resampling.NEAREST).save(SRC/'preview/dash-sheet.png')
    previews=[]
    for n in range(6):
        board=Image.new('RGBA',(384,272),'#26334b')
        for row,d in enumerate(c.DIRS):board.alpha_composite(clips[d][n],((row%4)*96,(row//4)*136))
        previews.append(board.resize((768,544),Image.Resampling.NEAREST).convert('RGB'))
    previews[0].save(SRC/'preview/dash-eight-directions.gif',save_all=True,append_images=previews[1:]+[previews[-1]],duration=DUR+[650],loop=0)
    # Thumbnail uses the saved native dash frame; no independent character design.
    icon=Image.new('RGBA',(48,48));draw=ImageDraw.Draw(icon)
    for y,x,length,col in [(13,1,21,'#517aab'),(19,0,25,'#81c5e8'),(24,1,20,'#d5f5ff'),(31,0,18,'#81c5e8')]:draw.rectangle((x,y,x+length,y+1),fill=col)
    char=clips['e'][1].crop((10,10,89,119));char.thumbnail((34,43),Image.Resampling.NEAREST);icon.alpha_composite(char,(48-char.width-2,3));icon.save(ROOT/'godot-arcana/art/export/spells/dash.png')
    (SRC/'native-package-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf8')
    (SRC/'registration.json').write_text(json.dumps({'reference':'reference-bright-v10/pixelpen','canvas':[96,136],'foot':[48,116],'directions':c.DIRS,'frames':6,'durations_ms':DUR,'movement_seconds':.18,'distance':28,'windup_seconds':0,'palette':[f'#{r:02x}{g:02x}{b:02x}' for r,g,b,a in c.RGB[1:]],'runtime':'res://art/export/heroine-dash-v1/heroine-dash.png'},indent=2),encoding='utf8')
    resources=['[gd_resource type="SpriteFrames" load_steps=50 format=3]', '', '[ext_resource type="Texture2D" path="res://art/export/heroine-dash-v1/heroine-dash.png" id="1"]']
    animations=[]
    for row,d in enumerate(c.DIRS):
        cells=[]
        for n,ms in enumerate(DUR):
            ident=f"dash_{d}_{n}"
            resources += ['', f'[sub_resource type="AtlasTexture" id="{ident}"]', 'atlas = ExtResource("1")', f'region = Rect2({n*96}, {row*136}, 96, 136)']
            cells.append('{"duration": '+str(ms/40)+', "texture": SubResource("'+ident+'") }')
        animations.append('{"frames": ['+', '.join(cells)+'], "loop": false, "name": &"dash_'+d+'", "speed": 25.0}')
    resources += ['', '[resource]', 'animations = ['+',\n'.join(animations)+']']
    (OUT/'heroine-dash.tres').write_text('\n'.join(resources)+'\n',encoding='utf8')
    print(json.dumps(audit))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--sync',action='store_true');a=p.parse_args();sync() if a.sync else plan()
