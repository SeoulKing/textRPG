/* Outdoor art source preparation. PixelPen owns all edited masters and PNG exports. */
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),BASE='art-studies/outdoor-unified-v1',OUT='godot-arcana/art/export/outdoor-unified-v1';
const read=async p=>JSON.parse(await fs.readFile(path.join(ROOT,p),'utf8'));
const ref='godot-arcana/art/export/reference/';
async function bounds(file,region){let im=sharp(path.join(ROOT,file)).ensureAlpha();if(region)im=im.extract(region);const {data,info}=await im.raw().toBuffer({resolveWithObject:true});let l=info.width,t=info.height,r=-1,b=-1;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=160){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}if(r<l)throw Error('Empty '+file);return {data,info,rect:{left:l,top:t,width:r-l+1,height:b-t+1}};}
async function inventory(){
 const scene=await fs.readFile(path.join(ROOT,'godot-arcana/scenes/plaza.tscn'),'utf8'),placed={};
 for(const block of scene.split(/(?=\[node )/)){const kind=block.match(/model_kind = "([^"]+)"/)?.[1];if(!kind)continue;const values=(block.match(/transform = Transform3D\(([^)]+)\)/)?.[1]??'1,0,0,0,1,0,0,0,1,0,0,0').split(',').map(Number);const scale=[Math.hypot(...values.slice(0,3)),Math.hypot(...values.slice(3,6))];(placed[kind]??=[]).push(scale);}
 const props=(await read('art-studies/arcana-reference-v1/manifest.json')).props,city=(await read('art-studies/regions/arcana-city-center/manifest.json')).assets,buildings=(await read('art-studies/town-buildings/manifest.json')).assets;
 const specs=[];
 for(const [id,p]of Object.entries(props)){
  const kind=id==='planter'?'flowerbed':id;let source,region;
  if(typeof p.source==='object'){source='art-studies/arcana-reference-v1/source/props.png';region=p.source;}
  else{source=p.source.startsWith('art-')?p.source:'art-studies/arcana-reference-v1/'+p.source;region=p.region;}
  if(id==='bench'||id==='crate'){const m=await sharp(path.join(ROOT,source)).metadata(),split=Math.floor(m.width*.65);region={left:id==='bench'?0:split,top:0,width:id==='bench'?split:m.width-split,height:m.height};}
  specs.push({id,kind,original:ref+id+'.png',foot:p.foot,source,region});
 }
 for(const [id,p]of Object.entries(buildings))specs.push({id,kind:id,original:ref+id+'-2d.png',foot:p.foot,source:'art-studies/town-buildings/'+p.source});
 for(const [id,p]of Object.entries(city))specs.push({id,kind:id,original:p.runtime.replace('res://','godot-arcana/'),foot:p.foot,source:'art-studies/regions/arcana-city-center/source/city-kit.png',region:{left:p.crop[0],top:p.crop[1],width:p.crop[2],height:p.crop[3]}});
 specs.push({id:'academy',kind:'academy-2d',original:ref+'academy-2d.png',foot:[640,1088],source:ref+'academy-2d.png',registeredCanvas:true});
 const lamp=await read('art-studies/street-lamp/manifest.json');specs.push({id:'lamp-post',kind:'lamp-post',original:ref+'lamp-post-2d.png',foot:lamp.foot,source:'art-studies/street-lamp/'+lamp.source,referenceLocked:true});
 for(const s of specs){const m=await sharp(path.join(ROOT,s.original)).metadata();s.size=[m.width,m.height];s.placements=placed[s.kind]??[];s.maxScale=Math.max(1,...s.placements.flat());s.sourceScale=s.maxScale;s.editable='godot-arcana/art/source/outdoor-unified-v1/'+s.id+'.pxpen';s.export=OUT+'/'+s.id+'.png';if(['oak','birch','spruce'].includes(s.id)){s.source=BASE+'/generated/'+s.id+'.png';s.region=null;s.generated=true;}s.effectiveDensityBefore=[...new Set(s.placements.map(a=>(64/a[0]).toFixed(2)))];}
 return specs;
}
async function prepare(){
 const specs=await inventory();for(const dir of [BASE+'/before',BASE+'/prepared',BASE+'/generated','godot-arcana/art/source/outdoor-unified-v1',OUT])await fs.mkdir(path.join(ROOT,dir),{recursive:true});
 const lut=await sharp(path.join(ROOT,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const rgb=c=>{const j=(Math.round(c[1]*31/255)*1024+Math.round(c[2]*31/255)*32+Math.round(c[0]*31/255))*3;return lut.subarray(j,j+3);};
 const jobs=[];
 for(const s of specs){
  const backup=path.join(ROOT,BASE,'before',s.id+'.png');try{await fs.access(backup);}catch{await fs.copyFile(path.join(ROOT,s.original),backup);}
  const W=Math.round(s.size[0]*s.sourceScale),H=Math.round(s.size[1]*s.sourceScale);let candidate;
  if(s.registeredCanvas)candidate=await sharp(path.join(ROOT,s.source)).ensureAlpha().resize(W,H,{kernel:'nearest'}).raw().toBuffer();
  else{const src=await bounds(s.source,s.region),old=await bounds(s.original);const x=Math.round(old.rect.left*s.sourceScale),y=Math.round(old.rect.top*s.sourceScale),w=Math.min(W-x,Math.round(old.rect.width*s.sourceScale)),h=Math.min(H-y,Math.round(old.rect.height*s.sourceScale));const cropped=await sharp(src.data,{raw:src.info}).extract(src.rect).resize(w,h,{fit:'fill',kernel:'nearest'}).png().toBuffer();candidate=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:cropped,left:x,top:y}]).raw().toBuffer();}
  for(let i=0;i<candidate.length;i+=4){if(candidate[i+3]<160){candidate.fill(0,i,i+4);continue;}candidate.set(rgb(candidate.subarray(i,i+3)),i);candidate[i+3]=255;}
  const edits=[];const at=(x,y)=>(y*W+x)*4;
  if(!s.referenceLocked)for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
   const i=at(x,y);if(!candidate[i+3])continue;const votes=new Map();let opaque=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const j=at(x+dx,y+dy);if(candidate[j+3]){opaque++;const key=candidate.subarray(j,j+3).toString('hex');votes.set(key,(votes.get(key)||0)+1);}}
   if(opaque!==8)continue;const old=candidate.subarray(i,i+3).toString('hex');if(votes.has(old))continue;const best=[...votes].sort((a,b)=>b[1]-a[1])[0];if(best[1]<5)continue;const c=Buffer.from(best[0],'hex');const distance=Math.hypot(candidate[i]-c[0],candidate[i+1]-c[1],candidate[i+2]-c[2]);if(distance>15&&distance<75)edits.push({x,y,expected:old,color:best[0]});
  }
  // Explicitly preserve silhouette pixels, leaf gaps and high-contrast highlights.
  const prepared=BASE+'/prepared/'+s.id+'.png';await sharp(candidate,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(ROOT,prepared));
  jobs.push({id:s.id,input:ROOT.replaceAll('\\','/')+'/'+prepared,source:'res://'+s.editable.replace('godot-arcana/',''),output:'res://'+s.export.replace('godot-arcana/',''),size:[W,H],edits,referenceLocked:!!s.referenceLocked});
 }
 const manifest={profile:'arcana-outdoors-v1',camera:{yaw:0,pitch:45,projection:'orthographic'},pixelsPerUnit:64,detailReferences:['art-studies/street-lamp/source/lamp-post.png','art-studies/fountain/source/fountain.png'],placementSource:'godot-arcana/scenes/plaza.tscn',preserved:['source rasters','scene transforms','collision','gameplay IDs','fountain animation','indoor art','heroine'],assets:specs,status:'prepared-for-native-pixelpen'};
 await fs.writeFile(path.join(ROOT,BASE,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(ROOT,BASE,'pixelpen-plan.json'),JSON.stringify({jobs},null,2)+'\n');
 console.log(JSON.stringify({assets:specs.length,pixels:jobs.reduce((n,j)=>n+j.size[0]*j.size[1],0),nativeEdits:jobs.reduce((n,j)=>n+j.edits.length,0),placements:specs.reduce((n,s)=>n+s.placements.length,0)}));
}
async function pack() {
 const manifest = await read(BASE+'/manifest.json');
 const entries = [];
 const template = await fs.readFile(path.join(ROOT,'godot-arcana/art/export/reference/oak.png.import'),'utf8');
 for (const asset of manifest.assets) {
  const output = path.join(ROOT,asset.export);
  const metadata = await sharp(output).metadata();
  if (metadata.width !== Math.round(asset.size[0]*asset.sourceScale) || metadata.height !== Math.round(asset.size[1]*asset.sourceScale)) {
   throw Error('Export dimensions changed: '+asset.id);
  }
  const original = 'res://'+asset.original.replace('godot-arcana/','');
  const resource = 'res://'+asset.export.replace('godot-arcana/','');
  entries.push(' '+JSON.stringify(original)+': preload('+JSON.stringify(resource)+'),');
  asset.exportSha256 = crypto.createHash('sha256').update(await fs.readFile(output)).digest('hex');
  const digest = crypto.createHash('md5').update(resource).digest('hex');
  const imported = 'res://.godot/imported/'+asset.id+'.png-'+digest+'.ctex';
  const settings = template
   .replace(/^uid=.*\r?\n/m,'')
   .replace(/path="res:\/\/\.godot\/imported\/[^"]+"/,'path="'+imported+'"')
   .replace(/source_file="[^"]+"/,'source_file="'+resource+'"')
   .replace(/dest_files=\[[^\]]+\]/,'dest_files=["'+imported+'"]')
   .replace(/detect_3d\/compress_to=\d+/,'detect_3d/compress_to=0')
   .replace(/mipmaps\/generate=true/,'mipmaps/generate=false')
   .replace(/compress\/mode=\d+/,'compress/mode=0');
  await fs.writeFile(output+'.import',settings);
 }
 const registry = ['@tool','extends RefCounted','# Native PixelPen masters; logical geometry and saved placement remain unchanged.','const ITEMS = {',...entries,'}',''].join('\n');
 await fs.writeFile(path.join(ROOT,'godot-arcana/art/resources/outdoor_art.gd'),registry);
 manifest.status = 'native-pixelpen-exported';
 await fs.writeFile(path.join(ROOT,BASE,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Registered '+manifest.assets.length+' native PixelPen outdoor textures.');
}
(async()=>{if(process.argv.includes('--prepare'))await prepare();else if(process.argv.includes('--package'))await pack();else throw Error('Use --prepare (does not overwrite existing PixelPen masters) or --package');})().catch(e=>{console.error(e);process.exitCode=1});
