extends CanvasLayer

signal menu_requested(kind: String)
signal interact_pressed
signal magic_pressed(command: String)
signal move_changed(direction: Vector2)
signal panel_closed
const FONT = preload("res://fonts/KoPubBatangMedium.ttf")
const INK = Color("e3e5d3")
const MUTED = Color("a4b7ab")
const GOLD = Color("dec99c")
var root: Control
var title_label: Label
var zone_label: Label
var money_label: Label
var hp_label: Label
var mp_label: Label
var hp_bar: ProgressBar
var mp_bar: ProgressBar
var xp_bar: ProgressBar
var hint_label: Label
var toast_label: Label
var overlay: Control
var panel: PanelContainer
var panel_title: Label
var content: VBoxContainer
var close_button: Button
var interaction: Button
var fireball: Button
var dodge: Button
var potion: Button
var attack_bar: ProgressBar
var cooldown_bars: Dictionary = {}
var toast_time = 0.0
var direction_buttons: Array[Button] = []

func style(background: Color, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var value = StyleBoxFlat.new()
	value.bg_color = background
	value.border_color = border
	value.set_border_width_all(1 if border.a > 0 else 0)
	value.content_margin_left = 12
	value.content_margin_right = 12
	value.content_margin_top = 9
	value.content_margin_bottom = 9
	return value

func label(text: String, size: int = 14, color: Color = INK) -> Label:
	var node = Label.new()
	node.text = text
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", color)
	return node

func button(text: String, callback: Callable, min_size: Vector2 = Vector2(46, 40)) -> Button:
	var node = Button.new()
	node.text = text
	node.custom_minimum_size = min_size
	node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	node.pressed.connect(callback)
	return node

func _ready() -> void:
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var theme = Theme.new()
	theme.default_font = FONT
	theme.default_font_size = 13
	theme.set_color("font_color", "Button", INK)
	theme.set_color("font_hover_color", "Button", GOLD)
	theme.set_color("font_disabled_color", "Button", Color("71867d"))
	theme.set_stylebox("normal", "Button", style(Color("203c3f"), Color("4c6862")))
	theme.set_stylebox("hover", "Button", style(Color("2d4e4c"), GOLD))
	theme.set_stylebox("pressed", "Button", style(Color("416157"), GOLD))
	theme.set_stylebox("disabled", "Button", style(Color("1c3235"), Color("324e4b")))
	theme.set_stylebox("focus", "Button", style(Color(0, 0, 0, 0), GOLD))
	root.theme = theme
	var top = PanelContainer.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_bottom = 72
	top.add_theme_stylebox_override("panel", style(Color(.078,.18,.20,.87)))
	root.add_child(top)
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 3)
	top.add_child(stack)
	var heading = HBoxContainer.new()
	stack.add_child(heading)
	title_label = label("ARCANA", 13, GOLD)
	heading.add_child(title_label)
	zone_label = label("분수 광장", 13)
	zone_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(zone_label)
	money_label = label("", 12, GOLD)
	heading.add_child(money_label)
	var stats = HBoxContainer.new()
	stats.add_theme_constant_override("separation", 10)
	stack.add_child(stats)
	for id in ["HP", "MP"]:
		var section = HBoxContainer.new()
		section.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stats.add_child(section)
		var stat = label(id, 11, MUTED)
		section.add_child(stat)
		var bar = make_bar(Color("b69b79") if id == "HP" else Color("85b8bd"), 4)
		bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		section.add_child(bar)
		if id == "HP": hp_label = stat; hp_bar = bar
		else: mp_label = stat; mp_bar = bar
	xp_bar = make_bar(Color("bdc88b"), 2)
	stack.add_child(xp_bar)
	var bottom = PanelContainer.new()
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -208
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.add_theme_stylebox_override("panel", style(Color.TRANSPARENT))
	root.add_child(bottom)
	var bottom_stack = VBoxContainer.new()
	bottom_stack.add_theme_constant_override("separation", 7)
	bottom.add_child(bottom_stack)
	hint_label = label("길을 누르거나 방향키로 걸어 보세요.", 12, GOLD)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint_label.add_theme_color_override("font_shadow_color", Color("142e33"))
	hint_label.add_theme_constant_override("shadow_outline_size", 4)
	bottom_stack.add_child(hint_label)
	attack_bar = make_bar(Color("d0a17c"), 2)
	bottom_stack.add_child(attack_bar)
	var actions = HBoxContainer.new()
	actions.add_theme_constant_override("separation", 8)
	bottom_stack.add_child(actions)
	var pad = GridContainer.new()
	pad.columns = 3
	pad.add_theme_constant_override("h_separation", 2)
	pad.add_theme_constant_override("v_separation", 2)
	actions.add_child(pad)
	for i in range(9):
		var dir = {1:Vector2.UP, 3:Vector2.LEFT, 5:Vector2.RIGHT, 7:Vector2.DOWN}.get(i, Vector2.ZERO)
		if dir == Vector2.ZERO:
			var spacer = Control.new()
			spacer.custom_minimum_size = Vector2(36, 36)
			spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
			pad.add_child(spacer)
		else:
			var key = button({1:"↑", 3:"←", 5:"→", 7:"↓"}[i], func(): pass, Vector2(36, 36))
			key.add_theme_font_size_override("font_size", 14)
			key.add_theme_stylebox_override("normal", style(Color("203c3f")))
			key.button_down.connect(func(): move_changed.emit(dir))
			key.button_up.connect(func(): move_changed.emit(Vector2.ZERO))
			pad.add_child(key)
			direction_buttons.append(key)
	var quick = VBoxContainer.new()
	quick.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	actions.add_child(quick)
	interaction = button("살펴보기  E", func(): interact_pressed.emit(), Vector2(100, 39))
	quick.add_child(interaction)
	var spells = HBoxContainer.new()
	quick.add_child(spells)
	fireball = button("불꽃  1", func(): magic_pressed.emit("fireball"), Vector2(65, 32))
	dodge = button("회피  2", func(): magic_pressed.emit("dodge"), Vector2(65, 32))
	potion = button("포션  3", func(): magic_pressed.emit("potion"), Vector2(65, 32))
	for spell in [fireball, dodge, potion]:
		spell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		spell.add_theme_font_size_override("font_size", 12)
		spells.add_child(spell)
		var cooldown = make_bar(GOLD, 2)
		cooldown.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
		cooldown.offset_top = -2
		cooldown.mouse_filter = Control.MOUSE_FILTER_IGNORE
		spell.add_child(cooldown)
		cooldown_bars[spell] = cooldown
	var nav = HBoxContainer.new()
	nav.add_theme_constant_override("separation", 0)
	bottom_stack.add_child(nav)
	for item in [["지도", "map"], ["소지품", "inventory"], ["의뢰", "quests"], ["기록", "journal"], ["메뉴", "menu"]]:
		var nav_button = button(item[0], func(): menu_requested.emit(item[1]), Vector2(0, 31))
		nav_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		nav_button.add_theme_stylebox_override("normal", style(Color.TRANSPARENT))
		nav.add_child(nav_button)
	toast_label = label("", 13, GOLD)
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	toast_label.offset_top = 82
	toast_label.offset_bottom = 120
	toast_label.offset_left = 18
	toast_label.offset_right = -18
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	toast_label.add_theme_color_override("font_shadow_color", Color("142e33"))
	toast_label.add_theme_constant_override("shadow_outline_size", 5)
	root.add_child(toast_label)
	_build_panel()

func make_bar(color: Color, height: int) -> ProgressBar:
	var bar = ProgressBar.new()
	bar.custom_minimum_size.y = height
	bar.show_percentage = false
	var background = style(Color("304d4d"))
	var fill = style(color)
	for value in [background, fill]:
		value.content_margin_left = 0
		value.content_margin_right = 0
		value.content_margin_top = 0
		value.content_margin_bottom = 0
	bar.add_theme_stylebox_override("background", background)
	bar.add_theme_stylebox_override("fill", fill)
	return bar

func _build_panel() -> void:
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(overlay)
	var dim = ColorRect.new()
	dim.color = Color(.03, .10, .13, .68)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(dim)
	panel = PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 14
	panel.offset_right = -14
	panel.offset_top = 165
	panel.offset_bottom = -22
	panel.add_theme_stylebox_override("panel", style(Color("19353a"), Color("61786c")))
	overlay.add_child(panel)
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 12)
	panel.add_child(stack)
	var heading = HBoxContainer.new()
	stack.add_child(heading)
	panel_title = label("아르카나", 20, GOLD)
	panel_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	heading.add_child(panel_title)
	close_button = button("닫기", close_panel, Vector2(48, 36))
	heading.add_child(close_button)
	var line = HSeparator.new()
	stack.add_child(line)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	stack.add_child(scroll)
	content = VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 0)
	scroll.add_child(content)
	overlay.hide()

func open_panel(title: String, can_close: bool = true) -> void:
	panel_title.text = title
	close_button.visible = can_close
	for child in content.get_children():
		content.remove_child(child)
		child.queue_free()
	overlay.show()

func close_panel() -> void:
	overlay.hide()
	panel_closed.emit()

func paragraph(text: String, color: Color = INK) -> void:
	var p = label(text, 14, color)
	p.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	p.add_theme_constant_override("line_spacing", 7)
	p.custom_minimum_size.y = 32
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_child(p)
	var gap = Control.new()
	gap.custom_minimum_size.y = 14
	content.add_child(gap)

func choice(text: String, detail: String, callback: Callable, disabled: bool = false) -> void:
	var line = HSeparator.new()
	line.modulate = Color("52695f")
	content.add_child(line)
	var row = MarginContainer.new()
	row.add_theme_constant_override("margin_left", 4)
	row.add_theme_constant_override("margin_right", 4)
	row.add_theme_constant_override("margin_top", 9)
	row.add_theme_constant_override("margin_bottom", 9)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_child(row)
	var target = Button.new()
	target.custom_minimum_size.y = 40
	target.disabled = disabled
	target.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	target.add_theme_stylebox_override("normal", style(Color.TRANSPARENT))
	target.add_theme_stylebox_override("disabled", style(Color.TRANSPARENT))
	target.pressed.connect(callback)
	row.add_child(target)
	var stack = VBoxContainer.new()
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(stack)
	var title = label(text, 14, MUTED if disabled else INK)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.add_child(title)
	if not detail.is_empty():
		var desc = label(detail, 11, MUTED)
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stack.add_child(desc)
func toast(text: String) -> void:
	toast_label.text = text
	toast_time = 4

func _process(delta: float) -> void:
	toast_time = maxf(0, toast_time - delta)
	toast_label.visible = toast_time > 0
	var width = root.get_viewport_rect().size.x
	panel.offset_left = maxf(14, (width - 480) / 2)
	panel.offset_right = -panel.offset_left
	panel.offset_top = minf(165, root.get_viewport_rect().size.y * .18)
