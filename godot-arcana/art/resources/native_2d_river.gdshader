shader_type canvas_item;
render_mode unshaded;
uniform float river_time = 0.0;
uniform float reflection_strength = 0.22;
uniform float river_depth = 320.0;
varying vec2 river_pixel;
void vertex() { river_pixel = VERTEX; }
void fragment() {
    vec2 p = floor(river_pixel);
    float tick = floor(river_time * 8.0) / 8.0;
    vec2 drift = vec2(floor(tick * 9.0), floor(sin(p.x * 0.012 + tick * 0.8) * 1.5));
    vec4 water = texture(TEXTURE, fract((p + drift) / 512.0));
    water.rgb = mix(water.rgb, vec3(0.025, 0.26, 0.35), 0.25);
    float shore = min(p.y, river_depth-p.y);
    water.rgb *= mix(0.56, 0.94, smoothstep(0.0, 38.0, shore));
    // Short broken vertical reflections below the north-bank lanterns.
    float lamp_x = mod(p.x-256.0, 640.0)-320.0;
    float glimmer = sin(p.y*0.43 + tick*2.3) + sin(p.y*0.14-tick*1.1);
    float width = 3.0 + p.y*0.025;
    float shaft = (1.0-smoothstep(width,width+7.0,abs(lamp_x+glimmer*4.0)));
    float bands = step(0.0,sin(p.y*0.87+tick*2.0))*0.7 + step(0.88,sin(p.y*0.23-tick))*0.3;
    float reflection = shaft*bands*exp(-p.y/105.0)*reflection_strength;
    water.rgb = mix(water.rgb,vec3(1.0,0.75,0.29),clamp(reflection,0.0,0.80));
    COLOR = vec4(water.rgb,1.0);
}
