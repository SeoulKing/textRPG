// The flame texture's own painted detail moves in 12 game-clock poses.
// All other props use the untouched shared sprite path.
uniform bool inn_fire_enabled = false;
uniform int inn_fire_frame = 0;

bool inn_fire_box(vec2 pixel) {
    float side=abs((pixel.x-135.5)/45.5);
    return pixel.x>=90.0 && pixel.x<=181.0 && pixel.y>=166.0+7.0*side*side && pixel.y<=211.0;
}
vec2 inn_fire_uv(vec2 pixel, vec2 size) {
    if (!inn_fire_enabled || !inn_fire_box(pixel)) return (pixel+.5)/size;
    float phase=float(inn_fire_frame)*6.28318530718/12.0;
    float up=clamp((212.0-pixel.y)/46.0,0.0,1.0);
    float stretch=1.0+.13*sin(phase+pixel.x*.073);
    float sway=floor(1.5*sin(phase+pixel.y*.22)+1.5*sin(phase*2.0+pixel.x*.12)*up);
    float y=floor(212.0+(pixel.y-212.0)/stretch+1.3*sin(phase*2.0+pixel.x*.24)*up);
    vec2 sample_pixel=clamp(vec2(pixel.x+sway,y),vec2(90,163),vec2(181,213));
    return (sample_pixel+.5)/size;
}
vec4 inn_fire_sample(vec3 painted, vec2 pixel) {
    if (!inn_fire_enabled || !inn_fire_box(pixel)) return vec4(painted,0.0);
    float phase=float(inn_fire_frame)*6.28318530718/12.0;
    vec3 color=painted;
    float emission=(color.r>.30 && color.g>.08 && color.r>color.b*1.5)?1.0:0.0;
    // Tiny rising sparks in front of the same fixed charcoal firebox.
    for(int i=0;i<3;i++) {
        float k=float(i);
        float rise=mod(float(inn_fire_frame)*3.0+k*14.0,43.0);
        float x=112.0+k*22.0+floor(3.0*sin(phase+k*2.0));
        bool popping=i<2 || inn_fire_frame==3 || inn_fire_frame==8;
        if(popping && abs(pixel.x-x)<1.0 && abs(pixel.y-(209.0-rise))<1.5) {
            color=vec3(1.0,.67,.10);
            emission=1.0;
        }
    }
    return vec4(color,emission);
}
