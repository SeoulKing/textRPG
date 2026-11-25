extends Node3D

const Coordinates = preload("res://scripts/native_2d_coordinates.gd")
const WorldDisplay = preload("res://scripts/services/world_display_settings.gd")
const RoomModel = preload("res://art/source/inn-lobby-blender/inn-lobby.glb")
const InnPreset := preload("res://scripts/rendering/inn_shader_preset.gd")
const TileLayout := preload("res://scripts/inn_tile_layout.gd")
const TileArt := preload("res://scripts/rendering/inn_tile_art.gd")
const TileStructure := preload("res://scripts/rendering/inn_tile_structure.gd")
const TileStyle := preload("res://scripts/rendering/tile_world_style.gd")
const TILE_ART_SCALE := Coordinates.LOGICAL_UNIT / TileLayout.LOGICAL_PER_TILE

const FOOTPRINTS := {
	"01_Limestone_hearth": "Fireplaces/Inn_fireplace9",
	"02_Oak_bookcase": "Bookcases/Inn_bookcase10",
	"Back_wall_storage_bench": "Benches/Inn_storage_bench11",
	"Entry_side_storage_bench": "Benches/_Node3D_4223",
	"Lamp_table_lounge_edge": "LampTables/Inn_lamp_table21",
	"Lamp_table_luggage_nook": "LampTables/_Node3D_4725",
	"Lamp_table_sofa_arm": "LampTables/_Node3D_3922",
	"Lounge_Armchair": "Armchairs/Inn_armchair20",
	"Lounge_L_shaped_settee": "Sofas/Inn_corner_sofa18",
	"Lounge_Tea_table": "TeaTables/Inn_tea_table19",
	"Plant_front_corner": "Plants/_Node3D_5227",
	"Plant_lounge_end": "Plants/Inn_plant26",
	"Reception_counter": "Counters/Inn_counter12",
	"Travel_luggage": "Luggage/Inn_luggage24",
}
const CLICK_TARGETS := {
	"innkeeper": "Reception_counter",
	"inn_quest_board": "Quest_board",
	"inn_window_bench": "Back_wall_storage_bench",
	"inn_entrance_bench": "Entry_side_storage_bench",
	"inn_sofa": "Lounge_L_shaped_settee",
	"inn_armchair": "Lounge_Armchair",
}
const RUGS := {
	"Rug_hearth_lounge": "Rugs/LoungeRug1",
	"Rug_entry": "Rugs/EntranceRug2",
	"Rug_reception": "Rugs/ReceptionRug3",
	"Rug_back_bench": "Rugs/WindowRug4",
}
const WALL_PROPS := {
	"Quest_board": "QuestBoards/InnQuestBoard14",
	"Brass_room_key_rack": "Keys/Inn_keys17",
}
const KEEPER_PATH := "Characters/Innkeeper13"
const SEAT_HEIGHTS := {
	"inn_window_bench": 0.65, "inn_entrance_bench": 0.65,
	"inn_sofa": 0.64, "inn_armchair": 0.58,
}

@onready var room: Node3D = $Room
@onready var camera: Camera3D = $Camera3D
@onready var innkeeper: Sprite3D = get_node_or_null("Innkeeper") as Sprite3D
@onready var _key_light: DirectionalLight3D = $Lighting/KeyLight
@onready var hearth_light: OmniLight3D = $Lighting/HearthLight
@onready var avatar: Sprite3D = $Avatar
@onready var _local_lights: Array[OmniLight3D] = [
	hearth_light, $Lighting/ReceptionLight, $Lighting/LoungeLight, $Lighting/ExitLight,
]
var camera_texel_offset := Vector2.ZERO
var presentation_minimum := 2
var _floor := Rect2()
var _bounds := Rect2()
var _click_bounds: Dictionary = {}
var _remote_sprites: Dictionary = {}
var _hearth_energy := 0.0
var _flame: Node3D
var _pixel_effect: Node3D
var _approved_preset: InnPreset
var _experimental_pixel_style := false
var _raster_texel_scale := 1.0
var _tiled_inn := false
var _projected_tile_bounds := Rect2()

func _furniture_offsets() -> Dictionary:
	var original := RoomModel.instantiate()
	var edited := get_node("Room")
	var offsets := {}
	for paths: Dictionary in [FOOTPRINTS, RUGS, WALL_PROPS]:
		for item: String in paths:
			var before := original.get_node_or_null(NodePath(item)) as Node3D
			var after := edited.get_node_or_null(NodePath(item)) as Node3D
			if before != null and after != null and not after.position.is_equal_approx(before.position):
				offsets[item] = after.position - before.position
	original.free()
	return offsets

func _room_scale(source_size: Vector2) -> Vector3:
	var width := InnPreset.lobby_width_scale(source_size.x)
	return Vector3(width, width, source_size.y / (10.5 * Coordinates.SOURCE_UNIT))

func apply_furniture_to_layout(layout_root: Node2D, source_bounds: Rect2) -> void:
	var offsets := _furniture_offsets()
	var model_scale := _room_scale(source_bounds.size)
	for paths: Dictionary in [FOOTPRINTS, RUGS, WALL_PROPS]:
		for item: String in paths:
			if offsets.has(item):
				_move_layout_prop(layout_root, paths[item], offsets[item] * model_scale)
	if offsets.has("Reception_counter"):
		_move_layout_prop(layout_root, KEEPER_PATH, offsets["Reception_counter"] * model_scale)

func _move_layout_prop(layout_root: Node2D, path: NodePath, offset: Vector3) -> void:
	var prop := layout_root.get_node_or_null(path) as Node2D
	if prop != null:
		prop.global_position += Vector2(offset.x, offset.z) * Coordinates.SOURCE_UNIT

func configure(layout_root: Node2D, source_bounds: Rect2) -> bool:
	# Keep the 2D layout as the shared movement, save and interaction coordinate system.
	_floor = Rect2(source_bounds.position / Coordinates.SOURCE_UNIT, source_bounds.size / Coordinates.SOURCE_UNIT)
	if not _floor.has_area():
		return false
	# Fit against the original 2D footprint, then apply the saved 3D movement.
	# This also keeps the footprint size and the hearth's wall clearance intact.
	var offsets := _furniture_offsets()
	for item: String in offsets:
		_group(item).position -= offsets[item]
	room.position = Vector3(_floor.get_center().x, 0.0, _floor.get_center().y)
	room.scale = _room_scale(source_bounds.size)
	for light in _local_lights:
		light.position = room.transform * light.position
		light.omni_range *= room.scale.x
	var hearth_before := _mesh_bounds(_group("01_Limestone_hearth")).get_center()
	var reception_before := _mesh_bounds(_group("Reception_counter")).get_center()
	var lounge_before := _mesh_bounds(_group("Lamp_table_sofa_arm")).get_center()
	for group_name: String in FOOTPRINTS:
		var model := _group(group_name)
		var footprint := _footprint(layout_root.get_node_or_null(FOOTPRINTS[group_name]) as Node2D)
		if group_name == "01_Limestone_hearth":
			# Its authored obstruction extends through the north wall. Keep the
			# firebox in front of the visible wall within the same obstruction.
			var rear_edge := maxf(footprint.position.y, _floor.position.y + 0.46)
			footprint = Rect2(Vector2(footprint.position.x, rear_edge),
				Vector2(footprint.size.x, footprint.end.y - rear_edge))
		if model == null or not footprint.has_area() or not _fit_footprint(model, footprint):
			push_warning("Missing inn layout anchor or model: " + group_name)
			return false
	for rug_name: String in RUGS:
		var model := _group(rug_name)
		var prop := layout_root.get_node_or_null(RUGS[rug_name]) as Node2D
		if model != null and prop != null:
			var center := prop.global_position / Coordinates.SOURCE_UNIT
			model.global_position = Vector3(center.x, model.global_position.y, center.y)

	var keeper := layout_root.get_node_or_null(KEEPER_PATH) as Node2D
	var arrival := layout_root.get_node_or_null("Arrival") as Node2D
	if keeper == null or arrival == null:
		return false
	# The wall-mount depth belongs to the model. Use the authored horizontal anchor.
	for item: String in WALL_PROPS:
		var prop := layout_root.get_node_or_null(WALL_PROPS[item]) as Node2D
		if prop == null:
			return false
		_align_wall_prop(_group(item), prop)
	innkeeper.position = _space(Coordinates.logical(keeper.global_position))
	var counter := _mesh_bounds(_group("Reception_counter"))
	innkeeper.position.z = minf(innkeeper.position.z, counter.position.z - 0.62)
	for item: String in offsets:
		_group(item).position += offsets[item]
	var counter_offset: Vector3 = room.basis * offsets.get("Reception_counter", Vector3.ZERO)
	innkeeper.position += Vector3(counter_offset.x, 0.0, counter_offset.z)
	_adjust_light(hearth_light, "01_Limestone_hearth", hearth_before)
	_adjust_light($Lighting/ReceptionLight, "Reception_counter", reception_before)
	_adjust_light($Lighting/LoungeLight, "Lamp_table_sofa_arm", lounge_before)
	_hearth_energy = hearth_light.light_energy
	_flame = _group("01_Limestone_hearth").get_node_or_null("Hearth_flame_pivot") as Node3D
	for id: String in CLICK_TARGETS:
		var bounds := _mesh_bounds(_group(CLICK_TARGETS[id]))
		if not bounds.has_volume():
			return false
		_click_bounds[id] = bounds.grow(0.08)
	_click_bounds["exit"] = AABB(_space(Coordinates.logical(arrival.global_position))
		+ Vector3(-1.5, -0.12, -0.28), Vector3(3.0, 0.26, 1.7))
	_bounds = Rect2(_floor.position - Vector2(0.6, 4.8),
		_floor.size + Vector2(1.2, 6.0))
	_tiled_inn = true
	return true

func _group(group_name: String) -> Node3D:
	return room.get_node_or_null(NodePath(group_name)) as Node3D

func _mesh_bounds(model: Node3D) -> AABB:
	if model == null:
		return AABB()
	for child in model.get_children():
		if child is MeshInstance3D:
			return child.global_transform * child.get_aabb()
	return AABB()

func _footprint(prop: Node2D) -> Rect2:
	if prop == null:
		return Rect2()
	var collision := prop.get_node_or_null("Collision")
	if collision == null:
		return Rect2()
	var bounds := Rect2()
	for child in collision.get_children():
		if child is CollisionShape2D and not child.disabled and child.shape is RectangleShape2D:
			var size: Vector2 = child.shape.size / Coordinates.SOURCE_UNIT
			var center: Vector2 = child.global_position / Coordinates.SOURCE_UNIT
			var rect := Rect2(center - size * 0.5, size)
			bounds = bounds.merge(rect) if bounds.has_area() else rect
	return bounds

func _fit_footprint(model: Node3D, footprint: Rect2) -> bool:
	var bounds := _mesh_bounds(model)
	if not bounds.has_volume():
		return false
	model.scale *= Vector3(footprint.size.x / bounds.size.x, 1.0, footprint.size.y / bounds.size.z)
	var center := _mesh_bounds(model).get_center()
	var target := footprint.get_center()
	model.global_position += Vector3(target.x - center.x, 0.0, target.y - center.z)
	return true

func _adjust_light(light: OmniLight3D, group_name: String, previous: Vector3) -> void:
	light.position += _mesh_bounds(_group(group_name)).get_center() - previous

func _align_wall_prop(model: Node3D, prop: Node2D) -> void:
	if model != null:
		model.global_position.x += prop.global_position.x / Coordinates.SOURCE_UNIT - _mesh_bounds(model).get_center().x

func apply_approved_rendering(pixel_style_experiment: bool = false) -> bool:
	if is_instance_valid(_pixel_effect):
		return true
	_approved_preset = InnPreset.load_approved() as InnPreset
	var tile_style := _uses_tile_world_style()
	camera.rotation_degrees = TileStyle.CAMERA_ROTATION_DEGREES if tile_style else _approved_preset.camera_rotation_degrees()
	var render_preset := _approved_preset
	_experimental_pixel_style = (tile_style or pixel_style_experiment) and _approved_preset.effect_enabled
	if _experimental_pixel_style:
		render_preset = _approved_preset.tile_world_variant() as InnPreset
		if _tiled_inn or pixel_style_experiment:
			_apply_inn_atmosphere()
	var tile_art := TileArt.new()
	# Fit and rebuild furniture before the renderer captures the source meshes.
	if _tiled_inn and not tile_art.fit_layout(self):
		return false
	# The inn has already fitted its authored scene to the grid. Size live actors in world units.
	if tile_style:
		TileStyle.apply_avatar_size(avatar)
		if is_instance_valid(innkeeper):
			TileStyle.apply_avatar_size(innkeeper)
	else:
		avatar.scale.y = InnPreset.AVATAR_UPRIGHT_SCALE
	if is_instance_valid(_flame):
		_flame.set_meta(&"local_mesh_highlights", true)
	_pixel_effect = render_preset.attach_effect(self, camera)
	if tile_style:
		avatar.rotation.y = camera.rotation.y
		if is_instance_valid(innkeeper):
			innkeeper.rotation.y = camera.rotation.y
			innkeeper.material_override = TileStyle.actor_material(innkeeper.texture, false)
		_projected_tile_bounds = TileStyle.projected_bounds(camera.basis, _world_style_bounds())
	if not _tiled_inn:
		return true
	# The tile walls reuse the toon palette from the original room materials.
	if not tile_art.build_structure(self):
		return false
	# The grid and duplicated west sconces reuse the converted palette.
	_pixel_effect.include_geometry(room)
	for id: String in CLICK_TARGETS:
		_click_bounds[id] = _mesh_bounds(_group(CLICK_TARGETS[id])).grow(0.07)
	_click_bounds["exit"] = AABB(Vector3(6, 0, 9), Vector3(2, 0.8, 2))
	return true


func _apply_inn_atmosphere() -> void:
	var environment := camera.environment.duplicate() as Environment
	environment.ambient_light_color = Color(0.82, 0.87, 1.0)
	environment.ambient_light_energy = 0.41
	if _tiled_inn:
		environment.background_color = Color("24282f")
	camera.environment = environment
	# Let the hearth and reception lamp carry the warm highlights.
	_key_light.light_energy *= 0.9
	_hearth_energy *= 1.12
	$Lighting/ReceptionLight.light_energy *= 1.10


func presentation_pixel_size(zoom_ratio: float, viewport_height: float = 0.0) -> int:
	if _uses_tile_world_style():
		return TileStyle.presentation_scale(zoom_ratio)
	var approved_scale := _approved_preset.fitted_presentation_scale(zoom_ratio, viewport_height)
	var scale := roundi(approved_scale * 1.5) if _experimental_pixel_style else approved_scale
	_raster_texel_scale = float(scale) / approved_scale
	return scale


func input_projection() -> Transform2D:
	return _approved_preset.input_projection(camera)


func overlay_height_scale() -> float:
	return _approved_preset.projected_height_scale(camera)


func sync(world: Node, source: Node, zoom_ratio: float, pixelated: bool, visible_raster: Vector2) -> void:
	var raster_size := get_viewport().get_visible_rect().size
	var visible_size := raster_size if visible_raster == Vector2.ZERO else visible_raster
	# A larger world texel preserves the framing as the raster gets smaller.
	var texel_size := _approved_preset.camera_texel_size(zoom_ratio) * _raster_texel_scale
	var tile_style := _uses_tile_world_style()
	if tile_style:
		texel_size = TileStyle.world_texel_size(zoom_ratio)
	var height := texel_size * visible_size.y
	var actor_height := TileStyle.AVATAR_HEIGHT if tile_style else InnPreset.AVATAR_HEIGHT
	var focus := _space(world.player_position) + Vector3.UP * actor_height * 0.5
	if tile_style:
		focus = TileStyle.clamp_focus(camera.basis, focus, _projected_tile_bounds, visible_size * texel_size)
	else:
		focus.x = _clamp_focus(focus.x, _bounds.position.x, _bounds.size.x, texel_size * visible_size.x)
		focus.z = _clamp_focus(focus.z, _bounds.position.y, _bounds.size.y, height * overlay_height_scale())
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.size = texel_size * raster_size.y
	var desired := focus + camera.basis.z * 24.0
	camera_texel_offset = Vector2.ZERO
	if pixelated and _approved_preset.effect_enabled:
		camera_texel_offset = WorldDisplay.snap_orthographic_camera(camera, desired, texel_size, raster_size)
	else:
		camera.position = desired
	_key_light.shadow_enabled = world.effects_enabled
	for light in _local_lights:
		light.visible = world.effects_enabled
	_sync_hearth(world.time, world.effects_enabled, world.reduced_motion)
	_sync_actor(avatar, source, world, world.player_position, world.bench_state, world.bench_age, world.bench_entity)
	_pixel_effect.sync()

func _uses_tile_world_style() -> bool:
	return _tiled_inn


func _world_style_bounds() -> AABB:
	return TileStructure.BOUNDS


func _sync_hearth(time: float, effects: bool, reduced_motion: bool) -> void:
	var animated := effects and not reduced_motion
	var frame := floorf(maxf(0.0, time) * 12.0)
	var phase := fmod(frame, 12.0) * TAU / 12.0
	var wave := 0.065 * sin(phase) + 0.025 * sin(phase * 3.0 + 0.4) if animated else 0.0
	hearth_light.light_energy = _hearth_energy * (1.0 + wave)
	if is_instance_valid(_flame):
		_flame.scale = Vector3(1.0 + wave * 0.4, 1.0 + wave * 1.8, 1.0)

func _clamp_focus(point: float, start: float, span: float, coverage: float) -> float:
	if coverage >= span:
		return start + span * 0.5
	return clampf(point, start + coverage * 0.5, start + span - coverage * 0.5)

func sync_remote(id: String, source: Node, world: Node, point: Vector2,
		state: String, age: float, seat: Dictionary) -> void:
	if not _remote_sprites.has(id):
		var sprite := avatar.duplicate() as Sprite3D
		sprite.material_override = null
		add_child(sprite)
		_remote_sprites[id] = sprite
	_sync_actor(_remote_sprites[id], source, world, point, state, age, seat)

func remove_remote(id: String) -> void:
	var sprite := _remote_sprites.get(id) as Sprite3D
	if is_instance_valid(sprite):
		sprite.hide()
		sprite.queue_free()
	_remote_sprites.erase(id)

func _sync_actor(sprite: Sprite3D, source: Node, world: Node, point: Vector2,
		state: String, age: float, seat: Dictionary) -> void:
	var texture: Texture2D = source.get_live_texture()
	if texture == null:
		sprite.hide()
		return
	sprite.texture = texture
	_sync_actor_material(sprite, source, texture)
	var foot: Vector2 = source.capture_anchor()
	sprite.offset = Vector2(-foot.x, foot.y - texture.get_height())
	var visual: Vector2 = world.furniture_visual_position(point, state, age, seat)
	var lift := 0.0
	if state in ["sit", "seated", "stand"] and seat.has("seat_visual"):
		var distance := point.distance_to(Vector2(seat.seat_visual))
		var progress := clampf(point.distance_to(visual) / distance, 0.0, 1.0) if distance > 0.0 else 1.0
		lift = _seat_height(seat.id) * progress
	sprite.position = _space(visual, lift + 0.01)
	sprite.visible = source.visible

func _seat_height(id: String) -> float:
	return float(SEAT_HEIGHTS.get(id, 0.0))

func _sync_actor_material(sprite: Sprite3D, source: Node, texture: Texture2D) -> void:
	if not source.get_meta("model_outline", false):
		sprite.material_override = null
		return
	var material := sprite.material_override as ShaderMaterial
	if material == null:
		material = TileStyle.actor_material(texture, true)
		sprite.material_override = material
	material.set_shader_parameter("avatar_texture", texture)
	material.set_shader_parameter("outline_screen_pixels", 1.0 if presentation_minimum > 0 else 0.0)
	var source_material := source.get("sprite_material") as ShaderMaterial
	if source_material != null:
		var hurt: Variant = source_material.get_shader_parameter("hurt_flash")
		var hit: Variant = source_material.get_shader_parameter("hit_flash")
		material.set_shader_parameter("flash", maxf(hurt if hurt is float else 0.0, hit if hit is float else 0.0))

func pick(point: Vector2) -> Vector2:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var ground := origin - direction * (origin.y / direction.y)
	if _tiled_inn:
		return TileLayout.tile_to_logical(Vector2(ground.x, ground.z))
	return Vector2(ground.x, ground.z) * Coordinates.LOGICAL_UNIT

func pick_interaction(point: Vector2, entities: Array) -> Dictionary:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var closest := INF
	var found := {}
	for entity: Dictionary in entities:
		var bounds: AABB = _click_bounds.get(entity.id, AABB())
		var distance := _hit_distance(bounds, origin, direction)
		if entity.id == "innkeeper" and is_instance_valid(innkeeper):
			var actor_scale := TILE_ART_SCALE if _tiled_inn else 1.0
			var actor_bounds := AABB(innkeeper.position + Vector3(-0.35, 0, -0.16) * actor_scale,
				Vector3(0.7, 2.6, 0.32) * actor_scale)
			distance = minf(distance, _hit_distance(actor_bounds, origin, direction))
		if distance < closest:
			closest = distance
			found = entity
	return found

func _hit_distance(bounds: AABB, origin: Vector3, direction: Vector3) -> float:
	if not bounds.has_volume():
		return INF
	var hit: Variant = bounds.intersects_ray(origin, direction)
	return origin.distance_squared_to(hit) if hit is Vector3 else INF

func screen_point(point: Vector2, height: float = 0.0) -> Vector2:
	return camera.unproject_position(_space(point, height / absf(camera.basis.y.y)))

func canvas_projection() -> Transform2D:
	var origin := screen_point(Vector2.ZERO)
	var logical_unit: float = Coordinates.LOGICAL_UNIT
	return Transform2D((screen_point(Vector2(logical_unit, 0)) - origin) / Coordinates.SOURCE_UNIT,
		(screen_point(Vector2(0, logical_unit)) - origin) / Coordinates.SOURCE_UNIT, origin)

func innkeeper_marker_transform() -> Transform2D:
	var projection := canvas_projection()
	var scale := TILE_ART_SCALE if _tiled_inn else 1.0
	var point := camera.unproject_position(innkeeper.position + Vector3.UP * 2.4 * scale)
	var inverse := projection.affine_inverse()
	return Transform2D(inverse.basis_xform(Vector2.RIGHT * projection.x.length()),
		inverse.basis_xform(Vector2.DOWN * projection.x.length()), inverse * point)


func _space(point: Vector2, height: float = 0.0) -> Vector3:
	if _tiled_inn:
		var tile := TileLayout.logical_to_tile(point)
		return Vector3(tile.x, height * TILE_ART_SCALE, tile.y)
	return Vector3(point.x / Coordinates.LOGICAL_UNIT, height, point.y / Coordinates.LOGICAL_UNIT)
