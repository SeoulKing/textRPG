extends RefCounted
## Authored geometry is in local source pixels; gameplay remains logical pixels.
const Coordinates = preload("res://scripts/native_2d_coordinates.gd")
static func collect(source: Node2D) -> Dictionary:
	var result: Dictionary = {"rectangles":[], "entities":[], "markers":{}, "errors":[], "valid":false}
	if not source.transform.is_equal_approx(Transform2D.IDENTITY):
		result.errors.append("Region root must have identity transform.")
	_visit(source, Transform2D.IDENTITY, result)
	result.valid = result.errors.is_empty()
	return result
static func _visit(node: Node, parent_transform: Transform2D, result: Dictionary) -> void:
	var local: Transform2D = parent_transform
	if node is Node2D:
		if not node.scale.is_equal_approx(Vector2.ONE) or not is_zero_approx(node.rotation):
			if node.has_meta("layout_collisions") or node.has_meta("layout_entity") or node.get_meta("layout_collision_owner",false) or node.get_meta("layout_collision",false):
				result.errors.append(str(node.name) + ": layout nodes require scale one and rotation zero.")
		local = parent_transform * node.transform
	for box in node.get_meta("layout_collisions", []):
		if box is Rect2:
			result.rectangles.append(Rect2(Coordinates.logical(local * box.position), Coordinates.logical(box.size)))
	# Native editor handles are the collision source for migrated object visuals.
	if node is CollisionShape2D and node.get_meta("layout_collision",false) and not node.disabled:
		if node.shape is RectangleShape2D:
			var size: Vector2 = node.shape.size
			result.rectangles.append(Rect2(Coordinates.logical(local * (-size * .5)), Coordinates.logical(size)))
		else:
			result.errors.append(str(node.get_path()) + ": layout collision requires RectangleShape2D.")
	var entity: Dictionary = node.get_meta("layout_entity", {}).duplicate(true)
	if not entity.is_empty():
		entity.pos = Coordinates.logical(local * entity.get("pos", Vector2.ZERO))
		if entity.has("seat_visual"):
			entity.seat_visual = Coordinates.logical(local * entity.seat_visual)
		for previous in result.entities:
			if previous.id == entity.id: result.errors.append("Duplicate interaction id: " + str(entity.id))
		result.entities.append(entity)
	var marker: String = str(node.get_meta("layout_marker", ""))
	if not marker.is_empty():
		if result.markers.has(marker): result.errors.append("Duplicate marker: " + marker)
		result.markers[marker] = Coordinates.logical(local * Vector2.ZERO)
	for child in node.get_children(): _visit(child, local, result)
static func load_region(location: String, floor_number: int = 1) -> Dictionary:
	var packed: PackedScene = preload("res://scripts/region_registry.gd").scene(location, floor_number)
	if packed == null: return {"valid":false, "errors":["Region scene is missing."]}
	var source := packed.instantiate() as Node2D
	if source == null: return {"valid":false, "errors":["Region root must be Node2D."]}
	var result := collect(source)
	source.free()
	return result
