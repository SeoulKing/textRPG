vec3 pack_edge_normal(vec3 normal) {
	// Only use byte values that survive GLES3's color conversion.
	normal /= max(dot(abs(normal), vec3(1.0)), 0.000001);
	vec2 oct = normal.xy;
	if (normal.z < 0.0) {
		oct = (1.0 - abs(oct.yx)) * mix(vec2(-1.0), vec2(1.0), step(vec2(0.0), oct));
	}
	ivec2 direction = ivec2(round((oct * 0.5 + 0.5) * 63.0));
	return vec3(vec2(direction + ivec2(64)), 255.0) / 255.0;
}
