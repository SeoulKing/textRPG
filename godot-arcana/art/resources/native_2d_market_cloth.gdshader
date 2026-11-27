shader_type canvas_item;
render_mode blend_mix;
uniform vec4 cloth_ink : source_color = vec4(0.18, 0.65, 0.32, 1.0);
varying vec4 sprite_tint;
void vertex() { sprite_tint = COLOR; }
void fragment() {
    vec4 pixel = texture(TEXTURE, UV);
    // Recolor only the source's blue awning stripes. White canvas, wood and fruit retain their colors.
    float blue = min(pixel.b-pixel.r, pixel.b-pixel.g);
    if (blue > 0.025 && pixel.b > pixel.r*1.08) {
        float base = min(pixel.r,pixel.g);
        pixel.rgb = vec3(base)+(pixel.b-base)*cloth_ink.rgb;
    }
    COLOR = pixel*sprite_tint;
}