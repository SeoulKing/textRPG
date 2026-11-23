shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;

// Match BaseMaterial3D culling. -1 discards unsupported surface slots.
uniform int cull_mode = 0;

varying vec3 view_normal;

void vertex() {
	view_normal = MODELVIEW_NORMAL_MATRIX * NORMAL;
}

void fragment() {
	if (cull_mode < 0 || (cull_mode == 0 && !FRONT_FACING) || (cull_mode == 1 && FRONT_FACING)) {
		discard;
	}
	// Store a 6+6-bit octahedral normal and 12-bit reverse-Z depth in opaque RGB8.
	vec3 normal = FRONT_FACING ? view_normal : -view_normal;
	normal /= max(dot(abs(normal), vec3(1.0)), 0.000001);
	vec2 oct = normal.xy;
	if (normal.z < 0.0) {
		oct = (1.0 - abs(oct.yx)) * mix(vec2(-1.0), vec2(1.0), step(vec2(0.0), oct));
	}
	ivec2 direction = ivec2(round((oct * 0.5 + 0.5) * 63.0));
	int depth = int(round(FRAGCOORD.z * 4095.0));
	ivec3 encoded_bytes = ivec3(direction.x * 4 + ((depth >> 10) & 3),
		direction.y * 4 + ((depth >> 8) & 3), depth & 255);
	ALBEDO = vec3(encoded_bytes) / 255.0;
}
