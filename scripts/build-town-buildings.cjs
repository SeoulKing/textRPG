const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const dir = path.join(root,'art-studies/town-buildings');
const out = path.join(root,'godot-arcana/art/export/reference');
async function buildBuildings() {
  const lut = await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
  const result = {};
  for (const kind of ['shop','inn','restaurant']) {
    const {data,info} = await sharp(path.join(dir,'source',kind+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=info.width,top=info.height,right=-1,bottom=-1;
    // Generated soft edge/glow is discarded before the common palette pass.
    for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
      if(data[(y*info.width+x)*4+3]<192) continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left) throw Error('Empty building '+kind);
    const width=480, height=Math.round((bottom-top+1)*width/(right-left+1));
    const W=width+8,H=height+8;
    const pixels=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
      .extract({left,top,width:right-left+1,height:bottom-top+1})
      .resize(width,height,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).raw().toBuffer();
    const colors=new Set();
    for(let i=0;i<pixels.length;i+=4) {
      if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}
      const r=Math.round(pixels[i]*31/255),g=Math.round(pixels[i+1]*31/255),b=Math.round(pixels[i+2]*31/255);
      const index=(g*1024+b*32+r)*3;
      pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;
      colors.add(pixels.subarray(i,i+3).toString('hex'));
    }
    await sharp(pixels,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(out,kind+'-2d.png'));
    const sample=await fs.readFile(path.join(out,'oak.png.import'),'utf8');
    const imported=sample.replace(/^uid=.*\r?\n/m,'')
      .replace(/path="res:\/\/\.godot\/imported\/[^\"]+"/,'path="res://.godot/imported/'+kind+'-2d.png.ctex"')
      .replace(/source_file="[^\"]+"/,'source_file="res://art/export/reference/'+kind+'-2d.png"')
      .replace(/dest_files=\[[^\]]+\]/,'dest_files=["res://.godot/imported/'+kind+'-2d.png.ctex"]')
      .replace(/detect_3d\/compress_to=\d+/,'detect_3d/compress_to=0').replace(/mipmaps\/generate=true/,'mipmaps/generate=false').replace(/compress\/mode=\d+/,'compress/mode=0');
    const importFile=path.join(out,kind+'-2d.png.import');
    try{await fs.access(importFile);}catch{await fs.writeFile(importFile,imported);}
    result[kind]={size:[W,H],foot:[W/2,H-4],source:'source/'+kind+'.png',crop:[left,top,right-left+1,bottom-top+1],pixelsPerUnit:64,camera:{yaw:0,pitch:45},paletteColors:colors.size,alpha:[0,255],runtime:'godot-arcana/art/export/reference/'+kind+'-2d.png',collision:[-3.65,-2.2,7.3,2.2],door:'existing local (0,0,0)'};
  }
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({status:'integrated-awaiting-user-art-review',generator:'built-in image_gen',styleReference:'godot-arcana/art/export/reference/academy-2d.png',assets:result},null,2)+'\n');
  return result;
}
module.exports=buildBuildings;
if(require.main===module) buildBuildings().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
