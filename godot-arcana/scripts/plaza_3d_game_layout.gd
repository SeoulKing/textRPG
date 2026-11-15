extends Node2D
## Gameplay coordinates derived from the saved Plaza V2 geometry.

const SCENE := "res://scenes/plaza_3d_v2.tscn"
const ORIGIN := Vector2(2048.0, 2048.0)
const UNIT := 16.0

class Placement extends Node2D:
	var gameplay_id := ""
	var model_kind := ""
	var display_name := ""
	var interaction_kind := "decoration"
	var entrance_id := ""
	var entrance_enabled := false
	var anchor := Transform3D.IDENTITY
	var interaction_offset := Vector2.ZERO
	var rectangles: Array[Rect2] = []
	var round_shape: Dictionary = {}

	func map_position(_layout: Node = null) -> Vector2:
		return ORIGIN + Vector2(anchor.origin.x, anchor.origin.z) * UNIT

	func interaction_position(layout: Node = null) -> Vector2:
		return map_position(layout) + interaction_offset

	func layout_transform(_layout: Node = null) -> Transform3D:
		return anchor

	func map_collision_parts(_layout: Node = null) -> Array[Rect2]:
		return rectangles

	func map_round_collision(_layout: Node = null) -> Dictionary:
		return round_shape

	func map_entrance(_layout: Node = null) -> Dictionary:
		return {}

var _placements: Array[Placement] = []
var _bounds := Rect2()
var _home := Vector2.ZERO


func _init() -> void:
	# Read saved properties without creating visual meshes, preview controls or lights.
	var packed := load(SCENE) as PackedScene
	var state := packed.get_state()
	var ground := _transform(state, "Ground")
	var plane := _property(state, "Ground", &"mesh") as PlaneMesh
	var capsule := _property(state, "Player/Footprint", &"shape") as CapsuleShape3D
	var floor_size := plane.size * UNIT
	_bounds = Rect2(to_logical(ground.origin) - floor_size / 2.0, floor_size).grow(-capsule.radius * UNIT)
	_home = to_logical(_transform(state, "MochiSlime").origin)
	var slime_spawn := Marker2D.new()
	slime_spawn.name = "PlazaSlimeSpawn"
	slime_spawn.position = _home * 4.0
	add_child(slime_spawn)
	var containers := Node2D.new()
	containers.name = "Placements"
	add_child(containers)

	var spawn := _add_placement(containers, "PlayerSpawn", "hero", _transform(state, "Player"))
	spawn.gameplay_id = "player_spawn"
	var shop := _add_placement(containers, "Shop", "shop", _transform(state, "Shop"))
	shop.gameplay_id = "arcana_shop"
	shop.display_name = "아르카나 상점"
	shop.interaction_kind = "building"
	var front := Vector2(shop.anchor.basis.z.x, shop.anchor.basis.z.z).normalized()
	# Keep the door approach on the walkable side of the authored wall.
	shop.interaction_offset = front * 8.0
	shop.rectangles.append(_building_footprint(state, "Shop", shop.anchor))

	var inn := _add_placement(containers, "Inn", "inn", _transform(state, "Inn"))
	inn.gameplay_id = "arcana_inn"
	inn.display_name = "푸른 지붕 여관"
	inn.interaction_kind = "building"
	var inn_door := inn.anchor * _transform(state, "Inn/InteractionPoint").origin
	inn.interaction_offset = to_logical(inn_door) - to_logical(inn.anchor.origin)
	inn.rectangles.append(_building_footprint(state, "Inn", inn.anchor))

	var fountain := _add_placement(containers, "Fountain", "fountain", _transform(state, "Fountain"))
	var fountain_shape := _property(state, "Fountain/Collision/Footprint", &"shape") as CylinderShape3D
	var basin := fountain.anchor * _transform(state, "Fountain/Collision") * _transform(state, "Fountain/Collision/Footprint")
	var ground_transform := Transform2D(
		Vector2(basin.basis.x.x, basin.basis.x.z) * UNIT,
		Vector2(basin.basis.z.x, basin.basis.z.z) * UNIT,
		to_logical(basin.origin))
	fountain.round_shape = {"inverse": ground_transform.affine_inverse(), "radius": fountain_shape.radius}


static func to_world(point: Vector2, height: float = 0.0) -> Vector3:
	var relative := (point - ORIGIN) / UNIT
	return Vector3(relative.x, height, relative.y)


static func to_logical(point: Vector3) -> Vector2:
	return ORIGIN + Vector2(point.x, point.z) * UNIT


func walk_bounds() -> Rect2:
	return _bounds


func combat_home() -> Vector2:
	return _home


func placements() -> Array[Placement]:
	return _placements


func normalize_coordinate_frame() -> void:
	transform = Transform2D.IDENTITY


func refresh_plan() -> void:
	pass


func material_at(_point: Vector2) -> int:
	return 2


func wall_collision_rects() -> Array[Rect2]:
	return []


func _building_footprint(state: SceneState, path: String, anchor: Transform3D) -> Rect2:
	var body_path := path + "/Collision"
	var footprint_path := body_path + "/Footprint"
	var shape := _property(state, footprint_path, &"shape") as BoxShape3D
	var collision := anchor * _transform(state, body_path) * _transform(state, footprint_path)
	var area := collision * AABB(-shape.size / 2.0, shape.size)
	return Rect2(to_logical(area.position), Vector2(area.size.x, area.size.z) * UNIT)


func _add_placement(container: Node, label: String, kind: String, model_transform: Transform3D) -> Placement:
	var placement := Placement.new()
	placement.name = label
	placement.model_kind = kind
	placement.anchor = model_transform
	container.add_child(placement)
	_placements.append(placement)
	return placement


func _transform(state: SceneState, path: String) -> Transform3D:
	var value: Variant = _property(state, path, &"transform")
	if value is Transform3D:
		return value
	var position: Variant = _property(state, path, &"position")
	var rotation: Variant = _property(state, path, &"rotation")
	var scale_value: Variant = _property(state, path, &"scale")
	var basis := Basis.from_euler(rotation if rotation is Vector3 else Vector3.ZERO)
	basis = basis.scaled_local(scale_value if scale_value is Vector3 else Vector3.ONE)
	return Transform3D(basis, position if position is Vector3 else Vector3.ZERO)


func _property(state: SceneState, path: String, key: StringName) -> Variant:
	for index in state.get_node_count():
		if str(state.get_node_path(index)).trim_prefix("./") != path:
			continue
		for property in state.get_node_property_count(index):
			if state.get_node_property_name(index, property) == key:
				return state.get_node_property_value(index, property)
	return null
