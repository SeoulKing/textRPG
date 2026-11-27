shader_type canvas_item;
#include "res://art/resources/world_art_highlight.gdshaderinc"
uniform float highlight_strength : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform vec2 sheet_grid = vec2(1.0);
uniform vec2 frame_cell = vec2(0.0);
uniform float hurt_flash = 0.0;
uniform float hit_flash = 0.0;
uniform float sprite_lift = 0.0;
uniform float opacity = 1.0;
uniform vec2 hurt_offset = vec2(0.0);
uniform float hurt_angle = 0.0;
uniform bool model_outline = false;
uniform vec4 model_ink : source_color = vec4(0.207843, 0.176471, 0.250980, 1.0);
varying vec4 actor_modulate;
void vertex() {
 actor_modulate = COLOR;
 float c=cos(hurt_angle); float s=sin(hurt_angle);
 VERTEX.y-=sprite_lift*64.0;
 VERTEX=mat2(vec2(c,s),vec2(-s,c))*VERTEX+hurt_offset*64.0;
}
void fragment() {
 vec2 uv = (frame_cell + UV) / sheet_grid;
 vec4 c = texture(avatar_texture, uv);
 vec2 source_texel = 1.0 / vec2(textureSize(avatar_texture, 0));
 if (highlight_strength > 0.0 && c.a > 0.5) {
  vec2 first = frame_cell / sheet_grid + source_texel * 0.5;
  vec4 left = texture(avatar_texture, max(first, uv - vec2(source_texel.x, 0.0)));
  vec4 above = texture(avatar_texture, max(first, uv - vec2(0.0, source_texel.y)));
  c.rgb = mix(c.rgb, vec3(1.0), world_art_highlight_mask(c, left, above) * highlight_strength);
 }
 vec2 texel = max(source_texel, fwidth(uv));
 if (model_outline && c.a < 1.0) {
  vec2 dx = vec2(texel.x, 0.0);
  vec2 dy = vec2(0.0, texel.y);
  float adjacent = max(max(texture(avatar_texture, uv + dx).a, texture(avatar_texture, uv - dx).a),
   max(texture(avatar_texture, uv + dy).a, texture(avatar_texture, uv - dy).a));
  float ink_alpha = step(0.5, adjacent) * (1.0 - c.a) * model_ink.a;
  float alpha = c.a + ink_alpha;
  c = vec4((c.rgb * c.a + model_ink.rgb * ink_alpha) / max(alpha, 0.0001), alpha);
 }
 // Fragment COLOR already includes Sprite2D's default TEXTURE sample. Use
 // the vertex tint so the selected frame's color and alpha are applied once.
 COLOR = actor_modulate * vec4(mix(c.rgb,vec3(1.0),max(hurt_flash,hit_flash) * .6),c.a * opacity);
}
