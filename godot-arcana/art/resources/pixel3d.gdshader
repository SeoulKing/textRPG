shader_type spatial;
render_mode specular_disabled;
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
uniform vec4 city_paving[24];
uniform int city_paving_count = 0;
uniform bool floor_pattern = false;
uniform vec4 paving_base : source_color = vec4(0.878431,0.819608,0.725490,1.0);
uniform vec4 paving_light : source_color = vec4(0.933333,0.878431,0.784314,1.0);
uniform vec4 paving_joint : source_color = vec4(0.713725,0.666667,0.650980,1.0);
uniform vec4 mosaic_blue : source_color = vec4(0.239216,0.384314,0.741176,1.0);
uniform vec4 mosaic_gold : source_color = vec4(0.835294,0.643137,0.309804,1.0);
uniform sampler2D grass_tex : source_color, filter_nearest, repeat_enable;
uniform sampler2D dirt_tex : source_color, filter_nearest, repeat_enable;
uniform sampler2D stone_tex : source_color, filter_nearest, repeat_enable;
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
		view.z = ground ? -185.0 + world_position.y * 3.0 : -150.0 + anchor.z * .18 + (view.z - anchor_view.z) * .002;
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
vec3 paint(vec3 color) {
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
		vec2 radial = paint_position.xz-vec2(0.0,-0.7);
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
void fragment() {
	vec3 color = paint(base_color.rgb);
	if (ground && terrain) {
		vec2 p = world_position.xz * 16.0;
		if (p.x > 940.0 && p.y > 842.0 && p.y < 1200.0) discard;
		float paving_distance = city_distance(p);
		vec2 uv = world_position.xz / 8.0;
		float fringe = sin(floor(p.x)*1.7+floor(p.y)*.8)*1.5;
		bool paved = paving_distance < 0.0 && p.y < 775.0;
		bool worn = (paving_distance < 5.6 && p.y < 775.0) || (p.y >= 752.0 && p.y < 1260.0 && abs(p.x-576.0) < 44.0+fringe);
		color = paved ? texture(stone_tex,uv).rgb : (worn ? texture(dirt_tex,uv).rgb : texture(grass_tex,uv).rgb);
		if (paved) {
			// Cool ivory slabs keep the plaza separate from warm dirt. Sparse
			// blue/gold inlays echo the old city map. Saved scene defines paving.
			vec2 slab = vec2(p.x+mod(floor(p.y/12.0),2.0)*9.0,p.y);
			vec2 joint = mod(floor(slab),vec2(18.0,12.0));
			float seed = hash_cell(floor(slab/vec2(18.0,12.0)));
			color = seed>.53 ? paving_base.rgb : paving_light.rgb;
			if (joint.x<1.0 || joint.y<1.0) color = paving_joint.rgb;
			float radial = length(p-city_plaza.xy);
			if (abs(radial-47.0)<.75 || abs(radial-63.0)<.65) color = mosaic_gold.rgb;
			vec2 diamond = vec2(abs(p.x-city_plaza.x),abs(mod(p.y-city_plaza.y+40.0,80.0)-40.0));
			if (radial>64.0 && diamond.x+diamond.y<5.0) color = mosaic_blue.rgb;
			if (radial>64.0 && diamond.x+diamond.y<1.5) color = mosaic_gold.rgb;
		}
	}
	if (floor_pattern) color = texture(stone_tex,world_position.xz/2.0).rgb;
	// Fixed world-space pixel clusters, never animated noise or row warping.
	if (surface_pattern == 1) {
		vec2 cell = floor(world_position.xz * 16.0 + world_position.y * vec2(8.0, 4.0));
		vec2 cluster = floor(cell / 4.0);
		float seed = fract(sin(dot(cluster, vec2(17.13, 91.7))) * 43758.5453);
		vec2 within = mod(cell, 4.0);
		bool leaf_tip = within.x + within.y < 3.0 && within.x > 0.0;
		if (seed > 0.64 && leaf_tip) color = mix(color, vec3(0.76, 0.80, 0.60), 0.30);
		else if (seed < 0.20 && within.x + within.y > 4.0) color *= 0.82;
	} else if (surface_pattern == 2) {
		vec2 cell = floor(vec2(world_position.x + world_position.z, world_position.y) * 16.0);
		if (mod(cell.y, 7.0) == 0.0 && mod(cell.x + floor(cell.y / 7.0) * 3.0, 13.0) < 5.0) color *= 0.82;
	} else if (surface_pattern == 3) {
		// Object-local, source-pixel water. The visual clock pauses with the game.
		vec2 p = floor((paint_position.xz-vec2(0.0,-0.7))*16.0)/16.0;
		float time = floor(motion_time*8.0)/8.0;
		float radius = length(p);
		float impact = min(min(length(p-vec2(1.32,0.0)),length(p+vec2(1.32,0.0))),min(length(p-vec2(0.0,1.32)),length(p+vec2(0.0,1.32))));
		float ripple = fract(impact*2.8-time*0.75);
		float reflection = sin(p.x*9.0+p.y*5.0+time*.8)+sin(p.y*11.0-p.x*4.0-time*.6);
		if (reflection>1.1) color = mix(color,water_light.rgb,.6);
		if (ripple<.13 && impact<.63) color = water_light.rgb;
		if (impact<.17 || (ripple<.10 && impact<.35)) color = water_foam.rgb;
		// The upper pool has a gentle ring around the crystal mounting.
		if (paint_position.y>2.0 && fract(radius*4.0-time*.6)<.12) color = water_light.rgb;
	} else if (surface_pattern == 4) {
		vec3 cell = floor(paint_position*16.0);
		float fall = mod(cell.y+floor(motion_time*12.0),7.0);
		color = fall<2.0 ? water_foam.rgb : water_light.rgb;
	}
	ALBEDO = color;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
	EMISSION = color * glow;
}
void light() {
	float ndl = max(0.0,dot(NORMAL,LIGHT));
	float ramp = ndl < .22 ? .22 : (ndl < .65 ? .62 : 1.0);
	// Shadows use the same three deliberate value bands as the lit faces.
	float shadow = ATTENUATION;
	shadow = shadow < 0.25 ? 0.0 : (shadow < 0.75 ? 0.5 : 1.0);
	DIFFUSE_LIGHT += ramp * shadow * LIGHT_COLOR / PI;
}
