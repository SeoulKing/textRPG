shader_type spatial;
render_mode unshaded, cull_front, fog_disabled, shadows_disabled, depth_draw_never;

void vertex() {
	POSITION = PROJECTION_MATRIX * MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	vec2 normal_clip = (PROJECTION_MATRIX * vec4(MODELVIEW_NORMAL_MATRIX * NORMAL, 0.0)).xy;
	vec2 normal_pixels = normal_clip * VIEWPORT_SIZE;
	if (length(normal_pixels) > 0.0001) {
		// Expand by one raster pixel while keeping the body's depth for occlusion.
		POSITION.xy += normalize(normal_pixels) * 2.0 * POSITION.w / VIEWPORT_SIZE;
	}
}

void fragment() {
	ALBEDO = vec3(1.0);
	// Draw after the world's screen-space edge pass.
	ALPHA = 1.0;
}
