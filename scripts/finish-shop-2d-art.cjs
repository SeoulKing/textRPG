const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const R=path.resolve(__dirname,'..'),B='art-studies/regions/arcana-shop-interior/source/native-2d';
const rgb=c=>c.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('');
(async()=>{
 const defs=JSON.parse(await fs.readFile(path.join(R,B,'assets.json'),'utf8')),slots=JSON.parse(await fs.readFile(path.join(R,B,'furniture-slots.json'),'utf8'));
 const art=await sharp(path.join(R,B,'furniture-paint.png')).resize(960,480,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();
 for(const slot of slots.slots){
  const s=defs.assets[slot.id],W=s.size[0],HH=s.size[1],g=s.geometry,pad=8;
  const l=Math.max(0,slot.x-pad),t=Math.max(0,slot.y),r=Math.min(960,slot.x+W+pad),b=Math.min(480,slot.y+HH+pad),w=r-l,h=b-t;
  const raw=Buffer.alloc(w*h*4);for(let y=0;y<h;y++)art.copy(raw,y*w*4,((t+y)*960+l)*4,((t+y)*960+r)*4);
  const seen=new Uint8Array(w*h),queue=[];const dark=i=>raw[i*4]<65&&raw[i*4+1]<72&&raw[i*4+2]<90;
  for(let x=0;x<w;x++){queue.push(x,(h-1)*w+x);}for(let y=0;y<h;y++)queue.push(y*w,y*w+w-1);
  for(let n=0;n<queue.length;n++){const i=queue[n];if(seen[i]||!dark(i))continue;seen[i]=1;raw[i*4+3]=0;const x=i%w,y=Math.floor(i/w);if(x)queue.push(i-1);if(x<w-1)queue.push(i+1);if(y)queue.push(i-w);if(y<h-1)queue.push(i+w);}
  let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(raw[(y*w+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x1<x0)throw Error('No art found: '+slot.id);
  const source=await sharp(raw,{raw:{width:w,height:h,channels:4}}).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}).png().toBuffer();
  const m=await sharp(source).metadata(),cab=slot.id.includes('cabinet');
  const split=Math.round(m.height*(cab?.23:(slot.id==='travel-stock'||slot.id==='luggage')?.28:.48));
  const face=await sharp(source).extract({left:0,top:split,width:m.width,height:m.height-split}).resize(W,g.frontHeightPixels,{fit:'cover',kernel:'nearest'}).png().toBuffer();
  const roof=await sharp(source).extract({left:0,top:0,width:m.width,height:Math.max(1,split)}).resize({width:W,kernel:'nearest'}).png().toBuffer();
  const roofMeta=await sharp(roof).metadata();
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+HH+'" shape-rendering="crispEdges"><rect y="'+g.roofBackY+'" width="'+W+'" height="'+g.roofDepthPixels+'" fill="#ead6ad"/><path d="M0 '+g.roofBackY+'H'+W+'M0 '+(g.roofFrontY-1)+'H'+W+'" stroke="#f0d395"/><rect y="'+g.roofFrontY+'" width="'+W+'" height="'+g.frontHeightPixels+'" fill="#303957"/></svg>';
  const overlays=[{input:face,left:0,top:g.roofFrontY}];
  if(!cab)overlays.push({input:roof,left:0,top:Math.max(0,g.roofFrontY-roofMeta.height)});
  let buf=await sharp(Buffer.from(svg)).composite(overlays).ensureAlpha().raw().toBuffer();
  // Restore exact architectural boundaries after material placement. No anisotropic sprite scaling.
  const paint=(x,y,c)=>{if(x<0||x>=W||y<0||y>=HH)return;const i=(y*W+x)*4;buf.set([...c,255],i);};
  for(let x=0;x<W;x++){paint(x,g.roofBackY,[255,240,201]);paint(x,g.roofFrontY-1,[196,155,80]);paint(x,g.baseline-1,[53,51,71]);}
  for(let y=g.roofBackY;y<g.baseline;y++){paint(0,y,[240,211,149]);paint(W-1,y,[180,154,119]);}
  await sharp(buf,{raw:{width:W,height:HH,channels:4}}).png().toFile(path.join(R,B,'prepared',slot.id+'.png'));
  s.materialSource=B+'/furniture-paint.png';s.geometry.materialMapping='uniform artwork crop to each front plane; exact registered roof/front borders rebuilt at native density';
 }
 const lut=await sharp(path.join(R,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer(),jobs=[];
 for(const[id,s]of Object.entries(defs.assets)){
  const input=path.join(R,B,'prepared',id+'.png'),raw=await sharp(input).ensureAlpha().raw().toBuffer();
  for(let i=0;i<raw.length;i+=4){
   if(raw[i+3]<128){raw.fill(0,i,i+4);continue;}
   const index=(Math.round(raw[i+1]*31/255)*1024+Math.round(raw[i+2]*31/255)*32+Math.round(raw[i]*31/255))*3;
   raw[i]=lut[index];raw[i+1]=lut[index+1];raw[i+2]=lut[index+2];raw[i+3]=255;
  }
  await sharp(raw,{raw:{width:s.size[0],height:s.size[1],channels:4}}).png().toFile(input+'.next.png');
  await fs.rename(input+'.next.png',input);
  s.editable='res://art/source/shop-2d-v3/'+id+'.pxpen';
  const edits=[];
  if(s.geometry){const g=s.geometry,color=rgb([...raw.subarray(g.roofBackY*s.size[0]*4,g.roofBackY*s.size[0]*4+3)]);for(const x of [1,s.size[0]-2]){const y=g.roofFrontY-1,i=(y*s.size[0]+x)*4;edits.push({x,y,expected:rgb([...raw.subarray(i,i+3)]),color});}}
  jobs.push({id,input:input.replaceAll('\\','/'),source:'res://art/source/shop-2d-v3/'+id+'.pxpen',output:s.file,size:s.size,edits});
 }
 await fs.mkdir(path.join(R,'godot-arcana/art/source/shop-2d-v3'),{recursive:true});
 await fs.writeFile(path.join(R,B,'pixelpen-plan.json'),JSON.stringify({jobs},null,2));
 defs.renderer='native-2d';defs.alpha=[0,255];defs.palette='res://art/export/arcana-palette-lut.png';defs.placementSource='res://scenes/shop_2d.tscn';
 await fs.writeFile(path.join(R,B,'assets.json'),JSON.stringify(defs,null,2));
 await fs.writeFile(path.join(R,'godot-arcana/art/export/shop-2d/assets.json'),JSON.stringify(defs,null,2));
 console.log('SHOP_2D finished furniture materials, native geometry edges and common LUT palette for '+jobs.length+' assets.');
})().catch(e=>{console.error(e);process.exitCode=1});
