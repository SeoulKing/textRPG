@tool
extends Node3D

const Layout = preload("res://scripts/shop_layout_2d.gd")
const Hero = preload("res://scripts/native_2d_hero.gd")
const WorldDisplay = preload("res://scripts/services/world_display_settings.gd")
const AstraLook = preload("res://scripts/shop_astra_look.gd")
const ASTRA_EDGE_SHADER = preload("res://art/resources/shop_astra_edges.gdshader")
const HERO_OUTLINE_SHADER = preload("res://art/resources/shop_hero_outline.gdshader")
const ASTRA_SUN_DIRECTION := Vector3(1.0, -0.40, -0.22)
const ASTRA_SUN_COLOR := Color("fff2da")
const ASTRA_SUN_ENERGY := 0.35
const ShopAssetMask = preload("res://scripts/shop_asset_mask.gd")
const CubeShader = preload("res://art/resources/shop_test_cube.gdshader")
const MerchantTexture = preload("res://art/export/shop-2d/merchant.png")
const CAMERA_DISTANCE = 24.0
const REAR_WALL_HEIGHT = 3.61

@export var outlined_assets: Array[StringName] = []

@onready var geometry: Node3D = $Geometry
@onready var test_cube: Node3D = $Geometry/PixelTestCube
@onready var camera: Camera3D = $Camera3D
@onready var _screen_edges: MeshInstance3D = $Camera3D/ScreenEdges
@onready var _legacy_edges := _screen_edges.material_override as ShaderMaterial
@onready var ceiling_light: OmniLight3D = $OverheadFill
@onready var crate_accent_light: OmniLight3D = $CrateAccentLight
@onready var actors: Node3D = $Actors
@onready var merchant: Sprite3D = $Actors/Merchant
@onready var avatar: Sprite3D = $Actors/Player

var layout: Dictionary
var remote_sprites: Dictionary
var preview_hero: Node2D
var preview_point := Vector2.ZERO
var preview_age := 0.0
var preview_direction := Vector2.DOWN
var preview_zoom := 1.0
var pixel_preview := false
var preview_visible_raster := Vector2.ZERO
var camera_texel_offset := Vector2.ZERO
var asset_mask: ShopAssetMask
var _camera_focus := Vector2.ZERO
var _camera_focus_ready := false
var _world_pixel_step := 0.0
var _astra_edges: ShaderMaterial
var _astra_debug_mode := AstraLook.DebugMode.BEAUTY
var _cube_materials: Array[ShaderMaterial] = []
var presentation_minimum := 0
var presentation_pixel_size := 1
var _standalone_presentation: ShaderMaterial


func _ready() -> void:
	var standalone := not Engine.is_editor_hint() and get_parent() == get_tree().root
	if standalone:
		# F6 uses the size of the game window, including the editor's embedded view.
		get_window().content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	_screen_edges.visible = not Engine.is_editor_hint()
	geometry.astra_debug_mode_changed.connect(_update_astra_edges_debug_mode)
	if layout.is_empty():
		layout = Layout.load_layout()
	if not _rebuild_room(layout):
		return

	_apply_cube_palette(test_cube)
	_configure_lighting()
	geometry.set_pixel_lighting(true)

	_setup_sprite(merchant)
	merchant.texture = MerchantTexture
	_set_anchor(merchant, Vector2(48, 116))
	_setup_sprite(avatar)
	avatar.hide()
	preview_point = layout.markers.arrival
	_frame(preview_point, 1.0)

	if standalone:
		presentation_minimum = WorldDisplay.pixel_size()
		_standalone_presentation = WorldDisplay.attach_screen_presentation(self)
		enable_walkable_preview(true)
		get_viewport().size_changed.connect(_update_preview_frame)
		_update_preview_frame()
	else:
		set_physics_process(false)


func _update_preview_frame() -> void:
	_frame(preview_point, preview_zoom, pixel_preview, preview_visible_raster)


func enable_walkable_preview(snap_to_pixels: bool = false) -> void:
	pixel_preview = snap_to_pixels
	preview_hero = Hero.new()
	add_child(preview_hero)
	preview_hero.hide()
	set_physics_process(true)


func refresh_layout(next_layout: Dictionary) -> void:
	if next_layout != layout and _rebuild_room(next_layout):
		_configure_lighting()


func _configure_lighting() -> void:
	var sun: DirectionalLight3D = $Sun
	ceiling_light.visible = not geometry.astra_active
	crate_accent_light.visible = not geometry.astra_active
	if geometry.astra_active:
		test_cube.hide()
		var profile := AstraLook.DEFAULT_PROFILE
		var direction: Vector3 = profile.get_meta("sun_direction", ASTRA_SUN_DIRECTION)
		sun.look_at(sun.global_position + direction, Vector3.UP)
		sun.light_color = profile.get_meta("sun_color", ASTRA_SUN_COLOR)
		sun.light_energy = float(profile.get_meta("sun_energy", ASTRA_SUN_ENERGY))
		return

	var imported_sun: DirectionalLight3D = geometry.authored_sun
	if imported_sun != null:
		sun.global_transform = imported_sun.global_transform
		sun.light_color = imported_sun.light_color
		sun.light_energy = float(imported_sun.get_meta("extras", {}).get("godot_energy", sun.light_energy))
	elif not geometry.authored_scene_active:
		sun.look_at(sun.global_position + Vector3(1.0, -0.52, 0.23), Vector3.UP)
		sun.light_color = Color("fff2da")
		sun.light_energy = 0.58
	var ray_direction := -sun.global_basis.z
	var edge_material := $Camera3D/ScreenEdges.material_override as ShaderMaterial
	edge_material.set_shader_parameter("shadow_direction", Vector2(ray_direction.x, ray_direction.z).normalized())
	var light_position := ceiling_light.global_position
	if asset_mask != null:
		asset_mask.set_light(light_position, ceiling_light.omni_range)
	edge_material.set_shader_parameter("asset_outline_width", 1)
	edge_material.set_shader_parameter("asset_highlight_width", 1)
	edge_material.set_shader_parameter("asset_highlight_strength", 0.75)
	edge_material.set_shader_parameter("cube_preview", test_cube.visible)
	edge_material.set_shader_parameter("world_to_cube", test_cube.global_transform.affine_inverse())
	edge_material.set_shader_parameter("cube_highlight_width", 1)
	edge_material.set_shader_parameter("cube_highlight_strength", 0.75)
	set_cube_light(ceiling_light, float(ceiling_light.visible))


func _apply_cube_palette(node: Node) -> void:
	if node is MeshInstance3D and node.mesh != null:
		for surface in node.mesh.get_surface_count():
			var paint := node.get_active_material(surface) as BaseMaterial3D
			if paint == null:
				continue
			var material := ShaderMaterial.new()
			material.shader = CubeShader
			material.set_shader_parameter("paint", paint.albedo_color)
			node.set_surface_override_material(surface, material)
			_cube_materials.append(material)
	for child in node.get_children():
		_apply_cube_palette(child)


func set_cube_stepped_light(enabled: bool) -> void:
	for material in _cube_materials:
		material.set_shader_parameter("stepped_light", enabled)


func set_cube_light(light: OmniLight3D, level: float) -> void:
	var local := test_cube.to_local(light.global_position)
	_legacy_edges.set_shader_parameter("cube_light_local", Vector4(local.x, local.y, local.z, light.omni_range))
	_legacy_edges.set_shader_parameter("cube_light_level", level)


func _rebuild_room(next_layout: Dictionary) -> bool:
	if not next_layout.get("valid", false):
		push_error("Cannot build 3D shop: " + str(next_layout.get("errors", [])))
		return false
	layout = next_layout
	geometry.rebuild(layout)
	if geometry.astra_active:
		if _astra_edges == null:
			_astra_edges = ShaderMaterial.new()
			_astra_edges.shader = ASTRA_EDGE_SHADER
			_astra_edges.render_priority = -100
			_astra_edges.set_shader_parameter("outline_strength",
				float(AstraLook.DEFAULT_PROFILE.get_meta("outline_strength", 0.13)))
			_astra_edges.set_shader_parameter("debug_mode", _astra_debug_mode)
		_screen_edges.material_override = _astra_edges
		if asset_mask != null:
			asset_mask.set_active(false)
	else:
		_screen_edges.material_override = _legacy_edges
		_configure_room_palette()
		if not Engine.is_editor_hint():
			if asset_mask == null:
				asset_mask = ShopAssetMask.new()
				add_child(asset_mask)
				visibility_changed.connect(asset_mask.sync)
			asset_mask.setup(geometry, camera, _legacy_edges, outlined_assets)
	merchant.position = _space(layout.markers.actor)
	return true


func set_astra_debug_mode(mode: AstraLook.DebugMode) -> void:
	geometry.set_astra_debug_mode(mode)


func _update_astra_edges_debug_mode(mode: AstraLook.DebugMode) -> void:
	_astra_debug_mode = mode
	if _astra_edges != null:
		_astra_edges.set_shader_parameter("debug_mode", mode)


func _configure_room_palette() -> void:
	var material := $Camera3D/ScreenEdges.material_override as ShaderMaterial
	var bounds: Rect2 = geometry.floor_bounds
	material.set_shader_parameter("room_bounds", Vector4(bounds.position.x, bounds.position.y, bounds.size.x, bounds.size.y))
	var counter: AABB = geometry.interaction_bounds.get("merchant", AABB())
	var center := counter.get_center()
	material.set_shader_parameter("counter_center", Vector2(center.x, center.z))
	var lamp: Vector3 = geometry.lamp_foot()
	material.set_shader_parameter("lamp_contact", Vector4(lamp.x + 0.07, lamp.z + 0.08, 0.46, 0.40))
	var crate: Node3D = geometry.wooden_crate
	var crate_patch := Vector4.ZERO
	if crate.visible:
		var at := crate.global_position
		crate_patch = Vector4(at.x + 0.07, at.z + 0.08, 0.64, 0.51)
	material.set_shader_parameter("crate_contact", crate_patch)


func _physics_process(delta: float) -> void:
	if not is_instance_valid(preview_hero):
		return
	var direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if direction == Vector2.ZERO:
		direction.x = float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A))
		direction.y = float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
		direction = direction.normalized()
	var movement := direction * minf(delta, 0.033) * 48.0
	var previous_point := preview_point
	for step in [Vector2(movement.x, 0.0), Vector2(0.0, movement.y)]:
		if Layout.can_stand(layout, preview_point + step):
			preview_point += step
	preview_age += delta
	if direction != Vector2.ZERO:
		preview_direction = direction
	var traveled := preview_point - previous_point
	preview_hero.pose(preview_age, 0.0, not traveled.is_zero_approx(), traveled, true, true, false, preview_direction)
	_update_preview_frame()
	_sync_actor(avatar, preview_hero, preview_point)


func sync(world: Node, source: Node, zoom_ratio: float, pixelated: bool = false, visible_raster: Vector2 = Vector2.ZERO) -> void:
	$Sun.shadow_enabled = world.effects_enabled
	ceiling_light.shadow_enabled = world.effects_enabled
	crate_accent_light.shadow_enabled = world.effects_enabled
	$Camera3D/ScreenEdges.visible = pixelated
	if asset_mask != null:
		asset_mask.set_active(pixelated and not geometry.astra_active)
	geometry.set_pixel_lighting(pixelated)
	_frame(world.player_position, zoom_ratio, pixelated, visible_raster)
	_sync_actor(avatar, source, world.player_position)


func sync_remote(id: String, source: Node, point: Vector2) -> void:
	if not remote_sprites.has(id):
		var sprite := Sprite3D.new()
		_setup_sprite(sprite)
		actors.add_child(sprite)
		remote_sprites[id] = sprite
	_sync_actor(remote_sprites[id], source, point)


func remove_remote(id: String) -> void:
	if remote_sprites.has(id):
		remote_sprites[id].hide()
		remote_sprites[id].queue_free()
		remote_sprites.erase(id)


func _setup_sprite(sprite: Sprite3D) -> void:
	# The actor faces the fixed shop camera from a vertical plane.
	# An upright quad gives each pixel its own depth above the foot anchor.
	sprite.billboard = BaseMaterial3D.BILLBOARD_DISABLED
	# Preserve the projected height at the camera's fixed pitch.
	sprite.scale.y = 1.0 / cos(camera.rotation.x)
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.pixel_size = 1.0 / Layout.PPU
	sprite.centered = false
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON


func _sync_actor(sprite: Sprite3D, source: Node, point: Vector2) -> void:
	var texture: Texture2D = source.get_live_texture()
	if texture == null:
		sprite.hide()
		return
	if sprite.texture != texture:
		sprite.texture = texture
	var hero_material := sprite.material_override as ShaderMaterial
	if source.get_meta("model_outline", false):
		if hero_material == null or hero_material.shader != HERO_OUTLINE_SHADER:
			hero_material = ShaderMaterial.new()
			hero_material.shader = HERO_OUTLINE_SHADER
			sprite.material_override = hero_material
		if hero_material.get_shader_parameter("avatar_texture") != texture:
			hero_material.set_shader_parameter("avatar_texture", texture)
		var outline_width := float(presentation_pixel_size if presentation_minimum > 0 else 0)
		if hero_material.get_shader_parameter("outline_screen_pixels") != outline_width:
			hero_material.set_shader_parameter("outline_screen_pixels", outline_width)
		var source_material := source.get("sprite_material") as ShaderMaterial
		if source_material != null:
			var hurt: Variant = source_material.get_shader_parameter("hurt_flash")
			var hit: Variant = source_material.get_shader_parameter("hit_flash")
			var flash := maxf(hurt if hurt is float else 0.0, hit if hit is float else 0.0)
			if hero_material.get_shader_parameter("flash") != flash:
				hero_material.set_shader_parameter("flash", flash)
	elif hero_material != null and hero_material.shader == HERO_OUTLINE_SHADER:
		sprite.material_override = null
	_set_anchor(sprite, source.capture_anchor())
	sprite.position = _snap_ground(_space(point))
	sprite.visible = source.visible or source == preview_hero


func _set_anchor(sprite: Sprite3D, foot: Vector2) -> void:
	# Source anchors start at the top-left. The uncentered 3D quad starts at the bottom-left.
	sprite.offset = Vector2(-foot.x, foot.y - sprite.texture.get_height())


func view_height(aspect: float, zoom_ratio: float) -> float:
	var floor: Rect2 = geometry.floor_bounds
	var pitch := -camera.rotation.x
	# The upper edge includes the back wall projected above the floor.
	var top := floor.position.y - REAR_WALL_HEIGHT / tan(pitch)
	var projected_depth := (floor.end.y - top) * sin(pitch)
	return maxf(projected_depth + 1.6 * sin(pitch), (floor.size.x + 1.1) / aspect) / zoom_ratio


func _frame(point: Vector2, zoom_ratio: float, snap_to_pixels: bool = false, visible_raster: Vector2 = Vector2.ZERO) -> void:
	camera_texel_offset = Vector2.ZERO
	var floor: Rect2 = geometry.floor_bounds
	if not floor.has_area():
		return
	var aspect := 1.6
	var raster_size := get_viewport().get_visible_rect().size
	var visible_size := visible_raster if visible_raster != Vector2.ZERO else raster_size
	if not Engine.is_editor_hint():
		aspect = visible_size.x / maxf(visible_size.y, 1.0)

	var pitch := -camera.rotation.x
	var top := floor.position.y - REAR_WALL_HEIGHT / tan(pitch)
	var height := view_height(aspect, zoom_ratio)
	var half_width := height * aspect * 0.5
	var half_depth := height * 0.5 / sin(pitch)
	var focus := _space(point)
	focus.z -= 0.7 / tan(pitch)
	focus.x = _clamp_view(focus.x, floor.position.x - 0.55, floor.end.x + 0.55, half_width)
	focus.z = _clamp_view(focus.z, top - 0.6, floor.end.y + 0.85, half_depth)

	# A small dead zone prevents camera movement from mirroring every footstep.
	if not _camera_focus_ready or Engine.is_editor_hint():
		_camera_focus = Vector2(focus.x, focus.z)
		_camera_focus_ready = true
	else:
		var horizontal_margin := minf(0.35, height * aspect * 0.04)
		var depth_margin := minf(0.35, height * 0.04 / sin(pitch))
		_camera_focus.x = clampf(_camera_focus.x, focus.x - horizontal_margin, focus.x + horizontal_margin)
		_camera_focus.y = clampf(_camera_focus.y, focus.z - depth_margin, focus.z + depth_margin)
		_camera_focus.x = _clamp_view(_camera_focus.x, floor.position.x - 0.55, floor.end.x + 0.55, half_width)
		_camera_focus.y = _clamp_view(_camera_focus.y, top - 0.6, floor.end.y + 0.85, half_depth)
	focus.x = _camera_focus.x
	focus.z = _camera_focus.y

	# Widen the projection for the border while keeping the visible texel size.
	var texel_size := height / maxf(visible_size.y, 1.0)
	camera.size = texel_size * raster_size.y
	if presentation_minimum > 0:
		var projected_actor_pixel := 1.0 / (texel_size * Layout.PPU)
		var next_pixel_size := 1 if visible_raster != Vector2.ZERO else WorldDisplay.camera_pixel_size(presentation_minimum, projected_actor_pixel)
		if presentation_pixel_size != next_pixel_size:
			presentation_pixel_size = next_pixel_size
			_legacy_edges.set_shader_parameter("asset_edge_step", presentation_pixel_size)
			if _standalone_presentation != null:
				_standalone_presentation.set_shader_parameter("pixel_size", presentation_pixel_size)
	_world_pixel_step = texel_size if snap_to_pixels and visible_size.y > 0.0 else 0.0
	var distance := camera.basis.z * CAMERA_DISTANCE
	if visible_raster != Vector2.ZERO and snap_to_pixels:
		camera_texel_offset = WorldDisplay.snap_orthographic_camera(camera, focus + distance, texel_size, raster_size)
	elif _standalone_presentation != null and snap_to_pixels:
		var residual := WorldDisplay.snap_orthographic_camera(camera, focus + distance, texel_size * presentation_pixel_size, raster_size / presentation_pixel_size)
		_standalone_presentation.set_shader_parameter("pixel_offset", (residual * presentation_pixel_size + Vector2.ONE * 0.5).floor())
	else:
		camera.position = _snap_ground(focus) + distance
	if asset_mask != null:
		asset_mask.sync()


func _snap_ground(point: Vector3) -> Vector3:
	if _world_pixel_step <= 0.0:
		return point
	var pitch_sine := sin(-camera.rotation.x)
	if absf(pitch_sine) < 0.001:
		return point
	return Vector3(snappedf(point.x, _world_pixel_step), point.y,
		snappedf(point.z * pitch_sine, _world_pixel_step) / pitch_sine)


func _clamp_view(point: float, start: float, end: float, half_view: float) -> float:
	if end - start <= half_view * 2.0:
		return (start + end) * 0.5
	return clampf(point, start + half_view, end - half_view)


func pick(point: Vector2) -> Vector2:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var ground := origin - direction * (origin.y / direction.y)
	return Vector2(ground.x, ground.z) * Layout.UNIT


func screen_point(point: Vector2, height: float = 0.0) -> Vector2:
	# Labels are offset in screen space above the camera-facing character art.
	return camera.unproject_position(_space(point, height / cos(camera.rotation.x)))


func pick_interaction(point: Vector2, world: Node) -> Dictionary:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var bounds: Dictionary = geometry.interaction_bounds.duplicate()
	var at := merchant.position
	bounds["actor"] = AABB(at + Vector3(-0.44, 0.0, -0.24), Vector3(0.88, 2.65, 0.48))

	var closest_id := ""
	var closest := INF
	for id in bounds:
		var box: AABB = bounds[id]
		var hit: Variant = box.intersects_ray(origin, direction)
		if hit is Vector3:
			var distance := origin.distance_squared_to(hit)
			if distance < closest:
				closest = distance
				closest_id = "merchant" if id == "actor" else str(id)
	for entity in world.entities:
		if entity.id == closest_id:
			return entity
	return {}


func _space(point: Vector2, height: float = 0.0) -> Vector3:
	return Vector3(point.x / Layout.UNIT, height, point.y / Layout.UNIT)
