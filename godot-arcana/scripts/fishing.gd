extends Control
## This view sends input transitions only; fish, catch and XP are server-owned.
const Meter = preload("res://scripts/fishing_meter.gd")
const FONT = preload("res://fonts/NotoSansKR-Medium.tres")
var main: Node
var meter: Control
var heading: Label
var hint: Label
var growth: Label
var action: Button
var cook_button: Button
var close_button: Button
var card: PanelContainer
var state: Dictionary = {}
var opening: bool = false
var closing: bool = false
var held: bool = false
var keyboard_held: bool = false
var pointer_held: bool = false
var cancel_sent: bool = false
var vfx: Node2D

func _ready() -> void:
	vfx = preload("res://scripts/fishing_world_vfx.gd").new()
	vfx.main = main
	main.world_renderer.add_child(vfx)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	z_index = 150
	var center := VBoxContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.alignment = BoxContainer.ALIGNMENT_END
	center.offset_left = 12
	center.offset_top = 12
	center.offset_right = -12
	center.offset_bottom = -14
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	card = PanelContainer.new()
	card.size_flags_horizontal = Control.SIZE_SHRINK_END
	card.add_theme_font_override("font",FONT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("fffaf0f2")
	style.set_corner_radius_all(18)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	card.add_theme_stylebox_override("panel",style)
	center.add_child(card)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",5)
	card.add_child(column)
	heading = _label(column,17)
	heading.text = "강 낚시"
	hint = _label(column,13)
	meter = Meter.new()
	meter.custom_minimum_size = Vector2(0,112)
	column.add_child(meter)
	growth = _label(column,12)
	cook_button = Button.new()
	cook_button.text = "잡은 생선 굽기"
	cook_button.tooltip_text = "모닥불에서 생선 굽기 · Enter"
	cook_button.focus_mode = Control.FOCUS_NONE
	cook_button.custom_minimum_size.y = 44
	cook_button.add_theme_font_size_override("font_size", 14)
	cook_button.add_theme_constant_override("icon_max_width", 24)
	cook_button.pressed.connect(_prepare_catch)
	column.add_child(cook_button)
	cook_button.hide()
	action = Button.new()
	action.custom_minimum_size = Vector2(0,44)
	action.focus_mode = Control.FOCUS_NONE
	action.add_theme_font_size_override("font_size",13)
	action.button_down.connect(func():
		if state.get("phase","") in ["success","escaped"]:
			_cast()
		else:
			pointer_held = true
			_update_hold())
	action.button_up.connect(func(): pointer_held = false; _update_hold())
	column.add_child(action)
	close_button = Button.new()
	close_button.text = "낚싯대 접기 · Esc"
	close_button.focus_mode = Control.FOCUS_NONE
	close_button.add_theme_font_size_override("font_size",12)
	close_button.custom_minimum_size = Vector2(0,40)
	close_button.pressed.connect(_close)
	column.add_child(close_button)
	visibility_changed.connect(_on_visibility_changed)
	resized.connect(_layout_card)
	_layout_card()
	hide()

func _layout_card() -> void:
	card.custom_minimum_size.x = clampf(size.x * .49, 160.0, 230.0)
	meter.custom_minimum_size.y = clampf(size.y * .19, 70.0, 126.0)

func _on_visibility_changed() -> void:
	main.ui.header.visible = not visible
	main.ui.action_cluster.visible = not visible
	main.ui.navigation.visible = not visible

func _label(parent: Node, font_size: int) -> Label:
	var label := Label.new()
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size",font_size)
	label.add_theme_color_override("font_color",Color("26364d"))
	parent.add_child(label)
	return label

func begin() -> void:
	if opening or visible or main.busy: return
	if not main.online_world:
		main.ui.toast("세계 서버에 연결한 뒤 낚시할 수 있습니다.")
		return
	if main._online_fighting() or main.spatial_combat.request_busy or main.spatial_combat.aim_owner != -1:
		main.ui.toast("전투와 주문 사용을 마친 뒤 낚시해 주세요.")
		return
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	main.spatial_combat.cancel_aim()
	main.ui.reset_touch_controls()
	cancel_sent = false
	show()
	_cast()

func _cast() -> void:
	if opening or closing: return
	opening = true
	state = {}
	heading.text = "광장 연못" if main.world.uses_plaza_v2() else "강 낚시"
	meter.hide()
	growth.hide()
	cook_button.hide()
	action.text = "찌 던지는 중"
	action.disabled = true
	keyboard_held = false
	pointer_held = false
	held = false
	hint.text = "찌를 던지고 있습니다…"
	var result: Dictionary = await main.combat_socket.request({"command":"fishing_cast"})
	opening = false
	action.disabled = false
	if result.has("error"):
		main.ui.toast(str(result.get("message","낚시를 시작하지 못했습니다.")))
		hide()
		return
	main._accept_online_result(result)

func accept(value: Variant) -> void:
	if value is not Dictionary or value.is_empty():
		if not opening:
			state = {}
			hide()
		return
	if closing: return
	state = value
	if not opening: show()
	meter.accept(state)
	meter.held = held
	var phase: String = str(state.get("phase",""))
	heading.text = "광장 연못" if state.get("pond",false) else "강 낚시"
	meter.visible = phase == "reeling"
	growth.visible = phase == "success"
	if phase == "success" and not cook_button.visible:
		cook_button.icon = main._item_thumbnail("grilledFish")
	cook_button.visible = phase == "success"
	action.disabled = opening or closing or (phase == "waiting" and state.get("pond",false))
	var message: String = str(state.get("message",""))
	if phase == "waiting":
		hint.text = "찌가 잠기면 챔질하세요."
		action.text = "입질 기다리는 중"
	elif phase == "bite":
		hint.text = "찌가 잠겼습니다!"
		action.text = "챔질 · Space / E"
	elif phase == "reeling":
		hint.text = "초록 구간에 물고기를 맞추세요."
		action.text = "누르면 상승 · 떼면 하강"
	else:
		if phase == "success":
			heading.text = "민물고기를 건졌습니다!"
		hint.text = message
		action.text = "다시 던지기 · Space / E"
	var xp: float = float(main._combat().get("skillTraining",{}).get("fishing",{}).get("xp",0))
	growth.text = "낚시 숙련도 %.2f / 100" % minf(100,xp/100)

func _update_hold() -> void:
	var next: bool = keyboard_held or pointer_held
	if next == held: return
	held = next
	meter.held = held
	if state.get("phase","") in ["waiting","bite","reeling"] and not opening and not closing:
		_send_hold(held)

func _send_hold(pressed: bool) -> void:
	var result: Dictionary = await main.combat_socket.request({"command":"fishing_press" if pressed else "fishing_release"})
	if result.has("error"):
		main.ui.toast(str(result.get("message","낚시 입력을 보내지 못했습니다.")))
		return
	main._accept_online_result(result)

func _prepare_catch() -> void:
	if state.get("phase", "") == "success" and await _close():
		main.prepare_fish()

func _close() -> bool:
	if closing or opening: return false
	closing = true
	var result: Dictionary = await main.combat_socket.request({"command":"fishing_cancel"})
	closing = false
	if result.has("error"):
		main.ui.toast(str(result.get("message","낚시 종료를 확인하지 못했습니다.")))
		return false
	if int(result.get("transportGeneration", -1)) != main.combat_socket.connection_generation: return false
	if not result.has("fishing") or result.fishing != null or result.get("resync", false):
		main._accept_online_result(result)
		main.ui.toast("낚시 상태를 갱신했습니다. 다시 시도해 주세요.")
		return false
	state = {}
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	held = false
	keyboard_held = false
	pointer_held = false
	hide()
	main._accept_online_result(result)
	return true

func _input(event: InputEvent) -> void:
	if not visible: return
	if event is InputEventKey:
		if event.physical_keycode in [KEY_SPACE,KEY_E] and not event.echo:
			if event.pressed and state.get("phase","") in ["success","escaped"]:
				_cast()
			elif not event.pressed or not action.disabled:
				keyboard_held = event.pressed
				_update_hold()
		elif event.pressed and not event.echo and event.physical_keycode in [KEY_ENTER, KEY_KP_ENTER]:
			_prepare_catch()
		elif event.pressed and event.physical_keycode == KEY_ESCAPE:
			_close()
		get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	if not visible: return
	if not main.combat_socket.socket_ready:
		state = {}
		hide()
		return
	if not main.page_active and not opening and not closing and not cancel_sent:
		keyboard_held = false
		pointer_held = false
		_update_hold()
		cancel_sent = true
		_close()
	if main.page_active and main.combat_socket.socket_ready: cancel_sent = false
