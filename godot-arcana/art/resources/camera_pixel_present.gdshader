shader_type canvas_item;
render_mode unshaded, blend_disabled;

#include "res://art/resources/camera_pixel_cells.gdshaderinc"

uniform bool preserve_lines = true;

float tone(vec3 color) {
	return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec4 join_line(sampler2D atlas, ivec2 cell, ivec2 cells, ivec2 along, float middle) {
	ivec2 across = ivec2(-along.y, along.x);
	ivec2 margin = abs(along) + abs(across);
	if (any(lessThan(cell - margin, ivec2(0))) || any(greaterThanEqual(cell + margin, cells))) {
		return vec4(0.0);
	}
	ivec2 start = cell - along;
	ivec2 end = cell + along;
	vec3 start_color = texelFetch(atlas, start, 0).rgb;
	vec3 end_color = texelFetch(atlas, end, 0).rgb;
	float start_tone = tone(start_color);
	float end_tone = tone(end_color);
	float contrast = middle - max(start_tone, end_tone);
	if (contrast < 0.08 || distance(start_color, end_color) > 0.16) {
		return vec4(0.0);
	}

	// Confirm a ridge at both ends. A plain boundary has a dark side and fails this check.
	float start_sides = min(tone(texelFetch(atlas, start - across, 0).rgb),
		tone(texelFetch(atlas, start + across, 0).rgb));
	float end_sides = min(tone(texelFetch(atlas, end - across, 0).rgb),
		tone(texelFetch(atlas, end + across, 0).rgb));
	float support = min(start_sides - start_tone, end_sides - end_tone);
	if (support < 0.08) {
		return vec4(0.0);
	}
	return vec4(start_tone <= end_tone ? start_color : end_color, min(contrast, support));
}

void fragment() {
	ivec2 raster = textureSize(TEXTURE, 0);
	ivec2 pixel = clamp(ivec2(UV * vec2(raster)), ivec2(0), raster - 1);
	ivec2 cell = pixel / pixel_size;
	COLOR = texelFetch(TEXTURE, cell, 0);
	if (preserve_lines && pixel_size > 1) {
		ivec2 cells = (raster + pixel_size - 1) / pixel_size;
		float middle = tone(COLOR.rgb);
		vec4 join = join_line(TEXTURE, cell, cells, ivec2(1, 0), middle);
		vec4 vertical = join_line(TEXTURE, cell, cells, ivec2(0, 1), middle);
		vec4 diagonal = join_line(TEXTURE, cell, cells, ivec2(1, 1), middle);
		vec4 reverse_diagonal = join_line(TEXTURE, cell, cells, ivec2(1, -1), middle);
		join = vertical.a > join.a ? vertical : join;
		join = diagonal.a > join.a ? diagonal : join;
		join = reverse_diagonal.a > join.a ? reverse_diagonal : join;
		// Read only the original atlas so a repaired cell cannot extend to the next gap.
		if (join.a > 0.0) {
			COLOR.rgb = join.rgb;
		}
	}
}
