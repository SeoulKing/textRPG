"""Build the editable terraced-market meshes from the shared Godot XZ layout."""
import json
import math
from pathlib import Path
from random import Random

import bpy

HERE = Path(__file__).resolve().parent
PROJECT = next(p for p in HERE.parents if (p / "godot-arcana/project.godot").is_file())
DATA = json.loads((PROJECT / "godot-arcana/data/plaza-terraces.json").read_text(encoding="utf-8"))
OUT = PROJECT / "godot-arcana/art/source/terraced-market"
rng = Random(417)
WOOD, OAK, BARK = "#543d3b", "#a06e48", "#71523f"
IVORY, LIGHT, STONE = "#ecd9af", "#faeac8", "#bea283"
GOLD, BRASS, INK = "#e5b858", "#af8043", "#3b4553"
FOLIAGE = ["#415f4f", "#5d7750", "#859052", "#a5a366"]
materials = {}


def paint(color):
    if color not in materials:
        srgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
        linear = tuple(v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in srgb)
        m = bpy.data.materials.new(color)
        m.diffuse_color = (*linear, 1)
        m.use_nodes = True
        p = m.node_tree.nodes.get("Principled BSDF")
        p.inputs["Base Color"].default_value = m.diffuse_color
        p.inputs["Roughness"].default_value = .87
        materials[color] = m
    return materials[color]


def tint(color, multiplier):
    return "#" + "".join(f"{min(255, round(int(color[i:i+2],16)*multiplier)):02x}" for i in (1,3,5))


class Part:
    def __init__(self, name):
        self.name = name
        self.vertices, self.faces, self.colors = [], [], []

    def solid(self, points, faces, color):
        start = len(self.vertices)
        self.vertices.extend((x, -z, h) for x, z, h in points)
        for face in faces:
            self.faces.append(tuple(start+i for i in reversed(face)))
            self.colors.append(color)

    def box(self, x, z, h, w, d, rise, c):
        points = [(x+sx*w/2, z+sz*d/2, h+y*rise) for y in (0,1) for sx,sz in ((-1,-1),(1,-1),(1,1),(-1,1))]
        self.solid(points, [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)], c)

    def orb(self, x, z, h, w, d, rise, c, sides=8):
        rings = ((0,-1),(.78,-.55),(1,.12),(.68,.67),(0,1))
        pts = [(x+math.cos(i*math.tau/sides)*w*r,z+math.sin(i*math.tau/sides)*d*r,h+y*rise)
               for r,y in rings for i in range(sides)]
        faces = [(k*sides+i,k*sides+(i+1)%sides,(k+1)*sides+(i+1)%sides,(k+1)*sides+i)
                 for k in range(len(rings)-1) for i in range(sides)]
        self.solid(pts,faces,c)

    def rod(self, a, b, radius, color, sides=6):
        from mathutils import Vector
        p, q = Vector(a), Vector(b)
        axis = (q-p).normalized()
        side = axis.cross(Vector((0,0,1)) if abs(axis.z)<.9 else Vector((1,0,0))).normalized()
        up = axis.cross(side)
        points = [tuple(end+radius*(side*math.cos(i*math.tau/sides)+up*math.sin(i*math.tau/sides)))
                  for end in (p,q) for i in range(sides)]
        faces = [tuple(reversed(range(sides))), tuple(range(sides,2*sides))]
        faces.extend((i,(i+1)%sides,sides+(i+1)%sides,sides+i) for i in range(sides))
        self.solid(points,faces,color)

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        palette = list(dict.fromkeys(self.colors))
        for color in palette:
            mesh.materials.append(paint(color))
        slots = {c:i for i,c in enumerate(palette)}
        mesh.polygons.foreach_set("material_index", [slots[c] for c in self.colors])
        mesh.validate()
        return obj


def flowerbox(p,x,z,h,width):
    p.box(x,z,h,width,.27,.21,BARK)
    p.box(x,z,h+.18,width+.06,.3,.06,OAK)
    for j in range(max(3,round(width*7))):
        dx = (j+.5)/max(3,round(width*7))*width - width/2
        p.orb(x+dx,z,h+.32,.14,.14,.15,rng.choice(FOLIAGE),6)
        if j%2==0:
            p.orb(x+dx,z+.07,h+.43,.075,.07,.07,rng.choice(["#c5879e","#e2b677",LIGHT]),6)


def arched_face(p,x,z,h,w,stem,color):
    radius = w/2
    edge = [(x-radius,z,h),(x+radius,z,h)]
    edge.extend((x+radius*math.cos(i*math.pi/12),z,h+stem+radius*math.sin(i*math.pi/12)) for i in range(13))
    p.solid(edge,[tuple(reversed(range(len(edge))))],color)


def roof(p,x0,z0,x1,z1,h,rise,c):
    mid = (z0+z1)/2
    def plane(z):
        return h+rise*(1-abs(z-mid)/(z1-z0)*2)
    # The eaves and gable cheeks have real thickness and cast shadows.
    pts = [(a,z,y) for a in (x0,x1) for z,y in ((z0,h),(z1,h),(mid,h+rise))]
    p.solid(pts,[(0,2,1),(3,4,5),(0,1,4,3),(0,3,5,2),(1,2,5,4)],tint(c,.75))
    for start,end in ((z0,mid),(z1,mid)):
        for row in range(6):
            a,b = start+(end-start)*row/6,start+(end-start)*(row+1)/6
            pieces = math.ceil((x1-x0)/.45)
            width = (x1-x0)/pieces
            for col in range(-1,pieces):
                left = max(x0,x0+(col+.5*(row%2))*width)
                right = min(x1,x0+(col+1+.5*(row%2))*width)
                if right-left < .015:
                    continue
                delta = rng.choice([.90,.94,1,1,1.03,1.07])
                quad = [(left,a,plane(a)+.024),(right,a,plane(a)+.024),
                        (right,b,plane(b)+.009),(left,b,plane(b)+.009)]
                p.solid(quad,[(0,1,2,3) if b>a else (3,2,1,0)],tint(c,delta))
    p.rod((x0-.02,mid,h+rise+.035),(x1+.02,mid,h+rise+.035),.085,tint(c,1.18),6)


def home(spec,index):
    p = Part(spec["id"])
    a,b,c,d = spec["rect"]
    x,z=(a+c)/2,(b+d)/2
    w,depth=c-a,d-b
    base=spec["base"]
    wall,top=spec["wall"],base+spec["wall"]
    p.box(x,z,base,w,depth,wall,spec["facade"])
    p.box(x,z,base,w+.08,depth+.08,.32,STONE)
    for dz in (b+.08,d-.03):
        for dx in (a+.07,c-.07):
            p.box(dx,dz,base+.30,.15,.18,wall-.32,BARK)
    p.box(x,z,top-.23,w+.06,depth+.06,.14,WOOD)
    p.box(x,z,top-.045,w+.45,depth+.45,.10,BARK)
    roof(p,a-.25,b-.26,c+.25,d+.26,top+.05,spec["roof"],spec["color"])
    # The exposed east gable carries an inset timber truss beneath the roof.
    for edge in (b+.08,d-.08):
        p.rod((c+.095,edge,top+.08),(c+.095,z,top+spec["roof"]-.15),.065,BARK)
    p.rod((c+.095,z,top+.08),(c+.095,z,top+spec["roof"]-.15),.055,WOOD)
    for dx,sign in ((a+.11,1),(c-.11,-1)):
        p.rod((dx,d+.075,top-.70),(dx+.47*sign,d+.075,top-.23),.073,BARK)
    # Chimney with a distinct crown and recessed flue.
    p.box(a+.49,b+.64,top,.40,.42,1.12,STONE)
    p.box(a+.49,b+.64,top+1.1,.54,.56,.14,tint(spec["color"],.8))
    p.box(a+.49,b+.64,top+1.235,.27,.30,.012,INK)
    door=x+(-.27 if index%2 else .24)
    arched_face(p,door,d+.075,base,.93,1.26,WOOD)
    arched_face(p,door,d+.09,base+.025,.76,1.20,["#52746c","#71553b","#546079","#915948"][index])
    for j in (-1,0,1):
        p.box(door+j*.17,d+.096,base+.04,.018,.022,1.04,BARK)
    p.orb(door+.24,d+.11,base+.67,.048,.04,.05,GOLD)
    p.box(door,d+.10,base+1.11,.69,.055,.06,OAK)
    for dx in (-.29,.29):
        p.rod((door+dx,d+.115,base+1.30),(door,d+.115,base+1.56),.021,BRASS)
    # Small wall lantern with its own bracket and warm panes.
    lamp_x=door+(.66 if index%2==0 else -.62)
    p.rod((lamp_x,d+.03,base+1.61),(lamp_x,d+.25,base+1.61),.033,WOOD)
    p.box(lamp_x,d+.24,base+1.33,.17,.15,.22,"#ecb661")
    p.box(lamp_x,d+.24,base+1.52,.22,.19,.074,BRASS)
    p.box(lamp_x,d+.24,base+1.3,.18,.16,.041,WOOD)
    p.box(door,d+.15,base+.005,1.02,.37,.075,IVORY)
    for dx in (a+.58,c-.61):
        arched_face(p,dx,d+.038,base+.91,.68,.58,WOOD)
        arched_face(p,dx,d+.051,base+.97,.52,.48,"#9ab6b3")
        p.box(dx,d+.075,base+.98,.055,.065,.72,IVORY)
        p.box(dx,d+.08,base+1.31,.54,.065,.055,IVORY)
        flowerbox(p,dx,d+.19,base+.70,.80)
        for side in (-1,1):
            shutter=dx+.405*side
            p.box(shutter,d+.066,base+.94,.133,.06,.69,tint(spec["color"],.92))
            for k in range(3):
                p.box(shutter,d+.102,base+1.01+k*.17,.128,.022,.038,tint(spec["color"],1.15))
    for zz in (b+.7,d-.79):
        p.box(c+.022,zz,base+1.02,.055,.68,.93,WOOD)
        p.box(c+.062,zz,base+1.10,.04,.52,.75,"#87a6a7")
        p.box(c+.092,zz,base+1.10,.022,.05,.75,IVORY)
    p.finish()


def terrace(spec, stairs):
    p=Part(spec["id"])
    x0,z0,x1,z1=spec["rect"]
    h=spec["height"]
    p.box((x0+x1)/2,(z0+z1)/2,-.012,x1-x0,z1-z0,h+.012,"#a89076")
    # Stone courses sit on the retaining face, with a smooth cap along the parapet.
    cuts=[s["rect"] for s in stairs if abs(s["high"]-h)<.01]
    def opening(x):
        return any(a-.08 < x < c+.08 for a,_,c,_ in cuts)
    courses=["#ac947d","#baa088","#c3aa8d","#b09980"]
    for row in range(3):
        n=math.ceil((x1-x0)/1.18)
        for i in range(-1,n):
            a=max(x0,x0+(i+.5*(row%2))*1.18)
            b=min(x1,x0+(i+1+.5*(row%2))*1.18)
            if b-a>.07 and not opening((a+b)/2):
                p.box((a+b)/2,z1+.015,h-1.18+row*.37,b-a-.025,.065,.34,rng.choice(courses))
    # Top paving is grouped in large flagstones, with little contrast inside each slab.
    for row in range(math.ceil((z1-z0)/.94)):
        za,zb=z0+row*.94,min(z1,z0+(row+1)*.94)
        for i in range(-1,math.ceil((x1-x0)/1.48)):
            a=max(x0,x0+(i+.5*(row%2))*1.48)
            b=min(x1,x0+(i+1+.5*(row%2))*1.48)
            if b-a>.04:
                p.box((a+b)/2,(za+zb)/2,h-.005,b-a-.016,zb-za-.014,.015,rng.choice(["#b4a58d","#baa98f","#c2b299","#b6aa92"]))
    # At the market and landing, a divided bronze line accents just the stone lip.
    k=x0
    while k<x1-.15:
        span=min(1.12,x1-k)
        if not opening(k+span/2):
            p.box(k+span/2,z1-.13,h+.01,span-.025,.23,.032,"#c2ae8d")
        k+=span
    p.finish()


def stair(spec):
    p=Part(spec["id"])
    a,b,c,d=spec["rect"]
    for step in range(6):
        z0=b+(d-b)*step/6
        z1=b+(d-b)*(step+1)/6
        y=spec["low"]+(spec["high"]-spec["low"])*(6-step)/6
        p.box((a+c)/2,(z0+z1)/2,spec["low"]-.015,c-a,z1-z0,y-spec["low"]+.015,STONE)
        p.box((a+c)/2,(z0+z1)/2,y-.035,c-a+.025,z1-z0+.025,.041,IVORY)
    p.finish()


def stall(spec,index):
    p=Part(spec["id"])
    a,b,c,d=spec["rect"]
    x=(a+c)/2
    base=1.2
    p.box(x,(b+d)/2,base,c-a,d-b,.83,BARK)
    for i in range(8):
        dx=a+(i+.5)*(c-a)/8
        p.box(dx,d+.025,base+.12,.32,.055,.62,tint(OAK,rng.choice([.87,.96,1.04])))
    p.box(x,(b+d)/2,base+.8,c-a+.16,d-b+.14,.13,OAK)
    for dx in (a+.05,c-.05):
        p.box(dx,b+.04,base,.11,.12,2.14,WOOD)
        p.box(dx,d-.35,base,.10,.1,1.84,WOOD)
    p.rod((a-.12,d-.34,base+1.84),(c+.12,d-.34,base+1.84),.06,BRASS)
    for i in range(9):
        l=a-.15+i*(c-a+.3)/9
        r=a-.15+(i+1)*(c-a+.3)/9
        color=spec["color"] if i%3!=2 else IVORY
        points=[(l,b-.1,base+2.16),(r,b-.1,base+2.16),(r,d-.31,base+1.84),(l,d-.31,base+1.84)]
        p.solid(points,[(0,1,2,3)],color)
        p.box((l+r)/2,d-.33,base+1.66,r-l,.05,.20,color)
        p.orb((l+r)/2,d-.33,base+1.67,(r-l)/2,.035,.11,color,8)
    ledge=base+.93
    if index==0:
        for i in range(12):
            px=a+.26+(i%6)*.43
            pz=d-.24-(i//6)*.44
            glass=["#56898a","#9d739c","#486e9d","#73a38b"][i%4]
            size=.15+(.065 if i%3==0 else 0)
            p.orb(px,pz,ledge+size,size,size,size,glass)
            p.rod((px,pz,ledge+size*1.7),(px,pz,ledge+size*2.8),.055,glass)
            p.rod((px,pz,ledge+size*2.8),(px,pz,ledge+size*2.8+.04),.06,BRASS)
    elif index==1:
        for i in range(5):
            px=a+.32+i*.50
            p.rod((px,b+.15,base+2.10),(px,b+.15,base+1.57),.014,BRASS)
            for j in (-1,0,1):
                p.orb(px+j*.09,b+.19,base+1.46+.06*abs(j),.08,.09,.19,FOLIAGE[(i+j)%4],5)
            flowerbox(p,px,d-.26,ledge,.44)
    else:
        px=x+.46
        p.box(px,d-.35,ledge,.53,.44,.10,WOOD)
        p.rod((px,d-.35,ledge+.1),(px,d-.35,ledge+.51),.08,BRASS)
        for slope in (0,.75):
            pts=[(px+math.cos(j*math.tau/20)*.39,d-.35+math.sin(j*math.tau/20)*slope*.31,
                  ledge+.69+math.sin(j*math.tau/20)*(.39-slope*.17)) for j in range(20)]
            for j in range(20): p.rod(pts[j],pts[(j+1)%20],.032,GOLD)
        p.orb(px,d-.35,ledge+.69,.13,.13,.13,"#538899")
        for i in range(3):
            p.box(a+.35+i*.24,d-.28,ledge+.08*i,.46,.41,.09,["#7e483b",INK,IVORY][i])
    p.finish()


def resting_place():
    p=Part("Inn_Garden")
    x,z=-7.90,9.40
    for j in range(4): p.box(x,z-.23+j*.13,.46,1.71,.115,.09,OAK)
    for j in range(2): p.box(x,z-.27,.66+j*.19,1.71,.09,.14,OAK)
    for dx in (-.66,.66): p.box(x+dx,z,.00,.15,.48,.55,WOOD)
    x,z=-10.1,10.05
    p.orb(x,z,.045,1.42,1.08,.05,"#a29172",16)
    p.orb(x,z,.069,1.29,.95,.045,"#819067",16)
    for i in range(19):
        angle=i*math.tau/19
        px,pz=x+1.03*math.cos(angle),z+.72*math.sin(angle)
        p.orb(px,pz,.125,.10,.11,.10,rng.choice(FOLIAGE),6)
        if i%3==0:
            p.orb(px,pz,.225,.056,.06,.055,"#e2bd83",6)
    p.rod((x,z,.05),(x+.08,z,2.38),.21,BARK,8)
    for dx,dz,dy in ((-.62,-.21,2.23),(.54,-.17,2.56),(.28,.57,2.31),(-.19,.04,3.03)):
        p.rod((x,z,1.38),(x+dx,z+dz,dy),.12,BARK)
        p.orb(x+dx,z+dz,dy+.18,.82,.74,.66,rng.choice(FOLIAGE[:3]),9)
        p.orb(x+dx-.18,z+dz-.15,dy+.49,.55,.58,.46,rng.choice(FOLIAGE[1:]),8)
    flowerbox(p,-8.99,9.25,.04,.64)
    p.finish()


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for key in DATA["terraces"]: terrace(key,DATA["stairs"])
    for key in DATA["stairs"]: stair(key)
    for i,key in enumerate(DATA["buildings"]): home(key,i)
    for i,key in enumerate(DATA["stalls"]): stall(key,i)
    resting_place()
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"terraced-market.blend"),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/"terraced-market.glb"),export_format="GLB",
                              export_cameras=False,export_lights=False,export_yup=True)


if __name__=="__main__":
    main()
