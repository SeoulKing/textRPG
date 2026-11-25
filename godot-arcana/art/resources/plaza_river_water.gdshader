shader_type spatial;
render_mode diffuse_lambert;

uniform sampler2D water_base : filter_nearest, repeat_enable;
uniform sampler2D highlights : filter_nearest, repeat_disable;
uniform bool animate_ripples = true;

uniform vec4 shallows : source_color = vec4(0.35, 0.54, 0.50, 1.0);
uniform vec4 run : source_color = vec4(0.22, 0.47, 0.48, 1.0);
uniform vec4 channel : source_color = vec4(0.15, 0.38, 0.43, 1.0);
uniform vec4 sky_reflection : source_color = vec4(0.59, 0.78, 0.73, 1.0);

varying vec2 river_position;

void vertex() {
	river_position = VERTEX.xz;
}

// A fixed change in depth along the bed, independent of the animated glints.
float bend(float along) {
	float cell = floor(along);
	vec2 pair = fract((vec2(cell, cell + 1.0) + 13.19) * 0.3183099);
	pair = fract(pair * pair * (pair * 19.19 + 3.17));
	return mix(pair.x, pair.y, smoothstep(0.0, 1.0, fract(along)));
}

float painted_glint(vec2 cell, vec2 patch) {
	vec4 ink = texture(highlights, (cell + patch) * 0.25);
	return ink.a * smoothstep(0.70, 0.91, ink.g);
}

void fragment() {
	vec2 patch = fract(river_position / 7.0 + vec2(0.5));
	float wash = clamp((texture(water_base, patch).g - 0.49) / 0.24, 0.0, 1.0);
	float thalweg = mix(0.37, 0.63, bend(river_position.x * 0.125));
	float across = clamp(UV.x, 0.0, 1.0);
	float depth = min(across / thalweg, (1.0 - across) / (1.0 - thalweg));
	float shelf = bend(river_position.x * 0.58 + across * 2.5);
	depth += (shelf - 0.5) * 0.095 + (wash - 0.5) * 0.03;
	depth = mix(depth, floor(depth * 11.0 + 0.5) / 11.0, 0.27);
	vec3 water = mix(shallows.rgb, run.rgb, smoothstep(0.08, 0.48, depth));
	water = mix(water, channel.rgb, smoothstep(0.35, 0.89, depth));
	water *= 0.96 + 0.08 * wash;

	float frame = animate_ripples ? mod(floor(TIME * 8.0), 16.0) : 0.0;
	vec2 cell = vec2(mod(frame, 4.0), floor(frame * 0.25));
	// Retain small groups of painted crests, stretched a few texels along the flow.
	vec2 brush_step = vec2(1.5, -1.5) / 448.0;
	float glint = max(painted_glint(cell, patch), 0.85 * painted_glint(cell, fract(patch - brush_step)));
	glint = max(glint, 0.65 * painted_glint(cell, fract(patch - 2.0 * brush_step)));
	float reach = bend(river_position.x * 0.78 + river_position.y * 0.72);
	glint *= smoothstep(0.45, 0.74, reach);
	water = mix(water, sky_reflection.rgb, glint * 0.52);
	ALBEDO = water;
	ROUGHNESS = 0.82;
	SPECULAR = 0.13;
}
