shader_type spatial;
render_mode unshaded, fog_disabled, cull_disabled, depth_test_disabled, depth_draw_never;

uniform sampler2D scene_color : hint_screen_texture, filter_nearest, repeat_disable;
uniform sampler2D scene_depth : hint_depth_texture, filter_nearest, repeat_disable;
uniform int screen_pixel_size : hint_range(1, 4) = 1;
uniform float highlight_strength : hint_range(0.0, 1.0) = 0.08;
uniform vec3 highlight_direction = vec3(-0.65, 0.72, 0.24);
uniform bool room_accents_enabled = true;
uniform vec4 room_bounds = vec4(5.0, 4.0, 14.0, 9.0);
uniform vec2 counter_center = vec2(12.0, 7.5);
uniform vec4 lamp_contact = vec4(0.0);
uniform vec4 crate_contact = vec4(0.0);
uniform vec2 shadow_direction = vec2(1.0, 0.0);
uniform bool cube_preview = false;
uniform int cube_outline_width : hint_range(0, 4) = 0;
uniform int cube_highlight_width : hint_range(0, 4) = 0;
uniform float cube_highlight_strength : hint_range(0.0, 1.0) = 0.0;
uniform vec4 cube_light_local = vec4(0.0);
uniform float cube_light_level = 0.0;
uniform mat4 world_to_cube;
uniform vec3 cube_outline_color : source_color = vec3(0.23, 0.16, 0.19);
uniform sampler2D asset_mask_texture : filter_nearest, repeat_disable;
uniform bool asset_mask_enabled = false;
uniform int asset_outline_width : hint_range(0, 4) = 1;
uniform int asset_outline_groups = 0;
uniform int asset_highlight_width : hint_range(0, 4) = 1;
uniform float asset_highlight_strength : hint_range(0.0, 1.0) = 0.75;

void vertex() {
	// Reverse Z puts the full-screen quad on the near plane.
	POSITION = vec4(VERTEX.xy, 1.0, 1.0);
}

float view_depth(sampler2D depth_map, vec2 uv, vec2 depth_transform) {
	return depth_transform.x + textureLod(depth_map, uv, 0.0).r * depth_transform.y;
}

float asset_group(float red) {
	return floor((round(red * 255.0) + 4.0) / 24.0);
}

bool on_cube(vec3 local) {
	return max(abs(local.x), abs(local.z)) < 0.51 && local.y > 0.003 && local.y < 1.01;
}

vec3 cube_sample(vec2 uv, float depth, mat4 projection_inverse, mat4 view_inverse) {
	vec2 plane = (projection_inverse * vec4(uv * 2.0 - 1.0, 0.0, 1.0)).xy;
	return (world_to_cube * view_inverse * vec4(plane, -depth, 1.0)).xyz;
}

vec3 cube_side_normal(vec3 side) {
	return abs(side.x) > abs(side.z) ? vec3(sign(side.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(side.z));
}

float cube_edge_light(vec3 point, vec3 normal, vec3 other_normal) {
	vec3 to_light = cube_light_local.xyz - point;
	float distance = length(to_light);
	float facing = max(dot(normal, to_light), dot(other_normal, to_light)) / max(distance, 0.001);
	float reach = 1.0 - smoothstep(cube_light_local.w * 0.45, cube_light_local.w, distance);
	return smoothstep(0.03, 0.32, facing) * reach * min(cube_light_level, 1.0);
}

float cube_top_edge_light(vec3 top, vec3 side) {
	if (!on_cube(side) || side.y >= 0.997) {
		return 0.0;
	}
	vec3 normal = cube_side_normal(side);
	return cube_edge_light(top, normal, normal);
}

float cube_vertical_edge_light(vec3 side, vec3 neighbor) {
	if (!on_cube(neighbor) || neighbor.y >= 0.997) {
		return 0.0;
	}
	vec3 other = cube_side_normal(neighbor);
	// The Z-facing side owns the seam, so its neighbor never draws a second line.
	if (other.x == 0.0) {
		return 0.0;
	}
	return cube_edge_light(side, cube_side_normal(side), other);
}

// The shop camera is orthographic, so each screen texel spans the same view-space distance.
// Use the nearer depth difference on each axis to avoid crossing a silhouette.
vec3 surface_normal(float center, vec4 neighbors, float pixel_width) {
	float right = neighbors.x - center;
	float left = center - neighbors.y;
	float up = neighbors.z - center;
	float down = center - neighbors.w;
	float dx = abs(right) < abs(left) ? right : left;
	float dy = abs(up) < abs(down) ? up : down;
	return normalize(vec3(dx, dy, pixel_width));
}

float highlight_edge(vec3 normal, vec3 neighbor, vec2 offset, vec3 direction) {
	float crease = smoothstep(0.12, 0.42, 1.0 - dot(normal, neighbor));
	float convex = smoothstep(0.02, 0.12, dot(neighbor.xy - normal.xy, offset));
	return crease * convex * smoothstep(0.03, 0.20, dot(normal - neighbor, direction));
}

float contact_patch(vec2 point, vec4 patch) {
	vec2 delta = abs(point - patch.xy) / max(patch.zw, vec2(0.001));
	float edge = length(delta);
	return (1.0 - step(1.0, edge)) * 0.07 + (1.0 - step(0.65, edge)) * 0.08;
}

vec3 room_accents(vec3 color, vec3 world) {
	vec2 room_uv = (world.xz - room_bounds.xy) / room_bounds.zw;
	vec2 near_counter = abs(world.xz - counter_center);
	float luminance = dot(color, vec3(0.299, 0.587, 0.114));
	float warm_material = smoothstep(0.05, 0.27, color.r - color.b);
	color = mix(color, vec3(luminance), warm_material * 0.19);
	float counter_top = (1.0 - step(2.06, near_counter.x)) * (1.0 - step(0.53, near_counter.y))
		* smoothstep(0.86, 1.03, world.y) * (1.0 - step(1.16, world.y));
	color = mix(color, mix(color, vec3(luminance), 0.23), counter_top);
	if (abs(world.y) < 0.032) {
		float contact = max(contact_patch(world.xz - shadow_direction * 0.19, lamp_contact),
			contact_patch(world.xz - shadow_direction * 0.32, crate_contact));
		vec2 counter_shadow = abs(world.xz - counter_center - shadow_direction * 0.34);
		float counter_contact = 0.17 * (1.0 - step(2.46, counter_shadow.x)) * (1.0 - step(0.67, counter_shadow.y));
		float shelf_width = step(0.14, room_uv.x) * (1.0 - step(0.86, room_uv.x));
		float shelf_contact = shelf_width * (0.05 * (1.0 - step(0.12, room_uv.y))
			+ 0.07 * (1.0 - step(0.098, room_uv.y)));
		float shade = max(max(contact, counter_contact), shelf_contact);
		color = mix(color, color * vec3(0.62, 0.79, 0.91), shade * 2.0);
	}
	return color;
}

void fragment() {
	float pixel_size = float(screen_pixel_size);
	vec2 uv = SCREEN_UV;
	if (screen_pixel_size > 1) {
		vec2 block = floor(uv * VIEWPORT_SIZE / pixel_size);
		vec2 sample_pixel = min((block + 0.5) * pixel_size, VIEWPORT_SIZE - 0.5);
		uv = sample_pixel / VIEWPORT_SIZE;
	}
	vec2 texel = pixel_size / VIEWPORT_SIZE;
	vec2 x = vec2(texel.x, 0.0);
	vec2 y = vec2(0.0, texel.y);
	// Convert raw depth to linear view depth with either renderer's clip range.
	vec2 linear_depth = -vec2(INV_PROJECTION_MATRIX[3].z
		+ INV_PROJECTION_MATRIX[2].z * CLIP_SPACE_FAR,
		INV_PROJECTION_MATRIX[2].z * (1.0 - CLIP_SPACE_FAR));
	float center = view_depth(scene_depth, uv, linear_depth);
	vec3 color = textureLod(scene_color, uv, 0.0).rgb;
	float highlight = 0.0;
	float cube_outline = 0.0;
	float cube_highlight = 0.0;
	float asset_outline = 0.0;
	float asset_highlight = 0.0;
	if (center < linear_depth.x - 0.001) {
		vec4 view_position = INV_PROJECTION_MATRIX * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
		vec3 world_position = (INV_VIEW_MATRIX * vec4(view_position.xy, -center, 1.0)).xyz;
		if (room_accents_enabled) {
			color = room_accents(color, world_position);
		}
		vec4 adjacent = vec4(view_depth(scene_depth, uv + x, linear_depth), view_depth(scene_depth, uv - x, linear_depth),
			view_depth(scene_depth, uv + y, linear_depth), view_depth(scene_depth, uv - y, linear_depth));
		vec4 delta = adjacent - center;
		float pixel_width = 2.0 * texel.y / abs(PROJECTION_MATRIX[1][1]);
		vec3 cube_position = vec3(0.0);
		bool cube_surface = false;
		if (cube_preview) {
			cube_position = (world_to_cube * vec4(world_position, 1.0)).xyz;
			cube_surface = on_cube(cube_position);
		}
		if (cube_surface) {
			// Keep the highlight on the top side of the seam to avoid a doubled line.
			if (cube_highlight_strength > 0.0 && cube_light_level > 0.0 && cube_light_local.y > 1.0 && cube_position.y > 0.997) {
				for (int i = 1; i <= cube_highlight_width; i++) {
					vec2 up = uv - y * float(i);
					vec2 down = uv + y * float(i);
					float up_depth = i == 1 ? adjacent.w : view_depth(scene_depth, up, linear_depth);
					float down_depth = i == 1 ? adjacent.z : view_depth(scene_depth, down, linear_depth);
					vec3 up_point = cube_sample(up, up_depth, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
					vec3 down_point = cube_sample(down, down_depth, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
					float lit_edge = max(cube_top_edge_light(cube_position, up_point), cube_top_edge_light(cube_position, down_point));
					if (lit_edge > 0.0) {
						cube_highlight = cube_highlight_strength * lit_edge;
						break;
					}
				}
			}
			if (cube_highlight_strength > 0.0 && cube_light_level > 0.0 && cube_position.y < 0.997 && cube_side_normal(cube_position).z != 0.0) {
				for (int i = 1; i <= cube_highlight_width; i++) {
					vec2 dx = x * float(i);
					float left_depth = i == 1 ? adjacent.y : view_depth(scene_depth, uv - dx, linear_depth);
					float right_depth = i == 1 ? adjacent.x : view_depth(scene_depth, uv + dx, linear_depth);
					vec3 left = cube_sample(uv - dx, left_depth, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
					vec3 right = cube_sample(uv + dx, right_depth, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX);
					float lit_edge = max(cube_vertical_edge_light(cube_position, left), cube_vertical_edge_light(cube_position, right));
					if (lit_edge > 0.0) {
						cube_highlight = cube_highlight_strength * lit_edge;
						break;
					}
				}
			}
			// Grow the silhouette inward by whole render texels, including at the foot.
			for (int i = 1; i <= cube_outline_width; i++) {
				vec2 dx = x * float(i);
				vec2 dy = y * float(i);
				vec4 depths = i == 1 ? adjacent : vec4(view_depth(scene_depth, uv + dx, linear_depth),
					view_depth(scene_depth, uv - dx, linear_depth), view_depth(scene_depth, uv + dy, linear_depth),
					view_depth(scene_depth, uv - dy, linear_depth));
				if (!on_cube(cube_sample(uv + dx, depths.x, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX))
					|| !on_cube(cube_sample(uv - dx, depths.y, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX))
					|| !on_cube(cube_sample(uv + dy, depths.z, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX))
					|| !on_cube(cube_sample(uv - dy, depths.w, INV_PROJECTION_MATRIX, INV_VIEW_MATRIX))) {
					cube_outline = 0.92;
					break;
				}
			}
		}
		float threshold = max(0.027, pixel_width * 2.45);
		float far_edge = max(max(delta.x, delta.y), max(delta.z, delta.w));
		float near_edge = -min(min(delta.x, delta.y), min(delta.z, delta.w));
		float inner_mask = 1.0 - smoothstep(threshold, threshold * 1.65, max(far_edge, near_edge));
		if (asset_mask_enabled && !cube_surface) {
			vec3 code = textureLod(asset_mask_texture, uv, 0.0).rgb;
			float group = asset_group(code.r);
			vec3 bytes = round(code * 255.0);
			float mask_depth = (bytes.g * 256.0 + bytes.b) / 65535.0;
			float raw_depth = (center - linear_depth.x) / linear_depth.y;
			if (group > 0.0 && abs(raw_depth - mask_depth) < 0.00035) {
				int outline_width = (asset_outline_groups & (1 << (int(group) - 1))) != 0 ? asset_outline_width : 0;
				int highlight_width = bytes.r - group * 24.0 >= 6.0 ? asset_highlight_width : 0;
				for (int i = 1; i <= max(outline_width, highlight_width); i++) {
					vec2 dx = x * float(i);
					vec2 dy = y * float(i);
					vec4 depths = i == 1 ? adjacent : vec4(view_depth(scene_depth, uv + dx, linear_depth),
						view_depth(scene_depth, uv - dx, linear_depth), view_depth(scene_depth, uv + dy, linear_depth),
						view_depth(scene_depth, uv - dy, linear_depth));
					// Scene depth only rejects hidden center pixels. Nearby depth changes
					// must not create false holes in a furniture silhouette as the camera pans.
					vec4 groups = vec4(asset_group(textureLod(asset_mask_texture, uv + dx, 0.0).r),
						asset_group(textureLod(asset_mask_texture, uv - dx, 0.0).r),
						asset_group(textureLod(asset_mask_texture, uv + dy, 0.0).r),
						asset_group(textureLod(asset_mask_texture, uv - dy, 0.0).r));
					vec4 border = step(vec4(0.5), abs(groups - group));
					// An adjoining asset behind this one doesn't also draw its touching edge.
					border *= max(1.0 - step(vec4(0.5), groups), step(vec4(-pixel_width * float(i)), depths - center));
					if (dot(border, vec4(1.0)) > 0.0) {
						// Skip faint depth transitions and let material contrast carry most seams.
						float separation = max(max(border.x * (depths.x - center), border.y * (depths.y - center)),
							max(border.z * (depths.z - center), border.w * (depths.w - center)));
						asset_outline = i <= outline_width ? 0.58 * smoothstep(pixel_width * 0.25, pixel_width * 2.0, separation) : 0.0;
						asset_highlight = i <= highlight_width ? asset_highlight_strength : 0.0;
						break;
					}
				}
			}
		}
		if (inner_mask > 0.0 && !cube_surface && !asset_mask_enabled) {
			vec3 normal = surface_normal(center, adjacent, pixel_width);
			vec3 direction = normalize(highlight_direction);
			float ur = view_depth(scene_depth, uv + x + y, linear_depth);
			float ul = view_depth(scene_depth, uv - x + y, linear_depth);
			float dr = view_depth(scene_depth, uv + x - y, linear_depth);
			float dl = view_depth(scene_depth, uv - x - y, linear_depth);
			vec3 right = surface_normal(adjacent.x, vec4(view_depth(scene_depth, uv + 2.0*x, linear_depth), center, ur, dr), pixel_width);
			vec3 left = surface_normal(adjacent.y, vec4(center, view_depth(scene_depth, uv - 2.0*x, linear_depth), ul, dl), pixel_width);
			vec3 up = surface_normal(adjacent.z, vec4(ur, ul, view_depth(scene_depth, uv + 2.0*y, linear_depth), center), pixel_width);
			vec3 down = surface_normal(adjacent.w, vec4(dr, dl, center, view_depth(scene_depth, uv - 2.0*y, linear_depth)), pixel_width);
			highlight = max(max(highlight_edge(normal, right, vec2(1.0, 0.0), direction),
				highlight_edge(normal, left, vec2(-1.0, 0.0), direction)),
				max(highlight_edge(normal, up, vec2(0.0, 1.0), direction),
				highlight_edge(normal, down, vec2(0.0, -1.0), direction))) * inner_mask;
			highlight *= smoothstep(0.24, 0.70, dot(color, vec3(0.299, 0.587, 0.114)));
		}
	}
	vec3 edged = mix(color, vec3(0.98, 0.94, 0.85),
		highlight * highlight_strength);
	edged = mix(edged, max(edged, vec3(1.0, 0.95, 0.81)), cube_highlight);
	edged = mix(edged, cube_outline_color, asset_outline * (1.0 - asset_highlight));
	edged = mix(edged, max(color, vec3(1.0, 0.91, 0.75)), asset_highlight);
	ALBEDO = mix(edged, cube_outline_color, cube_outline);
}
