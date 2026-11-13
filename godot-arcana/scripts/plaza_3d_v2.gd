extends Node3D

const Hero = preload("res://scripts/characters/hybrid_v1/billboard_actor.gd")
const Joystick = preload("res://scripts/virtual_joystick.gd")
const PIXEL_SHADING = preload("res://art/resources/arcana_pixel_shading.gdshader")
const AssetMask = preload("res://scripts/shop_asset_mask.gd")
const LiveLayout = preload("res://scripts/plaza_3d_game_layout.gd")
const WALK_SPEED := 3.0
const PLAYER_RADIUS := 0.20
const DEFAULT_VIEW_HEIGHT := 9.0
const ZOOM_STEP := 1.12
const MIN_ZOOM := 0.5 / ZOOM_STEP
const MAX_ZOOM := 2.0

var live_mode := false

@onready var player: CharacterBody3D = $Player
@onready var hero: Hero = $Player/Hero
@onready var camera: Camera3D = $Camera3D
@onready var joystick: Joystick = $Controls/Joystick
@onready var ground: MeshInstance3D = $Ground

var _zoom := 1.0
var _elapsed := 0.0
var _gait := 0.0
var _camera_center := Vector2.ZERO
var _ground_half_size := Vector2.ZERO
var _touches: Dictionary[int, Vector2] = {}
var _pinch_distance := 0.0
var _asset_mask: AssetMask


func _ready() -> void:
	_ground_half_size = (ground.mesh as PlaneMesh).size * 0.5
	hero.material.set_shader_parameter("editor_preview", true)
	_apply_slime_shading()
	_configure_screen_edges()
	_camera_center = Vector2(player.position.x, player.position.z)
	if live_mode:
		$Controls.hide()
		player.hide()
		set_physics_process(false)
		set_process_input(false)
		set_process_unhandled_input(false)
		return
	get_viewport().size_changed.connect(_update_camera)
	_update_camera()
	call_deferred("_maximize_scene_window")


func set_live_active(active: bool) -> void:
	visible = active
	process_mode = Node.PROCESS_MODE_INHERIT if active else Node.PROCESS_MODE_DISABLED
	if active:
		camera.make_current()
	else:
		camera.clear_current(false)
	_asset_mask.set_active(active)


func sync_live(world_position: Vector2, zoom_ratio: float) -> void:
	player.position = LiveLayout.to_world(world_position)
	_zoom = clampf(zoom_ratio, MIN_ZOOM, MAX_ZOOM)
	_update_camera()


func sync_live_slime(world_position: Vector2, shown: bool) -> void:
	var slime: Node3D = $MochiSlime
	slime.position = LiveLayout.to_world(world_position)
	slime.visible = shown


func canvas_projection() -> Transform2D:
	var origin := screen_point(Vector2.ZERO)
	return Transform2D((screen_point(Vector2(64, 0)) - origin) / 256.0,
		(screen_point(Vector2(0, 64)) - origin) / 256.0, origin)


func screen_point(point: Vector2, height: float = 0.0) -> Vector2:
	return camera.unproject_position(LiveLayout.to_world(point, height / absf(camera.basis.y.y)))


func pick(point: Vector2) -> Vector2:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	return LiveLayout.to_logical(origin - direction * (origin.y / direction.y))


func pick_interaction(point: Vector2, world: Node) -> Dictionary:
	var footprint: CollisionShape3D = $Shop/Collision/Footprint
	var shape := footprint.shape as BoxShape3D
	var box := footprint.global_transform * AABB(-shape.size * 0.5, shape.size)
	box.size.y = maxf(box.size.y, 8.0)
	if box.intersects_ray(camera.project_ray_origin(point), camera.project_ray_normal(point)) != null:
		for entity: Dictionary in world.entities:
			if entity.id == "arcana_shop":
				return entity
	return {}


func _apply_slime_shading() -> void:
	var slime: Node3D = $MochiSlime
	# The exported vertex colors bake a continuous gradient over the source green.
	var body_material := ShaderMaterial.new()
	body_material.shader = PIXEL_SHADING
	body_material.set_shader_parameter("paint", Color("659646"))
	for mesh: MeshInstance3D in slime.find_children("*", "MeshInstance3D", true, false):
		if mesh.mesh == null:
			continue
		for surface in mesh.mesh.get_surface_count():
			var paint := mesh.get_active_material(surface) as BaseMaterial3D
			if paint != null and paint.vertex_color_use_as_albedo:
				mesh.set_surface_override_material(surface, body_material)


func _configure_screen_edges() -> void:
	var edges: MeshInstance3D = $Camera3D/ScreenEdges
	var material := edges.material_override as ShaderMaterial
	var view_direction: Vector3 = material.get_shader_parameter("highlight_direction")
	var assets: Array[Node] = [$Shop/Exterior, $MochiSlime]
	var fountain_body := $Fountain/Model.find_child("FountainBody", true, false)
	if fountain_body != null:
		assets.append(fountain_body)
	_asset_mask = AssetMask.new()
	add_child(_asset_mask)
	_asset_mask.setup_assets(assets, camera, material, [&"Exterior", &"MochiSlime", &"FountainBody"],
		camera.global_basis * view_direction, $MochiSlime if live_mode else null)


func _maximize_scene_window() -> void:
	if get_tree().current_scene == self and get_window().mode == Window.MODE_WINDOWED:
		get_window().mode = Window.MODE_MAXIMIZED


func _physics_process(delta: float) -> void:
	var input: Vector2 = joystick.direction
	input.x += float(_pressed(KEY_D, KEY_RIGHT)) - float(_pressed(KEY_A, KEY_LEFT))
	input.y += float(_pressed(KEY_S, KEY_DOWN)) - float(_pressed(KEY_W, KEY_UP))
	var strength := minf(input.length(), 1.0)
	# With the fixed 45-degree camera, project screen input onto the ground.
	input.y /= absf(camera.basis.z.y)
	var previous := Vector2(player.position.x, player.position.z)
	var bounds := _ground_half_size - Vector2.ONE * PLAYER_RADIUS
	var destination := (previous + input.normalized() * strength * WALK_SPEED * delta).clamp(-bounds, bounds)
	var motion := (destination - previous) / delta
	player.velocity = Vector3(motion.x, 0.0, motion.y)
	player.move_and_slide()

	var actual := Vector2(player.position.x, player.position.z) - previous
	_elapsed += delta
	_gait += actual.length() * 3.2
	hero.pose(_elapsed, _gait, actual.length_squared() > 0.000001, actual * 16.0, true, true)
	_update_camera()


func _pressed(primary: Key, alternate: Key) -> bool:
	return Input.is_physical_key_pressed(primary) or Input.is_physical_key_pressed(alternate)


func _update_camera() -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return
	var aspect := viewport_size.x / viewport_size.y
	var pitch_sine := absf(camera.basis.z.y)
	var fit_height := 2.0 * minf(_ground_half_size.x / aspect, _ground_half_size.y * pitch_sine)
	var base_height := minf(DEFAULT_VIEW_HEIGHT, fit_height / ZOOM_STEP)
	camera.size = minf(base_height / _zoom, fit_height)
	var view_extents := Vector2(camera.size * aspect, camera.size / pitch_sine) * 0.5
	var bounds := (_ground_half_size - view_extents).max(Vector2.ZERO)
	var target := Vector2(player.position.x, player.position.z - 0.5)
	var dead_zone := Vector2(0.35, 0.45)
	_camera_center = _camera_center.clamp(target - dead_zone, target + dead_zone).clamp(-bounds, bounds)
	camera.position = Vector3(_camera_center.x, 0.0, _camera_center.y) + camera.basis.z * 24.0
	_asset_mask.sync()


func _change_zoom(factor: float) -> void:
	_zoom = clampf(_zoom * factor, MIN_ZOOM, MAX_ZOOM)
	_update_camera()


func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch and (not event.pressed or event.canceled) and _touches.erase(event.index):
		_pinch_distance = 0.0


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index != MOUSE_BUTTON_WHEEL_UP and event.button_index != MOUSE_BUTTON_WHEEL_DOWN:
			return
		var direction := 1.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else -1.0
		_change_zoom(pow(ZOOM_STEP, direction * event.factor))
	elif event is InputEventMagnifyGesture:
		_change_zoom(event.factor)
	elif event is InputEventKey and event.pressed:
		match event.physical_keycode:
			KEY_EQUAL, KEY_PLUS, KEY_KP_ADD: _change_zoom(ZOOM_STEP)
			KEY_MINUS, KEY_KP_SUBTRACT: _change_zoom(1.0 / ZOOM_STEP)
			KEY_0, KEY_KP_0:
				_zoom = 1.0
				_update_camera()
			KEY_F:
				if not event.echo:
					var window := get_window()
					window.mode = Window.MODE_MAXIMIZED if window.mode == Window.MODE_FULLSCREEN else Window.MODE_FULLSCREEN
			_: return
	elif event is InputEventScreenTouch and event.pressed and not event.canceled:
		if _touches.size() >= 2:
			return
		_touches[event.index] = event.position
		if _touches.size() == 2:
			var points := _touches.values()
			_pinch_distance = points[0].distance_to(points[1])
	elif event is InputEventScreenDrag and _touches.has(event.index):
		_touches[event.index] = event.position
		if _touches.size() == 2:
			var points := _touches.values()
			var distance: float = points[0].distance_to(points[1])
			if distance > 8.0 and _pinch_distance > 8.0:
				_change_zoom(distance / _pinch_distance)
			_pinch_distance = distance
	else:
		return
	get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_touches.clear()
		_pinch_distance = 0.0
