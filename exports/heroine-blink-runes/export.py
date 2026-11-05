from pathlib import Path
from PIL import Image, ImageDraw
from io import BytesIO
import math, random
import struct, json
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
REF=ROOT/'godot-arcana/art/source/heroine/reference-bright-v10/native-frames/idle_e'
idle=[Image.open(REF/f"frame-{i:02}.png").convert("RGBA") for i in range(4)]
frames=[]
# Independently animated overlay with the unmodified character sprites.
random.seed(24)
particles=[(random.uniform(-38,38),random.uniform(-63,40),random.uniform(0,math.tau),random.choice([1,1,2,3])) for _ in range(34)]
for i in range(100):
    im=Image.new("RGBA",(320,160))
    t=i/50
    arriving=t>=1.02
    x=200 if arriving else 24
    # Departure fades into fragments, arrival forms from fragments.
    opacity=1 if t<.62 else max(0,1-(t-.62)/.25) if t<.87 else 0 if t<1.02 else min(1,(t-1.02)/.24)
    if opacity>0:
        char=idle[(i//20)%4].copy()
        char.putalpha(char.getchannel("A").point(lambda a:round(a*opacity)))
        im.alpha_composite(char,(x,12))
    if .48<t<1.50:
        phase=(t-.48)/.54 if not arriving else (1.50-t)/.48
        strength=max(0,min(1,phase*3))
        cx=x+48; cy=91
        layer=Image.new("RGBA",im.size)
        d=ImageDraw.Draw(layer)
        alpha=int(210*strength)
        d.arc((cx-39,cy-11,cx+39,cy+11),0,170,fill=(117,190,255,alpha),width=2)
        d.arc((cx-39,cy-11,cx+39,cy+11),190,350,fill=(216,192,255,alpha),width=2)
        d.arc((cx-34,cy-15,cx+34,cy+15),20,155,fill=(240,237,255,alpha),width=1)
        for j,(dx,dy,ang,r) in enumerate(particles):
            spread=min(1,phase*1.8)
            px=round(cx+dx*spread+math.sin(t*6+ang)*3)
            py=round(cy-20+dy*spread+math.cos(t*5+ang)*3)
            rr=max(1,round(r*strength))
            color=(207,222,255,alpha) if j%3 else (168,136,255,alpha)
            d.polygon([(px,py-rr*2),(px+rr,py),(px,py+rr*2),(px-rr,py)],fill=color)
            if r==3:
                d.line((px-rr*2,py,px+rr*2,py),fill=(243,247,255,alpha),width=1)
        im.alpha_composite(layer)
    frames.append(im.resize((960,480),Image.Resampling.NEAREST))
frames[0].save(OUT/'heroine-blink-transparent.png',save_all=True,append_images=frames[1:],duration=20,loop=0,disposal=0,blend=0)
# QuickTime PNG video: each sample is an RGBA PNG; alpha is lossless.
def u32(v):return struct.pack('>I',v)
def atom(t,p):return u32(len(p)+8)+t.encode('ascii')+p
def full(t,p,flags=0):return atom(t,u32(flags)+p)
matrix=struct.pack('>9I',65536,0,0,0,65536,0,0,0,1073741824)
samples=[]
for im in frames:
    buf=BytesIO();im.save(buf,format='PNG');samples.append(buf.getvalue())
ftyp=atom('ftyp',b'qt  '+u32(0)+b'qt  ')
mdat=atom('mdat',b''.join(samples))
mvhd=full('mvhd',struct.pack('>5I',0,0,1000,2000,65536)+struct.pack('>H',256)+bytes(10)+matrix+bytes(24)+u32(2))
tkhd=full('tkhd',struct.pack('>5I',0,0,1,0,2000)+bytes(8)+struct.pack('>4H',0,0,0,0)+matrix+u32(960<<16)+u32(480<<16),7)
mdhd=full('mdhd',struct.pack('>4I',0,0,1000,2000)+struct.pack('>HH',0,0))
hdlr=full('hdlr',u32(0)+b'vide'+bytes(12)+b'RGBA PNG video\x00')
vmhd=full('vmhd',bytes(8),1)
dref=full('dref',u32(1)+full('url ',b'',1))
dinf=atom('dinf',dref)
name=b'PNG with alpha'
entry=bytes(6)+struct.pack('>H',1)+bytes(16)+struct.pack('>HHII',960,480,72<<16,72<<16)+u32(0)+struct.pack('>H',1)+bytes([len(name)])+name+bytes(31-len(name))+struct.pack('>HH',32,65535)
stsd=full('stsd',u32(1)+atom('png ',entry))
stts=full('stts',u32(1)+u32(100)+u32(20))
stsc=full('stsc',u32(1)+u32(1)+u32(100)+u32(1))
stsz=full('stsz',u32(0)+u32(100)+b''.join(u32(len(s)) for s in samples))
stco=full('stco',u32(1)+u32(len(ftyp)+8))
stbl=atom('stbl',stsd+stts+stsc+stsz+stco)
minf=atom('minf',vmhd+dinf+stbl)
mdia=atom('mdia',mdhd+hdlr+minf)
moov=atom('moov',mvhd+atom('trak',tkhd+mdia))
(OUT/'heroine-blink-transparent.mov').write_bytes(ftyp+mdat+moov)
# Contact sheet for visual inspection, checkers are only on this review image.
board=Image.new('RGB',(960,480))
d=ImageDraw.Draw(board)
for y in range(0,480,16):
    for x in range(0,960,16):d.rectangle((x,y,x+15,y+15),fill=('#303744' if (x//16+y//16)%2 else '#222936'))
for j,i in enumerate([20,27,31,35,40,45,51,57,65]):
    small=frames[i].resize((320,160),Image.Resampling.NEAREST)
    board.paste(small,((j%3)*320,(j//3)*160),small)
board.save(OUT/'contact-sheet.jpg')
# Verify exported alpha and frame duration, and decode the first PNG sample in the MOV.
apng=Image.open(OUT/'heroine-blink-transparent.png')
assert apng.info.get('loop')==0
assert abs(sum((apng.seek(i) or apng.info['duration']) for i in range(apng.n_frames))-2000)<1
assert Image.open(BytesIO(samples[0])).mode=='RGBA'
assert all(f.getpixel((0,0))[3]==0 for f in frames)
(OUT/'export-info.json').write_text(json.dumps({'size':[960,480],'duration_ms':2000,'fps':50,'blink_duration_ms':1020,'video_codec':'QuickTime PNG RGBA lossless','alpha':True,'source':'existing heroine frames with newly animated ring and particles; concept-based preview'},indent=2))
print('Saved transparent MOV and APNG (960x480, 2 seconds, 50fps). Alpha and APNG duration checked.')
