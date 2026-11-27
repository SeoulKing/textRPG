extends RefCounted
## Build the same home geometry for the authored export and the live client.
const Coordinates := preload("res://scripts/native_2d_coordinates.gd")
const DEFAULT_ORIGIN := Vector2(48.0, 64.0)


static func origin(scene: Node3D) -> Vector2:
	var grid: Dictionary = scene.get_meta("home_grid", {})
	return grid.get("origin", DEFAULT_ORIGIN)


static func cell_size(scene: Node3D) -> float:
	var grid: Dictionary = scene.get_meta("home_grid", {})
	return float(grid.get("cell_size", Coordinates.LOGICAL_UNIT))


static func furniture(scene: Node3D) -> Dictionary:
	var entries := {}
	for prop: Node3D in scene.get_node("Room").get_children():
		var definition: Dictionary = prop.get_meta("home_furniture", {})
		if not definition.is_empty():
			entries[definition.id] = {"node": prop, "definition": definition, "authored": prop.transform}
	return entries


static func placements_by_id(placements: Array) -> Dictionary:
	var indexed := {}
	for placement: Variant in placements:
		if placement is Dictionary and placement.get("instanceId") is String:
			indexed[placement.instanceId] = placement
	return indexed


static func rotated_size(dimensions: Vector2i, rotation: int) -> Vector2i:
	return dimensions if posmod(rotation, 2) == 0 else Vector2i(dimensions.y, dimensions.x)


static func placed_transform(scene: Node3D, entry: Dictionary, cell: Vector2i, rotation: int) -> Transform3D:
	var footprint := rotated_size(entry.definition.footprint, rotation)
	var center := origin(scene) + (Vector2(cell) + Vector2(footprint) * 0.5) * cell_size(scene)
	return _at_center(entry, center / Coordinates.LOGICAL_UNIT, rotation)


static func placement_transform(scene: Node3D, entry: Dictionary, placement: Dictionary) -> Transform3D:
	var cell: Variant = placement.get("cell")
	if placement.get("state") != "placed" or not cell is Dictionary:
		return entry.authored
	return placed_transform(scene, entry, Vector2i(int(cell.x), int(cell.z)), int(placement.rotation))


static func collect(scene: Node3D, placements: Array = []) -> Dictionary:
	var catalog := furniture(scene)
	var edited := placements_by_id(placements)
	var rectangles: Array[Rect2] = []
	var entities: Array[Dictionary] = []
	var fixed_rectangles: Array[Rect2] = []
	var edge_walls: Array[Rect2] = []
	var fixed_entities: Array[Dictionary] = []
	for prop: Node3D in scene.get_node("Room").get_children():
		var definition: Dictionary = prop.get_meta("home_furniture", {})
		var id: String = definition.get("id", "")
		var placement: Dictionary = edited.get(id, {})
		if placement.get("state") == "stored":
			continue
		var transform := prop.transform if id.is_empty() else placement_transform(scene, catalog[id], placement)
		var prop_rectangles := _collision_rectangles(prop, transform)
		rectangles.append_array(prop_rectangles)
		if id.is_empty():
			if prop.get_meta("layout_edge_walls", false):
				edge_walls.append_array(prop_rectangles)
			else:
				fixed_rectangles.append_array(prop_rectangles)
		var entity := _entity(prop, transform)
		if entity.is_empty():
			continue
		if entity.has("seat_visual"):
			entity.seat_facing = (Vector2(entity.pos) - Vector2(entity.seat_visual)).normalized()
		entities.append(entity)
		if id.is_empty():
			fixed_entities.append(entity)
	var arrival := scene.get_node("Arrival") as Node3D
	return {"valid": true, "errors": [], "rectangles": rectangles, "entities": entities,
		"fixed_rectangles": fixed_rectangles, "edge_walls": edge_walls, "fixed_entities": fixed_entities,
		"markers": {"Arrival": floor_point(arrival.transform, Vector2.ZERO)}}


static func catalog(scene: Node3D) -> Dictionary:
	var result := {}
	var entries := furniture(scene)
	for id: String in entries:
		var entry: Dictionary = entries[id]
		var prop: Node3D = entry.node
		var definition: Dictionary = entry.definition
		var authored: Transform3D = entry.authored
		var yaw := atan2(authored.basis.z.x, authored.basis.z.z)
		var rotation := posmod(roundi(-yaw / (PI / 2.0)), 4)
		var dimensions: Vector2i = definition.footprint
		var default_rectangles := _collision_rectangles(prop, authored)
		var occupied_rectangles := default_rectangles
		if definition.has("occupancy"):
			occupied_rectangles = [_project_rect(authored, definition.occupancy)]
		var canonical := _at_center(entry, Vector2.ZERO, 0)
		var value := {"instanceId": id, "assetId": definition.asset, "name": definition.name,
			"footprint": {"width": dimensions.x, "depth": dimensions.y},
			"canStore": definition.get("can_store", true), "layer": definition.get("layer", "floor"),
			"defaultRotation": rotation, "defaultCells": _cells(scene, occupied_rectangles),
			"defaultRectangles": _json_rectangles(default_rectangles),
			"collisionAtCenter": _json_rectangles(_collision_rectangles(prop, canonical))}
		if definition.has("occupancy"):
			value.surfaceAtCenter = _json_rectangle(_project_rect(canonical, definition.occupancy))
		else:
			var model := _model_surface(scene, prop, definition.get("attachments", []), canonical)
			if model.has_area():
				value.surfaceAtCenter = _json_rectangle(model)
		var entity := _entity(prop, canonical)
		if not entity.is_empty():
			value.featureAtCenter = {"id": entity.id, "x": entity.pos.x, "y": entity.pos.y,
				"radius": entity.get("interaction_radius", 26.0)}
		result[id] = value
	return result

static func _model_surface(scene: Node3D, prop: Node3D, attachments: Array, canonical: Transform3D) -> Rect2:
	var meshes := prop.find_children("*", "MeshInstance3D", true, false)
	for path: String in attachments:
		var attachment := scene.get_node_or_null(NodePath(path))
		if attachment != null:
			meshes.append_array(attachment.find_children("*", "MeshInstance3D", true, false))
			if attachment is MeshInstance3D: meshes.append(attachment)
	if prop is MeshInstance3D: meshes.append(prop)
	var world_to_footprint := canonical * _scene_transform(scene, prop).affine_inverse()
	var bounds := AABB()
	for mesh: MeshInstance3D in meshes:
		if mesh.mesh == null: continue
		var part := world_to_footprint * _scene_transform(scene, mesh) * mesh.get_aabb()
		bounds = bounds.merge(part) if bounds.has_volume() else part
	var base := Vector2(bounds.position.x, bounds.position.z)
	var size := Vector2(bounds.size.x, bounds.size.z)
	return Rect2(base * Coordinates.LOGICAL_UNIT, size * Coordinates.LOGICAL_UNIT)


static func _scene_transform(scene: Node3D, node: Node3D) -> Transform3D:
	var transform := node.transform
	var parent := node.get_parent_node_3d()
	while parent != null and parent != scene:
		transform = parent.transform * transform
		parent = parent.get_parent_node_3d()
	return transform


static func floor_point(transform: Transform3D, point: Vector2) -> Vector2:
	var position := transform * Vector3(point.x, 0.0, point.y)
	return Vector2(position.x, position.z) * Coordinates.LOGICAL_UNIT


static func _at_center(entry: Dictionary, center: Vector2, rotation: int) -> Transform3D:
	var authored: Transform3D = entry.authored
	var rotation_basis := Basis(Vector3.UP, -posmod(rotation, 4) * PI / 2.0)
	var scaled := rotation_basis * Basis.from_scale(authored.basis.get_scale())
	var pivot: Vector2 = entry.definition.pivot
	var offset := scaled * Vector3(pivot.x, 0.0, pivot.y)
	return Transform3D(scaled, Vector3(center.x - offset.x, authored.origin.y, center.y - offset.z))


static func _entity(prop: Node3D, transform: Transform3D) -> Dictionary:
	var entity: Dictionary = prop.get_meta("layout_entity", {}).duplicate(true)
	if not entity.is_empty():
		entity.pos = floor_point(transform, entity.pos)
		if entity.has("seat_visual"):
			entity.seat_visual = floor_point(transform, entity.seat_visual)
	return entity


static func _collision_rectangles(prop: Node3D, transform: Transform3D) -> Array[Rect2]:
	var result: Array[Rect2] = []
	for box: Rect2 in prop.get_meta("layout_collisions", []):
		result.append(_project_rect(transform, box))
	return result


static func _project_rect(transform: Transform3D, box: Rect2) -> Rect2:
	var bounds := Rect2(floor_point(transform, box.position), Vector2.ZERO)
	for corner: Vector2 in [Vector2(box.end.x, box.position.y), box.end, Vector2(box.position.x, box.end.y)]:
		bounds = bounds.expand(floor_point(transform, corner))
	return bounds


static func _cells(scene: Node3D, rectangles: Array[Rect2]) -> Array[String]:
	var result: Array[String] = []
	var base := origin(scene)
	var step := cell_size(scene)
	const EDGE_EPSILON := 0.0001
	for rect: Rect2 in rectangles:
		var first := Vector2i(((rect.position - base + Vector2.ONE * EDGE_EPSILON) / step).floor())
		var end := Vector2i(((rect.end - base - Vector2.ONE * EDGE_EPSILON) / step).ceil())
		for z in range(first.y, end.y):
			for x in range(first.x, end.x):
				var key := "%d:%d" % [x, z]
				if not result.has(key):
					result.append(key)
	return result


static func _json_rectangles(rectangles: Array[Rect2]) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for rect: Rect2 in rectangles:
		result.append(_json_rectangle(rect))
	return result


static func _json_rectangle(rect: Rect2) -> Dictionary:
	return {"x": rect.position.x, "y": rect.position.y, "w": rect.size.x, "h": rect.size.y}
