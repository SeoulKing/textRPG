"""First-author indexed slime motion plans. Saved PixelPen projects remain the masters."""
import json, math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT/'godot-arcana/art/source/monsters/motion-v2'
D = json.loads((BASE/'original.pixel.json').read_text(encoding='utf8'))
W,H = D['size']
def rnd(v): return math.floor(v+.5)
def pose(name,f):
    spec=D['animations'][name];t=f/(spec['count'] if spec['loop'] else spec['count']-1)
    for a,b in zip(spec['keys'],spec['keys'][1:]):
        if t<=b['t']:break
    u=max(0,min(1,(t-a['t'])/(b['t']-a['t'])));u=u*u*(3-2*u)
    p={k:a[k]+(b[k]-a[k])*u for k in ['lift','lean','dissolve']}
    p['scale']=[a['scale'][i]+(b['scale'][i]-a['scale'][i])*u for i in range(2)]
    p['face']=a['face'] if u<.5 else b['face']
    if name=='idle' and f in [20,21]:p['face']='blink'
    return p

def filled(layer,x,y):
    s=D['layers'][layer][y][x]
    if s!='o':return s
    # Remove scaled source ink; draw exactly one native-pixel silhouette after posing.
    for r in range(1,9):
        for dx,dy in [(r,0),(-r,0),(0,-r),(0,r)]:
            if 0<=x+dx<W and 0<=y+dy<H:
                c=D['layers'][layer][y+dy][x+dx]
                if c not in '.o':return c
    return 'g'

def frame(name,f):
    p=pose(name,f);sx,sy=p['scale'];lift=rnd(p['lift']);lean=rnd(p['lean'])
    out=[list('.'*W) for _ in range(H)]
    idle=name=='idle'
    # Three authored breath heights with real holds. Ground-contact pixels never resample.
    breath=([0]*4+[1]*5+[0]*7+[-1]*4+[0]*4)[f] if idle else 0
    for y in range(H):
        srcy=y-rnd(breath*max(0,min(1,(65-y)/16))) if idle else rnd(73+(y-73+lift)/sy)
        if not 35<=srcy<=73:continue
        for x in range(W):
            srcx=x if idle else rnd(31.5+(x-31.5-rnd(lean*(73-y-lift)/50))/sx)
            if 0<=srcx<W and D['layers']['body'][srcy][srcx]!='.':out[y][x]=filled('body',srcx,srcy)
    # Crest follows body, with a one-frame settle; its thin neck is never stretched sideways.
    top=35+breath if idle else rnd(73-38*sy)-lift
    lag=pose(name,max(0,f-1));laglean=rnd(lag['lean'])
    crest_sy=1 if idle else .65+.35*sy
    for y in range(0,max(0,top+2)):
        cy=rnd(35+(y-top)/crest_sy)
        if not 0<=cy<H:continue
        shift=0 if idle else rnd(lean*.76+(laglean-lean)*max(0,(top-y)/12))
        for x in range(W):
            cx=x-shift
            if 0<=cx<W and D['layers']['crest'][cy][cx]!='.':out[y][x]=filled('crest',cx,cy)
    # Repair the actual 4-neighbour silhouette, including the crest/body join.
    shape=[row[:] for row in out]
    for y in range(H):
        for x in range(W):
            if shape[y][x]!='.' and any(not(0<=x+dx<W and 0<=y+dy<H) or shape[y+dy][x+dx]=='.' for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]):out[y][x]='o'
    # Eyes and smile are rigid indexed clusters. Only intentional blink/hurt poses change them.
    fy=breath if idle else rnd(73-16*sy)-lift-57
    fx=0 if idle else rnd(lean*(73-57)/50)
    face=D['layers']['face_'+p['face']]
    for y,row in enumerate(face):
        for x,c in enumerate(row):
            if c=='.':continue
            yy=y+fy;xx=x+fx
            if name=='death' and sy<.65:yy=rnd(73+(y-73)*sy)-lift
            if 0<xx<W-1 and 0<yy<H-1 and out[yy][xx] not in '.o':out[yy][xx]=c
    if p['dissolve']:
        for y in range(H):
            for x in range(W):
                if ((x*3+y*5)%17)/17<p['dissolve']:out[y][x]='.'
    return [''.join(row) for row in out]

if __name__=='__main__':
    if any(BASE.glob('*.pxpen')):raise SystemExit('Saved PixelPen masters exist; export them instead of regenerating.')
    frames={n:[frame(n,f) for f in range(s['count'])] for n,s in D['animations'].items()}
    # Explicit neutral entry/exit poses prevent a one-pixel snap between actions.
    neutral=frames['idle'][0]
    for n in ['hop','attack','hit']:frames[n][-1]=neutral
    frames['hop'][0]=neutral
    plan={'palette':D['palette'],'animations':D['animations'],'frames':frames}
    (BASE/'author-plan.json').write_text(json.dumps(plan,ensure_ascii=False),encoding='utf8')
    print('Prepared 120 indexed poses: fixed contact, rigid faces, native contours, settled crest.')
