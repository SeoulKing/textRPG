// Source colors and alpha are read before any scene light, actor flash or fade.
float world_art_highlight_mask(vec4 center, vec4 left, vec4 above) {
	vec3 luma = vec3(0.299, 0.587, 0.114);
	float center_luma = dot(center.rgb, luma);
	float contrast = max((center_luma - dot(left.rgb, luma)) * left.a,
			(center_luma - dot(above.rgb, luma)) * above.a);
	float painted_edge = smoothstep(0.055, 0.20, contrast);
	float silhouette = 1.0 - smoothstep(0.2, 0.8, min(left.a, above.a));
	return smoothstep(0.5, 0.95, center.a) * max(painted_edge, silhouette);
}
