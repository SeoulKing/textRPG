shader_type spatial;
render_mode unshaded, cull_back, fog_disabled;

uniform vec4 ink_color : source_color = vec4(0.145098, 0.235294, 0.250980, 1.0);
uniform bool entity_anchor_enabled = false;
uniform vec3 entity_anchor = vec3(0.0);

void vertex() {
	vec4 view = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec3 anchor = entity_anchor_enabled ? entity_anchor : MODEL_MATRIX[3].xyz;
	// All ink sits behind the whole figure, so overlapping limbs hide internal ink.
	// Keep the same ground-anchor sorting as the scene's surface shader.
	view.z = -150.0 + anchor.z * 0.18 - 0.02;
	POSITION = PROJECTION_MATRIX * view;
	// Four opaque silhouette copies, shifted exactly one source pixel each.
	// This follows coverage rather than mesh normals, including flat box faces.
	vec2 offset_pixels = INSTANCE_CUSTOM.xy * 2.0 - 1.0;
	POSITION.xy += offset_pixels * 2.0 * POSITION.w / VIEWPORT_SIZE;
}

void fragment() {
	ALBEDO = ink_color.rgb;
}
