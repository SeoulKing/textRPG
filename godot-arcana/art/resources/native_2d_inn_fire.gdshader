shader_type canvas_item;
#include "res://art/resources/inn_fire_animation.gdshaderinc"

// The baked native sprite keeps the approved 272 x 256 painting's UVs.
const vec2 PAINT_SIZE = vec2(272.0, 256.0);
varying vec4 sprite_tint;

void vertex() {
    sprite_tint = COLOR;
}

void fragment() {
    vec4 base = texture(TEXTURE, UV);
    vec2 pixel = floor(UV * PAINT_SIZE);
    vec3 painted = texture(TEXTURE, inn_fire_uv(pixel, PAINT_SIZE)).rgb;
    vec4 fire = inn_fire_sample(painted, pixel);
    // Keep the original silhouette, native lighting and actor occlusion fade.
    COLOR = vec4(fire.rgb, base.a) * sprite_tint;
}
