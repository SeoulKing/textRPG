extends Control
## This view sends input transitions only; fish, catch and XP are server-owned.
signal catch_confirmed(before: int, after: int)

const Meter = preload("res://scripts/fishing_meter.gd")
const PondSurface = preload("res://scripts/fishing_pond_surface.gd")
const ItemThumbnail = preload("res://scripts/item_thumbnail.gd")
const FONT = preload("res://fonts/NotoSansKR-Medium.tres")
const POND_RESULT_MS := 2800
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
var held_keys: Dictionary[int, bool] = {}
var pointer_held: bool = false
var cancel_sent: bool = false
var vfx: Node2D
var text_mode: bool = false
var card_layout: VBoxContainer
var _text_backdrop: ColorRect
var _graphics_card_style: StyleBoxFlat
var _observed_cast_id := ""
var _count_before_catch := -1
var _last_receipt_id := ""
var _pond: PondSurface
var _pond_active := false
var _pond_result_started_ms := -1
var _last_closed_pond_id := ""

func _ready() -> void:
	vfx = preload("res://scripts/fishing_world_vfx.gd").new()
	vfx.main = main
	main.world_renderer.add_child(vfx)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	z_index = 150
	_text_backdrop = ColorRect.new()
	_text_backdrop.color = Color("edf8ffed")
	_text_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_text_backdrop)
	_text_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_text_backdrop.hide()
	card_layout = VBoxContainer.new()
	card_layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	card_layout.alignment = BoxContainer.ALIGNMENT_END
	card_layout.offset_left = 12
	card_layout.offset_top = 12
	card_layout.offset_right = -12
	card_layout.offset_bottom = -14
	card_layout.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(card_layout)
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
	_graphics_card_style = style
	card.add_theme_stylebox_override("panel",style)
	card_layout.add_child(card)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",5)
	card.add_child(column)
	heading = _label(column,17)
	heading.text = "강 낚시"
	hint = _label(column,13)
	meter = Meter.new()
	meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meter.custom_minimum_size = Vector2(0,112)
	column.add_child(meter)
	growth = _label(column,12)
	cook_button = Button.new()
	cook_button.text = "잡은 생선 굽기"
	cook_button.tooltip_text = "모닥불에서 생선 굽기 · Enter"
	cook_button.focus_mode = Control.FOCUS_NONE
	cook_button.custom_minimum_size.y = 44
	cook_button.add_theme_font_size_override("font_size", 14)
	cook_button.add_theme_constant_override("icon_max_width", ItemThumbnail.SIDE)
	cook_button.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
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

func set_text_mode(enabled: bool) -> void:
	if text_mode == enabled: return
	text_mode = enabled
	reparent(main.ui.root if enabled else main.ui.hud, false)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	card_layout.alignment = BoxContainer.ALIGNMENT_CENTER if enabled else BoxContainer.ALIGNMENT_END
	card.size_flags_horizontal = Control.SIZE_SHRINK_CENTER if enabled else Control.SIZE_SHRINK_END
	_text_backdrop.visible = enabled
	if enabled:
		cook_button.icon = null
		var paper := _graphics_card_style.duplicate() as StyleBoxFlat
		paper.bg_color = Color.WHITE
		paper.border_color = main.ui.TEXT_RULE
		paper.set_border_width_all(1)
		card.add_theme_stylebox_override("panel", paper)
		for style_name in ["normal", "hover", "pressed"]:
			var fill: Color = main.ui.TEXT_SKY if style_name == "normal" else Color("9bd4f8")
			action.add_theme_stylebox_override(style_name, main.ui.style(fill))
		for color_name in ["font_color", "font_hover_color", "font_pressed_color"]:
			action.add_theme_color_override(color_name, main.ui.TEXT_INK)
	else:
		card.add_theme_stylebox_override("panel", _graphics_card_style)
		for style_name in ["normal", "hover", "pressed"]:
			action.remove_theme_stylebox_override(style_name)
		for color_name in ["font_color", "font_hover_color", "font_pressed_color"]:
			action.remove_theme_color_override(color_name)
	close_button.text = "낚싯대 접기" if enabled else "낚싯대 접기 · Esc"
	_layout_card()

func _layout_card() -> void:
	card.custom_minimum_size.x = clampf(size.x * .80, 260.0, 360.0) if text_mode else clampf(size.x * .49, 160.0, 230.0)
	meter.custom_minimum_size.y = 0.0 if _pond_active else clampf(size.y * .19, 70.0, 126.0)

func _show_fishing() -> void:
	if visible: return
	if text_mode and main.simplified_play.at_fishing_place():
		if not is_instance_valid(_pond):
			_pond = PondSurface.new()
			add_child(_pond)
			_pond.hold_changed.connect(_on_pond_hold)
			_pond.close_requested.connect(_close)
		_pond_active = true
		meter.set_pond_style(true, main.world.reduced_motion)
		card_layout.hide()
		_text_backdrop.hide()
		meter.reparent(_pond.meter_slot, false)
		_pond.show()
		main.simplified_play.set_pond_fishing_active(true)
		_layout_card()
	show()
	if _pond_active: _pond.grab_focus()

func _on_visibility_changed() -> void:
	if _pond_active and not visible:
		_pond_active = false
		meter.set_pond_style(false, false)
		_pond_result_started_ms = -1
		held_keys.clear()
		pointer_held = false
		held = false
		_pond.hide()
		meter.reparent(hint.get_parent(), false)
		hint.get_parent().move_child(meter, hint.get_index() + 1)
		card_layout.show()
		_text_backdrop.show()
		main.simplified_play.set_pond_fishing_active(false)
		_layout_card()
	if text_mode: return
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
	_show_fishing()
	_cast()

func _area_name(plaza_fishing: bool, pond: bool) -> String:
	if not plaza_fishing: return "강 낚시"
	return "광장 연못" if pond else "남쪽 강"

func _cast() -> void:
	if opening or closing: return
	opening = true
	state = {}
	heading.text = _area_name(main.world.uses_plaza_v2(), not main.world.has_terraced_plaza())
	meter.hide()
	growth.hide()
	hint.show()
	cook_button.hide()
	action.text = "찌 던지는 중"
	action.accessibility_description = ""
	action.disabled = true
	held_keys.clear()
	pointer_held = false
	held = false
	hint.text = "찌를 던지고 있습니다…"
	if _pond_active: _pond.present("casting", main.world.reduced_motion)
	var command := "fishing_cast_text_pond" if text_mode and main.simplified_play.at_fishing_place() else "fishing_cast"
	var result: Dictionary = await main.combat_socket.request({"command":command})
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
	var cast_id := str(value.get("id", ""))
	if not cast_id.is_empty() and cast_id == _last_closed_pond_id: return
	if closing:
		if _pond_active and cast_id == str(state.get("id", "")) and value.get("phase") == "success":
			_track_catch_receipt("success")
		return
	if _pond_active and state.get("phase") == "success" and state.get("id") == cast_id and value.get("phase") != "success": return
	state = value
	if not opening: _show_fishing()
	meter.accept(state)
	meter.held = held
	var phase: String = str(state.get("phase",""))
	var first_pond_success := phase == "success" and not cast_id.is_empty() and cast_id != _last_receipt_id
	_track_catch_receipt(phase)
	meter.visible = phase == "reeling"
	if _pond_active:
		var pond_message := str(state.get("message", "")) if phase in ["escaped", "success"] else ""
		_pond.present(phase, main.world.reduced_motion, pond_message)
		_pond.reel_held = held
		_pond.set_reel_state(state)
		if first_pond_success: _pond_result_started_ms = Time.get_ticks_msec()
		return
	var plaza_fishing: bool = state.get("plazaFishing", state.get("pond", false))
	heading.text = _area_name(plaza_fishing, state.get("pond", not main.world.has_terraced_plaza()))
	growth.visible = phase == "success"
	if phase == "success" and not cook_button.visible and not text_mode:
		cook_button.icon = main._item_thumbnail("grilledFish")
	cook_button.visible = phase == "success"
	action.disabled = opening or closing or (phase == "waiting" and plaza_fishing)
	var message: String = str(state.get("message",""))
	if phase == "waiting":
		hint.text = "찌가 잠기면 챔질하세요."
		action.text = "입질 기다리는 중"
	elif phase == "bite":
		hint.text = "찌가 잠겼습니다!"
		action.text = "챔질하기" if text_mode else "챔질 · Space / E"
	elif phase == "reeling":
		hint.text = "노란 물고기를 초록 구간 안에 유지하세요."
		if text_mode: hint.text = _text_reeling_hint()
		action.text = "누르면 상승 · 떼면 하강"
	else:
		if phase == "success":
			heading.text = "민물고기를 건졌습니다!"
		hint.text = message
		action.text = "다시 낚시하기" if text_mode else "다시 던지기 · Space / E"
	var xp: float = float(main._combat().get("skillTraining",{}).get("fishing",{}).get("xp",0))
	growth.text = "낚시 숙련도 %.2f / 100" % minf(100,xp/100)

func _on_pond_hold(pressed: bool) -> void:
	if not _pond_active or not visible: return
	var phase: String = str(state.get("phase", ""))
	if pressed:
		if opening or closing: return
		if phase == "success":
			_continue_after_catch()
			return
		if phase == "escaped":
			_cast()
			return
		if phase not in ["bite", "reeling"]: return
	pointer_held = pressed
	_update_hold()

func _continue_after_catch() -> void:
	var lift_ms := roundi(PondSurface.CATCH_DURATION * 1000.0)
	if main.world.reduced_motion or _pond_result_started_ms < 0 or Time.get_ticks_msec() - _pond_result_started_ms >= lift_ms:
		_close()

func _track_catch_receipt(phase: String) -> void:
	if not text_mode: return
	var cast_id := str(state.get("id", ""))
	if cast_id.is_empty() or cast_id == _last_receipt_id: return
	var count := int(main._state().get("inventory", {}).get("riverFish", 0))
	if phase != "success":
		_observed_cast_id = cast_id
		_count_before_catch = count
		return
	# accept() runs after the inventory from this server packet has been merged.
	# A resumed cast may arrive already successful, with no observed starting count.
	var before := _count_before_catch if _observed_cast_id == cast_id and _count_before_catch + 1 == count else -1
	_last_receipt_id = cast_id
	catch_confirmed.emit(before, count)

func _text_reeling_hint() -> String:
	var fish: float = float(state.get("fish", .45))
	var bar: float = float(state.get("bar", .35))
	var half_width: float = float(state.get("width", .26)) / 2.0
	var direction := "물고기가 초록 구간 안에 있습니다."
	if fish > bar + half_width:
		direction = "물고기가 위에 있습니다. 버튼을 누르세요."
	elif fish < bar - half_width:
		direction = "물고기가 아래에 있습니다. 버튼을 떼세요."
	return "%s\n물고기 %d%% · 조절대 %d%% · 진행 %d%%" % [direction, roundi(fish * 100.0), roundi(bar * 100.0), roundi(float(state.get("progress", 0.0)) * 100.0)]

func _update_hold() -> void:
	var next: bool = not held_keys.is_empty() or pointer_held
	if next == held: return
	held = next
	meter.held = held
	if _pond_active: _pond.reel_held = held
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
	_pond_result_started_ms = -1
	var closing_pond_id := str(state.get("id", "")) if _pond_active else ""
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
	if not closing_pond_id.is_empty(): _last_closed_pond_id = closing_pond_id
	state = {}
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	held = false
	held_keys.clear()
	pointer_held = false
	hide()
	main._accept_online_result(result)
	return true

func _input(event: InputEvent) -> void:
	if not visible: return
	if event is InputEventKey:
		if _pond_active:
			if event.physical_keycode not in [KEY_SPACE, KEY_E, KEY_ESCAPE]: return
			var focused := get_viewport().gui_get_focus_owner()
			if event.physical_keycode == KEY_SPACE and focused is Button and _pond.is_ancestor_of(focused) and not held_keys.has(KEY_SPACE): return
		if event.physical_keycode in [KEY_SPACE,KEY_E] and not event.echo:
			if event.pressed and _pond_active and state.get("phase") == "success":
				_continue_after_catch()
			elif event.pressed and state.get("phase","") in ["success","escaped"]:
				_cast()
			elif not event.pressed:
				held_keys.erase(event.physical_keycode)
				_update_hold()
			elif not opening and not closing:
				var can_press: bool = state.get("phase", "") in ["bite", "reeling"] if _pond_active else not action.disabled
				if can_press:
					held_keys[event.physical_keycode] = true
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
		held_keys.clear()
		pointer_held = false
		_update_hold()
		cancel_sent = true
		_close()
	if main.page_active and main.combat_socket.socket_ready: cancel_sent = false
	if _pond_active and main.page_active and state.get("phase") == "success" and _pond_result_started_ms >= 0:
		if Time.get_ticks_msec() - _pond_result_started_ms >= POND_RESULT_MS:
			_close()
