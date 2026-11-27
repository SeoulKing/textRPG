shader_type canvas_item;
render_mode unshaded;
uniform sampler2D sun_field : filter_linear, repeat_disable;
varying vec2 floor_point;
void vertex() {
	floor_point = (MODEL_MATRIX * vec4(VERTEX, 0.0, 1.0)).xy;
}
void fragment() {
	vec2 field_uv = floor_point / vec2(896.0, 576.0);
	float inside = step(0.0, field_uv.x) * step(field_uv.x, 1.0) * step(0.0, field_uv.y) * step(field_uv.y, 1.0);
	float sun = texture(sun_field, field_uv).r * inside;
	COLOR = vec4(vec3(0.16, 0.12, 0.09), texture(TEXTURE, UV).a * COLOR.a * sun * 0.42);
}
