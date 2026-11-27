const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
async function build(){
 const source='art-studies/city-walls/source/gate-tower.png';
 const {data,info}=await sharp(path.join(root,source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=192){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 if(right<left)throw Error('Empty tower source');
 const height=440,width=Math.min(176,Math.round((right-left+1)*height/(bottom-top+1)));
 const pixels=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract({left,top,width:right-left+1,height:bottom-top+1}).resize(width,height,{kernel:'nearest'}).extend({left:Math.floor((192-width)/2),right:Math.ceil((192-width)/2),top:52,bottom:20,background:'#00000000'}).raw().toBuffer();
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const colors=new Set();
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}const r=Math.round(pixels[i]*31/255),g=Math.round(pixels[i+1]*31/255),b=Math.round(pixels[i+2]*31/255);const index=(g*1024+b*32+r)*3;pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;colors.add(pixels.subarray(i,i+3).toString('hex'));}
 await sharp(pixels,{raw:{width:192,height:512,channels:4}}).png().toFile(path.join(root,'godot-arcana/art/export/walls/gate-tower.png'));
 await fs.writeFile(path.join(root,'art-studies/city-walls/tower-manifest.json'),JSON.stringify({source,sourceCrop:[left,top,right-left+1,bottom-top+1],size:[192,512],foot:[96,480],pixelsPerUnit:64,alpha:[0,255],paletteColors:colors.size,generator:'built-in image_gen',reference:'godot-arcana/art/reference/street-lamp/district-overview.png',runtime:'godot-arcana/art/export/walls/gate-tower.png',status:'approved-concept-rescaled-to-four-hero-heights'},null,2));
 console.log(`Built tower sprite 192x512, ${colors.size} shared palette colors`);
}
build().catch(e=>{console.error(e);process.exitCode=1;});
