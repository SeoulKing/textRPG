const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),study=path.join(root,'art-studies/regions/arcana-city-center/source/river-v1'),source=path.join(root,'godot-arcana/art/source/city-river-v1'),out=path.join(root,'godot-arcana/art/export/city-river-v1');
const px=(x,y,w)=>(y*w+x)*4;
function quilt(src,n,o){
 const size=n+o,h=Buffer.alloc(n*size*4),result=Buffer.alloc(n*n*4);
 // Choose a low-contrast continuous seam instead of blending/doubling ripples.
 function seam(width,height,cost){let dp=new Float64Array(width*height),prev=new Int16Array(width*height);for(let x=0;x<width;x++)dp[x]=cost(x,0);for(let y=1;y<height;y++)for(let x=0;x<width;x++){let k=x;for(let j=Math.max(0,x-1);j<=Math.min(width-1,x+1);j++)if(dp[(y-1)*width+j]<dp[(y-1)*width+k])k=j;dp[y*width+x]=cost(x,y)+dp[(y-1)*width+k];prev[y*width+x]=k;}let x=0;for(let j=1;j<width;j++)if(dp[(height-1)*width+j]<dp[(height-1)*width+x])x=j;let s=new Int16Array(height);for(let y=height-1;y>=0;y--){s[y]=x;x=prev[y*width+x];}return s;}
 const diff=(buf,a,b)=>Math.abs(buf[a]-buf[b])+Math.abs(buf[a+1]-buf[b+1])+Math.abs(buf[a+2]-buf[b+2]);
 const sx=seam(o,size,(x,y)=>diff(src,px(x,y,size),px(n+x,y,size)));
 for(let y=0;y<size;y++)for(let x=0;x<n;x++){let xx=x<o&&x<sx[y]?n+x:x;src.copy(h,px(x,y,n),px(xx,y,size),px(xx,y,size)+4);}
 const sy=seam(o,n,(y,x)=>diff(h,px(x,y,n),px(x,n+y,n)));
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let yy=y<o&&y<sy[x]?n+y:y;h.copy(result,px(x,y,n),px(x,yy,n),px(x,yy,n)+4);}return result;
}
async function quantize(buffer,raw,file){await sharp(buffer,raw?{raw}:{}).png({palette:true,colours:112,dither:0}).toFile(file);}
async function main(){
 await fs.mkdir(source,{recursive:true});await fs.mkdir(out,{recursive:true});
 const bridge=await sharp(path.join(study,'bridge-generated.png')).extract({left:262,top:107,width:531,height:1228}).ensureAlpha().raw().toBuffer();
 const reduced=Buffer.alloc(531*848*4);let dy=0;
 for(const [a,b] of [[0,260],[420,760],[980,1228]]){bridge.copy(reduced,dy*531*4,a*531*4,b*531*4);dy+=b-a;}
 const b=await sharp(reduced,{raw:{width:531,height:848,channels:4}}).resize(320,511,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
 for(let i=0;i<b.length;i+=4)b[i+3]=b[i+3]>=170?255:0;
 await quantize(b,{width:320,height:511,channels:4},path.join(study,'bridge-prepared.png'));
 const bank=await sharp(path.join(study,'bank-generated.png')).extract({left:70,top:280,width:1908,height:207}).resize(512,56,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
 for(let i=0;i<bank.length;i+=4)bank[i+3]=bank[i+3]>=200 && !(bank[i]<110&&bank[i+2]>bank[i]*.98)?255:0;
 await quantize(bank,{width:512,height:56,channels:4},path.join(study,'bank-prepared.png'));
 const water=await sharp(path.join(study,'water-generated.png')).resize(576,576,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
 await quantize(quilt(water,512,64),{width:512,height:512,channels:4},path.join(study,'water-calm-prepared.png'));
 const jobs=['bridge','bank','water-calm'].map(id=>({id,input:path.join(study,id+'-prepared.png').replaceAll('\\','/'),source:'res://art/source/city-river-v1/'+id+'.pxpen',output:'res://art/export/city-river-v1/'+id+'.png',periodic:id==='water-calm',seam:id==='bank'}));
 await fs.writeFile(path.join(study,'pixelpen-plan.json'),JSON.stringify({jobs},null,2)+'\n');
 console.log('RIVER_PREPARED bridge320x511 bank512x56 water512x512; no stretched geometry');
}
main().catch(e=>{console.error(e);process.exit(1)});
