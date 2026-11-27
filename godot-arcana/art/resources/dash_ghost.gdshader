shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform vec2 frame_cell=vec2(0.0);
uniform float opacity=.25;
void vertex() {
    vec3 anchor=MODEL_MATRIX[3].xyz;
    vec4 view=VIEW_MATRIX*vec4(anchor,1.0);
    view.xy+=vec2(VERTEX.x,VERTEX.y+.75);
    view.z=-150.0+dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18-.0003;
    POSITION=PROJECTION_MATRIX*view;
}
void fragment() {
    vec2 local=(floor(UV*vec2(96.0,136.0))+.5)/vec2(96.0,136.0);
    vec4 c=texture(avatar_texture,(frame_cell+local)/vec2(6.0,8.0));
    if(c.a<.5)discard;
    ALBEDO=mix(c.rgb,vec3(.45,.80,1.0),.75);
    ALPHA=opacity;
}
