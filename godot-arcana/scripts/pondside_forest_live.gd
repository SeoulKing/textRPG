extends Node3D
## Live bindings for the authored forest. The standalone scene keeps its overview camera.

const Coordinates := preload("res://scripts/native_2d_coordinates.gd")
const TileStyle := preload("res://scripts/rendering/tile_world_style.gd")
const ScenePreset := preload("res://scripts/rendering/inn_shader_preset.gd")
const WorldDisplay := preload("res://scripts/services/world_display_settings.gd")
const Campfire := preload("res://scripts/native_2d_campfire.gd")
const MAP_SIZE := 32.0
const CAMERA_DISTANCE := 46.0

class FireProjection:
	var source: Campfire
	var root: Node3D
	var flame: Sprite3D
	var food: Sprite3D
	var footprint: Sprite3D
	var light: OmniLight3D
	var canvas_tint: Color
	var canvas_sprite_visible: bool
	var canvas_light_visible: bool

@onready var camera: Camera3D = $Camera3D
@onready var _sun: DirectionalLight3D = $Lighting/Sun

var camera_texel_offset := Vector2.ZERO
var _preset := ScenePreset.load_approved() as ScenePreset
var _pixel_effect: Node3D
var _bounds: Rect2
var _focus := Vector3.INF
var _avatar: Sprite3D
var _remotes: Dictionary[String, Sprite3D] = {}
var _trees: Dictionary[String, Node3D] = {}
var _tree_meshes: Dictionary[String, Array] = {}
var _entrance_meshes: Array[MeshInstance3D] = []
var _shaken_tree: Node3D
var _rest_rotation := Vector3.ZERO
var _shake: Tween
var _fires: Dictionary[int, FireProjection] = {}
var _footprint_texture: Texture2D

func _ready() -> void:
	camera.rotation_degrees = TileStyle.CAMERA_ROTATION_DEGREES
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	_bounds = TileStyle.projected_bounds(camera.basis, AABB(Vector3.ZERO, Vector3(MAP_SIZE, TileStyle.AVATAR_HEIGHT, MAP_SIZE)))
	var oaks: Node3D = $Oaks
	# Hit wobble and felling can change the trees without recapturing static highlights.
	oaks.set_meta(&"local_mesh_highlights", true)
	for tree: Node3D in oaks.get_children():
		var id := str(tree.get_meta("forest_id", ""))
		if id.is_empty(): continue
		_trees[id] = tree
		_tree_meshes[id] = _meshes(tree)
	_entrance_meshes = _meshes($Entrance/TrailLantern)
	var preset := _preset.tile_world_variant() as ScenePreset
	_pixel_effect = preset.attach_effect(self, camera)
	_avatar = _make_avatar()
	camera.make_current()

func sync_camera(point: Vector2, zoom_ratio: float, visible_raster: Vector2,
		pixelated: bool, delta: float, immediate: bool, shadows: bool) -> void:
	var raster_size := get_viewport().get_visible_rect().size
	if raster_size.y <= 0.0: return
	var visible_size := raster_size if visible_raster == Vector2.ZERO else visible_raster
	var texel_size := TileStyle.world_texel_size(zoom_ratio)
	var target := _space(point, TileStyle.AVATAR_HEIGHT * 0.5)
	if immediate or not _focus.is_finite() or _focus.distance_squared_to(target) > 16.0:
		_focus = target
	else:
		_focus = _focus.lerp(target, 1.0 - exp(-24.0 * delta))
	var focus := TileStyle.clamp_focus(camera.basis, _focus, _bounds, visible_size * texel_size)
	camera.size = texel_size * raster_size.y
	var desired := focus + camera.basis.z * CAMERA_DISTANCE
	camera_texel_offset = Vector2.ZERO
	if pixelated and _preset.effect_enabled:
		camera_texel_offset = WorldDisplay.snap_orthographic_camera(camera, desired, texel_size, raster_size)
	else:
		camera.position = desired
	_sun.shadow_enabled = shadows
	_pixel_effect.sync()

func input_projection() -> Transform2D:
	return _preset.input_projection(camera)

func canvas_projection() -> Transform2D:
	var origin := screen_point(Vector2.ZERO)
	var step := Coordinates.LOGICAL_UNIT
	return Transform2D((screen_point(Vector2(step, 0)) - origin) / Coordinates.SOURCE_UNIT,
		(screen_point(Vector2(0, step)) - origin) / Coordinates.SOURCE_UNIT, origin)

func screen_point(point: Vector2, height: float = 0.0) -> Vector2:
	return camera.unproject_position(_space(point, height / absf(camera.basis.y.y)))

func pick(point: Vector2) -> Vector2:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var ground := origin - direction * (origin.y / direction.y)
	return Vector2(ground.x, ground.z) * Coordinates.LOGICAL_UNIT

func pick_interaction(point: Vector2, entities: Array) -> Dictionary:
	var origin := camera.project_ray_origin(point)
	var direction := camera.project_ray_normal(point)
	var nearest := INF
	var result: Dictionary = {}
	for entity: Dictionary in entities:
		var distance := INF
		match entity.kind:
			"forest_trees":
				distance = _mesh_hit_distance(_tree_meshes.get(str(entity.id), []), origin, direction)
			"forest_entrance":
				distance = _mesh_hit_distance(_entrance_meshes, origin, direction)
			"campfire":
				var base := _space(entity.pos)
				var hit: Variant = AABB(base - Vector3(0.55, 0, 0.55), Vector3(1.1, 0.8, 1.1)).intersects_ray(origin, direction)
				if hit is Vector3:
					distance = origin.distance_squared_to(hit)
		if distance < nearest:
			nearest = distance
			result = entity
	return result

func _meshes(root: Node3D) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	for mesh: MeshInstance3D in root.find_children("*", "MeshInstance3D", true, false):
		if mesh.mesh != null and mesh.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY:
			result.append(mesh)
	return result

func _mesh_hit_distance(meshes: Array, origin: Vector3, direction: Vector3) -> float:
	var nearest := INF
	for mesh: MeshInstance3D in meshes:
		if not mesh.is_visible_in_tree(): continue
		var pose := mesh.global_transform
		var inverse := pose.affine_inverse()
		var hit: Variant = mesh.get_aabb().intersects_ray(inverse * origin, inverse.basis * direction)
		if hit is Vector3:
			nearest = minf(nearest, origin.distance_squared_to(pose * hit))
	return nearest

func tree(id: String) -> Node3D:
	return _trees.get(id) as Node3D

func sync_tree_visibility(world: Node) -> void:
	for id: String in _trees:
		_trees[id].visible = world.forest_tree_available(id)

func shake_tree(oak: Node3D) -> void:
	if _shake != null: _shake.kill()
	if is_instance_valid(_shaken_tree): _shaken_tree.rotation = _rest_rotation
	var model := oak.get_node_or_null("Model") as Node3D
	_shaken_tree = model if model != null else oak
	_rest_rotation = _shaken_tree.rotation
	_shake = _shaken_tree.create_tween()
	_shake.tween_property(_shaken_tree, "rotation", _rest_rotation + Vector3(0.0, 0.0, 0.035), 0.06)
	_shake.tween_property(_shaken_tree, "rotation", _rest_rotation - Vector3(0.0, 0.0, 0.022), 0.075)
	_shake.tween_property(_shaken_tree, "rotation", _rest_rotation, 0.12)

func sync_local_actor(source: Node, foot: Vector2) -> void:
	_sync_actor(_avatar, source, foot)

func sync_remote(id: String, source: Node, foot: Vector2) -> void:
	if not _remotes.has(id): _remotes[id] = _make_avatar()
	_sync_actor(_remotes[id], source, foot)

func remove_remote(id: String) -> void:
	if not _remotes.has(id): return
	_remotes[id].hide()
	_remotes[id].queue_free()
	_remotes.erase(id)

func sync_campfires(children: Array[Node]) -> void:
	var visible: Dictionary[int, bool] = {}
	for child: Node in children:
		var source := child as Campfire
		if source == null or source.is_queued_for_deletion() or not source.is_visible_in_tree(): continue
		var id := source.get_instance_id()
		visible[id] = true
		if not _fires.has(id): _fires[id] = _project_fire(source)
		_sync_fire(_fires[id])
	for id: int in _fires.keys():
		if visible.has(id): continue
		var fire: FireProjection = _fires[id]
		_restore_fire_canvas(fire)
		fire.root.hide()
		fire.root.queue_free()
		_fires.erase(id)

func _project_fire(source: Campfire) -> FireProjection:
	var fire := FireProjection.new()
	fire.source = source
	fire.canvas_tint = source.self_modulate
	fire.canvas_sprite_visible = source.sprite.visible
	fire.canvas_light_visible = source.warm_light.visible
	# Life continues to drive the existing animated frame and ghost tint.
	source.self_modulate.a = 0.0
	source.sprite.hide()
	source.warm_light.hide()
	fire.root = Node3D.new()
	add_child(fire.root)
	fire.flame = _fire_sprite(fire.root)
	if source.ghost:
		fire.footprint = _fire_sprite(fire.root)
		fire.footprint.centered = true
		fire.footprint.rotation = Vector3(-PI * 0.5, 0.0, 0.0)
		fire.footprint.scale = Vector3.ONE
		fire.footprint.pixel_size = 1.0 / 32.0
		fire.footprint.texture = _fire_footprint_texture()
	else:
		fire.light = OmniLight3D.new()
		fire.light.position.y = 0.35
		fire.light.omni_range = 1.6
		fire.light.light_color = source.warm_light.color
		fire.root.add_child(fire.light)
	return fire

func _sync_fire(fire: FireProjection) -> void:
	var source := fire.source
	fire.root.position = _space(Coordinates.logical(source.position), 0.012)
	_sync_fire_sprite(fire.flame, source.sprite, source.modulate)
	if fire.footprint != null:
		fire.footprint.modulate = source.modulate
	if fire.light != null:
		fire.light.visible = source.effects
		fire.light.light_energy = source.warm_light.energy
	if is_instance_valid(source.cooking_food) and source.cooking_food.visible:
		if fire.food == null:
			fire.food = _fire_sprite(fire.root)
			fire.food.position = camera.basis.z * 0.006
		_sync_fire_sprite(fire.food, source.cooking_food, source.modulate)
		fire.food.show()
	elif fire.food != null:
		fire.food.hide()

func _fire_sprite(parent: Node3D) -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.centered = false
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	sprite.rotation.y = camera.rotation.y
	sprite.pixel_size = 1.0 / Coordinates.SOURCE_UNIT
	sprite.scale.y = 1.0 / absf(camera.basis.y.y)
	parent.add_child(sprite)
	return sprite

func _sync_fire_sprite(sprite: Sprite3D, source: Sprite2D, tint: Color) -> void:
	var frame_height := float(source.texture.get_height()) / source.vframes
	var offset := source.position + source.offset
	sprite.texture = source.texture
	sprite.hframes = source.hframes
	sprite.vframes = source.vframes
	sprite.frame = source.frame
	sprite.offset = Vector2(offset.x, -offset.y - frame_height)
	sprite.modulate = tint

func _fire_footprint_texture() -> Texture2D:
	if _footprint_texture == null:
		var image := Image.create(32, 24, false, Image.FORMAT_RGBA8)
		image.fill(Color.WHITE)
		image.fill_rect(Rect2i(1, 1, 30, 22), Color(1.0, 1.0, 1.0, 0.2))
		_footprint_texture = ImageTexture.create_from_image(image)
	return _footprint_texture

func _restore_fire_canvas(fire: FireProjection) -> void:
	if not is_instance_valid(fire.source): return
	fire.source.self_modulate = fire.canvas_tint
	fire.source.sprite.visible = fire.canvas_sprite_visible
	fire.source.warm_light.visible = fire.canvas_light_visible

func _exit_tree() -> void:
	for fire: FireProjection in _fires.values():
		_restore_fire_canvas(fire)

func _make_avatar() -> Sprite3D:
	var sprite := Sprite3D.new()
	sprite.centered = false
	sprite.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	sprite.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	sprite.rotation.y = camera.rotation.y
	TileStyle.apply_avatar_size(sprite)
	add_child(sprite)
	return sprite

func _sync_actor(sprite: Sprite3D, source: Node, foot: Vector2) -> void:
	var texture: Texture2D = source.get_live_texture()
	if texture == null:
		sprite.hide()
		return
	var anchor: Vector2 = source.capture_anchor()
	sprite.texture = texture
	sprite.offset = Vector2(-anchor.x, anchor.y - texture.get_height())
	sprite.position = _space(foot, 0.01)
	sprite.visible = source.visible
	if not source.get_meta("model_outline", false):
		sprite.material_override = null
		return
	var material := sprite.material_override as ShaderMaterial
	if material == null:
		material = TileStyle.actor_material(texture, true)
		sprite.material_override = material
	material.set_shader_parameter("avatar_texture", texture)
	material.set_shader_parameter("outline_screen_pixels", 1.0)

func _space(point: Vector2, height: float = 0.0) -> Vector3:
	return Vector3(point.x / Coordinates.LOGICAL_UNIT, height, point.y / Coordinates.LOGICAL_UNIT)
