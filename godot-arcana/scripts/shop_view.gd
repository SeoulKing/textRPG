extends PanelContainer

signal trade_requested(action: Dictionary, quantity: int)
signal close_requested
const Icon = preload("res://scripts/quickslot_icon.gd")
const CREAM = Color("f5ead5")
const PURPLE = Color("302637")
const BRASS = Color("80613d")
const BUTTON = Color("eee3d2")
const SELECTED = Color("d9c8e8")
const HOVER = Color("e8daef")
const PRESSED = Color("cbb5dc")
var entries: Array = []
var inventory: Dictionary = {}
var money: int = 0
var selling: bool = false
var selected: Dictionary = {}
var category: int = 0
var amount: int = 1
var maximum: int = 0
var rows: VBoxContainer
var selected_name: Label
var effect: Label
var selected_icon: Control
var number: Label
var total: Label
var balance: Label
var confirm: Button
var minus: Button
var plus: Button
var max_button: Button
var tabs: Array[Button] = []
var filters: Array[Button] = []

func skin(bg: Color, edge: Color = BRASS) -> StyleBoxFlat:
	var s = StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = edge
	s.set_border_width_all(1)
	s.set_corner_radius_all(7)
	s.content_margin_left = 10
	s.content_margin_right = 10
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s

func text(value: String, size: int = 14, color: Color = PURPLE) -> Label:
	var node = Label.new()
	node.text = value
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", color)
	return node

func btn(value: String, callback: Callable, active: bool = false) -> Button:
	var b = Button.new()
	b.text = value
	b.custom_minimum_size = Vector2(40, 42)
	b.add_theme_stylebox_override("normal", skin(SELECTED if active else BUTTON))
	b.add_theme_stylebox_override("hover", skin(HOVER))
	b.add_theme_stylebox_override("pressed", skin(PRESSED))
	b.add_theme_stylebox_override("disabled", skin(Color("e5dfd5"), Color("b9ad9d")))
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(state, PURPLE)
	b.add_theme_color_override("font_disabled_color", Color("857a86"))
	b.pressed.connect(callback)
	return b

func item_name(entry: Dictionary) -> String:
	return str(entry.get("label", "")).trim_suffix(" 구매").trim_suffix(" 판매")

func price(entry: Dictionary) -> int:
	return str(entry.get("outcomeHint", "0")).get_slice("골드", 0).to_int()

func icon_for(id: String, side: float) -> Control:
	if id == "manaPotion":
		var icon = Icon.new()
		icon.kind = id
		icon.custom_minimum_size = Vector2(side, side)
		return icon
	# Materials without approved thumbnails use a quiet initial tile.
	var tile = text("풀" if id == "moonHerb" else "◇", 22, BRASS)
	tile.custom_minimum_size = Vector2(side, side)
	tile.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tile.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return tile

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	resized.connect(_fit)
	add_theme_stylebox_override("panel", skin(CREAM))
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 8)
	add_child(stack)
	var header = HBoxContainer.new()
	stack.add_child(header)
	var title = text("아르카나 잡화점", 18)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	header.add_child(title)
	header.add_child(text("%d G" % money, 14, BRASS))
	header.add_child(btn("×", func(): close_requested.emit()))
	var tab_row = HBoxContainer.new()
	stack.add_child(tab_row)
	for i in range(2):
		var tab = btn(["구매", "판매"][i], func(): _switch(i), i == int(selling))
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab_row.add_child(tab)
		tabs.append(tab)
	var filter_row = HBoxContainer.new()
	stack.add_child(filter_row)
	for i in range(3):
		var filter = btn(["전체", "소모품", "재료"][i], func(): category = i; _list(), i == 0)
		filter.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		filter_row.add_child(filter)
		filters.append(filter)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(scroll)
	rows = VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_theme_constant_override("separation", 7)
	scroll.add_child(rows)
	var detail = PanelContainer.new()
	detail.add_theme_stylebox_override("panel", skin(Color("fff8eb")))
	stack.add_child(detail)
	var detail_stack = VBoxContainer.new()
	detail_stack.add_theme_constant_override("separation", 7)
	detail.add_child(detail_stack)
	# Item identity and quantity share one compact row, including portrait layouts.
	var top = HBoxContainer.new()
	top.add_theme_constant_override("separation", 5)
	detail_stack.add_child(top)
	selected_icon = HBoxContainer.new()
	top.add_child(selected_icon)
	var identity = VBoxContainer.new()
	identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(identity)
	selected_name = text("", 13, PURPLE)
	selected_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	identity.add_child(selected_name)
	effect = text("", 11, Color("65516c"))
	identity.add_child(effect)
	minus = btn("−", func(): _quantity(amount - 1))
	top.add_child(minus)
	number = text("1", 16, PURPLE)
	number.custom_minimum_size.x = 22
	number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	top.add_child(number)
	plus = btn("+", func(): _quantity(amount + 1))
	top.add_child(plus)
	max_button = btn("최대", func(): _quantity(maximum))
	top.add_child(max_button)
	var summary = HBoxContainer.new()
	detail_stack.add_child(summary)
	total = text("", 16, PURPLE)
	total.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	summary.add_child(total)
	balance = text("", 12, Color("65516c"))
	summary.add_child(balance)
	confirm = btn("구매하기", _submit, true)
	detail_stack.add_child(confirm)
	_list()
	_fit()

func _fit() -> void:
	var viewport_size = get_parent().size
	var width = minf(600, viewport_size.x - 16)
	offset_left = (viewport_size.x - width) / 2
	offset_right = -offset_left
	offset_top = 12
	offset_bottom = -12

func _switch(index: int) -> void:
	selling = index == 1
	selected = {}
	_list()

func _list() -> void:
	for child in rows.get_children():
		rows.remove_child(child)
		child.queue_free()
	for i in range(tabs.size()):
		tabs[i].add_theme_stylebox_override("normal", skin(SELECTED if i == int(selling) else BUTTON))
	for i in range(filters.size()):
		filters[i].add_theme_stylebox_override("normal", skin(SELECTED if i == category else BUTTON))
	var visible_entries: Array = []
	for entry in entries:
		var action: Dictionary = entry.get("action", {})
		if str(action.get("command", "")) != ("sell_item" if selling else "buy_item"): continue
		var id = str(action.get("itemId", ""))
		if category == 1 and id != "manaPotion": continue
		if category == 2 and id == "manaPotion": continue
		visible_entries.append(entry)
	if not visible_entries.has(selected):
		selected = visible_entries[0] if not visible_entries.is_empty() else {}
		amount = 1
	for entry in visible_entries:
		var action: Dictionary = entry.action
		var id = str(action.itemId)
		var row = btn("", func(): selected = entry; amount = 1; _list(), entry == selected)
		row.custom_minimum_size.y = 70
		rows.add_child(row)
		var layout = HBoxContainer.new()
		layout.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		layout.offset_left = 9
		layout.offset_right = -9
		layout.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(layout)
		layout.add_child(icon_for(id, 44))
		var name_label = text(item_name(entry), 14)
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		layout.add_child(name_label)
		var values = VBoxContainer.new()
		values.alignment = BoxContainer.ALIGNMENT_CENTER
		layout.add_child(values)
		values.add_child(text("%d G" % price(entry), 14, BRASS))
		values.add_child(text("보유 %d" % int(inventory.get(id, 0)), 11))
		for child in layout.get_children():
			child.mouse_filter = Control.MOUSE_FILTER_IGNORE
			for nested in child.get_children(): nested.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if visible_entries.is_empty(): rows.add_child(text("판매할 물품 없음" if selling else "물품 없음", 14))
	_refresh()

func _quantity(value: int) -> void:
	amount = clampi(value, 1, maxi(1, maximum))
	_refresh()

func _refresh() -> void:
	var action: Dictionary = selected.get("action", {})
	var id = str(action.get("itemId", ""))
	var unit = price(selected)
	maximum = mini(99, int(inventory.get(id, 0)) if selling else (floori(float(money) / unit) if unit > 0 else 0))
	amount = clampi(amount, 1, maxi(1, maximum))
	selected_name.text = item_name(selected) if not selected.is_empty() else "선택 없음"
	effect.text = "MP +20" if id == "manaPotion" else ("재료" if not selected.is_empty() else "")
	for child in selected_icon.get_children():
		selected_icon.remove_child(child)
		child.queue_free()
	if not selected.is_empty(): selected_icon.add_child(icon_for(id, 28))
	number.text = str(amount)
	var sum_price = unit * amount if maximum > 0 else 0
	total.text = "합계 %d G" % sum_price
	balance.text = "잔액 %d G" % (money + sum_price if selling else money - sum_price)
	confirm.text = ("판매하기" if selling else "구매하기") if maximum > 0 else ("판매할 물품 없음" if selling else "소지금 부족")
	confirm.disabled = maximum < 1 or selected.is_empty()
	minus.disabled = maximum < 1 or amount <= 1
	plus.disabled = amount >= maximum
	max_button.disabled = maximum < 1 or amount >= maximum

func _submit() -> void:
	if confirm.disabled: return
	confirm.disabled = true
	trade_requested.emit(selected.action.duplicate(true), amount)
