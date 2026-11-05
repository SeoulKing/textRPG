const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const study=path.resolve(__dirname,'../art-studies/regions/arcana-city-center/source/river-navy-v2'),at=(x,y,w)=>(y*w+x)*4;
function seam(w,h,cost){const dp=new Float64Array(w*h),prev=new Int16Array(w*h);for(let x=0;x<w;x++)dp[x]=cost(x,0);for(let y=1;y<h;y++)for(let x=0;x<w;x++){let k=x;for(let j=Math.max(0,x-1);j<=Math.min(w-1,x+1);j++)if(dp[(y-1)*w+j]<dp[(y-1)*w+k])k=j;dp[y*w+x]=cost(x,y)+dp[(y-1)*w+k];prev[y*w+x]=k;}let x=0;for(let j=1;j<w;j++)if(dp[(h-1)*w+j]<dp[(h-1)*w+x])x=j;const result=new Int16Array(h);for(let y=h-1;y>=0;y--){result[y]=x;x=prev[y*w+x];}return result;}
(async()=>{const n=512,o=64,size=n+o,src=await sharp(path.join(study,'water-generated.png')).resize(size,size,{kernel:'nearest'}).ensureAlpha().raw().toBuffer(),diff=(buf,a,b)=>Math.abs(buf[a]-buf[b])+Math.abs(buf[a+1]-buf[b+1])+Math.abs(buf[a+2]-buf[b+2]);
const sx=seam(o,size,(x,y)=>diff(src,at(x,y,size),at(n+x,y,size))),h=Buffer.alloc(n*size*4),out=Buffer.alloc(n*n*4);
for(let y=0;y<size;y++)for(let x=0;x<n;x++){const xx=x<o&&x<sx[y]?n+x:x;src.copy(h,at(x,y,n),at(xx,y,size),at(xx,y,size)+4);}
const sy=seam(o,n,(y,x)=>diff(h,at(x,y,n),at(x,n+y,n)));
for(let y=0;y<n;y++)for(let x=0;x<n;x++){const yy=y<o&&y<sy[x]?n+y:y;h.copy(out,at(x,y,n),at(x,yy,n),at(x,yy,n)+4);}
await sharp(out,{raw:{width:n,height:n,channels:4}}).png({palette:true,colours:32,dither:0}).toFile(path.join(study,'base-prepared.png'));console.log('RIVER_NAVY_PREPARED static512x512');})().catch(e=>{console.error(e);process.exit(1)});
