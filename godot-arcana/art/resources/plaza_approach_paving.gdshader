shader_type spatial;
render_mode diffuse_lambert, specular_disabled;

uniform vec4 stone_color : source_color;
uniform vec4 worn_limestone : source_color = vec4(0.76, 0.70, 0.61, 1.0);
uniform vec4 approach;
varying vec2 ground_position;

void vertex() {
	ground_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	vec2 path = approach.zw - approach.xy;
	float along = clamp(dot(ground_position - approach.xy, path) / max(dot(path, path), 0.001), 0.0, 1.0);
	float distance_to_path = length(ground_position - (approach.xy + path * along));
	float wear = 1.0 - smoothstep(0.9, 2.5, distance_to_path);
	// Worn slabs and joints converge in tone along the approach to the inn.
	ALBEDO = mix(stone_color.rgb, worn_limestone.rgb, 0.14 + 0.38 * wear);
	ROUGHNESS = 0.95;
}
