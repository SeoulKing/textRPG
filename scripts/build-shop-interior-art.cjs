const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname,'..');
const sourceDir=path.join(root,'art-studies/regions/arcana-shop-interior/source');
const out=path.join(root,'godot-arcana/art/export/shop-interior');
const items=path.join(root,'godot-arcana/art/export/items');
const specs=[
 ['potion-arch',[80,0,400,540],128],
 ['herb-cabinet',[590,0,390,540],128],
 ['travel-cabinet',[1080,0,420,540],144],
 ['counter',[0,550,605,430],288],
 ['potion-island',[610,550,445,430],96],
 ['travel-island',[1070,550,455,430],96],
];
async function bounded(file,rect){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const [rx,ry,rw,rh]=rect??[0,0,info.width,info.height];
 let l=rx+rw,r=-1,t=ry+rh,b=-1;
 for(let y=ry;y<ry+rh;y++)for(let x=rx;x<rx+rw;x++){
  if(data[(y*info.width+x)*4+3]<192)continue;
  l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
 }
 if(r<l)throw Error('Empty art '+file);
 return {image:sharp(data,{raw:info}).extract({left:l,top:t,width:r-l+1,height:b-t+1}),crop:[l,t,r-l+1,b-t+1]};
}
async function main(){
 await fs.mkdir(out,{recursive:true});await fs.mkdir(items,{recursive:true});
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const manifest={pixelsPerUnit:64,camera:{yaw:0,pitch:45},palette:'arcana-palette-lut.png',alpha:[0,255],assets:{}};
 async function save(name,buffer,w,h,foot,source,crop,dest=out){
  const pixels=await sharp(buffer).ensureAlpha().raw().toBuffer();
  for(let i=0;i<pixels.length;i+=4){
   if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}
   const r=Math.round(pixels[i]*31/255),g=Math.round(pixels[i+1]*31/255),b=Math.round(pixels[i+2]*31/255),index=(g*1024+b*32+r)*3;
   pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;
  }
  await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(dest,name+'.png'));
  if(dest===out)manifest.assets[name]={file:'res://art/export/shop-interior/'+name+'.png',size:[w,h],foot,source,crop,worldWidth:w/64,sourcePixelsPerUnit:64};
 }
 for(const [name,rect,width] of specs){
  const {image,crop}=await bounded(path.join(sourceDir,name==='counter'?'counter-master.png':'furniture-master.png'),name==='counter'?null:rect);
  const h=Math.round(crop[3]*width/crop[2]);
  const buffer=await image.resize(width,h,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).png().toBuffer();
  await save(name,buffer,width+8,h+8,[(width+8)/2,h+4],name==='counter'?'counter-master.png':'furniture-master.png',crop);
 }
 const merchant=await bounded(path.join(sourceDir,'merchant-master.png'));
 const mh=99,mw=Math.round(merchant.crop[2]*mh/merchant.crop[3]);
 const mb=await merchant.image.resize(mw,mh,{kernel:'nearest'}).png().toBuffer();
 const mc=await sharp({create:{width:96,height:136,channels:4,background:'#00000000'}}).composite([{input:mb,left:Math.floor((96-mw)/2),top:17}]).png().toBuffer();
 await save('merchant',mc,96,136,[48,116],'merchant-master.png',merchant.crop);
 const icon=await bounded(path.join(sourceDir,'mana-potion-master.png'));
 const ih=48,iw=Math.min(48,Math.round(icon.crop[2]*ih/icon.crop[3]));
 const ib=await icon.image.resize(iw,ih,{kernel:'nearest'}).png().toBuffer();
 const ic=await sharp({create:{width:64,height:64,channels:4,background:'#00000000'}}).composite([{input:ib,left:Math.floor((64-iw)/2),top:8}]).png().toBuffer();
 await save('mana-potion',ic,64,64,[32,56],'mana-potion-master.png',icon.crop,items);
 manifest.itemIcon={file:'res://art/export/items/mana-potion.png',size:[64,64],margin:8,purpose:'UI thumbnail, not a world-scale object',source:'mana-potion-master.png',crop:icon.crop};
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(root,'art-studies/regions/arcana-shop-interior/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 // Show production pixels at integer magnification, never resample the concept as a map.
 const layers=[];
 for(const [i,name]of Object.keys(manifest.assets).entries()){
  const thumb=await sharp(path.join(out,name+'.png')).resize({width:280,height:310,fit:'inside',kernel:'nearest',withoutEnlargement:true}).png().toBuffer();
  layers.push({input:thumb,left:(i%3)*320+20,top:Math.floor(i/3)*340+15});
 }
 await sharp({create:{width:960,height:1020,channels:4,background:'#34414b'}}).composite(layers).png().toFile(path.join(root,'art-studies/regions/arcana-shop-interior/assets-preview.png'));
 await sharp(path.join(items,'mana-potion.png')).resize(384,384,{kernel:'nearest'}).png().toFile(path.join(root,'art-studies/regions/arcana-shop-interior/mana-potion-preview.png'));
 const reference=await sharp(path.join(root,'godot-arcana/art/source/plaza-guide/approved-standard-proportions-4x.png')).png().toBuffer();
 const actor=await sharp(path.join(out,'merchant.png')).resize(384,544,{kernel:'nearest'}).png().toBuffer();
 await sharp({create:{width:1152,height:544,channels:4,background:'#34414b'}}).composite([{input:reference,left:0,top:0},{input:actor,left:768,top:0}]).png().toFile(path.join(root,'art-studies/regions/arcana-shop-interior/merchant-proportions-4x.png'));
 console.log(JSON.stringify({assets:Object.fromEntries(Object.entries(manifest.assets).map(([n,a])=>[n,{pixels:a.size,foot:a.foot,width:a.worldWidth}])),icon:manifest.itemIcon.size}));
}
main().catch(e=>{console.error(e);process.exit(1)});
