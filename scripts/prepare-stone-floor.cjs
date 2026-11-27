// Prepare an edge-continuous material; PixelPen owns the final editable art.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const study=path.join(root,'art-studies/stone-floor-detail-v1');
const native=path.join(root,'godot-arcana/art/source/stone-floor-v1');
const out=path.join(root,'godot-arcana/art/export/stone-floor-v1');
const at=(x,y,w)=>(y*w+x)*4;
function cut(cost,w,h){
 const dp=new Float64Array(w*h),prev=new Int16Array(w*h);
 for(let x=0;x<w;x++)dp[x]=cost[x]+Math.abs(x-w/2)*.02;
 for(let y=1;y<h;y++)for(let x=0;x<w;x++){
  let best=x;for(let k=Math.max(0,x-1);k<=Math.min(w-1,x+1);k++)if(dp[(y-1)*w+k]<dp[(y-1)*w+best])best=k;
  dp[y*w+x]=cost[y*w+x]+dp[(y-1)*w+best];prev[y*w+x]=best;
 }
 let x=0;for(let k=1;k<w;k++)if(dp[(h-1)*w+k]<dp[(h-1)*w+x])x=k;
 const seam=new Int16Array(h);for(let y=h-1;y>=0;y--){seam[y]=x;x=prev[y*w+x];}return seam;
}
function wrapQuilt(src,n,overlap){
 const size=n+overlap,cost=new Float64Array(overlap*size);
 for(let y=0;y<size;y++)for(let x=0;x<overlap;x++){
  const a=at(x,y,size),b=at(n+x,y,size);
  cost[y*overlap+x]=Math.abs(src[a]-src[b])+Math.abs(src[a+1]-src[b+1])+Math.abs(src[a+2]-src[b+2]);
 }
 const sx=cut(cost,overlap,size),horizontal=Buffer.alloc(n*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<n;x++){
  const xx=x<overlap&&x<sx[y]?n+x:x;
  src.copy(horizontal,at(x,y,n),at(xx,y,size),at(xx,y,size)+4);
 }
 const cy=new Float64Array(overlap*n);
 for(let x=0;x<n;x++)for(let y=0;y<overlap;y++){
  const a=at(x,y,n),b=at(x,n+y,n);
  cy[x*overlap+y]=Math.abs(horizontal[a]-horizontal[b])+Math.abs(horizontal[a+1]-horizontal[b+1])+Math.abs(horizontal[a+2]-horizontal[b+2]);
 }
 const sy=cut(cy,overlap,n),result=Buffer.alloc(n*n*4);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const yy=y<overlap&&y<sy[x]?n+y:y;
  horizontal.copy(result,at(x,y,n),at(x,yy,n),at(x,yy,n)+4);
 }
 return result;
}
async function quantized(data,w,h,target){
 await sharp(data,{raw:{width:w,height:h,channels:4}}).png({palette:true,colours:192,dither:0}).toFile(target);
 return sharp(target).ensureAlpha().raw().toBuffer();
}
async function main(){
 for(const d of [native,out,path.join(study,'prepared')])await fs.mkdir(d,{recursive:true});
 const input=await sharp(path.join(study,'stone-material-generated.png')).resize(576,576,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
 const stone=wrapQuilt(input,512,64);
 const prepared=path.join(study,'prepared/stone-pattern.png');
 await quantized(stone,512,512,prepared);
 // Ornament geometry reuses the approved drawn mosaic, rather than generic lines.
 const strip=await sharp(path.join(study,'concept-v1.png')).extract({left:482,top:184,width:585,height:165}).resize(128,36,{fit:'fill',kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
 const star=await sharp(path.join(study,'concept-v1.png')).extract({left:730,top:216,width:90,height:90}).resize(26,26).ensureAlpha().raw().toBuffer();
 const atlas=Buffer.alloc(512*512*4);
 const contains=(mask,x,y)=>{
  const center=x>=46&&x<82&&y>=46&&y<82;
  return center||((mask&1)&&x>=64&&y>=46&&y<82)||((mask&2)&&y>=64&&x>=46&&x<82)||((mask&4)&&x<64&&y>=46&&y<82)||((mask&8)&&y<64&&x>=46&&x<82);
 };
 for(let mask=0;mask<16;mask++)for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  if(!contains(mask,x,y))continue;
  let c;
  if(x>=51&&x<77&&y>=51&&y<77)c=star.subarray(at(x-51,y-51,26),at(x-51,y-51,26)+4);
  else {
   const vertical=(y<46||y>=82);
   const u=vertical?y:x,v=vertical?127-x:y;
   const sy=Math.max(0,Math.min(35,v-46));
   c=Buffer.from(strip.subarray(at(u,sy,128),at(u,sy,128)+4));
   // Explicit continuous 1px gold edge, with reference metal colors.
   if(!contains(mask,x-1,y)||!contains(mask,x+1,y)||!contains(mask,x,y-1)||!contains(mask,x,y+1))c=Buffer.from([219,182,105,255]);
  }
  c.copy(atlas,at((mask%4)*128+x,Math.floor(mask/4)*128+y,512));
 }
 const ornamentPrepared=path.join(study,'prepared/ornament-connectors.png');
 await quantized(atlas,512,512,ornamentPrepared);
 const jobs=[['stone-pattern',prepared,[512,512]],['ornament-connectors',ornamentPrepared,[512,512]]].map(([id,input,size])=>({
  id,input:input.replaceAll('\\','/'),size,source:'res://art/source/stone-floor-v1/'+id+'.pxpen',output:'res://art/export/stone-floor-v1/'+id+'.png'
 }));
 await fs.writeFile(path.join(study,'pixelpen-plan.json'),JSON.stringify({cell:128,density:64,period:512,source:'concept-v1.png',jobs},null,2)+'\n');
 console.log('Prepared 512px seamless limestone, 16 connected mosaic modules; native PixelPen finishing pending.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
