extends RefCounted
## The horizontal world and save coordinates stay unchanged across terrace elevations.
const PATH := "res://data/plaza-terraces.json"
const EDGE_WIDTH := 0.14
static var terraces: Array = []
static var stairs: Array = []
static var water: Array[Rect2] = []
static var blockers: Array[Rect2] = []
static var river_bounds: Rect2
static var water_height: float
static var bridge_edge: float
static var bridge_rise: float
static var bridge: Rect2
static var fishing_access: Vector2

static func _static_init() -> void:
	var layout: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	terraces = layout.terraces
	stairs = layout.stairs
	bridge = _rect(layout.bridge.rect)
	bridge_edge = float(layout.bridge.edgeHeight) + float(layout.bridge.pavingThickness)
	bridge_rise = layout.bridge.rise
	water_height = layout.river.height
	fishing_access = Vector2(layout.fishingAccess[0], layout.fishingAccess[1])
	for group: String in ["buildings", "stalls", "obstacles"]:
		for item: Dictionary in layout[group]:
			blockers.append(_rect(item.rect))
	for span: Array in layout.river.spans:
		var river := _rect([span[0], span[2], span[1], span[3]])
		river_bounds = river if water.is_empty() else river_bounds.merge(river)
		water.append(river)
		var crossing := river.intersection(bridge)
		if not crossing.has_area():
			blockers.append(river)
		else:
			# Subtract the bridge deck from the water collision.
			_add_box(river.position, Vector2(crossing.position.x, river.end.y))
			_add_box(Vector2(crossing.end.x, river.position.y), river.end)
			_add_box(Vector2(crossing.position.x, river.position.y), Vector2(crossing.end.x, crossing.position.y))
			_add_box(Vector2(crossing.position.x, crossing.end.y), Vector2(crossing.end.x, river.end.y))
	# The two parapets continue onto the banks. Leave both street approaches open.
	_add_box(bridge.position - Vector2(0.34, 0.0), Vector2(bridge.position.x, bridge.end.y))
	_add_box(Vector2(bridge.end.x, bridge.position.y), bridge.end + Vector2(0.34, 0.0))
	for terrace: Dictionary in terraces:
		var r := _rect(terrace.rect)
		_add_side(r.position.x, r.position.y, r.end.y)
		_add_side(r.end.x, r.position.y, r.end.y)
		_add_lip(r.position.y, r.position.x, r.end.x)
		_add_lip(r.end.y, r.position.x, r.end.x)
	for stair: Dictionary in stairs:
		var r := _rect(stair.rect)
		_add_side(r.position.x, r.position.y, r.end.y)
		_add_side(r.end.x, r.position.y, r.end.y)

static func _rect(values: Array) -> Rect2:
	return Rect2(Vector2(values[0], values[1]), Vector2(values[2] - values[0], values[3] - values[1]))

static func _add_box(start: Vector2, end: Vector2) -> void:
	var box := Rect2(start, end - start)
	if box.has_area() and not blockers.has(box):
		blockers.append(box)

static func _add_side(x: float, start: float, end: float) -> void:
	_add_box(Vector2(x - EDGE_WIDTH * 0.5, start), Vector2(x + EDGE_WIDTH * 0.5, end))

static func _add_lip(z: float, start: float, end: float) -> void:
	var openings: Array[Vector2] = []
	for stair: Dictionary in stairs:
		var r := _rect(stair.rect)
		if is_equal_approx(r.position.y, z) or is_equal_approx(r.end.y, z):
			openings.append(Vector2(r.position.x, r.end.x))
	openings.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.x < b.x)
	var cursor := start
	for opening: Vector2 in openings:
		if opening.y <= start or opening.x >= end: continue
		_add_box(Vector2(cursor, z - EDGE_WIDTH * 0.5), Vector2(opening.x, z + EDGE_WIDTH * 0.5))
		cursor = maxf(cursor, opening.y)
	_add_box(Vector2(cursor, z - EDGE_WIDTH * 0.5), Vector2(end, z + EDGE_WIDTH * 0.5))

static func _deck_height(z: float) -> float:
	var t := clampf(1.0 - absf(z - bridge.get_center().y) / (bridge.size.y * 0.5), 0.0, 1.0)
	return bridge_edge + bridge_rise * sin(t * PI * 0.5)

static func ground_height(point: Vector2) -> float:
	if bridge.has_point(point): return _deck_height(point.y)
	if wet(point): return water_height
	for stair: Dictionary in stairs:
		var r := _rect(stair.rect)
		if r.has_point(point):
			return lerpf(stair.high, stair.low, (point.y - r.position.y) / r.size.y)
	for terrace: Dictionary in terraces:
		if _rect(terrace.rect).has_point(point):
			return terrace.height
	return 0.0

static func wet(point: Vector2) -> bool:
	if not river_bounds.has_point(point) or bridge.has_point(point): return false
	for section: Rect2 in water:
		if section.has_point(point): return true
	return false

static func pick(ray: Vector3, direction: Vector3) -> Vector3:
	var base := -ray.y / direction.y
	var base_hit := ray + direction * base
	var nearest := base if is_zero_approx(ground_height(Vector2(base_hit.x, base_hit.z))) else INF
	var water_t := (water_height - ray.y) / direction.y
	var water_hit := ray + direction * water_t
	if water_t >= 0.0 and water_t < nearest and wet(Vector2(water_hit.x, water_hit.z)):
		nearest = water_t
	# The shallow arched deck converges to subpixel accuracy in three projections.
	var deck_t := (bridge_edge - ray.y) / direction.y
	for refinement in 3:
		deck_t = (_deck_height(ray.z + direction.z * deck_t) - ray.y) / direction.y
	var deck_hit := ray + direction * deck_t
	if deck_t >= 0.0 and deck_t < nearest and bridge.has_point(Vector2(deck_hit.x, deck_hit.z)):
		nearest = deck_t
	for terrace: Dictionary in terraces:
		var t := (float(terrace.height) - ray.y) / direction.y
		var hit := ray + direction * t
		var xz := Vector2(hit.x, hit.z)
		if t >= 0.0 and t < nearest and _rect(terrace.rect).has_point(xz) and is_equal_approx(ground_height(xz), hit.y):
			nearest = t
	for stair: Dictionary in stairs:
		var r := _rect(stair.rect)
		var gradient := (float(stair.low) - float(stair.high)) / r.size.y
		var divisor := direction.y - gradient * direction.z
		if is_zero_approx(divisor): continue
		var t := (float(stair.high) + gradient * (ray.z - r.position.y) - ray.y) / divisor
		var hit := ray + direction * t
		if t >= 0.0 and t < nearest and r.has_point(Vector2(hit.x, hit.z)):
			nearest = t
	return ray + direction * nearest if is_finite(nearest) else base_hit
