const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'godot-arcana/art/export/ground'),W=64,H=45;
// E, SE, S, SW, W, NW, N, NE. A corner exists only with both adjacent sides.
const valid=m=>[1,3,5,7].every(b=>!(m&(1<<b))||((m&(1<<((b+7)%8)))&&(m&(1<<((b+1)%8)))));
async function main(){
 await fs.mkdir(OUT,{recursive:true});
 const source=path.join(ROOT,'art-studies/town-ground/source/materials.png');
 const info=await sharp(source).metadata(),hw=Math.floor(info.width/2),hh=Math.floor(info.height/2);
 const lut=await sharp(path.join(ROOT,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const mats=[];
 for(let q=0;q<4;q++){
  const pixels=await sharp(source).extract({left:q%2*hw,top:Math.floor(q/2)*hh,width:hw,height:hh}).resize(128,90,{kernel:'nearest'}).removeAlpha().raw().toBuffer();
  // Repair the repeat boundary across a short authored wrap strip before palette mapping.
  for(let y=0;y<90;y++)for(let x=0;x<8;x++)for(let c=0;c<3;c++){
   const a=(y*128+x)*3+c,b=(y*128+127-x)*3+c,t=(8-x)/16,aa=pixels[a],bb=pixels[b];
   pixels[a]=Math.round(aa*(1-t)+bb*t);pixels[b]=Math.round(bb*(1-t)+aa*t);
  }
  for(let x=0;x<128;x++)for(let y=0;y<6;y++)for(let c=0;c<3;c++){
   const a=(y*128+x)*3+c,b=((89-y)*128+x)*3+c,t=(6-y)/12,aa=pixels[a],bb=pixels[b];
   pixels[a]=Math.round(aa*(1-t)+bb*t);pixels[b]=Math.round(bb*(1-t)+aa*t);
  }
  for(let i=0;i<pixels.length;i+=3){const r=Math.round(pixels[i]*31/255),g=Math.round(pixels[i+1]*31/255),b=Math.round(pixels[i+2]*31/255),j=(g*1024+b*32+r)*3;pixels.set(lut.subarray(j,j+3),i);}
  mats.push(pixels);
 }
 const soil=await sharp(path.join(ROOT,'godot-arcana/art/export/reference/soil.png')).resize(128,90,{kernel:'nearest'}).removeAlpha().raw().toBuffer();mats.push(soil);
 const sample=(q,x,y)=>{const m=mats[q],i=((y%90)*128+x%128)*3;return [...m.subarray(i,i+3),255];};
 // Shared slab geometry for EVERY terrain and alternate tile. Source colors stay
 // inside fitted slabs rather than copying unrelated source-image grout edges.
 const mapColor=c=>{const j=(Math.round(c[1]*31/255)*1024+Math.round(c[2]*31/255)*32+Math.round(c[0]*31/255))*3;return [...lut.subarray(j,j+3),255];};
 const stone=(x,y,v)=>{
  const row=y<23?0:1,start=row?23:0,height=row?22:23;
  const sx=(x+row*16)%32,sy=y-start;
  const seed=((Math.floor((x+row*16)/32)*13+row*7)%5);
  const face=[[220,208,184],[224,213,191],[216,205,184],[225,213,190],[218,207,187]][seed];
  // Border texels are invariant across all variants; differences are interior.
  const safe=x>7&&x<56&&y>5&&y<39;
  const grain=sample(safe?v%2:0,26+Math.floor(sx*30/32),6+Math.floor(sy*14/height));
    const mineral=Math.max(-6,Math.min(6,((grain[0]+grain[1]+grain[2])/3-205)*.25));
  let c=face.map(a=>Math.round(a+mineral));
  if(sy===0||sx===0)c=[178,168,158];
  else if(sy===1||sx===1)c=[234,223,201];
  else if(sy===height-1)c=[207,195,175];
  else if(sx===31)c=[207,195,179];
  // Sparse chips avoid the edge strips so every neighbor keeps the same phase.
  else if(safe&&sx>5&&sx<27&&sy>5&&sy<height-4){
   const q=(Math.floor(sx/3)*17+Math.floor(sy/2)*11+seed*5+v*13)%71;
   if(q===0)c=face.map(a=>a-7);
   if(q===19)c=face.map(a=>a+4);
  }
  return mapColor(c);
 };
 const masks=Array.from({length:256},(_,i)=>i).filter(valid),tiles=[];
 for(let v=0;v<4;v++)tiles.push({kind:'grass',variant:v});
 for(const mask of masks)tiles.push({kind:'paving',mask});
 for(let v=1;v<4;v++)tiles.push({kind:'paving',mask:255,variant:v});
 for(let v=0;v<4;v++)tiles.push({kind:'soil',variant:v});
 const rows=Math.ceil(tiles.length/8),atlas=Buffer.alloc(8*W*rows*H*4);
 for(let n=0;n<tiles.length;n++){
  const tile=tiles[n],v=tile.variant||0,ox=(v%2)*64,oy=Math.floor(v/2)*45;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   let color=sample(2+(v%2),x+ox,y+oy);
   if(tile.kind==='soil')color=sample(4,x+ox,y+oy);
   if(tile.kind==='paving'){
    const m=tile.mask,px=x+.5,py=(y+.5)*64/45;let d=100;
    if(!(m&1))d=Math.min(d,60-px);if(!(m&4))d=Math.min(d,60-py);
    if(!(m&16))d=Math.min(d,px-4);if(!(m&64))d=Math.min(d,py-4);
    for(const [a,b,diag,cx,cy] of [[64,1,128,64,0],[1,4,2,64,64],[4,16,8,0,64],[16,64,32,0,0]]){
     const dx=Math.abs(px-cx),dy=Math.abs(py-cy);
     if((m&a)&&(m&b)&&!(m&diag))d=Math.min(d,Math.hypot(dx,dy)-4);
     if(!(m&a)&&!(m&b)&&dx<12&&dy<12)d=Math.min(d,8-Math.hypot(dx-12,dy-12));
    }
    color=[0,0,0,0];
    if(d>=0){
     color=stone(x,y,v);
     if(d<3){const seam=(Math.floor(px)+Math.floor(py))%16<1;color=mapColor(seam?[179,168,153]:d<1?[188,177,159]:[228,215,190]);}
    }
   }
   color.forEach((c,k)=>atlas[(((Math.floor(n/8)*H+y)*8*W+(n%8)*W+x)*4)+k]=c);
  }
 }
 await sharp(atlas,{raw:{width:W*8,height:H*rows,channels:4}}).png().toFile(path.join(OUT,'town-ground.png'));
 await fs.writeFile(path.join(OUT,'tiles.json'),JSON.stringify({tileSize:[W,H],columns:8,rows,tiles},null,2)+'\n');
 await fs.writeFile(path.join(ROOT,'art-studies/town-ground/manifest.json'),JSON.stringify({source:'source/materials.png',concept:'approved-concept.png',generator:'built-in image_gen',density:64,tile:[64,45],projection:{yaw:0,pitch:45},terrainMasks:masks.length,grassVariants:4,pavingVariants:4,alpha:[0,255],seams:'shared 64x45 phase; invariant variant borders; transparent ground transitions',palette:'existing world LUT',status:'approved direction; integrated assets pending user review'},null,2)+'\n');
 console.log(`Built ${tiles.length} tiles, ${masks.length} terrain connections, ${W*8}x${H*rows}`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
