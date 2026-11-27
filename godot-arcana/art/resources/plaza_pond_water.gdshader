shader_type spatial;
render_mode diffuse_lambert;

uniform sampler2D water_base : source_color, filter_nearest, repeat_enable;
uniform sampler2D highlights : source_color, filter_nearest, repeat_disable;
uniform bool animate_ripples = true;

varying vec2 surface_position;

void vertex() {
	surface_position = VERTEX.xz;
}

vec3 painted_frame(vec3 base, vec2 patch, float frame) {
	vec2 cell = vec2(mod(frame, 4.0), floor(frame / 4.0));
	vec4 glint = texture(highlights, (cell + patch) * 0.25);
	return mix(base, glint.rgb, glint.a * 0.60);
}

void fragment() {
	// Keep the authored texels fixed and ease the brightness between ripple frames.
	vec2 patch = fract(surface_position / 7.0 + vec2(0.5));
	float phase = animate_ripples ? mod(TIME * 8.0, 16.0) : 0.0;
	float frame = floor(phase);
	vec3 base = texture(water_base, patch).rgb;
	vec3 painted = painted_frame(base, patch, frame);
	if (animate_ripples) {
		vec3 next = painted_frame(base, patch, mod(frame + 1.0, 16.0));
		painted = mix(painted, next, smoothstep(0.0, 1.0, fract(phase)));
	}
	ALBEDO = painted * vec3(0.70, 0.83, 0.72) + vec3(0.015, 0.025, 0.02);
	ROUGHNESS = 0.68;
	SPECULAR = 0.18;
}
