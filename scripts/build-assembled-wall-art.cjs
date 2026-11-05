// Approved whole enclosure -> exact pieces. The source artwork stays intact.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..'),DIR=path.join(ROOT,'godot-arcana/art/source/walls/assembled-v1');
const SOURCE=path.join(ROOT,'art-studies/city-walls/enclosure-master-v1/enclosure-concept.png');
const GRID=16,SCALE=.75,MW=1056,MH=848;
const defs=[
 ['nw','뒤 왼쪽 모서리',32,32,96,208],['north_left','뒤 직선 A',128,64,240,176],
 ['north_post_a','뒤 기둥 A',368,32,64,208],['north_middle','뒤 직선 B',432,64,176,176],
 ['north_post_b','뒤 기둥 B',608,32,64,208],['north_right','뒤 직선 C',672,64,256,176],
 ['ne','뒤 오른쪽 모서리',928,32,96,208],['left_post','왼쪽 세로 기둥',32,240,96,96],
 ['left_straight','왼쪽 세로 직선',32,336,96,160],['right_post','오른쪽 세로 기둥',928,240,96,96],
 ['right_straight','오른쪽 세로 직선',928,336,96,160],
 ['sw','앞 왼쪽 모서리',32,496,96,240],['front_left','앞 직선 A',128,528,256,208],
 ['gate_left','입구 왼쪽 끝',384,496,96,240],['gate_right','입구 오른쪽 끝',576,496,96,240],
 ['front_right','앞 직선 B',672,528,256,208],['se','앞 오른쪽 모서리',928,496,96,240],
 ['north_repeat','뒤 반복 벽 · 기둥 포함',368,32,304,208],
 ['front_repeat_left','앞 반복 벽 A · 128px',160,528,128,208],
 ['front_repeat_right','앞 반복 벽 B · 128px',160,528,128,208],
 ['left_repeat','왼쪽 반복 벽 · 160px',32,336,96,160],
 ['right_repeat','오른쪽 반복 벽 · 160px',928,336,96,160],
 ['front_extend_left','앞 연결 벽 A · 112px',160,528,112,208],
 ['front_extend_right','앞 연결 벽 B · 112px',160,528,112,208]
];
function crop(master,x,y,w,h){
 const out=Buffer.alloc(w*h*4);for(let yy=0;yy<h;yy++)master.copy(out,yy*w*4,((y+yy)*MW+x)*4,((y+yy)*MW+x+w)*4);return out;
}
function collisions(id,w,h){
 const hor=[-8,h-28,w,12];
 if(id.startsWith('left_'))return [[24,120,32,h]];
 if(id.startsWith('right_'))return [[24,120,32,h]];
 if(id==='nw')return [[40,h-28,48,12],[24,h-16,32,136]];
 if(id==='ne')return [[-8,h-28,48,12],[24,h-16,32,136]];
 if(id==='sw')return [[40,h-28,48,12],[24,120,32,104]];
 if(id==='se')return [[-8,h-28,48,12],[24,120,32,104]];
 if(id.startsWith('gate_'))return [[0,h-32,w-16,20]];
 return [hor];
}
function placement(id,x,y){return{part:id,cell:[x/GRID,y/GRID]};}
async function main(){
 await fs.mkdir(DIR,{recursive:true});
 const input=await sharp(SOURCE).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let removed=0;for(let i=3;i<input.data.length;i+=4){if(input.data[i]<128){if(input.data[i]>0)removed++;input.data[i]=0;input.data[i-1]=0;input.data[i-2]=0;input.data[i-3]=0;}else input.data[i]=255;}
 const resized=await sharp(input.data,{raw:{width:input.info.width,height:input.info.height,channels:4}})
  .resize(Math.round(input.info.width*SCALE),Math.round(input.info.height*SCALE),{kernel:'nearest'})
  .extend({right:4,bottom:6,background:{r:0,g:0,b:0,alpha:0}}).raw().toBuffer({resolveWithObject:true});
 if(resized.info.width!==MW||resized.info.height!==MH)throw Error('Master canvas alignment mismatch '+JSON.stringify(resized.info));
 const master=resized.data;
 await sharp(master,{raw:{width:MW,height:MH,channels:4}}).png().toFile(path.join(DIR,'enclosure-master.png'));
 const parts=[];let px=0,py=0,rowH=0;
 for(const [id,label,x,y,w,h]of defs){
  if(px+w>1024){py+=rowH;px=0;rowH=0;}
  parts.push({id,label,sourceRect:[x,y,w,h],atlas:[px/16,py/16],atlasSize:[w/16,h/16],
   origin:[8-w/2,8-h/2],sortOrigin:id.includes('left_')||id.includes('right_')?h+120:h-16,
   collision:collisions(id,w,h),repeat:id.includes('repeat')||id.includes('extend')});
  px+=w;rowH=Math.max(rowH,h);
 }
 const ah=py+rowH,atlas=Buffer.alloc(1024*ah*4);
 for(const p of parts){
  const [x,y,w,h]=p.sourceRect,data=crop(master,x,y,w,h),ax=p.atlas[0]*16,ay=p.atlas[1]*16;
  for(let yy=0;yy<h;yy++)data.copy(atlas,((ay+yy)*1024+ax)*4,yy*w*4,(yy+1)*w*4);
 }
 await sharp(atlas,{raw:{width:1024,height:ah,channels:4}}).png({palette:true,colours:255,dither:0}).toFile(path.join(DIR,'atlas-prepared.png'));
 const original=parts.slice(0,17).map(p=>placement(p.id,p.sourceRect[0],p.sourceRect[1]));
 const assembled=Buffer.alloc(MW*MH*4);
 for(const p of parts.slice(0,17)){const[x,y,w,h]=p.sourceRect;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){
  const at=((y+yy)*MW+x+xx)*4;if(master[at+3])master.copy(assembled,at,at,at+4);
 }}
 let missing=0;for(let i=3;i<master.length;i+=4)if(master[i]&&!assembled[i])missing++;
 // No procedural replacement art: all visible source pixels must belong to a piece.
 if(missing)throw Error('Crop partition lost '+missing+' approved opaque pixels');
 const expanded=[];
 for(const p of parts.slice(0,17)){
  let[x,y]=p.sourceRect;
  if(['north_post_a','north_middle','north_post_b','front_left','front_right'].includes(p.id))continue;
  if(p.id==='north_middle'||p.id==='north_post_b'||p.id==='north_right'||p.id==='ne'||p.id.startsWith('right_')||p.id==='se')x+=480;
  if(p.id==='gate_left'||p.id==='gate_right')x+=240;
  if(p.id==='front_right')x+=480;
  if(['sw','front_left','gate_left','gate_right','front_right','se'].includes(p.id))y+=160;
  expanded.push(placement(p.id,x,y));
 }
 expanded.push(placement('north_repeat',368,32),placement('north_repeat',608,32),placement('north_repeat',848,32),
  placement('left_repeat',32,496),placement('right_repeat',1408,496),
  placement('front_repeat_left',128,688),placement('front_repeat_left',256,688),placement('front_repeat_right',1152,688),placement('front_repeat_right',1280,688),placement('front_extend_left',384,688),placement('front_repeat_left',496,688),placement('front_repeat_right',912,688),placement('front_extend_right',1040,688));
 const manifest={version:1,source:path.relative(ROOT,SOURCE).replaceAll('\\','/'),uniformScale:SCALE,grid:[16,16],atlasCell:[16,16],atlasSize:[1024,ah],masterSize:[MW,MH],parts,
  arrangements:{original:{placements:original},expanded:{placements:expanded}},
  authoring:{method:'Approved complete enclosure -> exact crop parts -> PixelPen seam repairs for repeat-only variants',originalOpaquePixelLoss:missing,removedLowAlphaPixels:removed}};
 await fs.writeFile(path.join(DIR,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Approved enclosure: '+parts.length+' actual parts; original reconstruction lost '+missing+' opaque pixels; atlas1024x'+ah);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

