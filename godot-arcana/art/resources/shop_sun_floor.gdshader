shader_type canvas_item;
uniform sampler2D sun_field : filter_linear, repeat_disable;
uniform vec3 sun_color = vec3(1.0, 0.83, 0.52);
uniform float sun_energy = 0.65;
uniform bool sun_enabled = true;
varying vec2 floor_point;
void vertex() {
	floor_point = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}
void fragment() {
	vec4 pixel = texture(TEXTURE, UV) * COLOR;
	// Preserve the authored texture. Remove the extra gain before the native light
	// restores it, avoiding a doubly bright patch on the already painted floor.
	float sun = texture(sun_field, floor_point / vec2(896.0, 576.0)).r;
	if (sun_enabled) pixel.rgb /= vec3(1.0) + sun_color * sun_energy * sun;
	COLOR = pixel;
}
