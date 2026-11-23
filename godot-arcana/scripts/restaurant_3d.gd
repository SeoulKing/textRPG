extends "res://scripts/inn_lobby_3d.gd"

const RegionLayout := preload("res://scripts/region_layout.gd")
const RestaurantLayout := preload("res://scripts/restaurant_tile_layout.gd")


func _ready() -> void:
	# The in-opening view is visual backing. Window light comes through the masonry aperture.
	for view in $Room/HarborViews.get_children():
		for mesh: MeshInstance3D in view.find_children("*", "MeshInstance3D", true, false):
			mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func configure(layout_root: Node2D, source_bounds: Rect2) -> bool:
	if layout_root == null:
		return false
	var logical_bounds := Rect2(Coordinates.logical(source_bounds.position),
		Coordinates.logical(source_bounds.size))
	if not logical_bounds.position.is_equal_approx(RestaurantLayout.LOGICAL_ORIGIN) \
			or not (logical_bounds.size / RestaurantLayout.LOGICAL_PER_TILE).is_equal_approx(
				RestaurantLayout.FLOOR_SIZE):
		return false

	_floor = Rect2(Vector2.ZERO, RestaurantLayout.FLOOR_SIZE)
	var layout := RegionLayout.collect(layout_root)
	if not layout.valid:
		return false
	var exit_point := Vector2.INF
	for entity: Dictionary in layout.entities:
		if entity.id == "exit":
			exit_point = _tile(entity.pos)
	if not _floor.has_point(exit_point):
		return false

	var hearth: Node3D = $Room/Furniture/KitchenHearth
	var counter: Node3D = $Room/Furniture/KitchenCounter
	var counter_bounds := _mesh_bounds(counter)
	var hearth_bounds := _mesh_bounds(hearth)
	if not counter_bounds.has_volume() or not hearth_bounds.has_volume():
		return false
	_click_bounds["counter"] = hearth_bounds.merge(counter_bounds).grow(0.06)
	_click_bounds["exit"] = AABB(Vector3(exit_point.x - 1.0, -0.13, exit_point.y - 0.3),
		Vector3(2.0, 0.32, _floor.end.y - exit_point.y + 1.3))

	_flame = hearth.find_child("Hearth_flame_pivot", true, false) as Node3D
	if _flame != null:
		hearth_light.position = _flame.global_position + Vector3(0.0, 0.28, 0.36)
	_hearth_energy = hearth_light.light_energy
	return true


func _mesh_bounds(model: Node3D) -> AABB:
	var bounds := AABB()
	if model is MeshInstance3D:
		bounds = model.global_transform * model.get_aabb()
	for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		var part := mesh.global_transform * mesh.get_aabb()
		bounds = bounds.merge(part) if bounds.has_volume() else part
	return bounds


func _uses_tile_world_style() -> bool:
	return true


func _world_style_bounds() -> AABB:
	return AABB(Vector3(-1.0, -1.0, -1.0), Vector3(_floor.size.x + 2.0, 4.5, _floor.size.y + 2.0))


func _tile(point: Vector2) -> Vector2:
	return (point - RestaurantLayout.LOGICAL_ORIGIN) / RestaurantLayout.LOGICAL_PER_TILE


func _space(point: Vector2, height: float = 0.0) -> Vector3:
	var at := _tile(point)
	return Vector3(at.x, height * TILE_ART_SCALE, at.y)


func pick(point: Vector2) -> Vector2:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var ground := origin - direction * (origin.y / direction.y)
	return RestaurantLayout.LOGICAL_ORIGIN + Vector2(ground.x, ground.z) * RestaurantLayout.LOGICAL_PER_TILE
