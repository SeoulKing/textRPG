shader_type canvas_item;

// Applied only to the shop world, before the separate HUD is composited.
uniform float zoom_ratio = 1.0;
const float REFERENCE_ZOOM = 3.9;
const float MAX_BLOCK_BLEND = 0.60;

void fragment() {
	vec2 size = vec2(textureSize(TEXTURE, 0));
	vec2 pixel = clamp(floor(UV * size), vec2(0.0), size - vec2(1.0));
	vec4 detail = texelFetch(TEXTURE, ivec2(pixel), 0);
	vec2 block_pixel = floor(pixel * 0.5) * 2.0;
	vec4 block = texelFetch(TEXTURE, ivec2(block_pixel), 0);
	float relative_zoom = zoom_ratio / REFERENCE_ZOOM;
	float weight = MAX_BLOCK_BLEND * (1.0 - 1.0 / (1.0 + relative_zoom * relative_zoom));
	COLOR = mix(detail, block, weight);
}
