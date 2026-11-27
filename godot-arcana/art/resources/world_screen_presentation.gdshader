shader_type canvas_item;
render_mode unshaded, blend_disabled;

#include "res://art/resources/world_dot_grid.gdshaderinc"

uniform sampler2D world_screen : hint_screen_texture, filter_nearest, repeat_disable;
uniform vec2 pixel_offset = vec2(0.0);

void fragment() {
	COLOR = sample_world_dots(world_screen, SCREEN_UV - pixel_offset * SCREEN_PIXEL_SIZE, SCREEN_PIXEL_SIZE);
}
