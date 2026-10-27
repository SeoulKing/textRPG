extends CanvasLayer

signal menu_requested(kind: String)
signal interact_pressed
signal quickslot_pressed(index: int)
signal move_changed(direction: Vector2)
signal panel_closed
const FONT = preload("res://fonts/KoPubBatangMedium.ttf")
const Joystick = preload("res://scripts/virtual_joystick.gd")
const SlotIcon = preload("res://scripts/quickslot_icon.gd")
const ActionButton = preload("res://scripts/mobile_action_button.gd")
const SkillCooldown = preload("res://scripts/skill_cooldown.gd")
const SLOT_NAMES = {"fireball":"불꽃", "dodge":"회피", "potion":"포션", "":"등록"}
const INK = Color("e3e5d3")
const MUTED = Color("a4b7ab")
const GOLD = Color("dec99c")
var root: Control
var header: PanelContainer
var navigation: PanelContainer
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
var interaction_caption: Label
var action_cluster: Control
var quickslot_buttons: Array[Button] = []
var quickslot_icons: Array = []
var quickslot_labels: Array[Label] = []
var quickslot_counts: Array[Label] = []
var quickslot_bindings: Array[String] = ["fireball", "dodge", "potion", ""]
var attack_bar: ProgressBar
var cooldown_bars: Dictionary = {}
var toast_time = 0.0
var joystick
var touch_buttons: Array[Button] = []
var action_touches: Dictionary = {}

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
	header = top
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
	navigation = bottom
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -56
	bottom.offset_bottom = -10
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var dock_style = style(Color(.045,.10,.13,.84),Color(.70,.79,.73,.22))
	dock_style.set_corner_radius_all(14)
	dock_style.content_margin_left = 6
	dock_style.content_margin_right = 6
	dock_style.content_margin_top = 3
	dock_style.content_margin_bottom = 3
	bottom.add_theme_stylebox_override("panel",dock_style)
	root.add_child(bottom)
	var bottom_stack = VBoxContainer.new()
	bottom_stack.add_theme_constant_override("separation", 7)
	bottom.add_child(bottom_stack)
	hint_label = label("", 12, GOLD)
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint_label.add_theme_color_override("font_shadow_color", Color("142e33"))
	hint_label.add_theme_constant_override("shadow_outline_size", 4)
	hint_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	hint_label.offset_top = -310
	hint_label.offset_bottom = -284
	hint_label.offset_left = 16
	hint_label.offset_right = -16
	hint_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hint_label)
	attack_bar = make_bar(Color("d0a17c"), 2)
	attack_bar.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	attack_bar.offset_top = -280
	attack_bar.offset_bottom = -278
	attack_bar.offset_left = 20
	attack_bar.offset_right = -20
	attack_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(attack_bar)
	joystick = Joystick.new()
	joystick.direction_changed.connect(func(value): move_changed.emit(value))
	root.add_child(joystick)
	var cluster = Control.new()
	action_cluster = cluster
	cluster.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	cluster.offset_left = -236
	cluster.offset_top = -320
	cluster.offset_right = -16
	cluster.offset_bottom = -72
	cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(cluster)
	interaction = ActionButton.new()
	interaction.set("primary",true)
	interaction.set("accent",Color("e7d3a6"))
	interaction.set("key_hint","E")
	interaction.text = "살펴보기"
	interaction.position = Vector2(126,112)
	interaction.custom_minimum_size = Vector2(76,76)
	interaction.size = Vector2(76,76)
	interaction.pressed.connect(func(): interact_pressed.emit())
	cluster.add_child(interaction)
	var interact_icon = SlotIcon.new()
	interact_icon.kind = "interact"
	interact_icon.position = Vector2(20,20)
	interact_icon.size = Vector2(36,36)
	interaction.add_child(interact_icon)
	interaction_caption = _action_caption("살펴보기",76)
	interaction_caption.position.y = 79
	interaction.add_child(interaction_caption)
	touch_buttons.append(interaction)
	var slot_positions = [Vector2(136,30),Vector2(68,52),Vector2(40,120),Vector2(76,192)]
	for i in range(4):
		var slot = ActionButton.new()
		slot.key_hint = str(i+1)
		slot.pressed.connect(func(): quickslot_pressed.emit(i))
		slot.position = slot_positions[i]
		slot.custom_minimum_size = Vector2(56,56)
		slot.size = Vector2(56,56)
		cluster.add_child(slot)
		touch_buttons.append(slot)
		quickslot_buttons.append(slot)
		var icon = SlotIcon.new()
		icon.position = Vector2(13,12)
		icon.size = Vector2(30,30)
		slot.add_child(icon)
		quickslot_icons.append(icon)
		var caption = _action_caption("",56)
		caption.position.y = 58
		caption.hide() # Icons lead; names remain in tooltips and slot management.
		slot.add_child(caption)
		quickslot_labels.append(caption)
		var count = label("", 10, GOLD)
		count.position = Vector2(34,0)
		count.size = Vector2(16,14)
		count.add_theme_color_override("font_shadow_color",Color("142e33"))
		count.add_theme_constant_override("shadow_outline_size",4)
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		count.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(count)
		quickslot_counts.append(count)
		var cooldown = SkillCooldown.new()
		cooldown.size = Vector2(56,56)
		cooldown.visible = false
		slot.add_child(cooldown)
		cooldown_bars[slot] = cooldown
		set_quickslot(i, quickslot_bindings[i])
	var nav = HBoxContainer.new()
	nav.add_theme_constant_override("separation", 0)
	bottom_stack.add_child(nav)
	for item in [["지도", "map"], ["소지품", "inventory"], ["의뢰", "quests"], ["기록", "journal"], ["메뉴", "menu"]]:
		var nav_button = button(item[0], func(): menu_requested.emit(item[1]), Vector2(0, 31))
		nav_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		nav_button.add_theme_font_size_override("font_size",11)
		nav_button.add_theme_stylebox_override("normal", style(Color.TRANSPARENT))
		nav.add_child(nav_button)
		touch_buttons.append(nav_button)
	for target in touch_buttons: joystick.blocked_controls.append(target)
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
	root.resized.connect(_layout)
	_layout()

func _action_caption(text: String, width: float) -> Label:
	var caption = label(text,10,Color("edf0df"))
	caption.size = Vector2(width,17)
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	caption.add_theme_color_override("font_shadow_color",Color(.02,.06,.08,.95))
	caption.add_theme_constant_override("shadow_outline_size",1)
	return caption

func _key_badge(parent: Control, text: String, point: Vector2) -> void:
	var badge = PanelContainer.new()
	badge.position = point
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var skin = style(Color("142e33"), Color("71867d"))
	skin.set_corner_radius_all(3)
	skin.content_margin_left = 5
	skin.content_margin_right = 5
	skin.content_margin_top = 1
	skin.content_margin_bottom = 1
	badge.add_theme_stylebox_override("panel", skin)
	parent.add_child(badge)
	var text_label = label(text, 10, GOLD)
	text_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_child(text_label)

func set_quickslot(index: int, command: String) -> void:
	quickslot_bindings[index] = command if SLOT_NAMES.has(command) else ""
	quickslot_icons[index].kind = quickslot_bindings[index]
	quickslot_buttons[index].set("utility",quickslot_bindings[index].is_empty())
	quickslot_labels[index].text = SLOT_NAMES[quickslot_bindings[index]] if not quickslot_bindings[index].is_empty() else ""
	quickslot_buttons[index].set("accent",{"fireball":Color("f0c49b"),"dodge":Color("b7dfdb"),"potion":Color("a8ccea")}.get(quickslot_bindings[index],Color("a4b7ab")))

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
	reset_touch_controls()
	joystick.set_enabled(false)
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

func reset_touch_controls() -> void:
	joystick.reset()
	for target in action_touches.values(): target.set_pressed_no_signal(false)
	action_touches.clear()

# BaseButton relies on a single emulated mouse. Track action fingers separately
# so the right thumb still works while the left thumb owns the joystick.
func _input(event: InputEvent) -> void:
	# Explicit touch handling owns these controls; suppress the compatibility
	# mouse events so a single tap cannot also activate a BaseButton or path.
	if event is InputEventMouse and event.device == InputEvent.DEVICE_ID_EMULATION and not overlay.visible:
		if joystick.is_active() or joystick.can_start(event.position):
			get_viewport().set_input_as_handled()
			return
		for target in touch_buttons:
			if target.get_global_rect().has_point(event.position):
				get_viewport().set_input_as_handled()
				return
	if event is InputEventScreenTouch:
		if action_touches.has(event.index):
			var target: Button = action_touches[event.index]
			if not event.pressed or event.canceled:
				action_touches.erase(event.index)
				target.set_pressed_no_signal(false)
				if not event.canceled and not overlay.visible and not target.disabled and target.get_global_rect().has_point(event.position):
					target.pressed.emit()
			get_viewport().set_input_as_handled()
		elif event.pressed and not event.canceled and not overlay.visible:
			for target in touch_buttons:
				if target.is_visible_in_tree() and target.get_global_rect().has_point(event.position):
					action_touches[event.index] = target
					target.set_pressed_no_signal(not target.disabled)
					get_viewport().set_input_as_handled()
					return
	elif event is InputEventScreenDrag and action_touches.has(event.index):
		var target: Button = action_touches[event.index]
		target.set_pressed_no_signal(not target.disabled and target.get_global_rect().has_point(event.position))
		get_viewport().set_input_as_handled()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_instance_valid(joystick): reset_touch_controls()

func _process(delta: float) -> void:
	toast_time = maxf(0, toast_time - delta)
	toast_label.visible = toast_time > 0
	interaction_caption.text = interaction.text

func _layout() -> void:
	var available = root.get_viewport_rect().size
	var width = available.x
	# Expand the world with the window while keeping HUD text and navigation
	# within comfortable reading widths. Portrait retains its original layout.
	header.offset_left = maxf(0, (width - 720) / 2)
	header.offset_right = -header.offset_left
	navigation.offset_left = maxf(12, (width - 480) / 2)
	navigation.offset_right = -navigation.offset_left
	var panel_width = minf(720, width * .75) if width >= 900 else 480.0
	panel.offset_left = maxf(14, (width - panel_width) / 2)
	panel.offset_right = -panel.offset_left
	panel.offset_top = minf(165, available.y * .18)
	reset_touch_controls()
