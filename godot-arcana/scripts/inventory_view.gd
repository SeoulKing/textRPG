extends PanelContainer

signal close_requested
signal equipment_requested
signal craft_requested
signal item_selected(item_id: String)
var action: Callable

const SlotIcon = preload("res://scripts/quickslot_icon.gd")
const INK = Color("26364d")
const MUTED = Color("586779")
const GOLD = Color("856129")
const PAPER = Color("fffaf0")
const EDGE = Color("c7cbd2")
var entries: Array = []
var money: int = 0
var selected_id: String = ""
var slots: Dictionary = {}
var grid: GridContainer
var detail_name: Label
var detail_description: Label
var detail_hint: Label
var detail_icon: CenterContainer
var action_button: Button
var submitting: bool = false

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
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	get_parent().resized.connect(_fit)
	add_theme_stylebox_override("panel", skin(PAPER))
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 10)
	add_child(stack)
	var header = HBoxContainer.new()
	stack.add_child(header)
	var title = text("소지품", 20, GOLD)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	header.add_child(text("%d G" % money, 14, GOLD))
	header.add_child(button("닫기", func(): close_requested.emit()))
	var tabs = HBoxContainer.new()
	stack.add_child(tabs)
	for index in range(3):
		var tab = button(["아이템", "장비", "제작"][index], func():
			if index == 1: equipment_requested.emit()
			elif index == 2: craft_requested.emit())
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab.disabled = index == 0
		tabs.add_child(tab)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size.y = 64
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(scroll)
	grid = GridContainer.new()
	grid.columns = 4
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	grid.resized.connect(_fit_slots)
	scroll.add_child(grid)
	# Keep empty cells visible, including the final partial row.
	var cell_count: int = maxi(16, ceili(entries.size() / 4.0) * 4)
	for index in range(cell_count):
		var slot = Button.new()
		slot.custom_minimum_size = Vector2(56, 56)
		slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		slot.clip_contents = true
		slot.add_theme_stylebox_override("normal", skin(Color("f0ebe2")))
		slot.add_theme_stylebox_override("disabled", skin(Color("f0ebe2")))
		slot.add_theme_stylebox_override("hover", skin(Color("e9f1f8"), Color("7d9fbe")))
		slot.add_theme_stylebox_override("pressed", skin(Color("dce9f6"), Color("5684b0")))
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
			var badge = text("E", 11, GOLD)
			badge.position = Vector2(5, 2)
			slot.add_child(badge)
	var footer = PanelContainer.new()
	footer.add_theme_stylebox_override("panel", skin(Color("eef2f5")))
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
	# Long descriptions scroll inside the footer, leaving its action visible.
	var description_scroll = ScrollContainer.new()
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
	action_button = button("사용", _submit)
	details.add_child(action_button)
	_select(selected_id)
	_fit()

func _fit() -> void:
	var available: Vector2 = get_parent().size
	var width: float = minf(480.0, available.x - 24.0)
	offset_left = (available.x - width) / 2.0
	offset_right = -offset_left
	offset_top = minf(100.0, available.y * 0.08)
	offset_bottom = -16.0

func _fit_slots() -> void:
	var side: float = maxf(56.0, floorf((grid.size.x - 18.0) / 4.0))
	for slot in grid.get_children():
		slot.custom_minimum_size.y = side

func _icon(entry: Dictionary) -> Control:
	var thumbnail: Dictionary = entry.get("thumbnail",{})
	var texture: Texture2D
	var path: String = str(thumbnail.get("path",""))
	if path.begins_with("res://art/export/") and ResourceLoader.exists(path):
		texture = load(path) as Texture2D
		var region: Variant = thumbnail.get("region")
		if texture != null and region is Array and region.size()==4:
			var atlas := AtlasTexture.new()
			atlas.atlas = texture
			atlas.region = Rect2(float(region[0]),float(region[1]),float(region[2]),float(region[3]))
			texture = atlas
	if texture != null:
		var icon = TextureRect.new()
		icon.texture = texture
		icon.custom_minimum_size = Vector2(40, 40)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		return icon
	var fallback = SlotIcon.new()
	fallback.kind = "inventory"
	fallback.custom_minimum_size = Vector2(40, 40)
	return fallback

func _select(item_id: String) -> void:
	if submitting: return
	selected_id = item_id if slots.has(item_id) else ""
	for id in slots:
		slots[id].add_theme_stylebox_override("normal", skin(Color("dce9f6"), Color("5684b0")) if id == selected_id else skin(Color("f0ebe2")))
	for child in detail_icon.get_children():
		detail_icon.remove_child(child)
		child.queue_free()
	action_button.hide()
	detail_hint.hide()
	if selected_id.is_empty():
		detail_name.text = "가방이 비어 있습니다." if entries.is_empty() else "아이템을 선택해 주세요."
		return
	for entry in entries:
		if str(entry.id) != selected_id: continue
		detail_name.text = "%s × %d%s" % [entry.name, entry.count, " · 장착 중" if entry.get("equipped",false) else ""]
		detail_icon.add_child(_icon(entry))
		detail_description.text = str(entry.description)
		detail_description.get_parent().scroll_vertical = 0
		detail_hint.text = str(entry.get("hint",""))
		detail_hint.visible = not detail_hint.text.is_empty()
		action_button.text = str(entry.get("action_label",""))
		action_button.visible = not action_button.text.is_empty()
		action_button.disabled = bool(entry.get("disabled",false))
		item_selected.emit(selected_id)
		return

func _submit() -> void:
	if submitting or selected_id.is_empty() or action_button.disabled: return
	submitting = true
	action_button.disabled = true
	await action.call(selected_id)
	if is_instance_valid(action_button):
		submitting = false
		action_button.disabled = false
