shader_type spatial;
render_mode unshaded, blend_add, cull_front, depth_test_disabled, depth_draw_never, fog_disabled;

uniform sampler2D scene_depth : hint_depth_texture, filter_nearest, repeat_disable;
uniform vec4 light_tint : source_color = vec4(1.0, 0.67, 0.32, 1.0);
uniform float light_radius = 5.0;
uniform float surface_strength = 0.24;
uniform float back_wall_z = 4.0;
varying flat vec3 light_center;

void vertex() {
	light_center = MODEL_MATRIX[3].xyz;
}

void fragment() {
	float raw_depth = textureLod(scene_depth, SCREEN_UV, 0.0).r;
	vec3 ndc = vec3(SCREEN_UV * 2.0 - 1.0, mix(CLIP_SPACE_FAR, 1.0, raw_depth));
	vec4 view = INV_PROJECTION_MATRIX * vec4(ndc, 1.0);
	vec3 surface = (INV_VIEW_MATRIX * vec4(view.xyz / view.w, 1.0)).xyz;
	vec3 to_light = light_center - surface;
	float distance_ratio = length(to_light) / light_radius;
	float falloff = 1.0 - smoothstep(0.22, 1.0, distance_ratio);
	// Give surfaces facing the lamp a brighter band. Orient the reconstructed
	// normal toward the camera so the derivative winding works across renderers.
	vec3 normal = normalize(cross(dFdx(surface), dFdy(surface)));
	vec3 toward_camera = INV_VIEW_MATRIX[2].xyz;
	normal *= dot(normal, toward_camera) < 0.0 ? -1.0 : 1.0;
	float facing = max(dot(normal, to_light / max(length(to_light), 0.0001)), 0.0);
	falloff *= mix(0.18, 1.0, facing);
	// The shade sends the strongest spill downward. Upward light fades before the cornice.
	falloff *= mix(0.07, 1.0, smoothstep(-0.60, 0.24, to_light.y));
	// Quantize the surface contribution before adding it to the painted material.
	float bands = dot(vec4(0.20, 0.25, 0.25, 0.30),
		step(vec4(0.10, 0.35, 0.58, 0.77), vec4(falloff)));
	// Keep a trace of bounce on the back wall, without a projected ring above the shelves.
	bands *= mix(0.16, 1.0, smoothstep(back_wall_z + 0.04, back_wall_z + 0.55, surface.z));
	if (raw_depth <= 0.00001 || bands <= 0.0) {
		discard;
	}
	ALBEDO = light_tint.rgb;
	ALPHA = bands * surface_strength;
}
