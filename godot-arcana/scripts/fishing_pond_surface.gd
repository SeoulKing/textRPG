extends Control
## Displays the saved plaza water and sends pointer transitions to the fishing controller.
signal hold_changed(pressed: bool)
signal close_requested

const WATER := preload("res://art/export/river-pixel-v5/base.res")
const GLINTS := preload("res://art/export/river-pixel-v5/highlights.res")
const TOOLS := preload("res://art/export/fishing-v3-mystic/tools.res")
const FONT := preload("res://fonts/NotoSansKR-SemiBold.tres")
const BOBBER := Rect2(50, 41, 10, 10)
const CAUGHT_FISH: Texture2D = preload("res://art/export/items/river-fish.png")
const CATCH_DURATION := 0.70
const WATER_SIDE := 448
const FLOAT_HEIGHT := 0.32
const REEL_AREA_START := 0.48
const MOUSE_POINTER := -1
const NO_POINTER := -2

var meter_slot := MarginContainer.new()
var _footer: PanelContainer
var _controls: BoxContainer
var _hint: Label
var _catch_panel: PanelContainer
var _catch_title: Label
var _catch_reward: Label
var _phase := "casting"
var _message := ""
var _time := 0.0
var _phase_age := 0.0
var _reduced := false
var _pointer := NO_POINTER
var _sent_hold := false
var _reel_id := ""
var _has_reel_sample := false
var _fish_sample := 0.45
var _fish_position := 0.45
var _fish_rising := true
var _fish_angle := 0.0
var _in_catch_zone := true
var _fish_pull := 0.0
var _rod_tension := 0.0
var _rod_lift := 0.0
var reel_held := false:
	set(value):
		if reel_held == value: return
		reel_held = value
		if _phase == "reeling": queue_redraw()

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	accessibility_name = "연못 낚시"
	clip_contents = true
	meter_slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meter_slot.child_entered_tree.connect(func(child: Node):
		if child is Control: child.mouse_filter = Control.MOUSE_FILTER_IGNORE)
	add_child(meter_slot)
	_build_catch_panel()

	_footer = PanelContainer.new()
	_footer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color("132e39ec")
	panel.content_margin_left = 16
	panel.content_margin_right = 16
	panel.content_margin_top = 6
	panel.content_margin_bottom = 6
	_footer.add_theme_stylebox_override("panel", panel)
	add_child(_footer)
	_footer.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_footer.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_controls = BoxContainer.new()
	_controls.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_controls.add_theme_constant_override("separation", 10)
	_footer.add_child(_controls)
	_hint = Label.new()
	_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint.add_theme_font_override("font", FONT)
	_hint.add_theme_font_size_override("font_size", 15)
	_hint.add_theme_color_override("font_color", Color("f3f8f7"))
	_controls.add_child(_hint)
	var close := Button.new()
	close.text = "낚싯대 접기"
	close.custom_minimum_size = Vector2(100, 44)
	close.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	close.add_theme_font_override("font", FONT)
	close.add_theme_font_size_override("font_size", 14)
	close.pressed.connect(func(): close_requested.emit())
	_controls.add_child(close)
	resized.connect(_layout)
	_footer.minimum_size_changed.connect(_layout, CONNECT_DEFERRED)
	_catch_panel.minimum_size_changed.connect(_layout, CONNECT_DEFERRED)
	visibility_changed.connect(_sync_visibility)
	_layout()
	_describe_phase()
	_sync_visibility()

func _build_catch_panel() -> void:
	_catch_panel = PanelContainer.new()
	_catch_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color("132e39f5")
	style.set_corner_radius_all(5)
	style.border_color = Color("e9cd86")
	style.set_border_width_all(1)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 9
	style.content_margin_bottom = 9
	_catch_panel.add_theme_stylebox_override("panel", style)
	add_child(_catch_panel)
	var text := VBoxContainer.new()
	text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	text.add_theme_constant_override("separation", 3)
	_catch_panel.add_child(text)
	_catch_title = Label.new()
	_catch_title.add_theme_font_size_override("font_size", 24)
	_catch_title.add_theme_color_override("font_color", Color("ffe49c"))
	_catch_reward = Label.new()
	_catch_reward.add_theme_font_size_override("font_size", 15)
	_catch_reward.add_theme_color_override("font_color", Color("f4f8f6"))
	for label: Label in [_catch_title, _catch_reward]:
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.add_theme_font_override("font", FONT)
		text.add_child(label)
	_catch_panel.hide()

func present(phase: String, reduced_motion: bool, message: String = "") -> void:
	if phase == _phase and reduced_motion == _reduced and message == _message: return
	if _phase != phase:
		_phase = phase
		_phase_age = 0.0
	_reduced = reduced_motion
	_message = message
	if not is_node_ready(): return
	_describe_phase()
	set_process(is_visible_in_tree() and not _reduced)
	queue_redraw()

func set_reel_state(value: Dictionary) -> void:
	var phase := str(value.get("phase", ""))
	var cast_id := str(value.get("id", ""))
	if phase != "reeling":
		_has_reel_sample = false
		return
	var sample := clampf(float(value.get("fish", 0.45)), 0.0, 1.0)
	if not _has_reel_sample or cast_id != _reel_id:
		_fish_position = sample
		_fish_rising = true
		_fish_angle = 0.0
		_rod_lift = 1.0 if reel_held else 0.0
		_rod_tension = 0.0
	elif not is_equal_approx(sample, _fish_sample):
		_fish_rising = sample > _fish_sample
	_has_reel_sample = true
	_reel_id = cast_id
	_fish_sample = sample
	var half_width := float(value.get("width", 0.26)) * 0.5
	var distance := absf(sample - float(value.get("bar", 0.35)))
	_in_catch_zone = distance <= half_width
	_fish_pull = clampf(distance / maxf(0.01, half_width * 2.0), 0.0, 1.0)
	if _phase == "reeling": queue_redraw()

func _describe_phase() -> void:
	meter_slot.visible = _phase == "reeling"
	_catch_panel.visible = _phase == "success"
	match _phase:
		"casting": _hint.text = "찌를 던지고 있습니다…"
		"waiting": _hint.text = "!가 뜨면 수면을 누르세요."
		"bite": _hint.text = "지금 눌러 챔질하세요!"
		"reeling": _hint.text = "물고기를 초록 구간에 유지하세요.\n누르면 상승 · 떼면 하강"
		"escaped":
			var reason := _message if not _message.is_empty() else "물고기를 놓쳤습니다."
			_hint.text = reason + " 수면을 눌러 다시 던지세요."
		"success":
			const PERFECT_SUFFIX := " · 완벽한 포획!"
			_catch_title.text = "완벽한 포획!" if _message.ends_with(PERFECT_SUFFIX) else "민물고기를 낚았습니다!"
			_catch_reward.text = _message.trim_suffix(PERFECT_SUFFIX)
			_catch_reward.visible = not _catch_reward.text.is_empty()
			_hint.text = "수면을 눌러 계속"
			accessibility_description = "%s %s %s" % [_catch_title.text, _catch_reward.text, _hint.text]
			_layout()
			return
	accessibility_description = _hint.text

func _layout() -> void:
	_controls.vertical = size.x < 300
	var footer_height := _footer.get_combined_minimum_size().y
	_footer.offset_top = -footer_height
	var area_height := maxf(1.0, size.y - footer_height)
	var reel_top := area_height * REEL_AREA_START
	var margin := minf(12.0, area_height * 0.025)
	var meter_height := clampf(area_height - reel_top - 2.0 * margin, 1.0, 270.0)
	meter_slot.size = Vector2(108, meter_height).round()
	meter_slot.position = Vector2((size.x - meter_slot.size.x) * 0.5, (reel_top + area_height - meter_slot.size.y) * 0.5).round()
	if _catch_panel.visible:
		_catch_panel.size = Vector2(clampf(size.x - 20.0, 1.0, 332.0), 0.0)
		var below_fish := area_height * 0.48 + CAUGHT_FISH.get_height() * 0.5 * _tackle_zoom(area_height) + 16.0
		var panel_top := minf(below_fish, area_height - _catch_panel.size.y - 6.0)
		_catch_panel.position = Vector2((size.x - _catch_panel.size.x) * 0.5, maxf(0, panel_top)).round()
	queue_redraw()

func _sync_visibility() -> void:
	if not is_visible_in_tree(): reset_pointer()
	set_process(is_visible_in_tree() and not _reduced)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		reset_pointer()

func reset_pointer() -> void:
	_pointer = NO_POINTER
	if _sent_hold:
		_sent_hold = false
		hold_changed.emit(false)

func _gui_input(event: InputEvent) -> void:
	if event.device == InputEvent.DEVICE_ID_EMULATION: return
	var pointer: int
	var down: bool
	if event is InputEventScreenTouch:
		pointer = event.index
		down = event.pressed and not event.canceled
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		pointer = MOUSE_POINTER
		down = event.pressed and not event.canceled
	else:
		return
	accept_event()
	if down and _pointer == NO_POINTER:
		_pointer = pointer
		# Waiting fingers stay captured until release, even if a bite arrives.
		if _phase in ["bite", "reeling", "escaped", "success"]:
			_sent_hold = true
			hold_changed.emit(true)
	elif not down and pointer == _pointer:
		reset_pointer()

func _process(delta: float) -> void:
	var frame := floori(_time * 24.0)
	var step := minf(delta, 0.1)
	_time += step
	_phase_age += step
	if _phase == "reeling":
		# Interpolate the last observed position; the server decides every turn.
		_fish_position = lerpf(_fish_position, _fish_sample, 1.0 - exp(-18.0 * step))
		_fish_angle = move_toward(_fish_angle, 0.0 if _fish_rising else PI, step * PI / 0.22)
		_rod_lift = lerpf(_rod_lift, 1.0 if reel_held else 0.0, 1.0 - exp(-15.0 * step))
		_rod_tension = lerpf(_rod_tension, _fish_pull, 1.0 - exp(-11.0 * step))
	if frame != floori(_time * 24.0): queue_redraw()

func _water_zoom() -> int:
	return maxi(2, ceili(maxf(size.x, size.y) / WATER_SIDE))

func _tackle_zoom(available_height: float) -> int:
	return mini(_water_zoom(), maxi(1, floori(available_height / 110.0)))

func _draw() -> void:
	if size.x <= 0.0 or size.y <= 0.0: return
	var water_zoom := _water_zoom()
	var water_size := (size / water_zoom).ceil()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE * water_zoom)
	var crop := ((Vector2.ONE * WATER_SIDE - water_size) * 0.5).floor()
	var rect := Rect2(Vector2.ZERO, water_size)
	draw_texture_rect_region(WATER, rect, Rect2(crop, water_size), Color(0.72, 0.86, 0.75))
	var frame := 0 if _reduced else floori(_time * 8.0) % 16
	var origin := Vector2(frame % 4, floori(frame / 4.0)) * WATER_SIDE
	draw_texture_rect_region(GLINTS, rect, Rect2(origin + crop, water_size), Color(0.72, 0.86, 0.75, 0.60))

	var zoom := _tackle_zoom(_footer.position.y)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE * zoom)
	var water_width := size.x / zoom
	var usable_height := maxf(1.0, _footer.position.y / zoom)
	var swim_bottom := usable_height * REEL_AREA_START
	var anchor := Vector2(water_width * 0.5, usable_height * FLOAT_HEIGHT).round()
	var bobber := anchor
	if not _reduced:
		if _phase == "casting": bobber.y -= 12.0 * (1.0 - smoothstep(0.0, 0.42, _phase_age))
		elif _phase == "waiting": bobber.y += sin(_phase_age * 3.0) * 1.5
	if _phase == "bite":
		bobber.y += 3.0 if _reduced else 3.0 + absf(sin(_phase_age * 9.0)) * 2.0
	elif _phase == "reeling" and not _reduced:
		bobber.y += sin(_phase_age * (6.0 if _in_catch_zone else 10.0)) * 1.5
	bobber = bobber.round()
	var source := BOBBER
	if _phase == "bite": source.size.y = 6
	if _phase == "reeling":
		_draw_swimming_fish(bobber, water_width, swim_bottom, zoom)
		var speed := 7.0 if _in_catch_zone else 14.0
		var ripple := 0.0 if _reduced else fmod(_time * speed, 6.0)
		_draw_ring(anchor, 8.0 + ripple, Color(0.77, 0.96, 0.99, 0.58 - ripple * 0.05))
		if not _in_catch_zone:
			_draw_ring(anchor, 13.0 + ripple, Color(0.88, 0.97, 1.0, 0.42 - ripple * 0.04))
	elif _phase != "casting" and _phase != "success":
		_draw_ripples(anchor)
	var start := Vector2(-2, swim_bottom * 0.86).round()
	var sag := 15.0
	if _phase == "reeling":
		var tension := _rod_tension if not _reduced else (0.25 if _in_catch_zone else 0.75)
		var lift := _rod_lift if not _reduced else float(reel_held)
		start = _draw_rod_tip(water_width, swim_bottom, tension, lift)
		sag = lerpf(17.0, 3.0, tension * 0.65 + lift * 0.35)
	var line := PackedVector2Array()
	for i in range(9):
		var t := float(i) / 8.0
		line.append((start.lerp(bobber, t) + Vector2.DOWN * (t * (1.0 - t) * sag)).round())
	draw_polyline(line, Color("f7eed1"), 1.0, false)
	draw_texture_rect_region(TOOLS, Rect2(bobber - BOBBER.size, source.size * 2.0), source)
	if _phase == "success":
		var center := Vector2(anchor.x, usable_height * 0.48)
		_draw_catch(anchor, center, minf(44.0, usable_height * 0.22))
	if _phase == "bite":
		var top := Rect2(anchor + Vector2(-2, -32), Vector2(4, 14))
		var dot := Rect2(anchor + Vector2(-2, -14), Vector2(4, 4))
		for mark: Rect2 in [top, dot]:
			draw_rect(mark.grow(1), Color("3a3026"))
			draw_rect(mark, Color("ffe29a"))

func _draw_rod_tip(water_width: float, water_height: float, tension: float, lift: float) -> Vector2:
	var reach := clampf(water_width * 0.24, 18.0, 66.0)
	var heel := Vector2(-10.0, water_height * 0.85 + minf(water_height * 0.05, 12.0))
	var rise := minf(water_height * 0.17, 44.0)
	var tip := Vector2(reach, heel.y - rise)
	tip += Vector2(tension * 4.0 - lift * 3.0, tension * 6.0 - lift * 10.0)
	var bend := heel.lerp(tip, 0.50) + Vector2(-4, -4.0 - tension * 18.0 - lift * 7.0)
	var previous := heel.round()
	for index in range(1, 7):
		var t := index / 6.0
		var point := heel.lerp(bend, t).lerp(bend.lerp(tip, t), t).round()
		var thickness := 4.0 - floorf(t * 2.0)
		draw_line(previous, point, Color("272d47"), thickness)
		draw_line(previous + Vector2.UP, point + Vector2.UP, Color("947c6b"), thickness - 1.0)
		if index in [2, 4, 6]:
			draw_rect(Rect2(point + Vector2(-1, 0), Vector2(3, 3)), Color("303d4b"))
			draw_rect(Rect2(point + Vector2(0, 1), Vector2.ONE), Color("c8d8da"))
		previous = point
	return previous + Vector2(0, 1)

func _draw_swimming_fish(bobber: Vector2, water_width: float, swim_bottom: float, zoom: int) -> void:
	var room := maxf(1.0, swim_bottom - bobber.y)
	var fish_size := clampf(floorf(minf(room * 0.5, water_width * 0.16)), 6.0, 32.0)
	var reach := minf(34.0, minf(water_width * 0.16, room * 0.72))
	var near_drop := fish_size * 0.60 + 5.0
	var far_drop := clampf(room - fish_size * 0.72 - 2.0, near_drop, near_drop + 14.0)
	var depth := 0.5 if _reduced else _fish_position
	var fish := bobber + Vector2(lerpf(-reach, reach, depth), lerpf(far_drop, near_drop, depth))
	var angle := 0.0 if _reduced else _fish_angle
	var stroke := 0.0 if _reduced else sin(_time * (8.0 if _in_catch_zone else 13.0))
	fish.y += stroke * (0.65 if _in_catch_zone else 1.4)
	fish = fish.round()

	# The original fish faces up and right. A half turn follows a descending sample.
	draw_set_transform(fish * zoom, angle, Vector2.ONE * zoom)
	var tail := Vector2(-fish_size * 0.30, fish_size * 0.31).round()
	var wake := Color(0.72, 0.94, 0.96, 0.34 if _in_catch_zone else 0.62)
	var drift := roundf(stroke)
	draw_line(tail + Vector2(-2, 0), tail + Vector2(-6, drift), wake, 1.0)
	if not _in_catch_zone:
		draw_line(tail + Vector2(0, 3), tail + Vector2(-3, 6 + drift), wake, 1.0)
	var body := Vector2(fish_size + roundf(stroke), fish_size)
	var sprite := Rect2((-body * 0.5).round(), body)
	var tint := Color("b1dcd9de") if _in_catch_zone else Color("8fbdc8d8")
	draw_texture_rect(CAUGHT_FISH, sprite, false, tint)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE * zoom)

	var hook := fish + Vector2(1, -1).rotated(angle) * fish_size * 0.26
	draw_line(bobber, hook.round(), Color(0.72, 0.92, 0.94, 0.45), 1.0)

func _draw_ripples(center: Vector2) -> void:
	var drift := 0.0 if _reduced else fmod(_time * 9.0, 7.0)
	for ring in range(2):
		var radius := 8.0 + 7.0 * ring + drift
		_draw_ring(center, radius, Color(0.8, 0.95, 1.0, 0.65 - ring * 0.20))

func _draw_ring(center: Vector2, radius: float, tint: Color) -> void:
	var points := PackedVector2Array()
	for i in range(25):
		var angle := TAU * i / 24.0
		points.append((center + Vector2(cos(angle) * radius, sin(angle) * radius * 0.5 + 4.0)).round())
	draw_polyline(points, tint, 1.0, false)

func _draw_catch(launch: Vector2, center: Vector2, height: float) -> void:
	var t := 1.0 if _reduced else clampf(_phase_age / CATCH_DURATION, 0.0, 1.0)
	if t < 1.0:
		var fade := 1.0 - t
		var spray := Color(0.88, 0.98, 1.0, fade)
		_draw_ring(launch, lerpf(4.0, 33.0, t), spray)
		_draw_ring(launch, lerpf(2.0, 22.0, t), Color(0.70, 0.91, 1.0, fade * 0.8))
		for drift: Vector2 in [Vector2(-20, -11), Vector2(-9, -18), Vector2(8, -15), Vector2(20, -9)]:
			var drop := launch + Vector2(drift.x * t, drift.y * 4.0 * t * fade)
			draw_rect(Rect2(drop.round(), Vector2(2.0, 3.0)), spray)
	var fish := launch.lerp(center, smoothstep(0.0, 1.0, t))
	fish.y -= height * 4.0 * t * (1.0 - t)
	var fish_size := CAUGHT_FISH.get_size()
	var destination := Rect2((fish - fish_size * 0.5).round(), fish_size)
	draw_texture_rect(CAUGHT_FISH, Rect2(destination.position + Vector2(1, 2), fish_size), false, Color("194256"))
	draw_texture_rect(CAUGHT_FISH, destination, false)
