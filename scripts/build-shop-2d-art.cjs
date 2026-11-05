const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const R=path.resolve(__dirname,'..'),B='art-studies/regions/arcana-shop-interior/source/native-2d',E='godot-arcana/art/export/shop-2d',M='godot-arcana/art/source/shop-2d';
const P=64,S=Math.SQRT1_2,H=y=>Math.round(y*P*S);
const C={ink:'#353347',ivory:'#ead6ad',light:'#fff0c9',shade:'#b49a77',gold:'#c49b50',goldHi:'#f0d395',navy:'#303957',oak:'#916742'};
const rect=(x,y,w,h,c)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+c+'"/>';
const defs={},jobs=[];
async function png(id,w,h,svg,def){
 const input=B+'/prepared/'+id+'.png',output=E+'/'+id+'.png',source=M+'/'+id+'.pxpen';
 const raw=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" shape-rendering="crispEdges">'+svg+'</svg>')).ensureAlpha().raw().toBuffer();
 for(let i=0;i<raw.length;i+=4){if(raw[i+3]<128)raw.fill(0,i,i+4);else raw[i+3]=255;}
 await sharp(raw,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(R,input));
 defs[id]={file:'res://art/export/shop-2d/'+id+'.png',size:[w,h],...def};
 jobs.push({id,input:path.join(R,input).replaceAll('\\','/'),source:'res://art/source/shop-2d/'+id+'.pxpen',output:'res://art/export/shop-2d/'+id+'.png',size:[w,h],edits:[]});
}
async function sourceData(file,region,size){let image=sharp(path.join(R,file));if(region)image=image.extract(region);if(size)image=image.resize(...size,{fit:'cover',kernel:'nearest'});return 'data:image/png;base64,'+(await image.png().toBuffer()).toString('base64');}
const image=(url,x,y,w,h)=>'<image href="'+url+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" image-rendering="pixelated"/>';
async function build(){
 for(const d of [B+'/prepared',E,M])await fs.mkdir(path.join(R,d),{recursive:true});
 const concept='art-studies/regions/arcana-shop-interior/source/tilemap-v3/concept-v3.png';
 const plaster=await sourceData(concept,{left:410,top:148,width:520,height:112},[128,128]);
 // The geometry is rasterized at final pixel density. Only material swatches are reused.
 for(let phase=0;phase<4;phase++){
  let a=rect(0,0,32,192,'#00000000'),top=11,base=169;
  a+=rect(0,0,32,base,C.ivory)+image(plaster,-phase*32,13,128,115);
  for(const[y,h,c]of [[0,2,C.light],[2,4,C.ivory],[6,1,C.shade],[7,3,C.goldHi],[10,2,C.gold],[12,2,C.light],[14,1,C.shade],[base-43,2,C.gold],[base-41,2,C.goldHi],[base-39,39,C.navy],[base-3,2,C.gold],[base-1,1,C.ink]])a+=rect(0,y,32,h,c);
  const ox=(phase%2)*32;
  a+=rect(5-ox,base-34,54,25,C.gold)+rect(6-ox,base-33,52,23,C.ink)+rect(8-ox,base-31,48,19,C.oak)+rect(8-ox,base-31,48,1,'#af8658');
  await png('wall-back-'+phase,32,192,a,{foot:[0,169],anchor:'minimum',footprint:[.5,.25],height:3.5,kind:'wall',collisions:[[0,0,.5,.25]],offset:[0,.25],layer:'HighWalls',phase});
 }
 for(const side of ['left','right'])for(const high of [false,true]){
  const id='wall-'+side+(high?'-return':''),h=high?192:32,foot=high?169:23,x=side==='right'?16:0;
  let a=rect(x,0,16,foot,C.ivory)+rect(x,0,2,foot,C.light)+rect(x+14,0,2,foot,C.gold);
  // The first return reaches the upper rear cornice. Adjacent low strips overlap only at shared cap pixels.
  await png(id,32,h,a,{foot:[0,foot],anchor:'minimum',footprint:[.5,.5],height:high?3.5:.5,kind:'wall',collisions:[[side==='right'?.25:0,0,.25,.5]],layer:'LowWalls',offset:high?[0,.25]:[0,0],side,return:high});
 }
 for(let phase=0;phase<2;phase++){
  let a=rect(0,0,32,11,C.ivory)+rect(0,0,32,1,C.light)+rect(0,9,32,2,C.gold)+rect(0,11,32,23,C.navy)+rect(0,13,32,1,C.oak);
  a+=rect(5-phase*32,15,54,14,C.gold)+rect(6-phase*32,16,52,12,C.navy)+rect(0,33,32,1,C.ink);
  await png('wall-front-'+phase,32,64,a,{foot:[0,34],anchor:'minimum',offset:[0,.5],footprint:[.5,.25],height:.5,kind:'wall',collisions:[[0,.25,.5,.25]],layer:'LowWalls'});
 }
 await png('doorway',128,32,rect(0,0,128,11,C.ivory)+rect(0,0,128,1,C.light)+rect(0,10,128,1,C.gold),{foot:[0,11],anchor:'minimum',offset:[0,.5],footprint:[2,.25],height:0,kind:'door',layer:'Decorations',collisions:[],arrivalOffset:[1,-.6875],exitOffset:[1,.3125]});
 // Eight deterministic plank phases, with no seams along the half-cell boundaries.
 let floor='';
 const shades=['#a37c52','#9c744d','#a27a51','#976f49'];
 for(let y=0;y<64;y++)for(let x=0;x<128;x++){
  const row=Math.floor(y/16),joint=((x+row%2*64)%128)===0;
  const shade=(x*13+Math.floor(y/3)*7)%41===0?1:0;
  floor+=rect(x,y,1,1,y%16===15?'#806043':joint?'#896546':shade?'#a37a51':shades[row%4]);
 }
 const floorImage=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" shape-rendering="crispEdges">'+floor+'</svg>')).png().toBuffer();
 for(let z=0;z<2;z++)for(let x=0;x<4;x++){
  const input=B+'/prepared/floor-'+x+'-'+z+'.png',id='floor-'+x+'-'+z;
  await sharp(floorImage).extract({left:x*32,top:z*32,width:32,height:32}).png().toFile(path.join(R,input));
  defs[id]={file:'res://art/export/shop-2d/'+id+'.png',size:[32,32],foot:[0,0],footprint:[.5,.5],kind:'floor',layer:'Floor',collisions:[]};
  jobs.push({id,input:path.join(R,input).replaceAll('\\','/'),source:'res://art/source/shop-2d/'+id+'.pxpen',output:'res://art/export/shop-2d/'+id+'.png',size:[32,32],edits:[]});
 }
 const sources={'herb-cabinet':'herb-cabinet','potion-cabinet':'potion-arch','travel-cabinet':'travel-cabinet','counter':'counter','apothecary-bench':'apothecary-bench-v2','potion-island':'potion-island','travel-island':'travel-island','travel-stock':'travel-stock-v2','luggage':'travel-stock-v2'};
 const sizes={'herb-cabinet':[2,.5,3],'potion-cabinet':[2,.5,3],'travel-cabinet':[2,.5,3],'counter':[4,1,1],'apothecary-bench':[3,1,1],'potion-island':[1.5,.5,1],'travel-island':[1.5,.5,1],'travel-stock':[2,.5,.75],'luggage':[1.5,.5,.75]};
 for(const[id,source]of Object.entries(sources)){
  const [w,d,h]=sizes[id],W=w*64,dep=H(d),face=H(h),height=Math.ceil((dep+face+40)/32)*32,base=height-4,top=base-face-dep;
  const file='godot-arcana/art/export/shop-interior/'+source+'.png',m=await sharp(path.join(R,file)).metadata();
  const texture=await sourceData(file,{left:Math.floor(m.width*.08),top:Math.floor(m.height*.18),width:Math.floor(m.width*.84),height:Math.floor(m.height*.72)},[W-12,face-8]);
  // Front, roof and ground edges derive from one physical box. Front material is cropped uniformly, never stretched.
  let a=rect(0,top,W,dep,C.oak)+rect(0,top,W,2,'#c19b65')+rect(0,top+dep-2,W,2,C.gold)+rect(0,top+dep,W,face,C.navy);
  for(let j=5;j<dep-3;j+=7)a+=rect(3,top+j,W-6,1,j%2?'#9e7850':'#805d40');
  a+=image(texture,6,top+dep+4,W-12,face-8);
  a+=rect(0,top+dep,4,face,C.gold)+rect(W-4,top+dep,4,face,C.gold)+rect(1,top+dep,1,face,C.goldHi)+rect(W-3,top+dep,1,face,C.shade);
  a+=rect(0,base-3,W,3,C.ink)+rect(4,base-6,W-8,2,C.gold);
  // The back and front edges of the roof are horizontal at yaw=0; side edges are exactly vertical.
  a+=rect(0,top,W,1,C.light)+rect(0,top,1,dep,C.goldHi)+rect(W-1,top,1,dep,C.shade);
  const def={foot:[W/2,base],anchor:'front-center',footprint:[w,d],height:h,kind:'furniture',layer:'Furniture',collisions:[[0,0,w,d]],geometry:{roofDepthPixels:dep,frontHeightPixels:face,roofBackY:top,roofFrontY:top+dep,baseline:base,verticalEdges:[0,W-1],sourceMaterial:file,materialMapping:'uniform cover crop, not anisotropic sprite scaling'}};
  if(id==='counter'){def.interaction={id:'merchant',kind:'merchant',offset:[w/2,d+.75]};def.actor={id:'merchant',offset:[w/2,d-1.5],footprint:[.75,.5]};}
  await png(id,W,height,a,def);
 }
 // Organic props and the approved merchant retain their native shape and scale.
 for(const[id,file,foot,size,fp]of [['plant','godot-arcana/art/export/inn-lobby/plant.png',null,null,[.5,.5]],['merchant','godot-arcana/art/export/shop-interior/merchant.png',[48,116],[96,136],[.75,.5]]]){
  const data=JSON.parse(await fs.readFile(path.join(R,'godot-arcana/art/export/inn-lobby/manifest.json'),'utf8'));
  const spec=id==='plant'?data.assets.plant:{foot,size},meta=await sharp(path.join(R,file)).metadata();
  const input=B+'/prepared/'+id+'.png';await fs.copyFile(path.join(R,file),path.join(R,input));
  defs[id]={file:'res://art/export/shop-2d/'+id+'.png',size:[meta.width,meta.height],foot:spec.foot,anchor:'front-center',footprint:fp,height:id==='plant'?1:2.2,kind:id==='plant'?'furniture':'actor',layer:'Furniture',collisions:id==='plant'?[[0,0,.5,.5]]:[]};
  jobs.push({id,input:path.join(R,input).replaceAll('\\','/'),source:'res://art/source/shop-2d/'+id+'.pxpen',output:'res://art/export/shop-2d/'+id+'.png',size:[meta.width,meta.height],edits:[]});
 }
 for(const job of jobs){const g=defs[job.id].geometry;if(!g)continue;const raw=await sharp(job.input).ensureAlpha().raw().toBuffer();for(const x of [1,defs[job.id].size[0]-2]){const y=g.roofFrontY-1,i=(y*defs[job.id].size[0]+x)*4;job.edits.push({x,y,expected:raw.subarray(i,i+3).toString('hex'),color:'f0d395'});}}
 const def={version:1,pixelsPerUnit:P,pitchSine:S,origin:[5,4],gridStep:.5,approvedConcept:'art-studies/regions/arcana-shop-interior/source/tilemap-v3/concept-v3.png',assets:defs};
 await fs.writeFile(path.join(R,B,'assets.json'),JSON.stringify(def,null,2)+'\n');
 await fs.writeFile(path.join(R,E,'assets.json'),JSON.stringify(def,null,2)+'\n');
 await fs.writeFile(path.join(R,B,'pixelpen-plan.json'),JSON.stringify({jobs},null,2)+'\n');
 console.log('Prepared '+jobs.length+' registered shop tiles/props; PixelPen masters not overwritten.');
}
build().catch(e=>{console.error(e);process.exitCode=1;});
