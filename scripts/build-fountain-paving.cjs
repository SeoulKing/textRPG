const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'art-studies/fountain-paving'),out=path.join(root,'godot-arcana/art/export/fountain-paving');
async function main(){
 await fs.mkdir(out,{recursive:true});
 const ground=JSON.parse(await fs.readFile(path.join(root,'art-studies/fountain/ground-registration.json'),'utf8'));
 const {data,info}=await sharp(path.join(dir,'source/mosaic-ring.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // Derive a square registration from the generated ring, ignoring isolated alpha dust.
 let left=info.width,right=0,top=info.height,bottom=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const i=(y*info.width+x)*4;if(data[i+3]<224)continue;
  if(x<2||y<2||x>=info.width-2||y>=info.height-2)continue;
  let neighbors=0;for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])if(data[((y+dy)*info.width+x+dx)*4+3]>=224)neighbors++;
  if(neighbors<3)continue;
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 const cx=(left+right+1)/2,cy=(top+bottom+1)/2,side=Math.max(right-left+1,bottom-top+1);
 const crop={left:Math.round(cx-side/2),top:Math.round(cy-side/2),width:side,height:side};
 const W=544,H=544,diameter=536;
 const pixels=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(crop).resize(diameter,diameter,{kernel:'nearest'}).extend({left:4,right:4,top:4,bottom:4,background:'#00000000'}).raw().toBuffer();
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const colors=new Set();let opaque=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4,rad=Math.hypot(x+.5-W/2,y+.5-H/2);
  if(pixels[i+3]<192||rad>268||rad<143){pixels.fill(0,i,i+4);continue;}
  const index=(Math.round(pixels[i+1]*31/255)*1024+Math.round(pixels[i+2]*31/255)*32+Math.round(pixels[i]*31/255))*3;
  pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;opaque++;colors.add(pixels.subarray(i,i+3).toString('hex'));
 }
 await sharp(pixels,{raw:{width:W,height:H,channels:4}}).png().toFile(path.join(out,'mosaic-ring.png'));
 // Copy existing lossless nearest-world import policy, with a unique destination.
 const imp=path.join(out,'mosaic-ring.png.import');
 try{await fs.access(imp);}catch{
  let text=await fs.readFile(path.join(root,'godot-arcana/art/export/reference/oak.png.import'),'utf8');
  text=text.replace(/^uid=.*\r?\n/m,'').replace(/path="res:\/\/\.godot\/imported\/[^\"]+"/,'path="res://.godot/imported/mosaic-ring.png.ctex"').replace(/source_file="[^\"]+"/,'source_file="res://art/export/fountain-paving/mosaic-ring.png"').replace(/dest_files=\[[^\]]+\]/,'dest_files=["res://.godot/imported/mosaic-ring.png.ctex"]').replace(/detect_3d\/compress_to=\d+/,'detect_3d/compress_to=0').replace(/mipmaps\/generate=true/,'mipmaps/generate=false').replace(/compress\/mode=\d+/,'compress/mode=0');
  await fs.writeFile(imp,text);
 }
 await fs.writeFile(path.join(dir,'manifest.json'),JSON.stringify({source:'source/mosaic-ring.png',sourceCrop:crop,size:[W,H],center:[272,272],pixelsPerWorldUnit:64,canvasWorldSize:ground.worldCanvas,basinGroundRatio:ground.baseEllipse.ratio,outerRadius:4.1875,innerClearRadius:2.234375,camera:{yaw:0,pitch:45},projection:'Top-down X/Z texture; Z span compensates for the measured painted basin ellipse at the existing 45-degree camera',paletteColors:colors.size,alpha:[0,255],opaquePixels:opaque,registration:'plaza_layout.mosaic_center; shared fountain origin',runtime:'godot-arcana/art/export/fountain-paving/mosaic-ring.png',generator:'built-in image_gen',status:'approved concept; integrated production asset pending user art review'},null,2)+'\n');
 console.log(JSON.stringify({size:[W,H],crop,colors:colors.size,opaque}));
}
module.exports=main;if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
