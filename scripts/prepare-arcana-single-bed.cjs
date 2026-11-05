// Preparation is a tracing reference; the final indexed artwork is authored in PixelPen.
const fs=require('node:fs/promises'),sharp=require('sharp');
(async()=>{
 const folder='godot-arcana/art/source/props/bed-single-v3';
 const {data,info}=await sharp('art-studies/props/bed-single-v3/concept.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=4){if(data[i+3]<192)data.fill(0,i,i+4);else data[i+3]=255;}
 const cropped=await sharp(data,{raw:info}).extract({left:248,top:246,width:528,height:1097}).resize(80,166,{kernel:'lanczos3'}).raw().toBuffer();
 for(let i=0;i<cropped.length;i+=4){if(cropped[i+3]<192)cropped.fill(0,i,i+4);else cropped[i+3]=255;}
 const png=await sharp(cropped,{raw:{width:80,height:166,channels:4}}).png().toBuffer();
 await sharp({create:{width:112,height:192,channels:4,background:'#00000000'}}).composite([{input:png,left:16,top:8}]).png({palette:true,colours:96,dither:0}).toFile(folder+'/tracing-reference.png');
 console.log('Prepared tracing reference: 112x192, uniform scale from new single-bed concept, art 80x166. Final finish runs in native PixelPen.');
})().catch(e=>{console.error(e);process.exit(1)});
