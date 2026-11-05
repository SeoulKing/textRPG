@tool
extends RefCounted
## Geometric shadow proxy for the approved 296x359 fountain (foot 148,268).
## x/depth are ground pixels; h is projected vertical height, not image row.
const BASIN_DEPTH_RATIO = 0.598262471859

static func build(up: Vector2) -> Dictionary:
	var polygons: Array[PackedVector2Array] = []
	# Low broad basin, pedestal, column and upper bowl. Keep the footprint
	# instead of treating the back rim as a tall vertical sheet.
	_cylinder(polygons, up, 142.0, 142.0 * BASIN_DEPTH_RATIO, 0.0, 23.0)
	_cylinder(polygons, up, 37.0, 24.0, 23.0, 39.0)
	_cylinder(polygons, up, 22.0, 16.0, 39.0, 91.0)
	_cylinder(polygons, up, 65.0, 39.0, 91.0, 111.0)
	# Solid celestial globe and open metal rings; flowing water is not opaque stone.
	var globe: PackedVector2Array = []
	for latitude in range(17):
		var angle := PI * float(latitude) / 16.0
		var radius := sin(angle) * 30.0
		for longitude in range(32):
			var a := TAU * float(longitude) / 32.0
			globe.append(_project(Vector3(cos(a) * radius, sin(a) * radius, 175.0 + cos(angle) * 30.0), up))
	polygons.append(Geometry2D.convex_hull(globe))
	_ring(polygons, up, Vector3(67, 0, 0), Vector3(0, 0, 67), 175.0, 2.0)
	_ring(polygons, up, Vector3(0, 67, 0), Vector3(0, 0, 67), 175.0, 2.0)
	_ring(polygons, up, Vector3(67, 0, 0), Vector3(0, 54, 39), 175.0, 2.0)
	_cylinder(polygons, up, 3.0, 2.0, 242.0, 259.0)
	var bounds := Rect2(Vector2.ZERO, Vector2.ZERO)
	for polygon in polygons:
		for point in polygon:
			bounds = bounds.expand(point)
	var origin := bounds.position.floor() - Vector2.ONE
	var size := Vector2i(bounds.end.ceil() - origin + Vector2.ONE)
	var mask := Image.create(size.x, size.y, false, Image.FORMAT_RGBA8)
	for polygon in polygons:
		_fill(mask, polygon, origin)
	return {"texture": ImageTexture.create_from_image(mask), "offset": origin}

static func _project(point: Vector3, up: Vector2) -> Vector2:
	# At 45 degrees, ground depth and vertical height share the same scale.
	return Vector2(point.x, point.y * sin(PI / 4.0)) - up * point.z

static func _cylinder(polygons: Array[PackedVector2Array], up: Vector2, rx: float, depth: float, bottom: float, top: float) -> void:
	var points: PackedVector2Array = []
	for h in [bottom, top]:
		for i in range(64):
			var a := TAU * float(i) / 64.0
			points.append(Vector2(cos(a) * rx, sin(a) * depth) - up * h)
	polygons.append(Geometry2D.convex_hull(points))

static func _ring(polygons: Array[PackedVector2Array], up: Vector2, axis_a: Vector3, axis_b: Vector3, height: float, thickness: float) -> void:
	for i in range(96):
		var points: PackedVector2Array = []
		for step_index in [i, i + 1]:
			var angle := TAU * float(step_index) / 96.0
			var point := axis_a * cos(angle) + axis_b * sin(angle) + Vector3(0, 0, height)
			# Project the thickness as well as the ring's spatial centerline.
			for dx in [-thickness, thickness]:
				for dy in [-thickness, thickness]:
					for dh in [-thickness, thickness]:
						points.append(_project(point + Vector3(dx, dy, dh), up))
		polygons.append(Geometry2D.convex_hull(points))

static func _fill(mask: Image, polygon: PackedVector2Array, origin: Vector2) -> void:
	# Union opaque polygons before applying opacity once, avoiding dark overlaps.
	var min_y := mask.get_height()
	var max_y := 0
	for point in polygon:
		min_y = mini(min_y, floori(point.y - origin.y))
		max_y = maxi(max_y, ceili(point.y - origin.y))
	for y in range(maxi(0, min_y), mini(mask.get_height(), max_y + 1)):
		var intersections: Array[float] = []
		var scan_y := origin.y + float(y) + 0.5
		for i in range(polygon.size() - 1):
			var a := polygon[i]
			var b := polygon[i + 1]
			if (a.y <= scan_y and b.y > scan_y) or (b.y <= scan_y and a.y > scan_y):
				intersections.append(a.x + (scan_y - a.y) * (b.x - a.x) / (b.y - a.y) - origin.x)
		intersections.sort()
		for i in range(0, intersections.size() - 1, 2):
			for x in range(maxi(0, ceili(intersections[i] - 0.5)), mini(mask.get_width(), ceili(intersections[i + 1] - 0.5))):
				mask.set_pixel(x, y, Color.WHITE)
