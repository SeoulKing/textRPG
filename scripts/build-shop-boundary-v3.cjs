const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),base=path.join(root,'art-studies/regions/arcana-shop-interior'),src=path.join(base,'source/wall-layout-v3'),out=path.join(root,'godot-arcana/art/export/shop-interior');
async function main(){
 const file=path.join(src,'boundary-master.png');
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,t=info.height,r=-1,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>=192){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 if(r<l)throw Error('Boundary has no opaque pixels');
 const w=928,h=Math.round((b-t+1)*w/(r-l+1));
 const pixels=await sharp(data,{raw:info}).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(w,h,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}const j=(Math.round(pixels[i+1]*31/255)*1024+Math.round(pixels[i+2]*31/255)*32+Math.round(pixels[i]*31/255))*3;pixels.set(lut.subarray(j,j+3),i);pixels[i+3]=255;}
 await sharp(pixels,{raw:{width:w,height:h,channels:4}}).png().toFile(path.join(out,'room-boundary-v3.png'));
 const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
 manifest.assets['room-boundary-v3']={file:'res://art/export/shop-interior/room-boundary-v3.png',size:[w,h],foot:[464,h-28],source:'wall-layout-v3/boundary-master.png',crop:[l,t,r-l+1,b-t+1],sourcePixelsPerUnit:64,footprintCells:[14,9],role:'continuous-low-room-boundary',registration:{point:[12,12.5],entranceCells:2,outerArtMayOverhang:true}};
 const layout=JSON.parse(await fs.readFile(path.join(src,'layout.json'),'utf8'));
 const scenePath=path.join(root,'godot-arcana/scripts/shop_interior.gd');
 const scene=await fs.readFile(scenePath,'utf8');
 const block='const LAYOUT = '+JSON.stringify(layout,null,'\t')+'\n';
 if(!/const LAYOUT = \[[\s\S]*?\n\]\n/.test(scene))throw Error('Grid layout block changed; preserve scene edits');
 await fs.writeFile(scenePath,scene.replace(/const LAYOUT = \[[\s\S]*?\n\]\n/,block));
 manifest.room.version=3;manifest.room.grid={worldUnits:1,logicPixels:16,sourcePixels:64,groundDepthProjectedPixels:64/Math.sqrt(2),defaultPlacementStep:.5,footprintAnchor:'front-center',gridVisible:false};
 manifest.room.layout=layout;
 for(const p of layout)if(!p.shared)Object.assign(manifest.assets[p.asset],{footprintCells:[p.w,p.d],footprintAnchor:'front-center'});
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(base,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({boundary:[w,h],foot:[464,h-28],grid:manifest.room.grid}));
}
main().catch(e=>{console.error(e);process.exit(1)});
