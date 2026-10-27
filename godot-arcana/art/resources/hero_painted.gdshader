shader_type spatial;
render_mode specular_disabled;
uniform vec4 base_color : source_color = vec4(1.0);
uniform sampler2D albedo_texture : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform bool has_texture = false;
uniform bool editor_preview = false;
uniform vec3 entity_anchor = vec3(0.0);
void vertex() {
    vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
    bool main_view = dot(normalize(INV_VIEW_MATRIX[2].xyz), normalize(MAIN_CAM_INV_VIEW_MATRIX[2].xyz)) > .9999;
    if (!editor_preview && main_view) {
        vec3 anchor_view = (VIEW_MATRIX * vec4(entity_anchor, 1.0)).xyz;
        view.z = -150.0 + entity_anchor.z * .18 + (view.z - anchor_view.z) * .002;
    }
    POSITION = PROJECTION_MATRIX * view;
}
void fragment() {
    ALBEDO = base_color.rgb * (has_texture ? texture(albedo_texture, UV).rgb : vec3(1.0));
    ROUGHNESS = .88;
    SPECULAR = 0.0;
}
void light() {
    float ndl = max(0.0, dot(NORMAL, LIGHT));
    float ramp = ndl < .22 ? .35 : (ndl < .68 ? .72 : 1.0);
    float shadow = ATTENUATION < .3 ? .10 : (ATTENUATION < .75 ? .55 : 1.0);
    DIFFUSE_LIGHT += ramp * shadow * LIGHT_COLOR / PI;
}
