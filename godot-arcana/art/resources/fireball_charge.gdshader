shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform float progress=0.0;
uniform bool reduced=false;
// Crisp 96-dot billboard: embers spiral inward, then a dense pale core releases.
void vertex() {
    vec4 view=VIEW_MATRIX*MODEL_MATRIX*vec4(0.0,0.0,0.0,1.0);
    view.xy+=VERTEX.xy;
    POSITION=PROJECTION_MATRIX*view;
}
void fragment() {
    vec2 p=(floor(UV*96.0)+.5)/96.0-.5;
    float charge=clamp(progress,0.0,1.0);
    float fade=1.0-clamp((progress-1.0)/.45,0.0,1.0);
    float core=(.018+.105*charge)*fade;
    float radius=length(p);
    vec3 color=vec3(0.0);
    bool visible=false;
    if(radius<core) {
        visible=true;
        color=radius<core*.43 ? vec3(1.0,.961,.788) : (radius<core*.72 ? vec3(1.0,.757,.227) : vec3(.961,.388,.098));
    }
    for(int i=0;i<12;i++) {
        float seed=float(i);
        float life=fract(charge*1.65+seed*.618);
        float angle=seed*2.4+(reduced ? 0.0 : charge*3.4+life*1.6);
        float orbit=mix(.40,core,life);
        vec2 at=vec2(cos(angle),sin(angle))*orbit;
        vec2 d=abs(p-at);
        float size=(.010+.009*life)*fade;
        if(max(d.x,d.y)<size && progress<1.0 && !reduced) {
            visible=true; color=life>.65 ? vec3(1.0,.757,.227) : vec3(.875,.231,.071);
        }
    }
    if(!visible || fade<=.01)discard;
    ALBEDO=color;
    ALPHA=1.0;
}
