// Inn auxiliary data is authored from furniture surfaces, never inferred from brightness.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.join(root,'godot-arcana/art/export/inn-lobby');
const S=Math.SQRT1_2;
// All boxes are normalized sprite coordinates. R=height/16, GB=normal XY.
const definitions={
 'corner-sofa':{height:1.65,surfaces:[
  {box:[.31,.31,.61,.19],height:.80,normal:[0,.98]},
  {box:[.10,.46,.22,.20],height:.80,normal:[0,.98]},
  {box:[.02,.22,.07,.68],normal:[0,.14]},
  {box:[.92,.22,.06,.42],normal:[0,.14]}]},
 'sofa':{height:1.5,surfaces:[{box:[.17,.47,.66,.20],height:.74,normal:[0,.97]}]},
 'counter':{height:3.2,surfaces:[
  {box:[.04,.32,.92,.17],height:1.60,normal:[0,.99]},
  {box:[.03,.50,.10,.42],normal:[-.68,.06]},
  {box:[.88,.50,.09,.42],normal:[.68,.06]}],light:[.14,.22,4.3,2.5,'ffd391']},
 'tea-table':{height:.72,surfaces:[{box:[.04,.20,.92,.38],height:.72,normal:[0,.995]}]},
 'lamp-table':{height:1.9,surfaces:[{box:[.08,.52,.84,.16],height:.85,normal:[0,.99]}],light:[.53,.21,5.0,2.6,'ffd595']},
 'lantern':{height:1.05,light:[.5,.48,3.5,1.7,'ffd08b']},
 'fireplace':{height:4.6,surfaces:[
  {box:[.03,.30,.94,.06],height:3.2,normal:[0,.99]},
  {box:[.03,.87,.94,.07],height:.20,normal:[0,.99]},
  {box:[.03,.36,.12,.50],normal:[-.72,.05]},
  {box:[.84,.36,.12,.50],normal:[.72,.05]}],light:[.50,.72,5.0,3.3,'ffae58']},
 'bookcase':{height:5.4,surfaces:[
  {box:[.08,.265,.85,.025],height:3.72,normal:[0,.99]},
  {box:[.08,.465,.85,.025],height:2.60,normal:[0,.99]},
  {box:[.08,.655,.85,.025],height:1.54,normal:[0,.99]},
  {box:[.02,.08,.07,.86],normal:[-.6,.08]},
  {box:[.91,.08,.07,.86],normal:[.6,.08]}]},
 'storage-bench':{height:1.45,surfaces:[{box:[.09,.39,.82,.23],height:.83,normal:[0,.98]}]},
 'luggage':{height:1.65,surfaces:[{box:[.06,.63,.72,.08],height:.62,normal:[0,.98]},{box:[.12,.28,.60,.08],height:1.15,normal:[0,.98]}]},
 'stairs':{height:3.5,stairs:true},
 'wall':{height:5.0},'keys':{height:2.6},
 'armchair':{height:1.7,surfaces:[{box:[.2,.48,.6,.18],height:.8,normal:[0,.98]}]},
 'plant':{height:1.8,round:true},
};
async function build(){
 const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
 const sourceImport=await fs.readFile(path.join(root,'godot-arcana/art/export/reference/academy-spatial.png.import'),'utf8');
 for(const [id,def] of Object.entries(definitions)){
  const spec=manifest.assets[id];if(!spec)continue;
  const [w,h]=spec.size,foot=spec.foot;
  const color=await sharp(path.join(out,id+'.png')).ensureAlpha().raw().toBuffer();
  const map=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const u=(x+.5)/w,v=(y+.5)/h,up=(foot[1]-y-.5)/64;
   let height=Math.max(0,Math.min(def.height,up/S)),nx=0,ny=.06;
   if(def.round){nx=(u-.5)*1.3;ny=Math.max(.08,(.5-v)*.9);}
   for(const face of def.surfaces||[]){const [bx,by,bw,bh]=face.box;if(u>=bx&&u<bx+bw&&v>=by&&v<by+bh){height=face.height??height;[nx,ny]=face.normal;}}
   if(def.stairs&&v>.22&&v<.92&&u>.22&&u<.78){
    const step=(v-.22)/.70*10,index=Math.floor(step),phase=step-index;
    height=(10-index)*.28;
    ny=phase<.56?.995:.04;
    if(phase>=.56)height-=((phase-.56)/.44)*.28;
   }
   const i=(y*w+x)*4;
   // Alpha is an emissive-source mask, not opacity: only actual flame/bulb glass.
   let emission=0;
   if(def.light){const [lx,ly]=def.light;const dx=(u-lx)*w,dy=(v-ly)*h;
    const within=(dx*dx/Math.pow(id==='fireplace'?w*.14:w*.18,2)+dy*dy/Math.pow(id==='fireplace'?h*.09:h*.13,2))<1;
    if(within&&color[i]>color[i+2]*1.5&&color[i+1]>color[i+2]*1.2)emission=255;
   }
   map.set([Math.round(height/16*255),Math.round((nx*.5+.5)*255),Math.round((ny*.5+.5)*255),emission],i);
  }
  const file=id+'-spatial.png';
  await sharp(map,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(out,file));
  const resource='res://art/export/inn-lobby/'+file;
  const hash=crypto.createHash('md5').update(resource).digest('hex');
  const imported='res://.godot/imported/'+file+'-'+hash+'.ctex';
  const config=sourceImport.replace(/^uid=.*\r?\n/m,'').replace(/path="[^\"]+"/,'path="'+imported+'"').replace(/source_file="[^\"]+"/,'source_file="'+resource+'"').replace(/dest_files=\[[^\]]+\]/,'dest_files=["'+imported+'"]');
  await fs.writeFile(path.join(out,file+'.import'),config);
  spec.spatialMap=resource;spec.surfaceProfile=def;
  if(def.light){const [u,v,range,strength,tint]=def.light;const x=Math.floor(u*w),y=Math.floor(v*h);const height=map[(y*w+x)*4]/255*16;
   const up=(foot[1]-y-.5)/64,depth=(height*S-up)/S;
   spec.light={offset:[(x+.5-foot[0])/64,height,depth],range,strength,color:tint};
  }
 }
 manifest.lighting={channels:{r:'height / 16',g:'normal X * .5 + .5',b:'normal Y * .5 + .5',a:'authored flame/bulb emission mask'},method:'authored surface regions, no luminance-to-height',normalSpace:'sprite right / up / forward'};
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(root,'art-studies/inn-lobby/asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Authored '+Object.keys(definitions).length+' inn surface maps and bulb/flame coordinates');
}
module.exports=build;if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
