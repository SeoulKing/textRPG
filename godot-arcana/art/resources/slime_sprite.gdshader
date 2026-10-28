shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
uniform sampler2D sprite_sheet : source_color, filter_nearest, repeat_disable;
// RGB stores signed surface normals; alpha is a gloss mask (not opacity).
uniform sampler2D surface_sheet : filter_nearest, repeat_disable;
uniform float gloss_strength : hint_range(0.0,1.0) = 0.48;
uniform float gloss_sharpness : hint_range(8.0,96.0) = 40.0;
uniform vec2 frame_cell = vec2(0.0);
uniform vec2 sheet_grid = vec2(16.0,8.0);
uniform float foot_offset = 0.53125;
uniform bool editor_preview = false;
uniform float hit_flash : hint_range(0.0,1.0) = 0.0;
void vertex() {
	vec3 anchor = MODEL_MATRIX[3].xyz;
	light_anchor=anchor;
	light_right=normalize(INV_VIEW_MATRIX[0].xyz);
	light_forward=normalize(vec3(INV_VIEW_MATRIX[2].x,0.0,INV_VIEW_MATRIX[2].z));
	vec4 view = VIEW_MATRIX*vec4(anchor,1.0);
	vec2 scale = vec2(length(MODEL_MATRIX[0].xyz),length(MODEL_MATRIX[1].xyz));
	view.xy += vec2(VERTEX.x,VERTEX.y+foot_offset)*scale;
	if (!editor_preview) view.z = -150.0+dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18-.0002;
	POSITION = PROJECTION_MATRIX*view;
}
float gloss_lobe(vec3 normal, vec3 light_dir, vec3 view_dir) {
	vec3 half_vector = light_dir+view_dir;
	vec3 halfway = half_vector/max(length(half_vector),.001);
	return pow(max(0.0,dot(normal,halfway)),gloss_sharpness)
		*smoothstep(0.0,.2,dot(normal,light_dir));
}
void fragment() {
	vec2 cell_size = vec2(textureSize(sprite_sheet,0))/sheet_grid;
	vec2 pixel_uv = (floor(clamp(UV,vec2(0.0),vec2(.99999))*cell_size)+.5)/cell_size;
	vec2 uv = (frame_cell+pixel_uv)/sheet_grid;
	vec4 color = texture(sprite_sheet,uv);
	if (color.a<.5) discard;
	vec4 surface = texture(surface_sheet,uv);
	vec3 mapped = normalize(surface.rgb*2.0-1.0);
	vec3 camera_up = normalize(INV_VIEW_MATRIX[1].xyz);
	vec3 view_dir = normalize(INV_VIEW_MATRIX[2].xyz);
	vec3 normal = normalize(light_right*mapped.x+camera_up*mapped.y+view_dir*mapped.z);
	vec3 point = light_anchor+light_right*((pixel_uv.x-.5)*1.0)
		+vec3(0,max(0.0,(74.0-pixel_uv.y*80.0)/64.0),0);
	// A restrained daylight glint; lamp/fire glints follow the shared light field.
	vec3 key = normalize(light_right*-.45+camera_up*.65+view_dir*.65);
	vec3 shine = vec3(.85,.95,1.0)*gloss_lobe(normal,key,view_dir)*local_ambient*.55;
	for (int i=0;i<16;i++) {
		if (i>=local_light_count) break;
		vec3 delta = local_light_points[i].xyz-point;
		float distance = length(delta);
		vec3 direction = delta/max(distance,.001);
		float falloff = max(0.0,1.0-distance/max(local_light_points[i].w,.001));
		shine += local_light_colors[i].rgb*local_light_colors[i].w
			*falloff*falloff*gloss_lobe(normal,direction,view_dir);
	}
	vec3 lit = color.rgb*(local_ambient*local_ambient_tint+local_irradiance(point,normal))
		+shine*surface.a*gloss_strength;
	ALBEDO = mix(lit, vec3(1.0,0.48,0.42), hit_flash*0.55);
}
