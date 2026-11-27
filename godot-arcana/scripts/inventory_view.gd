extends ScrollContainer

signal item_selected(item_id: String)
var action: Callable

const SlotIcon = preload("res://scripts/quickslot_icon.gd")
const ItemThumbnail = preload("res://scripts/item_thumbnail.gd")
const INK = Color("26364d")
const MUTED = Color("586779")
const GOLD = Color("856129")
const PAPER = Color("fffaf0")
const EDGE = Color("c7cbd2")
const TEXT_ACCENT := Color("216892")
const TEXT_RULE := Color("d6e2ea")
const TEXT_PALE := Color("edf8ff")
var text_mode := false
var entries: Array = []
var selected_id: String = ""
var transfer_empty_text: String = ""
var slots: Dictionary = {}
var grid: GridContainer
var detail_name: Label
var detail_description: Label
var detail_hint: Label
var detail_icon: CenterContainer
var action_button: Button
var submitting: bool = false
var _quantity_row: HBoxContainer
var _quantity_label: Label
var _quantity_minus: Button
var _quantity_plus: Button
var _quantity_all: Button
var _quantity := 1
var _quantity_max := 0
var _slot_skin: StyleBoxFlat
var _selected_slot_skin: StyleBoxFlat

func skin(background: Color, border: Color = EDGE) -> StyleBoxFlat:
	var value = StyleBoxFlat.new()
	value.bg_color = background
	value.border_color = border
	value.set_border_width_all(1)
	value.set_corner_radius_all(7)
	value.set_content_margin_all(10)
	return value

func text(value: String, font_size: int = 14, color: Color = INK) -> Label:
	var node = Label.new()
	node.text = value
	node.add_theme_font_size_override("font_size", font_size)
	node.add_theme_color_override("font_color", color)
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node

func button(value: String, callback: Callable) -> Button:
	var node = Button.new()
	node.text = value
	node.custom_minimum_size = Vector2(48, 40)
	node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	node.pressed.connect(callback)
	return node

func _ready() -> void:
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	follow_focus = true
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation", 10)
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(stack)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size.y = 64
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_RESERVE
	scroll.follow_focus = true
	stack.add_child(scroll)
	grid = GridContainer.new()
	grid.columns = 4
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	scroll.add_child(grid)
	scroll.resized.connect(_fit_slots)
	# Keep empty cells visible, including the final partial row.
	_slot_skin = skin(Color.WHITE, TEXT_RULE) if text_mode else skin(Color("f0ebe2"))
	_selected_slot_skin = skin(TEXT_PALE, TEXT_ACCENT) if text_mode else skin(Color("dce9f6"), Color("5684b0"))
	var hover_skin := skin(Color("e9f1f8"), TEXT_ACCENT if text_mode else Color("7d9fbe"))
	var cell_count: int = maxi(16, ceili(entries.size() / 4.0) * 4)
	for index in range(cell_count):
		var slot = Button.new()
		slot.custom_minimum_size = Vector2(56, 56)
		slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		slot.clip_contents = true
		slot.add_theme_stylebox_override("normal", _slot_skin)
		slot.add_theme_stylebox_override("disabled", _slot_skin)
		slot.add_theme_stylebox_override("hover", hover_skin)
		slot.add_theme_stylebox_override("pressed", _selected_slot_skin)
		grid.add_child(slot)
		if index >= entries.size():
			slot.disabled = true
			slot.focus_mode = Control.FOCUS_NONE
			continue
		var entry: Dictionary = entries[index]
		var item_id: String = str(entry.id)
		slots[item_id] = slot
		slot.tooltip_text = "%s × %d" % [entry.name, entry.count]
		slot.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		slot.pressed.connect(func(): _select(item_id))
		var center = CenterContainer.new()
		center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		center.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(center)
		center.add_child(_icon(entry))
		var count = text(str(entry.count), 12)
		count.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		count.offset_top = -20
		count.offset_right = -5
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		count.add_theme_color_override("font_shadow_color", PAPER)
		count.add_theme_constant_override("shadow_offset_x", 1)
		count.add_theme_constant_override("shadow_offset_y", 1)
		slot.add_child(count)
		if entry.get("equipped",false):
			var badge = text("E", 11, TEXT_ACCENT if text_mode else GOLD)
			badge.position = Vector2(5, 2)
			slot.add_child(badge)
	var footer = PanelContainer.new()
	footer.add_theme_stylebox_override("panel", skin(Color.WHITE, TEXT_RULE) if text_mode else skin(Color("eef2f5")))
	stack.add_child(footer)
	var details = VBoxContainer.new()
	details.add_theme_constant_override("separation", 6)
	footer.add_child(details)
	var selected = HBoxContainer.new()
	selected.add_theme_constant_override("separation", 8)
	details.add_child(selected)
	detail_icon = CenterContainer.new()
	selected.add_child(detail_icon)
	detail_name = text("아이템을 선택해 주세요.", 15)
	detail_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	selected.add_child(detail_name)
	if transfer_empty_text.is_empty():
		# Long descriptions scroll inside the footer, leaving its action visible.
		var description_scroll := ScrollContainer.new()
		description_scroll.custom_minimum_size.y = 62
		description_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		details.add_child(description_scroll)
		detail_description = text("칸을 누르면 이곳에서 정보와 사용·장착 버튼을 볼 수 있습니다.", 13, MUTED)
		detail_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		detail_description.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		description_scroll.add_child(detail_description)
	detail_hint = text("", 12, MUTED)
	detail_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	details.add_child(detail_hint)
	if not transfer_empty_text.is_empty():
		_quantity_row = HBoxContainer.new()
		_quantity_row.add_theme_constant_override("separation", 6)
		details.add_child(_quantity_row)
		_quantity_minus = button("−", func(): _set_quantity(_quantity - 1))
		_quantity_minus.accessibility_name = "수량 줄이기"
		_quantity_row.add_child(_quantity_minus)
		_quantity_label = text("1", 14)
		_quantity_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_quantity_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_quantity_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_quantity_row.add_child(_quantity_label)
		_quantity_plus = button("+", func(): _set_quantity(_quantity + 1))
		_quantity_plus.accessibility_name = "수량 늘리기"
		_quantity_row.add_child(_quantity_plus)
		_quantity_all = button("전부", func(): _set_quantity(_quantity_max))
		_quantity_row.add_child(_quantity_all)
	action_button = button("사용", _submit)
	if text_mode:
		action_button.add_theme_stylebox_override("normal", skin(TEXT_PALE, TEXT_RULE))
		action_button.add_theme_color_override("font_color", TEXT_ACCENT)
	details.add_child(action_button)
	_select(selected_id)

func _fit_slots() -> void:
	var gap := grid.get_theme_constant("h_separation")
	# Keep a full slot and its count visible in a short landscape list.
	var list := grid.get_parent() as ScrollContainer
	var available_width := list.size.x - list.get_v_scroll_bar().get_combined_minimum_size().x
	var max_columns := maxi(1, floori((available_width + gap) / (56.0 + gap)))
	var max_slot_height := maxf(56.0, list.size.y)
	var needed_columns := ceili((available_width + gap) / (max_slot_height + gap))
	grid.columns = clampi(maxi(4, needed_columns), 1, max_columns)
	# Size slots from the viewport so scrollbar visibility cannot trigger another layout.
	var side := maxf(56.0, floorf((available_width - gap * (grid.columns - 1)) / grid.columns))
	for slot in grid.get_children():
		slot.custom_minimum_size.y = side

func _icon(entry: Dictionary) -> Control:
	var texture := ItemThumbnail.load_texture(entry.get("thumbnail", {}))
	if texture != null:
		return ItemThumbnail.new(texture)
	var fallback = SlotIcon.new()
	fallback.kind = "inventory"
	fallback.custom_minimum_size = Vector2(ItemThumbnail.SIDE, ItemThumbnail.SIDE)
	return fallback

func _select(item_id: String) -> void:
	if submitting: return
	selected_id = item_id if slots.has(item_id) else ""
	for id in slots:
		slots[id].add_theme_stylebox_override("normal", _selected_slot_skin if id == selected_id else _slot_skin)
	for child in detail_icon.get_children():
		detail_icon.remove_child(child)
		child.queue_free()
	action_button.hide()
	detail_hint.hide()
	if _quantity_row != null: _quantity_row.hide()
	if selected_id.is_empty():
		var empty_text := "가방이 비어 있습니다." if transfer_empty_text.is_empty() else transfer_empty_text
		detail_name.text = empty_text if entries.is_empty() else "아이템을 선택해 주세요."
		return
	for entry in entries:
		if str(entry.id) != selected_id: continue
		detail_name.text = "%s × %d%s" % [entry.name, entry.count, " · 장착 중" if entry.get("equipped",false) else ""]
		detail_icon.add_child(_icon(entry))
		if detail_description != null:
			detail_description.text = str(entry.description)
			detail_description.get_parent().scroll_vertical = 0
		detail_hint.text = str(entry.get("hint",""))
		detail_hint.visible = not detail_hint.text.is_empty()
		action_button.text = str(entry.get("action_label",""))
		action_button.visible = not action_button.text.is_empty()
		action_button.disabled = bool(entry.get("disabled",false))
		if _quantity_row != null:
			_quantity_max = int(entry.get("transfer_max", 0))
			_set_quantity(1)
			_quantity_row.visible = _quantity_max > 1
		item_selected.emit(selected_id)
		return

func _set_quantity(value: int) -> void:
	_quantity = clampi(value, 1, maxi(1, _quantity_max))
	_quantity_label.text = str(_quantity)
	_quantity_minus.disabled = submitting or _quantity <= 1
	_quantity_plus.disabled = submitting or _quantity >= _quantity_max
	_quantity_all.disabled = _quantity_plus.disabled

func _submit() -> void:
	if submitting or selected_id.is_empty() or action_button.disabled: return
	submitting = true
	action_button.disabled = true
	if _quantity_row != null:
		_set_quantity(_quantity)
		await action.call(selected_id, _quantity)
	else:
		await action.call(selected_id)
	if not is_inside_tree(): return
	submitting = false
	action_button.disabled = false
	if _quantity_row != null: _set_quantity(_quantity)
