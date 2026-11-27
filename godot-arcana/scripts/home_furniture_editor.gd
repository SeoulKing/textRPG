extends RefCounted
## Owns the decoration controls and drafts for the current home. The room owns rendering.

const NativeWorld := preload("res://scripts/native_2d_world.gd")
const EditorTheme := preload("res://scripts/home_furniture_editor_theme.gd")
const NO_DRAG := -2
const MOUSE_DRAG := -1

var main: Node
var active := false

var _catalog: Dictionary = {}
var _revision := -1
var _grid_version := -1
var _owner_game := ""
var _state_generation := -1
var _session := 0
var _selected := ""
var _selection_version := 0
var _cell := Vector2i.ZERO
var _has_cell := false
var _needs_drag := false
var _cell_size := 16.0
var _drag_pointer := NO_DRAG
var _drag_origin := Vector2.ZERO
var _drag_cell := Vector2i.ZERO
var _rotation := 0
var _reasons_by_rotation: Dictionary = {}
var _pads_by_rotation: Dictionary = {}
var _waiting_for_state := false
var _waiting_for_preview := false
var _saving := false
var _feedback := ""
var _hud_was_visible := true
var _actions_were_visible := true

var _panel: PanelContainer
var _list: ScrollContainer
var _list_rows: VBoxContainer
var _selection_name: Label
var _status: Label
var _list_button: Button
var _done_button: Button
var _actions: HBoxContainer
var _rotate_button: Button
var _confirm_button: Button
var _store_button: Button
var _cancel_button: Button
var _move_handle: Button


func _init(owner: Node) -> void:
	main = owner


func _in_graphical_home() -> bool:
	return main.online_world and main.page_active and main.world.indoor == "arcana_home" \
		and not main.simplified_play.enabled and main.combat_socket.socket_ready


func can_open() -> bool:
	return _in_graphical_home() and not main.busy and main.world.bench_state.is_empty() \
		and not main.life.blocking() and not main.life.sending and not main.fishing.visible


func open() -> void:
	if active:
		return
	if not can_open():
		main.ui.toast("자리에서 일어나 진행 중인 행동을 마친 뒤 꾸며 주세요.")
		return
	if not is_instance_valid(_panel):
		_build_panel()
	_session += 1
	active = true
	_feedback = ""
	_hud_was_visible = main.ui.hud.visible
	_actions_were_visible = main.ui.action_cluster.visible
	main.ui.close_panel()
	main.ui.hud.hide()
	main.ui.action_cluster.hide()
	main.ui.reset_touch_controls()
	main._clear_zoom_touches()
	main.world.path.clear()
	main.world.touch_direction = Vector2.ZERO
	main.world.clicked_interaction_id = ""
	main.world.click_door_id = ""
	main._sync_world_input()
	main.world_renderer.home_edit_mode(true)
	main._layout_world_display()
	_panel.show()
	if _state_generation != int(main.combat_socket.connection_generation) or _owner_game != str(main.game_id):
		_catalog.clear()
		_revision = -1
	if _revision < 0:
		_load_state()
	else:
		_refresh_panel()


func close() -> void:
	if not active:
		return
	active = false
	_waiting_for_state = false
	_saving = false
	_clear_selection()
	main.world_renderer.home_edit_mode(false)
	main._layout_world_display()
	_list.hide()
	_panel.hide()
	if not main.simplified_play.enabled:
		main.ui.hud.visible = _hud_was_visible
		main.ui.action_cluster.visible = _actions_were_visible
	main._sync_world_input()


func sync() -> void:
	if not active:
		return
	if not _in_graphical_home() or main.ui.overlay.visible:
		close()
	else:
		_update_move_handle()


func accept_state(value: Dictionary) -> void:
	var rows: Variant = value.get("placements")
	if not rows is Array or not value.has("layoutRevision"):
		return
	var game: String = str(main.game_id)
	var generation: int = int(main.combat_socket.connection_generation)
	var revision := int(value.layoutRevision)
	var grid_version := int(value.get("gridVersion", 1))
	if game == _owner_game and generation == _state_generation and grid_version == _grid_version and revision <= _revision:
		return
	_owner_game = game
	_state_generation = generation
	_revision = revision
	_grid_version = grid_version
	_cell_size = float(value.get("cellSize", 16))
	_catalog.clear()
	for row: Variant in rows:
		if row is Dictionary and not str(row.get("instanceId", "")).is_empty():
			_catalog[str(row.instanceId)] = row
	_reasons_by_rotation.clear()
	_pads_by_rotation.clear()
	if active:
		_refresh_list()
		_render_draft()


func handle_input(event: InputEvent) -> bool:
	if not active:
		return false
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_R: _rotate()
			KEY_ESCAPE:
				if _list.visible:
					_toggle_list()
				elif not _selected.is_empty():
					_cancel()
				elif not _saving:
					close()
	if _saving or _waiting_for_state or _revision < 0:
		return true
	if (event is InputEventMouse or event is InputEventScreenTouch) and _panel.get_global_rect().has_point(event.position):
		return true
	if event is InputEventScreenTouch and event.pressed and not event.canceled:
		_select_at(event.position)
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION \
			and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_select_at(event.position)
	return true


func _select_at(point: Vector2) -> void:
	if not main.get_viewport().get_visible_rect().has_point(point):
		return
	if _list.visible:
		_toggle_list()
	var id: String = main.world_renderer.home_edit_pick(_raster_point(point))
	if id != _selected:
		_select(id)


func _begin_drag(event: InputEvent) -> void:
	if not active or _drag_pointer != NO_DRAG or not _move_handle.visible:
		return
	var anchor: Variant = _cell if _has_cell else _item_cell(_catalog[_selected])
	if not anchor is Vector2i:
		return
	if event is InputEventScreenTouch and event.pressed and not event.canceled:
		_drag_pointer = event.index
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION \
			and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		_drag_pointer = MOUSE_DRAG
	else:
		return
	var screen_point: Vector2 = _move_handle.get_global_transform() * event.position
	_drag_origin = main.world_renderer.pick(_raster_point(screen_point))
	_drag_cell = anchor
	_move_handle.accept_event()


func handle_drag_input(event: InputEvent) -> bool:
	if _drag_pointer == NO_DRAG:
		return false
	if event is InputEventScreenTouch:
		if event.index == _drag_pointer and not event.pressed:
			if not event.canceled:
				_drag_to(event.position)
			end_drag()
		return true
	if event is InputEventScreenDrag:
		if event.index == _drag_pointer:
			_drag_to(event.position)
		return true
	if event is InputEventMouse:
		if _drag_pointer == MOUSE_DRAG and event.device != InputEvent.DEVICE_ID_EMULATION:
			if event is InputEventMouseMotion:
				_drag_to(event.position)
			elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
				_drag_to(event.position)
				end_drag()
		return true
	return false


func end_drag() -> void:
	_drag_pointer = NO_DRAG


func _drag_to(point: Vector2) -> void:
	var viewport: Viewport = main.get_viewport()
	if not viewport.get_visible_rect().has_point(point):
		return
	var world_point: Vector2 = main.world_renderer.pick(_raster_point(point))
	var delta := (world_point - _drag_origin) / _cell_size
	var destination := _drag_cell + Vector2i(delta.round())
	var anchors: Dictionary = _pads_by_rotation.get(_rotation, {})
	if not anchors.has(destination):
		return
	if not _has_cell and destination == _drag_cell:
		return
	if _has_cell and destination == _cell and (not _needs_drag or delta.length_squared() < 0.02):
		return
	_cell = destination
	_has_cell = true
	_needs_drag = false
	_feedback = ""
	_render_draft()


func _raster_point(point: Vector2) -> Vector2:
	return NativeWorld.display_to_raster(main.viewport_host, main.viewport.size, point)


func _load_state() -> void:
	var session := _session
	var generation: int = main.combat_socket.connection_generation
	_waiting_for_state = true
	_feedback = ""
	_refresh_panel()
	var result: Dictionary = await main.combat_socket.request({"command": "home_furniture_state"})
	if not _current_request(session, generation):
		return
	_waiting_for_state = false
	_receive_projection(result)
	if _revision < 0:
		_feedback = str(result.get("message", "집의 배치를 불러오지 못했습니다."))
	_refresh_panel()


func _select(id: String) -> void:
	if _saving or not _catalog.has(id):
		return
	_clear_selection()
	_selected = id
	_list.hide()
	var item: Dictionary = _catalog[id]
	_rotation = int(item.get("rotation", 0))
	_needs_drag = item.get("state") == "stored"
	_request_preview()


func _item_cell(item: Dictionary) -> Variant:
	var cell: Variant = item.get("cell")
	if cell is Dictionary and cell.has("x") and cell.has("z"):
		return Vector2i(int(cell.x), int(cell.z))
	var anchor: Variant = null
	for key: String in item.get("defaultCells", []):
		var point: Variant = _read_cell_key(key)
		if point is Vector2i:
			anchor = point if anchor == null else Vector2i(mini(anchor.x, point.x), mini(anchor.y, point.y))
	return anchor


func _request_preview() -> void:
	var session := _session
	var selection := _selection_version
	var generation: int = main.combat_socket.connection_generation
	_waiting_for_preview = true
	_render_draft()
	var result: Dictionary = await main.combat_socket.request({
		"command": "home_furniture_preview", "furnitureId": _selected,
		"layoutRevision": _revision,
	})
	if not _current_request(session, generation) or selection != _selection_version:
		return
	_waiting_for_preview = false
	_receive_projection(result)
	var preview: Variant = result.get("homeFurniturePreview")
	if not preview is Dictionary or preview.get("furnitureId") != _selected or int(preview.get("layoutRevision", -1)) != _revision:
		if result.get("error") == "home_furniture_revision" or result.get("resync", false):
			_clear_selection()
		_feedback = str(result.get("message", "배치 가능 위치를 확인하지 못했습니다. 가구를 다시 선택해 주세요."))
		_render_draft()
		return
	for direction: Dictionary in preview.get("rotations", []):
		var reasons: Dictionary = {}
		var pads: Dictionary = {}
		var tiles: Dictionary = direction.get("cells", {})
		for key: String in tiles:
			var point: Variant = _read_cell_key(key)
			if point is Vector2i:
				var reason := str(tiles[key])
				reasons[point] = reason
				pads[point] = reason.is_empty()
		var rotation: int = int(direction.get("rotation", 0))
		_reasons_by_rotation[rotation] = reasons
		_pads_by_rotation[rotation] = pads
	if _needs_drag and not _has_cell:
		var anchors: Dictionary = _pads_by_rotation.get(_rotation, {})
		var start: Variant = _item_cell(_catalog[_selected])
		for point: Vector2i in anchors:
			if anchors[point]:
				start = point
				break
		if start is Vector2i:
			_cell = start
			_has_cell = true
	_render_draft()


func _read_cell_key(key: String) -> Variant:
	var values := key.split(":", false)
	if values.size() == 2 and values[0].is_valid_int() and values[1].is_valid_int():
		return Vector2i(int(values[0]), int(values[1]))
	return null


func _rotate() -> void:
	if _saving or _waiting_for_preview or _selected.is_empty() or _list.visible or _drag_pointer != NO_DRAG:
		return
	if not _has_cell:
		var start: Variant = _item_cell(_catalog[_selected])
		if start is Vector2i:
			_cell = start
			_has_cell = true
	_rotation = (_rotation + 1) % 4
	_feedback = ""
	_render_draft()


func _cancel() -> void:
	if _saving:
		return
	_clear_selection()
	_refresh_panel()


func _clear_selection() -> void:
	end_drag()
	_selection_version += 1
	_selected = ""
	_has_cell = false
	_needs_drag = false
	_waiting_for_preview = false
	_feedback = ""
	_reasons_by_rotation.clear()
	_pads_by_rotation.clear()
	_move_handle.hide()
	main.world_renderer.home_edit_clear()


func _candidate_reason() -> String:
	var reasons: Dictionary = _reasons_by_rotation.get(_rotation, {})
	return str(reasons.get(_cell, "집 안의 바닥에 놓아 주세요."))


func _can_confirm() -> bool:
	return not _saving and not _needs_drag and _has_cell \
		and _reasons_by_rotation.has(_rotation) and _candidate_reason().is_empty()


func _render_draft() -> void:
	if _selected.is_empty() or _list.visible or not _pads_by_rotation.has(_rotation):
		main.world_renderer.home_edit_clear()
	else:
		var draft := _selected if _has_cell else ""
		main.world_renderer.home_edit_preview(draft, _cell, _rotation, _candidate_reason().is_empty(), _pads_by_rotation[_rotation])
	_refresh_panel()
	_update_move_handle()


func _submit(operation: String) -> void:
	if _saving or _selected.is_empty():
		return
	var item: Dictionary = _catalog.get(_selected, {})
	if operation == "place" and not _can_confirm():
		return
	if operation == "store" and (item.get("state") == "stored" or not item.get("canStore", false)):
		return
	var session := _session
	var generation: int = main.combat_socket.connection_generation
	var action_id: String = main._new_action_id()
	var submitted_revision := _revision
	var action := {
		"command": "home_furniture_update", "furnitureId": _selected, "layoutRevision": submitted_revision,
		"furnitureOperation": operation, "actionId": action_id,
	}
	if operation == "place":
		action.furnitureCell = {"x": _cell.x, "z": _cell.y}
		action.furnitureRotation = _rotation
	_saving = true
	_feedback = ""
	_refresh_panel()
	var result: Dictionary = await main.combat_socket.request(action)
	if not _current_request(session, generation):
		return
	_saving = false
	_receive_projection(result)
	if result.get("error") == "home_furniture_revision" or result.get("resync", false):
		_clear_selection()
		_feedback = str(result.get("message", "바뀐 배치를 불러왔습니다. 가구를 다시 선택해 주세요."))
	elif result.has("error"):
		_feedback = str(result.get("message", "가구를 저장하지 못했습니다."))
		if operation == "place" and result.get("error") == "home_furniture_invalid" and _reasons_by_rotation.has(_rotation):
			_reasons_by_rotation[_rotation][_cell] = _feedback
			_pads_by_rotation[_rotation][_cell] = false
	elif result.get("actionReceipt", {}).get("id") == action_id and _revision > submitted_revision:
		_clear_selection()
		_feedback = "보관했습니다." if operation == "store" else "배치를 저장했습니다."
	else:
		_clear_selection()
		_load_state()
	_render_draft()


func _current_request(session: int, generation: int) -> bool:
	return active and session == _session and generation == main.combat_socket.connection_generation and _in_graphical_home()


func _receive_projection(result: Dictionary) -> void:
	var projection: Variant = result.get("homeFurniture")
	if projection is Dictionary and not projection.is_empty():
		main._apply_home_furniture(projection)


func _toggle_list() -> void:
	if _saving or _waiting_for_state:
		return
	if _revision < 0:
		_load_state()
		return
	end_drag()
	_list.visible = not _list.visible
	if _list.visible:
		_refresh_list()
	_render_draft()


func _refresh_list() -> void:
	if not _list.visible:
		return
	for row in _list_rows.get_children():
		_list_rows.remove_child(row)
		row.queue_free()
	for stored: bool in [false, true]:
		_list_rows.add_child(main.ui.label("보관 중" if stored else "배치됨", 13, EditorTheme.MUTED, true))
		var count := 0
		for id: String in _catalog:
			var item: Dictionary = _catalog[id]
			if (item.get("state") == "stored") != stored:
				continue
			var row: Button = main.ui.button(str(item.get("name", "가구")), _select.bind(id), Vector2(48, 42))
			row.alignment = HORIZONTAL_ALIGNMENT_LEFT
			row.mouse_filter = Control.MOUSE_FILTER_PASS
			_list_rows.add_child(row)
			count += 1
		if count == 0:
			_list_rows.add_child(main.ui.label("가구 없음", 13, EditorTheme.MUTED))


func _build_panel() -> void:
	_panel = PanelContainer.new()
	_panel.z_index = 180
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_panel.theme = EditorTheme.create(main.ui.root.theme)
	main.ui.root.add_child(_panel)
	_move_handle = Button.new()
	_move_handle.text = "이동"
	_move_handle.tooltip_text = "눌러서 드래그하면 가구를 옮깁니다."
	_move_handle.focus_mode = Control.FOCUS_NONE
	_move_handle.mouse_default_cursor_shape = Control.CURSOR_MOVE
	_move_handle.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_move_handle.theme = _panel.theme
	_move_handle.custom_minimum_size = Vector2(56.0, 44.0)
	_move_handle.size = _move_handle.custom_minimum_size
	_move_handle.z_index = 179
	_move_handle.gui_input.connect(_begin_drag)
	main.ui.root.add_child(_move_handle)
	_move_handle.hide()
	_panel.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 4)
	_panel.add_child(column)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 5)
	column.add_child(header)
	var title: Label = main.ui.label("집 꾸미기", 16, EditorTheme.INK, true)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	_list_button = main.ui.button("가구 목록", _toggle_list, Vector2(72, 42))
	_list_button.icon = EditorTheme.icon("list")
	_done_button = main.ui.button("완료", close, Vector2(48, 42))
	_done_button.icon = EditorTheme.icon("exit")
	header.add_child(_list_button)
	header.add_child(_done_button)
	_list = ScrollContainer.new()
	_list.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_list.scroll_deadzone = 8
	column.add_child(_list)
	_list_rows = VBoxContainer.new()
	_list_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_child(_list_rows)
	_list.hide()
	_selection_name = main.ui.label("", 14, EditorTheme.INK, true)
	_selection_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	column.add_child(_selection_name)
	_status = main.ui.label("", 13, EditorTheme.MUTED)
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_status)
	_actions = HBoxContainer.new()
	_actions.add_theme_constant_override("separation", 4)
	column.add_child(_actions)
	_rotate_button = main.ui.button("90° 회전", _rotate, Vector2(72, 42))
	_rotate_button.icon = EditorTheme.icon("turn")
	_rotate_button.tooltip_text = "시계 방향으로 90도 회전 · R"
	_confirm_button = main.ui.button("확정", _submit.bind("place"), Vector2(46, 42))
	_confirm_button.theme_type_variation = "FurnitureConfirm"
	_confirm_button.icon = EditorTheme.icon("check")
	_store_button = main.ui.button("보관", _submit.bind("store"), Vector2(46, 42))
	_store_button.icon = EditorTheme.icon("store")
	_cancel_button = main.ui.button("취소", _cancel, Vector2(46, 42))
	_cancel_button.icon = EditorTheme.icon("cancel")
	_cancel_button.tooltip_text = "미리보기 취소 · Esc"
	for button: Button in [_rotate_button, _confirm_button, _store_button, _cancel_button]:
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_actions.add_child(button)
	main.ui.root.resized.connect(_layout_panel)
	_panel.minimum_size_changed.connect(_layout_panel)


func _refresh_panel() -> void:
	var item: Dictionary = _catalog.get(_selected, {})
	var selected := not item.is_empty() and not _list.visible
	_actions.visible = selected
	_selection_name.visible = selected
	if selected:
		var footprint: Dictionary = item.get("footprint", {})
		var width := int(footprint.get("width", 1))
		var depth := int(footprint.get("depth", 1))
		var size := Vector2i(depth, width) if _rotation % 2 == 1 else Vector2i(width, depth)
		_selection_name.text = "%s · %d × %d칸" % [item.get("name", "가구"), size.x, size.y]
	_store_button.visible = selected and item.get("canStore", false) and item.get("state") != "stored"
	_list_button.text = "목록 닫기" if _list.visible else "다시 불러오기" if _revision < 0 and not _waiting_for_state else "가구 목록"
	_list_button.disabled = _saving or _waiting_for_state
	_done_button.disabled = _saving
	_rotate_button.disabled = _saving or _waiting_for_preview
	_confirm_button.disabled = not _can_confirm()
	_store_button.disabled = _saving
	_cancel_button.disabled = _saving
	var message := "가구를 누르거나 목록에서 선택해 주세요."
	var color := EditorTheme.MUTED
	if _saving:
		message = "배치를 저장하고 있습니다…"
	elif _waiting_for_state or _waiting_for_preview:
		message = "집의 배치를 불러오고 있습니다…" if _waiting_for_state else "배치할 수 있는 자리를 확인하고 있습니다…"
	elif not _feedback.is_empty():
		message = _feedback
		if selected:
			color = EditorTheme.BLOCKED
	elif selected and _reasons_by_rotation.has(_rotation):
		if _has_cell and not _needs_drag:
			var reason := _candidate_reason()
			message = "여기에 놓을 수 있습니다." if reason.is_empty() else reason
			color = EditorTheme.ALLOWED if reason.is_empty() else EditorTheme.BLOCKED
		else:
			message = "가구 아래의 이동 버튼을 잡고 드래그하세요."
	_status.text = message
	_status.tooltip_text = message
	_status.add_theme_color_override("font_color", color)
	_layout_panel()


func _update_move_handle() -> void:
	if not active or _selected.is_empty() or _list.visible or _saving \
			or not _pads_by_rotation.has(_rotation):
		_move_handle.hide()
		return
	var point: Variant = main.world_renderer.home_edit_handle_point(_selected)
	if not point is Vector2:
		_move_handle.hide()
		return
	var display := NativeWorld.raster_to_display(main.viewport_host, main.viewport.size, point)
	var from_screen: Transform2D = main.ui.root.get_global_transform().affine_inverse()
	var padding := 6.0
	var size := _move_handle.size
	var available: Vector2 = main.ui.root.size
	var at := (from_screen * display) + Vector2(-size.x * 0.5, 4.0)
	at.x = clampf(at.x, padding, maxf(padding, available.x - size.x - padding))
	var panel := _panel.get_global_rect()
	var upper_left := from_screen * panel.position
	var lower_right := from_screen * panel.end
	if at.x < lower_right.x and at.x + size.x > upper_left.x:
		available.y = upper_left.y
	at.y = clampf(at.y, padding, maxf(padding, available.y - size.y - padding))
	_move_handle.position = at.round()
	_move_handle.show()


func _layout_panel() -> void:
	if not is_instance_valid(_panel) or not active:
		return
	var viewport_size: Vector2 = main.ui.root.size
	var width := clampf(viewport_size.x - 24.0, 1.0, 344.0)
	var right := 12.0 if viewport_size.x >= viewport_size.y else (viewport_size.x - width) * 0.5
	_list.custom_minimum_size.y = clampf(viewport_size.y * 0.43, 112.0, 232.0)
	_panel.offset_left = -right - width
	_panel.offset_right = -right
	_panel.offset_bottom = -12.0
	_panel.offset_top = -12.0 - _panel.get_combined_minimum_size().y
