extends Control

const WorldRenderer = preload("res://scripts/native_2d_world.gd")
const WorldDisplaySettings = preload("res://scripts/services/world_display_settings.gd")
const WORLD_PRESENTATION_SHADER = preload("res://art/resources/world_presentation.gdshader")
const AstraLook = preload("res://scripts/shop_astra_look.gd")
var saved_pixel_size := 2
var edge_material: ShaderMaterial
var base_light_energy: float
var dragging_light := false
var drag_offset := Vector3.ZERO
var _world_presentation: ShaderMaterial
var _display: Node2D
var _physical_size := Vector2i.ZERO

@onready var presenter: TextureRect = $WorldDisplay
@onready var viewport: SubViewport = $WorldViewport
@onready var shop: Node3D = $WorldViewport/Shop3D
@onready var test_cube: Node3D = $WorldViewport/Shop3D/Geometry/PixelTestCube
@onready var slider: HSlider = $Controls/Margin/Rows/PixelSize/Slider
@onready var value_label: Label = $Controls/Margin/Rows/PixelSize/Value
@onready var zoom_label: Label = $Controls/Margin/Rows/Zoom
@onready var save_button: Button = $Controls/Margin/Rows/SaveDefault
@onready var edge_slider: HSlider = $Controls/Margin/Rows/CubeEdges/Slider
@onready var edge_label: Label = $Controls/Margin/Rows/CubeEdges/Value
@onready var highlight_slider: HSlider = $Controls/Margin/Rows/CubeHighlight/Slider
@onready var highlight_label: Label = $Controls/Margin/Rows/CubeHighlight/Value
@onready var highlight_width_slider: HSlider = $Controls/Margin/Rows/CubeHighlightWidth/Slider
@onready var highlight_width_label: Label = $Controls/Margin/Rows/CubeHighlightWidth/Value
@onready var band_toggle: CheckButton = $Controls/Margin/Rows/CubeBands
@onready var cube_toggle: CheckButton = $Controls/Margin/Rows/ShowCube
@onready var light_toggle: CheckButton = $Controls/Margin/Rows/MoveLight
@onready var light_energy_slider: HSlider = $Controls/Margin/Rows/LightEnergy/Slider
@onready var light_energy_label: Label = $Controls/Margin/Rows/LightEnergy/Value
@onready var test_light: OmniLight3D = $WorldViewport/Shop3D/MovableLight


func _ready() -> void:
	# The controls and the final image use window pixels in this preview.
	get_window().content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	get_window().title = "아르카나 상점 · 도트 미리보기"
	_display = Node2D.new()
	add_child(_display)
	move_child(_display, presenter.get_index())
	presenter.reparent(_display, false)
	presenter.texture = viewport.get_texture()
	_world_presentation = ShaderMaterial.new()
	_world_presentation.shader = WORLD_PRESENTATION_SHADER
	_world_presentation.set_shader_parameter("use_viewport_texels", true)
	presenter.material = _world_presentation
	shop.enable_walkable_preview(true)
	if shop.geometry.astra_active:
		_setup_astra_controls()
	else:
		_setup_legacy_controls()
	saved_pixel_size = WorldDisplaySettings.pixel_size()
	slider.set_value_no_signal(saved_pixel_size)
	slider.value_changed.connect(_update_pixel_size)
	save_button.pressed.connect(_save_default)
	resized.connect(_resize_raster)
	_resize_raster()
	_update_pixel_size(slider.value)
	_update_zoom_label()


func _setup_astra_controls() -> void:
	get_window().title = "아르카나 상점 아스트라 · 도트 미리보기"
	test_light.hide()
	test_cube.hide()
	cube_toggle.set_pressed_no_signal(false)
	light_toggle.set_pressed_no_signal(false)
	var rows: VBoxContainer = $Controls/Margin/Rows
	for row_name in ["CubeEdges", "CubeHighlight", "CubeHighlightWidth", "CubeBands", "ShowCube", "MoveLight", "LightEnergy"]:
		(rows.get_node(row_name) as Control).hide()
	var diagnostic := OptionButton.new()
	diagnostic.tooltip_text = "아스트라 렌더링 진단"
	diagnostic.add_item("완성 화면", AstraLook.DebugMode.BEAUTY)
	diagnostic.add_item("고유색", AstraLook.DebugMode.ALBEDO)
	diagnostic.add_item("직접광", AstraLook.DebugMode.DIRECT)
	diagnostic.add_item("모서리", AstraLook.DebugMode.EDGES)
	diagnostic.add_item("AO", AstraLook.DebugMode.AO)
	diagnostic.item_selected.connect(func(index: int): shop.set_astra_debug_mode(diagnostic.get_item_id(index)))
	rows.add_child(diagnostic)
	rows.move_child(diagnostic, save_button.get_index())


func _setup_legacy_controls() -> void:
	edge_material = shop.get_node("Camera3D/ScreenEdges").material_override as ShaderMaterial
	cube_toggle.toggled.connect(_set_test_cube)
	_set_test_cube(cube_toggle.button_pressed)
	edge_slider.value_changed.connect(_set_edge_width)
	_set_edge_width(edge_slider.value)
	highlight_slider.value_changed.connect(_set_top_highlight)
	_set_top_highlight(highlight_slider.value)
	highlight_width_slider.value_changed.connect(_set_top_highlight_width)
	_set_top_highlight_width(highlight_width_slider.value)
	band_toggle.toggled.connect(_set_stepped_light)
	_set_stepped_light(band_toggle.button_pressed)
	test_light.position = shop.crate_accent_light.position
	base_light_energy = test_light.light_energy
	light_energy_slider.value_changed.connect(_set_light_energy)
	_set_light_energy(light_energy_slider.value)
	light_toggle.toggled.connect(_set_test_light)
	_set_test_light(light_toggle.button_pressed)


func _set_test_cube(enabled: bool) -> void:
	test_cube.visible = enabled
	edge_material.set_shader_parameter("cube_preview", enabled)


func _set_edge_width(value: float) -> void:
	edge_material.set_shader_parameter("cube_outline_width", int(value))
	edge_label.text = "%d도트" % int(value)


func _set_top_highlight(value: float) -> void:
	edge_material.set_shader_parameter("cube_highlight_strength", value)
	highlight_label.text = "%d%%" % roundi(value * 100.0)


func _set_top_highlight_width(value: float) -> void:
	edge_material.set_shader_parameter("cube_highlight_width", int(value))
	highlight_width_label.text = "%d도트" % int(value)


func _set_stepped_light(enabled: bool) -> void:
	shop.set_cube_stepped_light(enabled)


func _set_test_light(enabled: bool) -> void:
	test_light.visible = enabled
	shop.crate_accent_light.visible = not enabled
	dragging_light = false
	_update_edge_light()


func _set_light_energy(percent: float) -> void:
	test_light.light_energy = base_light_energy * percent / 100.0
	light_energy_label.text = "%d%%" % roundi(percent)
	_update_edge_light()


func _update_edge_light() -> void:
	var ceiling: OmniLight3D = shop.ceiling_light
	var light := test_light if test_light.visible else ceiling
	var level := light_energy_slider.value / 100.0 if test_light.visible else float(ceiling.visible)
	shop.set_cube_light(light, level)


func _light_plane_point(screen_point: Vector2) -> Vector3:
	var camera: Camera3D = shop.camera
	var render_point := WorldRenderer.display_to_raster(presenter, viewport.size, screen_point)
	var origin := camera.project_ray_origin(render_point)
	var ray := camera.project_ray_normal(render_point)
	return origin + ray * ((test_light.global_position.y - origin.y) / ray.y)


func _move_test_light(screen_point: Vector2) -> void:
	var next := _light_plane_point(screen_point) + drag_offset
	var floor: Rect2 = shop.geometry.floor_bounds
	next.x = clampf(next.x, floor.position.x + 0.15, floor.end.x - 0.15)
	next.z = clampf(next.z, floor.position.y + 0.15, floor.end.y - 0.15)
	test_light.global_position = next
	_update_edge_light()


func _input(event: InputEvent) -> void:
	if dragging_light:
		if event is InputEventMouseMotion:
			_move_test_light(event.position)
			get_viewport().set_input_as_handled()
		elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			dragging_light = false
			get_viewport().set_input_as_handled()


func _resize_raster() -> void:
	var stretch_scale := get_viewport().get_stretch_transform().get_scale()
	_physical_size = Vector2i((size * stretch_scale).round()).max(Vector2i(2, 2))
	_display.scale = Vector2.ONE / stretch_scale


func _update_pixel_size(pixel_size: float) -> void:
	var pixel_step := int(pixel_size)
	shop.presentation_minimum = pixel_step
	value_label.text = "%d×%d px" % [pixel_step, pixel_step]
	save_button.text = "게임 기본값 저장"
	save_button.disabled = pixel_step == saved_pixel_size


func _process(_delta: float) -> void:
	var physical := Vector2(_physical_size)
	var height: float = shop.view_height(physical.x / physical.y, shop.preview_zoom)
	var effective_size := WorldDisplaySettings.camera_pixel_size(shop.presentation_minimum, physical.y / (height * shop.Layout.PPU))
	var visible_raster := physical / effective_size
	var raster_size := WorldDisplaySettings.padded_raster_size(visible_raster)
	if viewport.size != raster_size or shop.preview_visible_raster != visible_raster:
		shop.preview_visible_raster = visible_raster
		viewport.size = raster_size
		shop._update_preview_frame()
	presenter.size = Vector2(viewport.size * effective_size)
	var residual: Vector2 = shop.camera_texel_offset
	_display.position = WorldDisplaySettings.presentation_offset(presenter.size, physical, residual, effective_size) * _display.scale
	if _world_presentation.get_shader_parameter("pixel_size") != effective_size:
		_world_presentation.set_shader_parameter("pixel_size", effective_size)


func _save_default() -> void:
	if WorldDisplaySettings.save_pixel_size(int(slider.value)) == OK:
		saved_pixel_size = int(slider.value)
		save_button.text = "기본값 저장됨"
		save_button.disabled = true
	else:
		save_button.text = "저장 실패 · 다시 시도"


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT and test_light.visible:
			var camera: Camera3D = shop.camera
			var marker := WorldRenderer.raster_to_display(presenter, viewport.size, camera.unproject_position(test_light.global_position))
			if marker.distance_to(event.position) > 24.0:
				return
			dragging_light = true
			drag_offset = test_light.global_position - _light_plane_point(event.position)
			get_viewport().set_input_as_handled()
			return
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			shop.preview_zoom = minf(shop.preview_zoom * 1.15, 4.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			shop.preview_zoom = maxf(shop.preview_zoom / 1.15, 0.65)
		else:
			return
		_update_zoom_label()
		get_viewport().set_input_as_handled()


func _update_zoom_label() -> void:
	zoom_label.text = "확대 %d%% · 휠 확대/축소 · WASD 이동" % roundi(shop.preview_zoom * 100.0)
