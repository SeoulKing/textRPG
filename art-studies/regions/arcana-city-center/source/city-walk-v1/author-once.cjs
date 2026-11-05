const fs=require('fs');
const scenePath='godot-arcana/scenes/native_2d/plaza.tscn';
let text=fs.readFileSync(scenePath,'utf8');
if (text.includes('id="city_walk_quarter"') || fs.existsSync('godot-arcana/scenes/native_2d/city_walk_quarter.tscn')) throw Error('Already authored; edit saved scenes directly.');
const original=text;
const blocks=text.split(/(?=\[node )/);
function source(name){let i=blocks.findIndex(b=>b.startsWith('[node name="'+name+'" '));if(i<0)throw Error('Missing '+name);const head=blocks[i];const parent=head.match(/parent="([^"]+)"/)[1];const path=parent+'/'+name;let tail=[];for(let j=i+1;j<blocks.length;j++){if(blocks[j].startsWith('[node ')&&blocks[j].match(/parent="([^"]+)"/)?.[1].startsWith(path))tail.push(blocks[j]);else break;}return {head,tail,path};}
const props=[
 ['market_01','MarketCorner',[1456,2136],'city_market_stall','푸른 차양 시장'],
 ['market_01','MarketNorth',[1328,2000]],
 ['cafe_01','InnTerrace',[1632,2688],'city_cafe_terrace','여관 앞 테라스'],
 ['cafe_01','SchoolTerrace',[3456,2000]],
 ['townhouse_01','SchoolLaneHouse',[3408,2384]],
 ['barrels_01','MarketBarrels',[1280,2112]],
 ['crate_01','MarketCrates',[1288,2184]],
 ['basket_01','MarketBasket',[1544,2144]],
 ['flowerpot_01','MarketDoorFlowers',[1104,2064]],
 ['flowerpot_01','MarketFrontFlowers',[1600,2160]],
 ['flowerbed_01','InnTerraceFlowers',[1424,2672]],
 ['flowers_01','InnGardenFlowers',[1752,2752]],
 ['flowerpot_01','SchoolFlowersWest',[3376,1832],'city_garden_corner','学校 앞 꽃길'],
 ['flowerpot_01','SchoolFlowersEast',[3704,1832]],
 ['flowerbed_01','SchoolGardenFlowers',[3680,2016]],
 ['flowers_01','SchoolWildflowers',[3280,2112]],
 ['lamp_post_01','MarketLamp',[1120,2184]],
 ['lamp_post_01','InnTerraceLamp',[1776,2752]],
 ['lamp_post_01','SchoolWalkLamp',[3328,2056]],
 ['oak_01','MarketShadeTree',[1072,2256]],
 ['oak_01','InnTerraceTree',[1352,2752]],
 ['oak_01','SchoolLaneTree',[3160,2384]],
 ['flowerpot_01','SchoolHouseFlowers',[3632,2408]],
 ['flowers_01','MarketFlowerPatch',[1160,2264]]
];
const used=new Set();let body='[node name="WalkingQuarter" type="Node2D"]\nscript = ExtResource("city_life")\nmetadata/_edit_group_ = false\n\n[node name="StreetDetails" type="Node2D" parent="."]\n\n';
for(const [template,name,pos,id,label] of props){const s=source(template);let h=s.head.replace('name="'+template+'"','name="'+name+'"').replace(/parent="[^"]+"/,'parent="StreetDetails"').replace(/^position = .+$/m,'position = Vector2('+pos.join(', ')+')');if(id){h=h.replace(/script = ([^\n]+)/,'script = $1\ngameplay_id = "'+id+'"\ndisplay_name = "'+label.replace('学校','학교')+'"\ninteraction_kind = "city_corner"\ninteraction_point = Vector2(0, 14)');}h=h.replace(/source_path = .+/,'source_path = "CityWalk/'+template+'"');let nodes=h+s.tail.map(b=>b.replace('parent="'+s.path,'parent="StreetDetails/'+name)).join('');for(const m of nodes.matchAll(/ExtResource\("([^"]+)"\)/g))used.add(m[1]);body+=nodes.trimEnd()+'\n\n';}
body+='[node name="Residents" type="Node2D" parent="."]\n\n';
const people=[
 ['MarketWalker','city_walker_market','장 보러 온 주민',[1728,1960],[[1728,1960],[1776,2176],[2160,2160]],8.0,4.1],
 ['FountainWalker','city_walker_fountain','광장의 산책객',[2368,1568],[[2368,1568],[2560,1664],[2736,1840],[2816,2240]],9.0,3.2],
 ['InnWalker','city_walker_inn','여관의 여행자',[2400,2560],[[2400,2560],[2320,2800],[2208,2528]],8.5,5.2],
 ['SchoolWalker','city_walker_school','학교 방문객',[3400,1900],[[3400,1900],[3360,2000],[3600,2144]],7.5,3.8]
];
for(const [name,id,label,pos,route,speed,pause] of people){body+='[node name="'+name+'" type="Node2D" parent="Residents"]\nposition = Vector2('+pos.join(', ')+')\nscript = ExtResource("city_resident")\ngameplay_id = "'+id+'"\nmodel_kind = "city-resident"\ndisplay_name = "'+label+'"\ninteraction_kind = "city_resident"\nroute = PackedVector2Array('+route.flat().join(', ')+')\nstroll_speed = '+speed+'\npause_seconds = '+pause+'\n\n';}
let resources=['[ext_resource type="Script" path="res://scripts/native_2d_city_life.gd" id="city_life"]','[ext_resource type="Script" path="res://scripts/native_2d_city_resident.gd" id="city_resident"]'];
for(const id of used){const line=text.split('\n').find(l=>l.startsWith('[ext_resource ')&&l.includes('id="'+id+'"'));if(!line)throw Error('Missing resource '+id);resources.push(line.trimEnd());}
const quarter='[gd_scene load_steps='+(resources.length+1)+' format=3]\n\n'+resources.join('\n')+'\n\n'+body;
fs.writeFileSync('godot-arcana/scenes/native_2d/city_walk_quarter.tscn',quarter);
const moves=[['townhouse_03',[960,2016]],['bookshop_01',[976,2672]]];
for(const [name,pos]of moves){const s=source(name);text=text.replace(s.head,s.head.replace(/^position = .+$/m,'position = Vector2('+pos.join(', ')+')'));}
if(text.includes('id="city_walk_quarter"'))throw Error('Quarter already connected');
text=text.replace(/load_steps=(\d+)/,(_,v)=>'load_steps='+(Number(v)+1));
text=text.replace('[sub_resource ', '[ext_resource type="PackedScene" path="res://scenes/native_2d/city_walk_quarter.tscn" id="city_walk_quarter"]\n\n[sub_resource ');
text+='\n[node name="WalkingQuarter" parent="Placements" instance=ExtResource("city_walk_quarter")]\n';
fs.writeFileSync('art-studies/regions/arcana-city-center/source/city-walk-v1/before-plaza.tscn',original);
fs.writeFileSync(scenePath,text);
fs.writeFileSync('art-studies/regions/arcana-city-center/source/city-walk-v1/composition.json',JSON.stringify({approvedConcept:'../plaza-mood-v1/concept-v1.png',sourceScene:'godot-arcana/scenes/native_2d/city_walk_quarter.tscn',note:'The saved scenes are the editable source. Do not regenerate them over manual edits.',reusedProps:props,movedPlacements:moves,residents:people},null,2)+'\n');
console.log(JSON.stringify({props:props.length,residents:people.length,moved:moves.map(v=>v[0]),source:'city_walk_quarter.tscn'}));