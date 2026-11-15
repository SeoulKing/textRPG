extends Node3D

const Coordinates = preload("res://scripts/native_2d_coordinates.gd")
const WorldDisplay = preload("res://scripts/services/world_display_settings.gd")
const ActorOutline = preload("res://art/resources/shop_hero_outline.gdshader")

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
const SEAT_HEIGHTS := {
	"inn_window_bench": 0.65, "inn_entrance_bench": 0.65,
	"inn_sofa": 0.64, "inn_armchair": 0.58,
}

@onready var room: Node3D = $Room
@onready var camera: Camera3D = $Camera3D
@onready var innkeeper: Sprite3D = $Innkeeper
@onready var hearth_light: OmniLight3D = $HearthLight
@onready var avatar: Sprite3D = $Avatar
@onready var _local_lights: Array[OmniLight3D] = [$HearthLight, $ReceptionLight, $LoungeLight, $ExitLight]
var camera_texel_offset := Vector2.ZERO
var presentation_minimum := 2
var _floor := Rect2()
var _bounds := Rect2()
var _click_bounds: Dictionary = {}
var _remote_sprites: Dictionary = {}
var _hearth_energy := 0.0
var _flame: Node3D

func configure(layout_root: Node2D, source_bounds: Rect2) -> bool:
	# Keep the 2D layout as the shared movement, save and interaction coordinate system.
	_floor = Rect2(source_bounds.position / Coordinates.SOURCE_UNIT, source_bounds.size / Coordinates.SOURCE_UNIT)
	if not _floor.has_area():
		return false
	room.position = Vector3(_floor.get_center().x, 0.0, _floor.get_center().y)
	var horizontal_scale := _floor.size.x / 15.0
	room.scale = Vector3(horizontal_scale, horizontal_scale, _floor.size.y / 10.5)
	for light in _local_lights:
		light.position = room.transform * light.position
		light.omni_range *= horizontal_scale
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
	_adjust_light($HearthLight, "01_Limestone_hearth", hearth_before)
	_adjust_light($ReceptionLight, "Reception_counter", reception_before)
	_adjust_light($LoungeLight, "Lamp_table_sofa_arm", lounge_before)
	_hearth_energy = hearth_light.light_energy
	_flame = _group("01_Limestone_hearth").get_node_or_null("Hearth_flame_pivot") as Node3D
	for rug_name: String in RUGS:
		var model := _group(rug_name)
		var prop := layout_root.get_node_or_null(RUGS[rug_name]) as Node2D
		if model != null and prop != null:
			var center := prop.global_position / Coordinates.SOURCE_UNIT
			model.global_position = Vector3(center.x, model.global_position.y, center.y)

	var board := layout_root.get_node_or_null("QuestBoards/InnQuestBoard14") as Node2D
	var rack := layout_root.get_node_or_null("Keys/Inn_keys17") as Node2D
	var keeper := layout_root.get_node_or_null("Characters/Innkeeper13") as Node2D
	var arrival := layout_root.get_node_or_null("Arrival") as Node2D
	if board == null or rack == null or keeper == null or arrival == null:
		return false
	# The wall-mount depth belongs to the model. Use the authored horizontal anchor.
	_align_wall_prop(_group("Quest_board"), board)
	_align_wall_prop(_group("Brass_room_key_rack"), rack)
	innkeeper.position = _space(Coordinates.logical(keeper.global_position))
	var counter := _mesh_bounds(_group("Reception_counter"))
	innkeeper.position.z = minf(innkeeper.position.z, counter.position.z - 0.62)
	for id: String in CLICK_TARGETS:
		var bounds := _mesh_bounds(_group(CLICK_TARGETS[id]))
		if not bounds.has_volume():
			return false
		_click_bounds[id] = bounds.grow(0.08)
	_click_bounds["exit"] = AABB(_space(Coordinates.logical(arrival.global_position))
		+ Vector3(-1.5, -0.12, -0.28), Vector3(3.0, 0.26, 1.7))
	_bounds = Rect2(_floor.position - Vector2(0.6, 4.8),
		_floor.size + Vector2(1.2, 6.0))
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

func view_height(aspect: float, zoom_ratio: float) -> float:
	var depth := _bounds.size.y * sin(-camera.rotation.x)
	return maxf(depth, _bounds.size.x / aspect) / zoom_ratio

func sync(world: Node, source: Node, zoom_ratio: float, pixelated: bool, visible_raster: Vector2) -> void:
	var raster_size := get_viewport().get_visible_rect().size
	var visible_size := raster_size if visible_raster == Vector2.ZERO else visible_raster
	var aspect := visible_size.x / maxf(visible_size.y, 1.0)
	var height := view_height(aspect, zoom_ratio)
	var pitch_sine := sin(-camera.rotation.x)
	var depth := height / pitch_sine
	var focus := _space(world.player_position) - Vector3(0, 0, 0.7)
	focus.x = _clamp_focus(focus.x, _bounds.position.x, _bounds.size.x, height * aspect)
	focus.z = _clamp_focus(focus.z, _bounds.position.y, _bounds.size.y, depth)
	var texel_size := height / maxf(1.0, visible_size.y)
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.size = texel_size * raster_size.y
	var desired := focus + camera.basis.z * 24.0
	camera_texel_offset = Vector2.ZERO
	if pixelated:
		camera_texel_offset = WorldDisplay.snap_orthographic_camera(camera, desired, texel_size, raster_size)
	else:
		camera.position = desired
	$CeilingLight.shadow_enabled = world.effects_enabled
	for light in _local_lights:
		light.visible = world.effects_enabled
	_sync_hearth(world.time, world.effects_enabled, world.reduced_motion)
	_sync_actor(avatar, source, world, world.player_position, world.bench_state, world.bench_age, world.bench_entity)

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
		lift = float(SEAT_HEIGHTS.get(seat.id, 0.0)) * progress
	sprite.position = _space(visual, lift + 0.01)
	sprite.visible = source.visible

func _sync_actor_material(sprite: Sprite3D, source: Node, texture: Texture2D) -> void:
	if not source.get_meta("model_outline", false):
		sprite.material_override = null
		return
	var material := sprite.material_override as ShaderMaterial
	if material == null:
		material = ShaderMaterial.new()
		material.shader = ActorOutline
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
	return Vector2(ground.x, ground.z) * Coordinates.LOGICAL_UNIT

func pick_interaction(point: Vector2, entities: Array) -> Dictionary:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var closest := INF
	var found := {}
	for entity: Dictionary in entities:
		var bounds: AABB = _click_bounds.get(entity.id, AABB())
		var distance := _hit_distance(bounds, origin, direction)
		if entity.id == "innkeeper":
			var actor_bounds := AABB(innkeeper.position + Vector3(-0.35, 0, -0.16),
				Vector3(0.7, 2.6, 0.32))
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

func _space(point: Vector2, height: float = 0.0) -> Vector3:
	return Vector3(point.x / Coordinates.LOGICAL_UNIT, height, point.y / Coordinates.LOGICAL_UNIT)
