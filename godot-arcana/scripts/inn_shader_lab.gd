extends Control

const LOBBY := preload("res://scenes/inn_lobby_3d.tscn")
const CameraPixelView := preload("res://scripts/rendering/tutorial_pixel_view.gd")
const CameraPixelProfile := preload("res://scripts/rendering/camera_pixel_profile.gd")
const DEFAULT_PROFILE := preload("res://art/resources/camera_pixel_profile.tres")
const InnPreset := preload("res://scripts/rendering/inn_shader_preset.gd")
const REFERENCE_PAN := Vector3(2.23036956787109, 0.341412276029587, -0.901820182800293)
const CAMERA_DISTANCE := 24.0
const CAMERA_DEFAULTS := {"zoom": 100.0, "pitch": 30.0, "yaw": 0.0}
const HIGH_SHADOW_SIZE := 8192

@onready var _approved_preset := InnPreset.load_approved() as InnPreset
var _view: CameraPixelView
var _camera: Camera3D
var _profile: CameraPixelProfile = DEFAULT_PROFILE.duplicate() as CameraPixelProfile
var _rows: VBoxContainer
var _sliders: Dictionary[String, HSlider] = {}
var _highlights: CheckButton
var _shade_bands: CheckButton
const LIGHT_DEFAULTS := {"highlight_strength": 10.0, "specular_nonmetal": 20.0, "specular_metal": 100.0, "specular_width": 30.0}
var _shadow_size: OptionButton
var _base_shadow_size: int
var _use_16bit_shadow: bool
var _original: CheckButton
var _status: Label
var _base_focus: Vector3
var _pan := REFERENCE_PAN


func _ready() -> void:
	get_window().title = "아르카나 · 여관 셰이더 실험실"
	get_window().content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	get_window().min_size = Vector2i(760, 520)
	_base_shadow_size = int(ProjectSettings.get_setting(InnPreset.SHADOW_SIZE_SETTING, 4096))
	_use_16bit_shadow = bool(ProjectSettings.get_setting(InnPreset.SHADOW_DEPTH_SETTING, false))
	var layout := HBoxContainer.new()
	layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layout.add_theme_constant_override("separation", 0)
	add_child(layout)
	_build_view(layout)
	_build_controls(layout)
	_apply_approved_preset()


func _exit_tree() -> void:
	if _base_shadow_size > 0:
		RenderingServer.directional_shadow_atlas_set_size(_base_shadow_size, _use_16bit_shadow)


func _build_view(layout: HBoxContainer) -> void:
	_view = CameraPixelView.new()
	_view.name = "CameraView"
	_view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_view.reference_raster_size = InnPreset.REFERENCE_RASTER
	_view.profile = _profile
	_view.gui_input.connect(_view_input)
	layout.add_child(_view)
	var lobby := LOBBY.instantiate()
	_view.raster.add_child(lobby)
	_camera = lobby.get_node("Camera3D") as Camera3D
	_base_focus = _camera.position - _camera.basis.z * CAMERA_DISTANCE
	_camera.keep_aspect = Camera3D.KEEP_HEIGHT
	_camera.size = InnPreset.REFERENCE_HEIGHT
	_view.attach_camera(_camera)
	_view.configure_world(lobby)


func _set_shadow_size(index: int) -> void:
	RenderingServer.directional_shadow_atlas_set_size(_shadow_size.get_item_id(index), _use_16bit_shadow)


func _build_controls(layout: HBoxContainer) -> void:
	var panel := PanelContainer.new()
	panel.custom_minimum_size.x = 320.0
	var skin := StyleBoxFlat.new()
	skin.bg_color = Color("20232a")
	skin.border_width_left = 1
	skin.border_color = Color("454853")
	panel.add_theme_stylebox_override("panel", skin)
	layout.add_child(panel)
	var margin := MarginContainer.new()
	for side: String in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	panel.add_child(margin)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	margin.add_child(scroll)
	_rows = VBoxContainer.new()
	_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows.add_theme_constant_override("separation", 6)
	scroll.add_child(_rows)

	_label("여관 셰이더 실험실", 24, Color("f7dfaf"))
	_label("휠로 확대 · 왼쪽 드래그로 이동", 14, Color("bfc5d2"))
	_label("튜토리얼 조명과 픽셀", 17, Color("f7dfaf"))
	_slider("pixel_size", "공통 픽셀 크기", 1.0, 24.0, 1.0, "%d px")
	_slider("outline_width", "외곽선 두께", 0.0, 3.0, 1.0, "%d 칸")
	_slider("outline_strength", "외곽선 진하기", 0.0, 100.0, 1.0, "%d%%")
	_highlights = CheckButton.new()
	_highlights.text = "모서리 하이라이트"
	_highlights.button_pressed = true
	_highlights.toggled.connect(_view.set_highlights_enabled)
	_rows.add_child(_highlights)
	_slider("highlight_strength", "하이라이트 밝기", 0.0, 50.0, 1.0, "%d%%")
	_rows.add_child(HSeparator.new())
	_label("재질 반사광", 17, Color("f7dfaf"))
	_slider("specular_nonmetal", "일반 재질 반사", 0.0, 100.0, 1.0, "%d%%")
	_slider("specular_metal", "금속 반사", 0.0, 100.0, 1.0, "%d%%")
	_slider("specular_width", "반사광 범위", 0.0, 100.0, 1.0, "%d%%")
	_update_specular()
	_rows.add_child(HSeparator.new())
	_shade_bands = CheckButton.new()
	_shade_bands.text = "4단계 명암"
	_shade_bands.button_pressed = _profile.shade_bands
	_shade_bands.toggled.connect(func(on: bool):
		_profile.shade_bands = on
		_sliders["specular_width"].editable = on
		_view.apply_profile(_profile))
	_rows.add_child(_shade_bands)
	_label("방향광 그림자 해상도", 14, Color.WHITE)
	_shadow_size = OptionButton.new()
	_shadow_size.add_item("%d × %d (기본)" % [_base_shadow_size, _base_shadow_size], _base_shadow_size)
	if _base_shadow_size < HIGH_SHADOW_SIZE:
		_shadow_size.add_item("8192 × 8192", HIGH_SHADOW_SIZE)
	_shadow_size.select(_shadow_size.item_count - 1)
	_shadow_size.item_selected.connect(_set_shadow_size)
	_rows.add_child(_shadow_size)
	_set_shadow_size(_shadow_size.selected)
	_original = CheckButton.new()
	_original.text = "원본 보기"
	_original.toggled.connect(func(on: bool): _view.set_effect_enabled(not on))
	_rows.add_child(_original)

	_rows.add_child(HSeparator.new())
	_label("카메라", 17, Color("f7dfaf"))
	_slider("zoom", "화면 확대", 50.0, 400.0, 1.0, "%d%%")
	_slider("pitch", "내려다보는 각도", 20.0, 80.0, 1.0, "%d°")
	_slider("yaw", "좌우 회전", -55.0, 55.0, 1.0, "%d°")
	var actions := HBoxContainer.new()
	_rows.add_child(actions)
	var reset := Button.new()
	reset.text = "확정값 복원"
	reset.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset.pressed.connect(_reset)
	actions.add_child(reset)
	var copy := Button.new()
	copy.text = "설정값 복사"
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.pressed.connect(_copy_settings)
	actions.add_child(copy)
	_status = _label("확정 프리셋 · 조절값은 자동 저장되지 않습니다.", 13, Color("bfc5d2"))
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART


func _label(caption: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = caption
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	_rows.add_child(label)
	return label


func _slider(key: String, title: String, low: float, high: float, step: float, format: String) -> void:
	var initial := float(CAMERA_DEFAULTS[key] if CAMERA_DEFAULTS.has(key) else LIGHT_DEFAULTS.get(key, _profile.get(key)))
	var row := HBoxContainer.new()
	_rows.add_child(row)
	var name_label := Label.new()
	name_label.text = title
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name_label)
	var number := Label.new()
	number.text = format % initial
	row.add_child(number)
	var slider := HSlider.new()
	slider.min_value = low
	slider.max_value = high
	slider.step = step
	slider.value = initial
	slider.tooltip_text = title
	slider.value_changed.connect(func(value: float):
		number.text = format % value
		_apply(key, value))
	_rows.add_child(slider)
	_sliders[key] = slider


func _apply(key: String, value: float) -> void:
	match key:
		"zoom":
			_view.display_zoom = value / 100.0
		"highlight_strength":
			_view.set_highlight_strength(value / 100.0)
		"specular_nonmetal", "specular_metal", "specular_width":
			_update_specular()
		"pitch", "yaw":
			_update_camera()
		_:
			_profile.set(key, int(value))
			_view.apply_profile(_profile)


func _update_specular() -> void:
	_view.set_specular_controls(_sliders["specular_nonmetal"].value / 100.0,
		_sliders["specular_metal"].value / 100.0,
		InnPreset.specular_cutoff(_sliders["specular_width"].value))

func _update_camera() -> void:
	_camera.rotation_degrees = Vector3(-_sliders["pitch"].value, _sliders["yaw"].value, 0.0)
	_view.set_camera_position(_base_focus + _pan + _camera.basis.z * CAMERA_DISTANCE)


func _view_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP or event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			var factor := 1.12 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / 1.12
			_sliders["zoom"].value *= factor
			_view.accept_event()
	elif event is InputEventMouseMotion and (event.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0:
		var world_per_pixel := _view.world_per_display_pixel()
		_pan += (_camera.basis.y * event.relative.y - _camera.basis.x * event.relative.x) * world_per_pixel
		_update_camera()
		_view.accept_event()


func _apply_approved_preset() -> void:
	_pan = _approved_preset.pan
	for key: String in _approved_preset.sliders:
		if _sliders.has(key):
			_sliders[key].value = float(_approved_preset.sliders[key])
	# Initial values may already match a slider, so signals alone are insufficient.
	_profile.pixel_size = int(_sliders["pixel_size"].value)
	_profile.outline_width = int(_sliders["outline_width"].value)
	_profile.outline_strength = int(_sliders["outline_strength"].value)
	_profile.shade_bands = _approved_preset.shade_bands
	_shade_bands.button_pressed = _approved_preset.shade_bands
	_sliders["specular_width"].editable = _approved_preset.shade_bands
	_highlights.button_pressed = _approved_preset.highlights_enabled
	_view.set_highlights_enabled(_approved_preset.highlights_enabled)
	_view.set_highlight_strength(_sliders["highlight_strength"].value / 100.0)
	_view.apply_profile(_profile)
	_view.display_zoom = _sliders["zoom"].value / 100.0
	_update_specular()
	var shadow_index := _shadow_size.get_item_index(_approved_preset.directional_shadow_size)
	if shadow_index < 0:
		var shadow_size: int = _approved_preset.directional_shadow_size
		_shadow_size.add_item("%d × %d" % [shadow_size, shadow_size], shadow_size)
		shadow_index = _shadow_size.item_count - 1
	_shadow_size.select(shadow_index)
	_set_shadow_size(shadow_index)
	_original.button_pressed = not _approved_preset.effect_enabled
	_view.set_effect_enabled(_approved_preset.effect_enabled)
	_update_camera()


func _reset() -> void:
	_apply_approved_preset()
	_status.text = "확정한 설정으로 돌아왔습니다."

func _copy_settings() -> void:
	var result := {
		"geometry_highlights": _highlights.button_pressed,
		"shade_bands": _profile.shade_bands,
		"integer_scale": _view.presentation_scale,
		"directional_shadow_size": _shadow_size.get_selected_id(),
		"pan": [_pan.x, _pan.y, _pan.z],
		"raster_size": [_view.raster.size.x, _view.raster.size.y],
		"camera_height": InnPreset.REFERENCE_HEIGHT,
	}
	for key: String in _sliders:
		result[key] = _sliders[key].value
	DisplayServer.clipboard_set(JSON.stringify(result, "  "))
	_status.text = "셰이더와 카메라 설정값을 복사했습니다."
