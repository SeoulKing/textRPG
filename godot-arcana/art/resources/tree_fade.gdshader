shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
#include "res://art/resources/local_lighting.gdshaderinc"
#include "res://art/resources/inn_fire_animation.gdshaderinc"
uniform sampler2D sprite_sheet : source_color, filter_nearest, repeat_disable;
uniform vec2 frame_cell = vec2(0.0);
uniform vec2 sheet_grid = vec2(16.0,6.0);
uniform float foot_offset = 0.988547;
uniform bool editor_preview = false;
// Outdoor art samples one common 1/64-world-unit grid after placement scaling.
uniform bool world_pixel_grid_enabled = false;
uniform vec2 world_pixel_grid = vec2(1.0);
uniform vec2 authored_pixel_size = vec2(1.0);
uniform float world_pixel_foot_y = 0.0;
uniform vec3 depth_anchor_offset = vec3(0.0);
uniform float tree_opacity : hint_range(0.0,1.0) = 1.0;
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
        view.z = -150.0 + dot((anchor+depth_anchor_offset).xz,normalize(INV_VIEW_MATRIX[2].xz))*.18 - .0002;
    POSITION = PROJECTION_MATRIX*view;
}
void fragment() {
    // Clamp to texel centers to prevent neighboring-frame bleed at the quad edge.
    vec2 size = vec2(textureSize(sprite_sheet,0))/sheet_grid;
    vec2 sample_uv = world_pixel_grid_enabled ? (floor(UV*world_pixel_grid)+vec2(.5))/world_pixel_grid : UV;
    vec2 uv = clamp(sample_uv,vec2(.5)/size,vec2(1.0)-vec2(.5)/size);
    vec4 color = texture(sprite_sheet,(frame_cell+uv)/sheet_grid);
    if (color.a < .5) discard;
    vec4 fire=vec4(color.rgb,0.0);
    if (inn_fire_enabled) {
        vec3 painted=texture(sprite_sheet,(frame_cell+inn_fire_uv(floor(uv*size),size))/sheet_grid).rgb;
        fire=inn_fire_sample(painted,floor(uv*size));
    }
    vec2 lighting_size = world_pixel_grid_enabled ? world_pixel_grid : size;
    float lighting_foot = world_pixel_grid_enabled ? world_pixel_foot_y : size.y*.5+foot_offset*64.0;
    ALBEDO = max(sprite_lit(fire.rgb,uv,lighting_size,lighting_foot),fire.rgb*fire.a);
    ALPHA = tree_opacity; // This mesh is used only during the temporary occlusion fade.
}

