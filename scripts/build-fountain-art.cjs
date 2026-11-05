const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'art-studies/fountain');
const out=path.join(root,'godot-arcana/art/export/reference');
async function buildFountain(){
 const src=await sharp(path.join(dir,'source/fountain.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=src.info.width,t=src.info.height,r=-1,b=-1;
 for(let y=0;y<src.info.height;y++)for(let x=0;x<src.info.width;x++)if(src.data[(y*src.info.width+x)*4+3]>=192){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 if(r<l)throw Error('Empty fountain source');
 const w=288,h=Math.round((b-t+1)*w/(r-l+1)),W=w+8,H=h+8;
 const base=await sharp(src.data,{raw:{width:src.info.width,height:src.info.height,channels:4}}).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(w,h,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).raw().toBuffer();
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const water=new Uint8Array(W*H);
 // Classify cyan water before palette mapping; cobalt orb is outside these regions.
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4,R=base[i],G=base[i+1],B=base[i+2];
  if(base[i+3]<192){base.fill(0,i,i+4);continue;}
  if(y>H*.385&&G>R*1.15&&B>R*1.12&&G>B*.78)water[y*W+x]=1;
  const k=(Math.round(G*31/255)*1024+Math.round(B*31/255)*32+Math.round(R*31/255))*3;
  base.set(lut.subarray(k,k+3),i);base[i+3]=255;
 }
 await sharp(base,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(out,'fountain-2d.png'));
 const ground=require('./fit-fountain-ground.cjs');
 const groundProjection=ground.measure(base,W,H);await ground.save(groundProjection);
 await fs.writeFile(path.join(dir,'registration.json'),JSON.stringify({size:[W,H],foot:groundProjection.foot,groundProjection,crop:[l,t,r-l+1,b-t+1],pixelsPerUnit:64},null,2)+'\n');
 return {base,water,W,H,lut};
}
module.exports=buildFountain;
// Production-only pixel animation: source art is preserved, only water-mask texels change.
async function animateFountain(asset){
 const {base,water,W,H,lut}=asset,frames=[],grid=4,count=16,fps=12;
 const streams=[{from:[86,158],control:[72,174],to:[73,223]},{from:[116,184],control:[100,213],to:[101,270]},{from:[209,158],control:[222,176],to:[221,223]},{from:[179,184],control:[192,216],to:[190,270]}];
 const curve=(s,t)=>[(1-t)**2*s.from[0]+2*(1-t)*t*s.control[0]+t*t*s.to[0],(1-t)**2*s.from[1]+2*(1-t)*t*s.control[1]+t*t*s.to[1]];
 const streamAt=new Int8Array(W*H).fill(-1),phaseAt=new Float32Array(W*H);
 for(let s=0;s<streams.length;s++)for(let step=0;step<=120;step++){
  const p=curve(streams[s],step/120);
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
   const x=Math.round(p[0])+dx,y=Math.round(p[1])+dy;if(x<0||x>=W||y<0||y>=H)continue;
   const j=y*W+x,i=j*4;
   if(base[i+3]&&base[i+1]>=base[i]&&base[i+2]>=base[i]*.94){water[j]=1;streamAt[j]=s;phaseAt[j]=step/120;}
  }
 }
 const toPalette=(rgb)=>{const k=(Math.round(rgb[1]*31/255)*1024+Math.round(rgb[2]*31/255)*32+Math.round(rgb[0]*31/255))*3;return lut.subarray(k,k+3);};
 const light=toPalette([156,219,211]),foam=toPalette([214,238,225]),dark=toPalette([51,144,158]);
 let animatedPixels=0;const changed=new Set();
 for(let f=0;f<count;f++){
  const dst=Buffer.from(base),phase=f/count;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const j=y*W+x;if(!water[j])continue;const i=j*4,s=streamAt[j];
   if(s>=0){
    // Downward travelling bright packets along each registered curved stream.
    const flow=((phaseAt[j]*5-phase*2+s*.23)%1+1)%1;
    const color=flow<.22?foam:flow<.52?light:dark;
    const edge=Math.sin(x*2.1+y*.7+s)>-.25;
    if(edge)dst.set(color,i);
   }else{
    // Pixel-sized surface advection; sample only water to protect rims and pedestal.
    const sx=x+Math.round(Math.sin((y/11+phase*2*Math.PI))),sy=y+Math.round(Math.cos(x/15+phase*2*Math.PI));
    if(sx>=0&&sx<W&&sy>=0&&sy<H&&water[sy*W+sx]&&streamAt[sy*W+sx]<0)base.copy(dst,i,(sy*W+sx)*4,(sy*W+sx)*4+3);
    for(let s=0;s<streams.length;s++){
     const c=streams[s].to,dx=x-c[0],dy=(y-c[1])*2.6,dist=Math.hypot(dx,dy);
     const ring=3+((phase+s*.19)%1)*24;
     if(dist>3&&dist<29&&Math.abs(dist-ring)<.8)dst.set(light,i);
     // Tiny splash flashes remain inside the existing water silhouette.
     if(dist<6&&((x*3+y+f+s*2)%7<2))dst.set(foam,i);
    }
   }
   if(!dst.subarray(i,i+3).equals(base.subarray(i,i+3)))changed.add(j);
  }
  frames.push(dst);
 }
 const atlas=Buffer.alloc(W*grid*H*grid*4);
 for(let f=0;f<count;f++)for(let y=0;y<H;y++)frames[f].copy(atlas,(((Math.floor(f/grid)*H+y)*W*grid)+(f%grid)*W)*4,y*W*4,(y+1)*W*4);
 await sharp(atlas,{raw:{width:W*grid,height:H*grid,channels:4}}).png().toFile(path.join(out,'fountain-water-atlas.png'));
 const mask=Buffer.alloc(W*H*4);for(let j=0;j<water.length;j++)if(water[j]){mask[j*4]=streamAt[j]>=0?255:0;mask[j*4+1]=streamAt[j]<0?255:0;mask[j*4+3]=255;}
 await sharp(mask,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(dir,'water-mask.png'));
 await sharp(Buffer.concat(frames),{raw:{width:W,height:H*count,channels:4,pageHeight:H}}).gif({loop:0,delay:Array(count).fill(Math.round(1000/fps)),effort:3}).toFile(path.join(dir,'water-animation.gif'));
 const registration=JSON.parse(await fs.readFile(path.join(dir,'registration.json'),'utf8'));
 const spec={...registration,atlasGrid:[grid,grid],frames:count,fps,animation:'Downward curved streams, pixel-advection surface ripples, expanding impact rings and splash highlights; immutable stone, metal, orb and alpha',streams,animatedPixels:changed.size,source:'source/fountain.png',approvedConcept:'approved-concept.png',camera:{yaw:0,pitch:45},collisionRadius:2.25,alpha:[0,255],status:'integrated-awaiting-in-game-review'};
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify(spec,null,2)+'\n');
 for(const name of ['fountain-2d','fountain-water-atlas']){
  const file=path.join(out,name+'.png.import');try{await fs.access(file);}catch{
   const sample=await fs.readFile(path.join(out,'oak.png.import'),'utf8');
   await fs.writeFile(file,sample.replace(/^uid=.*\r?\n/m,'').replaceAll(/oak\.png(?:-[a-f0-9]+)?/g,name+'.png'));
  }
 }
 return {'fountain':spec};
}
module.exports=async()=>animateFountain(await buildFountain());
if(require.main===module)module.exports().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
