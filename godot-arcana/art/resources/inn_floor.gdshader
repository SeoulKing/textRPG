shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
varying vec3 floor_world;
uniform sampler2D art : source_color, filter_nearest, repeat_enable;
uniform vec2 repeats = vec2(1.0);
uniform vec3 art_tint = vec3(1.0);
void vertex() {
    vec3 world = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz;
    floor_world = world;
    vec4 view = MODELVIEW_MATRIX * vec4(VERTEX,1.0);
    // Same distant ground layer as the shared renderer; feet and sprites stay in front.
    view.z = -185.0 + world.y*3.0;
    POSITION = PROJECTION_MATRIX * view;
}
void fragment() {
    vec4 color = texture(art,UV*repeats);
    if (color.a<.5) discard;
    ALBEDO = color.rgb*art_tint*(local_ambient*local_ambient_tint+local_irradiance(floor_world,vec3(0,1,0)));
}
