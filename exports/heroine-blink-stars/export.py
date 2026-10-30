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
random.seed(17)
stars=[(random.uniform(22,297), random.uniform(32,126), random.choice([1,1,2,2,3]),random.random()) for _ in range(32)]
for i in range(100):
    t=i/50
    im=Image.new("RGBA",(320,160))
    x=24 if t<.95 else 200
    opacity=1 if t<.55 else max(0,1-(t-.55)/.22) if t<.77 else 0 if t<.95 else min(1,(t-.95)/.20)
    if opacity:
        char=idle[(i//20)%4].copy()
        char.putalpha(char.getchannel("A").point(lambda a:round(a*opacity)))
        im.alpha_composite(char,(x,12))
    # Three offset afterimages travel along the constellation path and fade in sequence.
    if .60 < t < 1.22:
        progress=max(0,min(1,(t-.60)/.42))
        for j in range(3,0,-1):
            ghost_p=max(0,min(1,progress-j*.13))
            if progress <= j*.13: continue
            gx=round(24+176*ghost_p)
            gy=round(12-3*math.sin(ghost_p*math.pi))
            alpha=round((110-j*20)*min(1,(t-.60)/.12)*min(1,(1.22-t)/.18))
            ghost=idle[0].copy()
            tint=Image.new("RGBA",ghost.size,(186,205,255,0))
            tint.putalpha(ghost.getchannel("A").point(lambda a:round(a*alpha/255)))
            im.alpha_composite(tint,(gx,gy))
    if .42<t<1.48:
        layer=Image.new("RGBA",(320,160)); d=ImageDraw.Draw(layer)
        fade=min(1,(t-.42)/.16,(1.48-t)/.32)
        progress=max(0,min(1,(t-.56)/.48))
        # Two flowing paths across the blink, revealed in the travel direction.
        for k in range(2):
            pts=[]
            for q in range(100):
                p=q/99
                if p>max(.05,progress):continue
                px=72+176*p
                py=85+math.sin(p*math.pi*2+k*.9)*17 + (k*5-3)
                pts.append((round(px),round(py)))
            if len(pts)>1:
                d.line(pts,fill=(255,193,98,round(170*fade)) if k==0 else (206,208,255,round(185*fade)),width=1)
        for j,(sx,sy,size,delay) in enumerate(stars):
            local=1-abs((sx-72)/176-progress)*2.5
            power=max(0,min(1,local+.45))*fade
            if power<=.05:continue
            r=max(1,round(size*power)); c=(255,226,151,round(255*power)) if j%3 else (205,220,255,round(240*power))
            X=round(sx);Y=round(sy+math.sin(t*7+delay*6)*2)
            d.polygon([(X,Y-r*2),(X+r,Y),(X,Y+r*2),(X-r,Y)],fill=c)
            if size==3:
                d.line((X-r*2,Y,X+r*2,Y),fill=(255,244,207,round(255*power)),width=1)
        # Bright four-point stars frame departure and arrival.
        for cx,cy,peak in [(72,83,.63),(248,83,1.05)]:
            f=max(0,1-abs(t-peak)/.17)*fade
            r=round(12*f)
            if r>0:
                d.polygon([(cx,cy-r*2),(cx+max(1,r//4),cy-max(1,r//4)),(cx+r,cy),(cx+max(1,r//4),cy+max(1,r//4)),(cx,cy+r*2),(cx-max(1,r//4),cy+max(1,r//4)),(cx-r,cy),(cx-max(1,r//4),cy-max(1,r//4))],fill=(255,226,156,round(240*f)))
                d.line((cx,cy-r,cx,cy+r),fill=(255,255,245,round(255*f)),width=1)
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
(OUT/'export-info.json').write_text(json.dumps({'size':[960,480],'duration_ms':2000,'fps':50,'blink_duration_ms':1060,'video_codec':'QuickTime PNG RGBA lossless','alpha':True,'source':'existing heroine frames with new original constellation effect; preview'},indent=2))
print('Saved transparent MOV and APNG (960x480, 2 seconds, 50fps). Alpha and APNG duration checked.')
