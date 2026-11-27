const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
async function build(){
 const source='art-studies/arcana-reference-v1/source/planter-front-v2.png';
 const {data,info}=await sharp(path.join(root,source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,t=info.height,r=-1,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=128){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
 if(r<0)throw Error('Empty planter');
 const resized=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(80,68,{fit:'inside',kernel:'nearest'}).raw().toBuffer({resolveWithObject:true});
 const left=Math.floor((84-resized.info.width)/2);
 const pixels=await sharp(resized.data,{raw:resized.info}).extend({left,right:84-resized.info.width-left,top:70-resized.info.height,bottom:2,background:'#00000000'}).raw().toBuffer();
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 for(let i=0;i<pixels.length;i+=4){
  if(pixels[i+3]<128){pixels.fill(0,i,i+4);continue;}
  const rr=Math.round(pixels[i]*31/255),gg=Math.round(pixels[i+1]*31/255),bb=Math.round(pixels[i+2]*31/255),j=(gg*1024+bb*32+rr)*3;
  pixels.set(lut.subarray(j,j+3),i);pixels[i+3]=255;
 }
 await sharp(pixels,{raw:{width:84,height:72,channels:4}}).png().toFile(path.join(root,'godot-arcana/art/export/reference/planter.png'));
 return {planter:{size:[84,72],foot:[42,70],source,pixelsPerUnit:64,camera:{yaw:0,pitch:45}}};
}
module.exports=build;
if(require.main===module)build().then(async result=>{
 const manifestPath=path.join(root,'art-studies/arcana-reference-v1/manifest.json');
 const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 Object.assign(manifest.props,result);await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(result));
}).catch(e=>{console.error(e);process.exitCode=1;});
