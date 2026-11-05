"""Author native 64px/unit astral-city ground as editable, unique SVG artwork.
No image is stretched and no repeated terrain-tile texture is used.
"""
from pathlib import Path
from math import sin,cos,pi,sqrt,atan2
import random,json,re
ROOT=Path(__file__).resolve().parents[1]
REGION=ROOT/'art-studies/regions/arcana-city-center'
SOURCE=REGION/'source/magic-ground-v1'
OUT=ROOT/'godot-arcana/art/export/regions/arcana-city-center'
SOURCE.mkdir(parents=True,exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
S=64; W=4608; H=3072; Z0=8
parts=[]

def xy(x,z): return (x*S,(z-Z0)*S)
def num(v): return str(round(v,2))
def add(s): parts.append(s)
def path(points,color,width,close=False,fill='none'):
    points=[xy(*p) for p in points]
    commands='M'+' L'.join(num(x)+' '+num(y) for x,y in points)+(' Z' if close else '')
    add(f'<path d="{commands}" fill="{fill}" stroke="{color}" stroke-width="{num(width*S)}" stroke-linecap="round" stroke-linejoin="round"/>')
def circle(x,z,r,color,width,fill='none'):
    x,y=xy(x,z)
    add(f'<circle cx="{num(x)}" cy="{num(y)}" r="{num(r*S)}" fill="{fill}" stroke="{color}" stroke-width="{num(width*S)}"/>')
def star(x,z,r,inner=.28,fill='#d5a44f',stroke='#a27c43',width=.025,angle=0,n=8):
    pts=[]
    for k in range(n*2):
        a=angle+k*pi/n-pi/2
        radius=r if k%2==0 else r*inner
        if k%4==2 and n==8: radius=r*.67
        pts.append((x+cos(a)*radius,z+sin(a)*radius))
    path(pts,stroke,width,True,fill)
def ribbon(points,width=.17):
    path(points,'#a27c43',width+.10)
    path(points,'#efd69b',width+.06)
    path(points,'#34589b',width)
    path(points,'#6786bb',.025)
def goldline(points,width=.035):
    path(points,'#b48c48',width+.035)
    path(points,'#ecd6a3',width)

add(f'<rect width="{W}" height="{H}" fill="#e1d3b8"/>')
# Quiet, unique fitted limestone at native resolution. The finely drawn joints
# are subordinate to the celestial inlay, unlike the rejected giant cobbles.
step=.58
sites={}
for j in range(-3,87):
    for i in range(-3,129):
        rng=random.Random(i*73856093 ^ j*19349663 ^ 70429)
        sites[i,j]=((i+.5+rng.uniform(-.31,.31))*step,(j+.5+rng.uniform(-.31,.31))*step+Z0)

def clip(poly,nx,ny,limit):
    result=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=a[0]*nx+a[1]*ny-limit
        db=b[0]*nx+b[1]*ny-limit
        if da<=0: result.append(a)
        if (da<=0)!=(db<=0):
            t=da/(da-db)
            result.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
    return result
colors=['#e7d9bf','#e6d8be','#e8dac1','#e4d6bc']
for j in range(-1,84):
    for i in range(-1,126):
        x,z=sites[i,j]
        poly=[(x-1.5,z-1.5),(x+1.5,z-1.5),(x+1.5,z+1.5),(x-1.5,z+1.5)]
        for dj in range(-2,3):
            for di in range(-2,3):
                if not(di or dj): continue
                a,b=sites[i+di,j+dj]
                poly=clip(poly,a-x,b-z,(a*a+b*b-x*x-z*z)*.5)
                if not poly: break
            if not poly: break
        if not poly: continue
        pts=[xy(*p) for p in poly]
        pts=[(round(a),round(b)) for a,b in pts]
        if max(a for a,b in pts)<0 or min(a for a,b in pts)>W or max(b for a,b in pts)<0 or min(b for a,b in pts)>H: continue
        rng=random.Random(i*17431 ^ j*40963 ^ 21029)
        color=colors[rng.randrange(len(colors))]
        points=' '.join(str(a)+','+str(b) for a,b in pts)
        add(f'<polygon points="{points}" fill="{color}" stroke="#c3b79f" stroke-width="0.9"/>')
        # Native 1-2 pixel material flecks, not enlarged low-resolution grains.
        px,py=xy(x,z)
        if rng.random()<.36:
            add(f'<path d="M{num(px-3)} {num(py-1)} h4 m-2 1 h3" fill="none" stroke="#d8cab0" stroke-width="1"/>')
        if rng.random()<.17:
            add(f'<path d="M{num(px-6)} {num(py+4)} l3 -2 2 1 3 -2" fill="none" stroke="#cabda6" stroke-width="0.8"/>')

CX,CZ=36,28.925
# The fountain's existing inner mosaic remains a separate registered asset.
for r,color,width in [(7.85,'#bf974d',.045),(7.72,'#eed8a2',.035),(6.98,'#b48c48',.055),(6.74,'#34589b',.34),(6.54,'#efd69b',.045),(5.48,'#c5a260',.032)]:
    circle(CX,CZ,r,color,width)
for k in range(32):
    a=k*2*pi/32
    r=6.74
    x,z=CX+cos(a)*r,CZ+sin(a)*r
    if k%4==0: star(x,z,.34 if k%8 else .54,.24,'#ead39b','#b48c48',.025,angle=a)
    else: circle(x,z,.055,'#efd69b',.025,'#efd69b')
# Four quiet constellation groups between the inlaid rings.
for q in range(4):
    base=q*pi/2+.10
    pts=[]
    for da,r in [(0,5.92),(.16,5.64),(.31,5.96),(.47,5.57)]:
        pts.append((CX+cos(base+da)*r,CZ+sin(base+da)*r))
    goldline(pts,.022)
    for x,z in pts: star(x,z,.10,.32,'#c7a25c','#c7a25c',.012,n=4)
# Cardinal compass points form part of the floor, never a collision object.
for a in [0,pi/2,pi,3*pi/2]:
    x,z=CX+cos(a)*7.7,CZ+sin(a)*7.7
    star(x,z,.68,.20,'#d5ad59','#a27c43',.035,angle=a)
    star(x,z,.40,.21,'#34589b','#efd69b',.025,angle=a)
# North/south avenue borders meet the outer compass rather than crossing it.
join=sqrt(7.85**2-2.55**2)
for x in [33.45,38.55]:
    ribbon([(x,14.8),(x,CZ-join)],.22)
    ribbon([(x,CZ+join),(x,55)],.22)
    outer=-.18 if x<36 else .18
    goldline([(x+outer,CZ+join),(x+outer,55)],.028)
# Restrained eastern and western street routes, matching the approved concept.
for pts in [
 [(4,14.5),(4,44.6),(32.95,44.6)],
 [(39.05,44.6),(68,44.6),(68,13)],
 [(10.65,14),(10.65,43.7),(32.95,43.7)],
 [(39.05,43.7),(66.5,43.7)],
 [(18,24.6),(24.5,24.6),(26.7,26.8),(28.3,26.8)],
 [(43.75,28.925),(49.1,28.925),(51.1,30.55)],
 [(40.5,35.8),(67.5,35.8)],
 [(12,12.2),(28.5,12.2)],
]: ribbon(pts,.085)
# Small institutional star in the academy's front court.
SX,SZ=54,30.65
circle(SX,SZ,1.9,'#b99049',.045)
circle(SX,SZ,1.75,'#efd69b',.035)
star(SX,SZ,1.13,.28,'#34589b','#bb954e',.04)
star(SX,SZ,.69,.28,'#6786bb','#efd69b',.025)
circle(SX,SZ,.18,'#efd69b',.03,'#d5ad59')
# Stars mark the walk from fountain to the southern gate, not every slab.
for x,z,r in [(36,39.0,.43),(36,42.0,.33),(36,50.7,.43),(36,53.8,.37),(17.2,43.7,.30),(51,43.7,.30),(10.65,30.8,.28),(65.5,35.8,.28),(36,18.9,.30)]:
    circle(x,z,r*1.42,'#d5ad59',.025)
    star(x,z,r,.22,'#34589b','#d5ad59',.025,n=4)
# The gateway compass is continuous with the entrance paving.
GX,GZ=36,47.1
circle(GX,GZ,1.72,'#bf974d',.04,fill='#eee0c8')
circle(GX,GZ,1.60,'#efd69b',.035)
star(GX,GZ,1.35,.26,'#34589b','#bf974d',.045)
star(GX,GZ,.94,.22,'#d5ad59','#efd69b',.035,angle=pi/8)
circle(GX,GZ,.20,'#efd69b',.025,'#34589b')
# Fine coping follows the actual garden extents; grass is composited separately.
plan=json.loads((REGION/'layout.json').read_text(encoding='utf-8'))
for x,z,w,h in plan['gardens']:
    px,py=xy(x-.11,z-.11)
    add(f'<rect x="{num(px)}" y="{num(py)}" width="{num((w+.22)*S)}" height="{num((h+.22)*S)}" rx="{num(min(.5,h*.3)*S)}" fill="none" stroke="#eee0c8" stroke-width="8"/>')
    add(f'<rect x="{num(px)}" y="{num(py)}" width="{num((w+.22)*S)}" height="{num((h+.22)*S)}" rx="{num(min(.5,h*.3)*S)}" fill="none" stroke="#bfa065" stroke-width="2"/>')
body='\n'.join(parts)
master=f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">\n{body}\n</svg>\n'
(SOURCE/'magic-ground-master.svg').write_text(master,encoding='utf-8')
# Two unique halves keep texture dimensions below 4096, both at full 64px/unit.
for side,offset in [('left',0),('right',2304)]:
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="2304" height="3072" viewBox="0 0 2304 3072"><g transform="translate({-offset} 0)">\n{body}\n</g></svg>\n'
    target=OUT/f'magic-ground-{side}.svg'
    target.write_text(svg,encoding='utf-8')
    imp=target.with_suffix('.svg.import')
    if not imp.exists():
        template=(ROOT/'godot-arcana/art/export/fountain-paving/mosaic-ring.png.import').read_text(encoding='utf-8')
        template=re.sub(r'^uid=.*\n','',template,flags=re.M)
        cache=f'res://.godot/imported/magic-ground-{side}.svg.ctex'
        runtime=f'res://art/export/regions/arcana-city-center/magic-ground-{side}.svg'
        template=re.sub(r'^path=".*"','path="'+cache+'"',template,flags=re.M)
        template=re.sub(r'^source_file=".*"','source_file="'+runtime+'"',template,flags=re.M)
        template=re.sub(r'^dest_files=.*','dest_files=["'+cache+'"]',template,flags=re.M)
        template+='\nsvg/scale=1.0\n'
        imp.write_text(template,encoding='utf-8')
spec={'approval':'User: 이 시안으로 적용해 주세요','concept':'source/magic-ground-v1/approved-concept.png',
 'master':'source/magic-ground-v1/magic-ground-master.svg','author':'scripts/build-arcana-magic-ground.py',
 'worldBoundsXZ':[0,8,72,48],'nativeDensity':64,'masterSize':[W,H],
 'runtimeHalves':{'left':[2304,3072],'right':[2304,3072]},
 'sampling':'two unique contiguous halves; no repeat; no enlargement; nearest; no mipmaps',
 'registration':{'fountain':[CX,CZ],'academyCourt':[SX,SZ],'southGate':[GX,GZ]},
 'design':'quiet ivory limestone, cobalt/gold celestial compass, constellation inlays, ceremonial avenue and academy star',
 'preserved':'buildings, trees, lamps, props, terrain masks, collision, entrances and inner fountain mosaic'}
(REGION/'magic-ground-v1.json').write_text(json.dumps(spec,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Authored',W,'x',H,'ground, native density 64px/unit; two unique 2304x3072 halves.')