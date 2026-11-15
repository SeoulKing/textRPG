shader_type spatial;

uniform vec4 deep_water : source_color = vec4(0.065, 0.30, 0.34, 1.0);
uniform vec4 shallow_water : source_color = vec4(0.10, 0.47, 0.48, 1.0);
uniform vec4 caustic_color : source_color = vec4(0.32, 0.74, 0.65, 1.0);

varying vec2 pool_position;

void vertex() {
	pool_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

vec2 cell_seed(vec2 cell) {
	vec2 seed = vec2(dot(cell, vec2(127.1, 311.7)), dot(cell, vec2(269.5, 183.3)));
	return fract(sin(seed) * 43758.5453);
}

float cell_edge(vec2 position, float phase) {
	vec2 base_cell = floor(position);
	vec2 local_position = fract(position);
	float nearest = 8.0;
	float second_nearest = 8.0;

	for (int y = -1; y <= 1; y++) {
		for (int x = -1; x <= 1; x++) {
			vec2 neighbor = vec2(float(x), float(y));
			vec2 seed = cell_seed(base_cell + neighbor);
			vec2 center = neighbor + vec2(0.25) + seed * 0.5;
			center += 0.14 * sin(phase + TAU * seed);
			vec2 offset = center - local_position;
			float distance_squared = dot(offset, offset);
			second_nearest = min(second_nearest, max(nearest, distance_squared));
			nearest = min(nearest, distance_squared);
		}
	}

	return sqrt(second_nearest) - sqrt(nearest);
}

void fragment() {
	float phase = TAU * mod(TIME, 3.0) / 3.0;
	vec2 position = pool_position * 5.7;
	vec2 distortion = vec2(
		sin(position.y * 1.16 + position.x * 0.34 + phase),
		cos(position.x * 0.91 - position.y * 0.38 - phase)
	);
	float edge = cell_edge(position + distortion * 0.24, phase);
	float soften = clamp(fwidth(edge), 0.02, 0.12);
	float caustic = 1.0 - smoothstep(0.012, 0.046 + soften, edge);

	float wave = sin(position.x * 0.50 + position.y * 0.38 + phase);
	float cross_wave = cos(position.x * 0.28 - position.y * 0.51 - phase);
	float shallowness = clamp(0.45 + wave * 0.21 + cross_wave * 0.19, 0.0, 1.0);
	vec3 water = mix(deep_water.rgb, shallow_water.rgb, shallowness);
	ALBEDO = mix(water, caustic_color.rgb, caustic * (0.21 + shallowness * 0.17));
	EMISSION = water * 0.08 + caustic_color.rgb * caustic * 0.04;
	ROUGHNESS = mix(0.35, 0.26, shallowness);
	SPECULAR = 0.40;
}
