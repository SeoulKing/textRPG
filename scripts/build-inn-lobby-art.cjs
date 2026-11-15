const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname,'..');
const sourceDir = path.join(root,'art-studies/inn-lobby/source');
const out = path.join(root,'godot-arcana/art/export/inn-lobby');
// Source rectangles are registered from the generated sheets, not assumed grid cells.
const specs = [
 ['corner-sofa','sofa-front-v3.png',[0,0,1682,935],352],
 ['bookcase','furniture-v2.png',[1030,0,470,615],168],
 ['storage-bench','furniture-v2.png',[90,640,880,355],232],
 ['luggage','furniture-v2.png',[1030,620,470,375],104],
 ['sofa','furniture-sheet-v1.png',[0,80,550,300],264],
 ['fireplace','furniture-sheet-v1.png',[550,0,474,385],264],
 ['counter','counter-front-v2.png',[0,0,1536,1024],280],
 ['stairs','furniture-sheet-v1.png',[90,385,400,320],184],
 ['tea-table','furniture-sheet-v1.png',[550,420,474,285],172],
 ['plant','furniture-sheet-v1.png',[1080,390,420,315],80],
 ['armchair','furniture-sheet-v1.png',[100,705,380,319],108],
 ['lantern','furniture-sheet-v1.png',[650,715,250,300],38],
 ['lamp-table','furniture-sheet-v1.png',[1120,705,320,319],76],
 ['wall','architecture-sheet-v1.png',[20,0,730,535],268],
 ['rug','architecture-sheet-v1.png',[790,55,720,460],448],
 ['keys','architecture-sheet-v1.png',[170,545,450,465],100],
 ['small-rug','architecture-sheet-v1.png',[790,55,720,460],192],
];
async function main(){
 await fs.mkdir(out,{recursive:true});
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const sample=await fs.readFile(path.join(root,'godot-arcana/art/export/reference/oak.png.import'),'utf8');
 const sheets={};
 const manifest={pixelsPerUnit:64,camera:{yaw:0,pitch:45},palette:'arcana-palette-lut.png',alpha:[0,255],assets:{}};
 async function save(name,pixels,w,h,spec){
  const colors=new Set();
  for(let i=0;i<pixels.length;i+=4){
   if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}
   const r=Math.round(pixels[i]*31/255),g=Math.round(pixels[i+1]*31/255),b=Math.round(pixels[i+2]*31/255);
   const index=(g*1024+b*32+r)*3;
   pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;
   colors.add(pixels.subarray(i,i+3).toString('hex'));
  }
  await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(out,name+'.png'));
  const filename='res://art/export/inn-lobby/'+name+'.png';
  const imported='res://.godot/imported/inn-lobby-'+name+'.png.ctex';
  try{await fs.access(path.join(out,name+'.png.import'));}catch{
   await fs.writeFile(path.join(out,name+'.png.import'),sample.replace(/^uid=.*\r?\n/m,'').replace(/path="res:\/\/\.godot\/imported\/[^\"]+"/,'path="'+imported+'"').replace(/source_file="[^\"]+"/,'source_file="'+filename+'"').replace(/dest_files=\[[^\]]+\]/,'dest_files=["'+imported+'"]'));
  }
  manifest.assets[name]={file:filename,size:[w,h],foot:[w/2,h-4],colors:colors.size,...spec};
 }
 for(const [name,file,rect,width] of specs){
  if(!sheets[file])sheets[file]=await sharp(path.join(sourceDir,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {data,info}=sheets[file];
  let left=rect[0]+rect[2],right=-1,top=rect[1]+rect[3],bottom=-1;
  for(let y=rect[1];y<rect[1]+rect[3];y++)for(let x=rect[0];x<rect[0]+rect[2];x++){
   if(data[(y*info.width+x)*4+3]<232)continue;
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left)throw Error('Empty source '+name);
  const height=Math.round((bottom-top+1)*width/(right-left+1));
  const pixels=await sharp(data,{raw:info}).extract({left,top,width:right-left+1,height:bottom-top+1}).resize(width,height,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).raw().toBuffer();
  await save(name,pixels,width+8,height+8,{source:file,crop:[left,top,right-left+1,bottom-top+1],role:name.endsWith('rug')?'ground':'sprite'});
 }
 // A continuous cutaway wall per side, native pixel density with two end posts.
 // Repeating the painted inner panels avoids overlaps and extra pillar silhouettes.
 const wall=await sharp(path.join(out,'wall.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const strip=Buffer.alloc(480*52*4);
 for(let y=0;y<52;y++)for(let x=0;x<480;x++){
  const sx=x<24?8+x:x>=456?244+x-456:32+(x-24)%212;
  const si=((164+y)*wall.info.width+sx)*4;
  strip.set(wall.data.subarray(si,si+4),(y*480+x)*4);
 }
 // Continuous cap and base plinth close the original panel's transparent gap.
 // Four transparent padding rows below the registered foot remain outside the wall.
 const cap=[[74,62,65],[180,138,82],[141,102,69],[111,80,58]];
 const base=[[136,102,68],[101,75,56],[101,75,56],[60,52,53]];
 for(let x=0;x<480;x++)for(let row=0;row<4;row++){
  strip.set([...cap[row],255],(row*480+x)*4);
  strip.set([...base[row],255],((44+row)*480+x)*4);
 }
 await save('front-wall',strip,480,52,{source:'wall.png lower wainscot',role:'sprite',foot:[240,48],worldWidth:7.5});
 // A clean interior crop discards the sheet's outer transparent framing.
 const floor=await sharp(path.join(sourceDir,'architecture-sheet-v1.png')).extract({left:925,top:566,width:426,height:426}).resize(128,128,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();
 for(let i=3;i<floor.length;i+=4)floor[i]=255;
 await save('oak-floor',floor,128,128,{source:'architecture-sheet-v1.png',crop:[925,566,426,426],role:'tile',tileWorldSize:[2,2]});
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(root,'art-studies/inn-lobby/asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await require('./build-inn-lighting.cjs')();
 const preview=await sharp({create:{width:900,height:Math.ceil(Object.keys(manifest.assets).length/3)*160,channels:4,background:'#b6aaa6'}}).png().toBuffer();
 const layers=[];
 for(const [i,name]of Object.keys(manifest.assets).entries()){
  const s=manifest.assets[name];
  const scale=Math.min(1,280/s.size[0],150/s.size[1]);
  layers.push({input:await sharp(path.join(out,name+'.png')).resize(Math.round(s.size[0]*scale),Math.round(s.size[1]*scale),{kernel:'nearest'}).png().toBuffer(),left:(i%3)*300+10,top:Math.floor(i/3)*160+5});
 }
 await sharp(preview).composite(layers).png().toFile(path.join(root,'art-studies/inn-lobby/assets-preview.png'));
 console.log(JSON.stringify(manifest));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
