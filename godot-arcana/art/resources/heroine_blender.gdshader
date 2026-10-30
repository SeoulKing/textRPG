shader_type spatial;
render_mode unshaded;
#include "res://art/resources/local_lighting.gdshaderinc"
uniform vec4 base_color : source_color = vec4(1.0);
uniform sampler2D albedo_texture : source_color, filter_nearest;
uniform bool has_albedo_texture = false;
uniform bool hair_surface=false;
uniform bool covered_by_garment=false;
uniform bool skin_surface = false;
uniform bool minimum_zoom_outline = false;
uniform vec3 entity_anchor = vec3(0.0);
uniform bool editor_preview = false;
uniform bool sprite_render=false;
uniform float camera_yaw=0.0;
varying vec3 painted_normal;
varying vec3 world_point;
varying vec3 world_normal;
void vertex() {
    world_point=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
    world_normal=normalize(MODEL_NORMAL_MATRIX*NORMAL);
    painted_normal=world_normal;
    if(sprite_render) {
        float c=cos(camera_yaw);float s=sin(camera_yaw);
        world_point=vec3(c*world_point.x+s*world_point.z,world_point.y,-s*world_point.x+c*world_point.z)+entity_anchor;
        world_normal=vec3(c*world_normal.x+s*world_normal.z,world_normal.y,-s*world_normal.x+c*world_normal.z);
    }
    vec4 view=MODELVIEW_MATRIX*vec4(VERTEX,1.0);
    vec4 anchor_view=VIEW_MATRIX*vec4(entity_anchor,1.0);
    if(!editor_preview) view.z=-150.0+dot(entity_anchor.xz,normalize(INV_VIEW_MATRIX[2].xz))*.18+(view.z-anchor_view.z)*.002;
    POSITION=PROJECTION_MATRIX*view;
}
void fragment() {
    if(covered_by_garment)discard;
    vec3 color=base_color.rgb;
    if(has_albedo_texture) color*=texture(albedo_texture,UV).rgb;
    float d=dot(normalize(painted_normal),normalize(vec3(-.27,.73,.63)));
    vec3 shade=d>.50?vec3(1.0):(d>.18?vec3(.84,.85,.92):vec3(.63,.63,.72));
    if(hair_surface) shade=d>.50?vec3(1.0):(d>.18?vec3(.70,.73,.84):vec3(.42,.46,.64));
    if(skin_surface) shade=d>.50?vec3(1.0):(d>.18?vec3(.96,.94,.96):vec3(.86,.80,.83));
    vec3 illumination=local_ambient*local_ambient_tint+local_irradiance(world_point,normalize(world_normal));
    ALBEDO=color*shade*illumination;
}
