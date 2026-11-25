shader_type spatial;

uniform vec4 stone : source_color = vec4(0.59, 0.55, 0.50, 1.0);
uniform vec4 joint : source_color = vec4(0.52, 0.49, 0.44, 1.0);
uniform float highlight_strength = 0.0;

varying vec2 ground_position;

float variation(vec2 key) {
	return fract(sin(dot(key, vec2(127.1, 311.7))) * 43758.5453);
}

void vertex() {
	ground_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	vec2 pixel = (floor(ground_position * 32.0) + 0.5) / 32.0;
	float row = floor(pixel.y / 0.37);
	float width = mix(0.44, 0.63, variation(vec2(row, 7.0)));
	float stagger = mod(row, 2.0) * width * 0.5 + 0.13 * variation(vec2(row, 3.0));
	vec2 bond = (pixel + vec2(stagger, 0.0)) / vec2(width, 0.37);
	vec2 tile_position = fract(bond);
	vec2 edge = min(tile_position, 1.0 - tile_position) * vec2(width, 0.37);
	float distance_to_joint = min(edge.x, edge.y);
	float tile = variation(floor(bond));
	float seam = mix(0.019, 0.032, tile);
	float face = step(seam, distance_to_joint) * step(mix(0.073, 0.112, tile), edge.x + edge.y);
	float bevel = 1.0 - step(seam + 0.032, distance_to_joint);
	float top_edge = step(tile_position.y, 0.5) + 0.35 * step(tile_position.x, 0.5);
	float grain = variation(floor(pixel * 13.0));
	float tone = mix(0.94, 1.06, tile) + mix(-0.012, 0.016, grain);
	float bevel_tone = 0.125 * top_edge - 0.095;
	float lip = face * bevel * max(bevel_tone, 0.0) / 0.07375;
	vec3 surface = stone.rgb * (tone + bevel * min(bevel_tone, 0.0));
	ALBEDO = mix(joint.rgb, surface, face);
	// The selected stone lip stays visible in shadow without brightening mortar.
	EMISSION = vec3(highlight_strength * lip);
	ROUGHNESS = 0.96;
	SPECULAR = 0.11;
}
