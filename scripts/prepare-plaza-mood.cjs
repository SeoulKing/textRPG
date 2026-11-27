/* Prepare generated source art; native PixelPen masters own all final edits. */
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const base='art-studies/regions/arcana-city-center/source/plaza-mood-v1';
const native='godot-arcana/art/source/plaza-mood-v1';
const output='godot-arcana/art/export/regions/arcana-city-center/plaza-mood-v1';
const specs=[
 {id:'limestone',size:[512,512],material:true,foot:[0,0]},
 {id:'banner-lamp',size:[192,320],foot:[96,306],max:[176,288],footprint:[.55,.55],height:5.5,collision:[-4.4,-4.4,8.8,8.8]},
 {id:'flower-planter',size:[176,116],foot:[88,108],max:[160,94],footprint:[2.5,.75],height:1.25,collision:[-20,-8,40,8]},
 {id:'plaza-tree',size:[320,384],foot:[160,367],max:[304,356],footprint:[1,.9],height:6,collision:[-8,-7.2,16,10]}
];
const at=(x,y,w)=>(y*w+x)*4;
async function main(){
 for(const dir of [base+'/prepared',native,output])await fs.mkdir(path.join(root,dir),{recursive:true});
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const color=(r,g,b)=>{const i=(Math.round(g*31/255)*1024+Math.round(b*31/255)*32+Math.round(r*31/255))*3;return lut.subarray(i,i+3);};
 const jobs=[];
 for(const s of specs){
  const input=path.join(root,base,'generated',s.id+'.png');
  let pipeline=sharp(input).ensureAlpha();
  let region=null,placement=null,scale=1;
  if(!s.material){
   const {data,info}=await pipeline.raw().toBuffer({resolveWithObject:true});
   let l=info.width,t=info.height,r=-1,b=-1;
   for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[at(x,y,info.width)+3]>=128){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}
   if(r<l)throw Error('Empty source '+s.id);
   region={left:l,top:t,width:r-l+1,height:b-t+1};
   scale=Math.min(s.max[0]/region.width,s.max[1]/region.height);
   const w=Math.round(region.width*scale),h=Math.round(region.height*scale);
   placement={left:Math.round(s.foot[0]-w/2),top:s.foot[1]-h+1,width:w,height:h};
   const resized=await sharp(input).extract(region).resize(w,h,{kernel:'lanczos3'}).png().toBuffer();
   pipeline=sharp({create:{width:s.size[0],height:s.size[1],channels:4,background:'#00000000'}}).composite([{input:resized,left:placement.left,top:placement.top}]);
  }else pipeline=pipeline.resize(...s.size,{kernel:'lanczos3'});
  const pixels=await pipeline.ensureAlpha().raw().toBuffer();
  for(let i=0;i<pixels.length;i+=4){
   if(pixels[i+3]<160){pixels.fill(0,i,i+4);continue;}
   pixels.set(color(pixels[i],pixels[i+1],pixels[i+2]),i);pixels[i+3]=255;
  }
  const edits=[];
  // Only isolated moderate-contrast interior dots; preserve edges, highlights and leaf holes.
  for(let y=1;y<s.size[1]-1;y++)for(let x=1;x<s.size[0]-1;x++){
   const i=at(x,y,s.size[0]);if(!pixels[i+3])continue;
   const votes=new Map();let opaque=0;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){
    const k=at(x+dx,y+dy,s.size[0]);if(pixels[k+3]){opaque++;const c=pixels.subarray(k,k+3).toString('hex');votes.set(c,(votes.get(c)||0)+1);}
   }
   const previous=pixels.subarray(i,i+3).toString('hex');
   if(opaque!==8||votes.has(previous))continue;
   const [next,count]=[...votes].sort((a,b)=>b[1]-a[1])[0];
   if(count<5)continue;
   const c=Buffer.from(next,'hex'),d=Math.hypot(pixels[i]-c[0],pixels[i+1]-c[1],pixels[i+2]-c[2]);
   if(d>15&&d<68)edits.push({x,y,expected:previous,color:next});
  }
  const prepared=base+'/prepared/'+s.id+'.png';
  await sharp(pixels,{raw:{width:s.size[0],height:s.size[1],channels:4}}).png().toFile(path.join(root,prepared));
  jobs.push({...s,input:path.join(root,prepared).replaceAll('\\','/'),source:'res://art/source/plaza-mood-v1/'+s.id+'.pxpen',
    output:'res://art/export/regions/arcana-city-center/plaza-mood-v1/'+s.id+'.png',edits,region,placement,uniformScale:scale});
 }
 await fs.writeFile(path.join(root,base,'pixelpen-plan.json'),JSON.stringify({jobs},null,2)+'\n');
 console.log(JSON.stringify(jobs.map(j=>({id:j.id,size:j.size,corrections:j.edits.length,placement:j.placement}))));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
