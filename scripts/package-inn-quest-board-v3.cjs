const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),study=path.join(root,'art-studies/inn-quest-board/material-v3'),native=path.join(root,'godot-arcana/art/source/props/inn-quest-board-wall-v3'),out=path.join(root,'godot-arcana/art/export/inn-quest-board');
async function main(){
 await fs.mkdir(native,{recursive:true});
 const raw=await sharp(path.join(study,'master.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=raw.info.width,t=raw.info.height,r=-1,b=-1;
 for(let y=0;y<raw.info.height;y++)for(let x=0;x<raw.info.width;x++)if(raw.data[(y*raw.info.width+x)*4+3]>=192){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 const scale=Math.min(116/(r-l+1),112/(b-t+1)),w=Math.round((r-l+1)*scale),h=Math.round((b-t+1)*scale),left=Math.floor((128-w)/2),top=122-h;
 const board=await sharp(raw.data,{raw:raw.info}).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(w,h,{kernel:'nearest'}).png().toBuffer();
 const pixels=await sharp({create:{width:128,height:160,channels:4,background:'#00000000'}}).composite([{input:board,left,top}]).raw().toBuffer();
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<192){pixels.fill(0,i,i+4);continue;}const index=(Math.round(pixels[i+1]*31/255)*1024+Math.round(pixels[i+2]*31/255)*32+Math.round(pixels[i]*31/255))*3;pixels.set(lut.subarray(index,index+3),i);pixels[i+3]=255;}
 // Clean isolated alpha specks only; preserve ink and intentional metal highlights.
 const visited=new Set(),removed=[];
 for(let i=0;i<128*160;i++){if(!pixels[i*4+3]||visited.has(i))continue;const group=[i];visited.add(i);for(let n=0;n<group.length;n++){const p=group[n],x=p%128,y=Math.floor(p/128);for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=x+dx,yy=y+dy,j=yy*128+xx;if(xx>=0&&xx<128&&yy>=0&&yy<160&&pixels[j*4+3]&&!visited.has(j)){visited.add(j);group.push(j);}}}if(group.length<3)for(const j of group){pixels.fill(0,j*4,j*4+4);removed.push([j%128,Math.floor(j/128)]);}}
 const png=await sharp(pixels,{raw:{width:128,height:160,channels:4}}).png().toBuffer();
 await fs.writeFile(path.join(native,'inn-quest-board.png'),png);
 await fs.writeFile(path.join(out,'inn-quest-board.png'),png);
 await sharp(png).resize(512,640,{kernel:'nearest'}).png().toFile(path.join(study,'native-preview.png'));
 const old=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
 const manifest={...old,source:'res://art/source/props/inn-quest-board-wall-v3/inn-quest-board.png',materialReference:'res://art/export/inn-lobby/counter.png',master:'art-studies/inn-quest-board/material-v3/master.png',crop:[l,t,r-l+1,b-t+1],registeredArtBounds:[left,top,w,h],alphaCleanup:removed,previousSource:old.previousSource||old.source};
 await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 await fs.writeFile(path.join(native,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({canvas:[128,160],bounds:[left,top,w,h],removedSpecks:removed.length,foot:old.foot,worldPosition:old.worldPosition}));
}
main().catch(e=>{console.error(e);process.exit(1)});
