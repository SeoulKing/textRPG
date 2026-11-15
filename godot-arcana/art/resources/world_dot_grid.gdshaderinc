uniform int pixel_size = 2;

vec3 quantize_world_color(vec3 color) {
	// Quantize brightness and color separately so neutral colors stay neutral.
	float luma = dot(color, vec3(0.25, 0.5, 0.25));
	vec2 chroma = vec2((color.r - color.b) * 0.5, color.g - luma);
	luma = round(luma * 20.0) / 20.0;
	chroma = round(chroma * 24.0) / 24.0;
	return clamp(vec3(luma + chroma.x - chroma.y, luma + chroma.y,
		luma - chroma.x - chroma.y), 0.0, 1.0);
}

vec4 sample_world_dots(sampler2D source, vec2 uv, vec2 inverse_size) {
	vec2 source_size = round(1.0 / inverse_size);
	float step_size = float(pixel_size);
	vec2 block_origin = floor(uv * source_size / step_size) * step_size;
	vec2 sample_pixel = min(block_origin + floor(step_size * 0.5), source_size - 1.0);
	vec4 world = texture(source, (sample_pixel + 0.5) * inverse_size);
	if (pixel_size > 1) {
		world.rgb = quantize_world_color(world.rgb);
	}
	return world;
}
