extends RefCounted
## The Blender floor plan uses X and Z in tiles. The simulation uses 16 logical pixels per tile.
const Coordinates = preload("res://scripts/native_2d_coordinates.gd")
const FLOOR_SIZE := Vector2(25, 21)
const WALK_BOUNDS := Rect2(Vector2.ZERO, FLOOR_SIZE * Coordinates.LOGICAL_UNIT)

const WALLS := [
	Rect2(0, 0, 25, 1),
	Rect2(0, 1, 1, 20),
	Rect2(24, 1, 1, 20),
	Rect2(1, 20, 10, 1),
	Rect2(14, 20, 10, 1),
	# Keep the library, practice room and classroom door gaps clear.
	Rect2(7, 1, 1, 6),
	Rect2(7, 9, 1, 4),
	Rect2(1, 12, 6, 1),
	Rect2(17, 1, 1, 4),
	Rect2(17, 7, 1, 6),
	Rect2(17, 15, 1, 3),
	Rect2(18, 9, 6, 1),
	Rect2(18, 17, 6, 1),
]


static func collect() -> Dictionary:
	var rectangles: Array[Rect2] = []
	for wall: Rect2 in WALLS:
		_add(rectangles, wall)
	# The route to level two starts in front of the stone stair, between its piers.
	_add(rectangles, Rect2(9.93, 1, 5.14, 4.12))
	_box(rectangles, Vector2(10.2, 5.02), Vector2(0.54, 0.54))
	_box(rectangles, Vector2(14.8, 5.02), Vector2(0.54, 0.54))
	# Preserve the space around the round central plinth with overlapping footprints.
	var plinth := Vector2(12.5, 10.25)
	_box(rectangles, plinth, Vector2(3, 1.5))
	_box(rectangles, plinth, Vector2(2.6, 2.5))
	_box(rectangles, plinth, Vector2(1.7, 3))
	_furniture(rectangles)

	var entities: Array[Dictionary] = [
		_entity("exit", "밖으로 나가기", "exit", Vector2(12.5, 20.5)),
		_entity("courtyard", "학교 앞뜰", "academy_room", Vector2(12.5, 18.35)),
		_entity("hall", "중앙 회랑", "academy_room", Vector2(12.5, 13.4)),
		_entity("library", "도서관", "academy_room", Vector2(6.1, 8), 14.0),
		_entity("classroom", "기초 강의실", "academy_room", Vector2(18.55, 14), 14.0),
		_entity("practice", "수정 실습실", "academy_room", Vector2(18.9, 6), 14.0),
		_entity("academy_stairs", "2층으로 올라가기", "academy_stairs", Vector2(12.5, 5.55), 14.0),
	]
	return {
		"valid": true,
		"errors": [],
		"rectangles": rectangles,
		"entities": entities,
		"markers": {
			"Arrival": Vector2(12.5, 19.1) * Coordinates.LOGICAL_UNIT,
			"StairArrival": Vector2(12.5, 6.5) * Coordinates.LOGICAL_UNIT,
		},
	}


static func _furniture(rectangles: Array[Rect2]) -> void:
	# Corridor access between the library tables stays open.
	for depth: float in [4.64, 7.13, 9.62]:
		_box(rectangles, Vector2(1.64, depth), Vector2(0.72, 2.27))
	for depth: float in [5.5, 9.95]:
		_box(rectangles, Vector2(3.95, depth), Vector2(2.6, 1.18))
		for chair_x: float in [3.38, 4.52]:
			for offset: float in [-0.88, 0.88]:
				_box(rectangles, Vector2(chair_x, depth + offset), Vector2(0.55, 0.57))

	# Entrance reception and waiting benches.
	_box(rectangles, Vector2(4, 15.8), Vector2(3.3, 1.16))
	_box(rectangles, Vector2(2, 16.29), Vector2(0.51, 0.51))
	_box(rectangles, Vector2(3.67, 18.82), Vector2(2.64, 0.76))
	_box(rectangles, Vector2(21.42, 19.02), Vector2(2.64, 0.76))

	# Practice furniture and the lecture aisle.
	_box(rectangles, Vector2(21.05, 3.5), Vector2(3.32, 1.2))
	_box(rectangles, Vector2(23.48, 6.02), Vector2(0.8, 2.85))
	_box(rectangles, Vector2(21.15, 10.38), Vector2(3.74, 0.43))
	_box(rectangles, Vector2(21.12, 11.34), Vector2(1.66, 0.69))
	for desk_x: float in [19.77, 22.19]:
		for depth: float in [12.62, 14.46]:
			_box(rectangles, Vector2(desk_x, depth), Vector2(1.27, 0.68))
			_box(rectangles, Vector2(desk_x, depth + 0.57), Vector2(0.48, 0.44))


static func _entity(id: String, title: String, kind: String, tile: Vector2, radius: float = 34.0) -> Dictionary:
	return {"id": id, "name": title, "kind": kind, "pos": tile * Coordinates.LOGICAL_UNIT,
		"interaction_radius": radius}


static func _box(rectangles: Array[Rect2], center: Vector2, size: Vector2) -> void:
	_add(rectangles, Rect2(center - size * 0.5, size))


static func _add(rectangles: Array[Rect2], tile_rect: Rect2) -> void:
	rectangles.append(Rect2(tile_rect.position * Coordinates.LOGICAL_UNIT,
		tile_rect.size * Coordinates.LOGICAL_UNIT))
