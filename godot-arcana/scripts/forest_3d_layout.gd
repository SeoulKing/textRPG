extends RefCounted
## Game coordinates share the authored 3D forest's X/Z ground plane.
const Coordinates := preload("res://scripts/native_2d_coordinates.gd")
const USE_RADIUS := 34.0
const POND_STRIP_WIDTH := 4.0


static func collect(scene: Node3D) -> Dictionary:
	var tiles := Vector2(scene.get_meta("tile_count"))
	var tile_size := float(scene.get_meta("tile_size")) * Coordinates.LOGICAL_UNIT
	var entrance := scene.get_node("Entrance") as Node3D
	var arrival := entrance.get_node("Arrival") as Marker3D
	var exit := entrance.get_node("Exit") as Marker3D
	var lantern := entrance.get_node("TrailLantern") as Node3D
	var spawn := _logical(entrance.transform * arrival.position)
	var rectangles := _pond_rectangles(scene.get_node("PondBarrier") as Node3D)
	var lantern_size: Vector2 = lantern.get_meta("ground_footprint") * Coordinates.LOGICAL_UNIT
	var lantern_point := _logical(entrance.transform * lantern.position)
	rectangles.append(Rect2(lantern_point - lantern_size * 0.5, lantern_size))
	var entities: Array[Dictionary] = [{
		"id": "forest_entrance", "kind": "forest_entrance", "name": "광장으로 돌아가기",
		"pos": _logical(entrance.transform * exit.position), "interaction_radius": USE_RADIUS,
	}]
	var oaks := scene.get_node("Oaks") as Node3D
	for child in oaks.get_children():
		if child is Node3D and child.has_meta("forest_id"):
			entities.append(_tree_entity(child, oaks.transform))
	return {"bounds": Rect2(Vector2.ZERO, tiles * tile_size), "spawn": spawn,
		"entities": entities, "rectangles": rectangles}


static func _logical(point: Vector3) -> Vector2:
	return Vector2(point.x, point.z) * Coordinates.LOGICAL_UNIT


static func _tree_entity(tree: Node3D, parent_transform: Transform3D) -> Dictionary:
	var trunk := parent_transform * tree.transform
	var radius := float(tree.get_meta("trunk_radius", 0.0))
	var shape_node := tree.get_node_or_null("TrunkCollision") as CollisionShape3D
	if is_instance_valid(shape_node) and shape_node.shape is CylinderShape3D:
		radius = (shape_node.shape as CylinderShape3D).radius
		trunk *= shape_node.transform
	var center := _logical(trunk.origin)
	var half_extent := Vector2(
		Vector2(trunk.basis.x.x, trunk.basis.z.x).length(),
		Vector2(trunk.basis.x.z, trunk.basis.z.z).length()) * radius * Coordinates.LOGICAL_UNIT
	var collision_parts: Array[Rect2] = [Rect2(center - half_extent, half_extent * 2.0)]
	return {"id": str(tree.get_meta("forest_id")), "kind": "forest_trees",
		"name": "작은 참나무" if radius < 0.5 else "참나무", "pos": center,
		"collision_parts": collision_parts, "interaction_radius": USE_RADIUS}


static func _pond_rectangles(pond: Node3D) -> Array[Rect2]:
	var outline: PackedVector2Array = pond.get_meta("shore_outline")
	var points := PackedVector2Array()
	var north := INF
	var south := -INF
	for vertex in outline:
		var point := _logical(pond.transform * Vector3(vertex.x, 0.0, vertex.y))
		points.append(point)
		north = minf(north, point.y)
		south = maxf(south, point.y)
	var rectangles: Array[Rect2] = []
	# Scan the linked shoreline, keeping any concave dry gaps outside the barrier.
	var top := north
	while top < south:
		var bottom := minf(top + POND_STRIP_WIDTH, south)
		var row := (top + bottom) * 0.5
		var intersections: Array[float] = []
		for index in points.size():
			var first := points[index]
			var next := points[(index + 1) % points.size()]
			if (first.y > row) != (next.y > row):
				intersections.append(lerpf(first.x, next.x, (row - first.y) / (next.y - first.y)))
		intersections.sort()
		for index in range(0, intersections.size() - 1, 2):
			rectangles.append(Rect2(intersections[index], top,
				intersections[index + 1] - intersections[index], bottom - top))
		top = bottom
	return rectangles
