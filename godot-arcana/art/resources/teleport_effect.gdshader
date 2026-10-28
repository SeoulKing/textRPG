shader_type spatial;
render_mode unshaded, cull_disabled;
uniform sampler2D effect_texture : source_color, filter_nearest, repeat_disable;
uniform vec2 frame_cell=vec2(0.0);
void vertex() {
    vec3 anchor=MODEL_MATRIX[3].xyz;
    vec4 view=VIEW_MATRIX*vec4(anchor,1.0);
    view.xy+=vec2(VERTEX.x,VERTEX.y+.75);
    view.z=-150.0+dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18-.0006;
    POSITION=PROJECTION_MATRIX*view;
}
void fragment() {
    vec2 pixel=(floor(UV*vec2(96.0,136.0))+.5)/vec2(96.0,136.0);
    vec4 c=texture(effect_texture,(frame_cell+pixel)/vec2(8.0,8.0));
    if(c.a<.5)discard;
    ALBEDO=c.rgb;
}
