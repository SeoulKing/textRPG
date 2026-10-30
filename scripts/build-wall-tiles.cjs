const fs=require('node:fs/promises');
const path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const TILE_W=192,TILE_H=512,FOOT=480,PHASES=4;
async function build(){
 // Independent generated wall masters, not a crop or reduction of the concept scene.
 const frontSource='art-studies/city-walls/source/wall-master-v2.png';
 const northSource='art-studies/city-walls/source/wall-ns-master-v2.png';
 // Pillar center to matching pillar center spans four complete illustrated bays.
 const crop={left:108,top:98,width:1832,height:576};
 const masterWidth=PHASES*TILE_W, masterHeight=Math.round(crop.height*masterWidth/crop.width);
 const front=await sharp(path.join(root,frontSource)).extract(crop).resize(masterWidth,masterHeight,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();
 const topWidth=128,topHeight=230;
 const walkway=await sharp(path.join(root,northSource)).extract({left:260,top:150,width:390,height:700}).resize(topWidth,topHeight,{kernel:'nearest'}).ensureAlpha().raw().toBuffer();
 const atlasWidth=16*TILE_W,atlasHeight=PHASES*TILE_H;
 const atlas=Buffer.alloc(atlasWidth*atlasHeight*4);
 const tileBottom=494,frontTop=tileBottom-masterHeight,walkY=frontTop+62;
 const rgba=(buf,w,x,y)=>buf.subarray((y*w+x)*4,(y*w+x)*4+4);
 const edgePhase=1;
 for(let phase=0;phase<PHASES;phase++)for(let mask=0;mask<16;mask++){
  const tile=Buffer.alloc(TILE_W*TILE_H*4);
  const put=(x,y,p)=>{if(x<0||x>=TILE_W||y<0||y>=512||p[3]<192)return;tile.set(p,(y*TILE_W+x)*4);};
  const east=!!(mask&1),south=!!(mask&2),west=!!(mask&4),north=!!(mask&8);
  // A north-south run shows the raised walkway; its terminal face appears only at an end.
  if(north||south){
   const y0=walkY-(north?68:44),y1=walkY+(south?68:44);
   for(let y=y0;y<y1;y++)for(let x=32;x<160;x++)put(x,y,rgba(walkway,topWidth,x-32,((y-y0)+15)%topHeight));
  }
  if(east||west||!south){
   // Terminal E/W cells stop at their ground anchor. A tower on the same cell
   // covers the join; no flat wall face extends into the gate past the tower.
   const start=(east||west)?(west?0:TILE_W/2):32;
   const end=(east||west)?(east?TILE_W:TILE_W/2):160;
   for(let y=0;y<masterHeight;y++)for(let x=start;x<end;x++){
    let sx=phase*TILE_W+x;
    // Register the outer eight pixels of every phase to a shared cut through a masonry bay.
    // Any Terrain variant can meet any other without an alpha crack or shifted footing.
    if(x<8)sx=edgePhase*TILE_W+x;
    else if(x>=TILE_W-8)sx=edgePhase*TILE_W+x;
    put(x,frontTop+y,rgba(front,masterWidth,sx,y));
   }
  }
  if(south&&(east||west)){
   // Remove the front parapet across the joining path, then connect its illustrated paving.
   for(let y=walkY-2;y<walkY+68;y++)for(let x=38;x<154;x++)put(x,y,rgba(walkway,topWidth,x-32,(y-walkY+30)%topHeight));
  }
  if(!(east||west||north||south)){
   // A disconnected cell is a masonry pier, still using the drawn face and its stone edges.
   for(let y=frontTop;y<tileBottom;y++)for(const x of [32,33,158,159]){
    const p=rgba(front,masterWidth,edgePhase*TILE_W+(x<96?12:179),y-frontTop);put(x,y,p);
   }
  }
  for(let y=0;y<TILE_H;y++)tile.copy(atlas,((phase*TILE_H+y)*atlasWidth+mask*TILE_W)*4,y*TILE_W*4,(y+1)*TILE_W*4);
 }
 const lut=await sharp(path.join(root,'godot-arcana/art/export/arcana-palette-lut.png')).removeAlpha().raw().toBuffer();
 const colors=new Set();
 for(let i=0;i<atlas.length;i+=4){if(atlas[i+3]<192){atlas.fill(0,i,i+4);continue;}const r=Math.round(atlas[i]*31/255),g=Math.round(atlas[i+1]*31/255),b=Math.round(atlas[i+2]*31/255),j=(g*1024+b*32+r)*3;atlas.set(lut.subarray(j,j+3),i);atlas[i+3]=255;colors.add(atlas.subarray(i,i+3).toString('hex'));}
 await sharp(atlas,{raw:{width:atlasWidth,height:atlasHeight,channels:4}}).png().toFile(path.join(root,'godot-arcana/art/export/walls/wall-terrain.png'));
 await fs.writeFile(path.join(root,'art-studies/city-walls/wall-manifest-v2.json'),JSON.stringify({concept:'wall-and-tower-concept-v2.png',sources:[frontSource,northSource],sourceCrop:crop,atlas:[atlasWidth,atlasHeight],tile:[192,512],foot:[96,FOOT],phases:PHASES,editorCell:[192,136],worldCellSize:3,connectionMasks:16,masterSize:[masterWidth,masterHeight],pixelsPerUnit:64,alpha:[0,255],paletteColors:colors.size,wallVisualHeight:masterHeight,heroReferenceHeight:110,notes:'4 complete illustrated masonry bays; canonical edge cuts; joined walkway pieces use the separate N/S art master. No runtime model geometry.'},null,2));
 console.log(`Built illustrated walls: 16 connections x ${PHASES} phases, ${masterHeight}px high, ${colors.size} palette colors`);
}
build().catch(e=>{console.error(e);process.exitCode=1;});
