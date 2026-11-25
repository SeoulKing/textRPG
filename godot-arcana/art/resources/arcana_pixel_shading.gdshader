shader_type spatial;
render_mode ambient_light_disabled, specular_disabled;

// Shared by the wooden crate and the plaza slime. The scene supplies the lights.
uniform vec4 paint : source_color = vec4(1.0);
uniform float rim_strength : hint_range(0.0, 1.0) = 0.0;
uniform int shade_levels : hint_range(2, 8) = 4;
uniform float base_fill : hint_range(0.0, 1.0) = 0.55;
uniform float directional_strength : hint_range(0.0, 1.0) = 0.16;
uniform float local_strength : hint_range(0.0, 1.0) = 0.34;

void fragment() {
	// Parallel viewing rays keep the upper rim fixed during camera translation.
	float rim = rim_strength * (1.0 - smoothstep(0.20, 0.36, abs(NORMAL.z)))
			* smoothstep(0.10, 0.45, dot(NORMAL.xy, vec2(-0.7071, 0.7071)));
	ALBEDO = paint.rgb * (1.0 - rim);
	EMISSION = ALBEDO * base_fill + vec3(rim);
}

void light() {
	float illumination = clamp(max(dot(NORMAL, LIGHT), 0.0) * ATTENUATION, 0.0, 1.0);
	float steps = float(max(shade_levels - 1, 1));
	float band = floor(illumination * steps + 0.5) / steps;
	float strength = LIGHT_IS_DIRECTIONAL ? directional_strength : local_strength;
	DIFFUSE_LIGHT += band * (LIGHT_COLOR / PI) * strength;
}
