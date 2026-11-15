shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform vec2 capture_anchor = vec2(160.0, 164.0);
uniform bool editor_preview = false;
uniform bool minimum_zoom_outline = false;
uniform float hurt_flash = 0.0;
void vertex() {
	vec3 anchor = MODEL_MATRIX[3].xyz;
	light_anchor = anchor;
	light_right = normalize(INV_VIEW_MATRIX[0].xyz);
	light_forward = normalize(vec3(INV_VIEW_MATRIX[2].x, 0.0, INV_VIEW_MATRIX[2].z));
	light_pitch_sine = abs(INV_VIEW_MATRIX[2].y);
	light_pitch_cosine = length(INV_VIEW_MATRIX[2].xz);
	vec4 view = VIEW_MATRIX * vec4(anchor, 1.0);
	vec2 scale = vec2(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz));
	vec2 offset = vec2(160.0 - capture_anchor.x, capture_anchor.y - 90.0) / 64.0;
	view.xy += (VERTEX.xy + offset) * scale;
	if (!editor_preview) view.z = -150.0 + dot(anchor.xz, normalize(INV_VIEW_MATRIX[2].xz)) * .18 - .0002;
	POSITION = PROJECTION_MATRIX * view;
}
void fragment() {
	vec4 c = texture(avatar_texture, UV);
	if (c.a < .5) discard;
	vec3 lit = sprite_lit(c.rgb, UV, vec2(320.0, 180.0), capture_anchor.y);
	ALBEDO = mix(lit, vec3(1.0, .48, .42), hurt_flash * .55);
}
