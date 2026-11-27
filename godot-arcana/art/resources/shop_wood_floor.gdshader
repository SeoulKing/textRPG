shader_type spatial;
render_mode diffuse_burley, specular_disabled;

uniform sampler2D wood_art : source_color, filter_nearest, repeat_disable;
varying vec2 floor_world;

void vertex() {
	floor_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

vec3 wood_sample(vec2 offset, vec2 size) {
	vec2 sample_pixel = vec2(550.0, 24.0) + offset;
	vec3 painted = texture(wood_art, (sample_pixel + vec2(0.5)) / size).rgb;
	// Remove the broad painted light gradient before repeating the grain.
	float along = offset.x / 320.0;
	vec3 reference = vec3(154.0, 112.0, 79.0);
	vec3 original_tone = mix(reference, vec3(91.0, 70.0, 60.0), along);
	return clamp(painted * pow(reference / original_tone, vec3(0.65)), vec3(0.0), vec3(1.0));
}

void fragment() {
	vec2 size = vec2(textureSize(wood_art, 0));
	vec2 offset = mod(floor_world * 64.0, vec2(320.0, 512.0));
	// Crossfade only at the periodic boundary to avoid a visible vertical join.
	float edge_distance = min(offset.x, 320.0 - offset.x);
	float primary_weight = smoothstep(0.0, 24.0, edge_distance);
	vec2 alternate = vec2(mod(offset.x + 160.0, 320.0), offset.y);
	ALBEDO = mix(wood_sample(alternate, size), wood_sample(offset, size), primary_weight);
	ROUGHNESS = 0.92;
}