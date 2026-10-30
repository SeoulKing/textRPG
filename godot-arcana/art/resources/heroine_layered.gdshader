shader_type spatial;
render_mode unshaded, cull_disabled;
#include "res://art/resources/local_lighting.gdshaderinc"
uniform vec2 frame_cell = vec2(0.0);
uniform vec2 sheet_grid = vec2(16.0,14.0);
uniform float foot_offset = 0.988547;
uniform bool editor_preview = false;
uniform sampler2D body_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D arms_bare_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D arms_front_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D arms_back_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D hair_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D dress_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D shawl_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D boots_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D top_sheet : source_color, filter_nearest, repeat_disable;
uniform sampler2D bottom_sheet : source_color, filter_nearest, repeat_disable;
// Four binary body-occlusion masks in RGBA, sampled without color conversion.
uniform sampler2D occlusion_sheet : filter_nearest, repeat_disable;
uniform bool dress_enabled = true;
uniform bool top_enabled = false;
uniform bool bottom_enabled = false;
uniform bool shawl_enabled = true;
uniform bool boots_enabled = true;
// User-approved inner silhouette: one render dot, minimum zoom only.
uniform bool minimum_zoom_outline = false;
uniform vec4 minimum_zoom_ink : source_color = vec4(.204,.231,.294,1.0);

void vertex() {
    vec3 anchor = MODEL_MATRIX[3].xyz;
    light_anchor=anchor;
    light_right=normalize(INV_VIEW_MATRIX[0].xyz);
    light_forward=normalize(vec3(INV_VIEW_MATRIX[2].x,0.0,INV_VIEW_MATRIX[2].z));
    light_pitch_sine=abs(INV_VIEW_MATRIX[2].y);
    light_pitch_cosine=length(INV_VIEW_MATRIX[2].xz);
    vec4 view = VIEW_MATRIX * vec4(anchor,1.0);
    vec2 scale = vec2(length(MODEL_MATRIX[0].xyz),length(MODEL_MATRIX[1].xyz));
    view.xy += vec2(VERTEX.x,VERTEX.y+foot_offset)*scale;
    if (!editor_preview)
        view.z = -150.0 + dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18 - .0002;
    POSITION = PROJECTION_MATRIX*view;
}

vec4 layer_over(vec4 below, vec4 above) { return above.a>=.5 ? above : below; }
vec4 composed_pixel(vec2 point, vec2 size) {
 if(any(lessThan(point,vec2(0.0)))||any(greaterThanEqual(point,vec2(1.0)))) return vec4(0.0);
 vec2 uv=(frame_cell+clamp(point,vec2(.5)/size,vec2(1.0)-vec2(.5)/size))/sheet_grid;
 vec4 color=texture(body_sheet,uv);
 bool clothed=dress_enabled||top_enabled;
 if(clothed) color=layer_over(texture(arms_back_sheet,uv),color);
 vec4 masks=texture(occlusion_sheet,uv);
 float hidden=0.0;
 if(dress_enabled) hidden=max(hidden,masks.r);
 if(top_enabled) hidden=max(hidden,masks.g);
 if(bottom_enabled) hidden=max(hidden,masks.b);
 if(boots_enabled) hidden=max(hidden,masks.a);
 if(hidden>=.5) color=vec4(0.0);
 if(boots_enabled) color=layer_over(color,texture(boots_sheet,uv));
 if(bottom_enabled) color=layer_over(color,texture(bottom_sheet,uv));
 if(dress_enabled) color=layer_over(color,texture(dress_sheet,uv));
 if(top_enabled) color=layer_over(color,texture(top_sheet,uv));
 if(clothed) color=layer_over(color,texture(arms_front_sheet,uv));
 else color=layer_over(color,texture(arms_bare_sheet,uv));
 if(shawl_enabled) color=layer_over(color,texture(shawl_sheet,uv));
 color=layer_over(color,texture(hair_sheet,uv));
 return color;
}

void fragment() {
 vec2 size=vec2(textureSize(body_sheet,0))/sheet_grid;
 vec4 color=composed_pixel(UV,size);
 if(color.a<.5) discard;
 if(minimum_zoom_outline) {
   // Cardinal neighbours only: no diagonal dilation or second outside border.
   vec2 dot_size=fwidth(UV);
   float edge_alpha=min(min(composed_pixel(UV+vec2(dot_size.x,0),size).a,composed_pixel(UV-vec2(dot_size.x,0),size).a),min(composed_pixel(UV+vec2(0,dot_size.y),size).a,composed_pixel(UV-vec2(0,dot_size.y),size).a));
   if(edge_alpha<.5) color.rgb=minimum_zoom_ink.rgb;
 }
 ALBEDO=sprite_lit(color.rgb,clamp(UV,vec2(.5)/size,vec2(1.0)-vec2(.5)/size),size,size.y*.5+foot_offset*64.0);
}
