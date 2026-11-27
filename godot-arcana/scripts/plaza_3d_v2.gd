extends Node3D

const Hero = preload("res://scripts/characters/hybrid_v1/billboard_actor.gd")
const NativeHero = preload("res://scripts/characters/hybrid_v1/native_actor.gd")
const Coordinates = preload("res://scripts/native_2d_coordinates.gd")
const Joystick = preload("res://scripts/virtual_joystick.gd")
const PIXEL_SHADING = preload("res://art/resources/arcana_pixel_shading.gdshader")
const SLIME_TARGET_OUTLINE = preload("res://art/resources/slime_target_outline.gdshader")
const AssetMask = preload("res://scripts/shop_asset_mask.gd")
const LiveLayout = preload("res://scripts/plaza_3d_game_layout.gd")
const WorldDisplay = preload("res://scripts/services/world_display_settings.gd")
const WorldPreset := preload("res://scripts/rendering/inn_shader_preset.gd")
const TileStyle := preload("res://scripts/rendering/tile_world_style.gd")
const PAVING_SHADER = preload("res://art/resources/plaza_approach_paving.gdshader")
const WALK_SPEED := 3.0
const PLAYER_RADIUS := 0.20
const CAMERA_DISTANCE := 24.0
const DEFAULT_VIEW_HEIGHT := 9.0
const ZOOM_STEP := 1.12
const MIN_ZOOM := 0.5 / ZOOM_STEP
const MAX_ZOOM := 2.0
const FOLLOW_RESPONSE := 28.0
const SLIME_CROUCH := Vector3(1.23, 0.64, 1.23)
const SLIME_STRETCH := Vector3(0.88, 1.19, 0.88)
const SLIME_LANDING := Vector3(1.32, 0.54, 1.32)
const SLIME_REBOUND := Vector3(0.97, 1.06, 0.97)
const SLIME_RECOVER := Vector3(1.10, 0.86, 1.10)
const SLIME_PAINT := Color("659646")
const SLIME_HIT_PAINT := Color("b5cf7a")
const SLIME_JUMP_HEIGHT := 0.48
const SLIME_HOP_HEIGHT := 0.20
const SLIME_FLEE_HEIGHT := 0.12
const SLIME_LANDING_FX_FRAME_SECONDS := 0.04
const SLIME_DEFEAT_SECONDS := 0.34

var live_mode := false
var camera_texel_offset := Vector2.ZERO

@onready var player: CharacterBody3D = $Player
var hero: Hero
@onready var camera: Camera3D = $Camera3D
@onready var joystick: Joystick = $Controls/Joystick
@onready var ground: MeshInstance3D = $Ground
@onready var river := get_node_or_null("River") as Node3D
@onready var market := get_node_or_null("TerracedMarket") as Node3D
@onready var terraced := river != null and market != null
@onready var pond_surface := get_node_or_null("FishingPond/Water") as MeshInstance3D
@onready var fountain_body := $Fountain/Model.find_child("FountainBody", true, false) as MeshInstance3D
@onready var key_light: DirectionalLight3D = $Lighting/KeyLight
@onready var world_environment: WorldEnvironment = $Lighting/WorldEnvironment
@onready var actor_shadow_root: Node3D = $ActorShadows
@onready var inn: Node3D = $Inn
@onready var inn_door: Marker3D = $Inn/InteractionPoint
@onready var _slime: Node3D = $MochiSlime
@onready var _slime_rest: Transform3D = _slime.transform
@onready var _slime_landing_fx: Sprite3D = $SlimeLandingFX

var _zoom := 1.0
var _elapsed := 0.0
var _river_ripples := true
var _gait := 0.0
var _camera_center := Vector2.ZERO
var _follow_center := Vector2.ZERO
var _reset_live_camera := true
var _last_visible_raster := Vector2.ZERO
var _ground_half_size := Vector2.ZERO
var _ground_center := Vector2.ZERO
var _projected_live_bounds := Rect2()
var _live_nearest_depth := -INF
var _live_highest_point := 0.0
var _visual_building_meshes := {}
var _touches: Dictionary[int, Vector2] = {}
var _pinch_distance := 0.0
var _asset_mask: AssetMask
var _door_lights: Dictionary[OmniLight3D, float] = {}
var _actor_shadows: Dictionary[int, Sprite3D] = {}
var _preview_actor_shadow: Sprite3D
var _approved_preset: WorldPreset
var _pixel_effect: Node3D
var _standalone_presentation: ShaderMaterial
var _presentation_minimum := 2
var _slime_airborne := false
var _slime_grounded_age := 0.3
var _slime_defeat_age := 0.0
var _slime_defeat_ghost: Node3D
var _slime_confirmed_defeat_age := 0.0
var _slime_hit_tint := 0.0
var _slime_landing_fx_age := 0.0
var _slime_body_material: ShaderMaterial
var _slime_outline_material: ShaderMaterial


func _enter_tree() -> void:
	if live_mode:
		# Gameplay draws its own hero. Skip the standalone preview's rig and capture viewport.
		var preview_hero := get_node_or_null("Player/Hero")
		if preview_hero != null:
			preview_hero.free()


func _ready() -> void:
	_ground_half_size = (ground.mesh as PlaneMesh).size * 0.5
	_ground_center = Vector2(ground.position.x, ground.position.z)
	for light: OmniLight3D in [
		$Shop/DoorFill, $Inn/DoorFill, $PlayerHome/DoorFill, $Restaurant/DoorFill, $Academy/DoorFill,
	]:
		_door_lights[light] = light.light_energy
	_visual_building_meshes["arcana_restaurant"] = _visible_building_meshes($Restaurant)
	_visual_building_meshes["arcana_academy"] = _visible_building_meshes($Academy)
	_finish_approach_materials()
	_apply_slime_shading()
	_camera_center = Vector2(player.position.x, player.position.z)
	_follow_center = _camera_center
	if live_mode:
		$Controls.hide()
		player.hide()
		set_physics_process(false)
		set_process_input(false)
		set_process_unhandled_input(false)
		_approved_preset = WorldPreset.load_approved() as WorldPreset
		camera.rotation_degrees = TileStyle.CAMERA_ROTATION_DEGREES
		var floor_corner := _ground_center - _ground_half_size
		var frame_bounds := AABB(Vector3(floor_corner.x, ground.position.y, floor_corner.y),
			Vector3(_ground_half_size.x * 2.0, TileStyle.AVATAR_HEIGHT, _ground_half_size.y * 2.0))
		_projected_live_bounds = TileStyle.projected_bounds(camera.basis, frame_bounds)
		_include_live_depth(frame_bounds)
		var buildings: Array[Node3D] = [$Shop, $Inn, $PlayerHome, $Restaurant, $Academy]
		if terraced: buildings.append(market)
		for building: Node3D in buildings:
			for instance: MeshInstance3D in _visible_building_meshes(building):
				var mesh_bounds := instance.global_transform * instance.get_aabb()
				var visible_bounds := TileStyle.projected_bounds(camera.basis, mesh_bounds)
				_projected_live_bounds = _projected_live_bounds.merge(visible_bounds)
				_include_live_depth(mesh_bounds)
		$Camera3D/ScreenEdges.hide()
		_apply_live_daylight()
		var render_preset := _approved_preset.tile_world_variant() as WorldPreset
		_pixel_effect = render_preset.attach_effect(self, camera)
		return
	hero = $Player/Hero
	hero.material.set_shader_parameter("editor_preview", true)
	var preview_scale := TileStyle.AVATAR_PIXEL_SIZE * Hero.SPEC.PIXELS_PER_UNIT
	var preview_stretch := TileStyle.AVATAR_UPRIGHT_SCALE * absf(camera.basis.y.y)
	hero.scale *= Vector3(preview_scale, preview_scale * preview_stretch, preview_scale)
	_preview_actor_shadow = _create_actor_shadow()
	_sync_actor_shadow(_preview_actor_shadow, hero.actor as NativeHero, to_local(hero.global_position))
	_configure_screen_edges()
	if get_parent() == get_tree().root:
		get_window().content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
		$Controls.layer = 2
		_presentation_minimum = WorldDisplay.pixel_size()
		_standalone_presentation = WorldDisplay.attach_screen_presentation(self)
	get_viewport().size_changed.connect(_update_camera)
	_update_camera()


func _apply_live_daylight() -> void:
	# A camera override keeps the light palette local to the plaza view.
	var environment := world_environment.environment.duplicate() as Environment
	environment.ambient_light_color = Color(0.78, 0.86, 1.0)
	environment.ambient_light_energy = 0.41
	camera.environment = environment
	key_light.light_color = Color(1.0, 0.94, 0.83)
	key_light.light_energy = 0.70


func prepare_presentation_scale(zoom_ratio: float, _viewport_height: float) -> int:
	return TileStyle.presentation_scale(zoom_ratio)


func set_live_active(active: bool) -> void:
	visible = active
	process_mode = Node.PROCESS_MODE_INHERIT if active else Node.PROCESS_MODE_DISABLED
	if active:
		_reset_live_camera = true
		camera.make_current()
	else:
		camera.clear_current(false)
		sync_actor_shadows([], false)
		_slime_airborne = false
		_slime_landing_fx.hide()
		if is_instance_valid(_slime_defeat_ghost):
			_slime_defeat_ghost.hide()
	if _pixel_effect != null:
		_pixel_effect.set_effect_enabled(active and _approved_preset.effect_enabled)
	elif _asset_mask != null:
		_asset_mask.set_active(active)


func sync_live(world_position: Vector2, zoom_ratio: float, visible_raster: Vector2, delta: float, immediate: bool, animate_environment: bool = true) -> void:
	if _river_ripples != animate_environment:
		_river_ripples = animate_environment
		if terraced:
			river.call("set_ripples_enabled", animate_environment)
		elif pond_surface != null:
			var pond_material := pond_surface.get_active_material(0) as ShaderMaterial
			if pond_material != null: pond_material.set_shader_parameter("animate_ripples", animate_environment)
	player.position = _surface_position(world_position)
	_update_door_lights(animate_environment)
	_zoom = zoom_ratio
	if visible_raster != _last_visible_raster:
		_reset_live_camera = true
		_last_visible_raster = visible_raster
	_update_camera(visible_raster, delta, immediate or _reset_live_camera)
	_reset_live_camera = false


func set_slime_target_outline(enabled: bool) -> void:
	var outline: Material = _slime_outline_material if enabled else null
	if _slime_body_material.next_pass != outline:
		_slime_body_material.next_pass = outline


func play_slime_defeat(world_position: Vector2, animate: bool = true) -> void:
	if not animate or not is_visible_in_tree():
		return
	if not is_instance_valid(_slime_defeat_ghost):
		_slime_defeat_ghost = _slime.duplicate(0) as Node3D
		_slime_defeat_ghost.name = "MochiSlimeDefeat"
		var ghost_skin := _slime_body_material.duplicate() as ShaderMaterial
		ghost_skin.next_pass = null
		ghost_skin.set_shader_parameter("paint", SLIME_PAINT)
		for mesh: MeshInstance3D in _slime_defeat_ghost.find_children("*", "MeshInstance3D", true, false):
			if mesh.mesh == null:
				continue
			for surface in mesh.mesh.get_surface_count():
				if mesh.get_surface_override_material(surface) == _slime_body_material:
					mesh.set_surface_override_material(surface, ghost_skin)
		add_child(_slime_defeat_ghost)
	_slime_confirmed_defeat_age = 0.0
	_slime_defeat_ghost.transform = Transform3D(_slime_rest.basis.scaled_local(SLIME_LANDING),
		_surface_position(world_position, _slime_rest.origin.y))
	_slime_defeat_ghost.show()


func _defeat_scale(progress: float) -> Vector3:
	return SLIME_LANDING.lerp(Vector3(0.49, 0.04, 0.49), progress)


func _update_slime_defeat_ghost(animate: bool, delta: float) -> void:
	if not is_instance_valid(_slime_defeat_ghost) or not _slime_defeat_ghost.visible:
		return
	_slime_confirmed_defeat_age += delta
	if not animate or _slime_confirmed_defeat_age >= SLIME_DEFEAT_SECONDS:
		_slime_defeat_ghost.hide()
		return
	var collapse := smoothstep(0.0, SLIME_DEFEAT_SECONDS, _slime_confirmed_defeat_age)
	_slime_defeat_ghost.basis = _slime_rest.basis.scaled_local(_defeat_scale(collapse))


func sync_live_slime(world_position: Vector2, shown: bool, battle: Dictionary,
		jump_progress: float, animate: bool, delta: float, hit: float = 0.0) -> void:
	_update_slime_defeat_ghost(animate, delta)
	_slime.visible = shown
	if not shown:
		_slime_airborne = false
		_slime_grounded_age = 0.3
		_slime_defeat_age = 0.0
		_slime_landing_fx.hide()
		return
	var spatial: Dictionary = battle.get("spatial", {})
	var phase := str(battle.get("phase", ""))
	var behavior := str(spatial.get("behavior", "")) if phase == "battle" else ""
	var step := 0.0 if battle.get("paused", false) else delta
	var action := str(spatial.get("slimeAction", "leap"))
	var jump_from: Dictionary = spatial.get("jumpFrom", {})
	var jump_to: Dictionary = spatial.get("jumpTo", {})
	var start := Vector2(float(jump_from.get("x", world_position.x)), float(jump_from.get("y", world_position.y)))
	var travel := Vector2(float(jump_to.get("x", start.x)), float(jump_to.get("y", start.y))) - start
	var pose_scale := Vector3.ONE
	var lift := 0.0
	var lean := 0.0
	var airborne := false
	var landed := false
	var recovery := 0.0
	if behavior == "recover":
		var duration := maxf(0.001, float(spatial.get("recoveryDuration", 1.0)))
		recovery = clampf(float(spatial.get("recoveryElapsed", 0.0)) / duration, 0.0, 1.0)
	if behavior == "prepare":
		var windup := maxf(0.001, float(spatial.get("windupDuration", 3.0)))
		var remaining := float(battle.get("attackIn", windup))
		var windup_progress := 1.0 - clampf(remaining / windup, 0.0, 1.0)
		var crouch := smoothstep(0.0, 0.68, windup_progress) if animate else 1.0
		pose_scale = Vector3.ONE.lerp(SLIME_CROUCH, crouch)
		if animate and spatial.get("targetLocked", false):
			lean = 0.22 * smoothstep(0.6, 1.0, windup_progress)
	elif behavior in ["attack", "recover"]:
		var progress := jump_progress if behavior == "attack" else 1.0
		# The height arc shares the ground position's network interpolation.
		if travel.length_squared() >= 1.0:
			progress = clampf((world_position - start).dot(travel) / travel.length_squared(), 0.0, 1.0)
		if action in ["hop", "flee"]:
			if animate:
				var arc := 4.0 * progress * (1.0 - progress)
				if action == "flee":
					lift = SLIME_FLEE_HEIGHT * arc
					pose_scale = Vector3.ONE.lerp(SLIME_CROUCH, 0.5 * arc)
					lean = 0.44 * arc
				else:
					lift = SLIME_HOP_HEIGHT * arc
					pose_scale = Vector3.ONE.lerp(SLIME_STRETCH, 0.4 * arc)
		elif progress < 0.995:
			airborne = true
			_slime_grounded_age = 0.0
			if animate:
				pose_scale = SLIME_CROUCH.lerp(SLIME_STRETCH, smoothstep(0.0, 0.18, progress))
				pose_scale = pose_scale.lerp(SLIME_LANDING, smoothstep(0.78, 1.0, progress))
				lift = SLIME_JUMP_HEIGHT * 4.0 * progress * (1.0 - progress)
				lean = 0.22 * (1.0 - smoothstep(0.6, 1.0, progress))
			else:
				pose_scale = SLIME_STRETCH
		else:
			landed = _slime_airborne
			# Use displayed contact time so a delayed packet doesn't skip the squash.
			_slime_grounded_age = 0.0 if landed else _slime_grounded_age + step
			if animate:
				var rebound := smoothstep(0.07, 0.17, _slime_grounded_age)
				pose_scale = SLIME_LANDING.lerp(SLIME_REBOUND, rebound)
				pose_scale = pose_scale.lerp(SLIME_RECOVER, smoothstep(0.17, 0.32, _slime_grounded_age))
				pose_scale = pose_scale.lerp(Vector3.ONE, rebound * smoothstep(0.60, 1.0, recovery))
			else:
				pose_scale = SLIME_LANDING.lerp(Vector3.ONE, recovery)
	if phase == "victory" and battle.get("online", false):
		# The confirmed event owns the old body's pose, independent of the next spawn.
		_slime.hide()
	elif phase == "victory" and animate:
		_slime_defeat_age += step
		var collapse := smoothstep(0.0, SLIME_DEFEAT_SECONDS, _slime_defeat_age)
		pose_scale = _defeat_scale(collapse)
		_slime.visible = collapse < 1.0
	else:
		_slime_defeat_age = 0.0
	var hit_tint := hit if animate and phase != "victory" else 0.0
	if not is_equal_approx(_slime_hit_tint, hit_tint):
		_slime_hit_tint = hit_tint
		_slime_body_material.set_shader_parameter("paint", SLIME_PAINT.lerp(SLIME_HIT_PAINT, hit_tint))
	pose_scale *= Vector3(1.0 + hit_tint * 0.06, 1.0 - hit_tint * 0.11, 1.0 + hit_tint * 0.06)
	var basis := _slime_rest.basis.scaled_local(pose_scale)
	var heading := travel.normalized()
	basis.y += Vector3(heading.x, 0.0, heading.y) * lean * basis.y.length()
	var pose := Transform3D(basis, _surface_position(world_position, _slime_rest.origin.y + lift))
	if _slime.transform != pose: _slime.transform = pose
	_slime_airborne = airborne
	if not animate or phase == "victory":
		_slime_landing_fx.hide()
	elif landed:
		# Start on the same rendered frame as the squash. The burst stays at the contact point.
		_slime_landing_fx.position = _surface_position(start + travel, _slime_rest.origin.y + 0.04)
		_slime_landing_fx_age = 0.0
		_slime_landing_fx.frame = 0
		_slime_landing_fx.show()
	elif _slime_landing_fx.visible:
		_slime_landing_fx_age += step
		var frame := int(_slime_landing_fx_age / SLIME_LANDING_FX_FRAME_SECONDS)
		if frame < _slime_landing_fx.hframes:
			_slime_landing_fx.frame = frame
		else:
			_slime_landing_fx.hide()


func _update_door_lights(enabled: bool) -> void:
	for light: OmniLight3D in _door_lights:
		var energy: float = _door_lights[light]
		if enabled:
			# Measure from the threshold in the building's own facing direction.
			var offset := light.to_local(player.global_position)
			var distance := Vector2(offset.x * 1.5, offset.z).length()
			var proximity := 1.0 - smoothstep(1.0, 4.0, distance)
			var in_front := smoothstep(-0.8, 0.0, offset.z)
			energy *= 1.0 + 0.8 * proximity * in_front
		if not is_equal_approx(light.light_energy, energy):
			light.light_energy = energy


func sync_actor_shadows(actors: Array[Node2D], enabled: bool) -> void:
	if key_light.shadow_enabled != enabled:
		key_light.shadow_enabled = enabled
	var current: Dictionary[int, bool] = {}
	if enabled:
		for actor in actors:
			if not is_instance_valid(actor) or actor.is_queued_for_deletion() or not actor is NativeHero:
				continue
			var source := actor as NativeHero
			var id := source.get_instance_id()
			current[id] = true
			if not _actor_shadows.has(id):
				_actor_shadows[id] = _create_actor_shadow()
			var logical_foot: Vector2 = source.get_meta("plaza_foot", Coordinates.logical(source.position))
			var anchor := _surface_position(logical_foot)
			_sync_actor_shadow(_actor_shadows[id], source, anchor)
	for id in _actor_shadows.keys():
		if not current.has(id):
			_actor_shadows[id].hide()
			_actor_shadows[id].queue_free()
			_actor_shadows.erase(id)


func _create_actor_shadow() -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.name = "ActorShadow"
	sprite.centered = false
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY
	sprite.rotation.y = camera.rotation.y
	TileStyle.apply_avatar_size(sprite)
	actor_shadow_root.add_child(sprite, true)
	return sprite


func _sync_actor_shadow(sprite: Sprite3D, source: NativeHero, anchor: Vector3) -> void:
	var texture := source.get_live_texture()
	if texture == null or not source.is_visible_in_tree():
		sprite.hide()
		return
	if sprite.texture != texture:
		sprite.texture = texture
	var foot := source.capture_anchor()
	var offset := Vector2(-foot.x, foot.y - texture.get_height())
	if sprite.offset != offset:
		sprite.offset = offset
	sprite.position = anchor + Vector3.UP * 0.01
	sprite.show()


func input_projection() -> Transform2D:
	return _approved_preset.input_projection(camera)


func overlay_height_scale() -> float:
	return _approved_preset.projected_height_scale(camera)


func canvas_projection() -> Transform2D:
	var origin := screen_point(Vector2.ZERO)
	return Transform2D((screen_point(Vector2(64, 0)) - origin) / 256.0,
		(screen_point(Vector2(0, 64)) - origin) / 256.0, origin)


func _surface_position(point: Vector2, height: float = 0.0) -> Vector3:
	var position_3d := LiveLayout.to_world(point, height)
	if terraced:
		position_3d.y += LiveLayout.Terraces.ground_height(Vector2(position_3d.x, position_3d.z))
	return position_3d


func ground_height_at(point: Vector2) -> float:
	return _surface_position(point).y


func screen_point(point: Vector2, height: float = 0.0) -> Vector2:
	return camera.unproject_position(_surface_position(point, height / absf(camera.basis.y.y)))


func pick(point: Vector2) -> Vector2:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	if terraced: return LiveLayout.to_logical(LiveLayout.Terraces.pick(origin, direction))
	return LiveLayout.to_logical(origin - direction * (origin.y / direction.y))


func pick_interaction(point: Vector2, world: Node) -> Dictionary:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var shop_distance := _building_pick_distance($Shop/Collision/Footprint, origin, direction, 8.0)
	var inn_distance := _building_pick_distance($Inn/Collision/Footprint, origin, direction)
	var closest := minf(shop_distance, inn_distance)
	var target_id := "arcana_shop" if shop_distance <= inn_distance else "arcana_inn"
	var home_distance := _building_pick_distance($PlayerHome/Collision/Footprint, origin, direction)
	if home_distance < closest:
		closest = home_distance
		target_id = "arcana_home"
	for id: String in _visual_building_meshes:
		var distance := _visual_pick_distance(_visual_building_meshes[id], origin, direction)
		if distance < closest:
			closest = distance
			target_id = id
	# Dynamic campfires use the same ground anchors as their projected sprites.
	for entity: Dictionary in world.entities:
		if entity.kind != "campfire": continue
		var base := _surface_position(entity.pos)
		var hit: Variant = AABB(base - Vector3(0.55, 0.0, 0.55), Vector3(1.1, 0.8, 1.1)).intersects_ray(origin, direction)
		if hit is Vector3 and origin.distance_squared_to(hit) < closest:
			closest = origin.distance_squared_to(hit)
			target_id = str(entity.id)
	if is_inf(closest): return {}
	for entity: Dictionary in world.entities:
		if entity.id == target_id:
			return entity
	return {}


func _building_pick_distance(footprint: CollisionShape3D, origin: Vector3, direction: Vector3, height: float = 0.0) -> float:
	var shape := footprint.shape as BoxShape3D
	var box := footprint.global_transform * AABB(-shape.size * 0.5, shape.size)
	box.size.y = maxf(box.size.y, height)
	var hit: Variant = box.intersects_ray(origin, direction)
	return origin.distance_squared_to(hit) if hit is Vector3 else INF


func _visible_building_meshes(building: Node3D) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	for instance: MeshInstance3D in building.find_children("*", "MeshInstance3D", true, false):
		if instance.mesh == null or not instance.is_visible_in_tree():
			continue
		if instance.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY:
			result.append(instance)
	return result


func _visual_pick_distance(meshes: Array[MeshInstance3D], origin: Vector3, direction: Vector3) -> float:
	var closest := INF
	# Roof and facade geometry can be taller or wider than the separate walk footprint.
	for instance in meshes:
		var pose := instance.global_transform
		var inverse := pose.affine_inverse()
		var hit: Variant = instance.get_aabb().intersects_ray(inverse * origin, inverse.basis * direction)
		if hit is Vector3:
			closest = minf(closest, origin.distance_squared_to(pose * hit))
	return closest


func _finish_approach_materials() -> void:
	var fountain_pos: Vector3 = $Fountain.global_position
	var door_pos := inn_door.global_position
	var route := Vector4(fountain_pos.x, fountain_pos.z, door_pos.x, door_pos.z)
	for instance: MeshInstance3D in $StonePaving.find_children("*", "MeshInstance3D", true, false):
		for surface in instance.mesh.get_surface_count():
			var original := instance.get_active_material(surface) as BaseMaterial3D
			if original == null:
				continue
			var paving := ShaderMaterial.new()
			paving.shader = PAVING_SHADER
			paving.set_meta("arcana_edge_cull_mode", BaseMaterial3D.CULL_BACK)
			paving.set_shader_parameter("stone_color", original.albedo_color)
			paving.set_shader_parameter("approach", route)
			instance.set_surface_override_material(surface, paving)

	# A lit oak frame around the inset door stays readable as the camera pulls back.
	var entrance_colors := {"Oak trim": Color("#ad784c"), "Honeyed oak": Color("#895632"),
		"Dark inset oak": Color("#503731"), "Pale hand-cut stone edges": Color("#dec49d")}
	for instance: MeshInstance3D in $Inn/Exterior.find_children("*", "MeshInstance3D", true, false):
		if instance.name not in [&"Oak guest door", &"Entrance arch and limestone step"]:
			continue
		for surface in instance.mesh.get_surface_count():
			var original := instance.get_active_material(surface) as BaseMaterial3D
			if original != null and entrance_colors.has(original.resource_name):
				var trim := original.duplicate() as BaseMaterial3D
				trim.albedo_color = entrance_colors[original.resource_name]
				instance.set_surface_override_material(surface, trim)


func _apply_slime_shading() -> void:
	# The exported vertex colors bake a continuous gradient over the source green.
	_slime_body_material = ShaderMaterial.new()
	_slime_body_material.shader = PIXEL_SHADING
	_slime_body_material.set_shader_parameter("paint", SLIME_PAINT)
	if live_mode:
		# The moving slime shades its own rim and does not invalidate the scenery cache.
		_slime.set_meta(&"local_mesh_highlights", true)
		_slime_body_material.set_shader_parameter("rim_strength", TileStyle.HIGHLIGHT_STRENGTH)
		_slime_outline_material = ShaderMaterial.new()
		_slime_outline_material.shader = SLIME_TARGET_OUTLINE
	for mesh: MeshInstance3D in _slime.find_children("*", "MeshInstance3D", true, false):
		if mesh.mesh == null:
			continue
		for surface in mesh.mesh.get_surface_count():
			var paint := mesh.get_active_material(surface) as BaseMaterial3D
			if paint != null and paint.vertex_color_use_as_albedo:
				mesh.set_surface_override_material(surface, _slime_body_material)


func _configure_screen_edges() -> void:
	var edges: MeshInstance3D = $Camera3D/ScreenEdges
	var material := edges.material_override as ShaderMaterial
	if get_parent() == get_tree().root:
		material.set_shader_parameter("screen_pixel_size", 1)
	var view_direction: Vector3 = material.get_shader_parameter("highlight_direction")
	var assets: Array[Node] = [$Shop/Exterior, $MochiSlime, $Inn, $PlayerHome]
	var fountain_body := $Fountain/Model.find_child("FountainBody", true, false)
	if fountain_body != null:
		assets.append(fountain_body)
	_asset_mask = AssetMask.new()
	add_child(_asset_mask)
	_asset_mask.setup_assets(assets, camera, material, [&"Exterior", &"MochiSlime", &"Inn", &"FountainBody", &"PlayerHome"],
		camera.global_basis * view_direction)


func _physics_process(delta: float) -> void:
	var input: Vector2 = joystick.direction
	input.x += float(_pressed(KEY_D, KEY_RIGHT)) - float(_pressed(KEY_A, KEY_LEFT))
	input.y += float(_pressed(KEY_S, KEY_DOWN)) - float(_pressed(KEY_W, KEY_UP))
	var strength := minf(input.length(), 1.0)
	# With the fixed 45-degree camera, project screen input onto the ground.
	input.y /= absf(camera.basis.z.y)
	var previous := Vector2(player.position.x, player.position.z)
	var bounds := _ground_half_size - Vector2.ONE * PLAYER_RADIUS
	var destination := (previous + input.normalized() * strength * WALK_SPEED * delta).clamp(
		_ground_center - bounds, _ground_center + bounds)
	# Match the gameplay footprints in the standalone 3D preview.
	if terraced:
		var stepped := previous
		for step: Vector2 in [Vector2(destination.x - previous.x, 0.0), Vector2(0.0, destination.y - previous.y)]:
			var blocked := false
			for box: Rect2 in LiveLayout.Terraces.blockers:
				if box.grow(PLAYER_RADIUS).has_point(stepped + step):
					blocked = true
					break
			if not blocked: stepped += step
		destination = stepped
	var motion := (destination - previous) / delta
	player.velocity = Vector3(motion.x, 0.0, motion.y)
	player.move_and_slide()
	if terraced: player.position.y = LiveLayout.Terraces.ground_height(Vector2(player.position.x, player.position.z))
	_update_door_lights(true)

	var actual := Vector2(player.position.x, player.position.z) - previous
	_elapsed += delta
	_gait += actual.length() * 3.2
	hero.pose(_elapsed, _gait, actual.length_squared() > 0.000001, actual * 16.0, true, true)
	_sync_actor_shadow(_preview_actor_shadow, hero.actor as NativeHero, to_local(hero.global_position))
	_update_camera()


func _pressed(primary: Key, alternate: Key) -> bool:
	return Input.is_physical_key_pressed(primary) or Input.is_physical_key_pressed(alternate)


func _preview_view_height(aspect: float, zoom_ratio: float) -> float:
	var pitch_sine := absf(camera.basis.z.y)
	var fit_height := 2.0 * minf(_ground_half_size.x / aspect, _ground_half_size.y * pitch_sine)
	var base_height := minf(DEFAULT_VIEW_HEIGHT, fit_height / ZOOM_STEP)
	return minf(base_height / clampf(zoom_ratio, MIN_ZOOM, MAX_ZOOM), fit_height)


func _update_camera(visible_raster: Vector2 = Vector2.ZERO, delta: float = 0.0, immediate: bool = false) -> void:
	var viewport_size := get_viewport().get_visible_rect().size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		return
	var visible_size := visible_raster if visible_raster != Vector2.ZERO else viewport_size
	var aspect := visible_size.x / visible_size.y
	var texel_size: float
	if live_mode:
		texel_size = TileStyle.world_texel_size(_zoom)
	else:
		texel_size = _preview_view_height(aspect, _zoom) / visible_size.y
	camera.size = texel_size * viewport_size.y
	var effective_size := 1
	if _standalone_presentation != null:
		var projected_actor_pixel := TileStyle.AVATAR_PIXEL_SIZE / texel_size
		effective_size = WorldDisplay.camera_pixel_size(_presentation_minimum, projected_actor_pixel)
		if _standalone_presentation.get_shader_parameter("pixel_size") != effective_size:
			_standalone_presentation.set_shader_parameter("pixel_size", effective_size)
	var coverage := visible_size * texel_size
	var focus := _live_camera_focus(coverage, delta, immediate) if live_mode else _preview_camera_focus(coverage)
	var distance := _live_camera_distance(focus) if live_mode else CAMERA_DISTANCE
	var desired_position := focus + camera.basis.z * distance
	camera_texel_offset = Vector2.ZERO
	if live_mode and not _approved_preset.effect_enabled:
		camera.position = desired_position
	elif visible_raster != Vector2.ZERO:
		camera_texel_offset = WorldDisplay.snap_orthographic_camera(camera, desired_position, texel_size, viewport_size)
	elif _standalone_presentation != null:
		var residual := WorldDisplay.snap_orthographic_camera(camera, desired_position, texel_size * effective_size, viewport_size / effective_size)
		_standalone_presentation.set_shader_parameter("pixel_offset", (residual * effective_size + Vector2.ONE * 0.5).floor())
	else:
		camera.position = desired_position
	if _pixel_effect != null:
		_pixel_effect.sync()
	elif _asset_mask != null:
		_asset_mask.sync()


func _include_live_depth(bounds: AABB) -> void:
	var forward := camera.basis.z
	var center := bounds.get_center().dot(forward)
	var half_depth := bounds.size.dot(forward.abs()) * 0.5
	_live_nearest_depth = maxf(_live_nearest_depth, center + half_depth)
	_live_highest_point = maxf(_live_highest_point, bounds.end.y)


func _live_camera_distance(focus: Vector3) -> float:
	var basis := camera.basis
	var pitch_sine := absf(basis.z.y)
	# The bottom ray reaches the near edge of the plaza. Include the raster border.
	var bottom_rise := camera.size * absf(basis.y.y) * 0.5
	var clip_margin := camera.near + 0.1
	var ground_distance := (ground.position.y - focus.y + bottom_rise) / pitch_sine + clip_margin
	if ground_distance <= CAMERA_DISTANCE:
		return CAMERA_DISTANCE
	var roof_distance := (maxf(_live_highest_point, ground.position.y) - focus.y + bottom_rise) / pitch_sine
	var near_depth := minf(roof_distance, _live_nearest_depth - focus.dot(basis.z))
	return maxf(CAMERA_DISTANCE, near_depth + clip_margin)


func _bridge_view_lead(coverage: Vector2, player_focus: Vector3) -> Vector2:
	if not terraced: return Vector2.ZERO
	var bridge: Rect2 = LiveLayout.Terraces.bridge
	var along := player.position.z - bridge.position.y
	var lateral := absf(player.position.x - bridge.get_center().x)
	var weight := (1.0 - smoothstep(bridge.size.x * 0.5, bridge.size.x * 0.85, lateral))
	weight *= smoothstep(-5.0, -1.0, along) * (1.0 - smoothstep(1.0, 6.0, along))
	if weight <= 0.0 or fountain_body == null:
		return Vector2.ZERO
	var bounds := fountain_body.get_aabb()
	var crown := bounds.get_center()
	crown.y = bounds.end.y
	var offset := fountain_body.to_global(crown) - to_global(player_focus)
	var basis := camera.global_basis
	var half_view := coverage * 0.5
	# Only lead far enough to reveal the crown, keeping the avatar's feet in frame.
	var landmark := Vector2(offset.dot(basis.x), offset.dot(basis.y))
	var inset := Vector2(minf(2.4, half_view.x * 0.45), 0.49)
	var safe_edges := (half_view - inset).max(Vector2.ZERO)
	var lead := landmark - landmark.clamp(-safe_edges, safe_edges)
	var half_actor := Vector2(0.45, TileStyle.AVATAR_HEIGHT * absf(basis.y.y) * 0.5)
	var maximum := (half_view - half_actor - Vector2(0.3, 0.13)).max(Vector2.ZERO)
	return lead.clamp(-maximum, maximum) * weight


func _live_camera_focus(coverage: Vector2, delta: float, immediate: bool) -> Vector3:
	var basis := camera.basis
	var player_focus := player.position + Vector3.UP * TileStyle.AVATAR_HEIGHT * 0.5
	var bridge_lead := _bridge_view_lead(coverage, player_focus)
	var target := Vector2(player_focus.dot(basis.x), player_focus.dot(basis.y)) + bridge_lead
	var projected_hero_height := TileStyle.AVATAR_HEIGHT * absf(basis.y.y)
	var dead_zone := Vector2(0.35, minf(0.45 * absf(basis.z.y),
		maxf(0.0, coverage.y - projected_hero_height) * 0.5))
	dead_zone *= 1.0 - smoothstep(0.0, 1.0, bridge_lead.length())
	# Clamp in camera axes so the view follows both sides of the rotated ground.
	var center := _projected_live_bounds.get_center()
	var travel := (_projected_live_bounds.size - coverage).max(Vector2.ZERO) * 0.5
	_follow_center = target if _reset_live_camera else _follow_center.clamp(target - dead_zone, target + dead_zone)
	_follow_center = _follow_center.clamp(center - travel, center + travel)
	if immediate:
		_camera_center = _follow_center
	else:
		_camera_center = _camera_center.lerp(_follow_center, 1.0 - exp(-FOLLOW_RESPONSE * delta))
		_camera_center = _camera_center.clamp(center - travel, center + travel)
		if _camera_center.distance_squared_to(_follow_center) < 0.00000001:
			_camera_center = _follow_center
	return basis.x * _camera_center.x + basis.y * _camera_center.y + basis.z * player_focus.dot(basis.z)


func _preview_camera_focus(coverage: Vector2) -> Vector3:
	var pitch_sine := absf(camera.basis.z.y)
	var view_extents := Vector2(coverage.x, coverage.y / pitch_sine) * 0.5
	var bounds := (_ground_half_size - view_extents).max(Vector2.ZERO)
	var target := Vector2(player.position.x, player.position.z - 0.5)
	var dead_zone := Vector2(0.35, 0.45)
	_follow_center = _follow_center.clamp(target - dead_zone, target + dead_zone).clamp(
		_ground_center - bounds, _ground_center + bounds)
	return Vector3(_follow_center.x, 0.0, _follow_center.y)


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
