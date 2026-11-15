shader_type spatial;
render_mode ambient_light_disabled, specular_disabled, fog_disabled;

uniform vec4 surface_color : source_color = vec4(1.0);
uniform sampler2D surface_texture : source_color, filter_nearest, repeat_enable, hint_default_white;
uniform bool use_surface_texture = false;
uniform vec2 texture_scale = vec2(1.0);
uniform vec2 texture_offset = vec2(0.0);

uniform vec4 ambient_tint : source_color = vec4(0.92, 0.89, 0.92, 1.0);
uniform float ambient_level : hint_range(0.0, 1.0) = 0.90;
uniform vec3 band_thresholds = vec3(0.04, 0.37, 0.72);
uniform vec4 band_levels = vec4(0.0, 0.26, 0.60, 1.0);
uniform float sun_strength : hint_range(0.0, 2.0) = 0.91;
uniform float local_light_strength : hint_range(0.0, 1.0) = 0.54;

// R stores ambient visibility (1 = unoccluded), G stores an authored edge highlight mask.
uniform bool use_vertex_ao = false;
uniform bool use_floor_ao = false;
uniform sampler2D floor_ao_texture : filter_nearest, repeat_disable, hint_default_white;
uniform bool use_vertex_edges = false;
uniform float ao_strength : hint_range(0.0, 1.0) = 0.34;
uniform float edge_strength : hint_range(0.0, 1.0) = 0.08;
uniform int debug_mode : hint_enum("Beauty", "Albedo", "Direct", "Edges", "AO") = 0;

varying float authored_edge;
varying vec2 world_floor_position;

void vertex() {
	world_floor_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	vec3 base = surface_color.rgb;
	if (use_surface_texture) {
		base *= texture(surface_texture, UV * texture_scale + texture_offset).rgb;
	}

	float visibility = use_vertex_ao ? COLOR.r : 1.0;
	if (use_floor_ao) {
		vec2 floor_uv = (world_floor_position - vec2(5.0, 4.0)) / vec2(14.0, 9.0);
		// Blender data image rows start at the south edge in Godot texture coordinates.
		floor_uv.y = 1.0 - floor_uv.y;
		visibility *= texture(floor_ao_texture, floor_uv).r;
	}
	authored_edge = use_vertex_edges ? COLOR.g : 0.0;
	float ambient_visibility = mix(1.0, visibility, ao_strength);
	vec3 world_normal = normalize(mat3(INV_VIEW_MATRIX) * NORMAL);
	float up_facing = max(dot(world_normal, normalize(vec3(-0.45, 1.0, 0.35))), 0.0);
	float ambient_facing = mix(0.76, 1.02, up_facing);
	vec3 ambient = base * ambient_tint.rgb * ambient_level * ambient_visibility * ambient_facing;
	ALBEDO = base;
	EMISSION = ambient;
	SPECULAR = 0.0;

	if (debug_mode == 1) {
		EMISSION = base;
	} else if (debug_mode == 2) {
		ALBEDO = vec3(1.0);
		EMISSION = vec3(0.0);
	} else if (debug_mode == 3) {
		EMISSION = vec3(authored_edge);
	} else if (debug_mode == 4) {
		EMISSION = vec3(visibility);
	}
}

void light() {
	if (debug_mode == 0 || debug_mode == 2) {
		float incidence = max(dot(normalize(NORMAL), LIGHT), 0.0);
		float level = incidence * local_light_strength;
		if (LIGHT_IS_DIRECTIONAL) {
			vec3 band = step(band_thresholds, vec3(incidence));
			level = (band_levels.x + dot(band, band_levels.yzw - band_levels.xyz)) * sun_strength;
			if (debug_mode == 0) {
				level += authored_edge * edge_strength * smoothstep(band_thresholds.x, band_thresholds.z, incidence);
			}
		}
		// Keep real shadow and distance attenuation outside the toon ramp.
		vec3 direct = LIGHT_COLOR * (level * ATTENUATION / PI);
		DIFFUSE_LIGHT += debug_mode == 2 ? vec3(dot(direct, vec3(0.2126, 0.7152, 0.0722))) : direct;
	}
}