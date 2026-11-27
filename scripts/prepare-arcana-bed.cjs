// Preparation is a tracing reference; the final indexed artwork is authored in PixelPen.
const fs=require('node:fs/promises'),sharp=require('sharp');
(async()=>{
 const folder='godot-arcana/art/source/props/bed-stardew-v1';
 const {data,info}=await sharp('art-studies/props/bed-stardew-v1/concept.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=4){if(data[i+3]<192)data.fill(0,i,i+4);else data[i+3]=255;}
 const cropped=await sharp(data,{raw:info}).extract({left:154,top:149,width:717,height:1205}).resize(144,242,{kernel:'lanczos3'}).raw().toBuffer();
 for(let i=0;i<cropped.length;i+=4){if(cropped[i+3]<192)cropped.fill(0,i,i+4);else cropped[i+3]=255;}
 const png=await sharp(cropped,{raw:{width:144,height:242,channels:4}}).png().toBuffer();
 await sharp({create:{width:176,height:272,channels:4,background:'#00000000'}}).composite([{input:png,left:16,top:8}]).png({palette:true,colours:96,dither:0}).toFile(folder+'/tracing-reference.png');
 console.log('Prepared tracing reference: 176x272, art 144x242. Final finish runs in native PixelPen.');
})().catch(e=>{console.error(e);process.exit(1)});
