extends RefCounted
## The fitted furniture scene is the placement source for both display and movement.

const TileUnits = preload("res://scripts/inn_tile_layout.gd")
const Furniture = preload("res://scenes/restaurant_furniture.tscn")
const LOGICAL_ORIGIN := Vector2(50.0, 80.0)
const LOGICAL_PER_TILE := TileUnits.LOGICAL_PER_TILE
const FLOOR_SIZE := Vector2(14.0, 12.0)
const WALK_BOUNDS := Rect2(LOGICAL_ORIGIN, FLOOR_SIZE * LOGICAL_PER_TILE)
const LAYOUT_ID := "restaurant_tiles_v1"


static func footprint(fixture: Node3D) -> Rect2:
	var size := Vector2(fixture.get_meta("tile_footprint", Vector2i.ZERO))
	return Rect2(Vector2(fixture.position.x, fixture.position.z) - size * 0.5, size)


static func apply(layout: Dictionary) -> Dictionary:
	if not layout.valid:
		return layout
	var fixtures := Furniture.instantiate()
	var occupied: Array[Rect2] = []
	var floor_bounds := Rect2(Vector2.ZERO, FLOOR_SIZE)
	for child in fixtures.get_children():
		if not child is Node3D or not child.has_meta("tile_footprint"):
			continue
		var slot := footprint(child)
		if not slot.has_area() or not slot.position.is_equal_approx(slot.position.round()) \
				or not floor_bounds.encloses(slot):
			layout.errors.append(str(child.name) + ": restaurant footprint must cover whole floor cells.")
			continue
		for previous in occupied:
			if previous.intersects(slot):
				layout.errors.append(str(child.name) + ": restaurant footprint overlaps another fixture.")
		occupied.append(slot)
		layout.rectangles.append(Rect2(LOGICAL_ORIGIN + slot.position * LOGICAL_PER_TILE,
			slot.size * LOGICAL_PER_TILE))
	fixtures.free()
	layout.valid = layout.errors.is_empty()
	return layout
