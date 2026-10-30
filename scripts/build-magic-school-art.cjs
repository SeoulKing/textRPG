/* Prepare the dedicated 3/4 RPG school sprite. Never regenerates the plaza or
 * existing art. Run with the same Node/Sharp environment as reference art. */
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'art-studies/magic-school/assets-v3');
const OUT = path.join(ROOT, 'godot-arcana/art/export/reference');
const W = 1280, H = 1152, FOOT = [640, 1088];
const rawImage = (data, width, height) => sharp(data, {raw:{width,height,channels:4}});
function bounds(data,w,h) {
  let left=w, top=h, right=-1, bottom=-1;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(data[(y*w+x)*4+3]>=128) {
    left=Math.min(left,x); top=Math.min(top,y); right=Math.max(right,x); bottom=Math.max(bottom,y);
  }
  if(right<0) throw Error('Empty school sprite');
  return {left,top,width:right-left+1,height:bottom-top+1};
}
async function main() {
  await fs.mkdir(OUT,{recursive:true});
  const source = await sharp(path.join(ART,'academy-source.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Remove detached generation specks; keep the single connected building.
  const seen=new Uint8Array(source.info.width*source.info.height);
  let largest=[];
  for(let p=0;p<seen.length;p++) if(!seen[p]&&source.data[p*4+3]>=128) {
    const queue=[p];seen[p]=1;
    for(let i=0;i<queue.length;i++) {
      const at=queue[i],x=at%source.info.width,y=Math.floor(at/source.info.width);
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        const xx=x+dx,yy=y+dy,n=yy*source.info.width+xx;
        if(xx<0||yy<0||xx>=source.info.width||yy>=source.info.height||seen[n]||source.data[n*4+3]<128) continue;
        seen[n]=1;queue.push(n);
      }
    }
    if(queue.length>largest.length) largest=queue;
  }
  const keep=new Uint8Array(seen.length);for(const p of largest) keep[p]=1;
  for(let p=0;p<keep.length;p++) if(!keep[p]) source.data.fill(0,p*4,p*4+4);
  const crop = bounds(source.data,source.info.width,source.info.height);
  // Match the existing 17-unit ground width at 64px/unit, with uniform scaling.
  const scale = Math.min(1088/crop.width,1024/crop.height);
  const width = Math.round(crop.width*scale), height = Math.round(crop.height*scale);
  const entranceAxis=source.info.width*.5;
  const left = Math.round(FOOT[0]-(entranceAxis-crop.left)*scale), top = FOOT[1]-height;
  const resized = await rawImage(source.data,source.info.width,source.info.height).extract(crop)
    .resize(width,height,{fit:'fill',kernel:'nearest'}).raw().toBuffer();
  const lut = await sharp(path.join(OUT,'../arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
  function fixed(rgb) {
    const [r,g,b]=rgb.map(v=>Math.floor(v*31/255+.5)), i=(g*1024+b*32+r)*3;
    return Array.from(lut.subarray(i,i+3));
  }
  const gpl = await fs.readFile(path.join(ROOT,'godot-arcana/art/source/arcana-world-64.gpl'),'utf8');
  const palette = [...new Map(gpl.split(/\r?\n/).filter(s=>/^\d+ \d+ \d+ /.test(s))
    .map(s=>fixed(s.split(/\s+/).slice(0,3).map(Number))).map(c=>[c.join(','),c])).values()];
  const cache=new Map(), canvas=Buffer.alloc(W*H*4), used=new Set();
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y*width+x)*4; if(resized[i+3]<128) continue;
    const key=(resized[i]<<16)+(resized[i+1]<<8)+resized[i+2];
    let color=cache.get(key);
    if(!color) {
      let best=Infinity;
      for(const p of palette) {
        const d=(resized[i]-p[0])**2*.30+(resized[i+1]-p[1])**2*.50+(resized[i+2]-p[2])**2*.20;
        if(d<best) {best=d;color=p;}
      }
      cache.set(key,color);
    }
    const j=((top+y)*W+left+x)*4;
    canvas.set([...color,255],j); used.add(color.join(','));
  }
  const png=await rawImage(canvas,W,H).png().toBuffer();
  await fs.writeFile(path.join(ART,'academy-building.png'),png);
  await fs.writeFile(path.join(OUT,'academy-2d.png'),png);
  // Real current heroine, south idle frame; do not redraw or rescale her.
  const hero=await sharp(path.join(OUT,'hero-original.png')).extract({left:0,top:0,width:96,height:136}).png().toBuffer();
  const overview=await sharp({create:{width:W,height:H,channels:4,background:'#ced7c0'}})
    .composite([{input:png},{input:hero,left:790,top:FOOT[1]-116}]).png().toBuffer();
  await fs.writeFile(path.join(ART,'scale-overview.png'),overview);
  await sharp(overview).extract({left:440,top:744,width:480,height:392})
    .resize(960,784,{kernel:'nearest'}).png().toFile(path.join(ART,'entrance-detail.png'));
  const spec={
    version:3, status:'integrated-awaiting-user-art-review', view:'3/4 RPG, yaw 0, pitch 45, orthographic blockout-guided painting',
    projectionGuide:'projection-guide.png',projectionGuideSource:'godot-arcana/tools/render_school_projection.gd',
    concept:'../arcana-magic-school-concept-v1.png', source:'academy-source.png',
    sourceSize:[source.info.width,source.info.height], sourceCrop:crop,
    size:[W,H],bounds:bounds(canvas,W,H), foot:FOOT,pixelsPerUnit:64,
    characterSourceHeight:110, sourceEntranceAxisX:entranceAxis,
    projection:{yawDegrees:0,pitchDegrees:45,mode:'orthographic',u:'x',v:'z*sin(pitch)-y*cos(pitch)'},
    footprint:[17,4],heightMap:null,occlusion:'existing whole-asset foot depth; no per-pixel height map',
    placement:[54,0,28],collision:[-8.5,-4,17,4],
    alpha:[0,255],paletteColors:used.size,palette:palette,
    runtime:'godot-arcana/art/export/reference/academy-2d.png',
    lighting:'upper left, baked daylight; warm windows', prompt:'academy-prompt.txt'
  };
  await fs.writeFile(path.join(ART,'manifest.json'),JSON.stringify(spec,null,2)+'\n');
  // Explicit imports avoid automatic 3D texture recompression and mipmaps.
  const sample=await fs.readFile(path.join(OUT,'oak.png.import'),'utf8');
  const importPath=path.join(OUT,'academy-2d.png.import');
  let imported;
  try { imported=await fs.readFile(importPath,'utf8'); }
  catch { imported=sample.replace(/^uid=.*\r?\n/m,'').replace(/oak\.png[^"\]]*/g,m=>m==='oak.png'? 'academy-2d.png':m); 
    imported=imported.replace(/path="res:\/\/\.godot\/imported\/[^"]+"/,'path="res://.godot/imported/academy-2d.png.ctex"')
      .replace(/source_file="[^"]+"/,'source_file="res://art/export/reference/academy-2d.png"')
      .replace(/dest_files=\[[^\]]+\]/,'dest_files=["res://.godot/imported/academy-2d.png.ctex"]');
  }
  imported=imported.replace(/detect_3d\/compress_to=\d+/,'detect_3d/compress_to=0')
    .replace(/mipmaps\/generate=true/,'mipmaps/generate=false').replace(/compress\/mode=\d+/,'compress/mode=0');
  await fs.writeFile(importPath,imported);
  console.log(JSON.stringify({size:spec.size,bounds:spec.bounds,foot:FOOT,paletteColors:used.size}));
}
main().then(()=>require('./build-school-lighting.cjs')()).catch(e=>{console.error(e);process.exitCode=1;});
