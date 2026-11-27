shader_type canvas_item;
render_mode blend_mix;
// Approved 512px stone pattern at native 64px/unit; current inlay geometry remains independent.
// Material scale changes the stone size, while the final sample grid stays 64px/unit.
uniform vec2 stone_pattern_period = vec2(512.0);
uniform float stone_sample_scale : hint_range(1.0, 4.0) = 4.0;
uniform float outer_inlay_strength : hint_range(0.0, 1.0) = 0.38;
uniform sampler2D stone_pattern : source_color, filter_nearest, repeat_enable;
uniform sampler2D ornament_mask_left : filter_nearest, repeat_disable;
uniform sampler2D ornament_mask_right : filter_nearest, repeat_disable;
uniform sampler2D city_ground_paint : source_color, filter_nearest, repeat_disable;
uniform sampler2D city_ground_paint_right : source_color, filter_nearest, repeat_disable;
uniform sampler2D fountain_paving : source_color, filter_nearest, repeat_disable;
uniform sampler2D grass_tex : source_color, filter_nearest, repeat_enable;
uniform sampler2D dirt_tex : source_color, filter_nearest, repeat_enable;
uniform vec4 city_plaza;
uniform vec2 city_mosaic_center;
uniform vec4 city_paving[24];
uniform int city_paving_count = 0;
uniform vec4 city_gardens[8];
uniform int city_garden_count = 0;
uniform vec4 city_ground_paint_bounds = vec4(0.0,8.0,72.0,48.0);
// Final screen-space footprint: the same ellipse as the fountain contact rim.
uniform vec2 fountain_paving_span = vec2(8.5,5.085231);
varying vec2 ground_position;
varying vec4 ground_tint;
void vertex() { ground_position = VERTEX / 64.0; ground_tint = COLOR; }
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
 vec2 p = ground_position * 16.0;
 float boundary = city_distance(p);
 float fringe = sin(floor(p.x)*1.7+floor(p.y)*.8)*1.5;
 vec2 uv = ground_position / 2.0;
 vec2 painted_uv = clamp((ground_position-city_ground_paint_bounds.xy)/city_ground_paint_bounds.zw,vec2(0.0),vec2(1.0));
 vec3 painted_color;
 if (painted_uv.x<.5) painted_color = texture(city_ground_paint,vec2(painted_uv.x*2.0,painted_uv.y)).rgb;
 else painted_color = texture(city_ground_paint_right,vec2((painted_uv.x-.5)*2.0,painted_uv.y)).rgb;
 // Exact vector coverage preserves gold stars and their antialiased edges.
 vec2 pixel_position = floor(ground_position*64.0)+vec2(.5);
 vec3 limestone = texture(stone_pattern,pixel_position*stone_sample_scale/stone_pattern_period).rgb;
 float ornament;
 if (painted_uv.x<.5) ornament = texture(ornament_mask_left,vec2(painted_uv.x*2.0,painted_uv.y)).a;
 else ornament = texture(ornament_mask_right,vec2((painted_uv.x-.5)*2.0,painted_uv.y)).a;
 // Keep the fountain mosaic prominent; let street inlays settle into the stone.
 float plaza_detail = 1.0-smoothstep(4.3,5.2,length(ground_position-city_mosaic_center/16.0));
 ornament *= mix(outer_inlay_strength,1.0,plaza_detail);
 painted_color = mix(limestone,painted_color,ornament);
 float painted_edge = max(boundary,-city_garden_distance(p));
 painted_edge += sin(p.x*.43+p.y*.71)*.32;
 float coverage = 1.0-smoothstep(-1.25,1.25,painted_edge);
 vec3 underlay = texture(grass_tex,uv).rgb;
 bool southern_track = p.y>=1024.0 && p.y<1260.0 && abs(p.x-576.0)<44.0+fringe;
 if (southern_track) underlay = texture(dirt_tex,uv).rgb;
 vec3 color = mix(underlay,painted_color,coverage);
 vec2 mosaic_uv = (ground_position-city_mosaic_center/16.0)/fountain_paving_span+.5;
 if (all(greaterThanEqual(mosaic_uv,vec2(0.0))) && all(lessThan(mosaic_uv,vec2(1.0)))) {
   vec4 mosaic = texture(fountain_paving,mosaic_uv);
   color = mix(color,mosaic.rgb,mosaic.a);
 }
 COLOR = vec4(color,1.0)*ground_tint;
}

