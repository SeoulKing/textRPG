// Shared world-space local light field. No screen halos or frame-dependent noise.
uniform int local_light_count = 0;
uniform vec4 local_light_points[16]; // xyz world position, w range
uniform vec4 local_light_colors[16]; // linear rgb, w strength
uniform float local_ambient = 1.0;
uniform vec3 local_ambient_tint = vec3(1.0);
uniform bool spatial_emission_mask = false;
uniform bool spatial_map_enabled = false;
uniform sampler2D spatial_map : filter_nearest, repeat_disable;
varying vec3 light_anchor;
varying vec3 light_right;
varying vec3 light_forward;
varying float light_pitch_sine;
varying float light_pitch_cosine;

vec3 local_irradiance(vec3 point, vec3 normal) {
    vec3 result = vec3(0.0);
    for (int i=0;i<16;i++) {
        if (i>=local_light_count) break;
        vec3 delta=local_light_points[i].xyz-point;
        float distance=length(delta);
        float falloff=max(0.0,1.0-distance/local_light_points[i].w);
        float diffuse=max(0.0,dot(normal,delta/max(distance,.001)));
        result+=local_light_colors[i].rgb*local_light_colors[i].w*falloff*falloff*(.15+.85*diffuse);
    }
    return result;
}
vec3 sprite_lit(vec3 color, vec2 uv, vec2 size, float foot) {
    vec2 pixel=floor(uv*size)+.5;
    float up=(foot-pixel.y)/64.0;
    float height=max(0.0,up/max(light_pitch_cosine,.01));
    // A rounded receiver proxy for sprites without an authored surface map.
    float side=clamp((pixel.x-size.x*.5)/(size.x*.5),-.7,.7);
    vec3 normal=normalize(light_forward*.7+light_right*side+vec3(0,.25,0));
    if (spatial_map_enabled) {
        vec3 data=texture(spatial_map,uv).rgb;
        height=data.r*16.0;
        vec2 n=data.gb*2.0-1.0;
        normal=normalize(light_right*n.x+vec3(0,n.y,0)+light_forward*sqrt(max(.01,1.0-dot(n,n))));
    }
    float depth=(height*light_pitch_cosine-up)/max(light_pitch_sine,.01);
    vec3 point=light_anchor+light_right*((pixel.x-size.x*.5)/64.0)+light_forward*depth+vec3(0,height,0);
    vec3 illumination=local_irradiance(point,normal);
    // Emission is limited to warm source pixels near authored light origins.
    vec3 emission=vec3(0.0);
    if (spatial_map_enabled && color.r>color.b*1.3 && color.g>color.b*1.15) {
        for(int i=0;i<16;i++) {
            if(i>=local_light_count) break;
            float source=1.0-smoothstep(.12,.48,length(point-local_light_points[i].xyz));
            emission+=local_light_colors[i].rgb*source*.65;
        }
    }
    vec3 lit = color*(local_ambient*local_ambient_tint+illumination);
    if (spatial_emission_mask) {
        // Only authored flame/bulb texels emit, not every nearby golden decoration.
        float mask = spatial_map_enabled && local_light_count>0 ? texture(spatial_map,uv).a : 0.0;
        return max(lit,color*mask*1.20);
    }
    return lit+emission;
}
