shader_type spatial;
render_mode unshaded, cull_disabled, depth_prepass_alpha;

uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform vec4 model_ink : source_color = vec4(0.207843, 0.176471, 0.250980, 1.0);
uniform float flash = 0.0;
uniform float outline_screen_pixels = 0.0;

void fragment() {
	vec4 avatar = texture(avatar_texture, UV);
	vec2 texel = max(1.0 / vec2(textureSize(avatar_texture, 0)), fwidth(UV) * outline_screen_pixels);
	if (avatar.a < 0.5) {
		vec2 dx = vec2(texel.x, 0.0);
		vec2 dy = vec2(0.0, texel.y);
		float adjacent = max(max(texture(avatar_texture, UV + dx).a, texture(avatar_texture, UV - dx).a),
			max(texture(avatar_texture, UV + dy).a, texture(avatar_texture, UV - dy).a));
		avatar = vec4(model_ink.rgb, step(0.5, adjacent) * model_ink.a);
	}
	ALBEDO = mix(avatar.rgb, vec3(1.0), flash * 0.6) * COLOR.rgb;
	// Keep the silhouette in the depth/shadow pass and draw its color after world edges.
	if (avatar.a * COLOR.a < 0.5) {
		discard;
	}
	ALPHA = 1.0;
}
