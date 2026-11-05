shader_type spatial;
render_mode unshaded, cull_disabled;
void vertex() {
    vec4 view = MODELVIEW_MATRIX * vec4(VERTEX,1.0);
    // Same ground-depth convention as the city floor; actors still cover the marker.
    view.z = -185.0 + (MODEL_MATRIX*vec4(VERTEX,1.0)).y*3.0;
    POSITION = PROJECTION_MATRIX*view;
}
void fragment() {
    vec2 edge = min(UV,vec2(1.0)-UV);
    if (min(edge.x,edge.y)>.035) discard;
    ALBEDO = vec3(.611765,.858824,.827451);
}

