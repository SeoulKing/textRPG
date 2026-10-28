/* Prepare reference-generated art, register paper-doll parts, and bake a shared
 * 2D animation rig. No character art is drawn by this script. Run from any cwd. */
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..'),ART=path.join(ROOT,'art-studies/arcana-reference-v1'),EXPORT=path.join(ROOT,'godot-arcana/art/export/reference');
const HERO_ONLY=process.argv.includes('--hero-only');
const IDLE=4,WALK=24,STOP=4,STRIDE=IDLE+WALK+STOP*2;
const MANUAL=path.join(ROOT,'godot-arcana/art/source/heroine');
const motion=JSON.parse(require('fs').readFileSync(path.join(MANUAL,'motion.json'),'utf8'));
const workshop=JSON.parse(require('fs').readFileSync(path.join(MANUAL,'workshop.json'),'utf8'));
const CYCLE_MAP=2*motion.footTravelPixels/motion.stanceFraction/64*16;
const W=96,H=136,GRID=[16,22],FOOT=[48,116],DIRS=['s','se','e','ne','n','nw','w','sw'];
const IDS=['body','hair','dress','shawl','boots-taupe','blouse','skirt','boots-navy','arms-back','arms-front','arms-bare'];
const SETTINGS=[
 {top:10,height:107}, {top:7,height:38,width:[47,47,43,44,48,44,43,47],shift:[0,-1,-5,0,0,0,4,1]},
 {top:44,height:55,width:[56,54,46,48,56,48,46,54]}, {top:44,height:23,width:[48,45,36,38,48,38,36,45]},
 {top:101,height:16}, {top:44,height:37,width:[50,49,37,39,50,39,37,49]},
 {top:60,height:33,width:[56,54,46,48,56,48,46,54]}, {top:101,height:16}
];
const at=(x,y,w=W)=>(y*w+x)*4;
const blank=()=>Buffer.alloc(W*H*4);
const image=(data,width=W,height=H)=>sharp(data,{raw:{width,height,channels:4}});
function box(data,w=W,h=H){let l=w,t=h,r=-1,b=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[at(x,y,w)+3]){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}return r<0?null:{left:l,top:t,width:r-l+1,height:b-t+1};}
function cleaned(data,w,h){
 const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),groups=[];
 for(let p=0;p<mask.length;p++){const i=p*4;mask[p]=data[i+3]>=220&&Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<130?1:0;}
 for(let p=0;p<mask.length;p++)if(mask[p]&&!seen[p]){const q=[p];seen[p]=1;for(let k=0;k<q.length;k++){const n=q[k],x=n%w,y=Math.floor(n/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[j]&&!seen[j]){seen[j]=1;q.push(j);}}}groups.push(q);}
 const limit=Math.max(12,Math.max(...groups.map(g=>g.length))*0.012),out=Buffer.alloc(data.length);
 for(const g of groups)if(g.length>=limit)for(const p of g){data.copy(out,p*4,p*4,p*4+3);out[p*4+3]=255;}
 return out;
}
function spans(data,w,h){const spans=[];for(let y=0;y<h;y++){let n=0;for(let x=0;x<w;x++)if(data[at(x,y,w)+3]>=220)n++;if(n>15){if(!spans.length||y>spans.at(-1)[1]+9)spans.push([y,y]);else spans.at(-1)[1]=y;}}return spans;}
let palette,lut,sourceColors,heroPalette,stonePalette,leafPalette,cache=new Map();
function fixed(rgb){const [r,g,b]=rgb.map(v=>Math.floor(v*31/255+.5));const i=((g*1024+b*32+r)*3);return [...lut.subarray(i,i+3)];}
function quantize(data,choices=palette){const out=Buffer.from(data);for(let i=0;i<out.length;i+=4){if(out[i+3]<128){out.fill(0,i,i+4);continue;}const key=out[i]*65536+out[i+1]*256+out[i+2];const cacheKey=choices.map(c=>c.join(',')).join(';')+':'+key;let color=cache.get(cacheKey);if(!color){let best=Infinity;color=palette[0];for(const p of choices){const d=(out[i]-p[0])**2*.30+(out[i+1]-p[1])**2*.50+(out[i+2]-p[2])**2*.20;if(d<best){best=d;color=p;}}cache.set(cacheKey,color);}out.set([...color,255],i);}return out;}
function over(dst,src){for(let i=0;i<dst.length;i+=4)if(src[i+3])src.copy(dst,i,i,i+4);return dst;}
function openProfileFace(hair,d){
 // Profile source wigs include a far-side lock in front of the face opening.
 // End the fringe above the eye and keep the nose/mouth side open below it.
 if(d!==2&&d!==6)return;
 for(let y=20;y<H;y++)for(let x=0;x<W;x++){
   const front=(x-W/2)*(d===2?1:-1),edge=16-Math.min(12,y-20);
   if(front>=edge)hair.fill(0,at(x,y),at(x,y)+4);
 }
}
function skin(r,g,b){return r>145&&r-g>16&&g-b>3;}
function maskFor(kind,body){const out=blank(),hands=new Uint8Array(W*H);for(let y=72;y<88;y++)for(let x=0;x<W;x++){const i=at(x,y);if(body[i+3]&&skin(body[i],body[i+1],body[i+2]))for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<W&&yy>=72&&yy<88)hands[yy*W+xx]=1;}}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const hide=(kind==='feet'?y>=101:kind==='dress'?y>=43&&y<93:kind==='top'?y>=43&&y<79:y>=60&&y<94)&&!hands[y*W+x];if(hide&&body[at(x,y)+3])out.set([255,255,255,255],at(x,y));}return out;}
// Motion is authored and baked in Godot; no JavaScript limb deformation.
function characterPalette(data,id){
 const hair=[1,3,4,5,6,7].map(i=>fixed(sourceColors[i]));
 const blue=[1,24,25,26,27,28,29,30,31].map(i=>fixed(sourceColors[i]));
 const out=quantize(data,id==='hair'?hair:heroPalette);
 if(id!=='hair'&&id!=='body'&&!id.startsWith('boots')){
   const cool=quantize(data,blue);
   for(let i=0;i<data.length;i+=4)if(data[i+3]&&data[i+2]>data[i]*1.07&&data[i+2]>data[i+1]*1.02)
     cool.copy(out,i,i,i+4);
 }
 // Suppress isolated interior scratch pixels, retaining silhouette and face features.
 if(id!=='body'){
   const src=Buffer.from(out);
   for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
     const i=at(x,y);if(!src[i+3])continue;
     const votes=new Map();let n=0,same=0;
     for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
       const j=at(x+dx,y+dy);if(!src[j+3])continue;n++;
       const key=src[j]*65536+src[j+1]*256+src[j+2];
       votes.set(key,(votes.get(key)||0)+1);
       if(src[j]===src[i]&&src[j+1]===src[i+1]&&src[j+2]===src[i+2])same++;
     }
     if(n===8&&same===0){const [rgb,count]=[...votes].sort((a,b)=>b[1]-a[1])[0];
       if(count>=4)out.set([rgb>>16,(rgb>>8)&255,rgb&255,255],i);}
   }
 }
 return out;
}
async function main(){
 for(const p of [EXPORT,path.join(ART,'masters'),path.join(ART,'layers'),path.join(ART,'preview')])await fs.mkdir(p,{recursive:true});
 const text=await fs.readFile(path.join(ROOT,'godot-arcana/art/source/arcana-world-64.gpl'),'utf8');
 const colors=text.split(/\r?\n/).filter(s=>/^\d+ \d+ \d+ /.test(s)).map(s=>s.split(/\s+/).slice(0,3).map(Number));
 lut=await sharp(path.join(ROOT,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 palette=[...new Map(colors.map(c=>[fixed(c).join(','),fixed(c)])).values()];
 sourceColors=colors;heroPalette=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,24,25,26,27,28,29,30,31,48,49,50,51,52,53,56,57,58,59,60,61].map(i=>fixed(colors[i]));
 stonePalette=[10,11,12,13,14,15].map(i=>fixed(colors[i]));leafPalette=[0,32,33,34,35,36,37,38].map(i=>fixed(colors[i]));
 const sheets=[];for(const name of ['hero-cardinal-clusters-v2','hero-diagonal-clusters-v2']){const s=await sharp(path.join(ART,'source',name+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});s.rows=spans(s.data,s.info.width,s.info.height);if(s.rows.length!==8)throw Error(name+': expected eight component rows');sheets.push(s);}

 const clipCounts={idle:4,walk:24,stop_left:4,stop_right:4,turn_left:4,turn_right:4};
 for(const [key,changes] of Object.entries(workshop.patches)){
   const [layer,d,clip,f,...extra]=key.split('/');
   if(extra.length||![...IDS,'dress-mask','top-mask','bottom-mask','feet-mask'].includes(layer)||!DIRS.includes(d)||!Object.hasOwn(clipCounts,clip)||!/^\d+$/.test(f)||Number(f)>=clipCounts[clip])throw Error('Unknown persistent frame patch: '+key);
   for(const [point,color] of Object.entries(changes)){
     const xy=point.split(',').map(Number);
     if(xy.length!==2||xy.some(v=>!Number.isInteger(v))||xy[0]<0||xy[0]>=W||xy[1]<0||xy[1]>=H)throw Error('Invalid persistent pixel: '+point);
     if(color!=='.'&&!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid persistent color: '+color);
   }
 }
 // Semantic direction registration, based on visible nose/ear/foot orientation.
 const previous=await sharp(path.join(ART,'source/hero-ivory-profile-reference.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});previous.rows=spans(previous.data,previous.info.width,previous.info.height);
 const sourceFor=[[0,0],[1,3],[0,3],[1,2],[0,1],[1,1],[0,2],[1,0]];
 const masters={},masks={},registration=[];
 for(let ri=0;ri<8;ri++){const id=IDS[ri],cfg=SETTINGS[ri];masters[id]=[];
   for(let d=0;d<8;d++){
     // The NE hair cell opens toward the front-left, unlike its rear-right body.
     // Mirror the closed NW back hair so the bald base head stays covered.
     const mirrorBackHair=id==='hair'&&d===3;
     const [si,col]=sourceFor[mirrorBackHair?5:d],sheet=(id==='dress'&&(d===2||d===6))?previous:sheets[si],x0=Math.round(sheet.info.width*col/4),x1=Math.round(sheet.info.width*(col+1)/4),span=sheet.rows[ri];
     const region={left:x0,top:Math.max(0,span[0]-4),width:x1-x0,height:Math.min(sheet.info.height-1,span[1]+4)-Math.max(0,span[0]-4)+1};
     const tile=await image(sheet.data,sheet.info.width,sheet.info.height).extract(region).raw().toBuffer({resolveWithObject:true});
     const cut=cleaned(tile.data,tile.info.width,tile.info.height),bounds=box(cut,tile.info.width,tile.info.height);if(!bounds)throw Error('Empty '+id+'/'+d);
     const width=cfg.width?.[d]??Math.round(bounds.width/bounds.height*cfg.height);
     let resized=image(cut,tile.info.width,tile.info.height).extract(bounds).resize(width,cfg.height,{fit:'fill',kernel:'lanczos3'});
     if(id==='hair'||id==='dress'||id==='shawl'||id==='skirt')resized=resized.median(3);
     if(mirrorBackHair)resized=resized.flop();
     let component=await resized.raw().toBuffer();
     // Isolate ear/skin pixels from the wearable hair, leaving the base face visible.
     if(id==='hair')for(let i=0;i<component.length;i+=4)if(component[i]>145&&component[i]-component[i+1]>22&&component[i+1]-component[i+2]>20&&component[i+2]<190)component.fill(0,i,i+4);
     for(let i=0;i<component.length;i+=4){if(component[i+3]<128)component.fill(0,i,i+4);else component[i+3]=255;}
     const master=blank(),left=Math.round((W-width)/2)+(cfg.shift?.[d]??0);
     for(let y=0;y<cfg.height;y++)for(let x=0;x<width;x++){const i=at(x,y,width),j=at(left+x,cfg.top+y);component.copy(master,j,i,i+4);}
     if(id==='dress'){
       const shortened=blank();for(let y=0;y<H;y++)for(let x=0;x<W;x++){
         const yy=y<80?y:80+Math.round((y-80)*12/18),i=at(x,y);if(master[i+3]&&yy<H)master.copy(shortened,at(x,yy),i,i+4);
       }shortened.copy(master);
     }
     if(id==='body'){
       const registered=blank();for(let y=0;y<H;y++)for(let x=0;x<W;x++){
         const i=at(x,y);if(!master[i+3])continue;const weight=y>=56&&y<88?Math.min(1,(y-56)/18):0;
         const inward=x<38?1:x>58?-1:0,xx=x+Math.round(inward*3*weight),yy=y-Math.round(Math.abs(inward)*2*weight);
         master.copy(registered,at(xx,yy),i,i+4);
       }registered.copy(master);
     }
     characterPalette(master,id).copy(master);
     if(id==='hair')openProfileFace(master,d);
     const authored=path.join(MANUAL,'masters',id+'-'+DIRS[d]+'.png');
     if(require('fs').existsSync(authored)){
       const edit=await sharp(authored).ensureAlpha().raw().toBuffer({resolveWithObject:true});
       if(edit.info.width!==W||edit.info.height!==H)throw Error('Edited master dimensions changed: '+authored);
       quantize(edit.data).copy(master);
     }
     masters[id][d]=master;await image(master).png().toFile(path.join(ART,'masters',`${id}-${DIRS[d]}.png`));
     registration.push({id,direction:DIRS[d],source:sheet===previous?'previous-generated-ivory-profile':['hero-cardinal-clusters-v2','hero-diagonal-clusters-v2'][si],region,bounds,...(mirrorBackHair?{mirrorX:true}:{}),destination:{left,top:cfg.top,width,height:cfg.height}});
   }
 }
 // Native Skeleton2D/AnimationPlayer output is the animation source of truth.
 const baked={};
 for(const id of [...IDS,'body-upper']){
   const file=path.join(MANUAL,'skeletal/bake','hero-'+id+'.png');
   if(!require('fs').existsSync(file))throw Error('Native skeleton bake missing: run pwsh -File scripts/bake-heroine-skeleton.ps1');
   baked[id]=quantize(await sharp(file).ensureAlpha().raw().toBuffer());
   baked['turn-'+id]=quantize(await sharp(path.join(MANUAL,'skeletal/bake','turn-hero-'+id+'.png')).ensureAlpha().raw().toBuffer());
 }
 function nativeFrame(id,d,f){
   const result=blank(),index=f<36?d*STRIDE+f:d*8+f-36,bx=index%16*W,by=Math.floor(index/16)*H;
   const data=baked[(f<36?'':'turn-')+id];
   for(let y=0;y<H;y++)data.copy(result,y*W*4,((by+y)*W*16+bx)*4,((by+y)*W*16+bx+W)*4);
   return result;
 }
 const atlasBuffers={},frames=[];
 for(const id of [...IDS,'dress-mask','top-mask','bottom-mask','feet-mask']){
   const atlas=Buffer.alloc(W*GRID[0]*H*GRID[1]*4);
   for(let d=0;d<8;d++)for(let f=0;f<STRIDE+8;f++){
     const clip=f>=40?'turn_right':f>=36?'turn_left':f<IDLE?'idle':f<IDLE+WALK?'walk':f<IDLE+WALK+STOP?'stop_left':'stop_right',cf=f>=36?f%4:f<IDLE?f:f<IDLE+WALK?f-IDLE:f<IDLE+WALK+STOP?f-IDLE-WALK:f-IDLE-WALK-STOP,src=null;
     let frame;
     if(!id.endsWith('-mask')) frame=nativeFrame(id,d,f);
     else {
       const body=nativeFrame('body',d,f);
       if(id==='feet-mask'){
         const upper=nativeFrame('body-upper',d,f);frame=blank();
         for(let i=0;i<body.length;i+=4)if(body[i+3]&&!upper[i+3])frame.set([255,255,255,255],i);
       }else {
         const garment=nativeFrame({'dress-mask':'dress','top-mask':'blouse','bottom-mask':'skirt'}[id],d,f);frame=blank();
         // Only opaque clothing occludes skin. Never erase a neck or waist by y range.
         for(let i=0;i<body.length;i+=4)if(body[i+3]&&garment[i+3])frame.set([255,255,255,255],i);
       }
     }
     const patches=workshop.patches[id+'/'+DIRS[d]+'/'+clip+'/'+cf]||{};
     for(const [point,color] of Object.entries(patches)){
       const [x,y]=point.split(',').map(Number);if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=W||y<0||y>=H)throw Error('Invalid edited pixel '+point);
       if(color==='.')frame.fill(0,at(x,y),at(x,y)+4);
       else{if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid palette color '+color);frame.set([...color.slice(1).match(/../g).map(v=>parseInt(v,16)),255],at(x,y));}
     }
     const index=f<36?d*STRIDE+f:288+d*8+f-36,xx=index%16*W,yy=Math.floor(index/16)*H;
     for(let y=0;y<H;y++)frame.copy(atlas,((yy+y)*W*16+xx)*4,y*W*4,(y+1)*W*4);
     if(id==='body')frames.push({direction:DIRS[d],animation:clip,frame:cf,cell:[index%16,Math.floor(index/16)],bounds:box(frame)});
   }
   atlasBuffers[id]=atlas;await image(atlas,W*16,H*GRID[1]).png().toFile(path.join(EXPORT,'hero-'+id+'.png'));
 }
 const packed=Buffer.alloc(W*GRID[0]*H*GRID[1]*4);
 for(const [channel,kind] of ['dress','top','bottom','feet'].entries()){
   const mask=atlasBuffers[kind+'-mask'];for(let i=0;i<packed.length;i+=4)packed[i+channel]=mask[i+3];
 }
 await image(packed,W*GRID[0],H*GRID[1]).png().toFile(path.join(EXPORT,'hero-occlusion.png'));
 const combinations=[{id:'original',items:['dress','shawl','boots-taupe']},{id:'no-shawl',items:['dress','boots-taupe']},{id:'alternate',items:['blouse','skirt','shawl','boots-navy']}];
 const previews=[];for(let c=0;c<combinations.length;c++){
   const combo=combinations[c],dst=over(Buffer.from(atlasBuffers['arms-back']),atlasBuffers.body),hidden=combo.items.includes('dress')?['dress','feet']:['top','bottom','feet'];
   for(const kind of hidden){const mask=atlasBuffers[kind+'-mask'];for(let i=0;i<dst.length;i+=4)if(mask[i+3])dst.fill(0,i,i+4);}
   for(const id of ['boots-taupe','boots-navy','skirt','dress','blouse','arms-front','shawl','hair'])if(id==='hair'||id==='arms-front'||combo.items.includes(id))over(dst,atlasBuffers[id]);
   await image(dst,W*16,H*GRID[1]).png().toFile(path.join(EXPORT,'hero-'+combo.id+'.png'));
   for(let d=0;d<8;d++){const i=d*STRIDE,frame=await image(dst,W*16,H*GRID[1]).extract({left:i%16*W,top:Math.floor(i/16)*H,width:W,height:H}).png().toBuffer();previews.push({input:await sharp(frame).resize(W*3,H*3,{kernel:'nearest'}).png().toBuffer(),left:d*W*3,top:c*H*3});if(c===0)await fs.writeFile(path.join(ART,'masters','assembled-'+DIRS[d]+'.png'),frame);}
 }
 await sharp({create:{width:W*3*8,height:H*3*3,channels:4,background:'#718399'}}).composite(previews).png().toFile(path.join(ART,'preview/wardrobe-directions-3x.png'));
 let props=HERO_ONLY?JSON.parse(await fs.readFile(path.join(ART,'manifest.json'),'utf8')).props:{};
 if(!HERO_ONLY){
 const terrain=await sharp(path.join(ART,'source/terrain.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(const [name,col,row] of [['stone-a',0,0],['soil',1,0],['grass',0,1],['stone-b',1,1]]){
   const halfW=Math.floor(terrain.info.width/2),halfH=Math.floor(terrain.info.height/2);
   const data=await image(terrain.data,terrain.info.width,terrain.info.height).extract({left:col*halfW,top:row*halfH,width:halfW,height:halfH}).resize(128,128,{kernel:'nearest'}).median(3).raw().toBuffer();
   await image(quantize(data,name.startsWith('stone')?stonePalette:name==='grass'?leafPalette:palette),128,128).png().toFile(path.join(EXPORT,name+'.png'));
 }
 const propSrc=await sharp(path.join(ART,'source/props.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const propSpecs=[['planter',[0,100,405,360],84,72],['flowerpot',[425,100,300,350],58,72],['shrub',[745,120,341,330],86,80],['flowers',[0,490,390,260],88,56],['grass-clump',[390,500,370,250],72,32],['crate',[780,490,306,260],64,56],['oak',[0,780,438,628],210,260],['birch',[420,770,360,640],180,260],['spruce',[770,780,316,628],166,260]];
 for(const [name,r,w,h] of propSpecs){const region={left:r[0],top:r[1],width:Math.min(r[2],propSrc.info.width-r[0]),height:Math.min(r[3],propSrc.info.height-r[1])};const t=await image(propSrc.data,propSrc.info.width,propSrc.info.height).extract(region).raw().toBuffer({resolveWithObject:true});const cut=cleaned(t.data,t.info.width,t.info.height),b=box(cut,t.info.width,t.info.height);if(!b)throw Error('Empty prop '+name);const resized=await image(cut,t.info.width,t.info.height).extract(b).resize(w,h,{fit:'fill',kernel:'nearest'}).raw().toBuffer();const ready=quantize(resized);
   if(name!=='crate'){
     const green=quantize(resized,leafPalette);
     for(let i=0;i<resized.length;i+=4){const y=Math.floor(i/4/w),r=resized[i],g=resized[i+1],b=resized[i+2];
       if(g>r*.90&&g>b*1.15&&(name!=='planter'||y<h*.67))green.copy(ready,i,i,i+4);
     }
   }
   await image(ready,w,h).png().toFile(path.join(EXPORT,name+'.png'));props[name]={size:[w,h],foot:[Math.round(w/2),h-2],source:region};}
 const furniture=await sharp(path.join(ART,'source/furniture.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(const [name,region,w,h] of [['bench',{left:0,top:0,width:870,height:724},128,72],['barrels',{left:885,top:0,width:665,height:724},96,88],['basket',{left:1560,top:0,width:612,height:724},72,48]]){
   const tile=await image(furniture.data,furniture.info.width,furniture.info.height).extract(region).raw().toBuffer({resolveWithObject:true});
   const cut=cleaned(tile.data,tile.info.width,tile.info.height),b=box(cut,tile.info.width,tile.info.height);
   const resized=await image(cut,tile.info.width,tile.info.height).extract(b).resize(w,h,{fit:'fill',kernel:'nearest'}).raw().toBuffer(),ready=quantize(resized);
   if(name==='basket'){const green=quantize(resized,leafPalette);for(let i=0;i<resized.length;i+=4)if(resized[i+1]>resized[i]*.9&&resized[i+1]>resized[i+2]*1.15)green.copy(ready,i,i,i+4);}
   await image(ready,w,h).png().toFile(path.join(EXPORT,name+'.png'));props[name]={size:[w,h],foot:[w/2,h-2],source:'source/furniture.png',region};
 }
 }
 if(!HERO_ONLY) Object.assign(props,await require('./build-arcana-furniture.cjs')());
 if(!HERO_ONLY) Object.assign(props,await require('./build-town-buildings.cjs')());
 if(!HERO_ONLY) Object.assign(props,await require('./build-street-lamp.cjs')());
 if(!HERO_ONLY) Object.assign(props,await require('./build-fountain-art.cjs')());
 if(!HERO_ONLY) await require('./build-fountain-paving.cjs')();
 if(!HERO_ONLY) Object.assign(props,await require('./build-arcana-planter.cjs')());
 const manifest={version:2,status:'integrated-art-pass-awaiting-user-art-review',frameSize:[W,H],foot:FOOT,sourceHeight:110,pixelsPerUnit:64,atlasGrid:GRID,directions:DIRS,clips:{idle:{count:4,fps:2},walk:{count:WALK,cycleMapUnits:CYCLE_MAP,previewMapUnitsPerSecond:motion.previewMapUnitsPerSecond,framesPerSecond:WALK*motion.previewMapUnitsPerSecond/CYCLE_MAP},stop_left:{count:STOP},stop_right:{count:STOP},turn_left:{count:4},turn_right:{count:4}},layers:IDS,bodyMasks:['dress','top','bottom','feet'],items:[{id:'dress',occupies:['top','bottom']},{id:'blouse',occupies:['top']},{id:'skirt',occupies:['bottom']},{id:'shawl',occupies:['shoulders']},{id:'boots-taupe',occupies:['feet']},{id:'boots-navy',occupies:['feet']}],layerOrder:['arms-back','body','boots','skirt','dress','blouse','arms-front','shawl','hair'],animation:'Native Godot Skeleton2D + Bone2D + Polygon2D weights + AnimationPlayer. One shared whole-body pose for every layer, underpainted neck/hip joints, baked then pixel-corrected.',sourcePalette:'arcana-world-64.gpl mapped to existing LUT fixed points',palette,frames,props,registration,sourcePrompts:['hero-cardinal','hero-diagonal','hero-ivory-profile-reference','terrain','props','furniture'].map(n=>'source/'+n+'-prompt.txt')};
 await fs.writeFile(path.join(ART,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const spec=`# Generated by scripts/build-arcana-reference-art.cjs.\nextends RefCounted\nconst FRAME_SIZE = Vector2i(96,136)\nconst FOOT = Vector2i(48,116)\nconst ATLAS_GRID = Vector2i(16,22)\nconst PIXELS_PER_UNIT = 64.0\nconst SOURCE_HEIGHT = 110\nconst GAIT_CYCLE = 1.929031467438\nconst IDLE_FRAMES = 4\nconst WALK_FRAMES = 24\nconst FRAMES_PER_DIRECTION = 36\nconst STEP_SECONDS = ${CYCLE_MAP/(2*motion.previewMapUnitsPerSecond)}\nconst WALK_DISTANCE_MAP_UNITS = ${CYCLE_MAP}\nconst STOP_FRAMES = 4\nconst SETTLE_SECONDS = ${motion.settleSeconds}\nconst PASSING_PHASE = ${motion.stanceFraction/2}\n`;
 await fs.writeFile(path.join(ROOT,'godot-arcana/art/resources/heroine_reference_spec.gd'),spec);
 const frameRoot=path.join(ROOT,'godot-arcana/art/resources');
 let tres='[gd_resource type="SpriteFrames" load_steps=354 format=3]\n\n[ext_resource type="Texture2D" path="res://art/export/reference/hero-original.png" id="1"]\n\n';
 const blocks=[];for(let d=0;d<8;d++)for(const [clip,offset,count,fps] of [['idle',0,4,2],['walk',4,24,24*motion.previewMapUnitsPerSecond/CYCLE_MAP],['stop_left',28,4,4/motion.settleSeconds],['stop_right',32,4,4/motion.settleSeconds],['turn_left',36,4,25],['turn_right',40,4,25]]){
   const frameList=[];for(let f=0;f<count;f++){
     const i=offset<36?d*STRIDE+offset+f:288+d*8+offset-36+f,sub='F'+i;
     tres+='[sub_resource type="AtlasTexture" id="'+sub+'"]\natlas = ExtResource("1")\nregion = Rect2('+(i%16*W)+', '+(Math.floor(i/16)*H)+', '+W+', '+H+')\n\n';
     frameList.push('{"duration": 1.0, "texture": SubResource("'+sub+'")}');
   }
   blocks.push('{"frames": ['+frameList.join(', ')+'], "loop": '+(!clip.startsWith('stop')&&!clip.startsWith('turn'))+', "name": &"'+clip+'_'+DIRS[d]+'", "speed": '+fps+'}');
 }
 tres+='[resource]\nanimations = ['+blocks.join(',\n')+']\n';
 await fs.writeFile(path.join(frameRoot,'heroine_frames.generated.tres'),tres);
 await sharp(path.join(EXPORT,'stone-a.png')).resize(128,90,{kernel:'nearest'}).png().toFile(path.join(EXPORT,'heroine-preview-floor.png'));
 const tiles='[gd_resource type="TileSet" load_steps=3 format=3]\n\n[ext_resource type="Texture2D" path="res://art/export/reference/heroine-preview-floor.png" id="1"]\n\n[sub_resource type="TileSetAtlasSource" id="S"]\ntexture = ExtResource("1")\ntexture_region_size = Vector2i(64,45)\n0:0/0 = 0\n1:0/0 = 0\n0:1/0 = 0\n1:1/0 = 0\n\n[resource]\ntile_size = Vector2i(64,45)\nsources/0 = SubResource("S")\n';
 await fs.writeFile(path.join(frameRoot,'heroine_preview_tiles.generated.tres'),tiles);
 if(!require('fs').existsSync(path.join(frameRoot,'heroine_preview_tiles.tres')))await fs.writeFile(path.join(frameRoot,'heroine_preview_tiles.tres'),tiles);

 if(!require('fs').existsSync(path.join(frameRoot,'heroine_frames.tres')))await fs.writeFile(path.join(frameRoot,'heroine_frames.tres'),tres);
 else {
   const editable=path.join(frameRoot,'heroine_frames.tres');let original=await fs.readFile(editable,'utf8');
   const missing=blocks.filter(block=>block.includes('turn_')&&!original.includes('"'+block.match(/"name": &"([^"]+)"/)[1]+'"'));
   if(missing.length){
     const extra=tres.split('[sub_resource').slice(1).map(v=>'[sub_resource'+v).filter(v=>/id="F(?:28[89]|29[0-9]|3[0-5][0-9])"/.test(v.split('\n')[0])).map(v=>v.split('[resource]')[0]).join('');
     original=original.replace('[resource]',extra+'[resource]');
     original=original.replace(/(animations = \[)([\s\S]*)(\]\s*)$/,(_,a,b,c)=>a+b.trim().replace(/,$/,'')+',\n'+missing.join(',\n')+c);
     original=original.replace(/load_steps=\d+/,'load_steps=354');await fs.writeFile(editable,original);
   }
 }


 for(const file of await fs.readdir(EXPORT))if(file.endsWith('.png.import')){
   const ip=path.join(EXPORT,file),before=await fs.readFile(ip,'utf8'),after=before.replace(/detect_3d\/compress_to=\d+/,'detect_3d/compress_to=0').replace(/mipmaps\/generate=true/,'mipmaps/generate=false').replace(/compress\/mode=\d+/,'compress/mode=0');
   if(after!==before)await fs.writeFile(ip,after);
 }
 console.log(JSON.stringify({frame:[W,H],directions:8,frames:352,layerAtlases:12,props:Object.keys(props).length,tiles:4,palette:palette.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
