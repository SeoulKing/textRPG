shader_type spatial;

uniform vec4 stone : source_color = vec4(0.706, 0.631, 0.537, 1.0);
uniform vec4 mortar : source_color = vec4(0.584, 0.509, 0.427, 1.0);

varying vec2 ground;

float variation(vec2 key) {
	return fract(sin(dot(key, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	ground = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	vec2 pixel = (floor(ground * 32.0) + 0.5) / 32.0;
	float course = floor(pixel.y / 0.6);
	float offset = variation(vec2(course, 4.0)) * 0.95;
	float stone_width = 0.87 + variation(vec2(course, 9.0)) * 0.18;
	vec2 laid = vec2((pixel.x + offset) / stone_width, pixel.y / 0.6);
	vec2 cell = fract(laid);
	vec2 edge = min(cell, 1.0 - cell);
	float gap = min(edge.x * stone_width, edge.y * 0.6);
	float corner = edge.x + edge.y;
	float tone = mix(0.87, 1.11, variation(floor(laid)));
	float face = step(0.024, gap) * step(0.092, corner);
	float bevel = 1.0 + 0.09 * step(0.035, gap) * (1.0 - step(0.063, cell.y));
	ALBEDO = mix(mortar.rgb, stone.rgb * tone * bevel, face);
	ROUGHNESS = 0.94;
	SPECULAR = 0.18;
}
