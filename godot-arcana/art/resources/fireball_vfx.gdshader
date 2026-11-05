shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform sampler2D atlas : source_color, filter_nearest, repeat_disable;
uniform vec2 cell = vec2(0.0);
uniform float heading = 0.0;
uniform float anchor_offset = -0.31;
uniform float vertical_offset = 0.0;
vec3 ink(int i) {
 if(i==0) return vec3(1.0,.961,.788);
 if(i==1) return vec3(1.0,.882,.478);
 if(i==2) return vec3(1.0,.757,.227);
 if(i==3) return vec3(1.0,.580,.141);
 if(i==4) return vec3(.961,.388,.098);
 if(i==5) return vec3(.875,.231,.071);
 return vec3(.671,.145,.075);
}
void vertex() {
 vec4 view = VIEW_MATRIX*MODEL_MATRIX*vec4(0.0,0.0,0.0,1.0);
 vec2 p = VERTEX.xy+vec2(anchor_offset,vertical_offset);
 view.xy += mat2(vec2(cos(heading),sin(heading)),vec2(-sin(heading),cos(heading)))*p;
 POSITION = PROJECTION_MATRIX*view;
}
void fragment() {
 vec2 pixel = (floor(UV*64.0)+vec2(.5))/64.0;
 if(any(lessThan(pixel,vec2(.025))) || any(greaterThan(pixel,vec2(.975)))) discard;
 vec4 color = texture(atlas,(cell+pixel)/vec2(4.0,2.0));
 if(color.a<.8) discard;
 vec3 chosen=ink(0); float best=100.0;
 for(int i=0;i<7;i++) { vec3 d=color.rgb-ink(i); float error=dot(d,d); if(error<best) {best=error;chosen=ink(i);} }
 ALBEDO=chosen;
 ALPHA=1.0;
}
