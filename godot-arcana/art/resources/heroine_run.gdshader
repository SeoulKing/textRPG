shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
uniform sampler2D avatar_texture : source_color, filter_nearest, repeat_disable;
uniform vec2 frame_cell=vec2(0.0);
uniform vec2 sheet_grid=vec2(8.0,9.0);
uniform bool minimum_zoom_outline=false;
uniform bool editor_preview=false;
uniform vec4 ink : source_color=vec4(.188,.141,.259,1.0);
void vertex() {
    vec3 anchor=MODEL_MATRIX[3].xyz;
    light_anchor=anchor;
    light_right=normalize(INV_VIEW_MATRIX[0].xyz);
    light_forward=normalize(vec3(INV_VIEW_MATRIX[2].x,0.0,INV_VIEW_MATRIX[2].z));
    light_pitch_sine=abs(INV_VIEW_MATRIX[2].y);
    light_pitch_cosine=length(INV_VIEW_MATRIX[2].xz);
    vec4 view=VIEW_MATRIX*vec4(anchor,1.0);
    vec2 scale=vec2(length(MODEL_MATRIX[0].xyz),length(MODEL_MATRIX[1].xyz));
    view.xy+=vec2(VERTEX.x,VERTEX.y+.75)*scale;
    if(!editor_preview) view.z=-150.0+dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18-.0002;
    POSITION=PROJECTION_MATRIX*view;
}
vec4 sample_frame(vec2 point) {
    if(any(lessThan(point,vec2(0.0))) || any(greaterThanEqual(point,vec2(1.0))))return vec4(0.0);
    vec2 local=(floor(point*vec2(96.0,136.0))+.5)/vec2(96.0,136.0);
    return texture(avatar_texture,(frame_cell+local)/sheet_grid);
}
void fragment() {
    vec4 c=sample_frame(UV);
    if(c.a<.5)discard;
    if(minimum_zoom_outline) {
        vec2 p=fwidth(UV);
        float edge=min(min(sample_frame(UV+vec2(p.x,0)).a,sample_frame(UV-vec2(p.x,0)).a),min(sample_frame(UV+vec2(0,p.y)).a,sample_frame(UV-vec2(0,p.y)).a));
        if(edge<.5)c.rgb=ink.rgb;
    }
    ALBEDO=sprite_lit(c.rgb,UV,vec2(96.0,136.0),116.0);
}
