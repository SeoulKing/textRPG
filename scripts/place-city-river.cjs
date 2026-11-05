const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),plaza=path.join(root,'godot-arcana/scenes/native_2d/plaza.tscn'),quarter=path.join(root,'godot-arcana/scenes/native_2d/city_walk_quarter.tscn'),target=path.join(root,'godot-arcana/scenes/native_2d/city_river_quarter.tscn'),study=path.join(root,'art-studies/regions/arcana-city-center/source/river-v1');
let scene=fs.readFileSync(plaza,'utf8');
if(scene.includes('name="RiverQuarter"'))throw Error('River already connected. Edit the saved scenes directly; do not regenerate manual placements.');
const changes=[];
function moveBlocks(text,fn){return text.replace(/^(\[node name="([^"]+)"[^\n]*\]\r?\n)([\s\S]*?)(?=^\[node|(?![\s\S]))/gm,(all,header,name,body)=>{
 const pos=body.match(/^position = Vector2\(([-\d.]+), ([-\d.]+)\)/m);if(!pos)return all;
 const before=[+pos[1],+pos[2]],after=fn(name,before,body);
 if(!after)return all;changes.push({node:name,before,after});return header+body.replace(pos[0],'position = Vector2('+after.join(', ')+')');
});}
const specific={
 'lamp_post_06':[2168,2352],'lamp_post_07':[2440,2352],
 'plaza_canopy_sw_01':[1840,2288],'plaza_canopy_sw_02':[1760,2320],
 'plaza_canopy_south_01':[1840,3048],'plaza_canopy_south_02':[1968,3104],
 'plaza_canopy_se_01':[2800,3056],'plaza_canopy_se_02':[2640,3184],
 'plaza_market_east':[2704,2944],'townhouse_04':[3200,3264],
 'birch_01':[1904,2256],'birch_06':[640,2912],'birch_07':[3808,2272],
 'workshops_02':[3200,3040],'bookshop_01':[439,3056],'bookshop_02':[3552,3040],
 'hedge_08':[1920,2296],'crate_03':[1840,2264],'barrels_02':[1840,2320],
 'flowerbed_02':[2560,2320],'flowerbed_03':[2032,2864],'flowerbed_04':[2608,2864],
 'flowerbed_10':[1936,2928],'flowerbed_11':[2624,2928],
 'flowerpot_04':[1808,2848],'flowerpot_03':[793.6,2320],
 'lamp_post_08':[1812,3064],'lamp_post_09':[1623,3064],
 'flowers_04':[2000,2296],'flowers_09':[563.2,2296]
};
scene=moveBlocks(scene,(name,p,body)=>{
 if(!body.includes('script = ExtResource("1_rimt7")'))return null;
 if(body.includes('gameplay_id = "arcana_inn"'))return [p[0],3056];
 if(body.includes('gameplay_id = "park_bench_05"'))return [1968,2240];
 return specific[name]||null;
});
let walk=fs.readFileSync(quarter,'utf8');
walk=moveBlocks(walk,(name,p)=>{
 const v={'InnTerrace':[1632,3072],'InnTerraceFlowers':[1424,3056],'InnGardenFlowers':[1752,3136],'InnTerraceLamp':[1776,3136],'InnTerraceTree':[1352,3136],'SchoolLaneTree':[3160,2280],'SchoolHouseFlowers':[3632,2296],'InnWalker':[2304,2848]};
 return v[name]||null;
});
walk=walk.replace('route = PackedVector2Array(2400, 2560, 2320, 2800, 2208, 2528)','route = PackedVector2Array(2304, 2848, 2304, 2944, 2176, 2944, 2304, 2848)');
const template=scene.match(/\[node name="lamp_post_06"[^\n]*\]\r?\n[\s\S]*?(?=\[node name="lamp_post_07")/)[0];
const sections=[
'[gd_scene load_steps=8 format=3]',
'[ext_resource type="Script" path="res://scripts/native_2d_river.gd" id="river"]',
'[ext_resource type="Script" path="res://scripts/native_2d_placement.gd" id="placement"]',
'[ext_resource type="Shader" path="res://art/resources/native_2d_river.gdshader" id="water_shader"]',
'[ext_resource type="Texture2D" path="res://art/export/city-river-v1/water.res" id="water"]',
'[ext_resource type="Texture2D" path="res://art/export/city-river-v1/bridge.res" id="bridge"]',
'[ext_resource type="Texture2D" path="res://art/export/city-river-v1/bank.res" id="bank"]',
'[sub_resource type="ShaderMaterial" id="RiverWater"]\nshader = ExtResource("water_shader")',
'[node name="RiverQuarter" type="Node2D"]\ntexture_filter = 1\nscript = ExtResource("river")\nmetadata/approved_concept = "art-studies/regions/arcana-city-center/source/river-v1/concept-v1.png"',
'[node name="Water" type="Polygon2D" parent="."]\nz_index = -30\nposition = Vector2(0, 2400)\nmaterial = SubResource("RiverWater")\ntexture = ExtResource("water")\npolygon = PackedVector2Array(0, 0, 4096, 0, 4096, 320, 0, 320)\nmetadata/casts_sun_shadow = false',
'[node name="WaterBoundary" type="Node2D" parent="."]\nscript = ExtResource("placement")\nmodel_kind = "river-boundary"\ncollision_parts = Array[Rect2]([Rect2(32, 592, 521, 102), Rect2(599, 592, 393, 102)])\ncasts_sun_shadow = false\neditor_description = "Water and embankments block passage. The clear bridge corridor is logical X553..599; all geometry comes from this saved scene."',
'[node name="Bridge" type="Node2D" parent="."]\nposition = Vector2(2144, 2288)\nmetadata/casts_sun_shadow = false',
'[node name="Deck" type="Sprite2D" parent="Bridge"]\nz_index = -25\ntexture = ExtResource("bridge")\ncentered = false\nmetadata/casts_sun_shadow = false'
];
for(const [name,y]of [['NorthBank',2400],['SouthBank',2776]]){
 sections.push('[node name="'+name+'" type="Node2D" parent="."]\nposition = Vector2(0, '+y+')\nmetadata/casts_sun_shadow = false');
 for(const [part,x,width]of [['West',0,2144],['East',2464,1632]])sections.push('[node name="'+part+'" type="Sprite2D" parent="'+name+'"]\nz_index = -24\ntexture_repeat = 2\nposition = Vector2('+x+', -56)\ntexture = ExtResource("bank")\ncentered = false\nregion_enabled = true\nregion_rect = Rect2(0, 0, '+width+', 56)\nmetadata/casts_sun_shadow = false');
}
fs.writeFileSync(target,sections.join('\n\n')+'\n');
// New lamps reuse the original authored lamp image/registration, no new scale.
let lamps='';
for(const [name,x,y]of [['river_lamp_sw',2168,2768],['river_lamp_se',2440,2768],['river_bank_lamp_01',576,2376],['river_bank_lamp_02',1216,2376],['river_bank_lamp_03',1856,2376],['river_bank_lamp_04',3136,2376],['river_bank_lamp_05',3776,2376]]){
 lamps+=template.replaceAll('lamp_post_06',name).replace(/position = Vector2\([^)]+\)/,'position = Vector2('+x+', '+y+')');
}
scene+= '\n'+lamps;
scene=scene.replace(/load_steps=(\d+)/,(_,n)=>'load_steps='+(+n+1));
const beforeSub=scene.indexOf('[sub_resource');
scene=scene.slice(0,beforeSub)+'[ext_resource type="PackedScene" path="res://scenes/native_2d/city_river_quarter.tscn" id="city_river_quarter"]\n\n'+scene.slice(beforeSub);
scene+='\n[node name="RiverQuarter" parent="Placements" instance=ExtResource("city_river_quarter")]\n';
fs.writeFileSync(plaza,scene);fs.writeFileSync(quarter,walk);fs.writeFileSync(path.join(study,'layout-changes.json'),JSON.stringify({river:{waterPixels:[0,2400,4096,320],bridgePixels:[2144,2288,320,511],walkableBridgeLogical:[553,592,46,102]},moves:changes},null,2)+'\n');
console.log('RIVER_PLACED saved independent scene; moved '+changes.length+' existing placements without changing scale/IDs.');
