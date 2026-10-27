shader_type spatial;
render_mode unshaded, cull_front;
uniform vec4 ink_color : source_color = vec4(.10,.13,.12,1.0);
uniform bool editor_preview = false;
uniform vec3 entity_anchor = vec3(0.0);
void vertex() {
    VERTEX += NORMAL * .008;
    vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
    if (!editor_preview) {
        vec3 anchor_view = (VIEW_MATRIX * vec4(entity_anchor, 1.0)).xyz;
        view.z = -150.0 + entity_anchor.z * .18 - .02 + (view.z - anchor_view.z) * .001;
    }
    POSITION = PROJECTION_MATRIX * view;
}
void fragment() { ALBEDO = ink_color.rgb; }
