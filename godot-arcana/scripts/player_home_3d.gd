extends "res://scripts/inn_lobby_3d.gd"
## The Blender and Godot scenes use metres. The server and movement use 16 logical pixels per metre.

const FurnitureLayout := preload("res://scripts/home_furniture_layout.gd")
const VALID_PAD := Color("79cb82")
const INVALID_PAD := Color("e57f78")
const PAD_HEIGHT := 0.045
const PAD_PIXEL := 1.0 / 16.0

var _cook_fire_age := -1.0
var _flame_rest_tilt := 0.0
var _furniture: Dictionary = {}
var _placements: Dictionary = {}
var _attachments: Dictionary = {}
var _edit_id := ""
var _edit_ghost: Node3D
var _edit_material: StandardMaterial3D
var _edit_pads: MeshInstance3D
var _edit_footprint: MeshInstance3D
var _shown_anchors: Dictionary = {}


func _ready() -> void:
	_local_lights.append($Room/KitchenTaskLantern/CounterLight)
	_local_lights.append($Room/LivingStudyLamp/StudyLight)
	_local_lights.append($Lighting/WindowBounce)
	_furniture = FurnitureLayout.furniture(self)
	for id: String in _furniture:
		var entry: Dictionary = _furniture[id]
		var node: Node3D = entry.node
		var attached: Array[Dictionary] = []
		for path: String in entry.definition.get("attachments", []):
			var decoration := get_node_or_null(NodePath(path)) as Node3D
			if decoration != null:
				attached.append({"node": decoration, "authored": decoration.transform,
					"relative": node.global_transform.affine_inverse() * decoration.global_transform,
					"visible": decoration.visible,
					"synced_light": decoration is OmniLight3D and _local_lights.has(decoration)})
		_attachments[id] = attached


func configure(_layout_root: Node2D, source_bounds: Rect2) -> bool:
	_bounds = Rect2(source_bounds.position / Coordinates.SOURCE_UNIT,
		source_bounds.size / Coordinates.SOURCE_UNIT)
	_hearth_energy = hearth_light.light_energy
	_flame = room.get_node("KitchenHearth").find_child("Hearth_flame_pivot", true, false) as Node3D
	if is_instance_valid(_flame):
		_flame_rest_tilt = _flame.rotation.x
	return _refresh_click_bounds() and _bounds.has_area()


func _refresh_click_bounds() -> bool:
	_click_bounds.clear()
	for prop: Node3D in room.get_children():
		var entity: Dictionary = prop.get_meta("layout_entity", {})
		var id: String = entity.get("id", "")
		if id.is_empty() or not prop.visible:
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
	return true


func set_upper_walls_visible(enabled: bool) -> void:
	$Room/UpperWalls.visible = enabled


func kitchen_hearth_position() -> Vector2:
	return _floor_point($Room/KitchenHearth.global_transform, Vector2.ZERO)


func set_kitchen_cooking(active: bool, delta: float) -> void:
	# The movement clock pauses while the cooking panel is open.
	_cook_fire_age = maxf(0.0, _cook_fire_age) + delta if active else -1.0


func _sync_hearth(time: float, effects: bool, reduced_motion: bool) -> void:
	if _cook_fire_age < 0.0:
		super._sync_hearth(time, effects, reduced_motion)
		if is_instance_valid(_flame):
			_flame.rotation.x = _flame_rest_tilt
		return

	var animated := effects and not reduced_motion
	var phase := _cook_fire_age * TAU
	var pulse := 0.0
	var sway := 0.0
	if animated:
		pulse = 0.65 * sin(phase * 1.45) + 0.35 * sin(phase * 2.6 + 0.7)
		sway = sin(phase * 0.9 + 0.55)
	hearth_light.light_energy = _hearth_energy * (1.65 + 0.28 * pulse)
	if is_instance_valid(_flame):
		# Keep the base inside the firebox and lean along the face of the oven.
		_flame.scale = Vector3(1.0, 1.80 + 0.36 * pulse, 1.38 - 0.18 * pulse)
		_flame.rotation.x = _flame_rest_tilt + 0.22 * sway


func _uses_tile_world_style() -> bool:
	return true


func _world_style_bounds() -> AABB:
	# Frame the complete authored home, including the optional upper walls, at either setting.
	return _mesh_bounds(room)


func collect_layout(placements: Array = []) -> Dictionary:
	return FurnitureLayout.collect(self, placements)


func collect_home_catalog() -> Dictionary:
	return FurnitureLayout.catalog(self)


func apply_home_layout(placements: Array) -> void:
	var next := FurnitureLayout.placements_by_id(placements)
	if next == _placements:
		return
	home_edit_clear()
	_placements = next
	for id: String in _furniture:
		var entry: Dictionary = _furniture[id]
		var node: Node3D = entry.node
		var placement: Dictionary = _placements.get(id, {})
		node.transform = FurnitureLayout.placement_transform(self, entry, placement)
		_set_furniture_visible(id, placement.get("state") != "stored")
		for attachment: Dictionary in _attachments[id]:
			var decoration: Node3D = attachment.node
			if placement.get("state") == "placed":
				decoration.global_transform = node.global_transform * attachment.relative
			else:
				decoration.transform = attachment.authored
	_refresh_click_bounds()


func home_edit_pick(point: Vector2) -> String:
	var ray_origin := camera.project_ray_origin(point)
	var ray_direction := camera.project_ray_normal(point)
	var closest := INF
	var selected := ""
	for id: String in _furniture:
		var node: Node3D = _furniture[id].node
		if not node.is_visible_in_tree():
			continue
		var bounds := _mesh_bounds(node)
		if not bounds.has_volume():
			continue
		var distance := _hit_distance(bounds.grow(0.05), ray_origin, ray_direction)
		if distance < closest:
			closest = distance
			selected = id
	return selected


func home_edit_handle_point(id: String) -> Variant:
	if not _furniture.has(id):
		return null
	var model: Node3D = _edit_ghost if _edit_id == id else _furniture[id].node
	if not model.is_visible_in_tree():
		return null
	var bounds := _mesh_bounds(model)
	if not bounds.has_volume():
		return null
	var center := bounds.get_center()
	var bottom := -INF
	var screen_center := camera.unproject_position(Vector3(center.x, bounds.position.y, center.z))
	for x: float in [bounds.position.x, bounds.end.x]:
		for z: float in [bounds.position.z, bounds.end.z]:
			bottom = maxf(bottom, camera.unproject_position(Vector3(x, bounds.position.y, z)).y)
	return Vector2(screen_center.x, bottom)


func frame_home_editor(current: float, physical_size: Vector2, bottom_space: float) -> float:
	if not _projected_tile_bounds.has_area():
		return current
	var room_pixels := _projected_tile_bounds.size * TileStyle.DOTS_PER_TILE * TileStyle.REFERENCE_PIXEL_SIZE
	var fit := minf(physical_size.x / room_pixels.x, (physical_size.y - bottom_space) / room_pixels.y)
	var zoom := minf(current, maxf(0.1, fit * 0.94))
	var shift_texels := roundf(bottom_space * 0.5 / TileStyle.presentation_scale(zoom))
	camera.v_offset = -shift_texels * TileStyle.world_texel_size(zoom)
	return zoom


func home_edit_preview(id: String, cell: Vector2i, rotation: int, valid: bool, anchors: Dictionary) -> void:
	if not is_instance_valid(_edit_pads):
		_edit_pads = _create_edit_pads(0.0)
		_edit_footprint = _create_edit_pads(0.003)
	if anchors != _shown_anchors:
		_shown_anchors = anchors.duplicate()
		_show_anchors(anchors)
	if id != _edit_id:
		_clear_edit_ghost()
		if _furniture.has(id):
			_create_edit_ghost(id)
	_edit_footprint.mesh = null
	if not is_instance_valid(_edit_ghost):
		return
	_edit_ghost.visible = Rect2i(-1, -1, 11, 8).has_point(cell)
	if not _edit_ghost.visible:
		return
	var entry: Dictionary = _furniture[_edit_id]
	var footprint := FurnitureLayout.rotated_size(entry.definition.footprint, rotation)
	_edit_ghost.transform = FurnitureLayout.placed_transform(self, entry, cell, rotation)
	_edit_material.albedo_color = Color(VALID_PAD if valid else INVALID_PAD, 0.52)
	_show_footprint(Rect2i(cell, footprint), valid)


func home_edit_clear() -> void:
	_clear_edit_ghost()
	_shown_anchors.clear()
	if is_instance_valid(_edit_pads):
		_edit_pads.mesh = null
		_edit_footprint.mesh = null


func _set_furniture_visible(id: String, show: bool) -> void:
	var node: Node3D = _furniture[id].node
	node.visible = show
	for attachment: Dictionary in _attachments[id]:
		var decoration: Node3D = attachment.node
		decoration.visible = show and attachment.visible
		if attachment.synced_light:
			var light := decoration as OmniLight3D
			if not show:
				_local_lights.erase(light)
			elif not _local_lights.has(light):
				_local_lights.append(light)


func _clear_edit_ghost() -> void:
	if _edit_id.is_empty():
		return
	var placement: Dictionary = _placements.get(_edit_id, {})
	_set_furniture_visible(_edit_id, placement.get("state") != "stored")
	_edit_ghost.queue_free()
	_edit_ghost.hide()
	_edit_ghost = null
	_edit_material = null
	_edit_id = ""


func _create_edit_ghost(id: String) -> void:
	_edit_id = id
	_edit_ghost = Node3D.new()
	add_child(_edit_ghost)
	_edit_material = StandardMaterial3D.new()
	_edit_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_edit_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var node: Node3D = _furniture[id].node
	var inverse := node.global_transform.affine_inverse()
	_add_ghost_meshes(node, inverse)
	for attachment: Dictionary in _attachments[id]:
		_add_ghost_meshes(attachment.node, inverse)
	_set_furniture_visible(id, false)


func _add_ghost_meshes(source: Node3D, inverse: Transform3D) -> void:
	var meshes := source.find_children("*", "MeshInstance3D", true, false)
	if source is MeshInstance3D:
		meshes.push_front(source)
	for original: MeshInstance3D in meshes:
		if original.mesh == null or not original.visible:
			continue
		var ghost := MeshInstance3D.new()
		ghost.mesh = original.mesh
		ghost.material_override = _edit_material
		ghost.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		ghost.transform = inverse * original.global_transform
		_edit_ghost.add_child(ghost)


func _create_edit_pads(lift: float) -> MeshInstance3D:
	var pads := MeshInstance3D.new()
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.render_priority = 1 if lift > 0.0 else 0
	pads.material_override = material
	pads.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	pads.position.y = lift
	add_child(pads)
	return pads


func _show_anchors(anchors: Dictionary) -> void:
	if anchors.is_empty():
		_edit_pads.mesh = null
		return
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for anchor: Vector2i in anchors:
		_pad_tile(mesh, anchor, bool(anchors[anchor]), false)
	mesh.surface_end()
	_edit_pads.mesh = mesh


func _show_footprint(footprint: Rect2i, valid: bool) -> void:
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for z in range(footprint.position.y, footprint.end.y):
		for x in range(footprint.position.x, footprint.end.x):
			_pad_tile(mesh, Vector2i(x, z), valid, true)
	mesh.surface_end()
	_edit_footprint.mesh = mesh


func _pad_tile(mesh: ImmediateMesh, cell: Vector2i, valid: bool, selected: bool) -> void:
	var at := Vector2(cell)
	var area := Rect2(at, Vector2.ONE).grow(-PAD_PIXEL)
	var color := VALID_PAD if valid else INVALID_PAD
	var edge := color.lightened(0.40) if selected else color.darkened(0.52)
	_stepped_pad(mesh, area, Color(edge, 0.96 if selected else 0.63))
	_stepped_pad(mesh, area.grow(-PAD_PIXEL), Color(color, 0.83 if selected else 0.37))
	if selected:
		var shine := Rect2(at + Vector2(4, 2) * PAD_PIXEL, Vector2(8, 1) * PAD_PIXEL)
		_pad_rectangle(mesh, shine, Color(color.lightened(0.62), 0.95))
	if not valid:
		var mark := Color(color.darkened(0.58), 0.88 if selected else 0.68)
		for point: Vector2 in [Vector2(6, 6), Vector2(9, 6), Vector2(7, 7), Vector2(8, 7),
				Vector2(7, 8), Vector2(8, 8), Vector2(6, 9), Vector2(9, 9)]:
			_pad_rectangle(mesh, Rect2(at + point * PAD_PIXEL, Vector2.ONE * PAD_PIXEL), mark)


func _stepped_pad(mesh: ImmediateMesh, area: Rect2, color: Color) -> void:
	var inner_width := area.size.x - 2.0 * PAD_PIXEL
	var inset := Vector2(PAD_PIXEL, 0.0)
	var cap_size := Vector2(inner_width, PAD_PIXEL)
	_pad_rectangle(mesh, Rect2(area.position + inset, cap_size), color)
	_pad_rectangle(mesh, Rect2(area.position + Vector2(0.0, PAD_PIXEL),
		area.size - Vector2(0.0, 2.0 * PAD_PIXEL)), color)
	_pad_rectangle(mesh, Rect2(Vector2(area.position.x, area.end.y - PAD_PIXEL) + inset, cap_size), color)


func _pad_rectangle(mesh: ImmediateMesh, area: Rect2, color: Color) -> void:
	var origin := FurnitureLayout.origin(self) / Coordinates.LOGICAL_UNIT
	var step := FurnitureLayout.cell_size(self) / Coordinates.LOGICAL_UNIT
	var lo := origin + area.position * step
	var hi := origin + area.end * step
	mesh.surface_set_color(color)
	for point: Vector2 in [lo, Vector2(hi.x, lo.y), hi, lo, hi, Vector2(lo.x, hi.y)]:
		mesh.surface_add_vertex(Vector3(point.x, PAD_HEIGHT, point.y))


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
