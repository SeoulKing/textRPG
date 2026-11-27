extends RefCounted
## The production tile display established by the inn.

const HeroSpec := preload("res://art/resources/heroine_reference_spec.gd")
# The inn displays each captured source pixel at 0.8 of its modelling size.
const AVATAR_PIXEL_SIZE := 0.8 / HeroSpec.PIXELS_PER_UNIT
const AVATAR_UPRIGHT_SCALE := 1.4142135
const AVATAR_HEIGHT := HeroSpec.SOURCE_HEIGHT * AVATAR_PIXEL_SIZE * AVATAR_UPRIGHT_SCALE
const CAMERA_ROTATION_DEGREES := Vector3(-30.0, 45.0, 0.0)
const DOTS_PER_TILE := 32.0
const REFERENCE_PIXEL_SIZE := 2
const HIGHLIGHT_STRENGTH := 0.14
const ACTOR_SHADER := preload("res://art/resources/shop_hero_outline.gdshader")


static func apply_avatar_size(sprite: Sprite3D) -> void:
	sprite.pixel_size = AVATAR_PIXEL_SIZE
	sprite.scale = Vector3(1.0, AVATAR_UPRIGHT_SCALE, 1.0)


static func actor_material(texture: Texture2D, draw_ink: bool) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = ACTOR_SHADER
	material.set_shader_parameter("avatar_texture", texture)
	material.set_shader_parameter("highlight_strength", HIGHLIGHT_STRENGTH)
	material.set_shader_parameter("draw_outer_ink", draw_ink)
	return material


static func presentation_scale(zoom_ratio: float) -> int:
	return maxi(1, roundi(REFERENCE_PIXEL_SIZE * zoom_ratio))


static func world_texel_size(zoom_ratio: float) -> float:
	# Keep the continuous framing when the nearest-neighbor enlargement changes steps.
	var displayed_tile_size := DOTS_PER_TILE * REFERENCE_PIXEL_SIZE * zoom_ratio
	return presentation_scale(zoom_ratio) / displayed_tile_size


static func projected_bounds(camera_basis: Basis, bounds: AABB) -> Rect2:
	var first := bounds.position
	var projected := Rect2(Vector2(first.dot(camera_basis.x), first.dot(camera_basis.y)), Vector2.ZERO)
	for corner in range(1, 8):
		var point := bounds.get_endpoint(corner)
		projected = projected.expand(Vector2(point.dot(camera_basis.x), point.dot(camera_basis.y)))
	return projected


static func clamp_focus(camera_basis: Basis, point: Vector3, bounds: Rect2, coverage: Vector2) -> Vector3:
	var projected := Vector2(point.dot(camera_basis.x), point.dot(camera_basis.y))
	var margin := (bounds.size - coverage).max(Vector2.ZERO) * 0.5
	var kept := projected.clamp(bounds.get_center() - margin, bounds.get_center() + margin)
	return camera_basis.x * kept.x + camera_basis.y * kept.y + camera_basis.z * point.dot(camera_basis.z)
