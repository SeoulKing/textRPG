shader_type canvas_item;
uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform vec2 sheet_grid = vec2(1.0);
uniform vec2 frame_cell = vec2(0.0);
uniform float hurt_flash = 0.0;
uniform float hit_flash = 0.0;
uniform float sprite_lift = 0.0;
uniform float opacity = 1.0;
uniform vec2 hurt_offset = vec2(0.0);
uniform float hurt_angle = 0.0;
void vertex() {
 float c=cos(hurt_angle); float s=sin(hurt_angle);
 VERTEX.y-=sprite_lift*64.0;
 VERTEX=mat2(vec2(c,s),vec2(-s,c))*VERTEX+hurt_offset*64.0;
}
void fragment() {
 vec4 c = texture(avatar_texture, (frame_cell + UV) / sheet_grid);
 COLOR *= vec4(mix(c.rgb,vec3(1.0),max(hurt_flash,hit_flash) * .6),c.a * opacity);
}
