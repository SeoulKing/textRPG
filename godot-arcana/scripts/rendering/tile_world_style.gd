extends RefCounted
## The production tile display established by the inn.

const CAMERA_ROTATION_DEGREES := Vector3(-30.0, 45.0, 0.0)
const DOTS_PER_TILE := 32.0
const REFERENCE_PIXEL_SIZE := 2


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
