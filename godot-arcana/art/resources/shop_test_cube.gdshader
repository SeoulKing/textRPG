shader_type spatial;
render_mode ambient_light_disabled, specular_disabled;

uniform vec4 paint : source_color = vec4(1.0);
uniform bool stepped_light = true;

void fragment() {
	ALBEDO = paint.rgb;
	EMISSION = paint.rgb * 0.60;
}

void light() {
	float diffuse = clamp(max(dot(NORMAL, LIGHT), 0.0) * ATTENUATION, 0.0, 1.0);
	// Quantize both the distance falloff and the shadow received from the lamp.
	float band = dot(step(vec3(0.12, 0.29, 0.52), vec3(diffuse)), vec3(0.16, 0.20, 0.24));
	DIFFUSE_LIGHT += (stepped_light ? band : diffuse) * LIGHT_COLOR / PI
		* (LIGHT_IS_DIRECTIONAL ? 0.22 : 0.43);
}
