/* Compose the approved square from existing city artwork and saved placement nodes. */
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='art-studies/regions/arcana-city-center/source/plaza-mood-v1';
const scenePath='godot-arcana/scenes/native_2d/plaza.tscn';
const positions={
 '상점_01':[1536,1600], '여관_01':[1520,2472], '식당_01':[2304,1232], '마법학교_2D':[3540,1744],
 'market_01':[1888,1776], 'market_02':[1984,2072],
 'cafe_01':[2048,1424], 'cafe_02':[2528,1424], 'cafe_03':[2288,1424], 'cafe_04':[2528,1584],
 'townhouse_01':[1120,1184], 'townhouse_02':[1672,1056], 'townhouse_03':[1088,2000], 'townhouse_04':[2936,2512],
 'lamp_post_01':[1840,1568], 'lamp_post_02':[2032,1632], 'lamp_post_03':[2576,1648],
 'lamp_post_04':[1872,1968], 'lamp_post_05':[2720,2112], 'lamp_post_06':[2096,2352], 'lamp_post_07':[2528,2352],
 'oak_01':[1960,1656], 'birch_01':[1968,2272], 'oak_02':[2896,2080], 'oak_03':[2800,2112], 'birch_03':[3040,2080],
 'hedge_01':[2816,2176], 'hedge_02':[3008,2192], 'hedge_03':[2944,1944], 'hedge_07':[1968,1688], 'hedge_08':[1976,2336],
 '벤치_01':[2304,1552], '벤치_02':[2704,2224], '북쪽길_벤치':[1872,1360], '여관길_벤치':[2048,2416],
 'flowerbed_01':[2048,2264], 'flowerbed_02':[2632,2448], 'flowerbed_05':[2048,1680], 'flowerbed_06':[3104,2176],
 'flowerbed_07':[1936,1416], 'flowerbed_08':[1888,2344],
 'flowers_01':[1872,1600], 'flowers_02':[1968,1624], 'flowers_03':[1904,2264], 'flowers_04':[2024,2344],
 'flowers_05':[2752,2032], 'flowers_06':[2984,2192],
 'crate_01':[1917,1583], 'crate_02':[1916,1525], 'crate_03':[1920,2392],
 'barrels_01':[1840,1744], 'barrels_02':[1872,2456], 'basket_01':[1792,1824], 'basket_02':[1904,2128],
 'flowerpot_02':[1856,1616], 'flowerpot_04':[1888,2480], 'flowerpot_07':[3120,2200]
};
const clones=[
 {source:'참나무_29',name:'plaza_canopy_nw_01',at:[1832,1672]},
 {source:'참나무_29',name:'plaza_canopy_nw_02',at:[1952,1488]},
 {source:'참나무_29',name:'plaza_canopy_ne_01',at:[2528,1312]},
 {source:'참나무_29',name:'plaza_canopy_east_01',at:[2696,1960]},
 {source:'참나무_29',name:'plaza_canopy_sw_01',at:[2064,2320]},
 {source:'참나무_29',name:'plaza_canopy_sw_02',at:[1936,2368]},
 {source:'참나무_29',name:'plaza_canopy_south_01',at:[1936,2632]},
 {source:'참나무_29',name:'plaza_canopy_south_02',at:[2032,2688]},
 {source:'참나무_29',name:'plaza_canopy_se_01',at:[2704,2640]},
 {source:'참나무_29',name:'plaza_canopy_se_02',at:[2576,2688]},
 {source:'market_01',name:'plaza_market_east',at:[2624,2384]}
];
const gardens=[[42.4,30.25,7.7,4.4],[59,29,8,4],[29.0,24.3,3.2,2.4],[29.4,34.3,3.7,3.2],[40.2,39.6,2.6,2.2]];
function set(block,key,value){
 const re=new RegExp('^'+key.replaceAll('/','\\/')+' = .*$','m');
 if(re.test(block))return block.replace(re,key+' = '+value);
 const line=block.indexOf('\n');return block.slice(0,line+1)+key+' = '+value+'\n'+block.slice(line+1);
}
function info(block){
 const name=block.match(/^\[node name="([^"]+)"/)?.[1];
 const at=block.match(/^position = Vector2\(([^)]+)\)/m)?.[1].split(',').map(Number)??[0,0];
 const kind=block.match(/^model_kind = "([^"]+)"/m)?.[1]??'';
 const local=[...(block.match(/^collision_parts = .*$/m)?.[0]??'').matchAll(/Rect2\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));
 return {name,at,kind,local};
}
async function main(){
 let scene=await fs.readFile(path.join(root,scenePath),'utf8');
 if(scene.includes('name="광장_기존자산_구성"'))throw Error('Composition already installed; edit the authored nodes directly.');
 const baseline=await fs.readFile(path.join(root,base,'before-plaza.tscn'),'utf8');
 const baselineBlocks=baseline.split(/(?=^\[node )/m);
 const baselineVisuals=new Map(baselineBlocks.filter(b=>b.startsWith('[node name="Visual"')).map(b=>[b.split('\n')[0].trim(),b]));
 let blocks=scene.split(/(?=^\[node )/m).filter(b=>!b.split('\n')[0].includes('분수광장_미술'));
 // Retire the newly generated lookalike props; all runtime props now reuse existing artwork.
 blocks=blocks.map(b=>{
  if(!b.startsWith('[node name="Visual"')||!b.includes('ExtResource("mood_banner")'))return b;
  const old=baselineVisuals.get(b.split('\n')[0].trim());if(!old)throw Error('Missing original lamp block');
  for(const key of ['texture','offset','region_rect','metadata/frame_size']){
   const value=old.match(new RegExp('^'+key+' = (.*)$','m'))?.[1];if(value)b=set(b,key,value.trim());
  }
  return b;
 });
 scene=blocks.join('').replace(/^\[ext_resource[^\n]* id="mood_(?:stone|banner|planter|tree)"\]\r?\n/gm,'');
 scene=scene.replace(/load_steps=(\d+)/,(m,n)=>'load_steps='+(Number(n)-4));
 scene=scene.replace(/^shader_parameter\/plaza_stone = .*\r?\n/gm,'');
 scene=scene.replace(/^\[ext_resource type="Shader"[^\n]*id="ground_shader"\]/m,
  '[ext_resource type="Shader" path="res://art/resources/native_2d_city_ground.gdshader" id="ground_shader"]');
 // Updated vector artwork preserves the celestial design while tightening the plaza.
 scene=scene.replace(/^\[ext_resource type="Texture2D"[^\n]*id="ground_left"\]/m,
  '[ext_resource type="Texture2D" path="res://art/export/regions/arcana-city-center/plaza-composed/ground-left.res" id="ground_left"]');
 scene=scene.replace(/^\[ext_resource type="Texture2D"[^\n]*id="ground_right"\]/m,
  '[ext_resource type="Texture2D" path="res://art/export/regions/arcana-city-center/plaza-composed/ground-right.res" id="ground_right"]');
 blocks=scene.split(/(?=^\[node )/m);
 const originals=new Map(blocks.filter(b=>b.includes('model_kind =')).map(b=>[info(b).name,b]));
 const changes=[],missing=[];
 for(const [name,at] of Object.entries(positions)){
  const original=originals.get(name);if(!original){missing.push(name);continue;}
  const index=blocks.indexOf(original);
  const previous=info(original).at;
  blocks[index]=set(original,'position','Vector2('+at.join(', ')+')');
  changes.push({name,before:previous,after:at});
 }
 scene=blocks.join('');
 scene=scene.replace(/^garden_areas = .*$/m,'garden_areas = Array[Rect2](['+gardens.map(r=>'Rect2('+r.join(', ')+')').join(', ')+'])');
 const eol=scene.includes('\r\n')?'\r\n':'\n';
 const extras=['[node name="광장_기존자산_구성" type="Node2D" parent="Placements"]',''];
 for(const c of clones){
  let parent=originals.get(c.source);if(!parent)throw Error('Missing existing source '+c.source);
  const sourceParent=parent.match(/^\[node name="[^"]+" type="Node2D" parent="([^"]+)"/)?.[1];
  const visual=blocks.find(b=>b.startsWith('[node name="Visual" type="Sprite2D" parent="'+sourceParent+'/'+c.source+'"]'));
  if(!visual)throw Error('Missing existing artwork '+c.source);
  parent=parent.replace(/^\[node[^\n]+\]/,'[node name="'+c.name+'" type="Node2D" parent="Placements/광장_기존자산_구성"]');
  parent=set(parent,'position','Vector2('+c.at.join(', ')+')');
  parent=set(parent,'source_path','"PlazaComposition/'+c.source+'"');
  let art=visual.replace(/^\[node[^\n]+\]/,'[node name="Visual" type="Sprite2D" parent="Placements/광장_기존자산_구성/'+c.name+'"]');
  art=set(art,'z_index',String(c.at[1]));
  extras.push(parent.trimEnd(),'',art.trimEnd(),'');
 }
 scene+=eol+extras.join(eol);
 await fs.writeFile(path.join(root,scenePath),scene);
 await fs.writeFile(path.join(root,base,'composition.json'),JSON.stringify({
  approval:'User approved concept-v1, then clarified that existing assets should be composed instead of recreating props.',
  scene:scenePath,positions:changes,instances:clones,gardens,missingNames:missing,
  ringScale:.76,plazaCenter:[36,28.925],runtimeArt:'Existing native 2D resources; no generated lookalike props remain connected.'
 },null,2)+'\n');
 // List actual footprint conflicts so the art pass can resolve them together.
 const finalBlocks=scene.split(/(?=^\[node )/m).filter(b=>b.includes('model_kind =')).map(info);
 const changed=new Set([...changes.map(c=>c.name),...clones.map(c=>c.name)]);
 const collisions=[];
 const overlap=(a,b)=>a[0]<b[0]+b[2]-2&&a[0]+a[2]>b[0]+2&&a[1]<b[1]+b[3]-2&&a[1]+a[3]>b[1]+2;
 const box=(r,p)=>[p[0]+r[0]*4,p[1]+r[1]*4,r[2]*4,r[3]*4];
 for(let i=0;i<finalBlocks.length;i++)for(let j=i+1;j<finalBlocks.length;j++){
  const a=finalBlocks[i],b=finalBlocks[j];if(!changed.has(a.name)&&!changed.has(b.name))continue;
  if(a.local.some(r=>b.local.some(s=>overlap(box(r,a.at),box(s,b.at)))))collisions.push({a:a.name,b:b.name});
 }
 await fs.writeFile(path.join(root,base,'composition-footprints.json'),JSON.stringify(collisions,null,2)+'\n');
 console.log(JSON.stringify({moved:changes.length,existingArtInstances:clones.length,missing,footprintConflicts:collisions}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
