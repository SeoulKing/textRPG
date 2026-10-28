from pathlib import Path
from PIL import Image, ImageDraw
from io import BytesIO
import struct, json
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
REF=ROOT/'godot-arcana/art/source/heroine/reference-bright-v10/native-frames/idle_e'
FX=ROOT/'godot-arcana/art/source/effects/teleport-v1/native-frames/blink_e'
idle=[Image.open(REF/f'frame-{i:02}.png').convert('RGBA') for i in range(4)]
effects=[Image.open(FX/f'frame-{i:02}.png').convert('RGBA') for i in range(8)]
frames=[]
# 50fps: existing 20ms VFX frames remain unchanged. 0.6s lead, 0.16s blink, 1.24s tail.
for i in range(100):
    im=Image.new('RGBA',(320,160))
    n=i-30
    pos=(24,12) if n<4 else (200,12)
    if n<0 or n>=8 or n in (0,6,7):
        im.alpha_composite(idle[(i//20)%4],pos)
    if 0<=n<8: im.alpha_composite(effects[n],pos)
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
for j,i in enumerate([20,30,31,32,33,34,35,36,37]):
    small=frames[i].resize((320,160),Image.Resampling.NEAREST)
    board.paste(small,((j%3)*320,(j//3)*160),small)
board.save(OUT/'contact-sheet.jpg')
# Verify exported alpha and frame duration, and decode the first PNG sample in the MOV.
apng=Image.open(OUT/'heroine-blink-transparent.png')
assert apng.info.get('loop')==0
assert abs(sum((apng.seek(i) or apng.info['duration']) for i in range(apng.n_frames))-2000)<1
assert Image.open(BytesIO(samples[0])).mode=='RGBA'
assert all(f.getpixel((0,0))[3]==0 for f in frames)
(OUT/'export-info.json').write_text(json.dumps({'size':[960,480],'duration_ms':2000,'fps':50,'blink_duration_ms':160,'video_codec':'QuickTime PNG RGBA lossless','alpha':True,'source':'existing approved heroine and teleport-v1 frames; no artwork edited'},indent=2))
print('Saved transparent MOV and APNG (960x480, 2 seconds, 50fps). Alpha and APNG duration checked.')
