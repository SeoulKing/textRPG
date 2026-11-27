const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const src=path.join(root,'art-studies/regions/arcana-shop-interior/source/compact-v2');
const out=path.join(root,'godot-arcana/art/export/shop-interior');
async function main(){
 const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 async function clean(image){
  const {data,info}=await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){
   if(data[i+3]<192){data.fill(0,i,i+4);continue;}
   const index=(Math.round(data[i+1]*31/255)*1024+Math.round(data[i+2]*31/255)*32+Math.round(data[i]*31/255))*3;
   data.set(lut.subarray(index,index+3),i);data[i+3]=255;
  }
  return {data,info};
 }
 async function save(id,image,foot,source,crop,extra={}){
  const {data,info}=await clean(image);
  await sharp(data,{raw:info}).png().toFile(path.join(out,id+'.png'));
  manifest.assets[id]={file:'res://art/export/shop-interior/'+id+'.png',size:[info.width,info.height],foot,source:'compact-v2/'+source,crop,sourcePixelsPerUnit:64,...extra};
  return {data,info};
 }
 async function bounded(file,rect){
  const {data,info}=await sharp(path.join(src,file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const [rx,ry,rw,rh]=rect??[0,0,info.width,info.height];
  let l=rx+rw,r=-1,t=ry+rh,b=-1;
  for(let y=ry;y<Math.min(ry+rh,info.height);y++)for(let x=rx;x<Math.min(rx+rw,info.width);x++){
   if(data[(y*info.width+x)*4+3]<192)continue;
   l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
  }
  if(r<l)throw Error('No opaque pixels: '+file);
  return {crop:[l,t,r-l+1,b-t+1],image:sharp(data,{raw:info}).extract({left:l,top:t,width:r-l+1,height:b-t+1})};
 }
 const floorMeta=await sharp(path.join(src,'floor-master.png')).metadata();
 await save('floor-room-v2',sharp(path.join(src,'floor-master.png')).resize(896,576,{kernel:'nearest'}),[448,576],'floor-master.png',[0,0,floorMeta.width,floorMeta.height],{role:'unique-room-ground',worldRect:[5,4,14,9],repeat:false,pixelsPerWorldAxisUnit:[64,64]});
 const wall=await bounded('back-wall-master.png');
 const wh=Math.round(wall.crop[3]*896/wall.crop[2]);
 const wb=await wall.image.resize(896,wh,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).png().toBuffer();
 const wallPixels=await save('back-wall-v2',sharp(wb),[452,wh+4],'back-wall-master.png',wall.crop,{role:'unique-back-wall',visibleWidth:14});
 await fs.copyFile(path.join(out,'back-wall-v2.png'),path.join(src,'back-wall-v2.png'));
 for(const [id,left]of [['front-wall-left-v2',4],['front-wall-right-v2',548]]){
  await save(id,sharp(wallPixels.data,{raw:wallPixels.info}).extract({left,top:wh-44,width:352,height:48}),[176,44],'back-wall-v2.png',[left,wh-44,352,48],{role:'low-front-cutaway',visibleWidth:5.5});
 }
 for(const spec of [
  ['apothecary-bench-v2',[0,0,850,420],192,null],
  ['travel-stock-v2',[900,0,636,430],128,null],
  ['side-wall-left-v2',[320,420,150,580],null,448],
  ['side-wall-right-v2',[1100,420,120,580],null,448],
 ]){
  const [id,rect,targetW,targetH]=spec;
  const part=await bounded('props-master.png',rect);
  const w=targetW??Math.round(part.crop[2]*targetH/part.crop[3]);
  const h=targetH??Math.round(part.crop[3]*targetW/part.crop[2]);
  const buffer=await part.image.resize(w,h,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).png().toBuffer();
  await save(id,sharp(buffer),[(w+8)/2,h+4],'props-master.png',part.crop,{role:id.startsWith('side-wall')?'low-side-cutaway':'sprite'});
 }
 manifest.room={version:2,bounds:[5,4,14,9],floorPixels:[896,576],pixelsPerUnit:64,tileMap:false,groundRepeat:false,design:'continuous floor and wall paintings; independent furniture, merchant, and cutaway frame'};
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(root,'art-studies/regions/arcana-shop-interior/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest.assets).filter(([id])=>id.endsWith('v2')).map(([id,a])=>[id,{size:a.size,foot:a.foot}]))));
}
main().catch(error=>{console.error(error);process.exit(1)});
