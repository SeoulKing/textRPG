/* Asset preparation only: crops generated component artwork and registers it.
 * Does not generate replacement character art, modify the game, or run tests.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'art-studies/arcana-hero/white-bob-heroine/wardrobe-v1');
const W = 64, H = 80;
const dirs = ['front', 'back', 'left', 'right'];
const rows = [
  {id:'body', source:[45,411], height:66, top:7, slots:[]},
  {id:'hair', source:[431,581], height:24, top:5, width:[30,31,29,29], shift:[0,0,4,-6], slots:['hair']},
  {id:'dress', source:[611,909], height:37, top:26, width:[36,36,30,30], slots:['top','bottom'], hide:'dress'},
  {id:'shawl', source:[937,1070], height:15, top:27, width:[30,30,23,23], slots:['shoulders']},
  {id:'boots-taupe', source:[1146,1261], height:13, top:60, slots:['feet'], hide:'feet'},
  {id:'blouse', source:[1297,1512], height:26, top:26, width:[32,32,25,25], slots:['top'], hide:'top'},
  {id:'skirt', source:[1538,1766], height:27, top:37, width:[36,36,30,30], slots:['bottom'], hide:'bottom'},
  {id:'boots-navy', source:[1830,1950], height:13, top:60, slots:['feet'], hide:'feet'},
];
// Candidate palette sampled by eye from the generated reference. No world LUT applied.
const palette = ['302c43','494255','645c6b','807788','a49aab','c4b9cb','e0d7e1','f8f0e5',
  'f4d3c0','dfad9f','ba8684','945f6d','755f91','a38abb','d0b5d6',
  '28364d','3c4d6c','566b8b','7186aa','91a3c3','b4c1d4',
  '77665f','a08b7b','c2ad98','dfcdb3','efe2cd','c3b7ac','a59a99',
  '56515a','716773','92848e','bbb0b4'].map(s=>s.match(/../g).map(v=>parseInt(v,16)));
const offset = (x,y,w=W)=>(y*w+x)*4;
function skin(r,g,b) { return r>140 && r-g>17 && g-b>4; }
function raw(input,width=W,height=H) { return sharp(input,{raw:{width,height,channels:4}}); }
function blank(){return Buffer.alloc(W*H*4);}
function clean(data,width,height){
  const mask = new Uint8Array(width*height);
  for(let i=0;i<mask.length;i++){
    const [r,g,b,a]=data.subarray(i*4,i*4+4);
    // Remove low-alpha matte and highly saturated fringe artifacts, not dark eyes.
    const fringe = Math.max(r,g,b)-Math.min(r,g,b)>125;
    mask[i] = a>=220 && !fringe ? 1 : 0;
  }
  const seen = new Uint8Array(mask.length), groups=[];
  for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
    const q=[i]; seen[i]=1;
    for(let k=0;k<q.length;k++){
      const p=q[k], x=p%width, y=Math.floor(p/width);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx, yy=y+dy, n=yy*width+xx;
        if(xx>=0&&xx<width&&yy>=0&&yy<height&&mask[n]&&!seen[n]){seen[n]=1;q.push(n);}
      }
    }
    groups.push(q);
  }
  const min=Math.max(18,Math.max(...groups.map(g=>g.length))*0.018);
  const result=Buffer.alloc(data.length);
  for(const group of groups)if(group.length>=min)for(const i of group){
    data.copy(result,i*4,i*4,i*4+3);result[i*4+3]=255;
  }
  return result;
}
function bounds(data,width=W,height=H){
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[offset(x,y,width)+3]){
    x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
  }
  return x1<0?null:{left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};
}
function quantize(data){
  const out=Buffer.from(data);
  for(let i=0;i<out.length;i+=4){
    if(out[i+3]<128){out.fill(0,i,i+4);continue;}
    let color=palette[0],best=Infinity;
    for(const p of palette){const d=(out[i]-p[0])**2*.3+(out[i+1]-p[1])**2*.5+(out[i+2]-p[2])**2*.2;if(d<best){best=d;color=p;}}
    out.set([...color,255],i);
  }
  return out;
}
function over(target,layer){for(let i=0;i<target.length;i+=4)if(layer[i+3])layer.copy(target,i,i,i+4);return target;}
function handsMask(body){
  const mask = new Uint8Array(W*H);
  for(let y=42;y<=51;y++)for(let x=0;x<W;x++){
    const i=offset(x,y);
    if(body[i+3]&&skin(body[i],body[i+1],body[i+2])){
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy;if(xx>=0&&xx<W&&yy>=42&&yy<=51)mask[yy*W+xx]=1;
      }
    }
  }
  return mask;
}
function occlusion(type,body){
  const mask=blank(), hands=handsMask(body);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let hide=false;
    if(type==='dress')hide=y>=25&&y<63&&!hands[y*W+x];
    if(type==='top')hide=y>=25&&y<48&&!hands[y*W+x];
    if(type==='bottom')hide=y>=37&&y<64&&!hands[y*W+x];
    if(type==='feet')hide=y>=60;
    if(hide)mask.set([255,255,255,255],offset(x,y));
  }
  return mask;
}
const combinations=[
 {id:'original',label:'Original dress',items:['dress','shawl','boots-taupe']},
 {id:'no-shawl',label:'Dress / no shawl',items:['dress','boots-taupe']},
 {id:'alternate',label:'Blouse + skirt',items:['blouse','skirt','shawl','boots-taupe']},
 {id:'alternate-no-shawl',label:'Blouse + skirt / no shawl',items:['blouse','skirt','boots-taupe']},
 {id:'shoe-swap',label:'Dress / navy boots',items:['dress','shawl','boots-navy']},
 {id:'alternate-shoes',label:'Blouse + skirt / navy boots',items:['blouse','skirt','shawl','boots-navy']},
];
async function main(){
  for(const dir of ['layers','masks','composites','preview','source'])await fs.mkdir(path.join(OUT,dir),{recursive:true});
  const src=await sharp(path.join(OUT,'source/generated-components.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const layers={}, masks={}, calibration=[];
  for(const row of rows){
    layers[row.id]={};
    for(let d=0;d<4;d++){
      const x0=Math.round(src.info.width*d/4), x1=Math.round(src.info.width*(d+1)/4);
      const tile=await raw(src.data,src.info.width,src.info.height).extract({left:x0,top:row.source[0],width:x1-x0,height:row.source[1]-row.source[0]}).raw().toBuffer({resolveWithObject:true});
      const cleaned=clean(tile.data,tile.info.width,tile.info.height),box=bounds(cleaned,tile.info.width,tile.info.height);
      if(!box)throw Error(`Empty component: ${row.id}/${dirs[d]}`);
      const width=row.width?.[d]??Math.round(box.width/box.height*row.height);
      let sprite=await raw(cleaned,tile.info.width,tile.info.height).extract(box).resize(width,row.height,{kernel:'nearest',fit:'fill'}).raw().toBuffer();
      sprite=quantize(sprite);
      // Hair reference includes ears; remove skin from this wearable overlay.
      if(row.id==='hair')for(let i=0;i<sprite.length;i+=4)if(skin(sprite[i],sprite[i+1],sprite[i+2]))sprite.fill(0,i,i+4);
      const canvas=blank(),left=Math.round((W-width)/2)+(row.shift?.[d]??0);
      for(let y=0;y<row.height;y++)for(let x=0;x<width;x++){
        const si=offset(x,y,width),di=offset(left+x,row.top+y);sprite.copy(canvas,di,si,si+4);
      }
      layers[row.id][dirs[d]]=canvas;
      await raw(canvas).png().toFile(path.join(OUT,'layers',`${row.id}-${dirs[d]}.png`));
      calibration.push({item:row.id,direction:dirs[d],sourceRegion:{left:x0,top:row.source[0],width:x1-x0,height:row.source[1]-row.source[0]},sourceBounds:box,destination:{left,top:row.top,width,height:row.height}});
    }
    const atlas=await sharp({create:{width:W*4,height:H,channels:4,background:'#00000000'}}).composite(dirs.map((d,i)=>({input:layers[row.id][d],raw:{width:W,height:H,channels:4},left:i*W,top:0}))).png().toBuffer();
    await fs.writeFile(path.join(OUT,'layers',`${row.id}-sheet.png`),atlas);
  }
  for(const type of ['dress','top','bottom','feet']){
    masks[type]={};
    for(const d of dirs){masks[type][d]=occlusion(type,layers.body[d]);await raw(masks[type][d]).png().toFile(path.join(OUT,'masks',`${type}-${d}.png`));}
  }
  const reports=[], boards=[], native=[];
  for(let c=0;c<combinations.length;c++){
    const combo=combinations[c], occupied=new Set();
    for(const id of combo.items)for(const slot of rows.find(r=>r.id===id).slots){if(occupied.has(slot))throw Error('Conflicting slot '+slot);occupied.add(slot);}
    for(let d=0;d<4;d++){
      const direction=dirs[d], body=Buffer.from(layers.body[direction]);
      for(const id of combo.items){const hide=rows.find(r=>r.id===id).hide;if(hide)for(let i=0;i<body.length;i+=4)if(masks[hide][direction][i+3])body.fill(0,i,i+4);}
      const assembled=body;
      for(const id of ['boots-taupe','boots-navy','skirt','dress','blouse','shawl'])if(combo.items.includes(id))over(assembled,layers[id][direction]);
      over(assembled,layers.hair[direction]);
      const box=bounds(assembled);
      if(!box||box.left<1||box.top<1||box.left+box.width>W-1||box.top+box.height>H-1)throw Error('Clipped sprite '+combo.id+'/'+direction);
      reports.push({combination:combo.id,direction,bounds:box,baseline:box.top+box.height-1});
      const image=await raw(assembled).png().toBuffer();
      await fs.writeFile(path.join(OUT,'composites',`${combo.id}-${direction}.png`),image);
      native.push({input:image,left:d*W,top:c*H});
      const zoom=await sharp(image).resize(W*4,H*4,{kernel:'nearest'}).png().toBuffer();
      boards.push({input:zoom,left:d*W*4,top:c*H*4});
    }
  }
  await sharp({create:{width:W*4,height:H*combinations.length,channels:4,background:'#00000000'}}).composite(native).png().toFile(path.join(OUT,'preview/comparison-1x.png'));
  await sharp({create:{width:W*16,height:H*4*combinations.length,channels:4,background:'#718399'}}).composite(boards).png().toFile(path.join(OUT,'preview/comparison-4x.png'));
  const overview = await sharp({create:{width:W*16,height:H*8,channels:4,background:'#718399'}}).composite(boards.filter((_,i)=>i<4||(i>=12&&i<16)).map((part,i)=>({...part,top:Math.floor(i/4)*H*4}))).png().toBuffer();
  await fs.writeFile(path.join(OUT,'preview/overview-4x.png'),overview);
  await sharp(overview).extract({left:0,top:0,width:W*16,height:H*4}).png().toFile(path.join(OUT,'preview/original-4x.png'));
  const componentBoard=[];
  for(let r=0;r<rows.length;r++)for(let d=0;d<4;d++)componentBoard.push({input:await raw(layers[rows[r].id][dirs[d]]).resize(W*4,H*4,{kernel:'nearest'}).png().toBuffer(),left:d*W*4,top:r*H*4});
  await sharp({create:{width:W*16,height:H*4*rows.length,channels:4,background:'#718399'}}).composite(componentBoard).png().toFile(path.join(OUT,'preview/components-4x.png'));
  const manifest={schemaVersion:1,status:'candidate-static-not-integrated',frameSize:[W,H],foot:[32,72],directions:dirs,lighting:'upper left; baked, neutral',alpha:'binary 0/255',palette,layerOrder:['body','feet','bottom','dress','top','shoulders','hair'],
    items:rows.filter(r=>r.id!=='body').map(r=>({id:r.id,occupies:r.slots,layers:Object.fromEntries(dirs.map(d=>[d,`layers/${r.id}-${d}.png`])),bodyOcclusion:r.hide?Object.fromEntries(dirs.map(d=>[d,`masks/${r.hide}-${d}.png`])):null})),
    body:Object.fromEntries(dirs.map(d=>[d,`layers/body-${d}.png`])),rules:['Reject conflicting occupied slots; dress occupies top and bottom.','Apply the UNION of selected body-occlusion masks to BODY ONLY before composing. White/opaque mask pixels hide body.','Never apply body masks to other garments.','Use complete upper+lower coverage, or dress, for dressed previews.','Garment shapes are directional; side views cannot be substituted by scaling front views.'],combinations,
    provenance:{tool:'built-in image_gen',source:'source/generated-components.png',prompt:'source/prompt.txt',preparation:'scripts/build-heroine-wardrobe.cjs',calibration:'source/registration.json',note:'Generated atlas is unregistered. Cropping/nearest resizing/palette and alpha cleanup are deterministic preparation. Candidate style palette is not the world 64-color LUT.'},
    limitations:['Four static directions only.','No game equipment/save integration or animation.','Each new garment needs matching directional artwork; free combinations require overlap review.','Static mask templates must be reauthored for animated poses or significantly shorter garments.']};
  await fs.writeFile(path.join(OUT,'wardrobe.json'),JSON.stringify(manifest,null,2)+'\n');
  await fs.writeFile(path.join(OUT,'source/registration.json'),JSON.stringify(calibration,null,2)+'\n');
  const layerChecks=[];
  for(const row of rows)for(const d of dirs){const a=layers[row.id][d];let binary=true;for(let i=3;i<a.length;i+=4)if(a[i]!==0&&a[i]!==255)binary=false;layerChecks.push({item:row.id,direction:d,size:[W,H],binaryAlpha:binary,bounds:bounds(a)});}
  await fs.writeFile(path.join(OUT,'asset-check.json'),JSON.stringify({kind:'asset preparation invariants; not a game playtest',layers:layerChecks,composites:reports},null,2)+'\n');
  console.log(`Prepared ${layerChecks.length} directional layers, 16 masks, ${reports.length} composites. See wardrobe-v1/preview.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
