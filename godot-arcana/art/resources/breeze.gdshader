shader_type canvas_item;
uniform bool cloth = false;
uniform float phase = 0.0;
void fragment() {
	vec2 uv = UV;
	float active = cloth ? step(0.35, UV.y) : (1.0 - step(0.72, UV.y));
	// Integer source pixels; roots / cloth attachment points remain stationary.
	uv.x += floor(sin(TIME * 1.6 + phase + UV.y * 3.0) * 1.25) * TEXTURE_PIXEL_SIZE.x * active;
	COLOR = texture(TEXTURE, uv);
}
