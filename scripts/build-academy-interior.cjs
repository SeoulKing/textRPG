const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname,'..');
const dir = path.join(root,'art-studies/academy-interior');
const out = path.join(root,'godot-arcana/art/export/academy-interior');
// Measured source regions; sheets are deliberately not treated as uniform cells.
const specs = [
 ['wall','architecture.png',[25,55,445,490],288],
 ['stairs-up','architecture.png',[520,0,490,553],288],
 ['bookcase','bookcase-clean.png',[0,0,1227,1281],192],
 ['front-wall','architecture.png',[0,620,500,335],192],
 ['office-door','architecture.png',[530,555,475,460],200],
 ['stairs-down','stairs-down.png',[0,0,1374,1145],240],
 ['orrery','furniture.png',[15,0,490,540],192],
 ['desk','furniture.png',[555,85,420,405],152],
 ['blackboard','furniture.png',[1010,30,525,475],240],
 ['bench','furniture.png',[0,610,600,400],200],
 ['plant','furniture.png',[650,485,310,530],96],
 ['telescope','furniture.png',[1040,500,465,520],168],
 ['reading-table','reading-details.png',[0,0,900,724],176],
 ['book-trolley','reading-details.png',[900,0,660,724],100],
 ['floor-lamp','reading-details.png',[1600,0,572,724],50],
 ['partition-horizontal','room-partitions.png',[60,115,850,290],192],
 ['partition-depth','room-partitions.png',[1080,15,150,435],20],
 ['room-arch','room-partitions.png',[175,425,630,570],240],
 ['partition-pier','room-partitions.png',[1070,605,170,380],28],
];
async function main(){
 await fs.mkdir(out,{recursive:true});
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const sample=await fs.readFile(path.join(root,'godot-arcana/art/export/reference/oak.png.import'),'utf8');
 const manifest={pixelsPerUnit:64,camera:{yaw:0,pitch:45},alpha:[0,255],assets:{}};
 async function save(id,data,w,h,extra={}){
  for(let i=0;i<data.length;i+=4){
   if(data[i+3]<192){data.fill(0,i,i+4);continue;}
   const r=Math.round(data[i]*31/255),g=Math.round(data[i+1]*31/255),b=Math.round(data[i+2]*31/255),j=(g*1024+b*32+r)*3;
   data.set(lut.subarray(j,j+3),i);data[i+3]=255;
  }
  await sharp(data,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(out,id+'.png'));
  const file='res://art/export/academy-interior/'+id+'.png';
  const imported='res://.godot/imported/academy-interior-'+id+'.png.ctex';
  const importFile=path.join(out,id+'.png.import');
  try {await fs.access(importFile);}catch{
   await fs.writeFile(importFile,sample.replace(/^uid=.*\r?\n/m,'').replace(/path="res:\/\/\.godot\/imported\/[^\"]+"/,'path="'+imported+'"').replace(/source_file="[^\"]+"/,'source_file="'+file+'"').replace(/dest_files=\[[^\]]+\]/,'dest_files=["'+imported+'"]'));
  }
  manifest.assets[id]={file,size:[w,h],foot:[w/2,h-4],...extra};
 }
 for(const [id,file,rect,width] of specs){
  const sheet=await sharp(path.join(dir,'source',file)).extract({left:rect[0],top:rect[1],width:rect[2],height:rect[3]}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=rect[2],top=rect[3],right=-1,bottom=-1;
  for(let y=0;y<rect[3];y++)for(let x=0;x<rect[2];x++)if(sheet.data[(y*rect[2]+x)*4+3]>=192){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(right<left)throw Error('Empty asset '+id);
  const height=id==='bookcase'?204:Math.round((bottom-top+1)*width/(right-left+1));
  const data=await sharp(sheet.data,{raw:sheet.info}).extract({left,top,width:right-left+1,height:bottom-top+1}).resize(width,height,{fit:'contain',position:'bottom',background:'#00000000',kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).raw().toBuffer();
  await save(id,data,width+8,height+8,{source:file,crop:[rect[0]+left,rect[1]+top,right-left+1,bottom-top+1],role:'sprite'});
 }
 // Each painted floor covers the whole room exactly once at64px/world unit.
 for(const [id,file] of [['floor-first-painted','floor-first-painted.png'],['floor-second-painted','floor-second-painted.png']]){
  const pixels=await sharp(path.join(dir,'source',file)).resize(1152,960,{fit:'cover',kernel:'nearest'}).ensureAlpha().raw().toBuffer();
  await save(id,pixels,1152,960,{role:'room-ground',source:file,worldSize:[18,15],repeats:[1,1],groundBounds:[3,4,21,19]});
 }
 // Native ground tiles, not a flattened crop of the concept illustration.
 let w=256,h=256,data=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const offset=(Math.floor(y/64)%2)*64,edge=y%64<2||(x+offset)%128<2;
  const colors=edge?[177,156,119]:((Math.floor((x+offset)/128)+Math.floor(y/64))%2?[229,215,182]:[235,222,193]);
  const i=(y*w+x)*4;data.set([...colors,255],i);
 }
 await save('stone-floor',data,w,h,{role:'tile'});
 data=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const edge=Math.min(x,y,w-1-x,h-1-y);
  let c=[47,64,126];
  if(edge<4||(edge>10&&edge<13))c=[205,165,72];
  const sx=Math.abs(x-127.5),sy=Math.abs(y-127.5);
  if((sx<2&&sy<54)||(sy<2&&sx<54)||(Math.abs(sx-sy)<1.5&&sx<24))c=[218,180,85];
  data.set([...c,255],(y*w+x)*4);
 }
 await save('study-rug',data,w,h,{role:'ground'});
 // Blue/gold star medallion drawn at ground resolution for a true X/Z plane.
 data=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=x-127.5,dy=y-127.5,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
  if(r>125)continue;
  let c=[41,70,139];
  if(r>119||Math.abs(r-108)<1.5||Math.abs(r-44)<1)c=[205,165,72];
  const angle=Math.abs(((a+Math.PI*4)%(Math.PI/4))-Math.PI/8);
  const ray=24+65*Math.pow(Math.max(0,1-angle/(Math.PI/8)),4);
  if(r<ray)c=[221,185,93];
  data.set([...c,255],(y*w+x)*4);
 }
 await save('medallion',data,w,h,{role:'ground'});
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(dir,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const layers=[];
 for(const [i,id] of Object.keys(manifest.assets).entries()){
  layers.push({input:await sharp(path.join(out,id+'.png')).resize({width:240,height:250,fit:'inside',kernel:'nearest'}).png().toBuffer(),left:(i%4)*260+10,top:Math.floor(i/4)*270+10});
 }
 await sharp({create:{width:1040,height:Math.ceil(layers.length/4)*270,channels:4,background:'#49546a'}}).composite(layers).png().toFile(path.join(dir,'assets-preview.png'));
 console.log('Built '+Object.keys(manifest.assets).length+' independent academy assets.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
