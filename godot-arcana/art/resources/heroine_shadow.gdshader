shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform bool editor_preview = false;
uniform vec3 entity_anchor = vec3(0.0);
void vertex() {
    vec4 view = MODELVIEW_MATRIX*vec4(VERTEX,1.0);
    if (!editor_preview)
        view.z = -150.0 + dot(entity_anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18 - .002;
    POSITION = PROJECTION_MATRIX*view;
}
void fragment() {
    float radius = length(UV*2.0-1.0);
    if (radius>1.0) discard;
    ALBEDO = vec3(.13,.20,.18);
    ALPHA = (1.0-smoothstep(.35,1.0,radius))*.25;
}

