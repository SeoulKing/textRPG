shader_type spatial;
render_mode ambient_light_disabled, specular_disabled;

uniform sampler2D plank_grain : source_color, filter_nearest_mipmap, repeat_disable;
uniform sampler2D floor_cells : filter_nearest, repeat_disable;
uniform vec2 floor_origin;
uniform vec2 floor_size;
uniform bool use_grain = true;
uniform vec4 base_color : source_color = vec4(1.0);
uniform float roughness = 0.84;
varying vec2 floor_world;

void vertex() {
	floor_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	vec2 cell_uv = (floor_world - floor_origin) / floor_size;
	if (texture(floor_cells, cell_uv).r < 0.5) {
		discard;
	}
	vec3 grain = use_grain ? texture(plank_grain, UV, -0.55).rgb : vec3(1.0);
	vec3 wood = base_color.rgb * grain;
	float value = dot(wood, vec3(0.299, 0.587, 0.114));
	ALBEDO = mix(wood, vec3(value), 0.24);
	// Cool daylight reaches the floor even where the window beam is blocked.
	EMISSION = ALBEDO * vec3(0.87, 0.98, 1.10);
	ROUGHNESS = roughness;
	SPECULAR = 0.0;
}

void light() {
	float strength = LIGHT_IS_DIRECTIONAL ? 0.80 : 0.24;
	float facing = max(dot(NORMAL, LIGHT), 0.0);
	float illumination = clamp(facing * ATTENUATION, 0.0, 1.0);
	float band = LIGHT_IS_DIRECTIONAL ? floor(illumination * 4.0 + 0.5) * 0.25
		: dot(step(vec3(0.04, 0.16, 0.36), vec3(illumination)), vec3(0.07, 0.13, 0.25));
	// Keep the authored energy, with a pale straw tint for the window beam.
	vec3 tint = LIGHT_IS_DIRECTIONAL
		? max(LIGHT_COLOR.r, max(LIGHT_COLOR.g, LIGHT_COLOR.b)) * vec3(1.0, 0.93, 0.78)
		: LIGHT_COLOR;
	DIFFUSE_LIGHT += band * (tint / PI) * strength;
}
