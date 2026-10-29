class_name Arcana2DCoordinates
extends RefCounted
## Logical gameplay pixels remain stable across all native 2D scenes.
const LOGICAL_UNIT = 16.0
const SOURCE_UNIT = 64.0
const SOURCE_PER_LOGICAL = SOURCE_UNIT / LOGICAL_UNIT
static func canvas(point: Vector2, height: float = 0.0) -> Vector2:
	return point * SOURCE_PER_LOGICAL - Vector2(0, height * SOURCE_UNIT)
static func logical(point: Vector2) -> Vector2:
	return point / SOURCE_PER_LOGICAL
static func screen_snap(point: Vector2, transform: Transform2D) -> Vector2:
	return transform.affine_inverse() * (transform * point).round()
