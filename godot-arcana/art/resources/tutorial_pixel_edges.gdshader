shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_test_disabled, depth_draw_never;

// Based on "3D Pixel art outline & highlight Shader" by Leo Peltola.
// Original source comment: MIT License. Made by Leo Peltola.
// Inspired by https://threejs.org/examples/webgl_postprocessing_pixel.html
// The linked publication distributes the shader under CC0:
// https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/

uniform highp sampler2D DEPTH_TEXTURE : hint_depth_texture, filter_nearest, repeat_disable;
uniform sampler2D SCREEN_TEXTURE : hint_screen_texture, filter_nearest, repeat_disable;
uniform highp sampler2D highlight_cache : filter_nearest, repeat_disable;
uniform vec2 cache_uv_scale = vec2(1.0);
uniform vec2 cache_uv_offset = vec2(0.0);
uniform vec2 cache_depth_scale_offset = vec2(1.0, 0.0);
uniform bool cache_ready = false;

uniform bool shadows_enabled = true;
uniform bool highlights_enabled = true;
uniform int outline_width : hint_range(0, 3) = 1;
uniform float outline_strength : hint_range(0.0, 1.0, 0.01) = 0.4;
uniform float highlight_strength : hint_range(0.0, 1.0, 0.01) = 0.1;
uniform vec3 highlight_color : source_color = vec3(1.0);
uniform vec3 shadow_color : source_color = vec3(0.0);

const vec2 NEIGHBORS[4] = { vec2(0.0, -1.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(-1.0, 0.0) };
const int CACHE_MIN_BYTE = 64;
const int CACHE_DEPTH_RADIX = 192;
const float CACHE_DEPTH_MAX = 36863.0;
const float CACHE_WEIGHT_MAX = 191.0;
// Reserve half a code for packing and one for the two rasterizations and depth remap.
const float CACHE_DEPTH_TOLERANCE = 1.5;

highp float view_depth(highp vec2 uv, highp float raw_depth, highp mat4 inv_projection) {
	highp vec3 ndc = vec3(uv * 2.0 - 1.0, mix(CLIP_SPACE_FAR, 1.0, raw_depth));
	highp vec4 position = inv_projection * vec4(ndc, 1.0);
	return -position.z / position.w;
}

float cached_highlight(highp vec2 uv, highp float scene_depth, highp vec2 depth_gradient,
		highp vec2 viewport_size) {
	highp vec2 cache_uv = uv * cache_uv_scale + cache_uv_offset;
	if (any(lessThan(cache_uv, vec2(0.0))) || any(greaterThanEqual(cache_uv, vec2(1.0)))) {
		return 0.0;
	}
	highp vec2 cache_size = vec2(textureSize(highlight_cache, 0));
	highp vec2 cache_raster = cache_uv * cache_size;
	ivec2 cache_texel = ivec2(floor(cache_raster));
	ivec3 fields = ivec3(round(texelFetch(highlight_cache, cache_texel, 0).rgb * 255.0)) - ivec3(CACHE_MIN_BYTE);
	if (fields.r <= 0) {
		return 0.0;
	}
	highp vec2 sample_offset = vec2(cache_texel) + 0.5 - cache_raster;
	if (any(greaterThan(abs(sample_offset), vec2(0.001)))) {
		// If the two pixel grids are offset, compare depths at the cached sample's center.
		highp vec2 cache_texels_per_pixel = cache_uv_scale * cache_size / viewport_size;
		scene_depth += dot(depth_gradient, sample_offset / cache_texels_per_pixel);
	}
	highp float cached_depth = float(fields.g * CACHE_DEPTH_RADIX + fields.b);
	highp float expected_depth = scene_depth * cache_depth_scale_offset.x + cache_depth_scale_offset.y;
	if (abs(cached_depth - expected_depth * CACHE_DEPTH_MAX) > CACHE_DEPTH_TOLERANCE) {
		return 0.0;
	}
	return float(fields.r) / CACHE_WEIGHT_MAX;
}

void vertex() {
	// Godot 4.3+ reversed-Z fullscreen placement.
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

void fragment() {
	highp float raw_depth = texture(DEPTH_TEXTURE, SCREEN_UV).r;
	bool orthographic = PROJECTION_MATRIX[3].w == 1.0;
	highp float depth_span = INV_PROJECTION_MATRIX[2].z * (1.0 - CLIP_SPACE_FAR);
	float depth_diff = 0.0;
	if (shadows_enabled && outline_width > 0) {
		highp vec2 texel = 1.0 / VIEWPORT_SIZE.xy;
		highp float depth = orthographic ? 0.0 : view_depth(SCREEN_UV, raw_depth, INV_PROJECTION_MATRIX);
		for (int i = 0; i < 4; i++) {
			highp vec2 outline_uv = SCREEN_UV + NEIGHBORS[i] * texel * float(outline_width);
			highp float outline_depth = texture(DEPTH_TEXTURE, outline_uv).r;
			// Subtract before converting to world units so camera translation cancels out.
			highp float delta = orthographic ? (raw_depth - outline_depth) * depth_span
				: view_depth(outline_uv, outline_depth, INV_PROJECTION_MATRIX) - depth;
			depth_diff += clamp(delta, 0.0, 1.0);
		}
		depth_diff = smoothstep(0.2, 0.3, depth_diff);
	}
	float normal_diff = 0.0;
	if (highlights_enabled && cache_ready) {
		highp vec2 depth_gradient = vec2(0.0);
		if (orthographic) {
			depth_gradient = vec2(dFdx(raw_depth), dFdy(raw_depth));
			highp vec2 view_texel = 2.0 * abs(vec2(INV_PROJECTION_MATRIX[0].x,
				INV_PROJECTION_MATRIX[1].y)) / VIEWPORT_SIZE;
			// Stop a discontinuity across a silhouette from moving the occlusion test.
			highp vec2 max_slope = 4.0 * view_texel / max(abs(depth_span), 0.0001);
			depth_gradient *= step(abs(depth_gradient), max_slope);
		}
		if (raw_depth > 0.0) {
			normal_diff = cached_highlight(SCREEN_UV, raw_depth, depth_gradient, VIEWPORT_SIZE);
		}
	}

	vec3 original_color = texture(SCREEN_TEXTURE, SCREEN_UV).rgb;
	vec3 final_highlight_color = mix(original_color, highlight_color, highlight_strength);
	vec3 final_shadow_color = mix(original_color, shadow_color, outline_strength);
	vec3 final_color = mix(original_color, final_highlight_color, normal_diff);
	final_color = mix(final_color, final_shadow_color, depth_diff);
	ALBEDO = final_color;
	// Keep the original effect's compositing for both masks.
	ALPHA = clamp((depth_diff + normal_diff) * 5.0, 0.0, 1.0);
}
