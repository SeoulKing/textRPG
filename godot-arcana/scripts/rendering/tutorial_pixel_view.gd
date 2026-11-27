extends Control

## Low-resolution world rendering with material lighting and geometry-only edges.
const Profile := preload("res://scripts/rendering/camera_pixel_profile.gd")
const WorldDisplay := preload("res://scripts/services/world_display_settings.gd")
const PixelEffect := preload("res://scripts/rendering/tutorial_pixel_effect.gd")
const PADDING := Vector2i(2, 2)

@export var reference_raster_size := Vector2i(1614, 1281)
@export var profile: Profile = preload("res://art/resources/camera_pixel_profile.tres")

var raster: SubViewport
var display_zoom := 1.0:
	set(value):
		display_zoom = maxf(value, 0.5)
		_update_raster()
var highlight_strength := 0.10
var highlights_enabled := true
var presentation_scale := 1
var _presenter: TextureRect
var _camera: Camera3D
var _effect: PixelEffect
var _reference_camera_size := 0.0
var _camera_target := Vector3.ZERO
var _image_offset := Vector2.ZERO
var _effect_enabled := true


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
	raster.msaa_3d = Viewport.MSAA_DISABLED
	raster.screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
	raster.use_taa = false
	raster.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(raster)
	_presenter = TextureRect.new()
	_presenter.name = "CameraImage"
	_presenter.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_presenter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_presenter.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_presenter.texture = raster.get_texture()
	add_child(_presenter)
	resized.connect(_update_raster)
	apply_profile(profile)


func configure_world(root: Node3D) -> void:
	_effect = PixelEffect.new()
	_camera.add_child(_effect)
	_effect.configure(root, _camera)
	_effect.apply_profile(profile)
	_effect.set_effect_enabled(_effect_enabled)
	_effect.set_highlight_strength(highlight_strength)
	_effect.set_highlights_enabled(highlights_enabled)


func attach_camera(camera: Camera3D) -> void:
	assert(camera.get_viewport() == raster)
	assert(camera.projection == Camera3D.PROJECTION_ORTHOGONAL)
	_camera = camera
	_reference_camera_size = camera.size
	_camera_target = camera.position
	camera.make_current()
	_update_raster()


func apply_profile(value: Profile) -> void:
	profile = value
	if _effect != null:
		_effect.apply_profile(profile)
	_update_raster()


func set_highlights_enabled(enabled: bool) -> void:
	highlights_enabled = enabled
	if _effect != null:
		_effect.set_highlights_enabled(enabled)


func set_highlight_strength(value: float) -> void:
	highlight_strength = clampf(value, 0.0, 1.0)
	if _effect != null:
		_effect.set_highlight_strength(highlight_strength)


func set_specular_controls(nonmetal: float, metal: float, cutoff: float) -> void:
	if _effect != null:
		_effect.set_specular_controls(nonmetal, metal, cutoff)

func set_effect_enabled(enabled: bool) -> void:
	_effect_enabled = enabled
	if _effect != null:
		_effect.set_effect_enabled(enabled)
	_update_raster()


func set_camera_position(target: Vector3) -> void:
	_camera_target = target
	_align_camera_to_grid()


func world_per_display_pixel() -> float:
	return _camera.size / (float(raster.size.y) * float(presentation_scale))


func _update_raster() -> void:
	if not is_instance_valid(raster):
		return
	var pixel_size := clampi(profile.pixel_size, 1, 24)
	var effect_scale := maxi(1, roundi(display_zoom * float(pixel_size)))
	presentation_scale = effect_scale if _effect_enabled else 1
	var visible_pixels := Vector2i((size / float(presentation_scale)).ceil()).max(Vector2i(2, 2))
	var next_size := visible_pixels + PADDING * 2
	raster.size = next_size
	_presenter.size = Vector2(next_size)
	if is_instance_valid(_camera):
		var axis := 0 if _camera.keep_aspect == Camera3D.KEEP_WIDTH else 1
		var world_per_texel := _reference_camera_size / float(reference_raster_size[axis])
		world_per_texel *= float(pixel_size) * float(presentation_scale) / float(effect_scale)
		_camera.size = world_per_texel * float(next_size[axis])
	_align_camera_to_grid()


func _align_camera_to_grid() -> void:
	_image_offset = Vector2.ZERO
	if is_instance_valid(_camera):
		if _effect_enabled:
			var axis := 0 if _camera.keep_aspect == Camera3D.KEEP_WIDTH else 1
			var world_per_texel := _camera.size / float(raster.size[axis])
			_image_offset = WorldDisplay.snap_orthographic_camera(_camera, _camera_target,
				world_per_texel, Vector2(raster.size))
		else:
			_camera.position = _camera_target
		_sync_effect()
	if is_instance_valid(_presenter):
		_presenter.scale = Vector2.ONE * float(presentation_scale)
		var center := (size - _presenter.size * float(presentation_scale)) * 0.5
		_presenter.position = (center + _image_offset * float(presentation_scale)).round()


func _process(_delta: float) -> void:
	_sync_effect()


func _sync_effect() -> void:
	if _effect != null:
		_effect.sync()


func get_stats() -> Dictionary:
	var stats := _effect.get_stats() if _effect != null else {"lighting": {}, "normals": {}}
	stats["raster_size"] = raster.size
	stats["integer_scale"] = presentation_scale
	stats["effect_enabled"] = _effect_enabled
	return stats
