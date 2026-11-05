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
	var shade := ColorRect.new()
	shade.color = Color(0.04,.08,.12,.04)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	center.anchor_left = .54
	center.anchor_top = .12
	center.anchor_bottom = .88
	center.offset_right = -6
	add_child(center)
	card = PanelContainer.new()
	card.add_theme_font_override("font",FONT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("fffaf0")
	style.set_corner_radius_all(18)
	style.content_margin_left = 8
	style.content_margin_right = 8
	style.content_margin_top = 18
	style.content_margin_bottom = 18
	card.add_theme_stylebox_override("panel",style)
	center.add_child(card)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",12)
	card.add_child(column)
	heading = _label(column,17)
	heading.text = "강 낚시"
	hint = _label(column,13)
	meter = Meter.new()
	meter.custom_minimum_size = Vector2(0,140)
	column.add_child(meter)
	growth = _label(column,12)
	action = Button.new()
	action.custom_minimum_size = Vector2(0,66)
	action.focus_mode = Control.FOCUS_NONE
	action.add_theme_font_size_override("font_size",13)
	action.button_down.connect(func(): pointer_held = true; _update_hold())
	action.button_up.connect(func(): pointer_held = false; _update_hold())
	action.pressed.connect(func():
		if state.get("phase","") in ["success","escaped"]: _cast())
	column.add_child(action)
	close_button = Button.new()
	close_button.text = "그만하기 · Esc"
	close_button.add_theme_font_size_override("font_size",12)
	close_button.custom_minimum_size = Vector2(0,48)
	close_button.pressed.connect(_close)
	column.add_child(close_button)
	hide()

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
	show()
	_cast()

func _cast() -> void:
	if opening or closing: return
	opening = true
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
		if not opening: hide()
		return
	if closing: return
	state = value
	if not opening: show()
	meter.accept(state)
	meter.held = held
	var phase: String = str(state.get("phase",""))
	meter.modulate.a = 1.0 if phase == "reeling" else .25
	var message: String = str(state.get("message",""))
	if phase == "waiting":
		hint.text = "입질을 기다리세요.\n느낌표가 뜨면 바로 누르세요."
		action.text = "기다리는 중…"
	elif phase == "bite":
		hint.text = "!  입질입니다!\n지금 누르면 챔질합니다."
		action.text = "챔질! · Space"
	elif phase == "reeling":
		hint.text = "물고기를 초록 구간 안에 유지하세요.\n누르면 상승 · 떼면 하강"
		action.text = "누르기 / 떼기"
	else:
		hint.text = message
		action.text = "다시 던지기"
	var xp: float = float(main._combat().get("skillTraining",{}).get("fishing",{}).get("xp",0))
	growth.text = "숙련도 %.2f / 100\n경험치 %d / 10000" % [minf(100,xp/100),int(xp)]

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

func _close() -> void:
	if closing or opening: return
	closing = true
	var result: Dictionary = await main.combat_socket.request({"command":"fishing_cancel"})
	closing = false
	if result.has("error"):
		main.ui.toast(str(result.get("message","낚시 종료를 확인하지 못했습니다.")))
		return
	state = {}
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	held = false
	keyboard_held = false
	pointer_held = false
	hide()
	main._accept_online_result(result)

func _input(event: InputEvent) -> void:
	if not visible: return
	if event is InputEventKey:
		if event.physical_keycode in [KEY_SPACE,KEY_E] and not event.echo:
			keyboard_held = event.pressed
			_update_hold()
		elif event.pressed and event.physical_keycode == KEY_ESCAPE:
			_close()
		get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	if not visible: return
	card.custom_minimum_size.x = minf(220,maxf(150,size.x*.44-10))
	if (not main.page_active or not main.combat_socket.socket_ready) and not cancel_sent:
		keyboard_held = false
		pointer_held = false
		_update_hold()
		cancel_sent = true
		if main.combat_socket.socket_ready: _close()
	if main.page_active and main.combat_socket.socket_ready: cancel_sent = false
