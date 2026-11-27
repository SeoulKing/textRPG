shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_test_disabled, depth_draw_never;

// Normal-edge response adapted from Leo Peltola's 3D Pixel art outline & highlight shader.
// https://godotshaders.com/shader/3d-pixel-art-outline-highlight-post-processing-shader/
uniform highp sampler2D normals_screen : hint_screen_texture, filter_nearest, repeat_disable;
uniform highp sampler2D cache_depth : hint_depth_texture, filter_nearest, repeat_disable;

const vec2 NEIGHBORS[4] = { vec2(0.0, -1.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(-1.0, 0.0) };
const int MIN_BYTE = 64;
const int DEPTH_RADIX = 192;
const float DEPTH_MAX = 36863.0;
const float WEIGHT_MAX = 191.0;

highp vec3 view_position(highp vec2 uv, highp float raw_depth, highp mat4 inv_projection) {
	highp vec3 ndc = vec3(uv * 2.0 - 1.0, mix(CLIP_SPACE_FAR, 1.0, raw_depth));
	highp vec4 position = inv_projection * vec4(ndc, 1.0);
	return position.xyz / position.w;
}

// Compatibility declares the screen sampler after helpers. Sample it inside fragment().
vec4 decode_normal(highp vec3 encoded) {
	ivec3 bytes = ivec3(round(encoded * 255.0));
	if (bytes.b != 255) {
		return vec4(0.0);
	}
	vec2 oct = vec2(bytes.rg - ivec2(MIN_BYTE)) * (2.0 / 63.0) - 1.0;
	vec3 normal = vec3(oct, 1.0 - abs(oct.x) - abs(oct.y));
	normal.xy -= clamp(-normal.z, 0.0, 1.0) * mix(vec2(-1.0), vec2(1.0), step(vec2(0.0), oct));
	return vec4(normalize(normal), 1.0);
}

float convex_joint_weight(vec3 center, vec3 neighbor, highp vec3 gap, highp float depth_slack) {
	// A convex seam puts each sample behind the other face's tangent plane.
	highp float plane_error = max(dot(center, gap), -dot(neighbor, gap));
	highp float slack = depth_slack + 0.06 * dot(abs(gap), vec3(1.0));
	return 1.0 - smoothstep(slack, 2.0 * slack, plane_error);
}

void vertex() {
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

void fragment() {
	highp float raw_depth = texture(cache_depth, SCREEN_UV).r;
	vec4 center = decode_normal(texture(normals_screen, SCREEN_UV).rgb);
	float normal_diff = 0.0;
	if (raw_depth > 0.0 && center.a > 0.5) {
		highp vec2 texel = 1.0 / VIEWPORT_SIZE.xy;
		bool orthographic = PROJECTION_MATRIX[3].w == 1.0;
		highp float depth_span = INV_PROJECTION_MATRIX[2].z * (1.0 - CLIP_SPACE_FAR);
		highp vec2 ortho_texel = 2.0 * texel * vec2(INV_PROJECTION_MATRIX[0].x, INV_PROJECTION_MATRIX[1].y);
		highp vec3 position = orthographic ? vec3(0.0) : view_position(SCREEN_UV, raw_depth, INV_PROJECTION_MATRIX);
		highp float depth_slack = max(0.0001, abs(depth_span) / 65535.0);
		for (int i = 0; i < 4; i++) {
			vec2 direction = NEIGHBORS[i];
			highp vec2 uv = SCREEN_UV + direction * texel;
			if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) {
				continue;
			}
			vec4 neighbor = decode_normal(texture(normals_screen, uv).rgb);
			if (neighbor.a < 0.5) {
				continue;
			}
			highp float neighbor_depth = texture(cache_depth, uv).r;
			highp vec3 gap = orthographic
				? vec3(direction * ortho_texel, (neighbor_depth - raw_depth) * depth_span)
				: view_position(uv, neighbor_depth, INV_PROJECTION_MATRIX) - position;
			float joint_weight = convex_joint_weight(center.xyz, neighbor.xyz, gap, depth_slack);
			float bias = smoothstep(-0.01, 0.01, dot(center.xyz - neighbor.xyz, vec3(1.0)));
			normal_diff += (1.0 - dot(center.xyz, neighbor.xyz)) * bias * joint_weight;
		}
	}
	// The brightening mask is independent from the base scene color.
	// Reserve mask zero for background and use only byte values 64 through 255.
	int weight = int(round(smoothstep(0.2, 0.8, normal_diff) * WEIGHT_MAX));
	int depth = weight > 0 ? int(round(raw_depth * DEPTH_MAX)) : 0;
	ivec3 bytes = ivec3(weight, depth / DEPTH_RADIX, depth % DEPTH_RADIX) + ivec3(MIN_BYTE);
	ALBEDO = vec3(bytes) / 255.0;
	// Screen/depth sampling reads the opaque pass. Overwrite it in the late pass,
	// including pixels where the old normal buffer contained background.
	ALPHA = 1.0;
}
