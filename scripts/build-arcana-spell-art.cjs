// Editable indexed pixel layers are the source of truth after first creation.
// Re-running exports existing sources; it never replaces hand-edited pixels.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'godot-arcana/art/source/spells');
const outputDir = path.join(root, 'godot-arcana/art/export/spells');
const previewDir = path.join(root, 'godot-arcana/art/reference/spells');
const palette = { '.':'00000000', '1':'662d32ff', '2':'a43a2cff', '3':'d95128ff', '4':'ee7c32ff', '5':'ffae46ff', '6':'ffdb76ff', '7':'fff2b8ff' };
const blank = () => Array.from({length:64}, () => Array(64).fill('.'));
function paint(layer, predicate, color) {
  for(let y=8;y<56;y++) for(let x=8;x<56;x++) if(predicate(x+.5,y+.5)) layer[y][x] = color;
}
function polygon(layer, points, color) {
  paint(layer,(x,y) => {
    let inside = false;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const a=points[i],b=points[j];
      if((a[1]>y)!=(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  },color);
}
function ellipse(layer,cx,cy,rx,ry,color) { paint(layer,(x,y)=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1,color); }
function ring(layer,cx,cy,rx,ry,width,color) { paint(layer,(x,y)=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1 && ((x-cx)/(rx-width))**2+((y-cy)/(ry-width))**2>=1,color); }
function initial(id) {
  const silhouette=blank(), flame=blank(), light=blank();
  if(id==='fireball') {
    polygon(silhouette,[[9,9],[27,18],[24,10],[38,21],[46,22],[53,31],[55,43],[49,52],[38,55],[28,51],[23,43],[23,33],[15,24],[20,26]],'1');
    polygon(flame,[[13,13],[30,23],[29,16],[40,26],[47,26],[52,34],[52,44],[46,50],[37,52],[29,47],[26,38],[28,31],[20,24],[25,27]],'3');
    ellipse(flame,39,39,12,13,'4');
    polygon(light,[[24,24],[37,32],[35,25],[45,33],[49,40],[46,47],[38,49],[32,44],[31,37]],'5');
    ellipse(light,40,40,6,8,'6');
    ellipse(light,40,38,3,4,'7');
    polygon(light,[[14,16],[23,21],[25,25],[21,23]],'6');
    ellipse(light,15,33,2,2,'4');
  } else if(id==='flame-wave') {
    // Three tongues form one expanding fan rather than another round fireball.
    polygon(silhouette,[[31,54],[22,49],[11,38],[8,26],[15,30],[12,18],[22,25],[25,9],[32,18],[39,9],[42,25],[52,18],[49,31],[55,26],[53,39],[42,49]],'1');
    polygon(flame,[[31,52],[23,46],[13,36],[11,30],[19,35],[16,25],[25,30],[27,15],[32,24],[38,15],[39,31],[48,25],[44,36],[52,31],[49,39],[40,46]],'3');
    polygon(light,[[31,51],[23,43],[18,35],[26,39],[28,25],[32,33],[36,25],[37,40],[46,35],[40,44]],'5');
    polygon(light,[[30,49],[25,43],[29,43],[31,35],[34,43],[38,42],[33,49]],'7');
    polygon(light,[[17,32],[22,35],[24,39],[21,38]],'6');
    polygon(light,[[43,32],[46,29],[44,36],[41,39]],'6');
  } else {
    // Hollow shield: the center remains transparent at small display sizes.
    polygon(silhouette,[[13,20],[21,18],[21,12],[29,16],[32,8],[36,16],[44,12],[44,19],[52,21],[50,38],[43,48],[32,55],[20,48],[13,37]],'1');
    polygon(flame,[[16,23],[24,21],[24,17],[30,20],[32,13],[35,20],[41,17],[41,22],[49,24],[46,38],[40,46],[32,52],[23,46],[17,36]],'3');
    polygon(flame,[[20,25],[32,22],[45,25],[42,37],[37,43],[32,47],[26,43],[22,35]],'.');
    polygon(light,[[18,24],[23,23],[23,27],[21,29],[23,38],[28,44],[32,47],[38,43],[43,35],[46,27],[47,27],[45,39],[39,47],[32,52],[23,45],[18,36]],'5');
    polygon(light,[[23,20],[30,22],[32,17],[35,22],[42,20],[40,24],[34,26],[30,26],[24,24]],'6');
    polygon(light,[[23,35],[25,41],[32,47],[37,44],[32,50],[25,44]],'7');
    // Remove the middle from every layer, preserving an editable hollow silhouette.
    const hole=[[24,28],[32,26],[41,28],[38,37],[32,43],[27,39]];
    for(const layer of [silhouette,flame,light]) polygon(layer,hole,'.');
  }
  return {size:[64,64],margin:8,palette,layers:[{name:'outline',pixels:silhouette.map(r=>r.join(''))},{name:'flame',pixels:flame.map(r=>r.join(''))},{name:'highlights',pixels:light.map(r=>r.join(''))}]};
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function chunk(type,data) {
  const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);
  let c=0xffffffff;for(const b of Buffer.concat([name,data]))c=crcTable[(c^b)&255]^(c>>>8);
  crc.writeUInt32BE((c^0xffffffff)>>>0);return Buffer.concat([size,name,data,crc]);
}
function png(file,width,height,pixels) {
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const rows=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)pixels.copy(rows,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
}
for(const dir of [sourceDir,outputDir,previewDir])fs.mkdirSync(dir,{recursive:true});
const rendered=[];
for(const id of ['fireball','flame-wave','flame-guard']) {
  const file=path.join(sourceDir,id+'.json');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(initial(id),null,2)+'\n');
  const source=JSON.parse(fs.readFileSync(file,'utf8')),pixels=Buffer.alloc(64*64*4);
  if(source.size[0]!==64 || source.size[1]!==64)throw Error(id+': expected 64x64 source');
  for(const layer of source.layers) {
    if(layer.pixels.length!==64 || layer.pixels.some(row=>row.length!==64))throw Error(id+': invalid pixel layer');
    for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
      const key=layer.pixels[y][x];if(key==='.')continue;
      if(x<8||x>=56||y<8||y>=56)throw Error(id+': pixel outside 8px margin');
      if(!source.palette[key])throw Error(id+': unknown palette index '+key);
      const color=Buffer.from(source.palette[key],'hex');
      if(color.length!==4 || color[3]!==255)throw Error(id+': expected opaque pixel');
      color.copy(pixels,(y*64+x)*4);
    }
  }
  png(path.join(outputDir,id+'.png'),64,64,pixels);rendered.push(pixels);
}
// Large pixels above; actual 64px and 32px thumbnails below, on light and dark.
const w=576,h=304,preview=Buffer.alloc(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++)Buffer.from(y<224?[255,250,240,255]:[38,54,77,255]).copy(preview,(y*w+x)*4);
function stamp(pixels,left,top,size) {for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(Math.floor(y*64/size)*64+Math.floor(x*64/size))*4;if(pixels[i+3])pixels.copy(preview,((top+y)*w+left+x)*4,i,i+4);}}
rendered.forEach((pixels,i)=>{stamp(pixels,i*192,0,192);stamp(pixels,i*192+40,192,32);stamp(pixels,i*192+108,192,32);stamp(pixels,i*192+16,232,64);stamp(pixels,i*192+112,248,32);});
png(path.join(previewDir,'fire-spells.png'),w,h,preview);
console.log('Three 64x64 spell thumbnails exported; indexed layers preserved.');
