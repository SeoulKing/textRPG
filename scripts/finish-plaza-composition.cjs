const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='art-studies/regions/arcana-city-center/source/plaza-mood-v1';
const sceneFile=path.join(root,'godot-arcana/scenes/native_2d/plaza.tscn');
const fixed={'townhouse_02':[1654,884],'townhouse_03':[428,1851],
 '북쪽길_벤치':[1968,1344],'벤치_01':[2304,1520],
 'cafe_01':[2128,1440],'cafe_02':[2480,1440],'cafe_03':[1280,1808],'cafe_04':[1536,1808],
 'plaza_canopy_nw_02':[2056,1624],'plaza_market_east':[2624,2512],'plaza_canopy_se_02':[2544,2800]};
const intersect=(a,b,pad=2)=>a[0]<b[0]+b[2]+pad&&a[0]+a[2]+pad>b[0]&&a[1]<b[1]+b[3]+pad&&a[1]+a[3]+pad>b[1];
function entry(block,index){
 const name=block.match(/^\[node name="([^"]+)"/)?.[1],kind=block.match(/^model_kind = "([^"]+)"/m)?.[1];
 const at=block.match(/^position = Vector2\(([^)]+)\)/m)?.[1].split(',').map(Number)??[0,0];
 const local=[...(block.match(/^collision_parts = .*$/m)?.[0]??'').matchAll(/Rect2\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));
 return {name,kind,at,local,index};
}
const boxes=(e,at=e.at)=>e.local.map(r=>[at[0]+r[0]*4,at[1]+r[1]*4,r[2]*4,r[3]*4]);
async function main(){
 let scene=await fs.readFile(sceneFile,'utf8'),blocks=scene.split(/(?=^\[node )/m);
 const moves=[];
 blocks=blocks.map(b=>{const name=b.match(/^\[node name="([^"]+)"/)?.[1];if(!fixed[name]||!b.includes('model_kind ='))return b;
  moves.push({name,to:fixed[name]});return b.replace(/^position = Vector2\([^)]+\)/m,'position = Vector2('+fixed[name].join(', ')+')');});
 const entries=blocks.map(entry).filter(e=>e.kind);
 const softKinds=new Set(['flowerbed','flowerpot','city-hedge','flowers','crate','barrels','basket']);
 const soft=entries.filter(e=>softKinds.has(e.kind)&&e.at[0]>1500&&e.at[0]<3200&&e.at[1]>1200&&e.at[1]<2850);
 const movable=new Set(soft.map(e=>e.name));
 const occupied=entries.filter(e=>!movable.has(e.name)).flatMap(e=>boxes(e).map(rect=>({name:e.name,rect})));
 const benchAccess=entries.filter(e=>e.kind==='bench').map(e=>({name:e.name,rect:[e.at[0]-73.6,e.at[1]+16,147.2,144]}));
 function safe(e,at){
  return boxes(e,at).every(r=>{
   const nearestX=Math.max(r[0],Math.min(2304,r[0]+r[2])),nearestY=Math.max(r[1],Math.min(1851.2,r[1]+r[3]));
   return Math.hypot(nearestX-2304,nearestY-1851.2)>=176&&!occupied.some(o=>intersect(r,o.rect,4))&&!benchAccess.some(o=>intersect(r,o.rect,8));
  });
 }
 const offsets=[];
 for(let y=-10;y<=10;y++)for(let x=-10;x<=10;x++)offsets.push([x*16,y*16]);
 offsets.sort((a,b)=>(a[0]*a[0]+a[1]*a[1]+(a[1]<0?30:0))-(b[0]*b[0]+b[1]*b[1]+(b[1]<0?30:0)));
 const unresolved=[];
 for(const e of soft){
  const offset=offsets.find(o=>safe(e,[e.at[0]+o[0],e.at[1]+o[1]]));
  if(!offset){unresolved.push(e.name);continue;}
  const at=[e.at[0]+offset[0],e.at[1]+offset[1]];
  if(offset[0]||offset[1]){
   blocks[e.index]=blocks[e.index].replace(/^position = Vector2\([^)]+\)/m,'position = Vector2('+at.join(', ')+')');
   moves.push({name:e.name,before:e.at,to:at,reason:'Keep wall edges, trunks and bench approaches clear.'});e.at=at;
  }
  occupied.push(...boxes(e).map(rect=>({name:e.name,rect})));
 }
 if(unresolved.length)throw Error('No nearby clear placement: '+unresolved.join(', '));
 scene=blocks.join('');
 await fs.writeFile(sceneFile,scene);
 await fs.writeFile(path.join(root,base,'composition-clearance.json'),JSON.stringify({moves,benchAccess,unresolved,
  method:'Static authored footprint placement; no play test.'},null,2)+'\n');
 console.log(JSON.stringify({placementAdjustments:moves.length,unresolved}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
