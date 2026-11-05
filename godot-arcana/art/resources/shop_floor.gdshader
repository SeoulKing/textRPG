shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
varying vec3 floor_world;
uniform sampler2D art : source_color, filter_nearest, repeat_disable;
void vertex() {
    vec3 world = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz;
    floor_world = world;
    vec4 view = MODELVIEW_MATRIX * vec4(VERTEX,1.0);
    view.z = -185.0 + world.y*3.0;
    POSITION = PROJECTION_MATRIX * view;
}
void fragment() {
    // Match the finished front bevels; no rectangular floor corners protrude outside.
    float front = (1.0-UV.y)*9.0;
    if (UV.x*14.0+front<0.75 || (1.0-UV.x)*14.0+front<0.75) discard;
    vec3 color = texture(art,UV).rgb;
    ALBEDO = color*(local_ambient*local_ambient_tint+local_irradiance(floor_world,vec3(0,1,0)));
}
