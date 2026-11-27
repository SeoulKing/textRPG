from pathlib import Path
from PIL import Image, ImageDraw
import argparse
from collections import deque
from math import cos, pi, sin
import json
import numpy as np

DEFAULT_WORK = Path(".runtime/arcana-kitchen-layout-v3")
SIZE = (352,288)
TILE = 64
GRID = 5
ORIGIN = (176,105)
POSE = None
INK = "40312e"
layers = []

def layer(name, visible=True):
    global im,pencil
    im=Image.new("RGBA",SIZE,(0,0,0,0))
    pencil=ImageDraw.Draw(im)
    layers.append((name,im,visible))

def P(u,v,z=0):
    if POSE is not None:
        a,b,x,y,su,sv,sz=POSE
        u,v,z=x+(u-a)*su,y+(v-b)*sv,z*sz
    return round(ORIGIN[0]+(u-v)/2),round(ORIGIN[1]+(u+v)/4-z)

def poly(points,color,edge=None):
    pencil.polygon(points,fill="#"+color,outline="#"+edge if edge else None)

def stroke(points,color,width=1):
    pencil.line(points,fill="#"+color,width=width)

def pixel(x,y,c):
    pencil.point((x,y),fill="#"+c)

def coords(q,points):
    if q=="u":
        return [P(a,b,z) for a,b,z in points]
    return [P(b,a,z) for a,b,z in points]

def face(plane,fixed,a0,a1,z0,z1,color,edge=None):
    poly(coords(plane,[(fixed,a0,z0),(fixed,a1,z0),(fixed,a1,z1),(fixed,a0,z1)]),color,edge)

def side_shape(plane,fixed,path,color,edge=None):
    poly(coords(plane,[(fixed,a,z) for a,z in path]),color,edge)

def side_line(plane,fixed,path,color,width=1):
    stroke(coords(plane,[(fixed,a,z) for a,z in path]),color,width)

def top(u0,v0,u1,v1,z,color,edge=None):
    poly([P(u0,v0,z),P(u1,v0,z),P(u1,v1,z),P(u0,v1,z)],color,edge)

def box(u0,v0,u1,v1,z0,z1,tones,edge=INK):
    bright,left,right=tones
    face("u",u1,v0,v1,z0,z1,left,edge)
    face("v",v1,u0,u1,z0,z1,right,edge)
    top(u0,v0,u1,v1,z1,bright,edge)

def rim(u0,v0,u1,v1,z,color):
    stroke([P(u0,v1,z),P(u1,v1,z),P(u1,v0,z)],color)

# Each finished piece is layered in the room at the 64-wide, 32-high tile scale.
STONE = ("ead0a5","af8d72","c1a084")
WOOD = ("c38b51","8c5b3e","a56c43")
OAK_DARK = ("a87347","775038","93603d")
STONE_EDGE = "72564a"
WOOD_EDGE = "624331"
NAVY = "3b4d67"
NAVY_DK = "2c3a4b"
NAVY_LIT = "556d83"
BRASS = "d9a962"
BRASS_DK = "99633f"

def shape_from(plane,fixed,track,z,points,color,border=None):
    side_shape(plane,fixed,[(a+track,h+z) for a,h in points],color,border)

def face_joint(plane,fixed,a0,a1,z0,z1,flip=False):
    base="a98a70" if flip else "b49a81"
    side_line(plane,fixed,[(a0,z0),(a1,z0)],base)
    side_line(plane,fixed,[(a0,z0+1),(a1,z0+1)],"dfc6a3" if not flip else "c9ac89")
    for a in range(a0+9,a1,29):
        side_line(plane,fixed,[(a,z0),(a,z1)],base)

def brass_pull(plane,fixed,mid,z):
    side_shape(plane,fixed,[(mid-8,z),(mid+8,z),(mid+6,z+3),(mid+3,z+5),(mid-3,z+5),(mid-7,z+3)],BRASS_DK,"644337")
    side_line(plane,fixed,[(mid-5,z+3),(mid,z+4),(mid+4,z+4)],"f0cb7d")
    side_line(plane,fixed,[(mid-2,z+1),(mid+4,z+1)],"b8824c")

def ellipse(cx,cy,rx,ry,fill,border=None):
    pencil.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill="#"+fill,outline="#"+border if border else None)

def vessel(u,v,z,rx,ry,h,tints,cap=False,pattern=False):
    x,y=P(u,v,z)
    edge,main,dark,lit,inside=tints
    poly([(x-rx,y-h),(x+rx,y-h),(x+rx,y-4),(x+rx-3,y-1),(x+rx-5,y),
        (x-rx+4,y),(x-rx+1,y-3)],main,edge)
    poly([(x+2,y-h+1),(x+rx-1,y-h+1),(x+rx-1,y-4),(x+rx-3,y-2),(x+2,y-1)],dark)
    stroke([(x-rx+2,y-h+2),(x-rx+2,y-4),(x-rx+3,y-2)],lit)
    stroke([(x-rx+4,y-2),(x-1,y-2)],lit)
    if pattern:
        for i in range(-rx+3,rx-1,4):
            poly([(x+i,y-4),(x+i-1,y-6),(x+i+1,y-7),(x+i+2,y-6)],NAVY_LIT)
            if rx>=8 and i%2==0:
                pixel(x+i,y-5,"99a8a5")
    ellipse(x,y-h,rx,ry,lit,edge)
    if cap:
        ellipse(x,y-h-2,rx-2,max(1,ry-1),main,edge)
        stroke([(x-2,y-h-3),(x,y-h-3)],lit)
    else:
        ellipse(x,y-h,rx-2,max(1,ry-1),inside)
    return x,y

def spice(u,v,z,color,mark=None):
    edge="665243"
    x,y=vessel(u,v,z,5,2,9,(edge,color,"8b6149","e0b984","715943"),True)
    if mark:
        stroke([(x-3,y-7),(x+1,y-7)],mark)
    stroke([(x-3,y-8),(x-3,y-4)],"e0c4a2")

cream=("634b3d","e0c7a0","b2977c","f6dfb6","8b6f59")
blue=("384556","55718b","3c4e66","89a2ae","425466")
clay=("603c32","b87249","8b4e39","e59d62","68493a")
copper=("693d31","c47c48","985233","f1b16d","79533e")


def draw_floor():
    layer("바닥 · 5×5 석판과 석축")
    box(0,0,GRID*TILE,GRID*TILE,-8,0,("cfaf87","876a57","a18164"),"584636")
    floor=["d3b595","c5a78c","dabb9b","cdb090","bda38b","d2b393"]
    for v in range(GRID):
        for u in range(GRID):
            x,y=u*TILE,v*TILE
            tone=floor[(u*7+v*11+(u*v)*3)%len(floor)]
            top(x,y,x+TILE,y+TILE,0,tone,"9e826d")
            stroke([P(x+3,y+61),P(x+61,y+61),P(x+61,y+3)],"e2c4a2")
            stroke([P(x+5,y+1),P(x+51,y+1)],"b99f86")
            if (u+v)%2:
                stroke([P(x+10,y+15),P(x+18,y+15),P(x+24,y+20)],"d7b89b")
                stroke([P(x+43,y+47),P(x+51,y+47)],"bea083")
            else:
                stroke([P(x+16,y+39),P(x+22,y+39),P(x+27,y+41)],"e2c4a2")
    for a in range(TILE,GRID*TILE,TILE):
        for plane in ["u","v"]:
            side_line(plane,GRID*TILE,[(a,-1),(a,-7)],"6c5140")
            side_line(plane,GRID*TILE,[(a+2,-2),(a+2,-7)],"b89a76")
    stroke([P(0,GRID*TILE),P(GRID*TILE,GRID*TILE),P(GRID*TILE,0)],"644d3a")


def draw_walls():
    layer("벽 · 석회 회벽과 청회색 벽판")
    wall_h=ROOM['wall_height']
    box(-9,-9,0,0,0,wall_h,("ebd2ae","a58369","bab090"),"725943")
    box(-9,0,0,GRID*TILE,0,wall_h,("e7cba6","d0ae88","a58368"),"725943")
    box(0,-9,GRID*TILE,0,0,wall_h,("efd7b3","b39171","e3c69e"),"725943")
    for plane in ("u","v"):
        wall_trim="b69877" if plane=="u" else "c7a985"
        wall_white="e7cba6" if plane=="u" else "f1d8b0"
        for a0,a1,z in [(5,35,58),(34,72,75),(78,109,84),(136,164,70),(172,215,56),(236,273,75),
              (280,319,64),(7,42,84),(293,319,87),(144,170,85)]:
            side_line(plane,0,[(a0,z),(a1,z),(a1,z+7)],wall_trim)
            side_line(plane,0,[(a0+1,z+1),(a1-2,z+1)],wall_white)
        face(plane,0,0,GRID*TILE,0,31,"5b7474" if plane=="u" else "6b8684")
        for a in range(6,319,14):
            side_line(plane,0,[(a,4),(a,27)],"465e60")
            side_line(plane,0,[(a+3,6),(a+3,25)],"809690")
        face(plane,0,0,GRID*TILE,0,5,"405458")
        face(plane,0,0,GRID*TILE,27,32,"526767")
        side_line(plane,0,[(0,33),(GRID*TILE,33)],"90a096")
        side_line(plane,0,[(0,88),(GRID*TILE,88)],wall_trim)
        side_line(plane,0,[(0,90),(GRID*TILE,90)],wall_white)


def draw_runner():
    layer("바닥 장식 · 걸을 수 있는 러너와 창빛")
    top(76,251,233,297,0,"79584e")
    top(80,254,229,295,0,NAVY,"5c4d46")
    top(83,257,226,292,0,"be905e")
    top(87,260,222,289,0,"9d5044","7e4b42")
    top(91,263,218,286,0,"aa5e4d")
    for u in (103,132,161,190,214):
        top(u-5,271,u+5,279,0,"c29361")
        top(u-2,267,u+2,282,0,"dbab70")
        top(u-7,273,u+7,277,0,"dbab70")
        top(u-2,273,u+2,277,0,"ebc391")
        for du,dv in [(-5,-5),(5,-5),(-5,5),(5,5)]:
            top(u+du-1,274+dv,u+du+1,276+dv,0,"d3a46f")
    for u in range(88,221,7):
        top(u,260,u+3,262,0,"d6a672")
        top(u,287,u+3,289,0,"c99c69")
    for v in range(254,296,5):
        stroke([P(75,v),P(83,v)],"e0bd8b")
        stroke([P(225,v),P(234,v)],"dfb782")
    for (x0,y0,x1,y1) in [(224,99,249,126),(252,99,278,126),(224,130,249,154),(252,130,278,154)]:
        top(x0,y0,x1,y1,0,"ebc590")
        top(x0+2,y0+2,x1-2,y1-2,0,"f2d2a1")


def draw_window():
    layer("격자창과 청록 유약 벽돌")
    # Handmade backsplash repeats a simple stem motif in selected tiles.
    face("v",1,72,286,31,51,"6b8a83","547271")
    for i,a in enumerate(range(73,286,16)):
        a1=min(a+15,286)
        face("v",2,a,a1,34,49,"72928c" if i%3 else "799990","a8b0a0")
        if a1-a>10 and i%2==0:
            p=a+7
            side_line("v",3,[(p,37),(p,46)],"d4c09b")
            side_line("v",3,[(p-4,41),(p,42),(p+3,45)],"b9b797")
    # Chunky frame, just enough cool glass and hint of foliage outside.
    face("v",1,91,206,44,89,"ab8669","785b49")
    face("v",2,97,200,49,87,NAVY_DK,"423b37")
    for a,hi,shade in [(103,121,"9fb8ad"),(126,144,"acc2ae"),(152,170,"a6bbaa"),(175,194,"aabdb2")]:
        for low,high in [(52,66),(70,83)]:
            face("v",3,a,hi,low,high,shade,"607f83")
            side_shape("v",3,[(a,low),(a+4,low+4),(a+9,low+2),(hi,low+8),(hi,low)],"829479")
            side_shape("v",3,[(a+2,high-2),(a+7,high-2),(hi,low+2),(hi-4,low+1)],"cbd3af")
            side_line("v",4,[(a+3,low+3),(a+7,low+6),(a+10,low+5)],"d7b269")
    face("v",4,95,102,49,87,NAVY_LIT,NAVY_DK)
    face("v",4,195,201,49,87,NAVY,NAVY_DK)
    face("v",4,145,151,49,87,NAVY,NAVY_DK)
    face("v",4,122,125,50,86,NAVY)
    face("v",4,171,174,50,86,NAVY)
    face("v",4,97,199,66,70,NAVY,"37495e")
    side_line("v",4,[(98,70),(196,70)],NAVY_LIT)
    side_line("v",4,[(146,52),(146,85)],NAVY_LIT)
    for a in (143,153):
        side_line("v",5,[(a,64),(a,68)],BRASS_DK,3)
        side_line("v",5,[(a,65),(a,67)],BRASS,1)
    box(90,0,208,12,44,49,("efd1a7","a88061","c79e75"),"7c5d48")
    box(93,0,204,8,87,90,("dabc95","9c7458","b38a69"),"785949")
    rim(90,0,208,12,49,"f3d9af")


def draw_pantry():
    layer("모서리 식료품장 · 저장병과 직조 바구니")
    # A narrow shelf bridges the corner without consuming the walking lane.
    box(10,8,58,46,0,79,OAK_DARK,WOOD_EDGE)
    face("u",59,12,42,3,73,"604332","4f392f")
    face("u",59,14,39,4,70,"654735")
    face("v",46,15,54,62,75,"896042","6e4b37")
    side_line("v",47,[(19,66),(51,66)],"a37750")
    side_line("u",60,[(15,56),(41,56)],"554033")
    for z in [4,22,41,59,74]:
        box(13,9,61,47,z,z+3,WOOD,WOOD_EDGE)
        side_line("u",61,[(11,z+3),(44,z+3)],"d2a56e")
    for a in [9,43]:
        face("u",62,a,a+4,2,76,"a57047","6d4933")
        side_line("u",63,[(a+1,5),(a+1,72)],"c28e5c")
    # Vary depth and height so the vessels occupy their shelf rather than the stile.
    vessel(47,33,25,7,4,10,cream,True,True)
    spice(51,13,25,"a66548","eab382")
    spice(48,13,44,"a66548","ed9d5c")
    spice(47,34,44,"829067","a0a16a")
    vessel(54,18,44,5,2,6,cream,False)
    spice(46,15,62,"bda465","ebcb78")
    vessel(48,35,62,6,3,8,cream,True,False)
    for v,z in ((12,25),(39,44),(17,62)):
        side_line("u",61,[(v,z-1),(v+4,z-1)],"785339")
    # Small open basket on the lowest shelf.
    x,y=vessel(50,28,7,8,4,8,("6c4e39","a78053","866449","c39d67","554334"))
    for dy in (1,4,6):
        stroke([(x-6,y-dy),(x-2,y-dy+2),(x+3,y-dy+2),(x+6,y-dy)],"b79260")


def draw_hearth():
    layer("대형 화덕 · 아치 석조와 구리 주전자")
    # Separate hearth slab, masonry mass and mantel protect the crafted shapes.
    box(4,43,68,146,0,6,("c9ab8c","947865","ac8d73"),STONE_EDGE)
    rim(4,43,68,146,6,"e5c7a1")
    box(3,51,60,138,6,58,STONE,STONE_EDGE)
    for z in (12,24,36,48):
        face_joint("u",60,53,136,z,z+10)
        face_joint("v",138,4,59,z,z+10,True)
    # The oven has separate jambs, keyed arch stones, and an inset opening.
    side_shape("u",61,[(64,8),(127,8),(127,30),(122,40),(114,50),(105,54),
        (87,54),(77,49),(70,41),(64,30)],"a88c73","71584a")
    face("u",61,67,78,8,29,"c9aa8c","92735c")
    face("u",61,114,125,8,29,"b89a7c","92735c")
    for z in (12,20):
        side_line("u",61,[(66,z),(78,z)],"9c7a64")
        side_line("u",61,[(114,z),(126,z)],"8c6c58")
    def wedge(angle,rx,rz):
        return 96+rx*cos(angle),28+rz*sin(angle)
    for i in range(9):
        lo=i*pi/9
        hi=(i+1)*pi/9
        middle=(lo+hi)/2
        side_shape("u",62,[wedge(lo,31,27),wedge(middle,31,27),wedge(hi,31,27),
            wedge(hi,24,21),wedge(middle,24,21),wedge(lo,24,21)],
            ("d2b396","c5a487","d9bc9b")[i%3],"9a7a63")
        side_line("u",62,[wedge(lo+.05,30,26),wedge(middle,30,26),wedge(hi-.05,30,26)],
            "ead0a9")
    side_shape("u",63,[(76,9),(118,9),(118,28),(113,38),(106,43),(90,43),
        (82,37),(76,28)],"473331","664637")
    side_shape("u",64,[(79,11),(116,11),(116,27),(110,35),(104,40),(90,40),
        (84,35),(79,27)],"2b282e")
    side_line("u",64,[(79,14),(79,27),(84,35),(90,40)],"8d5538")
    side_line("u",64,[(80,17),(84,18),(87,18)],"724738")
    # Embers are nested flat shapes with the brightest value concentrated at the base.
    side_shape("u",63,[(76,11),(78,19),(82,22),(83,28),(86,21),(90,34),(94,27),(96,35),(100,27),
        (102,29),(107,23),(110,21),(113,13)],"bb5c39")
    side_shape("u",63,[(81,12),(83,20),(87,22),(90,29),(94,21),(96,28),(100,22),(104,21),(107,15),(108,12)],"e89551")
    side_shape("u",64,[(86,12),(88,21),(92,18),(95,24),(99,17),(102,18),(104,12)],"f5c775")
    side_line("u",64,[(78,11),(114,11)],"7f4434",2)
    box(0,47,65,141,56,63,("e6c9a5","a98b72","bd9b7c"),STONE_EDGE)
    rim(0,47,65,141,63,"f1d6ad")
    for v in (71,95,119):
        stroke([P(1,v,63),P(63,v,63)],"b89b80")
        stroke([P(3,v+2,63),P(61,v+2,63)],"eed3ae")
    for u,v in [(19,61),(42,84),(13,108),(45,128)]:
        stroke([P(u,v,63),P(u+9,v,63)],"dec4a2")
        stroke([P(u+7,v+1,63),P(u+12,v+1,63)],"caad90")
    for a in (69,99,127):
        side_line("u",65,[(a,57),(a,62)],"a18369")
    side_shape("u",65,[(90,60),(112,60),(112,65),(90,65)],"92603f","6f4936")
    side_line("u",66,[(96,62),(106,62)],BRASS)
    side_line("u",66,[(101,60),(101,65)],"e9c476")
    side_shape("u",61,[(88,46),(112,46),(112,54),(88,54)],"9c6746","6d4e3a")
    side_shape("u",62,[(92,50),(98,51),(100,54),(102,51),(109,50),(102,49),(100,46),(98,49)],"e2b76c")
    side_line("u",63,[(100,49),(100,52)],"f5d799")
    # A stone return carries the copper rail outside the arch opening.
    side_shape("u",61,[(51,46),(68,46),(68,50),(51,50)],"986747","674838")
    side_line("u",62,[(51,50),(68,50)],"b68453")
    for i,v in enumerate((53,59,65)):
        x,y=P(63,v,48)
        stroke([(x,y),(x-1,y+2),(x,y+4),(x,y+9+i)],"704635",2)
        pixel(x,y,"dbac68")
        if i<2:
            ellipse(x,y+11+i,2,3,"bf7850","704939")
            pixel(x-1,y+10+i,"e7a56e")
        else:
            poly([(x-1,y+9),(x+1,y+9),(x+2,y+14),(x-2,y+14)],"c48255","704939")
            stroke([(x-1,y+11),(x-1,y+13)],"e7a56e")

    layer("화덕 위 주전자 · 몸통과 손잡이")
    # Draw a thin plate with visible feet. The kettle bottom and plate share z=12.
    stand=ATTACHMENTS["trivet"]
    a0,b0,a1,b1=stand["rect"]
    u0,v0=DESIGN_ANCHORS["hearth"]
    for a,b in [(a0+3,b0+4),(a1-6,b0+4),(a0+3,b1-4),(a1-6,b1-4)]:
        box(u0+a,v0+b,u0+a+4,v0+b+4,stand["foot_z"],stand["body_z"],("69645d","454147","514d4b"),"373039")
    box(u0+a0,v0+b0,u0+a1,v0+b1,stand["body_z"],stand["surface_z"],("676460","4a464b","56514f"),"383438")
    rim(u0+a0,v0+b0,u0+a1,v0+b1,stand["surface_z"],"85827a")
    x,y=anchor("kettle")
    edge="653c34"
    gold="efab6f"
    handle=[(-8,-7),(-8,-12),(-6,-16),(-3,-18),(2,-18),(6,-16),(8,-12),(8,-7)]
    stroke([(x+i,y+j) for i,j in handle],edge,3)
    stroke([(x+i,y+j-1) for i,j in handle[1:-1]],"d5965f")
    # The spout's root overlaps the belly; the high lip is hollow and rimmed.
    poly([(x-6,y-6),(x-10,y-6),(x-13,y-9),(x-15,y-13),(x-12,y-13),(x-9,y-9),(x-5,y-9)],
        "bc784f",edge)
    stroke([(x-13,y-12),(x-11,y-9),(x-8,y-8)],gold)
    stroke([(x-15,y-13),(x-12,y-13)],"dda46d")
    poly([(x-7,y-9),(x+6,y-9),(x+9,y-6),(x+9,y-3),(x+6,y-1),(x+3,y),
           (x-4,y),(x-8,y-2),(x-9,y-6)],"c47c48",edge)
    poly([(x+4,y-8),(x+8,y-6),(x+8,y-3),(x+5,y-1),(x+1,y-1),(x+4,y-4)],"985233")
    stroke([(x-7,y-6),(x-6,y-4),(x-5,y-3),(x-2,y-2)],"eca667")
    ellipse(x,y-9,7,2,"ce8e5e",edge)
    stroke([(x-5,y-9),(x+3,y-9)],"f0b77d")
    ellipse(x,y-12,2,1,"e4a567",edge)
    for side in [-1,1]:
        ellipse(x+side*7,y-7,1,1,"d69461",edge)
        pixel(x+side*7,y-7,"f6bd7c")


def draw_left_shelf():
    layer("벽 선반 · 도자기, 허브와 구리 도구")
    box(0,61,23,183,74,78,("be8552","8b5a3e","a56f47"),WOOD_EDGE)
    rim(0,61,23,183,78,"e1b078")
    for v in (73,163):
        side_shape("u",5,[(v,74),(v+12,74),(v+12,69),(v+5,62),(v,63)],"8d593d","604536")
        side_line("u",6,[(v+2,72),(v+9,72),(v+4,65)],"b88659")
    for v in (76,96,126,153):
        top(4,v,22,v+2,78,"a67149")
        stroke([P(9,v+2,78),P(20,v+2,78)],"e2b17b")
    vessel(13,113,79,8,4,10,cream,True,True)
    vessel(13,85,79,7,3,8,blue,True)
    vessel(12,144,79,5,2,7,cream,True)
    vessel(13,168,79,7,3,6,clay)
    # Hanging vine drapes over the mantle and leaves the oven face legible.
    def ivy(u,v,z,path):
        x,y=P(u,v,z)
        stroke([(x+dx,y+dy) for dx,dy in path],"4c5e3b")
        for i,(dx,dy) in enumerate(path[1:]):
            spin=-1 if i%2 else 1
            xx,yy=x+dx,y+dy
            poly([(xx,yy),(xx+spin*3,yy-2),(xx+spin*6,yy-1),(xx+spin*5,yy+3),(xx+spin*2,yy+3)],
                "64764a" if i%2 else "819158","4c5e3b")
    ivy(19,174,82,[(0,0),(-2,3),(-4,6),(-3,9),(-4,13),(-2,16),(-3,21)])
def draw_left_hangers():
    layer("벽걸이 · 허브 매듭")
    face("u",1,180,235,81,85,"a77147","644536")
    for v in (196,219):
        x,y=P(3,v,83)
        stroke([(x,y),(x,y+2),(x+1,y+6)],"8c603c",2)
        pixel(x,y+1,"d0a46b")
        color="897aa2" if v==196 else "7b8c57"
        for dx in (-4,-2,0,2,4):
            stroke([(x+1,y+5),(x+dx,y+12),(x+dx-1,y+16)],"536747")
            stroke([(x+dx,y+11),(x+dx-1,y+15)],color,2)
        stroke([(x-2,y+6),(x+4,y+6)],"d9ad6e")


def draw_sink_run():
    layer("개수대와 참나무 수납장")
    box(72,5,276,54,0,36,WOOD,WOOD_EDGE)
    box(69,4,281,57,35,43,STONE,STONE_EDGE)
    rim(69,4,281,57,43,"f2d7b0")
    # Stiles, inset panels and curved brass cup pulls use consistent oblique edges.
    for u0,u1 in [(78,123),(126,170),(173,219),(222,266)]:
        face("v",55,u0,u1,4,32,"a16b43","6c4833")
        if u0 in (126,173):
            face("v",56,u0+5,u1-5,8,27,"ad7449","8a5a3d")
            side_line("v",56,[(u0+6,27),(u1-6,27)],"c38c5b")
            mid=u1-11 if u0==126 else u0+11
            side_shape("v",56,[(mid-3,18),(mid,20),(mid+3,19),(mid+3,16),(mid,15),(mid-3,16)],BRASS,"94613d")
        else:
            for z in (7,20):
                face("v",56,u0+2,u1-2,z,z+9,"b17b50","875638")
                side_line("v",57,[(u0+5,z+9),(u1-5,z+9)],"cc965f")
                brass_pull("v",57,(u0+u1)//2,z+3)
    for x in (75,123,170,219,268):
        face("v",57,x,x+3,4,35,"c08b57","98653f")
    face("u",276,10,50,4,33,"8b5a3d","704b37")
    face("u",277,15,46,8,29,"9d6946","785038")
    side_line("u",278,[(16,29),(45,29)],"b27d50")

    # Recessed ceramic basin with a stone-colored outer lip and a continuous taper.
    face("v",57,115,187,32,43,"e4c9a3","a0866d")
    side_line("v",57,[(119,34),(185,34)],"bd9d7b")
    top(114,11,188,55,43,"f0d6b0","9c8268")
    top(120,17,182,50,43,"a68e7b","8e7968")
    top(125,22,178,46,43,"c0ae96","ad9983")
    stroke([P(125,23,43),P(125,46,43),P(177,46,43)],"d8c0a0")
    stroke([P(120,49,43),P(182,49,43),P(182,19,43)],"f0d6b0")
    x,y=anchor("faucet")
    # Both taps and the main faucet are fixed to the counter behind the basin.
    ellipse(x,y,4,2,"b47b4a","79533d")
    stroke([(x-2,y-1),(x+2,y-1)],"e4b471")
    stroke([(x,y),(x,y-11),(x+2,y-15),(x+6,y-17),(x+10,y-16),(x+12,y-13),(x+12,y-10)],
        "78513a",3)
    stroke([(x,y-1),(x,y-11),(x+2,y-14),(x+6,y-16),(x+10,y-15),(x+11,y-13),(x+11,y-11)],
        BRASS,2)
    stroke([(x+2,y-15),(x+6,y-17),(x+9,y-16)],"f4d491")
    for u in (138,164):
        x0,y0=P(u,13,43)
        ellipse(x0,y0,3,2,BRASS_DK,"78533c")
        stroke([(x0,y0),(x0,y0-4),(x0+3,y0-4)],BRASS,2)
    # Linen crosses 90 degrees at the same rail and shares a continuous stripe.
    top(135,46,150,57,43,"ede0c3","a0856d")
    face("v",57,135,150,31,43,"e4d4b4","8c7460")
    face("v",57,135,150,32,34,"bd9f81")
    for u in (139,145):
        stroke([P(u,47,43),P(u,57,43)],NAVY_LIT)
        side_line("v",57,[(u,43),(u,32)],NAVY_LIT)
    # Crockery, fruit and bread decor are grouped into one usable stretch.
    x,y=vessel(207,28,45,11,5,5,blue,False,True)
    for dx,dy,c in [(-4,-6,"a8513c"),(0,-8,"bd6c49"),(5,-5,"d19a58")]:
        ellipse(x+dx,y+dy,4,4,c,"7c4a3c")
        stroke([(x+dx-2,y+dy-2),(x+dx,y+dy-2)],"edb878")
    top(231,19,265,43,44,"b17d52","855737")
    rim(231,19,265,43,44,"cd9b63")
    stroke([P(233,29,44),P(261,29,44)],"9a6b43")
    x,y=P(247,32,45)
    poly([(x-11,y),(x-10,y-6),(x-6,y-9),(x+2,y-10),(x+8,y-7),(x+11,y-3),(x+10,y+1),
        (x+1,y+3),(x-7,y+2)],"c68647","8d5c38")
    poly([(x-9,y-5),(x-5,y-8),(x+2,y-9),(x+7,y-6),(x+8,y-3),(x-2,y-2)],"e4ab62")
    for dx,dy in [(-5,-6),(0,-7),(4,-6)]:
        stroke([(x+dx,y+dy),(x+dx+3,y+dy+2)],"f9cb83")


def draw_right_shelf():
    layer("창턱의 화분과 양념 선반")
    vessel(108,7,49,6,3,5,cream,False,True)
    x,y=P(108,8,55)
    for dx,dy in [(-6,-6),(-4,-9),(0,-10),(3,-6),(6,-7)]:
        stroke([(x,y),(x+dx,y+dy)],"66784d")
        poly([(x+dx,y+dy),(x+dx-2,y+dy-3),(x+dx-1,y+dy-4),(x+dx+2,y+dy-3),
              (x+dx+3,y+dy-1)],"e9d7a5","80906c")
    box(230,0,282,15,64,69,WOOD,WOOD_EDGE)
    rim(230,0,282,15,69,"dcaa70")
    for u in (237,271):
        side_shape("v",2,[(u,64),(u+9,64),(u+8,58),(u+3,53)],"8c5e44","674938")
    spice(244,8,69,"c09457","e2bb79")
    spice(266,8,69,"9c5b42","d69464")


def draw_prep_table():
    layer("중앙 작업대 · 목공 접합과 도마")
    # The closest table point starts 65+ world pixels from either fixture run.
    # Nothing occupies the two aisle rectangles between the table and the walls.
    for u,v in [(140,132),(205,132)]:
        box(u,v,u+9,v+9,0,37,WOOD,WOOD_EDGE)
    # Its lowest rows overlap a separate floor-contact diamond, under the rim.
    basket_u,basket_v,basket_z=local_attachment("basket")
    top(basket_u-10,basket_v-11,basket_u+14,basket_v+12,basket_z,"9b795e")
    x,y=vessel(basket_u,basket_v,basket_z,8,4,10,("6b4b35","a97a50","805a42","c79c66","674e3a"))
    stroke([(x-4,y-9),(x-6,y-14),(x-3,y-17),(x+3,y-17),(x+5,y-14),(x+4,y-9)],"93673f",2)
    for dy in (-7,-4,-2):
        stroke([(x-6,y+dy),(x-2,y+dy+1),(x+3,y+dy+1),(x+6,y+dy)],"bd925c")
    for u,v in [(140,170),(205,170)]:
        box(u,v,u+9,v+9,0,37,WOOD,WOOD_EDGE)
        side_line("v",v+9,[(u+1,3),(u+1,29)],"bd8855")
    box(134,128,217,180,31,40,WOOD,WOOD_EDGE)
    box(133,122,221,184,38,45,("d5a16a","9b6545","b98250"),WOOD_EDGE)
    rim(133,122,221,184,45,"edbb83")
    for a in [153,175,197]:
        stroke([P(a,126,45),P(a,181,45)],"ad784f")
    for a,v,n in [(138,137,9),(154,159,7),(171,126,12),(193,174,9),(207,154,8)]:
        stroke([P(a,v,45),P(a,v+n,45),P(a+2,v+n+5,45)],"e6b580")
        stroke([P(a+2,v+2,45),P(a+2,v+n,45)],"bd8651")
    stroke([P(136,172,45),P(142,172,45),P(147,176,45),P(149,182,45)],"be8650")
    for a in [139,159,201,215]:
        side_line("v",184,[(a,42),(a+2,42)],"754f39")
        side_line("v",184,[(a,43),(a+1,43)],"edb780")

    # Both pieces of the cloth share the precise x/z/tile seam at v=184.
    top(194,146,213,184,45,NAVY,"4a5a6a")
    face("v",184,194,213,28,45,NAVY,"344254")
    face("v",184,195,199,29,44,"4b6178")
    face("v",184,205,207,29,44,"2e415c")
    for u in (198,206):
        top(u,146,u+2,184,45,"dbcaab")
        face("v",184,u,u+2,29,45,"d3c09d")
        side_line("v",184,[(u+2,31),(u+2,43)],"998975")
    side_line("v",184,[(195,44),(212,44)],"657787")
    side_line("v",184,[(194,29),(213,29)],"d3c09d")
    for a in range(196,214,4):
        side_line("v",184,[(a,27),(a,29)],"b9a88f")
    top(148,137,195,165,46,"b98051","795437")
    rim(148,137,195,165,46,"ebb07a")
    x,y=vessel(146,137,47,8,4,7,("5e5147","aa9780","817260","d0b79a","6f7756"))
    stroke([(x+3,y-6),(x+9,y-13),(x+10,y-16)],"755b47",3)
    stroke([(x+4,y-7),(x+10,y-15)],"c7ac86",2)
    for u,v in [(165,153),(175,148),(184,152)]:
        x,y=P(u,v,47)
        ellipse(x,y,4,3,"d4b599","8e7257")
        stroke([(x-1,y-1),(x,y-4)],"ddc29f")
    x,y=P(187,142,47)
    poly([(x-6,y+1),(x-4,y-4),(x-1,y-5),(x+2,y-6),(x+6,y-2),(x+4,y+1)],"7a8a55","566747")
    for dx,dy in [(-2,0),(2,-1),(5,2)]:
        ellipse(x+dx,y+dy,2,2,"ab573b","6d4733")


def draw_planter():
    layer("바닥 소품 · 통 화분")
    x,y=vessel(40,269,0,13,6,17,("634835","a67249","805837","c2925f","644c3b"))
    for z in (5,12):
        stroke([(x-11,y-z),(x-5,y-z+2),(x+4,y-z+2),(x+10,y-z)],"525861",2)
        stroke([(x-9,y-z-1),(x-4,y-z+1),(x+2,y-z+1)],"7f8585")
    for dx,dy in [(-8,-9),(-5,-14),(-1,-12),(3,-16),(7,-9),(9,-12)]:
        stroke([(x,y-15),(x+dx,y-15+dy)],"61734e")
        for j in [0,3,6]:
            if dy+j<-3:
                ellipse(x+dx+(1 if j%2 else 0),y-15+dy+j,2,2,"8d789c","6b607a")
                if j==0:
                    pixel(x+dx,y-16+dy,"baa2b6")
    poly([(x-7,y-16),(x-12,y-21),(x-14,y-22),(x-15,y-19),(x-11,y-17)],"7e8b58","586742")
    poly([(x+3,y-16),(x+6,y-21),(x+11,y-21),(x+14,y-19),(x+10,y-17)],"84955a","576a42")


def draw_grid():
    layer("확인용 · 5×5 타일 격자",False)
    for i in range(GRID+1):
        k=TILE*i
        stroke([P(k,0),P(k,GRID*TILE)],"daf2e9")
        stroke([P(0,k),P(GRID*TILE,k)],"daf2e9")


def make_project_files():
    from collections import Counter
    arrays=[np.asarray(img) for name,img,vis in layers]
    frequency=Counter()
    for a in arrays:
        codes,counts=np.unique(a.reshape(-1,4),axis=0,return_counts=True)
        for c,n in zip(codes,counts):
            if c[3]:
                frequency[tuple(map(int,c))]+=int(n)
    # Preserve the dominant swatches. Closely related rare highlight values
    # share the same indexed palette, with no interpolation or dithering.
    palettes=[(0,0,0,0)]+[c for c,n in frequency.most_common(244)]
    index={c:i for i,c in enumerate(palettes)}
    master=np.asarray(palettes[1:],dtype=np.int32)
    weights=np.array([1.0,1.35,.9])
    for c in frequency:
        if c not in index:
            index[c]=int(np.argmin(((master[:,:3]-c[:3])**2*weights).sum(axis=1)))+1
    rendered=Image.new("RGBA",SIZE,(0,0,0,0))
    records=[]
    for i,((name,img,visible),pixels) in enumerate(zip(layers,arrays)):
        values,reverse=np.unique(pixels.reshape(-1,4),axis=0,return_inverse=True)
        lut=np.array([index.get(tuple(map(int,p)),0) for p in values],dtype=np.uint8)
        plane=lut[reverse].reshape(SIZE[1],SIZE[0])
        if visible:
            rendered=Image.alpha_composite(rendered,Image.fromarray(np.asarray(palettes,dtype=np.uint8)[plane]))
        filename=f"layer-{i:02d}.bin"
        (WORK/filename).write_bytes(plane.tobytes())
        records.append(dict(name=name,data=filename,visible=visible))
    (WORK/"kitchen-palette.bin").write_bytes(np.array(palettes,dtype=np.uint8).tobytes())
    (WORK/"kitchen-layers.json").write_text(json.dumps(records,ensure_ascii=False),encoding="utf-8")
    rendered.save(WORK/"review-native.png")
    preview=Image.new("RGBA",SIZE,"#3f3535")
    preview.alpha_composite(rendered)
    preview.convert("RGB").resize((SIZE[0]*2,SIZE[1]*2),Image.Resampling.NEAREST).save(WORK/"kitchen-layout-2x.png")
    print("Original colors",len(frequency),"indexed colors",len(palettes)-1,"layers",len(records))


DESIGN_ANCHORS={
    "pantry":(10,8), "hearth":(0,43), "sink_run":(69,4),
    "prep_table":(133,122), "planter":(14,243),
    "window":(67,0), "left_shelf":(0,61), "left_hangers":(0,164), "right_shelf":(108,0),
}

DESIGN_SIZES={
    "pantry":(52,39), "hearth":(68,103), "sink_run":(212,53),
    "prep_table":(88,62), "planter":(52,52),
}

DESIGN_HEIGHTS={
    "pantry":79,"hearth":65,"sink_run":44,"prep_table":45,"planter":37,
    "window":90,"left_shelf":85,"left_hangers":85,"right_shelf":77,
}

def local_attachment(name):
    attachment=ATTACHMENTS[name]
    u0,v0=DESIGN_ANCHORS[attachment["fixture"]]
    u,v,z=attachment["anchor"]
    return u0+u,v0+v,z

def anchor(name):
    return P(*local_attachment(name))

def rect(fixture):
    u,v=fixture["position"]
    w,d=fixture["size"]
    return (u,v,u+w,v+d)

def intersects(a,b):
    return a[0]<b[2] and a[2]>b[0] and a[1]<b[3] and a[3]>b[1]

def check_layout(room, layout):
    floor_x = room["columns"]*room["tile_size"]
    floor_y = room["rows"]*room["tile_size"]
    for f in layout["fixtures"]:
        if f["id"] not in DESIGN_SIZES or f["height"]<=0 or any(d<=0 for d in f["size"]):
            raise ValueError(f"{f['id']}: invalid fixture geometry")
    supports=layout["attachments"]
    stand=supports["trivet"]
    kettle=supports["kettle"]
    a,b,z=kettle["anchor"]
    x0,y0,x1,y1=stand["rect"]
    if not (
        kettle["on"]=="trivet" and kettle["fixture"]==stand["fixture"]=="hearth"
        and 0<=x0<x1<=DESIGN_SIZES["hearth"][0]
        and 0<=y0<y1<=DESIGN_SIZES["hearth"][1]
        and x0<a<x1 and y0<b<y1 and z==stand["surface_z"]
        and 0<=stand["foot_z"]<stand["body_z"]<stand["surface_z"]
    ):
        raise ValueError("The kettle is not seated on the trivet")
    for id,fixture,expected_z in [("faucet","sink_run",43),("basket","prep_table",0)]:
        item=supports[id]
        x,y,z=item["anchor"]
        w,d=DESIGN_SIZES[fixture]
        if item["fixture"]!=fixture or not (0<x<w and 0<y<d and z==expected_z):
            raise ValueError(f"{id}: support plane does not meet the attachment")
    blockers=[(f["id"],rect(f)) for f in layout["fixtures"]]
    for i,(name,(x0,y0,x1,y1)) in enumerate(blockers):
        if not (0<=x0<x1<=floor_x and 0<=y0<y1<=floor_y):
            raise ValueError(f"{name}: outside the floor")
        for other,area in blockers[i+1:]:
            if intersects((x0,y0,x1,y1),area):
                raise ValueError(f"{name} overlaps {other}")
    for passage in layout["clearances"]:
        x0,y0,x1,y1=passage["rect"]
        if min(x1-x0,y1-y0)<room["tile_size"] or any(intersects(passage["rect"],b) for _,b in blockers):
            raise ValueError(f"{passage['id']}: aisle is obstructed or less than 1 tile wide")
    half=room["tile_size"]//2
    def is_clear(point):
        x,y=point
        candidate=x-half,y-half,x+half,y+half
        return (half<=x<=floor_x-half and half<=y<=floor_y-half and
                not any(intersects(candidate,b) for _,b in blockers))
    start=tuple(room["entry"])
    if not is_clear(start):
        raise ValueError("The tile-sized entrance is blocked")
    seen={start}
    todo=deque([start])
    targets={tuple(value) for value in layout["approaches"].values()}
    while todo and not targets.issubset(seen):
        x,y=todo.popleft()
        for q in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if q not in seen and is_clear(q):
                seen.add(q)
                todo.append(q)
    if not targets.issubset(seen):
        raise ValueError("A one-tile-wide route cannot reach a listed work station")
    print(f"{len(blockers)} footprints clear; a {half*2}-unit route reaches {len(targets)} work positions; attachment heights match supports")
    return blockers

def draw_shadows(fixtures):
    layer("바닥 · 가구 접지")
    tones={"pantry":"ad917b","hearth":"ae8e73","sink_run":"ad927c","prep_table":"ad8c73","planter":"ab8b73"}
    for f in fixtures:
        x0,y0,x1,y1=rect(f)
        top(x0,y0,min(x1+6,320),min(y1+5,320),0,tones[f["id"]])

def place(fixture,renderers):
    global POSE
    id=fixture["id"]
    base_u,base_v=DESIGN_ANCHORS[id]
    u,v=fixture["position"]
    if id in DESIGN_SIZES:
        width,depth=fixture["size"]
        base_width,base_depth=DESIGN_SIZES[id]
        u_scale,v_scale=width/base_width,depth/base_depth
    else:
        u_scale=v_scale=1.0
    POSE=base_u,base_v,u,v,u_scale,v_scale,fixture["height"]/DESIGN_HEIGHTS[id]
    try:
        renderers[id]()
    finally:
        POSE=None

def save_plan(layout):
    from PIL import ImageFont
    floor_size=320
    margin=66
    scale=1.65
    body=int(floor_size*scale)
    sheet=Image.new("RGB",(body+margin*2,body+125),"#252a30")
    d=ImageDraw.Draw(sheet)
    title=ImageFont.truetype("C:/Windows/Fonts/malgunbd.ttf",23)
    label_font=ImageFont.truetype("C:/Windows/Fonts/malgun.ttf",15)
    d.text((margin,14),"아르카나 주방 배치 · 5×5",font=title,fill="#f1debe")
    def translate(box):
        return [round(value*scale)+(margin if index%2==0 else 58) for index,value in enumerate(box)]
    d.rectangle(translate((0,0,320,320)),fill="#d8bb94",outline="#ddc8aa",width=2)
    for i in range(1,5):
        d.line(translate((i*64,0,i*64,320)),fill="#aa927c",width=1)
        d.line(translate((0,i*64,320,i*64)),fill="#aa927c",width=1)
    names={"pantry":"식료품장","hearth":"화덕","sink_run":"싱크대 · 조리대","prep_table":"작업대","planter":"화분"}
    for passage in layout["clearances"]:
        d.rectangle(translate(passage["rect"]),outline="#527b72",width=3)
    for fixture in layout["fixtures"]:
        x0,y0,x1,y1=translate(rect(fixture))
        d.rectangle((x0,y0,x1,y1),fill="#73513d",outline="#493729",width=2)
        d.text(((x0+x1)//2,(y0+y1)//2),names[fixture["id"]],font=label_font,anchor="mm",fill="#f5e5cc")
    d.text((margin+body//2,58+body+13),"입구",font=label_font,anchor="ma",fill="#f1debe")
    d.text((margin,58+body+36),"초록 테두리  한 칸 폭을 확보한 통로",font=label_font,fill="#b1d4c6")
    sheet.save(WORK/"kitchen-layout-floorplan.png")

def build():
    global WORK, ROOM, TILE, GRID, SIZE, ORIGIN, ATTACHMENTS
    parser=argparse.ArgumentParser(description="Assemble the 5×5 Arcana kitchen in editable PixelPen layers.")
    parser.add_argument("--layout",type=Path,default=Path(__file__).with_name("kitchen-layout.json"))
    parser.add_argument("--work",type=Path,default=DEFAULT_WORK)
    args=parser.parse_args()
    WORK=args.work
    WORK.mkdir(parents=True,exist_ok=True)
    layout=json.loads(args.layout.read_text(encoding="utf-8"))
    ROOM=layout["room"]
    ATTACHMENTS=layout["attachments"]
    TILE=ROOM["tile_size"]
    GRID=ROOM["columns"]
    SIZE=tuple(ROOM["canvas"])
    ORIGIN=tuple(ROOM["origin"])
    if (TILE,GRID,ROOM["rows"])!=(64,5,5):
        raise ValueError("This furniture set is sized for 64-unit tiles in a 5×5 kitchen")
    check_layout(ROOM,layout)
    draw_floor()
    draw_walls()
    draw_runner()
    draw_shadows(layout["fixtures"])
    renderers={
        "window":draw_window,"pantry":draw_pantry,"hearth":draw_hearth,
        "left_shelf":draw_left_shelf,"left_hangers":draw_left_hangers,
        "sink_run":draw_sink_run,"right_shelf":draw_right_shelf,
        "prep_table":draw_prep_table,"planter":draw_planter,
    }
    for fixture in layout["wall_fixtures"]:
        place(fixture,renderers)
    for fixture in sorted(layout["fixtures"],key=lambda f: sum(rect(f)[2:])):
        place(fixture,renderers)
    draw_grid()
    save_plan(layout)
    make_project_files()

if __name__=="__main__":
    build()
