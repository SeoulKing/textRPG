"""Package saved PixelPen full-body frame edits, never regenerate their source."""
import importlib.util
import json
import argparse
from pathlib import Path
from PIL import Image,ImageDraw
spec=importlib.util.spec_from_file_location('c',Path(__file__).with_name('author-heroine-continuity.py'))
c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
parser=argparse.ArgumentParser()
parser.add_argument('--source',default='fullbody-v5')
parser.add_argument('--export',dest='export_name',default='heroine-fullbody-v5')
args=parser.parse_args()
src=c.BASE/args.source;out=c.ROOT/'godot-arcana/art/export'/args.export_name
out.mkdir(parents=True,exist_ok=True)
clips={};audit={'frames':0,'source':'saved native PixelPen files','fullbody_standard':'approved run-v1 frame 1','clips':{}}
for kind,columns,rows in [('idle',4,8),('run',8,9),('cast',6,8),('bench',4,2)]:
    atlas=Image.new('RGBA',(columns*96,rows*136));board=Image.new('RGBA',atlas.size,'#8292a7');draw=ImageDraw.Draw(board)
    for d,direction in enumerate(['s'] if kind=='bench' else c.DIRS):
        name=kind+'_'+direction;_,frames=c.native(src/'pixelpen'/(name+'.pxpen'));clips[name]=frames
        audit['frames']+=len(frames);audit['clips'][name]=len(frames)
        for n,data in enumerate(frames):
            im=c.image(data);point=((n%columns)*96,(n//columns if kind=='bench' else d)*136)
            atlas.alpha_composite(im,point);board.alpha_composite(im,point)
            draw.text((point[0]+2,point[1]+123),f'{direction} {n}',fill='white')
    if kind=='run':
        for d,direction in enumerate(c.DIRS):atlas.alpha_composite(c.image(clips['idle_'+direction][0]),(d*96,8*136))
    atlas.save(out/('heroine-'+kind+'.png'));board.save(src/'preview'/(kind+'-native-all-frames.png'))
old=(c.ROOT/'godot-arcana/art/export/heroine-run-v1/heroine-run.tres').read_text(encoding='utf-8')
(out/'heroine-run.tres').write_text(old.replace('heroine-run-v1/heroine-run.png',out.name+'/heroine-run.png'),encoding='utf-8')
audit['cast_boundary_errors']={d:sum(a!=b for a,b in zip(clips['idle_'+d][0],clips['cast_'+d][n])) for d in c.DIRS for n in [0]}
audit['cast_return_errors']={d:sum(a!=b for a,b in zip(clips['idle_'+d][0],clips['cast_'+d][-1])) for d in c.DIRS}
audit['bench_stand_boundary_errors']=sum(a!=b for a,b in zip(clips['idle_s'][0],clips['bench_s'][0]))
(src/'native-package-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
timeline=[('idle',0,600)]+[('run',n,52) for _ in range(2) for n in range(8)]+[('idle',0,400)]+[('cast',n,ms) for n,ms in enumerate([40,80,200,160,120,80])]+[('idle',0,600)]
boards=[]
for kind,n,_ in timeline:
    board=Image.new('RGBA',(384,272),'#8292a7')
    for d,direction in enumerate(c.DIRS):board.alpha_composite(c.image(clips[kind+'_'+direction][n]),((d%4)*96,(d//4)*136))
    boards.append(board.resize((768,544),Image.Resampling.NEAREST).convert('RGB'))
boards[0].save(src/'preview/native-state-flow.gif',save_all=True,append_images=boards[1:],duration=[ms for _,_,ms in timeline],loop=0)
print(json.dumps(audit,indent=2))
