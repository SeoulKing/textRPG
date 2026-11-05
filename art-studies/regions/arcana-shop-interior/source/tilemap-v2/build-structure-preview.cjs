const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const OUT = __dirname;
const P = 64, S = Math.SQRT1_2;
const project = (x, y, z) => [Math.round(x*P), Math.round((z-y)*P*S)];
const rect = (x,y,w,h,color) => '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+color+'"/>';
const poly = (pts,color) => '<polygon points="'+pts.map(p=>p.join(',')).join(' ')+'" fill="'+color+'"/>';
const F = {ink:'#343647',cream:'#e7d4ac',light:'#fff0c6',shade:'#b49a77',gold:'#c69a46',goldLight:'#edd18b',oak:'#8d6847',oakLight:'#a47b51',navy:'#343b5b'};
function wall(x, base, width=128) {
 const h = -project(0,3.5,0)[1];
 let a = rect(x,base-h-11,width,11,F.cream)+rect(x,base-h-11,width,1,F.light);
 a += rect(x,base-h,width,h,F.cream);
 for(const [off,hh,col] of [[0,3,F.shade],[3,3,F.goldLight],[6,2,F.gold],[8,3,F.light],[11,2,F.shade],[13,1,F.gold]]) a += rect(x,base-h+off,width,hh,col);
 a += rect(x,base-42,width,42,F.navy)+rect(x,base-44,width,2,F.gold)+rect(x,base-41,width,2,F.oakLight);
 for(let px=0;px<width;px+=64) {
  a += rect(x+px+5,base-35,54,25,F.gold)+rect(x+px+6,base-34,52,23,F.ink)+rect(x+px+8,base-32,48,19,F.oak);
  a += rect(x+px+8,base-32,48,1,F.oakLight);
 }
 a += rect(x,base-7,width,4,F.navy)+rect(x,base-3,width,2,F.gold)+rect(x,base-1,width,1,F.ink);
 return a;
}
function floor(x,back,w,d) {
 const hh=project(0,0,d)[1], ww=w*P;
 let a=rect(x,back,ww,hh,F.oak);
 const c=['#98734e','#a17a52','#946c49','#9b7550'];
 for(let row=0;row<d*4;row++){
  const y0=project(0,0,row*.25)[1],y1=project(0,0,(row+1)*.25)[1];
  a+=rect(x,back+y0,ww,y1-y0,c[row%4]);
  a+=rect(x,back+y1-1,ww,1,'#806044');
  for(let col=-1;col<w/2+1;col++){
   const xx=col*128+(row%2)*64;
   if(xx>0 && xx<ww) a+=rect(x+xx,back+y0,1,y1-y0,'#876347');
  }
 }
 return a;
}
function front(x,frontZ,width) {
 const top=frontZ-project(0,.5,0)[1]*-1;
 return rect(x,top-11,width,11,F.cream)+rect(x,top-11,width,1,F.light)+rect(x,top-1,width,2,F.gold)+rect(x,top+1,width,21,F.navy)+rect(x,top+3,width,1,F.oakLight)+rect(x,frontZ-2,width,2,F.ink);
}
function room() {
 const x=160, back=458, ww=640, depth=project(0,0,5)[1], frontY=back+depth, t=16;
 let a=floor(x,back,10,5);
 a+=wall(x,back,ww);
 const topBack=back-project(0,.5,0)[1]*-1, topFront=frontY-project(0,.5,0)[1]*-1;
 for(const xx of [x,x+ww-t]){
  a+=rect(xx,topBack,t,topFront-topBack,F.cream)+rect(xx,topBack,2,topFront-topBack,F.light)+rect(xx+t-2,topBack,2,topFront-topBack,F.gold);
 }
 a+=front(x,frontY,256)+front(x+384,frontY,256);
 a+=rect(x+256,frontY-11,128,11,F.cream)+rect(x+256,frontY-11,128,1,F.light)+rect(x+256,frontY-1,128,2,F.gold);
 // Rectangular corner/cap pieces use the same exact shared coordinates.
 for(const xx of [x,x+240,x+384,x+ww-t]) a+=rect(xx,topFront-11,t,11,F.cream)+rect(xx,topFront-11,t,1,F.light)+rect(xx,topFront,t,2,F.gold);
 return a;
}
(async()=>{
 const shape = wall(48,228)+wall(256,228,384)+floor(736,88,2,2)+front(736,228,128)+room();
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720" shape-rendering="crispEdges"><rect width="960" height="720" fill="#151b27"/>'+shape+'</svg>';
 await fs.mkdir(OUT,{recursive:true});
 await fs.writeFile(path.join(OUT,'structure-guide.svg'),svg);
 await sharp(Buffer.from(svg)).resize(1920,1440,{kernel:'nearest'}).png().toFile(path.join(OUT,'structure-guide.png'));
 await fs.writeFile(path.join(OUT,'structure-spec.json'),JSON.stringify({status:'approval geometry guide, not runtime art',pixelsPerUnit:64,camera:{yaw:0,pitch:45},gridStep:.5,wall:{width:2,height:3.5,thickness:.25},lowWall:{height:.5,thickness:.25},floor:{width:2,depth:2},assembly:{width:10,depth:5},projection:'u=round(X*64), v=round((Z-Y)*64/sqrt(2))',notes:['Structure silhouette is code-authored; style reference must not replace geometric coordinates.','This compact assembly demonstrates joints; final shop retains its existing 14x9 floor.']},null,2)+'\n');
 console.log('Geometry guide: '+path.join(OUT,'structure-guide.png'));
})().catch(error=>{console.error(error);process.exitCode=1;});
