shader_type spatial;
render_mode cull_back, diffuse_lambert;

// The converter specializes the culling and sampler hints to match the source.
uniform vec4 surface_color : source_color = vec4(1.0);
uniform sampler2D surface_texture : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_surface_texture = false;
uniform bool use_vertex_color = false;
uniform bool vertex_color_is_srgb = false;
uniform vec2 uv1_scale = vec2(1.0);
uniform vec2 uv1_offset = vec2(0.0);
uniform vec2 uv2_scale = vec2(1.0);
uniform vec2 uv2_offset = vec2(0.0);

uniform float surface_roughness : hint_range(0.0, 1.0) = 0.5;
uniform sampler2D roughness_texture : filter_linear_mipmap, repeat_enable;
uniform bool use_roughness_texture = false;
uniform vec4 roughness_channel = vec4(1.0, 0.0, 0.0, 0.0);
uniform float surface_metallic : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D metallic_texture : filter_linear_mipmap, repeat_enable;
uniform bool use_metallic_texture = false;
uniform vec4 metallic_channel = vec4(1.0, 0.0, 0.0, 0.0);
uniform float surface_specular : hint_range(0.0, 1.0) = 0.5;
uniform bool use_specular = true;

uniform bool emission_enabled = false;
uniform vec4 emission_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float emission_energy = 1.0;
uniform sampler2D emission_texture : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_emission_texture = false;
uniform bool emission_multiply = false;
uniform bool emission_on_uv2 = false;

uniform bool stepped_light = true;
uniform bool orthographic_view = false;
uniform float specular_nonmetal : hint_range(0.0, 1.0) = 0.2;
uniform float specular_metal : hint_range(0.0, 1.0) = 1.0;
uniform float specular_cutoff : hint_range(0.35, 0.98) = 0.791;
uniform vec3 band_thresholds = vec3(0.12, 0.32, 0.57);
uniform vec3 band_increments = vec3(0.19, 0.24, 0.35);

void vertex() {
	// Match BaseMaterial3D's vertex-color conversion in linear renderers.
	if (use_vertex_color && vertex_color_is_srgb && !OUTPUT_IS_SRGB) {
		COLOR.rgb = mix(pow((COLOR.rgb + vec3(0.055)) / 1.055, vec3(2.4)),
			COLOR.rgb / 12.92, lessThan(COLOR.rgb, vec3(0.04045)));
	}
}

void fragment() {
	vec2 base_uv = UV * uv1_scale + uv1_offset;
	vec3 color = surface_color.rgb;
	if (use_surface_texture) {
		color *= texture(surface_texture, base_uv).rgb;
	}
	if (use_vertex_color) {
		color *= COLOR.rgb;
	}
	ALBEDO = color;
	// Opaque surfaces deliberately never write ALPHA.
	ROUGHNESS = surface_roughness;
	if (use_roughness_texture) {
		ROUGHNESS *= dot(texture(roughness_texture, base_uv), roughness_channel);
	}
	METALLIC = surface_metallic;
	if (use_metallic_texture) {
		METALLIC *= dot(texture(metallic_texture, base_uv), metallic_channel);
	}
	SPECULAR = use_specular ? surface_specular : 0.0;
	if (emission_enabled) {
		vec3 emitted = emission_color.rgb;
		if (use_emission_texture) {
			vec2 emission_uv = emission_on_uv2 ? UV2 * uv2_scale + uv2_offset : base_uv;
			vec3 texel = texture(emission_texture, emission_uv).rgb;
			emitted = emission_multiply ? emitted * texel : emitted + texel;
		}
		EMISSION = emitted * emission_energy;
	}
}

void light() {
	float ndotl = max(dot(NORMAL, LIGHT), 0.0);
	float illumination = clamp(ndotl * ATTENUATION, 0.0, 1.0);
	// Quantize irradiance before albedo, so adjacent plank colors share bands.
	float band = dot(step(band_thresholds, vec3(illumination)), band_increments);
	DIFFUSE_LIGHT += (stepped_light ? band : illumination) * LIGHT_COLOR / PI;
	if (use_specular && ndotl > 0.0) {
		// Orthographic viewing rays stay parallel when the camera is translated.
		vec3 view_ray = orthographic_view ? vec3(0.0, 0.0, 1.0) : VIEW;
		vec3 half_direction = normalize(LIGHT + view_ray);
		float exponent = mix(128.0, 4.0, ROUGHNESS * ROUGHNESS);
		float highlight = pow(max(dot(NORMAL, half_direction), 0.0), exponent);
		// Keep glossy materials readable without introducing soft band edges.
		highlight = stepped_light ? step(specular_cutoff, highlight) * 0.25 : highlight * 0.25;
		vec3 tint = mix(vec3(surface_specular) * specular_nonmetal, ALBEDO * specular_metal, METALLIC);
		SPECULAR_LIGHT += tint * highlight * ATTENUATION * LIGHT_COLOR * SPECULAR_AMOUNT;
	}
}
