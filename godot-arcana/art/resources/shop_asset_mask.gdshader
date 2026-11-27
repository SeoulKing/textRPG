shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;

uniform float asset_id;
uniform bool alpha_cutout = false;
uniform float alpha_threshold = 0.5;
uniform sampler2D cutout_texture : filter_nearest, repeat_disable;
uniform vec4 light_world = vec4(0.0);
uniform vec3 highlight_direction_world = vec3(0.0);
varying vec3 world_position;
varying vec3 world_normal;

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = MODEL_NORMAL_MATRIX * NORMAL;
}

void fragment() {
	if (alpha_cutout && texture(cutout_texture, UV).a < alpha_threshold) {
		discard;
	}
	// Use the mesh normal so the lit region does not shift between screen samples.
	vec3 to_light = light_world.xyz - world_position;
	float distance = length(to_light);
	vec3 normal = normalize(world_normal);
	bool lit_by_point = distance < light_world.w && dot(normal, to_light / max(distance, 0.001)) > 0.45;
	bool lit_by_direction = dot(normal, highlight_direction_world) > 0.45;
	float lit = (lit_by_point || lit_by_direction) ? 12.0 : 0.0;
	// R holds the asset ID and lit flag. G and B hold 16 bits of reverse-Z depth.
	float depth = round(FRAGCOORD.z * 65535.0);
	ALBEDO = vec3(asset_id * 24.0 + lit, floor(depth / 256.0), mod(depth, 256.0)) / 255.0;
}
