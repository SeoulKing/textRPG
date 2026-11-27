shader_type spatial;
render_mode unshaded, cull_disabled;

uniform vec4 sky_top : source_color = vec4(0.58, 0.75, 0.76, 1.0);
uniform vec4 sky_low : source_color = vec4(0.78, 0.86, 0.78, 1.0);

void fragment() {
	ALBEDO = mix(sky_top.rgb, sky_low.rgb, clamp(UV.y, 0.0, 1.0));
}