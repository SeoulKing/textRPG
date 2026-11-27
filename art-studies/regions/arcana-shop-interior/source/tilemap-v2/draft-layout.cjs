const fs=require('node:fs/promises'), path=require('node:path'), sharp=require('sharp');
const root=path.resolve(__dirname,'../../../../..');
const dir=__dirname, unit=16, step=.5;
const plan={
 rendering:{"dimension":"native-2d","root":"Node2D","tileAuthoring":"TileMapLayer","artwork":"Sprite2D / AnimatedSprite2D","camera":"Camera2D","projection":"Preserve front-facing 3/4 pixel artwork. Project map coordinates to 2D canvas coordinates; do not use Camera3D, MeshInstance3D or billboard materials for the shop.","scope":"arcana_shop only; other locations retain their current renderer","sharedLogic":"Existing movement, collision, travel, merchant transactions and online layout remain authoritative. Shop click picking, camera and world-to-screen overlays require 2D paths.","approval":"Rendering dimension authorized by user. V3 visual concept remains unapproved."},
 status:'preproduction-layout-draft; visual approval pending; not consumed by runtime',
 room:{origin:[5,4],size:[14,9],wallThickness:.25,gridStep:step,authoringCellPixels:[32,32],pixelsPerWorldUnit:64,navigationUnitsPerWorldUnit:16},
 layers:['Floor','HighWalls','LowWalls','Furniture','Decorations'],
 floorCells:Array.from({length:18},(_,z)=>Array.from({length:28},(_,x)=>[x,z])).flat(),
 door:{centerX:12,width:2,frontZ:13},
 boundaryCells:[],
 furniture:[
  {id:'herbs-left',asset:'herb-cabinet',cell:[4,1],sizeCells:[4,2],height:3},
  {id:'herbs-right',asset:'herb-cabinet',cell:[8,1],sizeCells:[4,2],height:3},
  {id:'potions',asset:'potion-cabinet',cell:[12,1],sizeCells:[4,2],height:3},
  {id:'travel-left',asset:'travel-cabinet',cell:[16,1],sizeCells:[4,2],height:3},
  {id:'travel-right',asset:'travel-cabinet',cell:[20,1],sizeCells:[4,2],height:3},
  {id:'counter',asset:'counter',cell:[10,6],sizeCells:[8,2],height:1,interaction:{id:'merchant',kind:'merchant',fromFrontCenter:[0,.75]},actor:{asset:'merchant',fromFrontCenter:[0,-1.5]}},
  {id:'workbench',asset:'apothecary-bench',cell:[1,7],sizeCells:[6,2],height:1},
  {id:'potion-island',asset:'potion-island',cell:[1,11],sizeCells:[3,2],height:1},
  {id:'travel-island',asset:'travel-island',cell:[24,11],sizeCells:[3,2],height:1},
  {id:'travel-stock',asset:'travel-stock',cell:[23,15],sizeCells:[4,2],height:.75},
  {id:'luggage',asset:'luggage',cell:[3,14],sizeCells:[3,2],height:.75},
  {id:'plant-left',asset:'plant',cell:[1,15],sizeCells:[1,1],height:1,allowArtOverhang:true},
  {id:'plant-right',asset:'plant',cell:[26,9],sizeCells:[1,1],height:1,allowArtOverhang:true}
 ],
 markers:{arrival:[12,11.8125],exit:[12,12.8125]},
 contracts:[
 'Floor cells determine the walkable domain; an erased floor cell cannot remain walkable.',
 'Wall and furniture footprints are read from the same TileData/placement source as displayed art.',
 'Furniture cell anchors are footprint minimum X/Z; image pivots may be fractional and do not alter occupancy.',
 'Merchant and interaction coordinates follow the unique counter placement via relative offsets.',
 'Door markers follow the doorway placement. The default arrival/exit preserve existing coordinates.',
 'The client and online export consume the same derived domain, collision rectangles and markers.',
 'Godot 16-navigation-unit AStar grid remains independent of the half-world-unit authoring grid.',
 'Native PixelPen masters preserve pixel edits; repackaging never overwrites existing manual masters.',
 'Actual TileSet/TileMapLayer scene, terrain connectivity, final art and game integration remain required deliverables.'
 ]
};
for(let x=0;x<28;x++){plan.boundaryCells.push({cell:[x,0],height:3.5});if(x<12||x>=16)plan.boundaryCells.push({cell:[x,17],height:.5});}
for(let z=1;z<17;z++){plan.boundaryCells.push({cell:[0,z],height:.5},{cell:[27,z],height:.5});}
const r=(x,z,w,d,id)=>({x:x*unit,y:z*unit,w:w*unit,h:d*unit,id});
const bounds=r(5,4,14,9,'floor');
const rects=[r(5,4,14,.25,'north-wall'),r(5,4,.25,9,'west-wall'),r(18.75,4,.25,9,'east-wall'),r(5,12.75,6,.25,'front-left'),r(13,12.75,6,.25,'front-right')].map(value=>({...value,kind:'boundary'}));
for(const f of plan.furniture){
 const [cx,cz]=f.cell,[cw,cd]=f.sizeCells;
 f.footprint={min:[5+cx*step,4+cz*step],size:[cw*step,cd*step]};
 f.frontCenter=[f.footprint.min[0]+cw*step/2,f.footprint.min[1]+cd*step];
 rects.push(r(...f.footprint.min,...f.footprint.size,f.id));
 if(f.interaction)plan.markers.merchantInteraction=f.frontCenter.map((v,i)=>v+f.interaction.fromFrontCenter[i]);
 if(f.actor)plan.markers.merchant=f.frontCenter.map((v,i)=>v+f.actor.fromFrontCenter[i]);
}
const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const conflicts=[];
for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){
 const a=rects[i],b=rects[j];
 if(intersects(a,b)&&!(a.kind==='boundary'&&b.kind==='boundary'))conflicts.push([a.id,b.id]);
}
const valid=(x,y)=>x>=bounds.x+3&&y>=bounds.y+3&&x<=bounds.x+bounds.w-3&&y<=bounds.y+bounds.h-3&&!rects.some(a=>x>=a.x-3&&x<=a.x+a.w+3&&y>=a.y-3&&y<=a.y+a.h+3);
const standMarkers=Object.fromEntries(Object.entries(plan.markers).map(([id,p])=>[id,valid(p[0]*unit,p[1]*unit)]));
const lattice={};
for(let y=0;y<21;y++)for(let x=0;x<24;x++)if(valid(x*16+8,y*16+8))lattice[x+','+y]=[x*16+8,y*16+8];
const nearest=p=>Object.keys(lattice).sort((a,b)=>Math.hypot(lattice[a][0]-p[0]*unit,lattice[a][1]-p[1]*unit)-Math.hypot(lattice[b][0]-p[0]*unit,lattice[b][1]-p[1]*unit))[0];
const start=nearest(plan.markers.arrival), queue=[start], parent={[start]:null};
for(let n=0;n<queue.length;n++){
 const k=queue[n],[x,y]=k.split(',').map(Number);
 for(const [dx,dy]of [[0,1],[1,0],[0,-1],[-1,0]]){
  const next=(x+dx)+','+(y+dy);if(lattice[next]&&!Object.hasOwn(parent,next)){parent[next]=k;queue.push(next);}
 }
}
const routes={};
for(const id of ['exit','merchantInteraction']){
 const target=nearest(plan.markers[id]),points=[];let at=target;
 if(Object.hasOwn(parent,target))while(at!==null){points.unshift(lattice[at]);at=parent[at];}
 routes[id]={reachable:points.length>0,points};
}
(async()=>{
 const current=await fs.readFile(path.join(root,'godot-arcana/scripts/shop_interior.gd'),'utf8');
 const raw=current.match(/const LAYOUT = \[([\s\S]*?)\n\]/)?.[1];
 if(!raw)throw Error('Current source LAYOUT not found');
 const old=JSON.parse('['+raw.replace(/,\s*$/,'')+']');
 const offGrid=old.filter(v=>v.asset!=='merchant'&&[(v.x-v.w/2-5)/step,(v.z-v.d-4)/step,v.w/step,v.d/step].some(n=>Math.abs(n-Math.round(n))>1e-8)).map(v=>v.asset);
 const oldWallConflicts=old.filter(v=>v.asset!=='merchant'&&v.z-v.d<4.25).map(v=>v.asset);
 const report={kind:'static draft geometry derivation, not game/test execution',currentSourceFindings:{halfGridViolations:offGrid,backWallFootprintConflicts:oldWallConflicts,clientCollisionMargin:3,onlineCollisionMargin:3,currentClientAndServerVoidGuard:'only broad room bounds; new layout requires floor-domain guard'},draft:{floorCells:plan.floorCells.length,boundaryCells:plan.boundaryCells.length,furniture:plan.furniture.length,overlapConflicts:conflicts,standMarkers,walkableAStarNodes:Object.keys(lattice).length,connectedAStarNodes:queue.length,routes},remaining:['visual approval','native tile art and PixelPen masters','Godot TileSet and painted scene','shared runtime/domain/marker implementation','online export','scope-appropriate source/import/render verification']};
 if(conflicts.length||Object.values(standMarkers).some(v=>!v)||Object.values(routes).some(v=>!v.reachable))throw Error('Draft geometry has unresolved conflicts: '+JSON.stringify(report.draft));
 await fs.writeFile(path.join(dir,'layout-draft.json'),JSON.stringify(plan,null,2)+'\n');
 await fs.writeFile(path.join(dir,'layout-static-review.json'),JSON.stringify(report,null,2)+'\n');
 const sx=x=>64+(x/unit-5)*64,sy=y=>96+(y/unit-4)*64;
 const box=(a,color)=>'<rect x="'+sx(a.x)+'" y="'+sy(a.y)+'" width="'+a.w/unit*64+'" height="'+a.h/unit*64+'" fill="'+color+'" stroke="#111b29" stroke-width="1"/>';
 let art='<rect width="1200" height="740" fill="#151b27"/><text x="64" y="42" fill="#fff0c6" font-family="sans-serif" font-size="24">SHOP / LOGICAL LAYOUT DRAFT / 14 x 9</text>'+box(bounds,'#394955');
 for(let x=0;x<=28;x++)art+='<path d="M'+(64+x*32)+' 96V672" stroke="#546370" stroke-width="1"/>';
 for(let z=0;z<=18;z++)art+='<path d="M64 '+(96+z*32)+'H960" stroke="#546370" stroke-width="1"/>';
 for(const a of rects)art+=box(a,a.id.includes('wall')||a.id.startsWith('front-')?'#d8ba7d':'#80664b');
 for(const f of plan.furniture){
  const rr=r(...f.footprint.min,...f.footprint.size,f.id);
  art+='<text x="'+(sx(rr.x)+4)+'" y="'+(sy(rr.y)+18)+'" fill="#f9eacc" font-family="sans-serif" font-size="11">'+f.id+'</text>';
 }
 const colors={exit:'#6ddbbd',merchantInteraction:'#96c9ff'};
 for(const[id,route]of Object.entries(routes))art+='<polyline points="'+route.points.map(p=>sx(p[0])+','+sy(p[1])).join(' ')+'" fill="none" stroke="'+colors[id]+'" stroke-width="4"/>';
 for(const[id,p]of Object.entries(plan.markers))art+='<circle cx="'+sx(p[0]*unit)+'" cy="'+sy(p[1]*unit)+'" r="6" fill="'+(id==='merchant'?'#f7cd79':'#f8fbff')+'"/>';
 art+='<text x="64" y="710" fill="#c5d6e1" font-family="sans-serif" font-size="16">Half-unit grid / exact footprints / floor-domain guard / 3 navigation-unit clearance</text>';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="740">'+art+'</svg>';
 await fs.writeFile(path.join(dir,'layout-draft.svg'),svg);
 await sharp(Buffer.from(svg)).png().toFile(path.join(dir,'layout-draft.png'));
 console.log(JSON.stringify({currentSourceFindings:report.currentSourceFindings,draft:{floorCells:report.draft.floorCells,boundaryCells:report.draft.boundaryCells,furniture:report.draft.furniture,overlapConflicts:conflicts,standMarkers,routes:Object.fromEntries(Object.entries(routes).map(([k,v])=>[k,v.reachable]))}},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
