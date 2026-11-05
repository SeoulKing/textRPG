const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),src=path.join(root,'art-studies/interiors/solid-walls-v1');
async function main(){
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 for(const [area,id,oldId,master] of [['inn-lobby','wall-solid','wall','inn-master.png'],['shop-interior','back-wall-solid','back-wall-v4','shop-master.png']]){
  const dir=path.join(root,'godot-arcana/art/export',area),manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8')),old=manifest.assets[oldId];
  const raw=await sharp(path.join(src,master)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let l=raw.info.width,t=raw.info.height,r=-1,b=-1;
  for(let y=0;y<raw.info.height;y++)for(let x=0;x<raw.info.width;x++)if(raw.data[(y*raw.info.width+x)*4+3]>=192){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
  const [cw,ch]=old.size,scale=Math.min((cw-8)/(r-l+1),(ch-8)/(b-t+1)),w=Math.round((r-l+1)*scale),h=Math.round((b-t+1)*scale);
  const part=await sharp(raw.data,{raw:raw.info}).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(w,h,{kernel:'nearest'}).png().toBuffer();
  const pixels=await sharp({create:{width:cw,height:ch,channels:4,background:'#00000000'}}).composite([{input:part,left:Math.floor((cw-w)/2),top:ch-4-h}]).raw().toBuffer();
  for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}const j=(Math.round(pixels[i+1]*31/255)*1024+Math.round(pixels[i+2]*31/255)*32+Math.round(pixels[i]*31/255))*3;pixels.set(lut.subarray(j,j+3),i);pixels[i+3]=255;}
  await sharp(pixels,{raw:{width:cw,height:ch,channels:4}}).png().toFile(path.join(dir,id+'.png'));
  const spec={...old,file:'res://art/export/'+area+'/'+id+'.png',source:'art-studies/interiors/solid-walls-v1/'+master,crop:[l,t,r-l+1,b-t+1],windowless:true};
  delete spec.spatialMap;delete spec.light;
  manifest.assets[id]=spec;if(area==='shop-interior')manifest.room.backWall=id;
  await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  if(area==='shop-interior')await fs.writeFile(path.join(root,'art-studies/regions/arcana-shop-interior/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 }
 const p=path.join(root,'godot-arcana/art/export/online-layout.json'),layout=JSON.parse(await fs.readFile(p,'utf8'));
 const rect=layout.arcana_inn.rectangles.find(r=>r.x===139&&r.w===23&&r.h===25);
 if(!rect)throw Error('Inn bookshelf collision changed');rect.y=55;
 await fs.writeFile(p,JSON.stringify(layout,null,2)+'\n');
 console.log('Solid walls packed; inn bookshelf collision aligned.');
}
main().catch(e=>{console.error(e);process.exit(1)});
