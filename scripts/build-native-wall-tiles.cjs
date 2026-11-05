// Native wall v4: one exact height-field builds top/face art and all joins.
// Shared geometry.json is also consumed by Godot's TileSet/physics author.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const ROOT=path.resolve(__dirname,'..');
const DIR=path.join(ROOT,'godot-arcana/art/source/walls/native-v4');
const G={cell:64,height:192,bodyHeight:176,core:12,textureOrigin:[0,96],merlonHeight:16,merlonDepth:4,merlonPeriod:32,merlonWidth:14};
const C=G.cell,H=G.height,IH=C+H,L=(C-G.core)/2,R=L+G.core;
let skin;
const rgb=(hex)=>hex.match(/../g).map(c=>parseInt(c,16));
const ink=rgb('977555'),highlight=rgb('f4d59a'),walk=rgb('bfa078');
function tone(c,a){return c.map(v=>Math.max(0,Math.min(255,Math.round(v+a))));}
function inside(mask,x,y){
 if(x<0)return !!(mask&4)&&y>=L&&y<R;
 if(x>=C)return !!(mask&1)&&y>=L&&y<R;
 if(y<0)return !!(mask&8)&&x>=L&&x<R;
 if(y>=C)return !!(mask&2)&&x>=L&&x<R;
 return (x>=L&&x<R&&y>=L&&y<R)||((mask&1)&&x>=R&&y>=L&&y<R)||((mask&2)&&y>=R&&x>=L&&x<R)||((mask&4)&&x<L&&y>=L&&y<R)||((mask&8)&&y<L&&x>=L&&x<R);
}
function level(mask,x,y){
 if(!inside(mask,x,y))return 0;
 const xx=(x+C)%C,yy=(y+C)%C;
 // Merlons follow exposed parapet edges, never the broad cell outline.
 const south=!inside(mask,x,y+(R-yy))&&yy>=R-G.merlonDepth&&yy<R;
 const east=!inside(mask,x+(R-xx),y)&&xx>=R-G.merlonDepth&&xx<R;
 const horizontal=(xx%G.merlonPeriod)<G.merlonWidth;
 const vertical=(yy%G.merlonPeriod)<G.merlonWidth;
 return G.bodyHeight+((south&&horizontal)||(east&&vertical)?G.merlonHeight:0);
}
function stone(x,z){
 const i=(((H-z+128)%128)*128+(x%64))*3;
 return [skin[i],skin[i+1],skin[i+2]];
}
function tile(mask){
 const out=Buffer.alloc(C*IH*4);
 const put=(x,y,c)=>{if(y<0||y>=IH)return;const i=(y*C+x)*4;out[i]=c[0];out[i+1]=c[1];out[i+2]=c[2];out[i+3]=255;};
 for(let y=0;y<C;y++)for(let x=0;x<C;x++){
  const h=level(mask,x,y);if(!h)continue;
  const next=level(mask,x,y+1);
  // Only actual south-facing exposed vertical surfaces are drawn. Connected
  // north/south cells share their top; they do not stack full facade sprites.
  if(h>next)for(let z=next;z<h;z++){
   let c=stone(x,z);
   if(z>=G.bodyHeight)c=tone(c,-10);
   if(z===h-1)c=highlight;
   if(z===0||z===1)c=tone(c,-20);
   put(x,H+y-z,c);
  }
  let top=tone(stone(x,(x+y)%128),-30);
  const edge=!inside(mask,x-1,y)||!inside(mask,x+1,y)||!inside(mask,x,y-1)||!inside(mask,x,y+1);
  if(edge)top=tone(walk,20);
  else if(y%8===7||(x+(Math.floor(y/8)%2)*8)%16===15)top=tone(walk,-6);
  if(h>G.bodyHeight)top=highlight;
  put(x,H+y-h,top);
 }
 return out;
}
async function main(){
 await fs.mkdir(DIR,{recursive:true});
 await fs.writeFile(path.join(DIR,'geometry.json'),JSON.stringify(G,null,2)+'\n');
 skin=await sharp(path.join(DIR,'sandstone-source.png')).resize(128,128,{kernel:'nearest'}).removeAlpha().raw().toBuffer();
 // Shared periodic material seam, separate from geometry borders.
 for(let y=0;y<128;y++)for(let k=0;k<3;k++){
  const m=Math.round((skin[(y*128)*3+k]+skin[(y*128+63)*3+k])/2);
  skin[(y*128)*3+k]=m;skin[(y*128+63)*3+k]=m;
 }
 const tiles=Array.from({length:16},(_,m)=>tile(m));
 const atlas=Buffer.alloc(C*4*IH*4*4);
 for(let m=0;m<16;m++)for(let y=0;y<IH;y++)tiles[m].copy(atlas,((Math.floor(m/4)*IH+y)*C*4+(m%4)*C)*4,y*C*4,(y+1)*C*4);
 await sharp(atlas,{raw:{width:C*4,height:IH*4,channels:4}}).png({palette:true,colours:128,dither:0}).toFile(path.join(DIR,'wall-atlas-prepared.png'));
 // The final PNG is always exported from its PixelPen master by the author step.
 console.log('Prepared wall v4: core12px, body176px +16px merlons, all16joins, no facade frame');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

