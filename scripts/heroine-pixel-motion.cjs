/* Pixel-rig authoring. Shared body geometry is also used for its occlusion masks.
 * Planted feet cancel root travel; knees use a piecewise affine mesh, not an
 * iterative inverse stretch. Crisp nearest samples preserve palette/binary alpha.
 */
module.exports=function createAnimator(W,H,FOOT,walkFrames,config={}){
 const at=(x,y)=>(y*W+x)*4,blank=()=>Buffer.alloc(W*H*4);
 const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>v*v*(3-2*v);
 const A=config.footTravelPixels??24,stance=config.stanceFraction??.6;
 const pitch=config.pitchSine??Math.SQRT1_2,lift=config.liftPixels??5;
 const arm=config.armSwingPixels??2.2,lag=(config.clothLagCycles??.08)*Math.PI*2;
 function foot(d,phase,leg){
   const u=((phase+(leg<0?.5:0))%1+1)%1;
   let travel,elevation=0;
   if(u<stance)travel=A*(1-2*u/stance);
   else{
     const t=(u-stance)/(1-stance),m=-2*A*(1-stance)/stance;
     // Hermite swing matches stance velocity at toe-off and heel strike.
     travel=(-A)*(2*t*t*t-3*t*t+1)+A*(-2*t*t*t+3*t*t)+m*(2*t*t*t-3*t*t+t);
     elevation=lift*Math.sin(Math.PI*t);
   }
   const theta=d*Math.PI/4;
   return {x:Math.sin(theta)*travel,y:Math.cos(theta)*pitch*travel-elevation,travel,lift:elevation,depth:Math.cos(theta)*travel,contact:u<stance};
 }
 function triangle(out,src,p,q){
   const [a,b,c]=p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<.001)return;
   const x0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0])))),x1=Math.min(W-1,Math.ceil(Math.max(...p.map(v=>v[0]))));
   const y0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),y1=Math.min(H-1,Math.ceil(Math.max(...p.map(v=>v[1]))));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
     const xx=x+.5,yy=y+.5,u=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den,v=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den,w=1-u-v;
     if(u<-.00001||v<-.00001||w<-.00001)continue;
     const sx=Math.floor(u*q[0][0]+v*q[1][0]+w*q[2][0]),sy=Math.floor(u*q[0][1]+v*q[1][1]+w*q[2][1]);
     if(sx<0||sx>=W||sy<0||sy>=H)continue;const i=at(sx,sy);if(src[i+3])src.copy(out,at(x,y),i,i+4);
   }
 }
 function bodyLegs(out,src,feet,direction){
   const profile=direction===2||direction===6;
   for(const leg of [-1,1].sort((a,b)=>feet[a].depth-feet[b].depth)){
     const f=feet[leg],x0=0,x1=W;
     const limb=Buffer.from(config.parts['body/'+direction+'/'+leg]);
     if(!src.subarray(101*W*4).some((v,i)=>i%4===3&&v))limb.fill(0,101*W*4);
     const rows=[87,94,101,H],weights=[0,.45,1,1];
     const rear=0;
     const points=rows.map((y,i)=>[(f.x+rear)*weights[i],y+f.y*weights[i]-(i===1?f.lift*.25:0)]);
     for(let i=0;i<3;i++){
       const a=[x0+points[i][0],points[i][1]],b=[x1+points[i][0],points[i][1]],c=[x1+points[i+1][0],points[i+1][1]],d=[x0+points[i+1][0],points[i+1][1]];
       const ua=[x0,rows[i]],ub=[x1,rows[i]],uc=[x1,rows[i+1]],ud=[x0,rows[i+1]];
       triangle(out,limb,[a,b,c],[ua,ub,uc]);triangle(out,limb,[a,c,d],[ua,uc,ud]);
     }
   }
 }
 return function animate(src,d,clip,f,id){
   const shoe=id.startsWith('boots');
   if(clip==='idle'&&!shoe&&id!=='body'){
     const out=blank();for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sy=y+(y<75&&f===2?1:0);if(sy<H&&src[at(x,sy)+3])src.copy(out,at(x,y),at(x,sy),at(x,sy)+4);}return out;
   }
   const stopping=clip.startsWith('stop'),settle=clip==='idle'?0:stopping?1-smooth(f/3):1;
   const phase=stopping?(clip==='stop_left'?stance/2:stance/2+.5):f/walkFrames,angle=phase*Math.PI*2;
   const feet={'-1':foot(d,phase,-1),'1':foot(d,phase,1)};
   for(const v of Object.values(feet)){v.x*=settle;v.y*=settle;v.travel*=settle;v.lift*=settle;}
   const out=blank(),bob=-(1-Math.cos(angle*2))*.5*settle,profile=d===2||d===6;
   if(id.startsWith('boots')){
     for(const leg of [-1,1].sort((a,b)=>feet[a].depth-feet[b].depth)){
       const part=config.parts[id+'/'+d+'/'+leg];if(!part)throw Error('Missing complete shoe '+id+'/'+d+'/'+leg);
       const v=feet[leg],tilt=v.contact?Math.max(0,v.travel/A-.65)*.25:Math.sin(phase*Math.PI*2)*.10;
       for(let y=0;y<H;y++)for(let x=0;x<W;x++){
         const i=at(x,y);if(!part[i+3])continue;
         const xx=Math.round(x+v.x),yy=Math.round(y+v.y+(x-48)*tilt);
         if(xx>=0&&xx<W&&yy>=0&&yy<H)part.copy(out,at(xx,yy),i,i+4);
       }
     }
     return out;
   }
   const body=id==='body'||id.endsWith('-mask'),theta=d*Math.PI/4;
   function field(x,y){
     if(y>53&&y<78&&Math.abs(x-FOOT[0])>18&&['body','dress','blouse'].includes(body?'body':id)){
       const leg=x<FOOT[0]?-1:1,w=clamp((y-53)/22),opposite=-feet[leg].travel/A;
       return [Math.sin(theta)*opposite*arm*w,Math.cos(theta)*pitch*opposite*arm*w+bob];
     }
     if(y>=63&&!body&&['dress','skirt'].includes(id))return [Math.sin(angle-lag)*clamp((y-62)/32)*1.8*settle,y<77?bob:0];
     const sway=Math.sin(angle)*.8*settle;
     return [id==='hair'?Math.sin(angle-lag*.7)*.5*settle:y<43?0:y<63?-sway*.5:sway,y<43?bob*.35:y<87?bob:0];
   }
   for(let y=0;y<(body?87:H);y++)for(let x=0;x<W;x++){
     let sx=x,sy=y;for(let k=0;k<4;k++){const [dx,dy]=field(sx,sy);sx=x-dx;sy=y-dy;}
     sx=Math.round(sx);sy=Math.round(sy);if(sx>=0&&sx<W&&sy>=0&&sy<H&&src[at(sx,sy)+3])src.copy(out,at(x,y),at(sx,sy),at(sx,sy)+4);
   }
   if(body)bodyLegs(out,src,feet,d);
   return out;
 };
};
