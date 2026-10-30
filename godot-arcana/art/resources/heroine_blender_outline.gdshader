shader_type spatial;
render_mode unshaded, cull_front, shadows_disabled;
uniform vec3 entity_anchor=vec3(0.0);
uniform bool editor_preview=false;
void vertex() {
    VERTEX+=NORMAL*.007;
    vec4 view=MODELVIEW_MATRIX*vec4(VERTEX,1.0);
    vec4 anchor_view=VIEW_MATRIX*vec4(entity_anchor,1.0);
    if(!editor_preview) view.z=-150.0+dot(entity_anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18+(view.z-anchor_view.z)*.002;
    POSITION=PROJECTION_MATRIX*view;
}
void fragment() { ALBEDO=vec3(.15,.12,.21); }
