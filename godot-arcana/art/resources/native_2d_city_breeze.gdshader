shader_type canvas_item;
render_mode blend_mix;
uniform float wind_time = 0.0;
uniform float wind_strength = 0.0;
varying vec4 sprite_tint;
void vertex() {
    sprite_tint = COLOR;
    vec2 origin = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xy;
    float breeze = sin(wind_time * 1.25 + origin.x * 0.009 + origin.y * 0.003);
    // A single affine shear keeps the foot pivot fixed and the image continuous.
    // Never round or offset individual texture rows: that creates horizontal seams.
    VERTEX.x -= VERTEX.y * breeze * wind_strength * 0.005;
}
void fragment() {
    COLOR = texture(TEXTURE, UV) * sprite_tint;
}