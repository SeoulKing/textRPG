const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function measure(data,W,H){
 // Fit the lower ground-contact silhouette, excluding the elevated water/rim.
 const cx=W/2,a=144;let n=0,su=0,sy=0,suu=0,suy=0;const points=[];
 for(let x=10;x<W-10;x++){
  let y=-1;for(let py=Math.floor(H*.52);py<H;py++)if(data[(py*W+x)*4+3]>=192)y=py;
  if(y<0)continue;
  const u=Math.sqrt(Math.max(0,1-((x+.5-cx)/a)**2));
  n++;su+=u;sy+=y+.5;suu+=u*u;suy+=u*(y+.5);points.push([u,y+.5]);
 }
 const b=(n*suy-su*sy)/(n*suu-su*su),cy=(sy-b*su)/n,foot=[cx,Math.round(cy)];
 const rms=Math.sqrt(points.reduce((sum,[u,y])=>sum+(y-cy-b*u)**2,0)/n);
 return {foot,baseEllipse:{center:[cx,cy],radii:[a,b],ratio:b/a,rmsPixels:rms,samples:n},cameraPitch:45,worldCanvas:[8.5,8.5*(b/a)/Math.SQRT1_2],method:'Least-squares lower alpha silhouette with fixed existing 144px basin radius; water/rim height excluded'};
}
async function save(spec){
 await fs.writeFile(path.join(root,'art-studies/fountain/ground-registration.json'),JSON.stringify(spec,null,2)+'\n');
 const code='# Generated from fountain-2d.png ground-contact silhouette.\nextends RefCounted\nconst FOOT = Vector2('+spec.foot.join(',')+')\nconst BASIN_RATIO = '+spec.baseEllipse.ratio.toFixed(12)+'\n';
 await fs.writeFile(path.join(root,'godot-arcana/art/resources/fountain_ground.generated.gd'),code);
}
module.exports={measure,save};
if(require.main===module)(async()=>{
 const sharp=require('sharp'),{data,info}=await sharp(path.join(root,'godot-arcana/art/export/reference/fountain-2d.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const spec=measure(data,info.width,info.height);await save(spec);
 for(const file of ['registration.json','manifest.json']){const p=path.join(root,'art-studies/fountain',file),meta=JSON.parse(await fs.readFile(p,'utf8'));meta.foot=spec.foot;meta.groundProjection=spec;await fs.writeFile(p,JSON.stringify(meta,null,2)+'\n');}
 console.log(JSON.stringify(spec));
})().catch(e=>{console.error(e);process.exitCode=1;});
