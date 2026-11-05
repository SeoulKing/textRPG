const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname,'..');
async function buildLamp() {
  const dir=path.join(root,'art-studies/street-lamp');
  const out=path.join(root,'godot-arcana/art/export/reference');
  const {data,info}=await sharp(path.join(dir,'source/lamp-post.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=-1,bottom=-1;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    if(data[(y*info.width+x)*4+3]<192)continue;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left)throw Error('Empty lamp');
  const height=160,width=Math.round((right-left+1)*height/(bottom-top+1));
  // An even canvas registers the pole on the same whole/half-pixel grid as actors.
  const W=width+8+(width%2),H=height+8;
  const pixels=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}})
    .extract({left,top,width:right-left+1,height:bottom-top+1})
    .resize(width,height,{kernel:'nearest'})
    .extend({left:4,right:W-width-4,top:4,bottom:4,background:'#00000000'}).raw().toBuffer();
  const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
  const colors=new Set();
  for(let i=0;i<pixels.length;i+=4){
    if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}
    const r=Math.round(pixels[i]*31/255),g=Math.round(pixels[i+1]*31/255),b=Math.round(pixels[i+2]*31/255);
    const index=(g*1024+b*32+r)*3;
    pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;
    colors.add(pixels.subarray(i,i+3).toString('hex'));
  }
  await sharp(pixels,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(out,'lamp-post-2d.png'));
  const importFile=path.join(out,'lamp-post-2d.png.import');
  try{await fs.access(importFile);}catch{
    const sample=await fs.readFile(path.join(out,'oak.png.import'),'utf8');
    await fs.writeFile(importFile,sample.replace(/^uid=.*\r?\n/m,'')
      .replace(/path="res:\/\/\.godot\/imported\/[^\"]+"/,'path="res://.godot/imported/lamp-post-2d.png.ctex"')
      .replace(/source_file="[^\"]+"/,'source_file="res://art/export/reference/lamp-post-2d.png"')
      .replace(/dest_files=\[[^\]]+\]/,'dest_files=["res://.godot/imported/lamp-post-2d.png.ctex"]')
      .replace(/detect_3d\/compress_to=\d+/,'detect_3d/compress_to=0').replace(/mipmaps\/generate=true/,'mipmaps/generate=false').replace(/compress\/mode=\d+/,'compress/mode=0'));
  }
  const spec={size:[W,H],foot:[W/2,H-4],source:'source/lamp-post.png',crop:[left,top,right-left+1,bottom-top+1],pixelsPerUnit:64,camera:{yaw:0,pitch:45},paletteColors:colors.size,alpha:[0,255],runtime:'godot-arcana/art/export/reference/lamp-post-2d.png',lighting:'Existing lamp-post source at local Y=2.4; emission remains painted amber glass',placement:'Existing saved lamp-post nodes; unchanged collision',generator:'built-in image_gen',prompt:'prompt.txt',status:'integrated-awaiting-user-art-review'};
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(spec,null,2)+'\n');
  return {'lamp-post':spec};
}
module.exports=buildLamp;
if(require.main===module)buildLamp().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
