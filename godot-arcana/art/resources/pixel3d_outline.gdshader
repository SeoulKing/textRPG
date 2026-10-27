shader_type spatial;
render_mode unshaded, cull_front;
uniform bool entity_anchor_enabled = false;
uniform vec3 entity_anchor = vec3(0.0);
void vertex() {
	vec4 view = MODELVIEW_MATRIX * vec4(VERTEX,1.0);
	vec3 anchor = entity_anchor_enabled ? entity_anchor : MODEL_MATRIX[3].xyz;
	vec3 center = (VIEW_MATRIX * vec4(anchor,1.0)).xyz;
	view.z = -150.0 + dot(anchor.xz,normalize(INV_VIEW_MATRIX[2].xz)) * .18 + (view.z-center.z) * .002 - .0001;
	POSITION = PROJECTION_MATRIX * view;
	// A consistent source-pixel outline instead of a world-space hull whose
	// apparent thickness changes with the mesh scale and window size.
	vec2 normal_screen = (PROJECTION_MATRIX * vec4(MODELVIEW_NORMAL_MATRIX * NORMAL, 0.0)).xy;
	if (length(normal_screen) > 0.0001) {
		POSITION.xy += normalize(normal_screen) * POSITION.w * 1.5 / VIEWPORT_SIZE;
	}
}
void fragment() { ALBEDO = vec3(0.1451,0.2353,0.2510); }
