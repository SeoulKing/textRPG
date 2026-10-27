shader_type canvas_item;
void fragment() {
	vec4 base = texture(TEXTURE, UV);
	vec2 pixel = floor(UV / TEXTURE_PIXEL_SIZE);
	bool water = base.g > base.r * 1.3 && base.b > base.r * 1.25 && base.g > 0.4;
	float phase = floor(TIME * 4.0);
	if (water && mod(pixel.y + phase, 13.0) == 0.0 && mod(pixel.x + floor(pixel.y / 3.0), 21.0) < 4.0) {
		base.rgb = vec3(0.61,0.86,0.83);
	}
	COLOR = base;
}
