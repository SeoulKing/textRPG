extends "res://scripts/inn_lobby_3d.gd"

const FloorLayout := preload("res://scripts/academy_first_floor_layout.gd")


func _ready() -> void:
	for light in $Lighting/FixtureLights.get_children():
		_local_lights.append(light as OmniLight3D)
	# The amber panes are visible but light can pass through them and the masonry openings.
	var glass := room.find_child("WindowGlass", true, false) as MeshInstance3D
	if glass != null:
		glass.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func configure(_layout_root: Node2D, source_bounds: Rect2) -> bool:
	_floor = Rect2(source_bounds.position / Coordinates.SOURCE_UNIT,
		source_bounds.size / Coordinates.SOURCE_UNIT)
	var layout := collect_layout()
	if not layout.valid or not _floor.has_area():
		return false
	_hearth_energy = hearth_light.light_energy
	for entity: Dictionary in layout.entities:
		var at := _space(entity.pos)
		match entity.kind:
			"exit":
				_click_bounds[entity.id] = AABB(at + Vector3(-1.5, -0.1, -0.3), Vector3(3, 0.45, 1.5))
			"academy_stairs":
				_click_bounds[entity.id] = AABB(Vector3(10, 0, 1.38), Vector3(5, 1.85, 3.83))
	return true


func collect_layout() -> Dictionary:
	return FloorLayout.collect()


func _uses_tile_world_style() -> bool:
	return true


func _world_style_bounds() -> AABB:
	return AABB(Vector3(-0.35, -0.61, -0.35), Vector3(_floor.size.x + 0.7, 8.61, _floor.size.y + 0.7))
