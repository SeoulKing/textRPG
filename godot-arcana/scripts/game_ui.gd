extends CanvasLayer

signal menu_requested(kind: String)
signal interact_pressed
signal quickslot_pressed(index: int)
signal move_changed(direction: Vector2)
signal panel_closed
const FONT = preload("res://fonts/NotoSansKR-Medium.tres")
const FONT_STRONG = preload("res://fonts/NotoSansKR-SemiBold.tres")
const Joystick = preload("res://scripts/virtual_joystick.gd")
const SlotIcon = preload("res://scripts/quickslot_icon.gd")
const NavIcon = preload("res://scripts/bottom_nav_icon.gd")
const ActionButton = preload("res://scripts/mobile_action_button.gd")
const SkillCooldown = preload("res://scripts/skill_cooldown.gd")
const SLOT_NAMES = {"fireball":"불꽃탄", "flame_wave":"화염파", "flame_guard":"불꽃 장막", "dodge":"회피", "potion":"포션", "dev_speed":"개발 가속", "":"등록"}
const INK = Color("26364d")
const MUTED = Color("586779")
const GOLD = Color("856129")
const PAPER = Color("fffaf0")
const EDGE = Color("c7cbd2")
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
var action_cluster: Control
var quickslot_buttons: Array[Button] = []
var quickslot_icons: Array = []
var quickslot_labels: Array[Label] = []
var quickslot_counts: Array[Label] = []
var quickslot_bindings: Array[String] = ["fireball", "dodge", "potion", ""]
var cooldown_bars: Dictionary = {}
var toast_time = 0.0
var joystick
var touch_buttons: Array[Button] = []
var action_touches: Dictionary = {}

func style(background: Color, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var value = StyleBoxFlat.new()
	value.bg_color = background
	value.set_corner_radius_all(10)
	value.border_color = border
	value.set_border_width_all(1 if border.a > 0 else 0)
	value.content_margin_left = 12
	value.content_margin_right = 12
	value.content_margin_top = 9
	value.content_margin_bottom = 9
	return value

func label(text: String, size: int = 14, color: Color = INK, emphasis: bool = false) -> Label:
	var node = Label.new()
	node.text = text
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", color)
	if emphasis: node.add_theme_font_override("font", FONT_STRONG)
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
	theme.default_font_size = 14
	theme.set_font("font", "Button", FONT_STRONG)
	theme.set_color("font_color", "Button", INK)
	theme.set_color("font_hover_color", "Button", INK)
	theme.set_color("font_disabled_color", "Button", Color("798291"))
	theme.set_color("font_pressed_color", "Button", INK)
	theme.set_color("font_focus_color", "Button", INK)
	theme.set_stylebox("normal", "Button", style(Color("fffaf0"), Color("c7cbd2")))
	theme.set_stylebox("hover", "Button", style(Color("e7f2ff"), GOLD))
	theme.set_stylebox("pressed", "Button", style(Color("d5e7fb"), GOLD))
	theme.set_stylebox("disabled", "Button", style(Color("e9e9e6"), Color("d3d7dd")))
	theme.set_stylebox("focus", "Button", style(Color.TRANSPARENT, Color("4678b5")))
	root.theme = theme
	var top = PanelContainer.new()
	header = top
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_top = 12
	top.offset_bottom = 102
	var header_style = style(Color(PAPER,.97), Color(1,1,1,.95))
	header_style.set_corner_radius_all(16)
	header_style.shadow_color = Color(.10,.17,.28,.18)
	header_style.shadow_size = 8
	header_style.shadow_offset = Vector2(0,3)
	header_style.content_margin_left = 16
	header_style.content_margin_right = 16
	header_style.content_margin_top = 11
	header_style.content_margin_bottom = 11
	top.add_theme_stylebox_override("panel", header_style)
	root.add_child(top)
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 8)
	top.add_child(stack)
	var heading = HBoxContainer.new()
	heading.add_theme_constant_override("separation",8)
	stack.add_child(heading)
	title_label = label("ARCANA", 11, GOLD, true)
	heading.add_child(title_label)
	zone_label = label("분수 광장", 16, INK, true)
	zone_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zone_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	heading.add_child(zone_label)
	money_label = label("", 14, GOLD, true)
	heading.add_child(money_label)
	var stats = HBoxContainer.new()
	stats.add_theme_constant_override("separation", 10)
	stack.add_child(stats)
	for id in ["HP", "MP"]:
		var section = HBoxContainer.new()
		section.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stats.add_child(section)
		var stat = label(id, 13, INK, true)
		section.add_child(stat)
		var bar = make_bar(Color("df596c") if id == "HP" else Color("398bda"), 7)
		bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		section.add_child(bar)
		if id == "HP": hp_label = stat; hp_bar = bar
		else: mp_label = stat; mp_bar = bar
	xp_bar = make_bar(Color("b58b3c"), 3)
	stack.add_child(xp_bar)
	var bottom = PanelContainer.new()
	navigation = bottom
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -92
	bottom.offset_bottom = -16
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var dock_style = style(Color("fcfcfd"),Color("d9dfe7"))
	dock_style.set_corner_radius_all(18)
	dock_style.shadow_color = Color(.10,.17,.28,.20)
	dock_style.shadow_size = 8
	dock_style.shadow_offset = Vector2(0,3)
	dock_style.content_margin_left = 6
	dock_style.content_margin_right = 6
	dock_style.content_margin_top = 3
	dock_style.content_margin_bottom = 3
	bottom.add_theme_stylebox_override("panel",dock_style)
	root.add_child(bottom)
	var bottom_stack = VBoxContainer.new()
	bottom_stack.add_theme_constant_override("separation", 7)
	bottom.add_child(bottom_stack)
	hint_label = label("", 13, Color("fffaf0"))
	# Central persistent status captions obscure the player; use button tooltips.
	hint_label.hide()
	hint_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint_label.add_theme_color_override("font_shadow_color", Color("142e33"))
	hint_label.add_theme_constant_override("shadow_outline_size", 4)
	hint_label.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	hint_label.offset_top = -370
	hint_label.offset_bottom = -342
	hint_label.offset_left = 16
	hint_label.offset_right = -16
	hint_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hint_label)
	joystick = Joystick.new()
	joystick.direction_changed.connect(func(value): move_changed.emit(value))
	root.add_child(joystick)
	var cluster = Control.new()
	action_cluster = cluster
	cluster.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	cluster.offset_left = -236
	cluster.offset_top = -342
	cluster.offset_right = -16
	cluster.offset_bottom = -94
	cluster.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(cluster)
	interaction = ActionButton.new()
	interaction.set("primary",true)
	interaction.set("accent",Color("477db6"))
	interaction.text = "상호작용"
	interaction.accessibility_name = "주변 사물이나 건물과 상호작용"
	interaction.position = Vector2(126,112)
	interaction.custom_minimum_size = Vector2(76,76)
	interaction.size = Vector2(76,76)
	interaction.pressed.connect(func(): interact_pressed.emit())
	cluster.add_child(interaction)
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
		var count = label("", 13, Color("ffffff"), true)
		count.position = Vector2(34,0)
		count.size = Vector2(18,18)
		count.add_theme_color_override("font_shadow_color",Color("142e33"))
		count.add_theme_constant_override("shadow_outline_size",2)
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		count.mouse_filter = Control.MOUSE_FILTER_IGNORE
		# Layer order: surface, icon, cooldown, quantity, shortcut.
		slot.add_child(count)
		quickslot_counts.append(count)
		var cooldown = SkillCooldown.new()
		cooldown.size = Vector2(56,56)
		cooldown.visible = false
		slot.add_child(cooldown)
		cooldown_bars[slot] = cooldown
		slot.move_child(count, -1)
		slot.add_key_hint_overlay()
		set_quickslot(i, quickslot_bindings[i])
	var nav = HBoxContainer.new()
	nav.add_theme_constant_override("separation", 0)
	bottom_stack.add_child(nav)
	for item in [["지도", "map"], ["소지품", "inventory"], ["의뢰", "quests"], ["스킬", "skills"], ["메뉴", "menu"]]:
		var nav_button = button(item[0], func(): menu_requested.emit(item[1]), Vector2(0, 64))
		nav_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		nav_button.text = ""
		var nav_stack = VBoxContainer.new()
		nav_stack.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		nav_stack.offset_top = 7
		nav_stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		nav_stack.add_theme_constant_override("separation",4)
		nav_button.add_child(nav_stack)
		var nav_icon = NavIcon.new()
		nav_icon.kind = item[1]
		nav_icon.custom_minimum_size = Vector2(24,24)
		nav_icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		nav_stack.add_child(nav_icon)
		var nav_label = label(item[0],15,INK,true)
		nav_label.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
		nav_label.add_theme_constant_override("outline_size",0)
		nav_label.add_theme_constant_override("shadow_outline_size",0)
		nav_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nav_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		nav_stack.add_child(nav_label)
		nav_button.tooltip_text = item[0]
		nav_button.accessibility_name = item[0]
		nav_button.add_theme_stylebox_override("normal", style(Color.TRANSPARENT))
		nav_button.add_theme_stylebox_override("hover",style(Color("edf2f7")))
		nav_button.add_theme_stylebox_override("pressed",style(Color("e0e8f1")))
		nav.add_child(nav_button)
		touch_buttons.append(nav_button)
	for target in touch_buttons: joystick.blocked_controls.append(target)
	toast_label = label("", 14, Color("fffaf0"))
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	toast_label.offset_top = 116
	toast_label.offset_bottom = 156
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
	var caption = label(text,13,Color("fffaf0"),true)
	caption.size = Vector2(width,21)
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	caption.add_theme_color_override("font_shadow_color",Color(.02,.06,.08,.95))
	caption.add_theme_constant_override("shadow_outline_size",1)
	return caption

func _key_badge(parent: Control, text: String, point: Vector2) -> void:
	var badge = PanelContainer.new()
	badge.position = point
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var skin = style(PAPER, EDGE)
	skin.set_corner_radius_all(3)
	skin.content_margin_left = 5
	skin.content_margin_right = 5
	skin.content_margin_top = 1
	skin.content_margin_bottom = 1
	badge.add_theme_stylebox_override("panel", skin)
	parent.add_child(badge)
	var text_label = label(text, 11, GOLD, true)
	text_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	badge.add_child(text_label)

func set_quickslot(index: int, command: String) -> void:
	quickslot_bindings[index] = command if SLOT_NAMES.has(command) else ""
	quickslot_icons[index].kind = quickslot_bindings[index]
	quickslot_icons[index].size = Vector2(32,32) if quickslot_bindings[index] in ["fireball","flame_wave","flame_guard"] else Vector2(30,30)
	quickslot_icons[index].position = Vector2(12,12) if quickslot_bindings[index] in ["fireball","flame_wave","flame_guard"] else Vector2(13,12)
	quickslot_buttons[index].set("utility",quickslot_bindings[index].is_empty())
	quickslot_labels[index].text = SLOT_NAMES[quickslot_bindings[index]] if not quickslot_bindings[index].is_empty() else ""
	quickslot_buttons[index].set("accent",{"fireball":Color("d96a33"),"flame_wave":Color("ee7c32"),"flame_guard":Color("b66b35"),"dodge":Color("347c9c"),"potion":Color("536dcb")}.get(quickslot_bindings[index],MUTED))

func make_bar(color: Color, height: int) -> ProgressBar:
	var bar = ProgressBar.new()
	bar.custom_minimum_size.y = height
	bar.show_percentage = false
	var background = style(Color("d7dce3"))
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
	panel.add_theme_stylebox_override("panel", style(PAPER, Color("ffffff")))
	overlay.add_child(panel)
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 12)
	panel.add_child(stack)
	var heading = HBoxContainer.new()
	heading.add_theme_constant_override("separation",8)
	stack.add_child(heading)
	panel_title = label("아르카나", 20, GOLD, true)
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
	content.get_parent().scroll_vertical = 0
	close_button.visible = can_close
	for child in content.get_children():
		content.remove_child(child)
		child.queue_free()
	overlay.show()

func close_panel() -> void:
	overlay.hide()
	panel_closed.emit()

func section_tabs(names: Array, selected: int, callbacks: Array) -> void:
	var tabs = HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	content.add_child(tabs)
	for i in range(names.size()):
		var tab = button(str(names[i]), callbacks[i])
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab.disabled = i == selected
		tab.add_theme_stylebox_override("disabled", style(Color("e0ebf3"), Color("a7bccf")))
		tab.add_theme_color_override("font_disabled_color", INK)
		tabs.add_child(tab)
	var gap = Control.new()
	gap.custom_minimum_size.y = 16
	content.add_child(gap)

func character_portrait(texture: Texture2D) -> void:
	var frame = PanelContainer.new()
	frame.add_theme_stylebox_override("panel", style(Color("eef2f5"), EDGE))
	content.add_child(frame)
	var portrait = TextureRect.new()
	portrait.texture = texture
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.custom_minimum_size = Vector2(0, 272)
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	frame.add_child(portrait)

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

func choice(text: String, detail: String, callback: Callable, disabled: bool = false, icon_kind: String = "") -> void:
	var line = HSeparator.new()
	line.modulate = Color("b9c2cc")
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
	var body = HBoxContainer.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_theme_constant_override("separation",8)
	row.add_child(body)
	if not icon_kind.is_empty():
		var icon = SlotIcon.new()
		icon.kind = icon_kind
		icon.custom_minimum_size = Vector2(32,32)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon.modulate.a = .45 if disabled else 1.0
		body.add_child(icon)
	var stack = VBoxContainer.new()
	stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(stack)
	var title = label(text, 14, MUTED if disabled else INK, true)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stack.add_child(title)
	if not detail.is_empty():
		var desc = label(detail, 12, MUTED)
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

func _layout() -> void:
	var available = root.get_viewport_rect().size
	var width = available.x
	# Expand the world with the window while keeping HUD text and navigation
	# within comfortable reading widths. Portrait retains its original layout.
	header.offset_left = maxf(12, (width - 640) / 2)
	header.offset_right = -header.offset_left
	navigation.offset_left = maxf(12, (width - 480) / 2)
	navigation.offset_right = -navigation.offset_left
	var panel_width = minf(720, width * .75) if width >= 900 else 480.0
	panel.offset_left = maxf(14, (width - panel_width) / 2)
	panel.offset_right = -panel.offset_left
	panel.offset_top = minf(165, available.y * .18)
	reset_touch_controls()
