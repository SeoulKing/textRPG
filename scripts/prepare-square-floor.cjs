const fs=require('fs'),sharp=require('sharp');
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

(async()=>{const base='art-studies/regions/arcana-city-center/source/square-floor-v2/';const raw=await sharp(base+'generated-material.png').resize(360,360,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();const result=wrapQuilt(raw,320,40);await sharp(result,{raw:{width:320,height:320,channels:4}}).png({palette:true,colours:128,dither:0}).toFile(base+'prepared.png');const plan={jobs:[{id:'paving',input:process.cwd().replaceAll('\\','/')+'/'+base+'prepared.png',source:'res://art/source/square-floor-v2/paving.pxpen',output:'res://art/export/square-floor-v2/paving.png'}]};fs.writeFileSync(base+'pixelpen-plan.json',JSON.stringify(plan,null,2)+'\n');console.log('Prepared approved floor02 at320px, native small pavers.');})();