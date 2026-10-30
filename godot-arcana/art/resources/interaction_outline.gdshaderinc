// Optional pixel-registered arched door inside a larger building sprite.
uniform vec4 interaction_region = vec4(0.0);
uniform float interaction_arch_ratio = 0.25;
float interaction_shape(vec2 pixel) {
    if (interaction_region.z <= 0.0) return 1.0;
    vec2 p = pixel-interaction_region.xy;
    vec2 extent = interaction_region.zw;
    if (p.x < 0.0 || p.y < 0.0 || p.x >= extent.x || p.y >= extent.y) return 0.0;
    float cap = extent.y*interaction_arch_ratio;
    if (p.y >= cap) return 1.0;
    vec2 arc = vec2((p.x-extent.x*.5)/(extent.x*.5),(p.y-cap)/cap);
    return step(dot(arc,arc),1.0);
}
vec3 interaction_outline(vec3 paint,vec2 uv,vec2 size) {
    if (!interaction_highlight) return paint;
    vec2 at = (frame_cell+uv)/sheet_grid;
    vec2 d = vec2(2.0)/size/sheet_grid;
    vec2 pixel = uv*size;
    float inside = min(min(texture(sprite_sheet,at+vec2(d.x,0.0)).a*interaction_shape(pixel+vec2(2.0,0.0)),texture(sprite_sheet,at-vec2(d.x,0.0)).a*interaction_shape(pixel-vec2(2.0,0.0))),min(texture(sprite_sheet,at+vec2(0.0,d.y)).a*interaction_shape(pixel+vec2(0.0,2.0)),texture(sprite_sheet,at-vec2(0.0,d.y)).a*interaction_shape(pixel-vec2(0.0,2.0))));
    float border = interaction_shape(pixel)*(1.0-step(.5,inside));
    return mix(paint,vec3(1.0,.88,.40)*1.35,border);
}
