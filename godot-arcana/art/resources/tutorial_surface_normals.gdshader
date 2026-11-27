shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled;

#include "res://art/resources/tutorial_normal_pack.gdshaderinc"

// Match BaseMaterial3D culling. -1 discards unsupported surface slots.
uniform int cull_mode = 0;

varying vec3 view_normal;

void vertex() {
	view_normal = MODELVIEW_NORMAL_MATRIX * NORMAL;
}

void fragment() {
	if (cull_mode < 0 || (cull_mode == 0 && !FRONT_FACING) || (cull_mode == 1 && FRONT_FACING)) {
		discard;
	}
	ALBEDO = pack_edge_normal(FRONT_FACING ? view_normal : -view_normal);
}
