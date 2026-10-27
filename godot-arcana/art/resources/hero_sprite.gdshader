shader_type spatial;
render_mode unshaded, cull_disabled;
uniform sampler2D sprite_sheet : source_color, filter_nearest, repeat_disable;
uniform vec2 frame_cell = vec2(0.0);
uniform float foot_offset = 0.890625;
uniform vec4 ink : source_color = vec4(0.14509804,0.23529412,0.25098039,1.0);
uniform bool editor_preview = false;
void vertex() {
	vec3 anchor = MODEL_MATRIX[3].xyz;
	vec4 view = VIEW_MATRIX * vec4(anchor, 1.0);
	vec2 scale = vec2(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz));
	// Camera-facing art with its foot, not its image center, on the map anchor.
	view.xy += vec2(VERTEX.x, VERTEX.y + foot_offset) * scale;
	// Use the existing world's foot-based depth order, so trees and buildings
	// occlude both the character and its ink instead of a permanent front overlay.
	if (!editor_preview) view.z = -150.0 + anchor.z * 0.18 - 0.0002;
	POSITION = PROJECTION_MATRIX * view;
}
vec4 sample_frame(vec2 uv) {
	if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
	return texture(sprite_sheet, (frame_cell + uv) / vec2(8.0, 4.0));
}
void fragment() {
	vec4 color = sample_frame(UV);
	if (color.a < 0.5) {
		// One render pixel of silhouette, independent of atlas resolution.
		vec2 pixel = fwidth(UV);
		float edge = max(max(sample_frame(UV + vec2(pixel.x,0.0)).a, sample_frame(UV - vec2(pixel.x,0.0)).a),
			max(sample_frame(UV + vec2(0.0,pixel.y)).a, sample_frame(UV - vec2(0.0,pixel.y)).a));
		if (edge < 0.5) discard;
		ALBEDO = ink.rgb;
	} else {
		ALBEDO = color.rgb;
	}
}
