extends "res://scripts/inn_lobby_3d.gd"
## The Blender and Godot scenes use metres. The server and movement use 16 logical pixels per metre.

func _ready() -> void:
	_local_lights.append($Room/KitchenTaskLantern/CounterLight)
	_local_lights.append($Room/LivingStudyLamp/StudyLight)
	_local_lights.append($WindowBounce)


func configure(_layout_root: Node2D, source_bounds: Rect2) -> bool:
	_bounds = Rect2(source_bounds.position / Coordinates.SOURCE_UNIT,
		source_bounds.size / Coordinates.SOURCE_UNIT)
	_hearth_energy = hearth_light.light_energy
	_flame = room.get_node("KitchenHearth").find_child("Hearth_flame_pivot", true, false) as Node3D
	_click_bounds.clear()
	for prop: Node3D in room.get_children():
		var entity: Dictionary = prop.get_meta("layout_entity", {})
		var id: String = entity.get("id", "")
		if id.is_empty():
			continue
		if id == "home_door":
			_click_bounds[id] = AABB(prop.position + Vector3(-0.55, -0.13, -0.16),
				Vector3(1.1, 0.44, 1.13))
			continue
		var bounds := _mesh_bounds(prop)
		if not bounds.has_volume():
			push_error("Missing player home furniture mesh: " + str(prop.name))
			return false
		_click_bounds[id] = bounds.grow(0.09)
	return _bounds.has_area()


func set_upper_walls_visible(enabled: bool) -> void:
	$Room/UpperWalls.visible = enabled


func _uses_tile_world_style() -> bool:
	return true


func _world_style_bounds() -> AABB:
	# Frame the complete authored home, including the optional upper walls, at either setting.
	return _mesh_bounds(room)


func collect_layout() -> Dictionary:
	var rectangles: Array[Rect2] = []
	var entities: Array[Dictionary] = []
	for prop: Node3D in $Room.get_children():
		for local_box: Rect2 in prop.get_meta("layout_collisions", []):
			# Project the furniture's edited position and rotation onto the walk plane.
			var corners := [
				_floor_point(prop.transform, local_box.position),
				_floor_point(prop.transform, Vector2(local_box.end.x, local_box.position.y)),
				_floor_point(prop.transform, local_box.end),
				_floor_point(prop.transform, Vector2(local_box.position.x, local_box.end.y)),
			]
			var bounds := Rect2(corners[0], Vector2.ZERO)
			for corner: Vector2 in corners:
				bounds = bounds.expand(corner)
			rectangles.append(bounds)
		var entity: Dictionary = prop.get_meta("layout_entity", {}).duplicate(true)
		if entity.is_empty():
			continue
		entity.pos = _floor_point(prop.transform, entity.pos)
		if entity.has("seat_visual"):
			entity.seat_visual = _floor_point(prop.transform, entity.seat_visual)
		entities.append(entity)
	return {"valid": true, "errors": [], "rectangles": rectangles, "entities": entities,
		"markers": {"Arrival": _floor_point($Arrival.transform, Vector2.ZERO)}}


func _floor_point(transform: Transform3D, point: Vector2) -> Vector2:
	var position := transform * Vector3(point.x, 0.0, point.y)
	return Vector2(position.x, position.z) * Coordinates.LOGICAL_UNIT


func _mesh_bounds(model: Node3D) -> AABB:
	var bounds := AABB()
	for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		var part := mesh.global_transform * mesh.get_aabb()
		bounds = bounds.merge(part) if bounds.has_volume() else part
	return bounds


func _seat_height(id: String) -> float:
	return 0.58 * $Room/LivingSofa.scale.y if id == "home_sofa" else super._seat_height(id)
