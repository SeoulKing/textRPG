const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const base=path.resolve(__dirname,'../art-studies/regions/arcana-city-center/source/river-ingame-options-v4');
const idx=(x,y,w)=>(y*w+x)*4;
function seam(w,h,cost){let dp=new Float64Array(w*h),prev=new Int16Array(w*h);for(let x=0;x<w;x++)dp[x]=cost(x,0);for(let y=1;y<h;y++)for(let x=0;x<w;x++){let k=x;for(let j=Math.max(0,x-1);j<=Math.min(w-1,x+1);j++)if(dp[(y-1)*w+j]<dp[(y-1)*w+k])k=j;dp[y*w+x]=cost(x,y)+dp[(y-1)*w+k];prev[y*w+x]=k;}let x=0;for(let j=1;j<w;j++)if(dp[(h-1)*w+j]<dp[(h-1)*w+x])x=j;let s=new Int16Array(h);for(let y=h-1;y>=0;y--){s[y]=x;x=prev[y*w+x];}return s;}
(async()=>{await fs.mkdir(path.join(base,'prepared'),{recursive:true});const meta=await sharp(path.join(base,'generated-materials.png')).metadata();if(meta.width!==1536||meta.height!==1024)throw Error('Unexpected grid dimensions');const n=448,o=64,size=512,jobs=[];
for(let i=0;i<5;i++){const src=await sharp(path.join(base,'generated-materials.png')).extract({left:(i%3)*size,top:Math.floor(i/3)*size,width:size,height:size}).ensureAlpha().raw().toBuffer();
const diff=(buf,a,b)=>Math.abs(buf[a]-buf[b])+Math.abs(buf[a+1]-buf[b+1])+Math.abs(buf[a+2]-buf[b+2]),sx=seam(o,size,(x,y)=>diff(src,idx(x,y,size),idx(n+x,y,size))),h=Buffer.alloc(n*size*4),out=Buffer.alloc(n*n*4);
for(let y=0;y<size;y++)for(let x=0;x<n;x++){const xx=x<o&&x<sx[y]?n+x:x;src.copy(h,idx(x,y,n),idx(xx,y,size),idx(xx,y,size)+4);}
const sy=seam(o,n,(y,x)=>diff(h,idx(x,y,n),idx(x,n+y,n)));for(let y=0;y<n;y++)for(let x=0;x<n;x++){const yy=y<o&&y<sy[x]?n+y:y;h.copy(out,idx(x,y,n),idx(x,yy,n),idx(x,yy,n)+4);}
const input=path.join(base,'prepared',String(i+1).padStart(2,'0')+'.png');await sharp(out,{raw:{width:n,height:n,channels:4}}).png({palette:true,colours:i===4?24:64,dither:0}).toFile(input);jobs.push({number:i+1,input:input.replaceAll('\\','/')});}
await fs.writeFile(path.join(base,'plan.json'),JSON.stringify({jobs,tilePixels:64,materialPixels:448},null,2));console.log('RIVER_CANDIDATES_PREPARED5 native448px');})().catch(e=>{console.error(e);process.exit(1)});
