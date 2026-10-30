extends Control

signal direction_changed(value: Vector2)

const DEAD_ZONE = .12
const TRAVEL = 38.0
var enabled = true
var touch_index = -1
var mouse_held = false
var direction = Vector2.ZERO
var knob_offset = Vector2.ZERO
var origin = Vector2.ZERO
var blocked_controls: Array[Control] = []

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(reset)

func set_enabled(value: bool) -> void:
	if enabled == value: return
	enabled = value
	if not enabled: reset()
	queue_redraw()

func reset() -> void:
	touch_index = -1
	mouse_held = false
	knob_offset = Vector2.ZERO
	direction = Vector2.ZERO
	direction_changed.emit(direction)
	queue_redraw()

func is_active() -> bool:
	return touch_index >= 0 or mouse_held

func can_start(point: Vector2) -> bool:
	if not enabled: return false
	for target in blocked_controls:
		if target.is_visible_in_tree() and target.get_global_rect().has_point(point): return false
	var local = get_global_transform_with_canvas().affine_inverse() * point
	# Left-hand reach zone; keep the bottom navigation and right-hand actions free.
	return Rect2(Vector2(0, size.y * .45), Vector2(size.x * .48, maxf(0, size.y * .55 - 60))).has_point(local)

func _begin(point: Vector2) -> void:
	origin = get_global_transform_with_canvas().affine_inverse() * point
	_set_pointer(point)

func _set_pointer(point: Vector2) -> void:
	var offset = get_global_transform_with_canvas().affine_inverse() * point - origin
	knob_offset = offset.limit_length(TRAVEL)
	var amount = knob_offset.length() / TRAVEL
	direction = Vector2.ZERO if amount <= DEAD_ZONE else knob_offset.normalized() * ((amount - DEAD_ZONE) / (1.0 - DEAD_ZONE))
	direction_changed.emit(direction)
	queue_redraw()

func _input(event: InputEvent) -> void:
	if not enabled: return
	if event is InputEventScreenTouch:
		if event.pressed and not event.canceled and not is_active() and can_start(event.position):
			touch_index = event.index
			_begin(event.position)
		elif event.index == touch_index:
			if not event.pressed or event.canceled: reset()
		else: return
	elif event is InputEventScreenDrag and event.index == touch_index:
		_set_pointer(event.position)
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and not is_active() and can_start(event.position):
		mouse_held = true
		_begin(event.position)
	elif mouse_held and event is InputEventMouseMotion:
		_set_pointer(event.position)
	elif mouse_held and event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		reset()
	else: return
	get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT: reset()

func _draw() -> void:
	if not is_active(): return
	var center = origin
	var rim = Color(.86,.86,.86,.38)
	# Neutral translucent surfaces keep the world visible beneath the thumb.
	draw_circle(center,58,Color(.055,.055,.055,.24),true,-1,true)
	draw_arc(center,58,0,TAU,64,rim,1.0,true)
	draw_arc(center,TRAVEL,0,TAU,48,Color(1,1,1,.10),1.0,true)
	for axis in [Vector2.UP,Vector2.DOWN,Vector2.LEFT,Vector2.RIGHT]:
		draw_line(center+axis*49,center+axis*53,Color(1,1,1,.26),1.0,true)
	var knob = center+knob_offset
	draw_circle(knob+Vector2(0,2),23,Color(0,0,0,.10),true,-1,true)
	draw_circle(knob,22,Color(.14,.14,.14,.48),true,-1,true)
	draw_arc(knob,22,0,TAU,48,Color(.90,.90,.90,.46),1.0,true)
	draw_arc(knob,19,-PI*.82,-PI*.18,24,Color(1,1,1,.12),.8,true)
