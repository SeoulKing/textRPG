shader_type spatial;
render_mode unshaded, cull_disabled;
uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform bool minimum_zoom_outline=false;
uniform bool editor_preview=false;
uniform vec2 frame_size=vec2(96.0,144.0);
uniform float foot_offset=.6875;
uniform vec4 ink : source_color=vec4(.25,.23,.34,1.0);
void vertex() {
    vec3 anchor=MODEL_MATRIX[3].xyz;
    vec4 view=VIEW_MATRIX*vec4(anchor,1.0);
    view.xy+=vec2(VERTEX.x,VERTEX.y+foot_offset);
    if(!editor_preview) view.z=-150.0+dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18-.0002;
    POSITION=PROJECTION_MATRIX*view;
}
void fragment() {
    vec2 uv=(floor(UV*frame_size)+.5)/frame_size;
    vec4 c=texture(avatar_texture,uv);
    vec2 p=1.0/frame_size;
    float edge=max(max(texture(avatar_texture,uv+vec2(p.x,0)).a,texture(avatar_texture,uv-vec2(p.x,0)).a),max(texture(avatar_texture,uv+vec2(0,p.y)).a,texture(avatar_texture,uv-vec2(0,p.y)).a));
    if(c.a<.5) {if(edge<.5) discard;c=ink;}
    if(minimum_zoom_outline && c.a>=.5) {
        vec2 screen_dot=fwidth(UV);
        float inside=min(min(texture(avatar_texture,uv+vec2(screen_dot.x,0)).a,texture(avatar_texture,uv-vec2(screen_dot.x,0)).a),min(texture(avatar_texture,uv+vec2(0,screen_dot.y)).a,texture(avatar_texture,uv-vec2(0,screen_dot.y)).a));
        if(inside<.5)c.rgb=ink.rgb;
    }
    ALBEDO=c.rgb;
}
