extends Control

const Profile := preload("res://scripts/rendering/camera_pixel_profile.gd")
const WorldDisplay := preload("res://scripts/services/world_display_settings.gd")
const CAMERA_SHADER := preload("res://art/resources/camera_pixel_effect.gdshader")
const PRESENT_SHADER := preload("res://art/resources/camera_pixel_present.gdshader")
const FLOOR_LIGHT_SHADER := preload("res://art/resources/shop_room_lighting.gdshader")
const RASTER_PADDING := Vector2i(13, 13) # Half of the largest cell, plus rounding room.

## The attached camera's size at this reference resolution defines the world pixel scale.
@export var reference_raster_size := Vector2i(1614, 1281)
@export var profile: Profile = preload("res://art/resources/camera_pixel_profile.tres")

var raster: SubViewport
var display_zoom := 1.0:
	set(value):
		display_zoom = maxf(value, 0.5)
		_update_raster()

var _presenter: TextureRect
var _camera: Camera3D
var _reference_camera_size := 0.0
var _camera_target := Vector3.ZERO
var _image_offset := Vector2.ZERO
var _quad: MeshInstance3D
var _effect_enabled := true
var _shadow_edges_enabled := true
var _shadow_reference: SubViewport
var _reference_camera: Camera3D
var _effect_material: ShaderMaterial
var _present_material: ShaderMaterial
var _floor: MeshInstance3D
var _floor_original: Array[Material] = []
var _floor_banded: Array[Material] = []


func _ready() -> void:
	clip_contents = true
	var background := ColorRect.new()
	background.color = Color.BLACK
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	raster = SubViewport.new()
	raster.name = "Raster"
	raster.own_world_3d = true
	raster.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(raster)

	_effect_material = ShaderMaterial.new()
	_effect_material.shader = CAMERA_SHADER
	_effect_material.render_priority = 127
	_present_material = ShaderMaterial.new()
	_present_material.shader = PRESENT_SHADER
	_presenter = TextureRect.new()
	_presenter.name = "CameraImage"
	_presenter.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_presenter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_presenter.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_presenter.texture = raster.get_texture()
	add_child(_presenter)
	apply_profile(profile)
	set_effect_enabled(_effect_enabled)
	resized.connect(_update_raster)
	_update_raster()


## Mount an orthographic camera in this view's raster so the effect can read its depth.
func attach_camera(camera: Camera3D) -> void:
	assert(camera.get_viewport() == raster)
	assert(camera.projection == Camera3D.PROJECTION_ORTHOGONAL)
	if is_instance_valid(_quad):
		_quad.hide()
		_quad.queue_free()
	_camera = camera
	_reference_camera_size = camera.size
	_camera_target = camera.position
	var mesh := QuadMesh.new()
	mesh.size = Vector2(2.0, 2.0)
	_quad = MeshInstance3D.new()
	_quad.name = "CameraPixelEffect"
	_quad.mesh = mesh
	_quad.material_override = _effect_material
	_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_quad.position.z = -1.0
	camera.add_child(_quad)
	camera.make_current()
	_update_raster()
	set_effect_enabled(_effect_enabled)


## Use lighting bands on a flat floor before its authored colors are applied.
func set_banded_floor(mesh: MeshInstance3D, surfaces: PackedInt32Array) -> void:
	_floor = mesh
	_floor_original.clear()
	_floor_banded.clear()
	for surface in range(mesh.mesh.get_surface_count()):
		var original := mesh.get_surface_override_material(surface)
		_floor_original.append(original)
		_floor_banded.append(original)
		if not surfaces.has(surface):
			continue
		var source := mesh.get_active_material(surface) as BaseMaterial3D
		assert(source != null and source.albedo_texture == null and not source.vertex_color_use_as_albedo)
		var material := ShaderMaterial.new()
		material.shader = FLOOR_LIGHT_SHADER
		material.set_shader_parameter("paint", source.albedo_color)
		material.set_shader_parameter("cull_back_faces", source.cull_mode == BaseMaterial3D.CULL_BACK)
		_floor_banded[surface] = material
	_sync_floor_lighting()


func _sync_floor_lighting() -> void:
	if not is_instance_valid(_floor):
		return
	var active := _effect_enabled and profile.shade_bands
	for surface in range(_floor_original.size()):
		_floor.set_surface_override_material(surface, _floor_banded[surface] if active else _floor_original[surface])
	var bounds := _floor.global_transform * _floor.get_aabb()
	_effect_material.set_shader_parameter("material_bands_enabled", active)
	_effect_material.set_shader_parameter("material_bands_min",
		Vector3(bounds.position.x, bounds.end.y - 0.008, bounds.position.z))
	_effect_material.set_shader_parameter("material_bands_max",
		Vector3(bounds.end.x, bounds.end.y + 0.008, bounds.end.z))


## Move the view without changing which world locations the pixel cells sample.
func set_camera_position(target: Vector3) -> void:
	_camera_target = target
	_align_camera_to_grid()


## Mount a shadow-free copy of a static scene. It renders before the parent raster.
func set_shadow_reference(scene: PackedScene, camera_path: NodePath) -> void:
	var reference_scene := scene.instantiate()
	var reference_camera := reference_scene.get_node_or_null(camera_path) as Camera3D
	if reference_camera == null:
		reference_scene.free()
		push_error("The shadow reference scene needs a camera at %s." % camera_path)
		return
	if is_instance_valid(_shadow_reference):
		_shadow_reference.render_target_update_mode = SubViewport.UPDATE_DISABLED
		_shadow_reference.queue_free()
	for light: Light3D in reference_scene.find_children("*", "Light3D", true, false):
		light.shadow_enabled = false
	_shadow_reference = SubViewport.new()
	_shadow_reference.name = "ShadowReference"
	_shadow_reference.own_world_3d = true
	_shadow_reference.render_target_update_mode = SubViewport.UPDATE_DISABLED
	raster.add_child(_shadow_reference)
	_shadow_reference.add_child(reference_scene)
	_reference_camera = reference_camera
	_reference_camera.make_current()
	_effect_material.set_shader_parameter("shadow_reference", _shadow_reference.get_texture())
	_sync_shadow_reference(true)


func set_shadow_edges_enabled(enabled: bool) -> void:
	_shadow_edges_enabled = enabled
	_sync_shadow_reference(true)


func apply_profile(value: Profile) -> void:
	profile = value
	if _effect_material == null:
		return
	var pixel_size := clampi(profile.pixel_size, 1, 24)
	_present_material.set_shader_parameter("pixel_size", pixel_size)
	_present_material.set_shader_parameter("preserve_lines", profile.preserve_lines)
	_effect_material.set_shader_parameter("pixel_size", pixel_size)
	_effect_material.set_shader_parameter("outline_width", clampi(profile.outline_width, 0, 12))
	_effect_material.set_shader_parameter("outline_strength", clampf(profile.outline_strength / 100.0, 0.0, 1.0))
	_effect_material.set_shader_parameter("preserve_lines", profile.preserve_lines)
	_effect_material.set_shader_parameter("line_sensitivity", lerpf(0.30, 0.02,
		clampf(profile.line_sensitivity / 100.0, 0.0, 1.0)))
	_effect_material.set_shader_parameter("shade_bands", profile.shade_bands)
	_sync_floor_lighting()
	_align_camera_to_grid()


func set_effect_enabled(enabled: bool) -> void:
	_effect_enabled = enabled
	_sync_floor_lighting()
	if is_instance_valid(_quad):
		_quad.visible = enabled
	if is_instance_valid(_presenter):
		_presenter.material = _present_material if enabled and is_instance_valid(_quad) else null
	_align_camera_to_grid()


func _align_camera_to_grid() -> void:
	if not is_instance_valid(_camera):
		_layout_image()
		return
	_image_offset = Vector2.ZERO
	if _effect_enabled:
		var cell_size := float(clampi(profile.pixel_size, 1, 24))
		var raster_height := float(raster.size.y)
		var world_per_raster_pixel := _camera.size / raster_height
		if _camera.keep_aspect == Camera3D.KEEP_WIDTH:
			world_per_raster_pixel = _camera.size / float(raster.size.x)
		var remainder := WorldDisplay.snap_orthographic_camera(_camera, _camera_target,
			world_per_raster_pixel * cell_size, Vector2(raster.size) / cell_size)
		_image_offset = remainder * cell_size
	else:
		_camera.position = _camera_target
	_sync_shadow_reference()
	_layout_image()


func _sync_shadow_reference(force: bool = false) -> void:
	if not is_instance_valid(_shadow_reference) or not is_instance_valid(_camera):
		return
	var active := _effect_enabled and _shadow_edges_enabled
	_effect_material.set_shader_parameter("automatic_shadow_edges", active)
	if not active:
		_shadow_reference.render_target_update_mode = SubViewport.UPDATE_DISABLED
		return

	# The reference is static. Refresh it only when the snapped camera or its raster changes.
	var view_changed := _shadow_reference.size != raster.size \
		or not _reference_camera.global_transform.is_equal_approx(_camera.global_transform) \
		or not is_equal_approx(_reference_camera.size, _camera.size) \
		or _reference_camera.keep_aspect != _camera.keep_aspect \
		or _reference_camera.cull_mask != _camera.cull_mask \
		or _reference_camera.near != _camera.near or _reference_camera.far != _camera.far \
		or _reference_camera.h_offset != _camera.h_offset or _reference_camera.v_offset != _camera.v_offset
	if not force and not view_changed:
		return
	_shadow_reference.size = raster.size
	_reference_camera.keep_aspect = _camera.keep_aspect
	_reference_camera.cull_mask = _camera.cull_mask
	_reference_camera.h_offset = _camera.h_offset
	_reference_camera.v_offset = _camera.v_offset
	_reference_camera.set_orthogonal(_camera.size, _camera.near, _camera.far)
	_reference_camera.global_transform = _camera.global_transform
	_shadow_reference.render_target_update_mode = SubViewport.UPDATE_ONCE


func _update_raster() -> void:
	if not is_instance_valid(raster):
		return
	# Fill the preview at the chosen display scale by rendering more of the same grid.
	var visible_pixels := Vector2i((size / display_zoom).ceil()).max(Vector2i(2, 2))
	var next_size := visible_pixels + RASTER_PADDING * 2
	if raster.size != next_size:
		raster.size = next_size
		_presenter.size = Vector2(next_size)
	if is_instance_valid(_camera):
		var axis := 0 if _camera.keep_aspect == Camera3D.KEEP_WIDTH else 1
		_camera.size = _reference_camera_size * float(next_size[axis]) / maxf(1.0, reference_raster_size[axis])
	_align_camera_to_grid()


func _layout_image() -> void:
	if not is_instance_valid(_presenter):
		return
	_presenter.scale = Vector2.ONE * display_zoom
	var centered := (size - _presenter.size * display_zoom) * 0.5
	_presenter.position = (centered + _image_offset * display_zoom).round()
