const fs=require('fs'),path=require('path'),sharp=require('sharp'),assert=require('assert');
(async()=>{
 const root=path.resolve(__dirname,'..'),source=path.join(root,'godot-arcana/art/source/heroine'),qa=path.join(root,'godot-arcana/art/reference/natural-walk');
 const audit=JSON.parse(fs.readFileSync(path.join(qa,'native-rig-audit.json'))),dirs=['s','se','e','ne','n','nw','w','sw'];let checked=0,minRatio=1;
 for(const kind of ['boots-taupe','boots-navy']){
  const atlas=await sharp(path.join(source,'skeletal/bake/hero-'+kind+'.png')).ensureAlpha().raw().toBuffer();
  for(let d=0;d<8;d++){
   const parts=await Promise.all(['left','right'].map(side=>sharp(path.join(source,'parts',kind+'-'+dirs[d]+'-'+side+'.png')).ensureAlpha().raw().toBuffer()));
   for(let f=0;f<24;f++){
    const key=d+'/'+f,delta=audit.foot_positions[key],angle=audit.foot_angles[key],expected=new Set();
    for(let leg=0;leg<2;leg++)for(let y=0;y<136;y++)for(let x=0;x<96;x++)if(parts[leg][(y*96+x)*4+3]){
     const cx=leg===0?44:53,cy=102,c=Math.cos(angle[leg]),s=Math.sin(angle[leg]);
     const xx=Math.round(cx+delta[leg][0]+(x-cx)*c-(y-cy)*s),yy=Math.round(cy+delta[leg][1]+(x-cx)*s+(y-cy)*c);
     if(xx>=0&&xx<96&&yy>=0&&yy<136)expected.add(xx+','+yy);
    }
    const i=d*36+4+f,bx=i%16*96,by=Math.floor(i/16)*136;let area=0;
    for(let y=0;y<136;y++)for(let x=0;x<96;x++)if(atlas[((by+y)*1536+bx+x)*4+3])area++;
    const ratio=area/expected.size;minRatio=Math.min(minRatio,ratio);assert(ratio>=.90,kind+'/'+key+' lost native shoe area: '+ratio);checked++;
   }
  }
 }
 fs.writeFileSync(path.join(qa,'individual-shoes.json'),JSON.stringify({pipeline:'native Skeleton2D GPU output vs authored feet transformed by actual Bone2D poses',checks:checked,minimumAreaRatio:minRatio,wholeShoes:true},null,2)+'\n');console.log(JSON.stringify({nativeShoeFrames:checked,minimumAreaRatio:minRatio}));
})().catch(e=>{console.error(e);process.exitCode=1});
