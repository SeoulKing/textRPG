const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
async function buildFurniture() {
  const source = 'art-studies/arcana-reference-v1/source/bench-crate-front-v2.png';
  const {data,info} = await sharp(path.join(root,source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const lut = await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
  const result = {};
  for(const [name,start,end,width] of [['bench',0,Math.floor(info.width*.65),124],['crate',Math.floor(info.width*.65),info.width,60]]) {
    let left=end,top=info.height,right=-1,bottom=-1;
    for(let y=0;y<info.height;y++) for(let x=start;x<end;x++) {
      if(data[(y*info.width+x)*4+3]<128) continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left) throw Error('Empty furniture '+name);
    const height=Math.round((bottom-top+1)*width/(right-left+1));
    const pixels=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
      .extract({left,top,width:right-left+1,height:bottom-top+1})
      .resize(width,height,{kernel:'nearest'})
      .extend({left:2,right:2,top:2,bottom:2,background:'#00000000'}).raw().toBuffer();
    for(let i=0;i<pixels.length;i+=4) {
      if(pixels[i+3]<128) {pixels.fill(0,i,i+4);continue;}
      const r=Math.round(pixels[i]*31/255),g=Math.round(pixels[i+1]*31/255),b=Math.round(pixels[i+2]*31/255);
      const index=(g*1024+b*32+r)*3;
      pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;
    }
    await sharp(pixels,{raw:{width:width+4,height:height+4,channels:4}}).png().toFile(path.join(root,'godot-arcana/art/export/reference',name+'.png'));
    result[name]={size:[width+4,height+4],foot:[(width+4)/2,height+2],source,pixelsPerUnit:64,camera:{yaw:0,pitch:45}};
  }
  return result;
}
module.exports=buildFurniture;
if(require.main===module) buildFurniture().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
