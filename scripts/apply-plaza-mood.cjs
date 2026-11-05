/* Apply only the approved fountain-square art; preserve authored layout blocks. */
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='art-studies/regions/arcana-city-center/source/plaza-mood-v1';
const scenePath='godot-arcana/scenes/native_2d/plaza.tscn';
const out='res://art/export/regions/arcana-city-center/plaza-mood-v1/';
const nodeHeader=(name,parent)=>'[node name="'+name+'" type="Sprite2D" parent="'+parent+'"]';
const plans=[
 {name:'plaza_tree_01',id:'plaza-tree',kind:'oak',at:[1728,1408]},
 {name:'plaza_tree_02',id:'plaza-tree',kind:'oak',at:[2800,1376]},
 {name:'plaza_tree_03',id:'plaza-tree',kind:'oak',at:[1792,2232]},
 {name:'plaza_tree_04',id:'plaza-tree',kind:'oak',at:[2896,2392]},
 {name:'plaza_tree_05',id:'plaza-tree',kind:'oak',at:[2016,2512]},
 {name:'plaza_tree_06',id:'plaza-tree',kind:'oak',at:[2656,2576]},
 {name:'plaza_flowers_01',id:'flower-planter',kind:'flowerbed',at:[1952,1600]},
 {name:'plaza_flowers_02',id:'flower-planter',kind:'flowerbed',at:[2656,1600]},
 {name:'plaza_flowers_03',id:'flower-planter',kind:'flowerbed',at:[1936,2016]},
 {name:'plaza_flowers_04',id:'flower-planter',kind:'flowerbed',at:[2672,2048]},
 {name:'plaza_flowers_05',id:'flower-planter',kind:'flowerbed',at:[1912,2310]},
 {name:'plaza_flowers_06',id:'flower-planter',kind:'flowerbed',at:[2696,2340]},
 {name:'plaza_flowers_07',id:'flower-planter',kind:'flowerbed',at:[2112,1440]},
 {name:'plaza_flowers_08',id:'flower-planter',kind:'flowerbed',at:[2592,1440]}
];
function rects(block){
 const values=block.match(/^collision_parts = .*$/m)?.[0]??'';
 return [...values.matchAll(/Rect2\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));
}
function worldBox(local,at){return [at[0]+local[0]*4,at[1]+local[1]*4,local[2]*4,local[3]*4];}
function overlap(a,b,pad=4){return a[0]<b[0]+b[2]+pad&&a[0]+a[2]+pad>b[0]&&a[1]<b[1]+b[3]+pad&&a[1]+a[3]+pad>b[1];}
function replaceField(block,field,value){
 const re=new RegExp('^'+field.replaceAll('/','\\/')+' = .*$','m');
 if(!re.test(block))throw Error('Missing field '+field);
 return block.replace(re,field+' = '+value);
}
async function main(){
 const full=path.join(root,scenePath);
 let scene=await fs.readFile(full,'utf8');
 const backup=path.join(root,base,'before-plaza.tscn');
 try{await fs.access(backup);}catch{await fs.copyFile(full,backup);}
 if(scene.includes('id="mood_stone"'))throw Error('Plaza mood already applied; adjust saved nodes instead of regenerating.');
 const plan=JSON.parse(await fs.readFile(path.join(root,base,'pixelpen-plan.json'),'utf8'));
 const specs=Object.fromEntries(plan.jobs.map(j=>[j.id,j]));
 const eol=scene.includes('\r\n')?'\r\n':'\n';
 const originalBlocks=scene.split(/(?=^\[node )/m);
 const obstacles=[],benches=[];
 for(const block of originalBlocks.slice(1)){
  if(!block.includes('model_kind ='))continue;
  const at=block.match(/^position = Vector2\(([^)]+)\)/m)?.[1].split(',').map(Number)??[0,0];
  const name=block.match(/^\[node name="([^"]+)"/)?.[1]??'';
  for(const box of rects(block))obstacles.push({name,rect:worldBox(box,at)});
  if(block.includes('model_kind = "bench"'))benches.push({name,rect:[at[0]-73.6,at[1]+16,147.2,144]});
 }
 const accepted=[],conflicts=[];
 for(const placement of plans){
  const spec=specs[placement.id],box=worldBox(spec.collision,placement.at);
  const hit=obstacles.find(o=>overlap(box,o.rect));
  const bench=benches.find(o=>overlap(box,o.rect,12));
  const nearestX=Math.max(box[0],Math.min(2304,box[0]+box[2]));
  const nearestY=Math.max(box[1],Math.min(1851.2,box[1]+box[3]));
  if(hit||bench||Math.hypot(nearestX-2304,nearestY-1851.2)<180)
   {conflicts.push(placement.name+' overlaps '+(hit?.name??bench?.name??'fountain clearance'));continue;}
  accepted.push({...placement,collision:box});
  obstacles.push({name:placement.name,rect:box});
 }
 if(conflicts.length)throw Error('Placements need adjustment: '+conflicts.join('; '));
 const resources=[
  '[ext_resource type="Texture2D" path="'+out+'limestone.res" id="mood_stone"]',
  '[ext_resource type="Texture2D" path="'+out+'banner-lamp.res" id="mood_banner"]',
  '[ext_resource type="Texture2D" path="'+out+'flower-planter.res" id="mood_planter"]',
  '[ext_resource type="Texture2D" path="'+out+'plaza-tree.res" id="mood_tree"]'
 ].join(eol)+eol+eol;
 const resourceIndex=scene.indexOf('[sub_resource');
 scene=scene.slice(0,resourceIndex)+resources+scene.slice(resourceIndex);
 scene=scene.replace(/load_steps=(\d+)/,(m,n)=>'load_steps='+(Number(n)+4));
 scene=scene.replace('path="res://art/resources/native_2d_city_ground.gdshader"','path="res://art/resources/native_2d_plaza_mood_ground.gdshader"');
 scene=scene.replace(/(shader_parameter\/fountain_paving_span = [^\r\n]+)/,'$1'+eol+'shader_parameter/plaza_stone = ExtResource("mood_stone")');
 const lamps=['lamp_post_02','lamp_post_03','lamp_post_04','lamp_post_05','lamp_post_06','lamp_post_07'];
 let blocks=scene.split(/(?=^\[node )/m);
 let changed=0;
 blocks=blocks.map(block=>{
  if(!lamps.some(name=>block.startsWith(nodeHeader('Visual','Placements/가로등들/'+name))))return block;
  block=replaceField(block,'texture','ExtResource("mood_banner")');
  block=replaceField(block,'offset','Vector2(-96, -306)');
  block=replaceField(block,'region_rect','Rect2(0, 0, 192, 320)');
  block=replaceField(block,'metadata/frame_size','Vector2i(192, 320)');
  changed++;
  return block;
 });
 if(changed!==lamps.length){
  // The authored group name is read from the existing Visual blocks.
  changed=0;
  blocks=scene.split(/(?=^\[node )/m).map(block=>{
   if(!block.startsWith('[node name="Visual"')||!lamps.some(name=>block.split('\n')[0].endsWith('/'+name+'"]')))return block;
   block=replaceField(block,'texture','ExtResource("mood_banner")');
   block=replaceField(block,'offset','Vector2(-96, -306)');
   block=replaceField(block,'region_rect','Rect2(0, 0, 192, 320)');
   block=replaceField(block,'metadata/frame_size','Vector2i(192, 320)');
   changed++;return block;
  });
 }
 if(changed!==lamps.length)throw Error('Expected six authored lamp visuals, found '+changed);
 scene=blocks.join('');
 const group='분수광장_미술';
 const newNodes=['[node name="'+group+'" type="Node2D" parent="Placements"]',''];
 for(const p of accepted){
  const s=specs[p.id],id=p.id==='plaza-tree'?'mood_tree':'mood_planter';
  const parent='Placements/'+group+'/'+p.name;
  newNodes.push('[node name="'+p.name+'" type="Node2D" parent="Placements/'+group+'"]',
   'position = Vector2('+p.at.join(', ')+')','script = ExtResource("1_rimt7")',
   'model_kind = "'+p.kind+'"',
   'collision_parts = Array[Rect2]([Rect2('+s.collision.join(', ')+')])',
   'source_path = "PlazaMoodV1/'+p.name+'"','metadata/_edit_group_ = true','',
   nodeHeader('Visual',parent),'z_index = '+Math.round(p.at[1]),
   'texture = ExtResource("'+id+'")','centered = false',
   'offset = Vector2('+s.foot.map(v=>-v).join(', ')+')',
   'region_rect = Rect2(0, 0, '+s.size.join(', ')+')',
   'metadata/frame_grid = Vector2i(1, 1)',
   'metadata/frame_size = Vector2i('+s.size.join(', ')+')','');
 }
 scene+=eol+newNodes.join(eol);
 await fs.writeFile(full,scene);
 const shaderOriginal=await fs.readFile(path.join(root,'godot-arcana/art/resources/native_2d_city_ground.gdshader'),'utf8');
 let shader=shaderOriginal.replace('// Existing 3D floor art, sampled at the native 2D world\'s 64 pixels per unit.',
  '// Approved plaza: native limestone material beneath the existing celestial inlays.');
 shader=shader.replace('uniform vec4 city_plaza;','uniform sampler2D plaza_stone : source_color, filter_nearest, repeat_enable;\nuniform vec4 city_plaza;');
 const anchor=' float painted_edge = max(boundary,-city_garden_distance(p));';
 if(!shader.includes(anchor))throw Error('Ground shader anchor changed');
 shader=shader.replace(anchor,`
 // A local material pass keeps the original celestial geometry and adjacent districts.
 vec2 plaza_offset = ground_position-city_mosaic_center/16.0;
 float mood_coverage = 1.0-smoothstep(12.0,18.0,length(plaza_offset*vec2(1.0,1.08)));
 vec3 limestone = texture(plaza_stone,ground_position/8.0).rgb;
 float blue_inlay = smoothstep(.025,.10,painted_color.b-max(painted_color.r,painted_color.g));
 float gold_inlay = smoothstep(.095,.175,painted_color.r-painted_color.g)*smoothstep(.055,.15,painted_color.g-painted_color.b);
 float ornament = max(blue_inlay,gold_inlay);
 vec3 detailed_paving = mix(limestone,painted_color,ornament);
 painted_color = mix(painted_color,detailed_paving,mood_coverage);
`+anchor);
 await fs.writeFile(path.join(root,'godot-arcana/art/resources/native_2d_plaza_mood_ground.gdshader'),shader);
 await fs.writeFile(path.join(root,base,'placement-changes.json'),JSON.stringify({
  approval:'User: ㅇㅇ (2026-10-31), approved concept-v1.png and game asset production/application.',
  scene:scenePath,existingTransformsChanged:0,existingLampVisuals:lamps,
  additions:accepted,staticClearance:'New footprints checked against authored collision rectangles, five bench access areas, and fountain clearance. This is not a play test.'
 },null,2)+'\n');
 console.log(JSON.stringify({added:accepted.length,bannerLampVisuals:changed,existingTransformsChanged:0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
