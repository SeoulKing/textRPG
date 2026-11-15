shader_type canvas_item;
render_mode unshaded;
uniform bool atlas_actor = false;
uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform vec2 sheet_grid = vec2(1.0);
uniform vec2 frame_cell = vec2(0.0);
uniform float sprite_lift = 0.0;
uniform float opacity = 1.0;
uniform vec2 hurt_offset = vec2(0.0);
uniform float hurt_angle = 0.0;
uniform float shadow_strength = 0.26;

void vertex() {
	if (atlas_actor) {
		float c = cos(hurt_angle);
		float s = sin(hurt_angle);
		VERTEX.y -= sprite_lift * 64.0;
		VERTEX = mat2(vec2(c, s), vec2(-s, c)) * VERTEX + hurt_offset * 64.0;
	}
}

void fragment() {
	float alpha = texture(TEXTURE, UV).a;
	if (atlas_actor) {
		alpha = texture(avatar_texture, (frame_cell + UV) / sheet_grid).a;
	}
	COLOR = vec4(vec3(0.13, 0.15, 0.21), step(0.5, alpha) * (atlas_actor ? opacity : 1.0) * COLOR.a * shadow_strength);
}
