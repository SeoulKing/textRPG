// Numerical auxiliary map authoring, not a luminance-to-height conversion.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const W=1280,H=1152,FOOT=[640,1088],S=Math.SQRT1_2;
async function build(){
 const buffer=Buffer.alloc(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const up=(FOOT[1]-y-.5)/64;
   let depth=0,nx=0,ny=.08;
   // Authored roof zones: recession and upward-facing normal, not color brightness.
   if(y>=690&&y<=835&&((x>=150&&x<=415)||(x>=875&&x<=1120))){depth=-2*(835-y)/145;ny=.72;}
   for(const cx of [452,829]){
     const dx=(x-cx)/75;
     if(Math.abs(dx)<1&&y>=490&&y<1050){nx=dx*.6;if(y<675)ny=.48;}
   }
   if(x>925&&x<1185&&y>490&&y<730){nx=(x-1055)/150;ny=Math.max(.15,(730-y)/270);}
   const height=Math.max(0,Math.min(16,up/S+depth));
   const i=(y*W+x)*4;
   buffer.set([Math.round(height/16*255),Math.round((nx*.5+.5)*255),Math.round((ny*.5+.5)*255),255],i);
 }
 await sharp(buffer,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(root,'godot-arcana/art/export/reference/academy-spatial.png'));
 const lamps=[[546,965],[737,965]],windows=[[452,995],[829,995],[452,885],[829,885]];
 const lights=[...lamps.map(p=>({pixel:p,range:4.0,strength:2.4,kind:'lamp'})),...windows.map(p=>({pixel:p,range:3.5,strength:1.6,kind:'window'}))];
 const spec={version:1,source:'assets-v3/academy-source.png',size:[W,H],foot:FOOT,pixelsPerUnit:64,heightRange:16,channels:{r:'height / 16',g:'normal X * .5 + .5',b:'normal Y * .5 + .5'},method:'authored facade/roof/tower zones; approximate, no shadow map',lights};
 await fs.writeFile(path.join(root,'art-studies/magic-school/assets-v3/lighting.json'),JSON.stringify(spec,null,2)+'\n');
 await fs.writeFile(path.join(root,'godot-arcana/art/export/reference/academy-lights.json'),JSON.stringify(spec,null,2)+'\n');
 // Explicit data texture import: no sRGB conversion, lossy compression or mipmaps.
 const original=await fs.readFile(path.join(root,'godot-arcana/art/export/reference/academy-2d.png.import'),'utf8');
 let imported;
 try { imported=await fs.readFile(path.join(root,'godot-arcana/art/export/reference/academy-spatial.png.import'),'utf8'); }
 catch {
   const hash=require('node:crypto').createHash('md5').update('res://art/export/reference/academy-spatial.png').digest('hex');
   imported=original.replace(/^uid=.*\r?\n/m,'').replace(/academy-2d\.png/g,'academy-spatial.png').replace(/academy-spatial\.png-[a-f0-9]+/g,'academy-spatial.png-'+hash);
 }
 imported=imported.replace(/process\/fix_alpha_border=true/,'process/fix_alpha_border=false');
 await fs.writeFile(path.join(root,'godot-arcana/art/export/reference/academy-spatial.png.import'),imported);
 console.log('School spatial map and 6 authored light sources ready');
}
module.exports=build;if(require.main===module)build().catch(e=>{console.error(e);process.exitCode=1;});
