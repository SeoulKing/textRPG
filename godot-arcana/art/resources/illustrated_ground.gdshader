shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
uniform vec4 base_color : source_color = vec4(1.0);
uniform float motion_time = 0.0;
uniform float wind = 0.0;
uniform float glow = 0.0;
uniform int surface_style = 0;
uniform vec4 stone_joint : source_color = vec4(0.431373,0.400000,0.466667,1.0);
uniform vec4 stone_side : source_color = vec4(0.713725,0.666667,0.650980,1.0);
uniform int surface_pattern = 0;
uniform vec4 water_light : source_color = vec4(0.611765,0.858824,0.827451,1.0);
uniform vec4 water_foam : source_color = vec4(0.839216,0.933333,0.882353,1.0);
uniform bool entity_anchor_enabled = false;
uniform vec3 entity_anchor = vec3(0.0);
uniform bool editor_preview = false;
uniform bool ground = false;
uniform bool terrain = false;
uniform vec4 city_plaza = vec4(576.0,462.8,144.0,128.0);
uniform vec2 city_mosaic_center = vec2(576.0,462.8);
uniform vec4 city_paving[24];
uniform int city_paving_count = 0;
uniform bool floor_pattern = false;
uniform vec4 paving_base : source_color = vec4(0.827451,0.760784,0.654902,1.0);
uniform vec4 paving_light : source_color = vec4(0.878431,0.819608,0.725490,1.0);
uniform vec4 paving_joint : source_color = vec4(0.643137,0.592157,0.494118,1.0);
uniform vec4 mosaic_blue : source_color = vec4(0.239216,0.384314,0.741176,1.0);
uniform vec4 mosaic_gold : source_color = vec4(0.835294,0.643137,0.309804,1.0);
uniform vec2 fountain_paving_span = vec2(8.5,7.191368);
uniform sampler2D fountain_paving : source_color, filter_nearest, repeat_disable;
uniform sampler2D grass_tex : source_color, filter_nearest, repeat_enable;
uniform sampler2D dirt_tex : source_color, filter_nearest, repeat_enable;
uniform sampler2D stone_tex : source_color, filter_nearest, repeat_enable;
// One continuous city floor painting; the tile atlas is bypassed in this mode.
uniform bool city_painted_ground = false;
uniform sampler2D city_ground_paint : source_color, filter_nearest, repeat_disable;
uniform bool city_ground_paint_split = false;
uniform sampler2D city_ground_paint_right : source_color, filter_nearest, repeat_disable;
uniform vec4 city_ground_paint_bounds = vec4(0.0,0.0,72.0,56.0);
uniform vec4 city_gardens[8];
uniform int city_garden_count = 0;
uniform bool authored_ground = false;
uniform sampler2D ground_cells : filter_nearest, repeat_disable;
uniform sampler2D ground_atlas : source_color, filter_nearest, repeat_disable;
uniform vec2 ground_map_size = vec2(72.0,90.0);
varying vec3 world_position;
varying vec3 paint_position;
varying vec3 paint_normal;
void vertex() {
	float phase = MODEL_MATRIX[3].x * .10 + MODEL_MATRIX[3].z * .07;
	float sway = floor(sin(motion_time * 1.3 + phase) * 1.25) / 16.0;
	VERTEX.x += wind * sway * clamp((VERTEX.y - .65) / 2.0, 0.0, 1.0);
	paint_position = VERTEX;
	paint_normal = NORMAL;
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	// Flatten only the main view. Shadow passes keep the true 3D geometry.
	bool main_view = dot(normalize(INV_VIEW_MATRIX[2].xyz), normalize(MAIN_CAM_INV_VIEW_MATRIX[2].xyz)) > .9999;
	if (main_view && !editor_preview) {
		vec3 anchor = entity_anchor_enabled ? entity_anchor : MODEL_MATRIX[3].xyz;
		vec3 anchor_view = (VIEW_MATRIX * vec4(anchor, 1.0)).xyz;
		view.z = ground ? -185.0 + world_position.y * 3.0 : -150.0 + dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz)) * .18 + (view.z - anchor_view.z) * .002;
	}
	POSITION = PROJECTION_MATRIX * view;
}
float hash_cell(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float city_distance(vec2 p) {
	float distance = (length((p-city_plaza.xy)/city_plaza.zw)-1.0)*min(city_plaza.z,city_plaza.w);
	for (int i=0;i<24;i++) {
		if (i>=city_paving_count) break;
		vec4 rect = city_paving[i];
		vec2 q = abs(p-rect.xy-rect.zw*.5)-rect.zw*.5;
		distance = min(distance,length(max(q,vec2(0.0)))+min(max(q.x,q.y),0.0));
	}
	return distance;
}
// Illustrated ivory paving: fitted slabs, shallow bevels and restrained wear.
// All marks are fixed to the authored ground, with no texture/noise overlay.
vec3 city_stone(vec2 point, float boundary) {
	vec2 p = floor(point);
	float row = floor(p.y/14.0);
	float offset = mod(row,2.0)*11.0;
	vec2 cell = vec2(floor((p.x+offset)/22.0),row);
	vec2 local = vec2(mod(p.x+offset,22.0),mod(p.y,14.0));
	float seed = hash_cell(cell);
	// Occasional half slabs interrupt the uniform brick-wall grid.
	float width = 22.0;
	if (seed>.72) {
		cell.x = cell.x*2.0+floor(local.x/11.0);
		local.x = mod(local.x,11.0);
		width = 11.0;
		seed = hash_cell(cell+vec2(31.0,8.0));
	}
	vec3 color = paving_base.rgb;
	if (seed<.22) color = mix(paving_base.rgb,paving_joint.rgb,.43);
	else if (seed>.68) color = paving_light.rgb;
	else if (seed>.47) color = mix(paving_base.rgb,vec3(.827451,.694118,.462745),.16);
	// A small inset edge makes each slab read as stone, not a flat rectangle.
	float edge = min(min(local.x,width-1.0-local.x),min(local.y,13.0-local.y));
	if (edge<.5) color = mix(paving_joint.rgb,paving_base.rgb,.18);
	else if (local.x<2.0 || local.y<2.0) color = mix(color,paving_light.rgb,.32);
	else if (local.x>width-3.0 || local.y>11.0) color = mix(color,paving_joint.rgb,.28);
	// Broad mineral seams and short hairline cracks stay inside a few slabs.
	float vein = local.y-local.x*.24-4.0-seed*3.0;
	if (seed>.35 && seed<.53 && abs(vein)<.7 && edge>2.0)
		color = mix(color,paving_joint.rgb,.23);
	if (seed>.90 && edge>1.0) {
		float crack = abs(local.x-(width*.55+abs(local.y-6.0)*.42));
		if (crack<.55 && local.y>3.0 && local.y<10.0) color = mix(color,paving_joint.rgb,.65);
	}
	if (seed<.14 && local.x+local.y<3.0) color = paving_joint.rgb;
	// An inset coping course follows the saved plaza and connected forecourts.
	if (boundary> -5.0) {
		color = mix(paving_base.rgb,paving_joint.rgb,.22);
		if (mod(p.x+p.y,12.0)<1.0) color = paving_joint.rgb;
		if (boundary> -1.15) color = paving_joint.rgb;
		else if (boundary< -3.8) color = paving_light.rgb;
	}
	// Basin mesh, paving and round collision share the placement ground origin.
	vec2 relative = p-city_mosaic_center;
	float radius = length(relative);
	float angle = atan(relative.y,relative.x);
	// Segmented cobalt tesserae, ivory joints and double gold compass rings.
	if (radius>43.0 && radius<67.0) {
		if (abs(radius-44.0)<1.2 || abs(radius-66.0)<1.2) color = mosaic_gold.rgb;
		if (radius>55.0 && radius<61.0) {
			float segment = fract((angle+3.141593)*32.0/6.283185);
			color = segment<.11 ? paving_light.rgb : mosaic_blue.rgb;
		}
		float spoke = abs(sin(angle*8.0));
		if (radius>47.0 && radius<52.0 && spoke<.18) color = mosaic_gold.rgb;
	}
	// Inlaid compass diamonds repeat along the main approach, like the source art.
	vec2 road_relative = p-city_plaza.xy;
	vec2 motif = abs(vec2(road_relative.x,mod(road_relative.y+40.0,80.0)-40.0));
	float diamond = motif.x+motif.y;
	if (radius>73.0 && diamond<8.0) {
		color = mosaic_gold.rgb;
		if (diamond<6.0) color = mosaic_blue.rgb;
		if (abs(motif.x-motif.y)<.8 || diamond<1.8) color = paving_light.rgb;
	}
	return color;
}
vec3 paint(vec3 color, vec2 leaf_uv) {
	vec3 normal = abs(paint_normal);
	vec2 uv = normal.y>.65 ? paint_position.xz : (normal.z>normal.x ? paint_position.xy : paint_position.zy);
	vec2 texel = floor(uv*16.0);
	float shade = 0.0;
	if (surface_style == 1) {
		// Irregular broad leaf strokes. No smooth sphere or triangle gradients.
		vec2 row = vec2(floor((texel.x+floor(texel.y/3.0)*2.0)/5.0),floor(texel.y/3.0));
		vec2 pos = vec2(mod(texel.x+floor(texel.y/3.0)*2.0,5.0),mod(texel.y,3.0));
		float seed = hash_cell(row);
		bool tip = (pos.y==0.0 && pos.x>0.0 && pos.x<4.0) || (pos.y==1.0 && pos.x<3.0);
		shade = tip ? (seed>.32 ? .18 : .04) : (seed>.55 ? -.10 : -.20);
	} else if (surface_style == 8 || surface_style == 9) {
		// Fan-local UVs survive mesh batching: leaves follow each bough rather
		// than a world-space noise overlay. Keep the green hue in every mark.
		bool needles = surface_style == 9;
		vec2 p = leaf_uv * (needles ? vec2(5.0,4.0) : vec2(3.6,4.2));
		p.x += p.y * .38;
		float row = floor(p.y);
		p.x += mod(row,2.0)*.5;
		vec2 cell = floor(p);
		vec2 leaf = fract(p)-.5;
		float seed = hash_cell(cell);
		// Pointed paired blades, with open green space between leaf groups.
		float blade = abs(leaf.x+leaf.y*.5)*(needles ? 2.2 : 1.0)+abs(leaf.y)*.85;
		bool leaf_shape = blade < (needles ? .24 : .36);
		if (leaf_shape && seed>.38) shade = leaf.x<-.06 ? -.12 : .055;
		else if (seed<.16 && blade<.46) shade = -.07;
	} else if (surface_style == 2) {
		vec2 cell = floor(vec2(texel.x+floor(texel.y/5.0)*4.0,texel.y)/vec2(8.0,5.0));
		vec2 pos = mod(vec2(texel.x+floor(texel.y/5.0)*4.0,texel.y),vec2(8.0,5.0));
		shade = pos.y==0.0 || pos.x==0.0 ? -.23 : (pos.y==1.0 ? .14 : (hash_cell(cell)-.5)*.12);
	} else if (surface_style == 3) {
		float grain = hash_cell(vec2(floor(texel.x/2.0),floor(texel.y/9.0)));
		shade = mod(texel.x+floor(texel.y/12.0),7.0)==0.0 ? -.21 : (grain>.7 ? .09 : -.03);
	} else if (surface_style == 4) {
		vec2 pos = mod(vec2(texel.x+floor(texel.y/7.0)*5.0,texel.y),vec2(13.0,7.0));
		shade = pos.y==0.0 || pos.x==0.0 ? -.13 : (hash_cell(floor(texel/vec2(5.0,3.0)))>.85 ? .06 : 0.0);
	} else if (surface_style == 5) {
		// Large seam/fold clusters, never photographic fabric noise.
		shade = mod(texel.x,6.0)==0.0 ? -.12 : (mod(texel.x,6.0)==1.0 ? .06 : 0.0);
	} else if (surface_style == 6) {
		shade = mod(texel.x+floor(texel.y/4.0),4.0)==0.0 ? -.19 : .04;
	} else if (surface_style == 7) {
		// Fountain masonry follows the actual 20 radial coping stones. Their
		// old subpixel gaps vanished after nearest scaling and palette mapping.
		vec2 radial = paint_position.xz;
		float radius = length(radial);
		float segment = (atan(radial.y,radial.x)+6.283185)*20.0/6.283185;
		float along = fract(segment);
		float joint_distance = min(along,1.0-along)*6.283185*radius/20.0;
		if (paint_position.y>.18 && radius>1.84 && joint_distance<.05) {
			return stone_joint.rgb;
		}
		// Keep the downward/vertical faces darker than the broad sunlit caps.
		if (paint_normal.y<.35) color = mix(color,stone_side.rgb,.55);
		if (paint_position.y<.19) color *= .84;
		return color;
	}
	return color*(1.0+shade);
}

float ground_seed(vec2 cell) {
 return fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
}

vec3 ground_details(vec3 color, vec2 point, float boundary, bool paved, bool worn) {
 // Fixed logical source pixels: 64 per horizontal unit, 45.25 projected depth.
 // Shapes are clusters on this grid, never an animated noise texture.
 vec2 pixel=floor(point*vec2(64.0,45.254834));
 vec2 cell=floor(pixel/64.0);
 vec2 local=mod(pixel,64.0);
 float seed=ground_seed(cell);
 vec3 joint=vec3(.643137,.592157,.494118);
 vec3 stone_light=vec3(.878431,.819608,.725490);
 // Broad mineral/soil patches interrupt the repeated texture gently.
 float patch=ground_seed(floor(pixel/181.0));
 color=mix(color,patch>.53?stone_light:joint,paved?.055:.025);
 if(paved) {
   // A shallow border course follows the saved path boundary, not each tile.
   if(boundary> -3.4) {
     float course=mod(pixel.x+pixel.y,23.0);
     color=mix(color,joint,.24);
     if(course<1.0) color=mix(color,joint,.45);
     if(boundary> -1.2) color=mix(color,joint,.38);
     else if(boundary< -2.9) color=mix(color,stone_light,.35);
   }
   // Sparse hairline fractures and small bevel chips: most slabs stay clear.
   vec2 at=vec2(12.0+floor(seed*29.0),19.0+floor(fract(seed*7.3)*21.0));
   vec2 d=local-at;
   float crack=floor(d.x*.45)+floor(max(d.x-5.0,0.0)*-.8);
   if(seed>.70&&d.x>=0.0&&d.x<13.0&&abs(d.y-crack)<.55&&boundary< -3.4) {
     color=mix(color,joint,.78);
   } else if(seed<.16&&abs(d.x)<2.0&&abs(d.y)<1.5) {
     color=mix(color,stone_light,.65);
   }
   // Tiny moss clusters are confined to the damp outer joints.
   if(boundary> -1.5&&seed<.23&&local.x>45.0&&local.x<51.0&&mod(pixel.y,7.0)<2.0)
     color=mix(color,vec3(.400,.478,.294),.72);
 } else {
   // Rounded pebbles on bare soil, with a light cap and a contact edge.
   vec2 pebble=local-vec2(15.0+floor(seed*31.0),16.0+floor(fract(seed*5.7)*27.0));
   float radius=length(pebble/vec2(3.0,2.0));
   if(worn&&seed>.35&&radius<1.0) {
     color=pebble.y<0.0?vec3(.714,.667,.565):vec3(.522,.482,.396);
   }
   // A few folded leaves on soil/grass; no repeated carpet of speckles.
   vec2 leaf=local-vec2(38.0,43.0);
   if(seed>.86&&abs(leaf.x)<3.0&&abs(leaf.y-floor(leaf.x*.5))<1.2) {
     color=leaf.y<leaf.x*.5?vec3(.643,.529,.322):vec3(.478,.416,.290);
   }
   // Keep grass detail near the worn edge grouped into short blade silhouettes.
   if(boundary>0.0&&boundary<5.6) {
     float edge=ground_seed(floor(pixel/8.0));
     if(edge>.64&&mod(pixel.x,8.0)<2.0&&mod(pixel.y,8.0)>3.0)
       color=mix(color,vec3(.349,.478,.302),.55);
   }
 }
 return color;
}

// Garden edges are continuous ground shapes, independent of the old cell grid.
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

void fragment() {
 vec2 p=world_position.xz*16.0;
 if(p.x>940.0 && p.y>842.0 && p.y<1200.0) discard;
 float boundary=city_distance(p);
 float fringe=sin(floor(p.x)*1.7+floor(p.y)*.8)*1.5;
 bool paved=boundary<0.0 && p.y<775.0;
 bool worn=(boundary<5.6 && p.y<775.0)||(p.y>=752.0&&p.y<1260.0&&abs(p.x-576.0)<44.0+fringe);
 vec2 ground_cell = floor(world_position.xz);
 bool has_cell = authored_ground && all(greaterThanEqual(ground_cell,vec2(0.0))) && all(lessThan(ground_cell,ground_map_size));
 vec4 cell_data = floor(texture(ground_cells,(ground_cell+.5)/ground_map_size)*255.0+.5);
 if (has_cell) paved = cell_data.b>1.5;
 // One authored texel is one source render pixel at the default camera density.
 vec2 uv=world_position.xz/2.0;
 vec3 color=paved?texture(stone_tex,uv).rgb:(worn?texture(dirt_tex,uv).rgb:texture(grass_tex,uv).rgb);
 if(paved&&boundary> -1.5) color=mix(color,texture(dirt_tex,uv).rgb,.28);
 if (city_painted_ground) {
   // Unique authored art is sampled over the whole city, never fract()/repeated.
   vec2 painted_uv = (world_position.xz-city_ground_paint_bounds.xy)/city_ground_paint_bounds.zw;
   painted_uv = clamp(painted_uv,vec2(0.0),vec2(1.0));
   vec3 painted_color;
   if (city_ground_paint_split) {
     if (painted_uv.x<.5) painted_color = texture(city_ground_paint,vec2(painted_uv.x*2.0,painted_uv.y)).rgb;
     else painted_color = texture(city_ground_paint_right,vec2((painted_uv.x-.5)*2.0,painted_uv.y)).rgb;
   } else painted_color = texture(city_ground_paint,painted_uv).rgb;
   float painted_edge = max(boundary,-city_garden_distance(p));
   painted_edge += sin(p.x*.43+p.y*.71)*.32;
   float coverage = 1.0-smoothstep(-1.25,1.25,painted_edge);
   vec3 underlay = texture(grass_tex,uv).rgb;
   bool southern_track = p.y>=876.0 && p.y<1260.0 && abs(p.x-576.0)<44.0+fringe;
   if (southern_track) underlay = texture(dirt_tex,uv).rgb;
   color = mix(underlay,painted_color,coverage);
 } else if (authored_ground && (has_cell || !worn)) {
   vec2 atlas_cell = has_cell ? cell_data.rg : vec2(mod(abs(ground_cell.x*7.0+ground_cell.y*11.0),4.0),0.0);
   vec2 local_pixel = floor(fract(world_position.xz)*vec2(64.0,45.0));
   vec2 atlas_size = vec2(textureSize(ground_atlas,0));
   vec4 tile = texture(ground_atlas,(atlas_cell*vec2(64.0,45.0)+local_pixel+.5)/atlas_size);
   vec2 below_cell = vec2(mod(cell_data.a,8.0),floor(cell_data.a/8.0));
   vec3 below = texture(ground_atlas,(below_cell*vec2(64.0,45.0)+local_pixel+.5)/atlas_size).rgb;
   color = mix(below,tile.rgb,tile.a);
 } else {
   color=ground_details(color,world_position.xz,boundary,paved,worn);
 }
 // A separate authored X/Z mosaic replaces the old procedural inlay cutouts.
 // X keeps 64px/unit; Z is calibrated to the painted basin ellipse at this pitch.
 vec2 mosaic_uv = (world_position.xz-city_mosaic_center/16.0)/fountain_paving_span+.5;
 if (all(greaterThanEqual(mosaic_uv,vec2(0.0))) && all(lessThan(mosaic_uv,vec2(1.0)))) {
   vec4 mosaic = texture(fountain_paving,mosaic_uv);
   color = mix(color,mosaic.rgb,mosaic.a);
 }
 ALBEDO=color*(vec3(local_ambient)+local_irradiance(world_position,vec3(0.0,1.0,0.0)));
}
