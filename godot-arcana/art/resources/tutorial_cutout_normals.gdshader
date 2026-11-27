shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;

#include "res://art/resources/tutorial_normal_pack.gdshaderinc"

uniform sampler2D coverage_mask : filter_nearest, repeat_disable;
uniform bool use_floor_mask = false;
uniform vec2 floor_origin;
uniform vec2 floor_size = vec2(1.0);
varying vec2 floor_world;
varying vec3 view_normal;

void vertex() {
	floor_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	view_normal = MODELVIEW_NORMAL_MATRIX * NORMAL;
}

void fragment() {
	if (use_floor_mask) {
		// Oak planks discard cells using a world-space floor occupancy texture.
		vec2 cell_uv = (floor_world - floor_origin) / floor_size;
		if (!FRONT_FACING || texture(coverage_mask, cell_uv).r < 0.5) {
			discard;
		}
	} else if (texture(coverage_mask, UV).a < 0.5) {
		// Counter and wall art use two-sided, alpha-cut planes.
		discard;
	}
	ALBEDO = pack_edge_normal(FRONT_FACING ? view_normal : -view_normal);
}
