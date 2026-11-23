shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_test_disabled, depth_draw_never;

// Based on "3D Pixel art outline & highlight Shader" by Leo Peltola.
// Original source comment: MIT License. Made by Leo Peltola.
// The linked publication distributes the shader under CC0:
// https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/
// Inspired by https://threejs.org/examples/webgl_postprocessing_pixel.html
// Arcana adaptations: external normals for Compatibility; reversed-Z clip range;
// nearest samples; controllable width; guard missing normals; full-screen quad.

uniform highp sampler2D DEPTH_TEXTURE : hint_depth_texture, filter_nearest, repeat_disable;
uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_nearest, repeat_disable;
uniform sampler2D surface_normals : filter_nearest, repeat_disable;

uniform bool shadows_enabled = true;
uniform bool highlights_enabled = true;
uniform int outline_width : hint_range(0, 3) = 1;
// The lab's outline control maps to the original shader's shadow_strength.
uniform float outline_strength : hint_range(0.0, 1.0, 0.01) = 0.4;
uniform float highlight_strength : hint_range(0.0, 1.0, 0.01) = 0.1;
uniform vec3 highlight_color : source_color = vec3(1.0);
uniform vec3 shadow_color : source_color = vec3(0.0);

const vec2 NEIGHBORS[4] = { vec2(0.0, -1.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(-1.0, 0.0) };

float view_depth(vec2 uv, float raw_depth, mat4 inv_projection) {
	vec3 ndc = vec3(uv * 2.0 - 1.0, mix(CLIP_SPACE_FAR, 1.0, raw_depth));
	vec4 position = inv_projection * vec4(ndc, 1.0);
	return -position.z / position.w;
}

// A missing proxy leaves scenery in the normal buffer. Only the surface visible
// at this same texel in the main depth buffer can contribute a highlight.
vec4 visible_normal(vec2 uv, float scene_depth) {
	vec4 sample_data = texture(surface_normals, uv);
	ivec3 bytes = ivec3(round(sample_data.rgb * 255.0));
	int depth = ((bytes.r & 3) << 10) | ((bytes.g & 3) << 8) | bytes.b;
	if (sample_data.a < 0.5 || abs(float(depth) - scene_depth * 4095.0) > 0.501) {
		return vec4(0.0);
	}
	vec2 oct = vec2(bytes.rg / 4) * (2.0 / 63.0) - 1.0;
	vec3 normal = vec3(oct, 1.0 - abs(oct.x) - abs(oct.y));
	normal.xy -= clamp(-normal.z, 0.0, 1.0) * mix(vec2(-1.0), vec2(1.0), step(vec2(0.0), oct));
	return vec4(normalize(normal), 1.0);
}

void vertex() {
	// Godot 4.3+ reversed-Z fullscreen placement.
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

void fragment() {
	vec2 texel = 1.0 / VIEWPORT_SIZE.xy;
	float outline_step = float(max(outline_width, 1));
	float raw_depth = texture(DEPTH_TEXTURE, SCREEN_UV).r;
	float depth = view_depth(SCREEN_UV, raw_depth, INV_PROJECTION_MATRIX);
	vec4 center_normal = vec4(0.0);
	if (highlights_enabled) {
		center_normal = visible_normal(SCREEN_UV, raw_depth);
	}

	float depth_diff = 0.0;
	float neg_depth_diff = 0.5;
	float normal_diff = 0.0;
	for (int i = 0; i < 4; i++) {
		vec2 offset = NEIGHBORS[i] * texel;
		vec2 outline_uv = SCREEN_UV + offset * outline_step;
		float outline_depth = texture(DEPTH_TEXTURE, outline_uv).r;
		float delta = view_depth(outline_uv, outline_depth, INV_PROJECTION_MATRIX) - depth;
		depth_diff += clamp(delta, 0.0, 1.0);
		neg_depth_diff -= delta;

		if (center_normal.a > 0.5) {
			vec2 uv = SCREEN_UV + offset;
			float neighbor_depth = outline_width <= 1 ? outline_depth : texture(DEPTH_TEXTURE, uv).r;
			vec4 neighbor = visible_normal(uv, neighbor_depth);
			if (neighbor.a > 0.5) {
				float bias = smoothstep(-0.01, 0.01, dot(center_normal.xyz - neighbor.xyz, vec3(1.0)));
				normal_diff += (1.0 - dot(center_normal.xyz, neighbor.xyz)) * bias;
			}
		}
	}
	// Reject creases on the far side even when the dark outline is disabled.
	neg_depth_diff = step(0.5001, neg_depth_diff);
	depth_diff = smoothstep(0.2, 0.3, depth_diff);
	normal_diff = clamp(smoothstep(0.2, 0.8, normal_diff) - neg_depth_diff, 0.0, 1.0);

	vec3 original_color = texture(SCREEN_TEXTURE, SCREEN_UV).rgb;
	vec3 final_highlight_color = mix(original_color, highlight_color, highlight_strength);
	vec3 final_shadow_color = mix(original_color, shadow_color, outline_strength);
	vec3 final_color = original_color;
	if (highlights_enabled) {
		final_color = mix(final_color, final_highlight_color, normal_diff);
	}
	if (shadows_enabled && outline_width > 0) {
		final_color = mix(final_color, final_shadow_color, depth_diff);
	}
	ALBEDO = final_color;
	// Preserve the source shader's edge-only overlay, leaving sprite content
	// outside the screen-color capture untouched when there is no edge.
	float alpha_mask = depth_diff * float(shadows_enabled && outline_width > 0)
		+ normal_diff * float(highlights_enabled);
	ALPHA = clamp(alpha_mask * 5.0, 0.0, 1.0);
}
