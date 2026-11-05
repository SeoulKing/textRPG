shader_type spatial;
render_mode unshaded, cull_back, fog_disabled;
// Same palette ink and one-source-pixel coverage as the other world figures.
uniform vec4 ink_color : source_color = vec4(0.145098,0.235294,0.250980,1.0);
uniform vec2 offset_pixels = vec2(1.0,0.0);
uniform bool editor_preview = false;
uniform vec3 entity_anchor = vec3(0.0);
void vertex() {
    vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
    if (!editor_preview) {
        // Behind the whole character, not individual clothes or limbs.
        // Match foot-based world sorting so scenery still occludes the ink.
        view.z = -150.0 + dot(entity_anchor.xz,normalize(INV_VIEW_MATRIX[2].xz)) * .18 - .02;
    } else {
        // Keep real depth in the editor, with the ink behind the surface.
        view.z -= .02;
    }
    POSITION = PROJECTION_MATRIX * view;
    // Translate actual skinned coverage in four directions; normal extrusion
    // can shrink below one pixel or disappear entirely on flat faces.
    POSITION.xy += offset_pixels * 2.0 * POSITION.w / VIEWPORT_SIZE;
}
void fragment() { ALBEDO = ink_color.rgb; }
