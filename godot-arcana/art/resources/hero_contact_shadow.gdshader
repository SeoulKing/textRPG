shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform bool editor_preview = false;
void vertex() {
	vec4 view = MODELVIEW_MATRIX * vec4(VERTEX,1.0);
	if (!editor_preview) view.z = -184.95;
	POSITION = PROJECTION_MATRIX * view;
}
void fragment() {
	float radius = length(UV * 2.0 - 1.0);
	if (radius > 1.0) discard;
	ALBEDO = vec3(0.13,0.20,0.18);
	ALPHA = (1.0 - smoothstep(0.35,1.0,radius)) * 0.30;
}
