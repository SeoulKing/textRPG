shader_type canvas_item;
render_mode unshaded;

#include "res://art/resources/world_dot_grid.gdshaderinc"

uniform bool use_viewport_texels = false;

void fragment() {
	if (use_viewport_texels) {
		COLOR = texture(TEXTURE, UV);
		if (pixel_size > 1) {
			COLOR.rgb = quantize_world_color(COLOR.rgb);
		}
	} else {
		COLOR = sample_world_dots(TEXTURE, UV, TEXTURE_PIXEL_SIZE);
	}
}
