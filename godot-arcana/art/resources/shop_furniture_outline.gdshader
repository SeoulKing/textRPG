shader_type spatial;
render_mode unshaded, cull_disabled;

uniform sampler2D face_art : source_color, filter_nearest, repeat_disable;
uniform vec4 art_region;
// Left, top, right, bottom. The shared top/front edge is left unmarked.
uniform vec4 outer_edges;
uniform vec4 counter_silhouette;
uniform vec4 ink : source_color = vec4(0.18, 0.105, 0.095, 1.0);
uniform bool ink_enabled = true;
varying vec2 projected_counter;

void vertex() {
	// Local screen axes for the shop's straight-on 45-degree camera.
	projected_counter = vec2(VERTEX.x, (VERTEX.y - VERTEX.z) * 0.70710678);
}

float face_alpha(vec2 pixel, vec2 first, vec2 last, vec2 image_size) {
	return texture(face_art, (clamp(pixel, first, last) + vec2(0.5)) / image_size).a;
}

void fragment() {
	vec4 paint = texture(face_art, UV);
	if (paint.a < 0.5) {
		discard;
	}

	bool edge;
	if (counter_silhouette.x > 0.0) {
		float side = counter_silhouette.x - abs(projected_counter.x);
		float top = counter_silhouette.z - projected_counter.y;
		float bottom = projected_counter.y - counter_silhouette.y;
		// The short diagonal at each rear corner follows the end chamfer.
		float corner = (side * 0.70710678 + top - counter_silhouette.w) * 0.81649658;
		edge = min(min(side, top), min(bottom, corner)) < 1.0 / 64.0;
	} else {
		vec2 image_size = vec2(textureSize(face_art, 0));
		vec2 first = art_region.xy;
		vec2 last = art_region.zw;
		vec2 p = floor(UV * image_size);
		vec4 neighbors = vec4(
			face_alpha(p - vec2(1.0, 0.0), first, last, image_size),
			face_alpha(p - vec2(0.0, 1.0), first, last, image_size),
			face_alpha(p + vec2(1.0, 0.0), first, last, image_size),
			face_alpha(p + vec2(0.0, 1.0), first, last, image_size)
		);
		vec4 margin = vec4(p - first, last - p);
		edge = any(lessThan(neighbors, vec4(0.5))) || any(lessThan(margin, outer_edges));
	}
	ALBEDO = ink_enabled && edge ? ink.rgb : paint.rgb;
}
