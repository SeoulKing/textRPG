shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_test_disabled, depth_draw_never;

uniform sampler2D scene_color : hint_screen_texture, filter_nearest, repeat_disable;
uniform sampler2D scene_depth : hint_depth_texture, filter_nearest, repeat_disable;
uniform sampler2D shadow_reference : filter_nearest, repeat_disable;
#include "res://art/resources/camera_pixel_cells.gdshaderinc"

uniform int outline_width : hint_range(0, 12) = 1;
uniform float outline_strength : hint_range(0.0, 1.0) = 0.0;
uniform bool preserve_lines = true;
uniform float line_sensitivity : hint_range(0.02, 0.30) = 0.188;
uniform bool shade_bands = true;

uniform bool automatic_shadow_edges = false;
// Surfaces with material lighting bands must not be quantized a second time.
uniform bool material_bands_enabled = false;
uniform vec3 material_bands_min = vec3(0.0);
uniform vec3 material_bands_max = vec3(0.0);

const vec3 SHADE_THRESHOLDS = vec3(0.25, 0.45, 0.67);
const vec4 SHADE_LEVELS = vec4(0.13, 0.34, 0.55, 0.83);
const float SHADOW_EDGE_WIDTH = 2.0;
const float SHADOW_MIN_CONTRAST = 0.075;
const float MIN_REFERENCE_TONE = 0.055;
const float RECEIVER_DEPTH_TOLERANCE = 0.012;

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float tone(vec3 color) {
	return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

int shade_band(vec3 color) {
	return int(dot(step(SHADE_THRESHOLDS, vec3(tone(color))), vec3(1.0)));
}

vec3 apply_shade_band(vec3 color, int band) {
	vec3 bounded = clamp(color, vec3(0.0), vec3(1.0));
	float tone_value = tone(bounded);
	float target = SHADE_LEVELS[band];
	// Moving toward black or white sets luminance without clipping individual channels.
	if (target <= tone_value) {
		return bounded * (target / tone_value);
	}
	return mix(bounded, vec3(1.0), (target - tone_value) / (1.0 - tone_value));
}

vec3 read_color(ivec2 pixel, ivec2 raster) {
	return texelFetch(scene_color, clamp(pixel, ivec2(0), raster - 1), 0).rgb;
}

float read_depth(ivec2 pixel, ivec2 raster) {
	return texelFetch(scene_depth, clamp(pixel, ivec2(0), raster - 1), 0).r;
}

bool same_receiver(ivec2 pixel, ivec2 center, ivec2 raster, vec4 plane) {
	if (any(lessThan(pixel, ivec2(0))) || any(greaterThanEqual(pixel, raster))) {
		return false;
	}
	float sample_depth = read_depth(pixel, raster);
	float expected = plane.x + dot(vec2(pixel - center), plane.yz);
	return sample_depth > 0.000001 && abs(sample_depth - expected) <= plane.w;
}

vec3 reference_color(ivec2 pixel) {
	return texelFetch(shadow_reference, pixel, 0).rgb;
}

float shadow_loss(vec3 lit, vec3 shaded) {
	float lit_tone = tone(lit);
	if (lit_tone < MIN_REFERENCE_TONE) {
		return -1.0;
	}
	return clamp((lit_tone - tone(shaded)) / lit_tone, 0.0, 1.0);
}

float receiver_loss(ivec2 pixel, ivec2 center, ivec2 raster, vec4 plane) {
	if (!same_receiver(pixel, center, raster, plane)) {
		return -1.0;
	}
	return shadow_loss(reference_color(pixel), read_color(pixel, raster));
}

vec3 shadow_transmission(ivec2 pixel, ivec2 raster, float loss) {
	vec3 lit = reference_color(pixel);
	vec3 shaded = read_color(pixel, raster);
	vec3 ratio = clamp(shaded / max(lit, vec3(MIN_REFERENCE_TONE)), vec3(0.0), vec3(1.0));
	// A nearly black channel cannot provide a reliable ratio.
	return mix(vec3(1.0 - loss), ratio, step(vec3(MIN_REFERENCE_TONE), lit));
}

float shadow_crossing(ivec2 center, ivec2 raster, vec4 plane, ivec2 tangent, ivec2 normal,
		int distance_along, float expected, int radius, float threshold, float polarity) {
	ivec2 origin = center + tangent * distance_along * pixel_size;
	float previous = -1.0;
	float current_best = 100.0;
	float best_distance = 100.0;
	for (int offset = -4; offset <= 4; offset++) {
		if (abs(offset) > radius) {
			continue;
		}
		float across = expected + float(offset);
		ivec2 sample_pixel = origin + normal * int(round(across * float(pixel_size)));
		float current = receiver_loss(sample_pixel, center, raster, plane);
		if (previous >= 0.0 && current >= 0.0 && (previous - threshold) * polarity <= 0.0
				&& (current - threshold) * polarity >= 0.0 && (current - previous) * polarity > 0.015) {
			float crossing = across - 1.0 + (threshold - previous) / (current - previous);
			if (abs(crossing - expected) < best_distance) {
				current_best = crossing;
				best_distance = abs(crossing - expected);
			}
		}
		previous = current;
	}
	return current_best;
}

float preferred_shadow_slope(float measured) {
	float magnitude = abs(measured);
	if (magnitude < 1.0 / 6.0) {
		return 0.0;
	}
	float snapped = magnitude < 5.0 / 12.0 ? 1.0 / 3.0 : (magnitude < 0.75 ? 0.5 : 1.0);
	return sign(measured) * snapped;
}

vec3 keep_three_smallest(vec3 values, float value) {
	if (value < values.x) {
		return vec3(value, values.xy);
	}
	if (value < values.y) {
		return vec3(values.x, value, values.y);
	}
	return vec3(values.xy, min(values.z, value));
}

vec3 fit_axis_shadow(ivec2 center, ivec2 raster, vec4 plane, ivec2 tangent, ivec2 normal,
		float along_grid, float polarity, out vec3 low_transmission, out vec3 high_transmission) {
	// Neighboring cells on a straight edge read the same strip and choose the same row.
	float strip_center = floor(along_grid / 16.0) * 16.0 + 8.0;
	int anchor = int(round(strip_center - along_grid));
	float threshold = 0.0;
	low_transmission = vec3(0.0);
	high_transmission = vec3(0.0);
	int plateau_count = 0;
	for (int offset = -4; offset <= 4; offset += 4) {
		ivec2 origin = center + tangent * (anchor + offset) * pixel_size;
		ivec2 low_pixel = origin - normal * (3 * pixel_size);
		ivec2 high_pixel = origin + normal * (3 * pixel_size);
		float low = receiver_loss(low_pixel, center, raster, plane);
		float high = receiver_loss(high_pixel, center, raster, plane);
		if (min(low, high) >= 0.0 && (high - low) * polarity >= SHADOW_MIN_CONTRAST) {
			threshold += (low + high) * 0.5;
			low_transmission += shadow_transmission(low_pixel, raster, low);
			high_transmission += shadow_transmission(high_pixel, raster, high);
			plateau_count++;
		}
	}
	if (plateau_count < 2) {
		return vec3(100.0);
	}
	threshold /= float(plateau_count);
	low_transmission /= float(plateau_count);
	high_transmission /= float(plateau_count);

	float first = 100.0;
	float last = -100.0;
	vec3 smallest = vec3(100.0);
	int support = 0;
	for (int index = 0; index < 9; index++) {
		int pair = (index + 1) / 2;
		int span = pair == 4 ? 8 : max(pair * 2 - 1, 0);
		int offset = index % 2 == 1 ? -span : span;
		float crossing = shadow_crossing(center, raster, plane, tangent, normal, anchor + offset,
			0.0, 3, threshold, polarity);
		if (crossing == 100.0) {
			continue;
		}
		first = min(first, crossing);
		last = max(last, crossing);
		if (last - first > SHADOW_EDGE_WIDTH) {
			return vec3(100.0);
		}
		smallest = keep_three_smallest(smallest, -polarity * crossing);
		support++;
	}
	if (support < 6) {
		return vec3(100.0);
	}
	return vec3(-polarity * smallest.z, first, last);
}

vec3 fit_shadow_crossings(ivec2 center, ivec2 raster, vec4 plane, ivec2 tangent, ivec2 normal,
		float middle, float threshold, float polarity, float slope) {
	float min_intercept = middle;
	float max_intercept = middle;
	vec3 smallest = vec3(-polarity * middle, 100.0, 100.0);
	ivec2 support = ivec2(0);
	for (int index = 0; index < 8; index++) {
		int pair = index / 2;
		int span = pair == 0 ? 1 : (pair == 1 ? 2 : (pair == 2 ? 4 : 7));
		bool reverse = index % 2 == 0;
		int along = reverse ? -span : span;
		float shift = float(along) * slope;
		float crossing = shadow_crossing(center, raster, plane, tangent, normal, along, middle + shift,
			2, threshold, polarity);
		if (crossing == 100.0) {
			continue;
		}
		float intercept = crossing - shift;
		min_intercept = min(min_intercept, intercept);
		max_intercept = max(max_intercept, intercept);
		if (max_intercept - min_intercept > 2.0) {
			return vec3(100.0);
		}
		smallest = keep_three_smallest(smallest, -polarity * intercept);
		if (reverse) {
			support.x++;
		} else {
			support.y++;
		}
	}
	if (min(support.x, support.y) < 3) {
		return vec3(100.0);
	}
	// A light-side percentile trims isolated shadow teeth. Mixed probe distances
	// keep a repeating two- or three-cell pattern from biasing the whole edge.
	return vec3(-polarity * smallest.z, min_intercept, max_intercept);
}

vec4 fit_shadow_edge(ivec2 center, ivec2 raster, vec4 plane, vec2 grid_pos, vec3 center_reference,
		ivec2 tangent, ivec2 normal) {
	ivec2 low_pixel = center - normal * (3 * pixel_size);
	ivec2 high_pixel = center + normal * (3 * pixel_size);
	float low_loss = receiver_loss(low_pixel, center, raster, plane);
	float high_loss = receiver_loss(high_pixel, center, raster, plane);
	if (min(low_loss, high_loss) < 0.0 || abs(high_loss - low_loss) < SHADOW_MIN_CONTRAST) {
		return vec4(0.0);
	}

	float threshold = (low_loss + high_loss) * 0.5;
	float polarity = sign(high_loss - low_loss);
	float middle = shadow_crossing(center, raster, plane, tangent, normal, 0, 0.0, 3, threshold, polarity);
	if (abs(middle) > SHADOW_EDGE_WIDTH) {
		return vec4(0.0);
	}
	float along_grid = dot(grid_pos, vec2(tangent));
	float slope = 0.0;
	vec3 shared_low;
	vec3 shared_high;
	vec3 fit = fit_axis_shadow(center, raster, plane, tangent, normal, along_grid, polarity, shared_low, shared_high);
	bool axis_aligned = fit.x != 100.0;
	if (!axis_aligned) {
		float near_start = shadow_crossing(center, raster, plane, tangent, normal, -3, middle, 4, threshold, polarity);
		float near_end = shadow_crossing(center, raster, plane, tangent, normal, 3, middle, 4, threshold, polarity);
		if (near_start == 100.0 || near_end == 100.0) {
			return vec4(0.0);
		}
		slope = preferred_shadow_slope((near_end - near_start) / 6.0);
		if (slope == 0.0) {
			return vec4(0.0);
		}
		fit = fit_shadow_crossings(center, raster, plane, tangent, normal, middle, threshold, polarity, slope);
		if (fit.x == 100.0) {
			return vec4(0.0);
		}
	}

	float normal_grid = dot(grid_pos, vec2(normal));
	float intercept = round(normal_grid + fit.x - slope * along_grid);
	float snapped = intercept + slope * along_grid - normal_grid;
	float drift = max(abs(snapped - fit.y), abs(snapped - fit.z));
	if (abs(snapped) > SHADOW_EDGE_WIDTH || abs(snapped - middle) > SHADOW_EDGE_WIDTH
			|| drift > SHADOW_EDGE_WIDTH) {
		return vec4(0.0);
	}

	// Keep each cell's own material color and use a same-surface sample only for light loss.
	bool uses_low = snapped > 0.0;
	float score = abs(high_loss - low_loss) + (axis_aligned ? 1.0 : 0.0);
	if (axis_aligned && abs(snapped) <= 1.25) {
		// Replace the mixed shadow fringe on the cells touching the chosen row.
		return vec4(center_reference * (uses_low ? shared_low : shared_high), score);
	}
	vec3 center_color = read_color(center, raster);
	float center_loss = shadow_loss(center_reference, center_color);
	float between_sides = (center_loss - low_loss) / (high_loss - low_loss);
	bool already_on_side = uses_low == (between_sides < 0.5);
	if (already_on_side && (between_sides <= 0.20 || between_sides >= 0.80)) {
		return vec4(center_color, score);
	}
	vec3 attenuation = uses_low ? shadow_transmission(low_pixel, raster, low_loss)
		: shadow_transmission(high_pixel, raster, high_loss);
	return vec4(center_reference * attenuation, score);
}

vec4 corrected_shadow_color(ivec2 center, ivec2 raster, float depth, float depth_scale,
		vec2 grid_pos, vec3 center_reference) {
	if (tone(center_reference) < MIN_REFERENCE_TONE || any(lessThan(center, ivec2(1)))
			|| any(greaterThanEqual(center + 1, raster))) {
		return vec4(0.0);
	}
	float left = read_depth(center - ivec2(1, 0), raster);
	float right = read_depth(center + ivec2(1, 0), raster);
	float top = read_depth(center - ivec2(0, 1), raster);
	float bottom = read_depth(center + ivec2(0, 1), raster);
	float tolerance = RECEIVER_DEPTH_TOLERANCE / max(depth_scale, 0.001);
	float depth_curve = max(abs(left + right - depth * 2.0), abs(top + bottom - depth * 2.0));
	// Orthographic depth on a planar receiver changes linearly with screen position.
	vec4 plane = vec4(depth, (right - left) * 0.5, (bottom - top) * 0.5, tolerance);
	if (depth_curve > tolerance) {
		return vec4(0.0);
	}
	vec4 horizontal = fit_shadow_edge(center, raster, plane, grid_pos, center_reference, ivec2(1, 0), ivec2(0, 1));
	vec4 vertical = fit_shadow_edge(center, raster, plane, grid_pos, center_reference, ivec2(0, 1), ivec2(1, 0));
	return horizontal.a >= vertical.a ? horizontal : vertical;
}

float dark_ridge(ivec2 pixel, ivec2 axis, float center, ivec2 raster) {
	// Both sides must be lighter. A single step in lighting is not a thin line.
	float left = max(tone(read_color(pixel - axis, raster)), tone(read_color(pixel - 2 * axis, raster)));
	float right = max(tone(read_color(pixel + axis, raster)), tone(read_color(pixel + 2 * axis, raster)));
	return min(left, right) - center;
}

float depth_jump(ivec2 pixel, ivec2 axis, float center, ivec2 raster) {
	float a = center - read_depth(pixel - axis, raster);
	float b = center - read_depth(pixel + axis, raster);
	// A flat sloped surface cancels out. Draw the edge on the nearer surface.
	return min(max(a, b), a + b);
}

vec4 keep_dark_line(ivec2 first, ivec2 count, ivec2 raster, vec3 base) {
	vec4 selected = vec4(base, 0.0);
	float darkest = tone(base);
	for (int y = 0; y < count.y; y++) {
		for (int x = 0; x < count.x; x++) {
			ivec2 pixel = first + ivec2(x, y);
			vec3 original = read_color(pixel, raster);
			float center = tone(original);
			if (center >= darkest || read_depth(pixel, raster) <= 0.000001) {
				continue;
			}
			float ridge = max(max(dark_ridge(pixel, ivec2(1, 0), center, raster),
				dark_ridge(pixel, ivec2(0, 1), center, raster)),
				max(dark_ridge(pixel, ivec2(1, 1), center, raster),
				dark_ridge(pixel, ivec2(1, -1), center, raster)));
			float strength = smoothstep(line_sensitivity * 0.35, line_sensitivity, ridge);
			vec3 candidate = mix(base, original, strength);
			float candidate_tone = tone(candidate);
			if (candidate_tone < darkest) {
				selected = vec4(candidate, strength);
				darkest = candidate_tone;
			}
		}
	}
	return selected;
}

bool crosses_lighting_step(ivec2 center, ivec2 raster, ivec2 axis, float depth, float depth_scale) {
	ivec2 offset = axis * pixel_size;
	ivec2 a = center - offset;
	ivec2 b = center + offset;
	float near_tone = tone(read_color(a, raster));
	float far_tone = tone(read_color(b, raster));
	if (abs(near_tone - far_tone) < 0.12) {
		return false;
	}
	float near_depth = read_depth(a, raster);
	float far_depth = read_depth(b, raster);
	if (min(near_depth, far_depth) <= 0.000001
			|| abs(near_depth + far_depth - 2.0 * depth) * depth_scale > RECEIVER_DEPTH_TOLERANCE) {
		return false;
	}
	// A lit side and a shadow side have different tones beyond the thin fringe.
	return abs(tone(read_color(a - offset, raster)) - near_tone) < 0.06
		&& abs(tone(read_color(b + offset, raster)) - far_tone) < 0.06;
}

vec3 render_pixel_cell(ivec2 first, ivec2 count, ivec2 center, ivec2 raster,
		float center_depth, mat4 projection, mat4 view, float depth_scale, bool material_banded) {
	vec3 base = read_color(center, raster);
	if (center_depth > 0.000001) {
		vec4 corrected = vec4(0.0);
		if (automatic_shadow_edges && pixel_size > 1 && !material_banded) {
			vec4 projected_origin = projection * view * vec4(0.0, 0.0, 0.0, 1.0);
			vec2 origin_cell = (projected_origin.xy / projected_origin.w * 0.5 + 0.5)
				* vec2(raster) / float(pixel_size);
			vec2 grid_pos = (vec2(center) + 0.5) / float(pixel_size) - origin_cell;
			corrected = corrected_shadow_color(center, raster, center_depth, depth_scale, grid_pos,
				reference_color(center));
		}
		if (corrected.a > 0.0) {
			base = corrected.rgb;
		}
		vec4 preserved = vec4(base, 0.0);
		if (corrected.a == 0.0 && preserve_lines && pixel_size > 1) {
			preserved = keep_dark_line(first, count, raster, base);
			if (preserved.a > 0.0 && (crosses_lighting_step(center, raster, ivec2(1, 0), center_depth, depth_scale)
					|| crosses_lighting_step(center, raster, ivec2(0, 1), center_depth, depth_scale))) {
				preserved = vec4(base, 0.0);
			}
		}
		if (shade_bands && !material_banded) {
			int base_band = shade_band(base);
			int line_band = shade_band(preserved.rgb);
			// Retain a strong line if it would otherwise merge into its base cell's band.
			if (preserved.a >= 0.5 && line_band == base_band) {
				line_band = max(0, base_band - 1);
			}
			base = apply_shade_band(preserved.rgb, line_band);
		} else {
			base = preserved.rgb;
		}
		if (outline_width > 0 && outline_strength > 0.0) {
			int reach = outline_width * pixel_size;
			int diagonal = max(1, int(round(float(outline_width) * 0.707))) * pixel_size;
			float jump = max(max(depth_jump(center, ivec2(reach, 0), center_depth, raster),
				depth_jump(center, ivec2(0, reach), center_depth, raster)),
				max(depth_jump(center, ivec2(diagonal), center_depth, raster),
				depth_jump(center, ivec2(diagonal, -diagonal), center_depth, raster)));
			// Orthographic depth is linear in view space.
			float world_per_pixel = 2.0 / (float(raster.y) * abs(projection[1][1]));
			float threshold = max(0.026, world_per_pixel * 2.0);
			float edge = smoothstep(threshold, threshold * 1.75, jump * depth_scale);
			base *= 1.0 - edge * outline_strength;
		}
	}
	return base;
}

void fragment() {
	// Store one result per cell in a corner of the viewport texture. The canvas
	// pass expands those results, so interior detail is scanned once per cell.
	ivec2 raster = ivec2(VIEWPORT_SIZE);
	ivec2 cell = ivec2(SCREEN_UV * VIEWPORT_SIZE);
	ivec2 first = cell * pixel_size;
	if (any(greaterThanEqual(first, raster))) {
		discard;
	}
	ivec2 count = min(ivec2(pixel_size), raster - first);
	ivec2 center = first + count / 2;
	float center_depth = read_depth(center, raster);
	float depth_scale = abs(INV_PROJECTION_MATRIX[2].z) * (1.0 - CLIP_SPACE_FAR);
	bool material_banded = false;
	if (material_bands_enabled) {
		vec2 uv = (vec2(center) + 0.5) / vec2(raster);
		vec4 world = INV_VIEW_MATRIX * INV_PROJECTION_MATRIX
			* vec4(uv * 2.0 - 1.0, mix(CLIP_SPACE_FAR, 1.0, center_depth), 1.0);
		vec3 position = world.xyz / world.w;
		material_banded = all(greaterThanEqual(position, material_bands_min))
			&& all(lessThanEqual(position, material_bands_max));
	}
	ALBEDO = render_pixel_cell(first, count, center, raster, center_depth,
		PROJECTION_MATRIX, VIEW_MATRIX, depth_scale, material_banded);
}
