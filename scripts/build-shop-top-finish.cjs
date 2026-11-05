const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),base=path.join(root,'art-studies/regions/arcana-shop-interior'),src=path.join(base,'source/top-finish-v4'),out=path.join(root,'godot-arcana/art/export/shop-interior');
async function main(){
 const {data,info}=await sharp(path.join(src,'back-wall-master.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,r=-1,t=info.height,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=192){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 if(r<l)throw Error('Missing opaque wall');
 const width=896,height=Math.round((b-t+1)*width/(r-l+1));
 const {data:pixels,info:packed}=await sharp(data,{raw:info}).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(width,height,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).raw().toBuffer({resolveWithObject:true});
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}const j=(Math.round(pixels[i+1]*31/255)*1024+Math.round(pixels[i+2]*31/255)*32+Math.round(pixels[i]*31/255))*3;pixels.set(lut.subarray(j,j+3),i);pixels[i+3]=255;}
 await sharp(pixels,{raw:packed}).png().toFile(path.join(out,'back-wall-v4.png'));
 const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
 manifest.assets['back-wall-v4']={file:'res://art/export/shop-interior/back-wall-v4.png',size:[packed.width,packed.height],foot:[452,height+4],source:'top-finish-v4/back-wall-master.png',crop:[l,t,r-l+1,b-t+1],role:'finished-top-coping-back-wall',sourcePixelsPerUnit:64,footprintCells:[14,.5],registration:{point:[12,4],fullTopCoping:true}};
 manifest.room.backWall='back-wall-v4';manifest.room.voidColor='#000000';
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(base,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({size:[packed.width,packed.height],foot:[452,height+4]}));
}
main().catch(e=>{console.error(e);process.exit(1)});
