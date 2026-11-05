"""Local finish layers for the accepted celestial ground, authored at 64px/unit."""
from math import sin,cos,pi,hypot,sqrt
import random

STATS={'fountain_stones':0,'avenue_stones':0}

def zone_at(x,z):
    r=hypot(x-36,z-28.925)
    if 4.25<r<8.8: return 'fountain_stones'
    if 33.08<x<38.92 and 36.3<z<55: return 'avenue_stones'
    return ''

def stone_finish(x,z,poly,xy,add):
    zone=zone_at(x,z)
    if not zone: return
    STATS[zone]+=1
    pts=[xy(*p) for p in poly]
    cx=sum(p[0] for p in pts)/len(pts)
    cy=sum(p[1] for p in pts)/len(pts)
    inset=[(px+(cx-px)*.075,py+(cy-py)*.075) for px,py in pts]
    rng=random.Random(round(x*4096)^round(z*8192)^12907)
    # Two native pixels of light/shadow model the cut stone edge; the paving
    # remains visually flat and has no new mesh, collision or repeating tile.
    for a,b in zip(inset,inset[1:]+inset[:1]):
        dx,dy=b[0]-a[0],b[1]-a[1]
        length=hypot(dx,dy)
        if length<5: continue
        facing=(dy*-.65+(-dx)*-.76)/length
        color='#f1dfb9' if facing>.13 else '#b6a68e'
        width=1.35 if facing>.13 else 1.15
        # Short ends leave the existing irregular corners visible.
        aa=(a[0]+dx*.10,a[1]+dy*.10)
        bb=(b[0]-dx*.10,b[1]-dy*.10)
        add(f'<path d="M{aa[0]:.2f} {aa[1]:.2f} L{bb[0]:.2f} {bb[1]:.2f}" fill="none" stroke="{color}" stroke-width="{width}"/>')
    if rng.random()<.24:
        # A small material chip has a dark recess and a one-pixel light lip.
        k=rng.randrange(len(inset))
        px,py=inset[k]
        d=hypot(cx-px,cy-py) or 1
        vx,vy=(cx-px)/d,(cy-py)/d
        px+=vx*1.5;py+=vy*1.5
        tx,ty=-vy,vx
        points=[(px+tx*1.8,py+ty*1.8),(px-tx*1.8,py-ty*1.8),(px+vx*3.2,py+vy*3.2)]
        add('<polygon points="'+' '.join(f'{a:.2f},{b:.2f}' for a,b in points)+'" fill="#a99a85"/>')
        add(f'<path d="M{px+vx*3.2:.2f} {py+vy*3.2:.2f} l{tx*2.2:.2f} {ty*2.2:.2f}" stroke="#efe0bf" stroke-width="1" fill="none"/>')
    # Limited broad mineral flecks, placed inside stones rather than on every
    # screen pixel; they share native density with bark and lamp engravings.
    if rng.random()<.28:
        px=cx+rng.uniform(-4,4);py=cy+rng.uniform(-3,3)
        add(f'<path d="M{px:.2f} {py:.2f} h3 m-1 1 h4" stroke="#f0dfbe" stroke-width="1" fill="none"/>')
    # Fine warm mineral clusters calibrated to the approved fountain mosaic's
    # stone palette (eee0c8 / d3b176 / e3c88d), not enlarged random blotches.
    for grain in range(14):
        px=py=0
        for attempt in range(8):
            px=rng.uniform(min(a for a,b in inset),max(a for a,b in inset))
            py=rng.uniform(min(b for a,b in inset),max(b for a,b in inset))
            inside=True
            for a,b in zip(inset,inset[1:]+inset[:1]):
                dx,dy=b[0]-a[0],b[1]-a[1]
                if (dx*(py-a[1])-dy*(px-a[0])) < 3*hypot(dx,dy): inside=False;break
            if inside: break
        else: continue
        px,py=round(px),round(py)
        color=['#d3b176','#e3c88d','#eee0c8'][rng.randrange(3)]
        width=rng.choice([1,2,2,3])
        add(f'<path d="M{px} {py} h{width} m-1 1 h{width+1}" stroke="{color}" stroke-width="1" fill="none"/>')
    if rng.random()<.10:
        add(f'<path d="M{cx-5:.2f} {cy+3:.2f} l3 -2 2 1 3 -2" stroke="#ae9f89" stroke-width="1" fill="none"/>')


def add_inlay_details(env):
    path,circle,star=env['path'],env['circle'],env['star']
    add,xy=env['add'],env['xy']
    cx,cz=env['CX'],env['CZ']
    scale=env['S']
    def arc(radius,start,end,color,width):
        count=max(3,round((end-start)*radius*12))
        pts=[(cx+cos(start+(end-start)*i/count)*radius,cz+sin(start+(end-start)*i/count)*radius) for i in range(count+1)]
        path(pts,color,width)
    def local_arc(x,z,r,start,end,color,width):
        count=max(3,round((end-start)*r*12))
        path([(x+cos(start+(end-start)*i/count)*r,z+sin(start+(end-start)*i/count)*r) for i in range(count+1)],color,width)
    def gemstone(x,z,r=.055):
        circle(x+.015,z+.015,r+.025,'#8d744c',.018,'#8d744c')
        circle(x,z,r+.014,'#d6ae60',.018,'#335b9b')
        circle(x-r*.30,z-r*.35,r*.25,'#f0dfbd',.009,'#f0dfbd')
    def facets(x,z,r,inner=.24,angle=0,blue=False,n=8):
        pts=[]
        for k in range(n*2):
            a=angle+k*pi/n-pi/2
            radius=r if k%2==0 else r*inner
            if k%4==2 and n==8: radius=r*.67
            pts.append((x+cos(a)*radius,z+sin(a)*radius))
        tones=['#ecd398','#cf9f4c','#b98b40','#e1bc72'] if not blue else ['#7291c5','#436aa7','#294678','#567eb7']
        for k,(a,b) in enumerate(zip(pts,pts[1:]+pts[:1])):
            path([(x,z),a,b],tones[k%4],.005,True,tones[k%4])
        path(pts,'#9e7b43' if not blue else '#cdaa63',.022,True)
    add('<g id="detail-fountain-celestial-inlay">')
    # Match the reference's crafted blue tesserae at 4-5 native pixels across.
    # Only this existing ornamental band is subdivided; no terrain grid returns.
    enamel=['#273d78','#304f9c','#304f9c','#34589b','#3d62bd','#304f9c']
    for row in range(5):
        radius=6.74-.17+(row+.5)*.068
        count=600
        for k in range(count):
            rng=random.Random(row*601+k*9137+817)
            a=(k+(.5 if row%2 else 0))*2*pi/count
            half=(2*pi/count)*.43
            r0,r1=radius-.028,radius+.028
            pts=[(cx+cos(a-half)*r0,cz+sin(a-half)*r0),(cx+cos(a+half)*r0,cz+sin(a+half)*r0),(cx+cos(a+half)*r1,cz+sin(a+half)*r1),(cx+cos(a-half)*r1,cz+sin(a-half)*r1)]
            tone=enamel[rng.randrange(len(enamel))]
            path(pts,tone,.003,True,tone)
    # Bevels and recesses give the existing bands a crafted metal/enamel edge.
    for radius in [7.85,7.72,6.98,6.54,5.48]:
        circle(cx+.017,cz+.020,radius,'#a38a58',.026)
        circle(cx-.008,cz-.009,radius,'#eddaa8',.020)
    circle(cx,cz,6.87,'#7992be',.027)
    circle(cx,cz,6.60,'#223d75',.026)
    # Fine segment joins belong to the existing enamel band, not ground tiles.
    for k in range(64):
        a=k*2*pi/64
        if k%8==0: continue
        path([(cx+cos(a)*6.58,cz+sin(a)*6.58),(cx+cos(a)*6.90,cz+sin(a)*6.90)],'#203a70',.019)
        b=a+.005
        path([(cx+cos(b)*6.61,cz+sin(b)*6.61),(cx+cos(b)*6.87,cz+sin(b)*6.87)],'#d1b578',.014)
    for k in range(32):
        a=k*2*pi/32
        x,z=cx+cos(a)*6.74,cz+sin(a)*6.74
        if k%4:
            gemstone(x,z,.043)
        else:
            facets(x,z,.34 if k%8 else .54,angle=a)
            star(x,z,.10,.28,'#f0dfbd','#a48042',.016,n=4)
    # A narrow cut-stone course around the compass, with tiny individual joints.
    for k in range(48):
        a=k*2*pi/48+.018
        if abs(sin(a*2))<.12: continue
        path([(cx+cos(a)*7.09,cz+sin(a)*7.09),(cx+cos(a)*7.67,cz+sin(a)*7.67)],'#b8aa8f',.018)
        b=a+.003
        path([(cx+cos(b)*7.11,cz+sin(b)*7.11),(cx+cos(b)*7.64,cz+sin(b)*7.64)],'#efdfbd',.017)
    for q in range(4):
        base=q*pi/2+.10
        pts=[(cx+cos(base+da)*r,cz+sin(base+da)*r) for da,r in [(0,5.92),(.16,5.64),(.31,5.96),(.47,5.57)]]
        path([(x+.017,z+.017) for x,z in pts],'#b49a66',.023)
        path(pts,'#eddaad',.018)
        for x,z in pts: gemstone(x,z,.038)
    for a in [0,pi/2,pi,3*pi/2]:
        x,z=cx+cos(a)*7.7,cz+sin(a)*7.7
        facets(x,z,.68,.20,angle=a)
        facets(x,z,.40,.21,angle=a,blue=True)
        gemstone(x,z,.065)
    # Sparse etched scrolls sit inside the existing ring's material footprint.
    for q in range(8):
        a=q*pi/4+.22
        arc(7.32,a,a+.20,'#ccb782',.018)
        for da in [0,.20]:
            x,z=cx+cos(a+da)*7.32,cz+sin(a+da)*7.32
            circle(x,z,.037,'#ae8d4d',.014)
    add('</g>')
    add('<g id="detail-south-avenue-metalwork">')
    start=cz+sqrt(7.85**2-2.55**2)
    for x in [33.45,38.55]:
        # Three rows of native-detail enamel pieces continue the fountain
        # material along the accepted avenue stripe, within its existing width.
        for row in range(3):
            cell_x=x+(row-1)*(.22/3)
            for k in range(int((54.9-start)/.09)):
                zz=start+.10+k*.09
                rng=random.Random(row*137+k*193+int(x*17))
                tone=enamel[rng.randrange(len(enamel))]
                path([(cell_x-.031,zz),(cell_x+.031,zz),(cell_x+.031,zz+.080),(cell_x-.031,zz+.080)],tone,.003,True,tone)
        # One-pixel dark lip, polished upper rim and inset fasteners.
        path([(x-.092,start+.14),(x-.092,54.8)],'#263f73',.018)
        path([(x+.094,start+.14),(x+.094,54.8)],'#e9d39b',.018)
        for j in range(12):
            z=start+.45+j*1.45
            if z>54.7: break
            circle(x,z,.033,'#9a7744',.014,'#d8b46d')
            circle(x-.010,z-.012,.011,'#f1dfb9',.008,'#f1dfb9')
    for z,r in [(39.0,.43),(42.0,.33),(50.7,.43),(53.8,.37)]:
        circle(36+.016,z+.020,r*1.42,'#ac925c',.020)
        circle(36,z,r*1.42,'#edd9a9',.018)
        facets(36,z,r,.22,blue=True,n=4)
        gemstone(36,z,.045)
    # Keep the approved gate compass silhouette, adding shaded facets and rim.
    x,z=36,47.1
    circle(x+.022,z+.022,1.72,'#9d8458',.032)
    circle(x,z,1.72,'#ecd59d',.026)
    facets(x,z,1.35,.26,blue=True)
    facets(x,z,.94,.22,angle=pi/8)
    circle(x,z,.20,'#e9d59c',.030,'#2e4f88')
    gemstone(x,z,.10)
    for k in range(24):
        a=k*2*pi/24
        if k%3==0: continue
        circle(x+cos(a)*1.60,z+sin(a)*1.60,.023,'#c8a667',.010,'#c8a667')
    add('</g>')
    return {'pass':'district-detail-01','materialReference':'godot-arcana/art/export/fountain-paving/mosaic-ring.png','zones':dict(STATS),'scope':['fountain plaza','southern ceremonial avenue and gate'],
            'features':['reference stone mineral clusters','native stone bevels and chips','native blue tesserae matching fountain mosaic','enamel segment edges','shaded gold/blue compass facets','inset constellation stones','avenue metal lips and fasteners'],
            'preserved':['all district geometry','all other district finish','native density','building and prop layout','movement and collision']}