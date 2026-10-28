from pathlib import Path
import json,re,shutil
ROOT=Path(__file__).resolve().parents[1]
REGION=ROOT/'art-studies/regions/arcana-city-center'
BACKUP=REGION/'source/painted-ground-v1/baseline'
BACKUP.mkdir(parents=True,exist_ok=True)
paths=['godot-arcana/art/resources/illustrated_ground.gdshader','godot-arcana/scripts/illustrated_art.gd','godot-arcana/scripts/plaza_layout.gd']
for relative in paths:
    target=BACKUP/Path(relative).name
    if not target.exists(): shutil.copy2(ROOT/relative,target)
shader_path=ROOT/paths[0]
shader=shader_path.read_text(encoding='utf-8')
if 'uniform bool city_painted_ground' not in shader:
    shader=shader.replace('uniform bool authored_ground = false;','''// One continuous city floor painting; the tile atlas is bypassed in this mode.
uniform bool city_painted_ground = false;
uniform sampler2D city_ground_paint : source_color, filter_nearest, repeat_disable;
uniform vec4 city_ground_paint_bounds = vec4(0.0,0.0,72.0,56.0);
uniform vec4 city_gardens[8];
uniform int city_garden_count = 0;
uniform bool authored_ground = false;''')
    shader=shader.replace('void fragment() {','''// Garden edges are continuous ground shapes, independent of the old cell grid.
float city_garden_distance(vec2 point) {
 float nearest = 10000.0;
 for (int i=0; i<8; i++) {
  if (i>=city_garden_count) break;
  vec4 rect = city_gardens[i];
  vec2 half_size = rect.zw*.5;
  float radius = min(7.5,min(half_size.x,half_size.y)*.7);
  vec2 q = abs(point-rect.xy-half_size)-half_size+vec2(radius);
  float edge = length(max(q,vec2(0.0)))+min(max(q.x,q.y),0.0)-radius;
  nearest = min(nearest,edge);
 }
 return nearest;
}

void fragment() {''',1)
    old=' if (authored_ground && (has_cell || !worn)) {'
    if old not in shader: raise RuntimeError('Ground shader branch changed; inspect before patching')
    shader=shader.replace(old,''' if (city_painted_ground) {
   // Unique authored art is sampled over the whole city, never fract()/repeated.
   vec2 painted_uv = (world_position.xz-city_ground_paint_bounds.xy)/city_ground_paint_bounds.zw;
   vec3 painted_color = texture(city_ground_paint,clamp(painted_uv,vec2(0.0),vec2(1.0))).rgb;
   float painted_edge = max(boundary,-city_garden_distance(p));
   painted_edge += sin(p.x*.43+p.y*.71)*.32;
   float coverage = 1.0-smoothstep(-1.25,1.25,painted_edge);
   vec3 underlay = texture(grass_tex,uv).rgb;
   bool southern_track = p.y>=876.0 && p.y<1260.0 && abs(p.x-576.0)<44.0+fringe;
   if (southern_track) underlay = texture(dirt_tex,uv).rgb;
   color = mix(underlay,painted_color,coverage);
 } else if (authored_ground && (has_cell || !worn)) {''',1)
    shader_path.write_text(shader,encoding='utf-8')
art_path=ROOT/paths[1]
art=art_path.read_text(encoding='utf-8')
if '"city_ground_paint"' not in art:
    art=art.replace('    layout.configure_ground(mat)\n    preload("res://scripts/ground_tilemap.gd").bind(mat)', '''    mat.set_shader_parameter("city_painted_ground",true)
    mat.set_shader_parameter("city_ground_paint",preload("res://art/export/regions/arcana-city-center/paving-painted-v1.png"))
    mat.set_shader_parameter("city_ground_paint_bounds",Vector4(0,0,72,56))
    layout.configure_ground(mat)
    preload("res://scripts/ground_tilemap.gd").bind(mat)''',1)
    art_path.write_text(art,encoding='utf-8')
layout_path=ROOT/paths[2]
layout=layout_path.read_text(encoding='utf-8')
if '@export var garden_areas' not in layout:
    layout=layout.replace('@export var paved_areas:', '''@export var garden_areas: Array[Rect2] = []:
	set(value):
		garden_areas = value
		if _editor_ground != null: configure_ground(_editor_ground)
		if _reference_ground != null: configure_ground(_reference_ground)
@export var paved_areas:''',1)
    key='\tmat.set_shader_parameter("city_mosaic_center",mosaic_center*16.0)'
    if key not in layout: raise RuntimeError('Ground configuration changed')
    layout=layout.replace(key,key+'''
	if mat.shader == Illustrated.GROUND:
		var gardens = PackedVector4Array()
		gardens.resize(8)
		var garden_count = mini(garden_areas.size(),8)
		for i in range(garden_count):
			var rect = garden_areas[i]
			gardens[i] = Vector4(rect.position.x,rect.position.y,rect.size.x,rect.size.y)*16.0
		mat.set_shader_parameter("city_gardens",gardens)
		mat.set_shader_parameter("city_garden_count",garden_count)''',1)
    layout_path.write_text(layout,encoding='utf-8')
gardens=json.loads((REGION/'layout.json').read_text(encoding='utf-8'))['gardens']
serialized='garden_areas = Array[Rect2](['+', '.join('Rect2('+', '.join(map(str,r))+')' for r in gardens)+'])'
scene_path=ROOT/'godot-arcana/scenes/plaza.tscn'
scene=scene_path.read_text(encoding='utf-8')
if not re.search(r'^garden_areas = ',scene,re.M):
    scene=re.sub(r'^(paved_areas = .*?)$',lambda m:m.group(1)+'\n'+serialized,scene,count=1,flags=re.M)
    scene_path.write_text(scene,encoding='utf-8')
recipe_path=ROOT/'scripts/author-arcana-city.py'
recipe=recipe_path.read_text(encoding='utf-8')
if 'garden_areas = Array[Rect2]' not in recipe:
    recipe=recipe.replace('blocks[1] = root', 'root = root.rstrip() + "\\n' + serialized + '\\n\\n"\nblocks[1] = root',1)
    recipe_path.write_text(recipe,encoding='utf-8')
print('Painted city floor connected; repeated stone tiles bypassed; saved garden shapes rounded.')