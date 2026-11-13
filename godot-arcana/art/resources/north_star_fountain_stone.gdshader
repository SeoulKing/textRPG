shader_type spatial;
render_mode diffuse_burley;

uniform vec4 base_color : source_color = vec4(0.91, 0.81, 0.68, 1.0);

varying vec3 stone_position;

float cell_hash(vec3 cell) {
	vec3 p = fract(cell * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yzx + 33.33);
	return fract((p.x + p.y) * p.z);
}

float stone_noise(vec3 point) {
	vec3 cell = floor(point);
	vec3 f = fract(point);
	vec3 blend = f * f * (3.0 - 2.0 * f);
	float low = mix(
		mix(cell_hash(cell), cell_hash(cell + vec3(1.0, 0.0, 0.0)), blend.x),
		mix(cell_hash(cell + vec3(0.0, 1.0, 0.0)), cell_hash(cell + vec3(1.0, 1.0, 0.0)), blend.x),
		blend.y
	);
	float high = mix(
		mix(cell_hash(cell + vec3(0.0, 0.0, 1.0)), cell_hash(cell + vec3(1.0, 0.0, 1.0)), blend.x),
		mix(cell_hash(cell + vec3(0.0, 1.0, 1.0)), cell_hash(cell + vec3(1.0, 1.0, 1.0)), blend.x),
		blend.y
	);
	return mix(low, high, blend.z);
}

void vertex() {
	stone_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float mottling = stone_noise(stone_position * 5.7);
	float mineral = stone_noise(stone_position * 13.0 + vec3(13.1, 8.3, 7.9));
	float tool_marks = stone_noise(stone_position * vec3(31.0, 23.0, 31.0) + vec3(19.3));
	float pores = 1.0 - smoothstep(0.14, 0.35, stone_noise(stone_position * 71.0 + vec3(53.7)));

	vec3 view_dx = dFdx(VERTEX);
	vec3 view_dy = dFdy(VERTEX);
	float pixel_size = max(length(view_dx), length(view_dy));
	float grain_visibility = 1.0 - smoothstep(0.012, 0.044, pixel_size);
	float pore_visibility = 1.0 - smoothstep(0.004, 0.018, pixel_size);

	float tone = 1.0 + (mottling - 0.5) * 0.19 + (mineral - 0.5) * 0.10;
	ALBEDO = base_color.rgb * (tone - pores * 0.073 * pore_visibility);
	ROUGHNESS = 0.83 + (mineral - 0.5) * 0.11;
	SPECULAR = 0.27;

	// View-space surface gradients keep the relief continuous across each bevel
	// and let the finest pores fade before they alias at the plaza camera scale.
	float broad_height = 0.0042 * mineral;
	float grain_height = 0.0035 * tool_marks;
	float pore_height = -0.0022 * pores;
	float height_dx = dFdx(broad_height)
		+ grain_visibility * dFdx(grain_height) + pore_visibility * dFdx(pore_height);
	float height_dy = dFdy(broad_height)
		+ grain_visibility * dFdy(grain_height) + pore_visibility * dFdy(pore_height);
	vec3 normal = normalize(NORMAL);
	vec3 tangent_x = cross(view_dy, normal);
	vec3 tangent_y = cross(normal, view_dx);
	float determinant = dot(view_dx, tangent_x);
	vec3 slope = (height_dx * tangent_x + height_dy * tangent_y)
		* sign(determinant) / max(abs(determinant), 0.0000001);
	NORMAL = normalize(normal - clamp(slope, vec3(-0.38), vec3(0.38)));
}
