shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_test_disabled, depth_draw_never;

uniform sampler2D scene_color : hint_screen_texture, filter_nearest, repeat_disable;
uniform sampler2D scene_depth : hint_depth_texture, filter_nearest, repeat_disable;
uniform float outline_strength : hint_range(0.0, 0.3) = 0.13;
uniform int debug_mode : hint_enum("Beauty", "Albedo", "Direct", "Edges", "AO") = 0;

void vertex() {
	// The screen quad is placed at the near plane with reverse Z.
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

void fragment() {
	if (debug_mode != 0 && debug_mode != 3) {
		discard;
	}
	vec2 uv = SCREEN_UV;
	float center = textureLod(scene_depth, uv, 0.0).r;
	if (center <= 0.000001) {
		discard;
	}

	vec2 texel = 1.0 / VIEWPORT_SIZE;
	vec2 x = vec2(texel.x, 0.0);
	vec2 y = vec2(0.0, texel.y);
	vec4 neighbors = vec4(
		textureLod(scene_depth, uv + x, 0.0).r,
		textureLod(scene_depth, uv - x, 0.0).r,
		textureLod(scene_depth, uv + y, 0.0).r,
		textureLod(scene_depth, uv - y, 0.0).r);

	// Orthographic depth is linear. Scale raw deltas by the view-space clip range.
	float depth_scale = INV_PROJECTION_MATRIX[2].z * (1.0 - CLIP_SPACE_FAR);
	vec4 drops = (vec4(center) - neighbors) * depth_scale;
	float pixel_width = 2.0 * texel.y / abs(PROJECTION_MATRIX[1][1]);
	float threshold = max(0.025, pixel_width * 2.75);

	// An even slope cancels between opposite samples. The closer side owns the line.
	vec2 jump = max(drops.xz, drops.yw);
	vec2 bend = drops.xz + drops.yw;
	vec2 edges = smoothstep(vec2(threshold), vec2(threshold * 1.65), min(jump, bend));
	float outline = max(edges.x, edges.y);
	if (outline <= 0.0) {
		discard;
	}

	vec3 base = textureLod(scene_color, uv, 0.0).rgb;
	ALBEDO = debug_mode == 3 ? vec3(1.0) : base * vec3(0.70, 0.66, 0.69);
	ALPHA = debug_mode == 3 ? outline : outline * outline_strength;
}