extends CanvasLayer

signal menu_requested(kind: String)
signal interact_pressed
signal quickslot_pressed(index: int)
signal move_changed(direction: Vector2)
signal panel_closed
signal toast_shown(text: String)
signal hud_size_committed(percentage: int)
signal menu_size_committed(percentage: int)
const FONT = preload("res://fonts/NotoSansKR-Medium.tres")
const FONT_STRONG = preload("res://fonts/NotoSansKR-SemiBold.tres")
const PROSE_FONT = preload("res://fonts/KoPubBatangMedium.ttf")
const Joystick = preload("res://scripts/virtual_joystick.gd")
const SlotIcon = preload("res://scripts/quickslot_icon.gd")
const NavIcon = preload("res://scripts/bottom_nav_icon.gd")
const ActionButton = preload("res://scripts/mobile_action_button.gd")
const SkillTreeView = preload("res://scripts/skill_tree_view.gd")
const ItemThumbnail = preload("res://scripts/item_thumbnail.gd")
var skill_tree_view: Control
var shop_view: Control
var inventory_view: Control
var quest_view: Control
var _skill_progress_rows: Dictionary = {}
const SkillCooldown = preload("res://scripts/skill_cooldown.gd")
const SLOT_NAMES = {"meteor":"메테오","giant_fireball":"거대화염구","flame_barrage":"화염난사","fireball":"파이어볼", "flame_wave":"화염파", "flame_guard":"불꽃 장막", "dodge":"대시", "teleport":"텔레포트", "potion":"포션", "dev_speed":"개발 가속", "":"등록"}
const INK = Color("26364d")
const MUTED = Color("586779")
const GOLD = Color("856129")
const PAPER = Color("fffaf0")
const EDGE = Color("c7cbd2")
const MENU_NAVY = Color("263b51")
const MENU_RULE = Color("ded7c8")
const TEXT_INK := Color("1f2933")
const TEXT_PROSE := Color("2b3640")
const TEXT_MUTED := Color("65717d")
const TEXT_ACCENT := Color("216892")
const TEXT_SKY := Color("b1e1ff")
const TEXT_RULE := Color("d6e2ea")
const DESKTOP_MENU_DEFAULT := 70
const DESKTOP_MENU_AREA := Vector2(780, 560)
const DESKTOP_MENU_CSS_SCALE := 1.5
const QUICKSLOT_SIZE_MIN := 0.4
const QUICKSLOT_SIZE_MAX := 1.1

class MenuSky extends Control:
	func _draw() -> void:
		var center := Vector2(size.x - 62.0, size.y * 0.57)
		var brass := Color("e4c788")
		for radius: float in [24.0, 35.0]:
			draw_arc(center, radius, 0.0, TAU, 80, Color(brass, 0.19), 1.0, true)
		var star := center + Vector2(-26, -15)
		draw_colored_polygon(PackedVector2Array([
			star + Vector2(0, -6), star + Vector2(1.5, -1.5), star + Vector2(6, 0),
			star + Vector2(1.5, 1.5), star + Vector2(0, 6), star + Vector2(-1.5, 1.5),
			star + Vector2(-6, 0), star + Vector2(-1.5, -1.5)]), brass)
		draw_circle(center + Vector2(0, 24), 2, brass, true, -1, true)

var mei_nameplate: Label
var mei_nameplate_anchor: Node2D
var mei_nameplate_pixel_scale = Vector2.ZERO
var mei_nameplate_layout_size = Vector2.ZERO
var mei_nameplate_pixel_offset = Vector2.ZERO
var root: Control
var hud: Control
var hud_size_percent: int = 100
var menu_size_percent: int = 100
var _desktop_web := false
var _hud_size_slider: HSlider
var _menu_size_slider: HSlider
var _dragged_size_slider: HSlider
var header: PanelContainer
var navigation: PanelContainer
var title_label: Label
var zone_label: Label
var money_label: Label
var hp_label: Label
var mp_label: Label
var hp_bar: ProgressBar
var mp_bar: ProgressBar
var hunger_bar: ProgressBar
var hunger_label: Label
var hint_label: Label
var toast_label: Label
var overlay: Control
var menu_views: Control
var panel: PanelContainer
var panel_title: Label
var content: VBoxContainer
var close_button: Button
var interaction: Button
var interaction_caption: Label
var control_layouts: Dictionary = {}
var action_cluster: Control
var quickslot_buttons: Array[Button] = []
var quickslot_icons: Array = []
var quickslot_labels: Array[Label] = []
var quickslot_counts: Array[Label] = []
var quickslot_bindings: Array[String] = ["fireball", "teleport", "potion", ""]
var cooldown_bars: Dictionary = {}
var toast_time = 0.0
var joystick
var touch_buttons: Array[Button] = []
var action_touches: Dictionary = {}
var panel_scroll: ScrollContainer
var panel_body: MarginContainer
var panel_custom_body: Control
var _panel_tabs: HBoxContainer
var _inventory_balance: Label
var panel_header: PanelContainer
var panel_dim: ColorRect
var _sheet_backdrop: Button
var _tab_sheet := false
var _sheet_reveal := 1.0
var _sheet_tween: Tween
var _panel_sky: Control
var _text_panel_theme: Theme
var _text_mode := false
var cooking_panel_on_left := false
var fit_menu_height := false
var _wide_panel := false
var button_list_touch_enabled: bool = false
var panel_touch_index: int = -1
var panel_touch_origin: Vector2 = Vector2.ZERO
var panel_touch_scroll: int = 0
var panel_touch_dragged: bool = false
var panel_touch_button: Button
const PANEL_DRAG_DISTANCE: float = 10.0

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
	if OS.has_feature("web"):
		_desktop_web = bool(JavaScriptBridge.eval("matchMedia('(pointer: fine)').matches"))
		if _desktop_web:
			menu_size_percent = DESKTOP_MENU_DEFAULT
	root = Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	# Controls snap their local transforms in the renderer, even when position
	# reports fractions. Move a Node2D carrier so physical-pixel placement survives.
	mei_nameplate_anchor = Node2D.new()
	root.add_child(mei_nameplate_anchor)
	mei_nameplate = label("메이", 13, Color("f4ecd9"))
	mei_nameplate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mei_nameplate.add_theme_font_override("font", FONT)
	mei_nameplate.add_theme_color_override("font_shadow_color", Color("171c26"))
	mei_nameplate.add_theme_constant_override("shadow_offset_x", 1)
	mei_nameplate.add_theme_constant_override("shadow_offset_y", 1)
	mei_nameplate_anchor.add_child(mei_nameplate)
	mei_nameplate_anchor.hide()
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
	hud = Control.new()
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(hud)
	var top = PanelContainer.new()
	header = top
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	top.offset_top = 12
	top.offset_bottom = 164
	top.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
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
	hud.add_child(top)
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 6)
	top.add_child(stack)
	var heading = HBoxContainer.new()
	heading.add_theme_constant_override("separation",8)
	title_label = label("ARCANA", 11, GOLD, true)
	heading.add_child(title_label)
	title_label.hide() # Keep the update interface; omit redundant branding from the HUD.
	zone_label = label("분수 광장", 18, INK, true)
	zone_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zone_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	heading.add_child(zone_label)
	money_label = label("", 16, GOLD, true)
	heading.add_child(money_label)
	money_label.hide()
	var stats = VBoxContainer.new()
	stats.add_theme_constant_override("separation", 4)
	stack.add_child(stats)
	for id in ["HP", "MP", "허기"]:
		var bar = make_bar(Color("df596c") if id == "HP" else Color("398bda") if id == "MP" else Color("b38a42"), 28)
		stats.add_child(bar)
		var stat = label(id, 16, Color.WHITE, true)
		stat.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		stat.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		stat.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		stat.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		stat.add_theme_color_override("font_outline_color", Color("26364d"))
		stat.add_theme_constant_override("outline_size", 3)
		stat.mouse_filter = Control.MOUSE_FILTER_IGNORE
		bar.add_child(stat)
		if id == "HP": hp_label = stat; hp_bar = bar
		elif id == "MP": mp_label = stat; mp_bar = bar
		else: hunger_label = stat; hunger_bar = bar
	stack.add_child(heading)
	var bottom = PanelContainer.new()
	navigation = bottom
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -92
	bottom.offset_bottom = -16
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var dock_style = style(PAPER, Color("d7cbb4"))
	dock_style.set_corner_radius_all(18)
	dock_style.shadow_color = Color(.10,.17,.28,.20)
	dock_style.shadow_size = 8
	dock_style.shadow_offset = Vector2(0,3)
	dock_style.content_margin_left = 6
	dock_style.content_margin_right = 6
	dock_style.content_margin_top = 3
	dock_style.content_margin_bottom = 3
	bottom.add_theme_stylebox_override("panel",dock_style)
	hud.add_child(bottom)
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
	hud.add_child(hint_label)
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
	interaction_caption = label("", 12, INK, true)
	interaction_caption.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	interaction_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	interaction_caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	interaction_caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	interaction_caption.hide()
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
		slot.pivot_offset = slot.size * 0.5
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
		nav_stack.alignment = BoxContainer.ALIGNMENT_CENTER
		nav_stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		nav_stack.add_theme_constant_override("separation",4)
		nav_button.add_child(nav_stack)
		var nav_icon = NavIcon.new()
		nav_icon.kind = item[1]
		nav_icon.custom_minimum_size = Vector2(24,24)
		nav_icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		nav_stack.add_child(nav_icon)
		nav_button.tooltip_text = item[0]
		nav_button.accessibility_name = item[0]
		nav_button.add_theme_stylebox_override("normal", style(Color.TRANSPARENT))
		nav_button.add_theme_stylebox_override("hover",style(Color("f2ebdb")))
		nav_button.add_theme_stylebox_override("pressed",style(Color("e6dbc2")))
		nav.add_child(nav_button)
		touch_buttons.append(nav_button)
	for target in touch_buttons: joystick.blocked_controls.append(target)
	toast_label = label("", 14, Color("fffaf0"))
	toast_label.z_index = 1
	toast_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	toast_label.offset_top = 116
	toast_label.offset_bottom = 156
	toast_label.offset_left = 18
	toast_label.offset_right = -18
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	toast_label.add_theme_color_override("font_shadow_color", Color("142e33"))
	toast_label.add_theme_constant_override("shadow_outline_size", 5)
	hud.add_child(toast_label)
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
	quickslot_buttons[index].action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS if command == "teleport" else BaseButton.ACTION_MODE_BUTTON_RELEASE
	quickslot_icons[index].kind = quickslot_bindings[index]
	quickslot_icons[index].size = Vector2(48,48) if quickslot_bindings[index] in ["fireball","flame_wave","flame_guard"] else Vector2(45,45)
	quickslot_icons[index].position = (quickslot_buttons[index].size - quickslot_icons[index].size) * 0.5
	quickslot_buttons[index].set("utility",quickslot_bindings[index].is_empty())
	quickslot_labels[index].text = SLOT_NAMES[quickslot_bindings[index]] if not quickslot_bindings[index].is_empty() else ""
	quickslot_buttons[index].set("accent",{"fireball":Color("d96a33"),"flame_wave":Color("ee7c32"),"flame_guard":Color("b66b35"),"dodge":Color("347c9c"),"teleport":Color("657dcc"),"potion":Color("536dcb")}.get(quickslot_bindings[index],MUTED))

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
	root.add_child(overlay)
	panel_dim = ColorRect.new()
	panel_dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(panel_dim)
	_sheet_backdrop = Button.new()
	_sheet_backdrop.flat = true
	_sheet_backdrop.focus_mode = Control.FOCUS_NONE
	_sheet_backdrop.accessibility_name = "닫기"
	for state in ["normal", "hover", "pressed"]:
		_sheet_backdrop.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	_sheet_backdrop.pressed.connect(close_panel)
	panel_dim.add_child(_sheet_backdrop)
	_sheet_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu_views = Control.new()
	menu_views.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(menu_views)
	panel = PanelContainer.new()
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(panel)
	var stack = VBoxContainer.new()
	stack.add_theme_constant_override("separation", 0)
	panel.add_child(stack)
	panel_header = PanelContainer.new()
	panel_header.clip_contents = true
	stack.add_child(panel_header)
	_panel_sky = MenuSky.new()
	_panel_sky.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel_header.add_child(_panel_sky)
	var heading = HBoxContainer.new()
	heading.add_theme_constant_override("separation",8)
	panel_header.add_child(heading)
	panel_title = label("아르카나", 21, PAPER, true)
	panel_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel_title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	heading.add_child(panel_title)
	_inventory_balance = label("", 14, GOLD)
	_inventory_balance.hide()
	heading.add_child(_inventory_balance)
	close_button = button("×", close_panel, Vector2(44, 44))
	close_button.tooltip_text = "닫기"
	close_button.accessibility_name = "닫기"
	close_button.add_theme_font_size_override("font_size", 23)
	heading.add_child(close_button)
	_text_panel_theme = _make_text_panel_theme()
	_apply_panel_style()
	panel_body = MarginContainer.new()
	panel_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel_body.add_theme_constant_override("margin_left", 16)
	panel_body.add_theme_constant_override("margin_right", 16)
	panel_body.add_theme_constant_override("margin_top", 10)
	panel_body.add_theme_constant_override("margin_bottom", 12)
	stack.add_child(panel_body)
	var body_stack := VBoxContainer.new()
	body_stack.add_theme_constant_override("separation", 8)
	panel_body.add_child(body_stack)
	_panel_tabs = HBoxContainer.new()
	_panel_tabs.hide()
	body_stack.add_child(_panel_tabs)
	var scroll = ScrollContainer.new()
	panel_scroll = scroll
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body_stack.add_child(scroll)
	panel_custom_body = Control.new()
	panel_custom_body.clip_contents = true
	panel_custom_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	panel_custom_body.hide()
	body_stack.add_child(panel_custom_body)
	content = VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 0)
	scroll.add_child(content)
	content.minimum_size_changed.connect(_layout_panel)
	overlay.hide()

func set_text_mode(enabled: bool) -> void:
	if _text_mode == enabled: return
	_text_mode = enabled
	if not enabled: _tab_sheet = false
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.arcanaSetTextMode?.(%s)" % ("true" if enabled else "false"))
	elif OS.has_feature("android") or OS.has_feature("ios"):
		var orientation := DisplayServer.SCREEN_SENSOR_PORTRAIT if enabled else int(ProjectSettings.get_setting("display/window/handheld/orientation"))
		DisplayServer.screen_set_orientation(orientation as DisplayServer.ScreenOrientation)
	overlay.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR if enabled else CanvasItem.TEXTURE_FILTER_PARENT_NODE
	_apply_panel_style()
	_layout_panel()

func _make_text_panel_theme() -> Theme:
	var theme := root.theme.duplicate() as Theme
	var flat := StyleBoxFlat.new()
	flat.bg_color = Color.TRANSPARENT
	flat.content_margin_left = 8
	flat.content_margin_right = 8
	var focus := flat.duplicate() as StyleBoxFlat
	focus.border_color = TEXT_ACCENT
	focus.set_border_width_all(1)
	for state in ["normal", "hover", "pressed", "disabled"]:
		theme.set_stylebox(state, "Button", flat)
	theme.set_stylebox("focus", "Button", focus)
	theme.set_color("font_color", "Button", TEXT_INK)
	theme.set_color("font_disabled_color", "Button", TEXT_MUTED)
	for state in ["font_hover_color", "font_pressed_color", "font_focus_color"]:
		theme.set_color(state, "Button", TEXT_ACCENT)
	return theme

func _apply_panel_style() -> void:
	panel.theme = _text_panel_theme if _text_mode else null
	panel_dim.color = TEXT_INK if _text_mode else Color("112131a6")
	_panel_sky.visible = not _text_mode and not _wide_panel
	_sheet_backdrop.visible = _tab_sheet
	if _tab_sheet:
		_apply_tab_sheet_style()
		return
	close_button.remove_theme_stylebox_override("focus")
	var paper := StyleBoxFlat.new()
	paper.bg_color = Color.WHITE if _text_mode else PAPER
	paper.border_color = TEXT_RULE if _text_mode else Color("d9c8a8")
	paper.set_border_width_all(1)
	if not _text_mode:
		paper.set_corner_radius_all(14)
		paper.shadow_color = Color("0e1b2a66")
		paper.shadow_size = 12
		paper.shadow_offset = Vector2(0, 4)
	panel.add_theme_stylebox_override("panel", paper)
	var light_header := _text_mode or _wide_panel
	var band := style(paper.bg_color if light_header else MENU_NAVY)
	band.set_corner_radius_all(0)
	band.corner_radius_top_left = 0 if _text_mode else 13
	band.corner_radius_top_right = band.corner_radius_top_left
	band.border_width_bottom = 1 if light_header else 2
	band.border_color = EDGE if _wide_panel else TEXT_RULE if _text_mode else Color("bda26b")
	band.content_margin_left = 19
	band.content_margin_right = 10
	band.content_margin_top = 3 if _wide_panel else 6
	band.content_margin_bottom = band.content_margin_top
	panel_header.add_theme_stylebox_override("panel", band)
	panel_title.add_theme_color_override("font_color", INK if _wide_panel else TEXT_INK if _text_mode else PAPER)
	close_button.text = "닫기" if _wide_panel else "×"
	close_button.custom_minimum_size = Vector2(54, 34) if _wide_panel else Vector2(44, 44)
	close_button.add_theme_font_size_override("font_size", 14 if _wide_panel else 23)
	for state in ["normal", "hover", "pressed"]:
		if _wide_panel:
			var close_style := style(PAPER if state == "normal" else Color("e0efff"), EDGE)
			close_style.set_content_margin_all(0)
			close_button.add_theme_stylebox_override(state, close_style)
		elif _text_mode:
			close_button.remove_theme_stylebox_override(state)
		else:
			var fill := Color("33495e") if state == "normal" else Color("455c71")
			var close_style := style(fill)
			close_style.set_content_margin_all(0)
			close_button.add_theme_stylebox_override(state, close_style)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		if _wide_panel:
			close_button.add_theme_color_override(state, INK)
		elif _text_mode:
			close_button.remove_theme_color_override(state)
		else:
			close_button.add_theme_color_override(state, PAPER)

func _apply_tab_sheet_style() -> void:
	var surface := StyleBoxFlat.new()
	surface.bg_color = Color.WHITE
	surface.corner_radius_top_left = 18
	surface.corner_radius_top_right = 18
	surface.border_color = TEXT_RULE
	surface.border_width_top = 1
	surface.shadow_color = Color(0.08, 0.15, 0.22, 0.14)
	surface.shadow_size = 8
	panel.add_theme_stylebox_override("panel", surface)

	var heading := StyleBoxFlat.new()
	heading.bg_color = Color.TRANSPARENT
	heading.border_color = TEXT_RULE
	heading.border_width_bottom = 1
	heading.content_margin_left = 16
	heading.content_margin_right = 12
	heading.content_margin_top = 6
	heading.content_margin_bottom = 6
	panel_header.add_theme_stylebox_override("panel", heading)
	panel_title.add_theme_color_override("font_color", TEXT_INK)
	close_button.text = "×"
	close_button.custom_minimum_size = Vector2(44, 44)
	close_button.add_theme_font_size_override("font_size", 23)
	var close_style := StyleBoxEmpty.new()
	for state in ["normal", "hover", "pressed", "focus"]:
		close_button.add_theme_stylebox_override(state, close_style)
	close_button.add_theme_color_override("font_color", TEXT_INK)
	for state in ["font_hover_color", "font_pressed_color", "font_focus_color"]:
		close_button.add_theme_color_override(state, TEXT_ACCENT)

func open_skill_tree(spell: Dictionary, selected: String, invest: Callable, reset: Callable, back: Callable) -> void:
	open_panel(str(spell.get("name","스킬")))
	panel.hide()
	skill_tree_view = SkillTreeView.new()
	skill_tree_view.spell = spell
	skill_tree_view.selected_id = selected
	skill_tree_view.invest_requested.connect(invest)
	skill_tree_view.reset_requested.connect(reset)
	skill_tree_view.close_requested.connect(back)
	menu_views.add_child(skill_tree_view)

func open_tab_panel(title: String, wide: bool = false) -> void:
	var animate := _text_mode and not (overlay.visible and _tab_sheet)
	open_panel(title, true, false, _text_mode, wide)
	if not _tab_sheet: return
	close_button.grab_focus()
	if animate:
		_set_sheet_reveal(0.0)
		_sheet_tween = create_tween()
		_sheet_tween.tween_method(_set_sheet_reveal, 0.0, 1.0, 0.22).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func open_section_panel(title: String, names: Array, selected: int, callbacks: Array, wide: bool = false, icon_kinds: Array[String] = []) -> void:
	open_tab_panel(title, wide)
	_populate_section_tabs(_panel_tabs, names, selected, callbacks, Vector2(66, 40), true, icon_kinds)
	_panel_tabs.show()

func show_tab_body(view: Control) -> void:
	panel_scroll.hide()
	panel_custom_body.show()
	panel_custom_body.add_child(view)
	view.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _clear_tab_body() -> void:
	_inventory_balance.hide()
	_panel_tabs.hide()
	for child in _panel_tabs.get_children():
		_panel_tabs.remove_child(child)
		child.queue_free()
	for child in panel_custom_body.get_children():
		panel_custom_body.remove_child(child)
		child.queue_free()
	panel_custom_body.hide()
	panel_scroll.show()
	if _sheet_tween:
		_sheet_tween.kill()
		_sheet_tween = null
	_sheet_reveal = 1.0

func open_panel(title: String, can_close: bool = true, dock_left: bool = false, tab_sheet: bool = false, wide: bool = false) -> void:
	cooking_panel_on_left = dock_left
	fit_menu_height = title == "모험 메뉴"
	if _wide_panel != wide or _tab_sheet != tab_sheet:
		_wide_panel = wide
		_tab_sheet = tab_sheet
		_apply_panel_style()
	button_list_touch_enabled = title in ["스킬", "상태", "모험 메뉴", "어디로 갈까요?", "화면 설정", "도움말", "모닥불 · 요리", "제작 · 모닥불", "식사", "집 · 주방", "내 집 · 거실", "내 집 · 침실"]
	_clear_inventory()
	_clear_tab_body()
	_clear_shop()
	_clear_quests()
	if is_instance_valid(skill_tree_view):
		skill_tree_view.queue_free()
		skill_tree_view = null
	panel.show()
	reset_touch_controls()
	_hud_size_slider = null
	_menu_size_slider = null
	joystick.set_enabled(false)
	panel_title.text = title
	content.get_parent().scroll_vertical = 0
	close_button.visible = can_close
	_skill_progress_rows.clear()
	for child in content.get_children():
		content.remove_child(child)
		child.queue_free()
	overlay.show()
	_layout_panel()

func close_panel() -> void:
	button_list_touch_enabled = false
	_skill_progress_rows.clear()
	_reset_panel_touch()
	_finish_size_drag()
	_clear_inventory()
	_clear_tab_body()
	_clear_shop()
	_clear_quests()
	if is_instance_valid(skill_tree_view):
		skill_tree_view.queue_free()
		skill_tree_view = null
	panel.show()
	overlay.hide()
	panel_closed.emit()

func section_tabs(names: Array, selected: int, callbacks: Array) -> void:
	var tabs := HBoxContainer.new()
	content.add_child(tabs)
	var min_size := Vector2(82, 34) if _wide_panel else Vector2(46, 40)
	_populate_section_tabs(tabs, names, selected, callbacks, min_size, not _wide_panel)
	var gap := Control.new()
	gap.custom_minimum_size.y = 6 if _wide_panel else 16
	content.add_child(gap)

func _populate_section_tabs(tabs: HBoxContainer, names: Array, selected: int, callbacks: Array, min_size: Vector2, expand: bool, icon_kinds: Array[String] = []) -> void:
	tabs.add_theme_constant_override("separation", 8)
	for i in range(names.size()):
		var tab := button(str(names[i]), callbacks[i], min_size)
		if expand:
			tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tab.disabled = i == selected
		if _text_mode:
			var selected_style := StyleBoxFlat.new()
			selected_style.bg_color = Color("edf8ff")
			selected_style.border_color = TEXT_ACCENT
			selected_style.border_width_bottom = 2
			tab.add_theme_stylebox_override("disabled", selected_style)
			tab.add_theme_color_override("font_disabled_color", TEXT_ACCENT)
		else:
			tab.add_theme_stylebox_override("disabled", style(Color("e0ebf3"), Color("a7bccf")))
			tab.add_theme_color_override("font_disabled_color", INK)
		tabs.add_child(tab)
		if i < icon_kinds.size():
			var icon := SlotIcon.texture_for(icon_kinds[i])
			if icon != null:
				_add_section_tab_content(tab, icon)

func _add_section_tab_content(tab: Button, texture: Texture2D) -> void:
	var caption := label(tab.text, tab.get_theme_font_size("font_size"), Color.WHITE, true)
	caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tab.accessibility_name = tab.text
	tab.text = ""

	var center := CenterContainer.new()
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tab.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 6)
	center.add_child(row)

	var icon := TextureRect.new()
	icon.texture = texture
	icon.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(26, 26)
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(icon)
	row.add_child(caption)
	tab.custom_minimum_size.x = maxf(tab.custom_minimum_size.x, row.get_combined_minimum_size().x + 16.0)

	const STATE_COLORS := {
		BaseButton.DRAW_DISABLED: "font_disabled_color",
		BaseButton.DRAW_HOVER: "font_hover_color",
		BaseButton.DRAW_PRESSED: "font_pressed_color",
		BaseButton.DRAW_HOVER_PRESSED: "font_pressed_color",
	}
	tab.draw.connect(func():
		var normal_color := "font_focus_color" if tab.has_focus() else "font_color"
		caption.self_modulate = tab.get_theme_color(STATE_COLORS.get(tab.get_draw_mode(), normal_color))
	)

func paragraph(text: String, color: Color = INK) -> void:
	var p = label(text, 14, color)
	p.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	p.add_theme_constant_override("line_spacing", 7)
	p.custom_minimum_size.y = 32
	p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if _text_mode:
		var prose_color := color
		match color:
			INK: prose_color = TEXT_PROSE
			MUTED: prose_color = TEXT_MUTED
			GOLD: prose_color = TEXT_ACCENT
		p.add_theme_color_override("font_color", prose_color)
		if color == INK:
			p.add_theme_font_override("font", PROSE_FONT)
			p.add_theme_font_size_override("font_size", 16)
		p.custom_minimum_size.y = 0
	content.add_child(p)
	var gap = Control.new()
	gap.custom_minimum_size.y = 12 if _text_mode else 14
	content.add_child(gap)

func skill_choice(text: String, detail: String, callback: Callable, skill_id: String, progress: Dictionary, level_prefix: String = "") -> void:
	if progress.is_empty():
		choice(text, detail, callback, false, skill_id)
		return
	var readout := _make_skill_progress(level_prefix)
	_set_skill_progress(readout, progress)
	_skill_progress_rows[skill_id] = readout
	choice(text, detail, callback, false, skill_id, null, null, readout.row)

func skill_progress(progress: Dictionary) -> void:
	var readout := _make_skill_progress("")
	_set_skill_progress(readout, progress)
	content.add_child(readout.row)

func refresh_skill_choices(get_progress: Callable) -> void:
	for skill_id in _skill_progress_rows:
		_set_skill_progress(_skill_progress_rows[skill_id], get_progress.call(skill_id))

func _make_skill_progress(level_prefix: String) -> Dictionary:
	var row := HBoxContainer.new()
	row.name = "SkillMasteryProgress"
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 8)
	var level := label("", 12, TEXT_ACCENT if _text_mode else GOLD, true)
	level.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(level)
	var bar := make_bar(Color("398bda") if _text_mode else Color("b38a42"), 6)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(bar)
	var experience := label("", 12, TEXT_MUTED if _text_mode else MUTED)
	experience.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(experience)
	return {"row": row, "level": level, "bar": bar, "experience": experience, "level_prefix": level_prefix}

func _set_skill_progress(readout: Dictionary, progress: Dictionary) -> void:
	var row: HBoxContainer = readout.row
	row.visible = not progress.is_empty()
	if progress.is_empty(): return
	var level: Label = readout.level
	var bar: ProgressBar = readout.bar
	var experience: Label = readout.experience
	var required := float(progress.xpRequired)
	var xp := clampf(float(progress.xp), 0.0, required)
	level.text = "%sLv. %d" % [readout.level_prefix, int(progress.level)]
	bar.max_value = required
	bar.value = xp
	experience.text = "최대 레벨" if progress.get("maxed", false) else "%d / %d XP" % [int(xp), int(required)]

func choice(text: String, detail: String, callback: Callable, disabled: bool = false, icon_kind: String = "", thumbnail: Texture2D = null, detail_thumbnail: Texture2D = null, footer: Control = null) -> void:
	var line = HSeparator.new()
	if _text_mode:
		var rule := StyleBoxLine.new()
		rule.color = TEXT_RULE
		rule.thickness = 1
		line.add_theme_stylebox_override("separator", rule)
	else:
		line.modulate = Color("b9c2cc")
	content.add_child(line)
	var row = MarginContainer.new()
	if _text_mode:
		for side in ["left", "right", "top", "bottom"]:
			row.add_theme_constant_override("margin_" + side, 0)
	else:
		row.add_theme_constant_override("margin_left", 4)
		row.add_theme_constant_override("margin_right", 4)
		row.add_theme_constant_override("margin_top", 9)
		row.add_theme_constant_override("margin_bottom", 9)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_child(row)
	var target = Button.new()
	target.custom_minimum_size.y = 44
	target.disabled = disabled
	target.accessibility_name = text
	target.accessibility_description = detail
	target.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if not _text_mode:
		target.add_theme_stylebox_override("normal", style(Color.TRANSPARENT))
		target.add_theme_stylebox_override("disabled", style(Color.TRANSPARENT))
	target.pressed.connect(callback)
	row.add_child(target)
	var body = HBoxContainer.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_theme_constant_override("separation",8)
	if _text_mode:
		var inset := MarginContainer.new()
		inset.mouse_filter = Control.MOUSE_FILTER_IGNORE
		for side in ["left", "right", "top", "bottom"]:
			inset.add_theme_constant_override("margin_" + side, 6)
		row.add_child(inset)
		inset.add_child(body)
	else:
		row.add_child(body)
	if thumbnail != null:
		var icon := ItemThumbnail.new(thumbnail)
		icon.modulate.a = 0.65 if disabled else 1.0
		body.add_child(icon)
	elif not icon_kind.is_empty():
		var icon = SlotIcon.new()
		icon.kind = icon_kind
		icon.custom_minimum_size = Vector2(32,32)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon.modulate.a = .45 if disabled else 1.0
		body.add_child(icon)
	var copy: BoxContainer = HBoxContainer.new() if _text_mode else VBoxContainer.new()
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if footer != null:
		var stack := VBoxContainer.new()
		stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stack.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stack.add_theme_constant_override("separation", 2)
		body.add_child(stack)
		stack.add_child(copy)
		stack.add_child(footer)
	else:
		body.add_child(copy)
	var title_color := (TEXT_MUTED if disabled else TEXT_INK) if _text_mode else (MUTED if disabled else INK)
	var title = label(text, 14, title_color, true)
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	copy.add_child(title)
	if _text_mode:
		copy.add_theme_constant_override("separation", 14)
		title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		if not disabled:
			target.mouse_entered.connect(func(): title.add_theme_color_override("font_color", TEXT_ACCENT))
			target.mouse_exited.connect(func(): title.add_theme_color_override("font_color", TEXT_INK))
	if not detail.is_empty():
		var desc = label(detail, 12, TEXT_MUTED if _text_mode else MUTED)
		desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		desc.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var detail_body: BoxContainer = copy
		if detail_thumbnail != null:
			var detail_row := HBoxContainer.new()
			detail_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
			detail_row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			detail_row.add_theme_constant_override("separation", 4)
			detail_row.add_child(ItemThumbnail.new(detail_thumbnail, 28))
			copy.add_child(detail_row)
			detail_body = detail_row
			desc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			desc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		if _text_mode:
			desc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			if detail_thumbnail == null:
				desc.size_flags_stretch_ratio = 1.15
			else:
				detail_body.size_flags_stretch_ratio = 1.15
			desc.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			desc.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		detail_body.add_child(desc)

func menu_entry(title: String, detail: String, callback: Callable, icon_kind: String) -> void:
	if _text_mode:
		choice(title, detail, callback)
		return
	var row := MarginContainer.new()
	row.custom_minimum_size.y = 61
	content.add_child(row)
	var target := button("", callback)
	target.accessibility_name = title
	target.accessibility_description = detail
	target.add_theme_stylebox_override("normal", style(Color("f4ecdc") if icon_kind == "save" else Color.TRANSPARENT))
	target.add_theme_stylebox_override("hover", style(Color("eee8da")))
	target.add_theme_stylebox_override("pressed", style(Color("e4ddce")))
	row.add_child(target)
	var inset := MarginContainer.new()
	inset.add_theme_constant_override("margin_left", 10)
	inset.add_theme_constant_override("margin_right", 10)
	inset.add_theme_constant_override("margin_top", 7)
	inset.add_theme_constant_override("margin_bottom", 7)
	inset.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(inset)
	var body := HBoxContainer.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_theme_constant_override("separation", 14)
	inset.add_child(body)
	var icon := NavIcon.new()
	icon.kind = icon_kind
	icon.custom_minimum_size = Vector2(27, 27)
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	body.add_child(icon)
	var copy := VBoxContainer.new()
	copy.mouse_filter = Control.MOUSE_FILTER_IGNORE
	copy.alignment = BoxContainer.ALIGNMENT_CENTER
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_theme_constant_override("separation", 1)
	body.add_child(copy)
	var name_label := label(title, 16, INK, true)
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	copy.add_child(name_label)
	if not detail.is_empty():
		var description := label(detail, 12, MUTED)
		description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		description.mouse_filter = Control.MOUSE_FILTER_IGNORE
		copy.add_child(description)
	if icon_kind in ["display", "controls", "help", "account"]:
		var arrow := label("›", 19, GOLD)
		arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
		body.add_child(arrow)
	if icon_kind != "home":
		var rule := ColorRect.new()
		rule.custom_minimum_size.y = 1
		rule.color = MENU_RULE
		rule.mouse_filter = Control.MOUSE_FILTER_IGNORE
		content.add_child(rule)

func toast(text: String) -> void:
	toast_label.text = text
	toast_time = 4
	toast_shown.emit(text)

func reset_touch_controls() -> void:
	_reset_panel_touch()
	_finish_size_drag()
	joystick.reset()
	for target in action_touches.values(): target.set_pressed_no_signal(false)
	action_touches.clear()

func _reset_panel_touch() -> void:
	if is_instance_valid(panel_touch_button):
		panel_touch_button.set_pressed_no_signal(false)
	panel_touch_button = null
	panel_touch_index = -1
	panel_touch_dragged = false

func _panel_native_drag_target(point: Vector2) -> bool:
	var scrollbar := panel_scroll.get_v_scroll_bar()
	for target: Control in [scrollbar, _hud_size_slider, _menu_size_slider]:
		if is_instance_valid(target) and target.is_visible_in_tree() and target.get_global_rect().has_point(point):
			return true
	return false

# Handle swipes across button rows and pass slider drags to Godot's GUI.
func _button_list_input(event: InputEvent) -> bool:
	if not button_list_touch_enabled or not overlay.visible or not panel.visible or is_instance_valid(_dragged_size_slider):
		return false
	if event is InputEventMouse and event.device == InputEvent.DEVICE_ID_EMULATION:
		return panel_touch_index != -1 or (panel_scroll.get_global_rect().has_point(event.position) and not _panel_native_drag_target(event.position))
	if event is InputEventScreenTouch:
		if event.index == panel_touch_index:
			if not event.pressed or event.canceled:
				var target: Button = panel_touch_button
				var activate: bool = not event.canceled and not panel_touch_dragged and event.position.distance_to(panel_touch_origin) < PANEL_DRAG_DISTANCE and is_instance_valid(target)
				_reset_panel_touch()
				# Reset before callbacks, which may replace the entire panel.
				if activate and not target.disabled and target.get_global_rect().has_point(event.position) and panel_scroll.get_global_rect().has_point(event.position):
					target.pressed.emit()
			return true
		if event.pressed and not event.canceled and panel_scroll.get_global_rect().has_point(event.position):
			if panel_touch_index != -1:
				return true
			if _panel_native_drag_target(event.position):
				return false
			panel_touch_index = event.index
			panel_touch_origin = event.position
			panel_touch_scroll = panel_scroll.scroll_vertical
			panel_touch_dragged = false
			for node in content.find_children("*", "Button", true, false):
				var target: Button = node as Button
				if target.is_visible_in_tree() and not target.disabled and target.get_global_rect().has_point(event.position):
					panel_touch_button = target
					target.set_pressed_no_signal(true)
					break
			return true
	elif event is InputEventScreenDrag and event.index == panel_touch_index:
		if event.position.distance_to(panel_touch_origin) >= PANEL_DRAG_DISTANCE:
			panel_touch_dragged = true
		if panel_touch_dragged:
			if is_instance_valid(panel_touch_button):
				panel_touch_button.set_pressed_no_signal(false)
			panel_scroll.scroll_vertical = panel_touch_scroll + roundi((panel_touch_origin.y - event.position.y) / overlay.scale.y)
		return true
	return false

# BaseButton relies on a single emulated mouse. Track action fingers separately
# so the right thumb still works while the left thumb owns the joystick.
func _input(event: InputEvent) -> void:
	if _button_list_input(event):
		get_viewport().set_input_as_handled()
		return
	# Explicit touch handling owns these controls; suppress the compatibility
	# mouse events so a single tap cannot also activate a BaseButton or path.
	if event is InputEventMouse and event.device == InputEvent.DEVICE_ID_EMULATION and not overlay.visible:
		if joystick.is_active() or joystick.can_start(event.position):
			get_viewport().set_input_as_handled()
			return
		for target in touch_buttons:
			if target.is_visible_in_tree() and target.get_global_rect().has_point(event.position):
				get_viewport().set_input_as_handled()
				return
	if event is InputEventScreenTouch:
		if action_touches.has(event.index):
			var target: Button = action_touches[event.index]
			if not event.pressed or event.canceled:
				action_touches.erase(event.index)
				target.set_pressed_no_signal(false)
				if target.action_mode == BaseButton.ACTION_MODE_BUTTON_RELEASE and not event.canceled and not overlay.visible and not target.disabled and target.get_global_rect().has_point(event.position):
					target.pressed.emit()
			get_viewport().set_input_as_handled()
		elif event.pressed and not event.canceled and not overlay.visible:
			for target in touch_buttons:
				if target.is_visible_in_tree() and target.get_global_rect().has_point(event.position):
					action_touches[event.index] = target
					target.set_pressed_no_signal(not target.disabled)
					if target.action_mode == BaseButton.ACTION_MODE_BUTTON_PRESS and not target.disabled:
						target.pressed.emit()
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

func set_hud_size(percentage: int) -> void:
	hud_size_percent = percentage
	_layout_hud()

func set_menu_size(percentage: int) -> void:
	menu_size_percent = percentage
	# Apply after release to keep the slider under the pointer during a drag.
	if not is_instance_valid(_dragged_size_slider):
		_layout_overlay()

func _layout() -> void:
	_layout_hud()
	_layout_overlay()
	if not is_instance_valid(_dragged_size_slider):
		reset_touch_controls()

func _layout_hud() -> void:
	var factor := hud_size_percent / 100.0
	var available := root.size / factor
	hud.scale = Vector2.ONE * factor
	hud.size = available
	var width := available.x
	# Keep the status panel at the upper left in either orientation.
	var header_width: float = minf(320.0, width - 24.0)
	header.offset_left = 12.0
	header.offset_right = header.offset_left + header_width
	navigation.offset_left = maxf(12, (width - 480) / 2)
	navigation.offset_right = -navigation.offset_left
	_layout_controls()

func _layout_overlay() -> void:
	if not is_instance_valid(_dragged_size_slider):
		var factor := menu_size_percent / 100.0
		if _desktop_web:
			# Cap the stretch in CSS pixels so fullscreen and high DPI don't enlarge menus.
			var css_height := float(JavaScriptBridge.eval("window.innerHeight"))
			if css_height > 0.0 and root.size.y > 0.0:
				factor *= minf(1.0, DESKTOP_MENU_CSS_SCALE * root.size.y / css_height)
		overlay.scale = Vector2.ONE * factor
	overlay.size = root.size / overlay.scale.x
	menu_views.size = (overlay.size - Vector2(24, 24)).max(Vector2.ZERO).min(DESKTOP_MENU_AREA) if _desktop_web else overlay.size
	menu_views.position = (overlay.size - menu_views.size) * 0.5
	_layout_panel()

func _layout_panel() -> void:
	var available := overlay.size
	if _tab_sheet:
		_set_sheet_reveal(_sheet_reveal)
		return
	var max_width := 740.0 if _wide_panel else 496.0 if fit_menu_height else 660.0
	var side := maxf(12.0, floorf((available.x - max_width) * 0.5))
	var height := DESKTOP_MENU_AREA.y if _desktop_web else 680.0
	if fit_menu_height:
		height = panel_header.get_combined_minimum_size().y + content.get_combined_minimum_size().y
		height += panel_body.get_theme_constant("margin_top") + panel_body.get_theme_constant("margin_bottom") + 2
	var vertical := maxf(12.0, floorf((available.y - height) * 0.5))
	var beside_fire := panel_title.text == "모닥불 · 요리" and available.x > available.y and available.x >= 600.0
	if beside_fire:
		var width := clampf(available.x * 0.36, 260.0, 340.0)
		panel.offset_left = 12.0 if cooking_panel_on_left else available.x - width - 12.0
		panel.offset_right = width + 12.0 - available.x if cooking_panel_on_left else -12.0
	else:
		panel.offset_left = side
		panel.offset_right = -side
	panel_dim.color.a = 0.16 if beside_fire else (0.32 if _wide_panel else 0.28 if _text_mode else 0.65)
	panel.offset_top = vertical
	panel.offset_bottom = -vertical

func _set_sheet_reveal(progress: float) -> void:
	_sheet_reveal = progress
	var available := overlay.size
	var side := maxf(0.0, floorf((available.x - 560.0) * 0.5))
	var height := minf(maxf(0.0, available.y - 12.0), clampf(available.y * 0.74, 440.0, 660.0))
	var travel := roundf(height * (1.0 - progress))
	panel.offset_left = side
	panel.offset_right = -side
	panel.offset_top = available.y - height + travel
	panel.offset_bottom = travel
	panel_dim.color.a = 0.34 * progress

func controls_orientation() -> String:
	var available = root.get_viewport_rect().size
	return "landscape" if available.x > available.y else "portrait"

func controls_layout() -> Dictionary:
	var orientation = controls_orientation()
	return control_layouts.get(orientation, {"scale": 1.25 if orientation == "landscape" else 1.0, "x": 1.0, "y": 1.0}).duplicate()

func restore_controls(value: Variant) -> void:
	if value is Dictionary:
		var ranges := {
			"scale": Vector2(0.75, 2.0),
			"quickslot_scale": Vector2(QUICKSLOT_SIZE_MIN, QUICKSLOT_SIZE_MAX),
			"x": Vector2(0.0, 1.0),
			"y": Vector2(0.0, 1.0),
		}
		for orientation in ["landscape", "portrait"]:
			if not value.get(orientation) is Dictionary: continue
			var entry: Dictionary = {}
			for key in ranges:
				var number: Variant = value[orientation].get(key)
				if (number is float or number is int) and is_finite(float(number)):
					var limits: Vector2 = ranges[key]
					entry[key] = clampf(float(number), limits.x, limits.y)
			control_layouts[orientation] = entry
	_layout_controls()

func adjust_controls(key: String, value: float) -> void:
	var entry = controls_layout()
	entry[key] = value
	control_layouts[controls_orientation()] = entry
	_layout_controls()
	reset_touch_controls()

func reset_controls() -> void:
	control_layouts.erase(controls_orientation())
	_layout_controls()
	reset_touch_controls()

func _layout_controls() -> void:
	if not is_instance_valid(action_cluster): return
	var available = root.get_viewport_rect().size
	var entry = controls_layout()
	# Reserve the bottom dock and keep every scaled touch target inside the screen.
	var reserved_height := 24.0 + 92.0 * maxf(1.0, hud.scale.y)
	var room = Vector2(maxf(1.0, available.x - 24.0), maxf(1.0, available.y - reserved_height))
	var factor: float = minf(float(entry.get("scale", 1.25 if controls_orientation() == "landscape" else 1.0)), minf(room.x / 220.0, room.y / 248.0))
	action_cluster.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	action_cluster.size = Vector2(220, 248)
	action_cluster.scale = Vector2.ONE * factor
	action_cluster.position = Vector2(12, 12) + (room - action_cluster.size * factor) * Vector2(float(entry.get("x", 1.0)), float(entry.get("y", 1.0)))
	var quickslot_scale := float(entry.get("quickslot_scale", 1.0))
	for slot in quickslot_buttons:
		slot.scale = Vector2.ONE * quickslot_scale

func add_size_sliders(hud_minimum: int, menu_minimum: int, maximum: int) -> void:
	_hud_size_slider = setting_slider("HUD 크기", hud_minimum, maximum, 1, hud_size_percent, "%", func(value: float):
		set_hud_size(roundi(value))
		if not is_instance_valid(_dragged_size_slider):
			hud_size_committed.emit(hud_size_percent))
	_menu_size_slider = setting_slider("메뉴 UI 크기", menu_minimum, maximum, 1, menu_size_percent, "%", func(value: float):
		set_menu_size(roundi(value))
		if not is_instance_valid(_dragged_size_slider):
			menu_size_committed.emit(menu_size_percent))
	_hud_size_slider.accessibility_name = "HUD 크기"
	_menu_size_slider.accessibility_name = "메뉴 UI 크기"
	for slider: HSlider in [_hud_size_slider, _menu_size_slider]:
		slider.scrollable = false
		slider.drag_started.connect(func(): _dragged_size_slider = slider)
		slider.drag_ended.connect(func(_changed: bool): _finish_size_drag())

func _finish_size_drag() -> void:
	if not is_instance_valid(_dragged_size_slider):
		return
	var menu_drag := _dragged_size_slider == _menu_size_slider
	_dragged_size_slider = null
	if menu_drag:
		_layout_overlay()
		menu_size_committed.emit(menu_size_percent)
	else:
		hud_size_committed.emit(hud_size_percent)

func setting_slider(title: String, minimum: float, maximum: float, step: float, value: float, suffix: String, changed: Callable) -> HSlider:
	var caption = label("%s  %d%s" % [title, roundi(value), suffix], 15, INK, true)
	content.add_child(caption)
	var slider = HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = step
	slider.value = value
	slider.custom_minimum_size = Vector2(0, 44)
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.value_changed.connect(func(number: float):
		caption.text = "%s  %d%s" % [title, roundi(number), suffix]
		changed.call(number))
	content.add_child(slider)
	return slider

func update_mei_nameplate(screen_position: Vector2, shown: bool) -> void:
	if mei_nameplate_anchor.visible != shown:
		mei_nameplate_anchor.visible = shown
	if shown:
		# The world is enlarged in physical pixels and cancels the UI stretch.
		# Rounding in UI units would make the plate drift against those pixels.
		var pixel_scale = get_viewport().get_stretch_transform().get_scale()
		if mei_nameplate_pixel_scale != pixel_scale or mei_nameplate_layout_size != mei_nameplate.size:
			mei_nameplate_pixel_scale = pixel_scale
			mei_nameplate_layout_size = mei_nameplate.size
			# Keep the centering/gap fixed on that grid; glyphs are never rebuilt.
			mei_nameplate_pixel_offset = (Vector2(-mei_nameplate.size.x * .5, -mei_nameplate.size.y - 4.0) * pixel_scale).round()
		var pixel_anchor = (screen_position * pixel_scale).round()
		var target_position = (pixel_anchor + mei_nameplate_pixel_offset) / pixel_scale
		if mei_nameplate_anchor.position != target_position:
			mei_nameplate_anchor.position = target_position
func _clear_shop() -> void:
	if is_instance_valid(shop_view):
		shop_view.hide()
		shop_view.queue_free()
		shop_view = null

func open_shop(entries: Array, inventory: Dictionary, money: int, selling: bool, trade: Callable) -> void:
	open_panel("아르카나 잡화점")
	panel.hide()
	shop_view = preload("res://scripts/shop_view.gd").new()
	shop_view.entries = entries
	shop_view.inventory = inventory
	shop_view.money = money
	shop_view.selling = selling
	shop_view.trade_requested.connect(func(action: Dictionary, quantity: int): trade.call(action, quantity, shop_view.selling))
	shop_view.close_requested.connect(close_panel)
	menu_views.add_child(shop_view)

func _clear_quests() -> void:
	if is_instance_valid(quest_view):
		quest_view.hide()
		quest_view.queue_free()
		quest_view = null

func open_quests(entries: Array, show_map: Callable) -> void:
	open_panel("퀘스트")
	panel.hide()
	quest_view = preload("res://scripts/quest_view.gd").new()
	quest_view.quests = entries.duplicate(true)
	quest_view.close_requested.connect(close_panel)
	quest_view.map_requested.connect(show_map)
	menu_views.add_child(quest_view)

func _clear_inventory() -> void:
	if is_instance_valid(inventory_view):
		inventory_view.get_parent().remove_child(inventory_view)
		inventory_view.queue_free()
		inventory_view = null

func open_inventory(entries: Array, money: int, selected_id: String, action: Callable, tabs: Array) -> void:
	open_section_panel("소지품", ["아이템", "장비"], 0, tabs, true)
	_inventory_balance.text = "%d G" % money
	_inventory_balance.add_theme_color_override("font_color", TEXT_ACCENT if _text_mode else GOLD)
	_inventory_balance.show()
	_show_inventory_grid(entries, selected_id, action)

func open_home_storage(entries: Array, selected_id: String, action: Callable, tabs: Array, selected_tab: int) -> void:
	open_section_panel("보관함", ["소지품", "보관함"], selected_tab, tabs, true)
	var empty_text := "소지품이 비어 있습니다." if selected_tab == 0 else "보관함이 비어 있습니다."
	_show_inventory_grid(entries, selected_id, action, empty_text)

func _show_inventory_grid(entries: Array, selected_id: String, action: Callable, transfer_empty_text: String = "") -> void:
	inventory_view = preload("res://scripts/inventory_view.gd").new()
	inventory_view.text_mode = _text_mode
	inventory_view.entries = entries
	inventory_view.selected_id = selected_id
	inventory_view.action = action
	inventory_view.transfer_empty_text = transfer_empty_text
	show_tab_body(inventory_view)
