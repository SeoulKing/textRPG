shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
uniform sampler2D sprite_sheet : source_color, filter_nearest, repeat_disable;
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
void fragment() {
	vec2 cell_size = vec2(textureSize(sprite_sheet,0))/sheet_grid;
	vec2 uv = (frame_cell+clamp(UV,vec2(.5)/cell_size,vec2(1.0)-vec2(.5)/cell_size))/sheet_grid;
	vec4 color = texture(sprite_sheet,uv);
	if (color.a<.5) discard;
	vec3 point=light_anchor+light_right*((UV.x-.5)*1.0)+vec3(0,max(0.0,(74.0-UV.y*80.0)/64.0),0);
	vec3 normal=normalize(light_forward*.75+light_right*(UV.x-.5)+vec3(0,.3,0));
	vec3 lit=color.rgb*(vec3(1.0)+local_irradiance(point,normal));
	ALBEDO = mix(lit, vec3(1.0,0.48,0.42), hit_flash*0.55);
}
