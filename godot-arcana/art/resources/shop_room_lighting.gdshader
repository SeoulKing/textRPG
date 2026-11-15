shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

uniform vec4 paint : source_color = vec4(1.0);
uniform sampler2D paint_texture : source_color, filter_nearest, repeat_enable;
uniform bool use_texture = false;
uniform bool use_vertex_color = false;
uniform bool cull_back_faces = true;
uniform bool stepped_light = true;
uniform vec2 uv_scale = vec2(1.0);
uniform vec2 uv_offset = vec2(0.0);

void fragment() {
	if (cull_back_faces && !FRONT_FACING) {
		discard;
	}
	vec3 color = use_texture ? texture(paint_texture, UV * uv_scale + uv_offset).rgb * paint.rgb : paint.rgb;
	ALBEDO = use_vertex_color ? color * COLOR.rgb : color;
}

void light() {
	float illumination = clamp(max(dot(NORMAL, LIGHT), 0.0) * ATTENUATION, 0.0, 1.0);
	// Preserve the shadow floor and give the three lit steps room to read.
	float band = dot(step(vec3(0.12, 0.32, 0.57), vec3(illumination)), vec3(0.19, 0.24, 0.35));
	DIFFUSE_LIGHT += (stepped_light ? band : illumination) * LIGHT_COLOR / PI;
}
