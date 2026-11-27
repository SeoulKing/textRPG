"""Author the Arcana plaza academy exterior in Blender 4.5.

Run blender --background --factory-startup --python scripts/blender/author_academy_exterior.py.
Append -- --preview to also render the asset review camera.
Geometry is defined as (east, south, height), with Blender's south at -Y.
"""
from math import atan2, cos, hypot, pi, sin, sqrt
from pathlib import Path
from random import Random
import json
import sys

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "godot-arcana/art/source/plaza-academy-blender"
REVIEW = ROOT / ".runtime/arcana-academy-exterior"
RNG = Random(20261123)


def linear(component):
    return component / 12.92 if component < .04045 else ((component + .055) / 1.055) ** 2.4


def material(name, color, roughness=.87, metallic=0, glow=0):
    rgb = tuple(linear(int(color[i:i+2], 16) / 255) for i in (0, 2, 4))
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if glow:
        shader.inputs["Emission Color"].default_value = (*rgb, 1)
        shader.inputs["Emission Strength"].default_value = glow
    return mat


class BuildingPart:
    def __init__(self, name):
        self.name = name
        self.vertices, self.faces, self.indices, self.palette = [], [], [], []

    def mesh(self, vertices, faces, mat):
        self.mesh_surfaces(vertices, ((faces, mat),))

    def mesh_surfaces(self, vertices, surfaces):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        for faces, mat in surfaces:
            if mat not in self.palette:
                self.palette.append(mat)
            self.faces.extend(tuple(index + offset for index in face) for face in faces)
            self.indices.extend([self.palette.index(mat)] * len(faces))

    def prism(self, start, end, mat):
        count = len(start)
        faces = [tuple(reversed(range(count))), tuple(range(count, 2 * count))]
        faces.extend((i, (i+1) % count, (i+1) % count + count, i+count) for i in range(count))
        self.mesh([*start, *end], faces, mat)

    def block(self, x0, x1, d0, d1, z0, z1, mat):
        contour = [(x0,d0),(x1,d0),(x1,d1),(x0,d1)]
        self.prism([(x,d,z0) for x,d in contour], [(x,d,z1) for x,d in contour], mat)

    def face_xy(self, outline, depth, thickness, mat, plane=None):
        plane = plane or south(0, 0)
        self.prism([plane(u, depth - thickness, h) for u,h in outline],
                   [plane(u, depth, h) for u,h in outline], mat)

    def face_rect(self, x0, x1, z0, z1, depth, thick, mat, plane=None):
        self.face_xy([(x0,z0),(x1,z0),(x1,z1),(x0,z1)], depth, thick, mat, plane)

    def axis(self, start, end, radius, end_radius, mat, sides=8):
        start, end = Vector(start), Vector(end)
        direction = (end - start).normalized()
        helper = Vector((0, 0, 1) if abs(direction.z) < .95 else (0, 1, 0))
        right = direction.cross(helper).normalized()
        up = direction.cross(right)
        def perimeter(center, size):
            return [center + size * (cos(2*pi*i/sides) * right + sin(2*pi*i/sides) * up)
                    for i in range(sides)]
        size = max(.002, end_radius)
        self.prism(perimeter(start, radius), perimeter(end, size), mat)

    def beam(self, a, b, radius, mat):
        self.axis(a,b,radius,radius,mat,6)

    def rings(self, x, d, profile, mat, sides=8, offset=pi/8):
        loops = [[(x+r*cos(2*pi*i/sides+offset), d+r*sin(2*pi*i/sides+offset), z)
                  for i in range(sides)] for z,r in profile]
        vertices = [v for loop in loops for v in loop]
        faces = [tuple(range(sides-1, -1, -1))]
        for ring in range(len(loops)-1):
            for side in range(sides):
                a = ring*sides + side
                b = ring*sides + (side+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(range((len(loops)-1)*sides,len(loops)*sides)))
        self.mesh(vertices, faces, mat)

    def create(self, collection):
        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([(x,-d,z) for x,d,z in self.vertices], [], self.faces)
        mesh.update()
        for mat in self.palette:
            mesh.materials.append(mat)
        for polygon, mat_index in zip(mesh.polygons, self.indices):
            polygon.material_index = mat_index
        topology = bmesh.new()
        topology.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(topology, faces=list(topology.faces))
        topology.to_mesh(mesh)
        topology.free()
        obj = bpy.data.objects.new(self.name, mesh)
        collection.objects.link(obj)
        obj["part"] = self.name
        return obj


def south(x, d):
    return lambda u, offset, z: (x+u,d+offset,z)


def east(x, d):
    return lambda u, offset, z: (x+offset,d-u,z)


def west(x, d):
    return lambda u, offset, z: (x-offset,d+u,z)


def north(x, d):
    return lambda u, offset, z: (x-u,d-offset,z)


def bevel_block(part,x0,x1,d0,d1,h0,h1,bevel,mat,edge):
    contour = [
        (x0+bevel,d0),(x1-bevel,d0),(x1,d0+bevel),(x1,d1-bevel),
        (x1-bevel,d1),(x0+bevel,d1),(x0,d1-bevel),(x0,d0+bevel),
    ]
    inset = bevel * 1.45
    corners = [
        (x0 + inset, d0 + inset), (x1 - inset, d0 + inset),
        (x1 - inset, d1 - inset), (x0 + inset, d1 - inset),
    ]
    bevel_height = bevel * .55
    vertices = [
        *((x, d, h0) for x, d in corners),
        *((x, d, h0 + bevel_height) for x, d in contour),
        *((x, d, h1 - bevel_height) for x, d in contour),
        *((x, d, h1) for x, d in corners),
    ]
    bottom = range(4)
    lower_rim = range(4, 12)
    upper_rim = range(12, 20)
    top = range(20, 24)
    bevel_faces = [tuple(reversed(bottom)), tuple(top)]
    side_faces = []
    # Both rims share one shell and one cap per end.
    corner_at_rim = (0, 1, 1, 2, 2, 3, 3, 0)
    for i, corner in enumerate(corner_at_rim):
        j = (i + 1) % len(contour)
        next_corner = corner_at_rim[j]
        side_faces.append((lower_rim[i], lower_rim[j], upper_rim[j], upper_rim[i]))
        if corner == next_corner:
            bevel_faces.append((bottom[corner], lower_rim[j], lower_rim[i]))
            bevel_faces.append((upper_rim[i], upper_rim[j], top[corner]))
        else:
            bevel_faces.append((bottom[corner], bottom[next_corner], lower_rim[j], lower_rim[i]))
            bevel_faces.append((upper_rim[i], upper_rim[j], top[next_corner], top[corner]))
    part.mesh_surfaces(vertices, ((side_faces, mat), (bevel_faces, edge)))


def pointed(width, foot, spring, head):
    half = width * .5
    right = [(half*(1-(step/8)**2), spring + head*step/8) for step in range(9)]
    return [(-half,foot),(half,foot),*right,*[(-x,z) for x,z in reversed(right[:-1])]]


def arch_band(part, outside, inside, front, depth, mat, plane=None):
    plane = plane or south(0, 0)
    count = len(outside)
    # Keep the reveal open and give each tapered stone its own short return.
    for i in range(count):
        j = (i+1) % count
        outline = [outside[i],outside[j],inside[j],inside[i]]
        part.face_xy(outline,front,depth,mat,plane)


def window(part, plane, width, z, body, head, color=None):
    edge = pointed(width+.29,z-.07,z+body+.035,head+.16)
    reveal = pointed(width+.04,z+.02,z+body,head+.04)
    inner = pointed(width-.18,z+.06,z+body-.02,head-.04)
    arch_band(part,edge,reveal,.15,.20,TRIM,plane)
    arch_band(part,reveal,inner,.125,.11,MORTAR,plane)
    part.face_xy(inner,.042,.084,color or AMBER,plane)
    part.face_rect(-.028,.028,z+.026,z+body+.04,.081,.056,BRASS,plane)
    part.face_rect(-width*.40,width*.40,z+body*.80,z+body*.80+.05,.078,.045,BRASS,plane)
    part.face_xy([(0,z+body+.035),(-.11,z+body+.18),(0,z+body+.33),(.11,z+body+.18)],
                 .092,.026,AZURE,plane)
    part.face_rect(-width*.62,width*.62,z-.15,z-.055,.25,.38,TRIM,plane)


def star(part, plane, z, radius, depth, mat=None, rays=8):
    outline=[]
    for point in range(2*rays):
        theta=pi/2 + point*pi/rays
        arm = radius * (1 if point%(4 if rays==8 else 2)==0 else
                        .66 if point%2==0 else .22)
        outline.append((arm*cos(theta),z+arm*sin(theta)))
    part.face_xy(outline,depth,.074,mat or SPUN_GOLD,plane)


def gold_spire(part, x, d, z, height, radius):
    part.rings(x,d,[(z,.19*radius),(z+.14*height,.25*radius),
                    (z+.29*height,.21*radius),(z+.36*height,.105*radius),
                    (z+.54*height,.15*radius),(z+.62*height,.088*radius),
                    (z+.74*height,.11*radius),(z+.83*height,.046*radius),
                    (z+height,.009)],SPUN_GOLD,8)


def roof(part, x0, x1, d0, d1, eave, ridge, rows):
    mid = (d0+d1)/2
    xs = x1-x0
    part.prism([(x0,d0+.13,eave-.03),(x0,d1-.13,eave-.03),(x0,mid,ridge-.12)],
               [(x1,d0+.13,eave-.03),(x1,d1-.13,eave-.03),(x1,mid,ridge-.12)],STONE)
    for edge in (d0,d1):
        run = edge-mid
        def patch(u0,u1,t0,t1,mat,lift=0):
            a,b=mid+run*t0,mid+run*t1
            z0,z1=ridge-(ridge-eave)*t0+lift,ridge-(ridge-eave)*t1+lift
            contour=[(u0,a,z0),(u1,a,z0),(u1,b,z1),(u0,b,z1)]
            part.prism([(u,d,z-.10) for u,d,z in contour],contour,mat)
        patch(x0,x1,0,1,SLATE_SHADOW)
        count = max(3,round(xs/.48))
        for row in range(rows):
            t0,t1=(row+.035)/rows,(row+.965)/rows
            spacing = xs/count
            for column in range(count+1):
                u0=max(x0+.025,x0+spacing*(column-(row%2)*.5)+.021)
                u1=min(x1-.025,x0+spacing*(column+1-(row%2)*.5)-.021)
                if u1-u0>.08:
                    patch(u0,u1,t0,t1,RNG.choices(SLATES,[3,9,4,2])[0],.042)
        part.beam((x0,edge,eave-.02),(x1,edge,eave-.02),.111,SLATE_SHADOW)
        for x in (x0,x1):
            part.beam((x,edge,eave),(x,mid,ridge),.077,BRASS)
    part.beam((x0,mid,ridge),(x1,mid,ridge),.118,SLATE_SHADOW)
    part.beam((x0+.15,mid,ridge+.076),(x1-.15,mid,ridge+.076),.032,BRASS)


def buttress(part, x, d, h, width=.30):
    part.block(x-width*.75,x+width*.75,d-.15,d+.36,.14,.40,BASE)
    part.block(x-width*.5,x+width*.5,d-.18,d+.24,.40,h,TRIM)
    for level in (h*.48,h*.94):
        part.block(x-width*.69,x+width*.69,d-.17,d+.30,level,level+.101,LIGHT_STONE)


def masonry_courses(part, plane, width, top, base=.29):
    for row in range(int((top-base)/.44)):
        z = base+.44*(row+1)
        if z < top-.2:
            part.face_rect(-width*.499,width*.499,z,z+.025,.024,.037,STONE_SHADOW,plane)
            for tile in range(int(width/.78)):
                x=-width*.5+(.78*(tile+(.53 if row%2 else .95)))
                if -width*.47 < x < width*.47:
                    part.face_rect(x,x+.025,z-.42,z-.025,.027,.04,STONE_SHADOW,plane)


def tower_shell(x,d, main, label):
    part=BuildingPart(label)
    radius=1.22 if main else .75
    body=8.23 if main else 4.85
    lead=8.35 if main else 4.96
    tip=12.19 if main else 6.39
    part.rings(x,d,[(0,radius*1.05),(.18,radius*1.13),(.36,radius*1.10),
                    (.49,radius),(body-.21,radius),(body-.10,radius*1.1),(lead,radius*1.1)],STONE)
    for floor in ((.51,2.46,4.41,6.37,7.95) if main else (.45,2.34,4.61)):
        part.rings(x,d,[(floor,radius*1.006),(floor+.052,radius*1.10),
                    (floor+.155,radius*1.07),(floor+.195,radius*1.003)],TRIM)
    face_distance=radius*cos(pi/8)-.018
    for plane in (south(x,d+face_distance), east(x+face_distance,d), west(x-face_distance,d)):
        for level in ((.73,2.68,4.63,6.53) if main else (1.20,3.06)):
            window(part,plane,.92 if main else .49,level,1.08 if main else .73,.40 if main else .24)
    roof_profile=[(lead,radius*1.09),(lead+.18,radius*1.14),(lead+.43,radius*.98),
                  (lead+(tip-lead)*.53,radius*.54),(tip,radius*.089)]
    part.rings(x,d,roof_profile,SLATES[1],8)
    for (z0,r0),(z1,r1) in zip(roof_profile,roof_profile[1:]):
        for index in range(8):
            angle=2*pi*index/8+pi/8
            part.beam((x+(r0+.012)*cos(angle),d+(r0+.012)*sin(angle),z0),
                      (x+(r1+.012)*cos(angle),d+(r1+.012)*sin(angle),z1),.046 if main else .025,BRASS)
    for i in range(1,6 if main else 4):
        z=lead+(tip-lead)*i/(6 if main else 4)
        for (h0,r0),(h1,r1) in zip(roof_profile,roof_profile[1:]):
            if h0 <= z <= h1:
                r=r0+(r1-r0)*(z-h0)/(h1-h0)
                part.rings(x,d,[(z-.026,r+.021),(z+.009,r+.015)],SLATE_SHADOW)
                break
    gold_spire(part,x,d,tip-.015,.61 if main else .37,radius)
    if main:
        star(part,south(x,d),12.96,.275,.055,rays=4)
        star(part,east(x,d),12.96,.275,.055,rays=4)
        for index in (0,2,4,6):
            angle=2*pi*index/8+pi/8
            px=x+radius*.91*cos(angle)
            pd=d+radius*.91*sin(angle)
            part.rings(px,pd,[(body-.43,.20),(lead+.11,.18),(lead+.22,.20)],TRIM,8)
            gold_spire(part,px,pd,lead+.19,.56,.91)
    return part


def dormer(part,x,d,z):
    plane=south(x,d)
    part.face_xy([(-.43,z),(.43,z),(.43,z+.51),(0,z+.98),(-.43,z+.51)],
                 .02,.69,STONE,plane)
    window(part,plane,.42,z+.13,.42,.15)
    for sign in (-1,1):
        part.beam(plane(sign*.47,.068,z+.48),plane(0,.068,z+.99),.102,TRIM)
    gold_spire(part,x,d-.036,z+.97,.31,.53)


def planter(part, x, d, z, width):
    part.block(x-width*.5,x+width*.5,d-.15,d+.21,z,z+.14,BASE)
    part.block(x-width*.52,x+width*.52,d-.17,d+.23,z+.13,z+.20,TRIM)
    for column in range(max(2,int(width/.20))):
        leaf(part,x-width*.43+width*.86*(column+.5)/max(2,int(width/.20)),
            d+.04,z+.20+RNG.uniform(0,.065),.15,column%3==0)


def leaf(part,x,d,z,size,flower):
    symbols=((0,0,.75),(-.71,.13,.09),(-.52,.38,-.55),(0,.36,-.75),(.60,.11,-.51),(.71,-.10,.19))
    outline=[(x+i*size,d+j*size,z+k*size) for i,j,k in symbols]
    front=(x,d+size*.4,z+size*.05)
    for i in range(6):
        part.mesh([front,outline[i],outline[(i+1)%6]],[(0,1,2)],LEAVES[i%len(LEAVES)])
    if flower:
        center=(x+.028,d+size*.47,z+size*.32)
        for direction in range(4):
            theta=pi*.5*direction
            px=center[0]+cos(theta)*size*.31
            pz=center[2]+sin(theta)*size*.31
            part.face_xy([(px-.036,pz),(px,pz+.042),(px+.037,pz),(px,pz-.04)],center[1],
                         .028,FLOWERS[direction%2])


def ivy(part, path, width, stride):
    for start,end in zip(path,path[1:]):
        a,b=Vector(start),Vector(end)
        steps=max(1,round((b-a).length/stride))
        for index in range(steps):
            x,d,z=a.lerp(b,index/steps)
            leaf(part,x+RNG.uniform(-width,width),d+RNG.uniform(-.03,.06),
                 z+RNG.uniform(-.048,.048),RNG.uniform(.115,.19),index%3!=1)
            if index%2:
                leaf(part,x+RNG.uniform(-width,width),d+.08,z+.09,.13,index%4==1)


def wing(sign,label):
    part=BuildingPart(label)
    bounds=(-11.01,-4.60) if sign<0 else (4.60,11.01)
    x0,x1=bounds
    center=(x0+x1)/2
    bevel_block(part,x0,x1,-3.86,2.55,.19,4.74,.15,STONE,TRIM)
    masonry_courses(part,south(center,2.545),x1-x0,4.65)
    for z in (.20,2.38,4.29,4.62):
        part.block(x0-.08,x1+.08,-3.94,2.65,z,z+.14,TRIM)
    for x in (center-2.23,center-.74,center+.74,center+2.23):
        for level in (.55,2.60):
            window(part,south(x,2.55),.96,level,1.12,.36)
    for x in (center-3.02,center-1.48,center,center+1.48,center+3.02):
        buttress(part,x,2.53,4.55,.27)
    side_x=x0 if sign<0 else x1
    side=east if sign>0 else west
    masonry_courses(part,side(side_x,-.62),6.1,4.58)
    for d in (-2.69,-.79,1.14):
        for z in (.59,2.64):
            window(part,side(side_x,d),1.02,z,1.08,.39)
    for x in (center-1.78,center,center+1.78):
        window(part,north(x,-3.85),1.03,2.65,1.09,.39)
    roof_part=BuildingPart(label+" | layered cobalt roof")
    roof(roof_part,x0-.205,x1+.205,-4.14,2.79,4.76,6.75,7)
    for x in (center-1.98,center,center+1.98):
        dormer(roof_part,x,1.13,5.26)
    for x in (x0+.53,x1-.53):
        gold_spire(roof_part,x,-.68,6.74,.46,.78)
    return part,roof_part


def central_hall():
    part=BuildingPart("Central hall and projecting Gothic pediment")
    bevel_block(part,-3.76,3.76,-4.01,2.52,.20,5.43,.18,STONE,TRIM)
    for z in (.22,2.51,5.25):
        part.block(-3.87,3.87,-4.14,2.65,z,z+.11,TRIM)
    cover=BuildingPart("Main hall and transverse portal roofs")
    roof(cover,-3.75,3.75,-4.27,3.08,5.50,7.42,7)
    roof_face=[(-2.19,5.09),(2.19,5.09),(0,7.47)]
    part.face_xy(roof_face,3.49,.67,STONE)
    for sign in (-1,1):
        part.beam((sign*2.19,3.55,5.09),(0,3.55,7.47),.149,TRIM)
        part.beam((sign*2.17,3.67,5.16),(0,3.67,7.52),.091,LIGHT_STONE)
        cover.beam((sign*2.22,3.66,5.18),(0,3.66,7.56),.083,BRASS)
        x0=sign*2.19
        cover.prism([(0,2.02,7.09),(x0,2.02,4.90),(x0,3.58,4.96),(0,3.58,7.37)],
                    [(0,2.02,7.24),(x0,2.02,5.05),(x0,3.58,5.11),(0,3.58,7.52)],SLATES[1])
    part.block(-2.16,-1.49,2.39,3.47,.24,5.24,TRIM)
    part.block(1.49,2.16,2.39,3.47,.24,5.24,TRIM)
    part.block(-2.16,2.16,2.39,3.46,3.75,5.24,STONE)
    for sign in (-1,1):
        buttress(part,sign*2.15,3.51,5.00,.31)
        for d in (3.50,3.78):
            gold_spire(part,sign*2.14,d,5.05,.56,.82)
    gold_spire(cover,0,3.55,7.55,.59,.85)
    return part,cover


def portal():
    part=BuildingPart("Fitted entrance limestone reveals and threshold")
    frame=south(0,3.55)
    for h,w,front in ((.12,3.59,4.90),(.25,3.44,4.65),(.37,3.27,4.39)):
        bevel_block(part,-w*.5,w*.5,3.25,front,h-.12,h,.065,TRIM,LIGHT_STONE)
    arch_band(part,pointed(3.37,.37,2.48,1.31),pointed(2.83,.39,2.41,1.09),.34,.48,TRIM,frame)
    arch_band(part,pointed(2.87,.38,2.42,1.12),pointed(2.55,.40,2.31,1.04),.256,.28,LIGHT_STONE,frame)
    arch_band(part,pointed(2.54,.405,2.31,1.035),pointed(2.35,.41,2.24,.98),.18,.24,STONE_SHADOW,frame)
    for sign in (-1,1):
        part.block(sign*1.77-.21,sign*1.77+.21,3.45,4.45,.15,.36,BASE)
        part.block(sign*1.77-.15,sign*1.77+.15,3.49,4.38,.34,1.08,TRIM)
        part.block(sign*1.77-.21,sign*1.77+.21,3.44,4.44,1.06,1.20,LIGHT_STONE)
        gold_spire(part,sign*1.78,3.92,1.18,.44,.78)
    doors=BuildingPart("Oak double doors with astral transom")
    for sign in (-1,1):
        x=sign*.57
        leaf_outline=[(x-.56,.405),(x+.56,.405),(x+.56,2.28),(x-.56,2.28)]
        doors.face_xy(leaf_outline,-.087,.155,OAK,frame)
        for i in (-1,0,1):
            doors.face_rect(x+i*.26-.037,x+i*.26+.037,.45,2.22,-.065,.049,OAK_EDGE,frame)
        for z in (.66,1.22,1.93):
            doors.face_rect(x-.44,x+.44,z,z+.079,-.039,.052,BRASS,frame)
        doors.face_rect(sign*.17-.058,sign*.17+.058,1.19,1.34,-.012,.06,SPUN_GOLD,frame)
        star(doors,south(x,3.50),1.64,.145,.03)
    top=[(-1.15,2.20),(1.15,2.20),*pointed(2.30,2.20,2.25,.94)[2:]]
    doors.face_xy(top,-.094,.10,NIGHT,frame)
    star(doors,frame,2.66,.37,-.036)
    doors.face_rect(-1.16,1.16,2.20,2.27,-.016,.057,BRASS,frame)
    return part,doors


def school_seal():
    part=BuildingPart("Cobalt heraldry | star and open book")
    face=south(0,3.51)
    z=4.74
    part.axis((0,3.485,z),(0,3.61,z),1.20,1.20,BRASS,24)
    part.axis((0,3.55,z),(0,3.654,z),1.11,1.11,NIGHT,24)
    part.axis((0,3.62,z),(0,3.669,z),1.04,1.04,AZURE,24)
    star(part,face,5.21,.51,.20)
    for sign in (-1,1):
        part.face_xy([(sign*.02,4.43),(sign*.48,4.48),(sign*.56,4.36),
                      (sign*.56,4.83),(sign*.25,4.92),(sign*.02,4.82)],.233,.061,BRASS,face)
        part.face_xy([(sign*.04,4.49),(sign*.48,4.53),(sign*.48,4.82),
                      (sign*.24,4.85),(sign*.04,4.80)],.255,.049,PARCHMENT,face)
        for index in range(3):
            z_line=4.60+index*.073
            part.face_rect(min(sign*.13,sign*.39),max(sign*.13,sign*.39),z_line,z_line+.024,
                           .263,.014,BOOK_RULE,face)
    for quarter in range(8):
        a=pi*.25*quarter
        star(part,south(cos(a)*.94,3.51),z+sin(a)*.92,.066,.20,rays=4)
    for x in (-2.55,2.55):
        plane=south(x,3.57)
        part.face_xy([(-.30,4.12),(-.30,2.19),(0,1.96),(.30,2.19),(.30,4.12)],.035,.08,
                     BRASS,plane)
        part.face_xy([(-.24,4.06),(-.24,2.23),(0,2.045),(.24,2.23),(.24,4.06)],.071,.08,
                     AZURE,plane)
        part.beam(plane(-.37,.084,4.11),plane(.37,.084,4.11),.043,SPUN_GOLD)
        star(part,plane,3.41,.23,.097)
        star(part,plane,2.55,.139,.098,rays=4)
    return part


def observatory():
    part=BuildingPart("Observatory drum and Gothic lantern gallery")
    x,d=8.55,-2.46
    radius=2.29
    part.rings(x,d,[(4.28,2.20),(4.48,2.25),(7.24,2.25),(7.35,2.37),(7.57,2.37),
                    (7.73,2.31)],STONE,16)
    for z in (4.51,5.17,7.19,7.51):
        part.rings(x,d,[(z,radius*.996),(z+.103,radius*1.024),(z+.17,radius)],TRIM,16)
    for angle in (-.27,.24,.75,1.26,1.77,2.28):
        px,pd=x+2.213*cos(angle),d+2.213*sin(angle)
        def face(u,offset,z):
            return (px+u*sin(angle)+offset*cos(angle),pd-u*cos(angle)+offset*sin(angle),z)
        window(part,face,.95,5.42,1.12,.38)
    for angle in (-.38,.35,1.09,1.82,2.55,3.28,4.01,4.74,5.47):
        px,pd=x+2.27*cos(angle),d+2.27*sin(angle)
        part.rings(px,pd,[(7.17,.19),(7.47,.21),(7.77,.172),(7.88,.18)],TRIM)
        gold_spire(part,px,pd,7.86,.45,.68)
    dome=BuildingPart("Observatory layered cobalt dome and gold ribs")
    base, rise, angle=7.67,2.47,.33
    def shell(a,b,f=0):
        return (x+(radius+f)*cos(b)*cos(a),d+(radius+f)*cos(b)*sin(a),base+(rise+f)*sin(b))
    lap=24
    for row in range(8):
        v0,v1=pi*.5*row/8,pi*.5*(row+.978)/8
        for column in range(lap):
            a0=angle + 2*pi*(column-.5)/lap
            a1=angle + 2*pi*(column+.5)/lap
            slit = column==0 and row>=1
            inset = -.06 if slit else 0
            dome.prism([shell(a0,v0,inset-.044),shell(a1,v0,inset-.044),
                        shell(a1,v1,inset-.044),shell(a0,v1,inset-.044)],
                       [shell(a0,v0,inset),shell(a1,v0,inset),shell(a1,v1,inset),shell(a0,v1,inset)],
                       NIGHT if slit else RNG.choices(SLATES,[3,8,5,1])[0])
    for band in (angle-pi/lap,angle+pi/lap,angle+pi*.47,angle+pi*.94,angle+pi*1.4):
        for row in range(15):
            v0,v1=pi*.5*row/15,pi*.5*(row+1)/15
            dome.beam(shell(band,v0,.041),shell(band,v1,.041),.059,BRASS)
    dome.rings(x,d,[(base-.06,radius+.105),(base+.05,radius+.105),(base+.087,radius+.065)],SPUN_GOLD,24)
    gold_spire(dome,x,d,10.14,.37,.78)

    telescope=BuildingPart("Brass observatory telescope with lens")
    start=Vector((9.08,-2.32,8.47))
    end=Vector((11.54,-1.48,9.49))
    direction=(end-start).normalized()
    for a,b,r0,r1,mat in ((0,.35,.30,.265,BRASS),(.35,.70,.258,.231,BRASS),
                          (.70,1,.230,.264,SPUN_GOLD),(.22,.28,.31,.31,SPUN_GOLD),
                          (.53,.58,.276,.276,SPUN_GOLD),(.91,1,.293,.293,BRASS)):
        telescope.axis(start.lerp(end,a),start.lerp(end,b),r0,r1,mat,12)
    telescope.axis(end-direction*.005,end+direction*.038,.216,.215,NIGHT,14)
    telescope.axis(end+direction*.035,end+direction*.055,.172,.169,GLASS,14)
    return part,dome,telescope


def vines():
    part=BuildingPart("Lilac climbing vines and planted window sills")
    for sign in (-1,1):
        xs=[sign*value for value in (10.76,6.65,4.84,2.03)]
        for index,x in enumerate(xs):
            d=2.58 if index<3 else 3.72
            h=(4.36,3.79,6.86,3.55)[index]
            ivy(part,[(x-sign*.20,d,.31),(x+sign*.14,d+.025,h*.4),
                      (x-sign*.09,d,h*.72),(x+sign*.04,d,h)],.16,.15)
        for x in (sign*5.58,sign*7.58,sign*9.57):
            for z in (.50,2.54):
                planter(part,x,2.65,z,1.25)
    for x in (-2.0,2.0):
        planter(part,x,3.95,.20,.55)
    return part


def threshold_lamps():
    part=BuildingPart("Gold vestibule lanterns")
    for x in (-1.96,1.96):
        d=3.94
        z=2.35
        part.beam((x,3.55,z+.25),(x,d,z+.25),.056,BRASS)
        part.rings(x,d,[(z-.38,.092),(z-.29,.179),(z-.255,.171)],BRASS,6)
        part.rings(x,d,[(z+.026,.166),(z+.061,.181),(z+.21,.094)],BRASS,6)
        part.rings(x,d+.002,[(z-.273,.164),(z+.057,.164)],AMBER,6)
        for i in range(6):
            angle=2*pi*i/6 + pi/8
            dx=.178*cos(angle)
            dd=.178*sin(angle)
            part.beam((x+dx,d+dd,z-.28),(x+dx,d+dd,z+.042),.022,BRASS)
        gold_spire(part,x,d,z+.20,.34,.58)
    return part


def preview(scene):
    world=bpy.data.worlds.new("Plaza daylight")
    world.use_nodes=True
    bg=world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value=(.48,.57,.74,1)
    bg.inputs["Strength"].default_value=.34
    scene.world=world
    review=bpy.data.collections.new("Asset review | excluded from GLB")
    scene.collection.children.link(review)
    def look_at(obj,target):
        obj.rotation_euler=(Vector(target)-obj.location).to_track_quat("-Z","Y").to_euler()
    camera=bpy.data.objects.new("2-to-1 review camera",bpy.data.cameras.new("2-to-1 ortho"))
    review.objects.link(camera)
    # Equal X and -Y with a 30 degree downward angle.
    camera.location=(23,-23,24.13)
    look_at(camera,(0,0,5.35))
    camera.data.type="ORTHO"
    camera.data.ortho_scale=28.4
    scene.camera=camera

    def light(name, kind, location, target, energy, color, size):
        obj=bpy.data.objects.new(name,bpy.data.lights.new(name,kind))
        review.objects.link(obj)
        obj.location=location
        look_at(obj,target)
        obj.data.energy=energy
        obj.data.color=color
        if kind=="AREA":
            obj.data.shape="DISK"
            obj.data.size=size
        else:
            obj.data.angle=size
    light("Warm plaza daylight","SUN",(-16,-18,25),(0,0,0),2.1,(1,.89,.73),.11)
    light("Cool courtyard bounce","AREA",(5,-11,8),(0,0,4),535,(.71,.79,1),15)
    scene.render.engine="BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples=24
    scene.render.resolution_x=910
    scene.render.resolution_y=740
    scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.view_settings.view_transform="AgX"
    scene.view_settings.look="AgX - Medium High Contrast"
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type=="VIEW_3D":
                area.spaces.active.region_3d.view_perspective="CAMERA"


bpy.ops.wm.read_factory_settings(use_empty=True)
BASE=material("Muted stone plinth","958570")
STONE=material("Ivory limestone","cfbd9b")
TRIM=material("Cream carved limestone","dfcbaa")
LIGHT_STONE=material("Rounded stone edges","eee0c0")
STONE_SHADOW=material("Soft limestone bedding joints","bba688")
MORTAR=material("Deep window reveals","816951")
SLATE_SHADOW=material("Cobalt slate underlay","263961")
SLATES=[material("Cobalt slate "+name,color,.81) for name,color in
        (("aged","3c558d"),("field","40649f"),("light","5374b0"),("deep","344f86"))]
BRASS=material("Warm aged brass","be944f",.62,.34)
SPUN_GOLD=material("Star gold and gilded edges","e6bf72",.48,.38)
NIGHT=material("Dark starfield","202e55",.79)
AZURE=material("Cobalt enamel","2e4c8c",.6)
AMBER=material("Honey glass","e9bc76",.62,0,.17)
GLASS=material("Jade telescope lens","407986",.32,.02,.12)
OAK=material("Aged oak doors","745139",.92)
OAK_EDGE=material("Oak panel edges","997353",.91)
PARCHMENT=material("Ivory book enamel","f2d59d",.84)
BOOK_RULE=material("Small gilded page joints","d0a967",.89)
LEAVES=[material("Garden foliage "+str(i),color,.98) for i,color in
        enumerate(("314f3f","416347","557652","71855b"))]
FLOWERS=[material("Lilac flowers "+str(i),color,.98) for i,color in
         enumerate(("978bb5","c2aabc"))]

scene=bpy.context.scene
scene.unit_settings.system="METRIC"
scene.unit_settings.scale_length=1.0
collection=bpy.data.collections.new("Arcana Academy exterior")
scene.collection.children.link(collection)
base=BuildingPart("Stone course base with projecting entry")
bevel_block(base,-11.78,11.78,-4.67,3.89,0,.19,.113,BASE,TRIM)
parts=[base,*wing(-1,"West classroom wing"),*wing(1,"East classroom wing"),*central_hall(),
       tower_shell(-3.68,2.56,True,"West star spire"),tower_shell(3.68,2.56,True,"East star spire"),
       *[tower_shell(sign*10.94,d,False,f"{side} {label} turret")
         for sign,side in ((-1,"West"),(1,"East")) for d,label in ((2.53,"front"),(-3.55,"rear"))],
       *portal(),school_seal(),*observatory(),vines(),threshold_lamps()]
objects=[part.create(collection) for part in parts]

bounds={axis:[min(v[index] for part in parts for v in part.vertices),
              max(v[index] for part in parts for v in part.vertices)]
        for index,axis in enumerate(("x","depth","height"))}
if not (-12 <= bounds["x"][0] < bounds["x"][1] <= 12 and
        -5 <= bounds["depth"][0] < bounds["depth"][1] <= 5 and
        0 <= bounds["height"][0] < bounds["height"][1] <= 13.5):
    raise ValueError(f"Academy mesh exceeded its gameplay envelope: {bounds}")

OUTPUT.mkdir(parents=True,exist_ok=True)
REVIEW.mkdir(parents=True,exist_ok=True)
preview(scene)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.object.select_all(action="DESELECT")
for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/"academy-exterior.blend"),compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT/"academy-exterior.glb"),export_format="GLB",
                          use_selection=True,export_yup=True,export_apply=True,
                          export_cameras=False,export_lights=False)
print("ARCANA_ACADEMY_MESH_BOUNDS",json.dumps(bounds,sort_keys=True),flush=True)
print("ARCANA_ACADEMY_PARTS",len(objects),"faces",sum(len(obj.data.polygons) for obj in objects),flush=True)
script_args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
if "--preview" in script_args:
    scene.render.filepath=str(REVIEW/"academy-exterior-preview.png")
    bpy.ops.render.render(write_still=True)

