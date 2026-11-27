shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, fog_disabled;

uniform bool pixel_bands = true;

void vertex() {
	// Face the camera and place the glow just in front of the glass shade.
	vec4 center = MODELVIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0);
	float scale = length(MODELVIEW_MATRIX[0].xyz);
	POSITION = PROJECTION_MATRIX * (center + vec4(VERTEX.xy * scale, 0.52, 0.0));
}

void fragment() {
	float radius = length((UV * 2.0 - 1.0) * vec2(1.0, 1.1));
	float falloff = 1.0 - smoothstep(0.14, 1.0, radius);
	float intensity = falloff * falloff * 0.32;
	if (pixel_bands) {
		intensity = dot(vec3(0.035, 0.055, 0.10),
			step(vec3(0.07, 0.25, 0.55), vec3(falloff)));
	}
	ALBEDO = vec3(1.0, 0.75, 0.50);
	ALPHA = intensity;
}
