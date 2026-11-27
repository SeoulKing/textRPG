extends Control

signal navigation_requested(kind: String)
signal place_requested(id: String)
signal local_place_requested(id: String)

enum EnemyIntentTone { PLAIN, WARNING, DANGER, RECOVERY }

const CityGrid = preload("res://scripts/simplified_city_grid.gd")
const FISH = preload("res://art/export/items/river-fish.png")
const COMBAT_ACTION_ICONS := {
	"fireball": preload("res://art/export/spells/fireball.png"),
	"flame_wave": preload("res://art/export/spells/flame-wave.png"),
	"flame_guard": preload("res://art/export/spells/flame-guard.png"),
	"dodge": preload("res://art/export/spells/dash.png"),
}
const CLOCK_DAY = preload("res://art/export/text-mode/clock-day.svg")
const CLOCK_NIGHT = preload("res://art/export/text-mode/clock-night.svg")
const HEALTH_ICON := preload("res://art/export/text-mode/status-health.png")
const MANA_ICON := preload("res://art/export/text-mode/status-mana.png")
const HUNGER_ICON := preload("res://art/export/text-mode/status-hunger.png")
const MeadowOx := preload("res://scripts/native_2d_meadow_ox.gd")
const SLIME_FRAMES := preload("res://art/export/monsters/slime.tres")
const BattleFireball := preload("res://scripts/simplified_fireball.gd")
const FONT = preload("res://fonts/NotoSansKR-Medium.tres")
const FONT_STRONG = preload("res://fonts/NotoSansKR-SemiBold.tres")
const STORY_FONT = preload("res://fonts/KoPubBatangMedium.ttf")
const INK := Color("192f43")
const MUTED := Color("52697a")
const ACCENT := Color("216892")
const SKY := Color("b1e1ff")
const PALE := Color("edf8ff")
const RULE := Color("d6e2ea")
const HEALTH_COLOR := Color("b55c64")
const DODGE_COLOR := Color("16715c")
const COMBAT_WARNING_TEXT := Color("6f4b00")
const COMBAT_WARNING_FILL := Color("a96e00")
const COMBAT_WARNING_SURFACE := Color("fff3c7")
const COMBAT_DANGER_TEXT := Color("7a151d")
const COMBAT_DANGER_FILL := Color("b92836")
const COMBAT_DANGER_SURFACE := Color("ffe3e5")
const COMBAT_RECOVERY_SURFACE := Color("dff5de")
const COMBAT_ACTION_COOLDOWN := Color("cadff1")
const COMBAT_ACTION_GUARD := Color("f1dfab")
const RESULT_LIMIT := 5
# Match the server's day length and 06:00 start in base-data.ts and game-log.ts.
const REAL_DAY_MS := 30 * 60 * 1000
const MINUTES_PER_DAY := 24 * 60
const DAWN_MINUTE := 6 * 60
const NIGHT_MINUTE := 18 * 60
const DAY_CLOCK_INK := Color("185275")
const NIGHT_CLOCK_INK := Color("f0f6ff")

var _shell: MarginContainer
var _scroll: ScrollContainer
var _scroll_body: VBoxContainer
var _compact_combat: HBoxContainer
var _compact_readout: VBoxContainer
var _compact_actions: VBoxContainer
var _compact_plaza_requested := false
var _compact_combat_active := false
var _moving_combat_card := false
var _map: CityGrid
var _map_button: Button
var _local_map_center: CenterContainer
var _local_map_frame: Control
var _local_map: CityGrid
var _return_focus: Control
var _location: Label
var _equipment: Label
var _description: Label
var _context: Label
var _combat_status: Control
var _combat_message: Label
var _combatants: PanelContainer
var _enemy_portrait: TextureRect
var _enemy_name := ""
var _enemy_is_meadow_ox := false
var _fireball_layer: Node2D
var _fireballs: Dictionary[String, BattleFireball] = {}
var _dodge_meter: ProgressBar
var _dodge_sample := 0.0
var _dodge_tween: Tween
var region_move_active := false
var _status_row: HBoxContainer
var _enemy_health: Dictionary
var _enemy_pose: StringName
var _combat_layout_active := false
var _combat_vitals_row: HBoxContainer
var _combat_vitals: Dictionary
var _duel_vitals_row: HBoxContainer
var _duel_ally: Dictionary
var _duel_enemy: Dictionary
var _duel_impact_row: HBoxContainer
var _duel_ally_impact: Label
var _duel_enemy_impact: Label
var _shown_duel_impact_revision := -1
var _duel_impact_tween: Tween
var _duel_log_toggle: Button
var _duel_log_body: VBoxContainer
var _duel_log_entries: Array = []
var _enemy_intent_badge: PanelContainer
var _enemy_intent: Label
var _enemy_intent_meter: ProgressBar
var _enemy_intent_tone := EnemyIntentTone.PLAIN
var _enemy_warning_badge := _fill(COMBAT_WARNING_SURFACE, 5)
var _enemy_danger_badge := _fill(COMBAT_DANGER_SURFACE, 5)
var _enemy_plain_badge := _fill(Color.TRANSPARENT, 5)
var _cast_origin: Control
var _enemy_damage_number: Label
var _enemy_hit_timer: Timer
var _combat_context := ""
var _combat_result := ""
var _combat_result_tone := ""
var _combat_result_timer: Timer
var _combat_log_toggle: Button
var _clock_badge: TextureRect
var _clock_label: Label
var _clock_minute := -1
var _money: Label
var _vitals: Dictionary = {}
var _hunger_vital: Dictionary
var _primary: Button
var _primary_id := ""
var _rod: TextureRect
var _primary_title: Label
var _primary_detail: Label
var _primary_cooldown: ColorRect
var _combat_action_highlight := _fill(Color("d2eeff"))
var _secondary: VBoxContainer
var _rows: Dictionary = {}
var _action_row_order: Array[String] = []
var _callbacks: Dictionary = {}
var _results: VBoxContainer
var _last_result := ""
var _pond_layout := false
var _pond_fishing_active := false
var _pond_fishing_host: VBoxContainer
var _pond_catch: HBoxContainer
var _pond_catch_label: Label
var _notice := ""
var _notice_timer: Timer
var _receipt: VBoxContainer
var _catch_title: Label
var _catch_count: Label

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var backdrop := ColorRect.new()
	backdrop.color = Color.WHITE
	backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(backdrop)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_shell = MarginContainer.new()
	add_child(_shell)
	_shell.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var page := _column(_shell, 0)
	_build_status(page)
	_build_combat_vitals(page)
	page.add_child(_rule())
	_compact_combat = _row(page, 12)
	_compact_readout = _column(_compact_combat, 2)
	_compact_readout.size_flags_stretch_ratio = 0.85
	_compact_actions = _column(_compact_combat, 0)
	_compact_actions.size_flags_stretch_ratio = 1.15
	_compact_combat.hide()

	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	_scroll.follow_focus = true
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	page.add_child(_scroll)
	_build_details(_scroll)
	page.add_child(_rule())
	_build_navigation(page)
	resized.connect(_layout)
	_layout()

func _build_status(page: Control) -> void:
	var row := _row(page, 8)
	_status_row = row
	row.custom_minimum_size.y = 47
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	_vitals.hp = _add_vital(row, "체력", HEALTH_ICON, HEALTH_COLOR)
	_vitals.mp = _add_vital(row, "마나", MANA_ICON, Color("579ccc"))
	_hunger_vital = _add_vital(row, "허기", HUNGER_ICON, Color("e8ba36"), Color("fff3ce"))
	_hunger_vital.meter.step = 0.0
	var balance := _column(row, 3)
	balance.alignment = BoxContainer.ALIGNMENT_CENTER
	balance.size_flags_horizontal = Control.SIZE_FILL
	_clock_badge = TextureRect.new()
	_clock_badge.texture = CLOCK_DAY
	_clock_badge.custom_minimum_size = Vector2(62, 19)
	_clock_badge.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_clock_badge.size_flags_horizontal = Control.SIZE_SHRINK_END
	_clock_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	balance.add_child(_clock_badge)
	_clock_label = _label("--:--", 12, DAY_CLOCK_INK, FONT_STRONG)
	_clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_clock_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_clock_badge.add_child(_clock_label)
	_clock_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_clock_label.offset_left = 17
	_clock_label.offset_right = -3
	_money = _label("", 13, INK, FONT_STRONG)
	_money.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	balance.add_child(_money)

func _build_combat_vitals(page: Control) -> void:
	_combat_vitals_row = _row(page, 16)
	_combat_vitals_row.custom_minimum_size.y = 47
	_combat_vitals = {
		"hp": _add_compact_vital(_combat_vitals_row, "체력", HEALTH_COLOR, true),
		"mp": _add_compact_vital(_combat_vitals_row, "마나", Color("2976b7"), false),
	}
	_combat_vitals_row.hide()

func _add_compact_vital(parent: Control, title: String, color: Color, show_trail: bool, title_size: int = 13) -> Dictionary:
	var column := _column(parent, 4)
	column.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var heading := _row(column, 6)
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var caption_title := _label(title, title_size, INK, FONT_STRONG)
	heading.add_child(caption_title)
	_spacer(heading)
	var caption := _label("", 12, MUTED)
	heading.add_child(caption)
	var meter := ProgressBar.new()
	meter.show_percentage = false
	meter.accessibility_name = title
	meter.custom_minimum_size.y = 6
	meter.layout_direction = Control.LAYOUT_DIRECTION_LTR
	meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meter.add_theme_stylebox_override("background", _fill(Color("d9e4ed"), 3))
	meter.add_theme_stylebox_override("fill", _fill(color, 3))
	column.add_child(meter)
	var trail: ColorRect = _add_damage_trail(meter, 0.0) if show_trail else null
	return {"label": caption, "meter": meter, "trail": trail, "tween": null, "title": caption_title}

func _add_vital(parent: Control, title: String, texture: Texture2D, color: Color, track_color: Color = Color("e8eef2")) -> Dictionary:
	var meter := ProgressBar.new()
	meter.show_percentage = false
	meter.accessibility_name = title
	meter.custom_minimum_size.y = 28
	meter.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	meter.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meter.add_theme_stylebox_override("background", _fill(track_color, 6))
	meter.add_theme_stylebox_override("fill", _fill(color, 6))
	parent.add_child(meter)
	var trail: ColorRect = _add_damage_trail(meter, 2.0) if texture == HEALTH_ICON else null
	var contents := _row(meter, 4)
	contents.mouse_filter = Control.MOUSE_FILTER_IGNORE
	contents.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	contents.offset_left = 5
	contents.offset_right = -5
	var icon := TextureRect.new()
	icon.texture = texture
	icon.custom_minimum_size = Vector2(18, 18)
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	contents.add_child(icon)
	var caption := _label("", 12, Color.WHITE, FONT_STRONG)
	caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	caption.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	caption.add_theme_color_override("font_outline_color", INK)
	caption.add_theme_constant_override("outline_size", 3)
	contents.add_child(caption)
	return {"label": caption, "meter": meter, "trail": trail, "tween": null}

func _add_damage_trail(meter: ProgressBar, inset: float) -> ColorRect:
	var trail := ColorRect.new()
	trail.color = Color("ff9e35")
	trail.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meter.add_child(trail)
	trail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	trail.offset_top = inset
	trail.offset_bottom = -inset
	trail.hide()
	return trail

func build_map_body() -> VBoxContainer:
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	column.size_flags_vertical = Control.SIZE_EXPAND_FILL
	var legend := _row(column, 5)
	var places := _button("전체 목적지", ACCENT)
	places.pressed.connect(func(): navigation_requested.emit("destinations"))
	legend.add_child(places)
	_spacer(legend)
	var portrait := TextureRect.new()
	portrait.texture = CityGrid.PLAYER_PORTRAIT
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	portrait.custom_minimum_size = Vector2(16, 16)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	legend.add_child(portrait)
	legend.add_child(_label("현재 위치", 11, MUTED))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	scroll.follow_focus = true
	column.add_child(scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	_map = CityGrid.new()
	center.add_child(_map)
	scroll.resized.connect(_fit_map.bind(scroll, _map))
	_map.place_requested.connect(func(id: String): place_requested.emit(id))
	return column

func _fit_map(scroll: ScrollContainer, grid: CityGrid) -> void:
	grid.custom_minimum_size.x = clampf(scroll.size.y, minf(250.0, scroll.size.x), scroll.size.x)

func set_panel_open(opened: bool) -> void:
	if opened:
		_local_map.finish_move()
		var focused := get_viewport().gui_get_focus_owner()
		if focused and _shell.is_ancestor_of(focused):
			_return_focus = focused
		_shell.focus_behavior_recursive = Control.FOCUS_BEHAVIOR_DISABLED
	else:
		_shell.focus_behavior_recursive = Control.FOCUS_BEHAVIOR_INHERITED
		if is_instance_valid(_return_focus) and _return_focus.is_visible_in_tree():
			_return_focus.grab_focus()
		_return_focus = null

func remember_map_tab() -> void:
	_return_focus = _map_button

func is_map_open() -> bool:
	return is_instance_valid(_map) and _map.is_visible_in_tree()

func _build_details(parent: Control) -> void:
	var body := _column(parent, 12)
	_scroll_body = body
	body.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	var title := _row(body, 6)
	title.custom_minimum_size.y = 44
	_location = _label("", 26, INK, STORY_FONT)
	_location.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_location.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_child(_location)
	_equipment = _label("", 11, MUTED)
	title.add_child(_equipment)
	_local_map_center = CenterContainer.new()
	_local_map_center.mouse_filter = Control.MOUSE_FILTER_PASS
	_local_map_center.hide()
	body.add_child(_local_map_center)
	# Reserve the scaled size while keeping the map's tiles and labels in the same proportions.
	_local_map_frame = Control.new()
	_local_map_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_local_map_center.add_child(_local_map_frame)
	_local_map = CityGrid.new()
	_local_map.scale = Vector2(0.75, 0.75)
	_local_map_frame.add_child(_local_map)
	_local_map.place_requested.connect(func(id: String): local_place_requested.emit(id))
	_duel_vitals_row = _row(body, 16)
	_duel_ally = _add_compact_vital(_duel_vitals_row, "내 정령", DODGE_COLOR, true, 12)
	_duel_enemy = _add_compact_vital(_duel_vitals_row, "상대", HEALTH_COLOR, true, 12)
	_duel_vitals_row.hide()
	_duel_impact_row = _row(body, 12)
	_duel_ally_impact = _label("", 12, INK, FONT_STRONG)
	_duel_enemy_impact = _label("", 12, HEALTH_COLOR, FONT_STRONG)
	_duel_enemy_impact.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	for label: Label in [_duel_ally_impact, _duel_enemy_impact]:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_duel_impact_row.add_child(label)
	_duel_impact_row.hide()
	_description = _label("", 15, INK, STORY_FONT)
	_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_description.add_theme_constant_override("line_spacing", 4)
	body.add_child(_description)
	_build_combatants(body)
	_context = _label("", 13, ACCENT)
	_context.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(_context)
	_combat_status = Control.new()
	_combat_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(_combat_status)
	_combat_message = _label("", 13, MUTED)
	_combat_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_combat_message.max_lines_visible = 2
	_combat_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_combat_message.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_combat_status.add_child(_combat_message)
	_combat_message.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_combat_message.offset_bottom = -5
	_combat_status.custom_minimum_size.y = 2 * _combat_message.get_line_height() + 14
	_combat_status.hide()
	_dodge_meter = _add_combat_meter(_combat_status, "회피 효과 남은 시간", Color("c5e1da"), DODGE_COLOR)
	_dodge_meter.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_dodge_meter.offset_top = -6
	_primary = _button("", INK)
	_primary.custom_minimum_size.y = 52
	_primary.add_theme_font_size_override("font_size", 16)
	_primary.add_theme_constant_override("h_separation", 8)
	_primary.add_theme_stylebox_override("normal", _fill(SKY, 5))
	_primary.add_theme_stylebox_override("hover", _fill(Color("a1d9fc"), 5))
	_primary.add_theme_stylebox_override("pressed", _fill(Color("86c8f1"), 5))
	_primary.add_theme_stylebox_override("disabled", _fill(Color("e7f1f7"), 5))
	_primary.pressed.connect(func(): _invoke(_primary_id))
	body.add_child(_primary)
	_primary_cooldown = _add_action_cooldown(_primary, false)
	var contents := _row(_primary, 9)
	contents.mouse_filter = Control.MOUSE_FILTER_IGNORE
	contents.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	contents.alignment = BoxContainer.ALIGNMENT_CENTER
	_rod = TextureRect.new()
	_rod.texture = CityGrid.icon(5)
	_rod.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_rod.stretch_mode = TextureRect.STRETCH_KEEP_CENTERED
	_rod.mouse_filter = Control.MOUSE_FILTER_IGNORE
	contents.add_child(_rod)
	_primary_title = _label("", 16, INK, FONT_STRONG)
	contents.add_child(_primary_title)
	_primary_detail = _label("", 12, MUTED)
	_primary_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(_primary_detail)
	_pond_fishing_host = _column(body, 0)
	_pond_fishing_host.hide()
	_build_receipt(body)
	_secondary = _column(body, 0)
	_build_duel_log(body)
	_combat_action_highlight.content_margin_left = 10
	_combat_action_highlight.content_margin_right = 10
	_combat_log_toggle = _button("전투 기록 펼치기", MUTED)
	_combat_log_toggle.toggle_mode = true
	_combat_log_toggle.alignment = HORIZONTAL_ALIGNMENT_LEFT
	_combat_log_toggle.toggled.connect(func(opened: bool):
		_combat_log_toggle.text = "전투 기록 접기" if opened else "전투 기록 펼치기"
		_sync_combat_results()
	)
	_combat_log_toggle.hide()
	body.add_child(_combat_log_toggle)
	_results = _column(body, 4)
	_results.hide()
	_notice_timer = Timer.new()
	_notice_timer.one_shot = true
	_notice_timer.wait_time = 4.0
	_notice_timer.timeout.connect(_clear_notice)
	add_child(_notice_timer)
	_combat_result_timer = Timer.new()
	_combat_result_timer.one_shot = true
	_combat_result_timer.wait_time = 2.0
	_combat_result_timer.timeout.connect(clear_combat_result)
	add_child(_combat_result_timer)
	var bottom := Control.new()
	bottom.custom_minimum_size.y = 4
	body.add_child(bottom)

func _build_combatants(parent: Control) -> void:
	_combatants = PanelContainer.new()
	var surface := _fill(PALE, 6)
	surface.content_margin_left = 12
	surface.content_margin_right = 12
	surface.content_margin_top = 6
	surface.content_margin_bottom = 8
	_combatants.add_theme_stylebox_override("panel", surface)
	_combatants.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(_combatants)
	var enemy_column := _column(_combatants, 3)
	_enemy_health = _add_compact_vital(enemy_column, "", HEALTH_COLOR, true, 19)
	_enemy_portrait = TextureRect.new()
	_enemy_portrait.custom_minimum_size.y = 116
	_enemy_portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_enemy_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_enemy_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	_enemy_portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	enemy_column.add_child(_enemy_portrait)
	_build_enemy_intent(enemy_column)
	_cast_origin = Control.new()
	_cast_origin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_enemy_portrait.add_child(_cast_origin)
	_cast_origin.anchor_left = 0.18
	_cast_origin.anchor_right = 0.18
	_cast_origin.anchor_top = 0.88
	_cast_origin.anchor_bottom = 0.88
	_enemy_damage_number = _label("", 21, Color("9d303f"), FONT_STRONG)
	_enemy_damage_number.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_enemy_portrait.add_child(_enemy_damage_number)
	_enemy_damage_number.anchor_left = 0.61
	_enemy_damage_number.anchor_right = 0.88
	_enemy_damage_number.offset_top = 8
	_enemy_damage_number.hide()
	_enemy_hit_timer = Timer.new()
	_enemy_hit_timer.one_shot = true
	_enemy_hit_timer.wait_time = 0.45
	_enemy_hit_timer.timeout.connect(func():
		_enemy_damage_number.hide()
		if _combat_layout_active: _update_enemy_portrait()
	)
	add_child(_enemy_hit_timer)
	_fireball_layer = Node2D.new()
	_combatants.add_child(_fireball_layer)
	_combatants.visibility_changed.connect(_clear_hidden_fireballs)
	_combatants.hide()

func _build_enemy_intent(parent: Control) -> void:
	var intent_row := _column(parent, 4)
	intent_row.custom_minimum_size.y = 35
	_enemy_danger_badge.border_color = COMBAT_DANGER_FILL
	_enemy_danger_badge.set_border_width_all(1)
	for style: StyleBoxFlat in [_enemy_warning_badge, _enemy_danger_badge, _enemy_plain_badge]:
		style.content_margin_left = 8
		style.content_margin_right = 8
		style.content_margin_top = 1
		style.content_margin_bottom = 1
	_enemy_intent_badge = PanelContainer.new()
	_enemy_intent_badge.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_enemy_intent_badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_enemy_intent_badge.add_theme_stylebox_override("panel", _enemy_plain_badge)
	intent_row.add_child(_enemy_intent_badge)
	_enemy_intent_badge.hide()
	_enemy_intent = _label("", 14, DODGE_COLOR, FONT_STRONG)
	_enemy_intent_badge.add_child(_enemy_intent)
	_enemy_intent_meter = _add_combat_meter(intent_row, "적 공격까지 남은 시간", COMBAT_WARNING_SURFACE, COMBAT_WARNING_FILL)

func _add_combat_meter(parent: Control, caption: String, track_color: Color, fill_color: Color) -> ProgressBar:
	var meter := ProgressBar.new()
	meter.max_value = 1.0
	meter.step = 0.0
	meter.show_percentage = false
	meter.custom_minimum_size.y = 6
	meter.layout_direction = Control.LAYOUT_DIRECTION_LTR
	meter.accessibility_name = caption
	meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meter.add_theme_stylebox_override("background", _fill(track_color, 3))
	meter.add_theme_stylebox_override("fill", _fill(fill_color, 3))
	parent.add_child(meter)
	meter.hide()
	return meter

func show_fireball(id: String, travel_seconds: float, reduced_motion: bool) -> void:
	if not _combatants.is_visible_in_tree() or _fireballs.has(id): return
	var shot := BattleFireball.new()
	shot.caster = _cast_origin
	shot.target = _enemy_portrait
	shot.travel_seconds = clampf(travel_seconds, 0.24, 0.8)
	shot.reduced_motion = reduced_motion
	_fireballs[id] = shot
	shot.tree_exiting.connect(func():
		if not _moving_combat_card: _fireballs.erase(id)
	)
	_fireball_layer.add_child(shot)

func resolve_fireball(id: String, hit: bool) -> void:
	if _fireballs.has(id): _fireballs[id].resolve(hit)

func _clear_hidden_fireballs() -> void:
	if _moving_combat_card or _combatants.is_visible_in_tree(): return
	for shot: BattleFireball in _fireballs.values():
		shot.hide()
		shot.queue_free()

func _build_receipt(body: Control) -> void:
	_receipt = _column(body, 5)
	_receipt.add_child(_label("낚시 결과", 15, INK, FONT_STRONG))
	_receipt.add_child(_rule())
	var row := _row(_receipt, 7)
	row.custom_minimum_size.y = 64
	var fish := TextureRect.new()
	fish.texture = FISH
	fish.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	fish.custom_minimum_size = Vector2(56, 56)
	fish.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	fish.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	fish.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(fish)
	var copy := _column(row, 2)
	copy.alignment = BoxContainer.ALIGNMENT_CENTER
	_catch_title = _label("", 15, INK, FONT_STRONG)
	copy.add_child(_catch_title)
	var count := _row(copy, 4)
	count.add_child(_label("소지품", 12, MUTED))
	_spacer(count)
	_catch_count = _label("", 13, ACCENT, FONT_STRONG)
	count.add_child(_catch_count)
	_receipt.add_child(_rule())
	_receipt.hide()
	_pond_catch = _row(body, 7)
	var small_fish := fish.duplicate() as TextureRect
	small_fish.custom_minimum_size = Vector2(28, 28)
	small_fish.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_pond_catch.add_child(small_fish)
	_pond_catch_label = _label("", 14, INK, FONT_STRONG)
	_pond_catch_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_pond_catch_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_pond_catch.add_child(_pond_catch_label)
	_pond_catch.hide()

func _build_navigation(page: Control) -> void:
	var nav := _row(page, 0)
	var labels := {"map": "월드맵", "inventory": "소지품", "skills": "스킬", "menu": "메뉴"}
	for kind: String in labels:
		var button := _button(labels[kind], ACCENT if kind == "map" else MUTED)
		button.custom_minimum_size.y = 54
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 15)
		nav.add_child(button)
		if kind == "map":
			_map_button = button
		button.pressed.connect(func():
			button.grab_focus()
			navigation_requested.emit(kind)
		)

func set_world_map_state(current: String, destinations: Dictionary) -> void:
	_map.set_state(current, destinations, "")

func is_at_local_place(id: String) -> bool:
	return _local_map.is_current_place(id)

func set_local_map_state(area: String, current: String, destinations: Dictionary, show_map: bool, locked: Dictionary = {}) -> void:
	_local_map_center.visible = show_map and not area.is_empty()
	if _local_map_center.visible:
		_local_map.set_state(current, destinations, area, locked)
	else:
		_local_map.finish_move()

func play_map_move(id: String, local: bool, travel: Callable = Callable()) -> bool:
	var grid := _local_map if local else _map
	if not is_instance_valid(grid) or not grid.is_visible_in_tree():
		return false
	var changing_region := travel.is_valid()
	if not grid.start_move(id, changing_region): return false
	if changing_region:
		_context.hide()
		if not await travel.call(): return false
		if is_instance_valid(grid): grid.confirm_move()
	# Closing the map can free the grid while either operation is in progress.
	while is_instance_valid(grid) and grid.is_visible_in_tree() and grid.is_processing():
		await get_tree().process_frame
	if is_instance_valid(grid) and grid.is_visible_in_tree() and grid == (_local_map if local else _map):
		if grid.arrive_preview(id): return true
	return changing_region

func finish_map_move(local: bool) -> void:
	var grid := _local_map if local else _map
	if is_instance_valid(grid):
		grid.finish_move()

func set_hunger(displayed: float) -> void:
	_hunger_vital.meter.value = displayed
	_hunger_vital.label.text = "%d/100" % roundi(displayed)

func set_status(location: String, combat: Dictionary, money: int, world_elapsed_ms: int) -> void:
	if _location.text.is_empty(): _location.text = location
	var displayed_vitals := _combat_vitals if _combat_layout_active else _vitals
	for id: String in displayed_vitals:
		var is_hp := id == "hp"
		var default_maximum := 100 if is_hp else 30
		var value := int(combat.get(id, default_maximum))
		var maximum := maxi(1, int(combat.get("maxHp" if is_hp else "maxMp", default_maximum)))
		_set_vital(displayed_vitals[id], value, maximum, _combatants.is_visible_in_tree())
	_set_clock(world_elapsed_ms)
	_money.text = "%s G" % _group_digits(money)

func _set_vital(vital: Dictionary, value: int, maximum: int, show_damage: bool) -> void:
	var meter: ProgressBar = vital.meter
	var previous := meter.ratio
	var same_maximum := meter.max_value == maximum
	maximum = maxi(1, maximum)
	value = clampi(value, 0, maximum)
	meter.max_value = maximum
	meter.value = value
	vital.label.text = "%d/%d" % [value, maximum]
	var trail: ColorRect = vital.trail
	if trail == null: return
	if show_damage and same_maximum and is_equal_approx(previous, meter.ratio): return
	if vital.tween != null:
		vital.tween.kill()
		vital.tween = null
	if not show_damage or not same_maximum or meter.ratio >= previous:
		trail.hide()
		return
	trail.anchor_right = maxf(previous, trail.anchor_right) if trail.visible else previous
	trail.anchor_left = meter.ratio
	trail.show()
	var tween := trail.create_tween()
	vital.tween = tween
	tween.tween_property(trail, "anchor_right", meter.ratio, 0.32).set_delay(0.12)
	tween.tween_callback(trail.hide)

func _set_clock(world_elapsed_ms: int) -> void:
	if world_elapsed_ms < 0: return
	var elapsed_minutes := floori(float(world_elapsed_ms % REAL_DAY_MS) * MINUTES_PER_DAY / REAL_DAY_MS)
	var minute := (DAWN_MINUTE + elapsed_minutes) % MINUTES_PER_DAY
	if _clock_minute == minute: return
	_clock_minute = minute
	_clock_label.text = "%02d:%02d" % [floori(minute / 60.0), minute % 60]
	var night := minute < DAWN_MINUTE or minute >= NIGHT_MINUTE
	var texture := CLOCK_NIGHT if night else CLOCK_DAY
	if _clock_badge.texture != texture:
		_clock_badge.texture = texture
		_clock_label.add_theme_color_override("font_color", NIGHT_CLOCK_INK if night else DAY_CLOCK_INK)

func _group_digits(value: int) -> String:
	var digits := str(value)
	var i := digits.length() - 3
	while i > 0:
		digits = digits.insert(i, ",")
		i -= 3
	return digits

func set_pond_layout(active: bool) -> void:
	if _pond_layout == active: return
	_pond_layout = active
	_clear_notice()
	set_pond_fishing_active(false)
	_pond_catch.hide()
	var body := _description.get_parent()
	if active:
		_equipment.reparent(body, false)
		body.move_child(_equipment, _description.get_index() + 1)
		_receipt.hide()
	else:
		_equipment.reparent(_location.get_parent(), false)

func get_pond_fishing_host() -> Control:
	return _pond_fishing_host if _pond_layout else null

func has_pond_catch() -> bool:
	return _pond_layout and _pond_catch.visible

func set_pond_fishing_active(active: bool) -> void:
	active = active and _pond_layout
	if active == _pond_fishing_active: return
	_pond_fishing_active = active
	_pond_fishing_host.visible = active
	_primary.visible = not active and not _primary_id.is_empty()
	_primary_detail.visible = _primary.visible and not _primary_detail.text.is_empty()
	for row: Dictionary in _rows.values():
		row.button.disabled = active or row.disabled
	for button: Button in _map_button.get_parent().get_children():
		button.disabled = active
		button.modulate.a = 0.5 if active else 1.0

func _show_notice(message: String) -> void:
	if not _combat_status.visible and (_context.text.is_empty() or _context.text == _notice):
		_context.text = message
		_context.show()
	_notice = message
	_notice_timer.start()

func _clear_notice() -> void:
	_notice_timer.stop()
	if not _notice.is_empty() and _context.text == _notice:
		_context.text = ""
		_context.hide()
	_notice = ""

func _sync_combat_results() -> void:
	var has_results := _combat_layout_active and _results.get_child_count() > 0
	_combat_log_toggle.visible = has_results
	_results.visible = has_results and _combat_log_toggle.button_pressed

func _build_duel_log(parent: Control) -> void:
	_duel_log_toggle = _button("최근 전투 기록 보기", MUTED)
	_duel_log_toggle.alignment = HORIZONTAL_ALIGNMENT_LEFT
	_duel_log_toggle.custom_minimum_size.y = 36
	_duel_log_toggle.toggle_mode = true
	_duel_log_toggle.hide()
	parent.add_child(_duel_log_toggle)
	_duel_log_body = _column(parent, 8)
	_duel_log_body.hide()
	_duel_log_toggle.toggled.connect(_show_duel_log)

func _show_duel_log(opened: bool) -> void:
	_duel_log_toggle.text = "최근 전투 기록 접기" if opened else "최근 전투 기록 보기"
	_duel_log_body.visible = opened and _duel_log_toggle.visible

func set_duel_log(entries: Array) -> void:
	if entries == _duel_log_entries: return
	_duel_log_entries = entries
	for child in _duel_log_body.get_children():
		_duel_log_body.remove_child(child)
		child.queue_free()
	for index in range(entries.size() - 1, -1, -1):
		var entry: Variant = entries[index]
		if not entry is Dictionary: continue
		var turn := int(entry.get("turn", 0))
		var action := str(entry.get("action", ""))
		var result := str(entry.get("result", ""))
		if turn < 1 or action.is_empty() or result.is_empty(): continue
		var row := _column(_duel_log_body, 2)
		var heading := _label("%d턴 · %s" % [turn, action], 13, INK, FONT_STRONG)
		var detail := _label(result, 12, MUTED)
		heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.add_child(heading)
		row.add_child(detail)
	_duel_log_toggle.visible = _duel_log_body.get_child_count() > 0
	if not _duel_log_toggle.visible: _duel_log_toggle.set_pressed_no_signal(false)
	_show_duel_log(_duel_log_toggle.button_pressed)

func set_place_detail(title: String, equipment: String) -> void:
	if _location.text != title:
		scroll_to_scene_start()
		_location.text = title
	_equipment.text = equipment
	_equipment.visible = not equipment.is_empty()

func set_duel_health(ally: Dictionary = {}, enemy: Dictionary = {}, ally_element: String = "", enemy_element: String = "", reduced_motion: bool = false) -> void:
	if ally.is_empty() or enemy.is_empty():
		_duel_vitals_row.hide()
		return
	var animate := _duel_vitals_row.visible and not reduced_motion
	_set_duel_vital(_duel_ally, ally, "내", ally_element, animate)
	_set_duel_vital(_duel_enemy, enemy, "상대", enemy_element, animate)
	_duel_vitals_row.show()

func _set_duel_vital(vital: Dictionary, spirit: Dictionary, role: String, element: String, animate: bool) -> void:
	var name := str(spirit.get("name", "정령"))
	var meter: ProgressBar = vital.meter
	var accessible_name := "%s 정령 %s 체력" % [role, name]
	vital.title.text = "%s %s · %s" % [role, name, element]
	_set_vital(vital, int(spirit.get("hp", 0)), int(spirit.get("maxHp", 1)), animate and meter.accessibility_name == accessible_name)
	meter.accessibility_name = accessible_name

func set_duel_impact(impact: Dictionary = {}, revision: int = -1, animate: bool = false) -> void:
	var displayed_revision := -1 if impact.is_empty() else revision
	if _shown_duel_impact_revision == displayed_revision: return
	_shown_duel_impact_revision = displayed_revision
	if _duel_impact_tween:
		_duel_impact_tween.kill()
		_duel_impact_tween = null
	_duel_impact_row.modulate.a = 1.0
	var received := int(impact.get("received", 0))
	var dealt := int(impact.get("dealt", 0))
	var healed := int(impact.get("healed", 0))
	var ally_fainted := bool(impact.get("allyFainted", false))
	var enemy_defeated := bool(impact.get("enemyDefeated", false))
	_duel_ally_impact.text = _duel_impact_text(str(impact.get("allyName", "")), received, healed, ally_fainted)
	_duel_enemy_impact.text = _duel_impact_text(str(impact.get("enemyName", "")), dealt, 0, enemy_defeated)
	_duel_ally_impact.add_theme_color_override("font_color", HEALTH_COLOR if received > 0 or ally_fainted else DODGE_COLOR)
	_duel_impact_row.visible = not _duel_ally_impact.text.is_empty() or not _duel_enemy_impact.text.is_empty()
	if animate and _duel_impact_row.visible:
		_duel_impact_row.modulate.a = 0.55
		_duel_impact_tween = _duel_impact_row.create_tween()
		_duel_impact_tween.tween_property(_duel_impact_row, "modulate:a", 1.0, 0.18)

func _duel_impact_text(spirit_name: String, damage: int, healing: int, fainted: bool) -> String:
	var parts := PackedStringArray()
	if healing > 0: parts.append("회복 +%d" % healing)
	if damage > 0: parts.append("피해 −%d" % damage)
	if fainted: parts.append("쓰러짐")
	if parts.is_empty(): return ""
	return "%s · %s" % [spirit_name, " · ".join(parts)]

func scroll_to_scene_start() -> void:
	_scroll.set_deferred("scroll_vertical", 0)

func set_combat_layout(active: bool, intent: String = "", warning: float = -1.0, danger: bool = false,
		recovery: float = -1.0, compact_plaza: bool = false) -> void:
	if active != _combat_layout_active:
		var previous := _combat_vitals if _combat_layout_active else _vitals
		var next := _combat_vitals if active else _vitals
		for id: String in next:
			var meter: ProgressBar = previous[id].meter
			_set_vital(next[id], int(meter.value), int(meter.max_value), false)
		_combat_layout_active = active
		_status_row.visible = not active
		_combat_vitals_row.visible = active
		_location.get_parent().visible = not active
		_combat_status.visible = active
		_combat_result_timer.stop()
		_enemy_hit_timer.stop()
		_enemy_damage_number.hide()
		_reset_dodge_feedback()
		_combat_result = ""
		_combat_result_tone = ""
		_combat_context = ""
		_combat_log_toggle.set_pressed_no_signal(false)
		_combat_log_toggle.text = "전투 기록 펼치기"
		set_actions([])
		_update_combat_message()
		_sync_combat_results()
		scroll_to_scene_start()
	var compact_requested := active and compact_plaza
	if compact_requested != _compact_plaza_requested:
		_compact_plaza_requested = compact_requested
		_layout()
	if active:
		_set_enemy_intent(intent, warning, danger, recovery)
	else:
		_set_enemy_intent("", -1.0, false, -1.0)

func _set_enemy_intent(intent: String, warning: float, danger: bool, recovery: float) -> void:
	var tone := EnemyIntentTone.PLAIN
	if danger:
		tone = EnemyIntentTone.DANGER
	elif recovery >= 0.0:
		tone = EnemyIntentTone.RECOVERY
	elif warning >= 0.0:
		tone = EnemyIntentTone.WARNING
	var remaining := recovery if tone == EnemyIntentTone.RECOVERY else warning
	_enemy_intent_meter.visible = remaining >= 0.0
	_enemy_intent_meter.value = clampf(remaining, 0.0, 1.0)
	if _enemy_intent.text != intent:
		_enemy_intent.text = intent
		_enemy_intent_badge.visible = not intent.is_empty()
	if tone == _enemy_intent_tone: return
	_enemy_intent_tone = tone
	var badge := _enemy_plain_badge
	var text_color := DODGE_COLOR
	var track_color := COMBAT_WARNING_SURFACE
	var fill_color := COMBAT_WARNING_FILL
	var meter_caption := "적 공격까지 남은 시간"
	match tone:
		EnemyIntentTone.WARNING:
			badge = _enemy_warning_badge
			text_color = COMBAT_WARNING_TEXT
		EnemyIntentTone.DANGER:
			badge = _enemy_danger_badge
			text_color = COMBAT_DANGER_TEXT
			track_color = COMBAT_DANGER_SURFACE
			fill_color = COMBAT_DANGER_FILL
			meter_caption = "나를 향한 도약까지 남은 시간"
		EnemyIntentTone.RECOVERY:
			track_color = COMBAT_RECOVERY_SURFACE
			fill_color = DODGE_COLOR
			meter_caption = "반격 기회 남은 시간"
	_enemy_intent_badge.add_theme_stylebox_override("panel", badge)
	_enemy_intent.add_theme_color_override("font_color", text_color)
	_enemy_intent_meter.add_theme_stylebox_override("background", _fill(track_color, 3))
	_enemy_intent_meter.add_theme_stylebox_override("fill", _fill(fill_color, 3))
	_enemy_intent_meter.accessibility_name = meter_caption

func set_scene(description: String, context: String) -> void:
	if not _combat_layout_active and context.is_empty(): context = _notice
	_description.text = description
	_description.visible = not description.is_empty()
	_context.visible = not _combat_layout_active and not context.is_empty()
	if not _combat_layout_active:
		_context.text = context
	elif _combat_context != context:
		_combat_context = context
		_update_combat_message()

func clear_combat_result() -> void:
	_combat_result_timer.stop()
	_combat_result = ""
	_combat_result_tone = ""
	_update_combat_message()

func _update_combat_message() -> void:
	if not _combat_layout_active: return
	var line := _combat_result
	if line.is_empty():
		line = "회피 중 · 남은 1회" if _dodge_meter.visible else _combat_context
	_combat_message.text = line
	var dodging := _dodge_meter.visible or line.begins_with("회피 성공")
	var fallback := DODGE_COLOR if dodging else MUTED
	_combat_message.add_theme_color_override("font_color", _combat_feedback_color(_combat_result_tone, fallback))

func _combat_feedback_color(tone: String, fallback: Color) -> Color:
	match tone:
		"hurt": return HEALTH_COLOR
		"evade": return DODGE_COLOR
		"absorb": return ACCENT
		_: return fallback

func set_combatants(active: bool, enemy_name: String, enemy_pose: StringName, hp: int, max_hp: int, meadow_ox: bool) -> void:
	var visibility_changed := active != _combatants.visible
	_combatants.visible = active
	if not active: return
	var changed_enemy := enemy_name != _enemy_name or meadow_ox != _enemy_is_meadow_ox
	_set_vital(_enemy_health, hp, max_hp, not visibility_changed and not changed_enemy and _enemy_pose != &"death")
	if changed_enemy:
		_enemy_hit_timer.stop()
		_enemy_damage_number.hide()
		_enemy_name = enemy_name
		_enemy_is_meadow_ox = meadow_ox
		_enemy_health.title.text = enemy_name
		_enemy_health.meter.accessibility_name = enemy_name + " 체력"
	if not visibility_changed and not changed_enemy and _enemy_pose == enemy_pose: return
	_enemy_pose = enemy_pose
	_update_enemy_portrait()

func _update_enemy_portrait() -> void:
	var hit := not _enemy_hit_timer.is_stopped() and _enemy_pose != &"death"
	_enemy_portrait.modulate = Color.WHITE
	if _enemy_is_meadow_ox:
		_enemy_portrait.texture = MeadowOx.pose_texture(_enemy_pose)
		if _enemy_pose == &"death":
			_enemy_portrait.modulate.a = 0.4
		elif hit:
			_enemy_portrait.modulate = Color(1.0, 0.75, 0.75)
		return
	_set_slime_portrait(&"hit" if hit else _enemy_pose)

func _set_slime_portrait(slime_pose: StringName) -> void:
	var animation := slime_pose
	var frame := 0
	match slime_pose:
		&"prepare": frame = 8
		&"attack": frame = 10
		&"recover":
			animation = &"attack"
			frame = 23
		&"hop": frame = 4
		&"hit": frame = 2
	if not SLIME_FRAMES.has_animation(animation): animation = &"idle"
	_enemy_portrait.texture = SLIME_FRAMES.get_frame_texture(animation, mini(frame, SLIME_FRAMES.get_frame_count(animation) - 1))

func show_enemy_damage(amount: int) -> void:
	if not _combat_layout_active or not _combatants.visible: return
	_enemy_damage_number.text = "−%d" % amount
	_enemy_damage_number.show()
	_enemy_hit_timer.start()
	_update_enemy_portrait()

func set_dodge_remaining(seconds: float) -> void:
	var remaining := clampf(seconds, 0.0, _dodge_meter.max_value)
	if not _combatants.visible or is_equal_approx(remaining, _dodge_sample): return
	var new_window := remaining > _dodge_sample
	_dodge_sample = remaining
	if remaining <= 0.0:
		if _dodge_meter.visible: show_dodge_result(false)
		return
	# Repeated world frames must never refill or restart a spent window.
	if not new_window and not _dodge_meter.visible: return
	if _dodge_tween: _dodge_tween.kill()
	_dodge_meter.value = remaining if new_window else minf(remaining, _dodge_meter.value)
	_dodge_meter.show()
	_dodge_tween = create_tween()
	_dodge_tween.tween_property(_dodge_meter, "value", 0.0, _dodge_meter.value)
	_dodge_tween.tween_callback(show_dodge_result.bind(false))
	_update_combat_message()

func show_dodge_result(success: bool) -> void:
	if not _combatants.visible: return
	if _dodge_tween: _dodge_tween.kill()
	_dodge_meter.hide()
	if not success and _combat_result.is_empty():
		_combat_result = "회피 효과 종료"
		_combat_result_timer.start()
	_update_combat_message()

func _reset_dodge_feedback() -> void:
	if _dodge_tween: _dodge_tween.kill()
	_dodge_sample = 0.0
	_dodge_meter.hide()

func set_actions(actions: Array[Dictionary], uniform_rows: bool = false, show_primary: bool = true) -> void:
	_callbacks.clear()
	_action_row_order.clear()
	var inline_rows := uniform_rows or _combat_layout_active
	var has_primary := show_primary and not inline_rows and not actions.is_empty() and not str(actions[0].id).begins_with("story_")
	_primary.visible = has_primary and not _pond_fishing_active
	if not has_primary: _primary_detail.hide()
	_primary_id = ""
	var present: Dictionary = {}
	for index: int in actions.size():
		var action := actions[index]
		var id: String = action.id
		_callbacks[id] = action.callback
		var button: Button
		var cooldown_fill: ColorRect
		if has_primary and index == 0:
			_primary_id = id
			button = _primary
			cooldown_fill = _primary_cooldown
			_rod.visible = id == "fish"
			_primary_title.text = "다시 낚시하기" if id == "fish" and has_pond_catch() else str(action.label)
			_primary_title.modulate.a = 0.60 if action.get("disabled", false) else 1.0
			button.accessibility_name = _primary_title.text
			_primary_detail.text = str(action.get("detail", ""))
			_primary_detail.visible = _primary.visible and not _primary_detail.text.is_empty()
		else:
			present[id] = true
			_action_row_order.append(id)
			if not _rows.has(id):
				var item := _column(_secondary, 0)
				item.add_child(_rule())
				var choice := _button("", INK)
				choice.alignment = HORIZONTAL_ALIGNMENT_LEFT
				choice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				if _combat_layout_active:
					choice.custom_minimum_size.y = 54
					choice.add_theme_font_size_override("font_size", 15)
					choice.add_theme_constant_override("icon_max_width", 26)
					choice.add_theme_constant_override("h_separation", 8)
					choice.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
					for state: String in ["normal", "hover", "pressed", "disabled"]:
						var style := choice.get_theme_stylebox(state).duplicate() as StyleBoxFlat
						style.content_margin_left = 10
						style.content_margin_right = 10
						choice.add_theme_stylebox_override(state, style)
				choice.pressed.connect(_invoke.bind(id))
				item.add_child(choice)
				var cooldown := _add_action_cooldown(choice, true)
				var detail := _label("", 12, MUTED)
				detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				item.add_child(detail)
				_rows[id] = {"item": item, "button": choice, "detail": detail, "cooldown": cooldown}
			var row: Dictionary = _rows[id]
			row.disabled = bool(action.get("disabled", false))
			button = row.button
			if _combat_layout_active:
				button.icon = COMBAT_ACTION_ICONS.get(action.get("icon", "")) as Texture2D
			cooldown_fill = row.cooldown
			var detail: Label = row.detail
			detail.text = str(action.get("detail", ""))
			var inline_detail := inline_rows or _pond_layout
			var detail_parent: Control = button if inline_detail else row.item
			if detail.get_parent() != detail_parent:
				detail.reparent(detail_parent, false)
				if inline_detail:
					detail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
					detail.anchor_left = 0.52 if _combat_layout_active else 0.0
					detail.offset_left = 0 if _combat_layout_active else 84
					detail.offset_right = -10 if _combat_layout_active else -6
			detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if inline_detail else HORIZONTAL_ALIGNMENT_LEFT
			detail.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
			detail.visible = not detail.text.is_empty()
			button.text = action.label
		button.accessibility_description = str(action.get("detail", ""))
		button.disabled = _pond_fishing_active or bool(action.get("disabled", false))
		_set_action_presentation(button, cooldown_fill, action)
	for id: String in _rows.keys():
		if not present.has(id):
			var item: Control = _rows[id].item
			item.get_parent().remove_child(item)
			item.queue_free()
			_rows.erase(id)
	_place_action_rows()

func _place_action_rows() -> void:
	var compact_index := 0
	var scroll_index := 0
	var restore_focus: Button
	for index: int in _action_row_order.size():
		var id := _action_row_order[index]
		var row: Dictionary = _rows[id]
		var item: Control = row.item
		var pinned := _compact_combat_active and (index < 2 or id == "combat_flame_guard")
		var destination := _compact_actions if pinned else _secondary
		if item.get_parent() != destination:
			var button: Button = row.button
			if button.has_focus(): restore_focus = button
			item.reparent(destination, false)
		var position := compact_index if pinned else scroll_index
		if item.get_index() != position: destination.move_child(item, position)
		if pinned: compact_index += 1
		else: scroll_index += 1
	_secondary.visible = scroll_index > 0
	if is_instance_valid(restore_focus) and restore_focus.is_visible_in_tree(): restore_focus.grab_focus()

func _update_compact_combat() -> void:
	var active := _compact_plaza_requested and size.x >= 700.0 and size.y >= 360.0 and size.y <= 480.0
	if active == _compact_combat_active: return
	_compact_combat_active = active
	_moving_combat_card = true
	if active:
		_compact_combat.show()
		_combatants.reparent(_compact_readout, false)
		_combat_status.reparent(_compact_readout, false)
	else:
		_combatants.reparent(_scroll_body, false)
		_scroll_body.move_child(_combatants, _context.get_index())
		_combat_status.reparent(_scroll_body, false)
		_scroll_body.move_child(_combat_status, _primary.get_index())
	_moving_combat_card = false
	_enemy_portrait.custom_minimum_size.y = 64 if active else 116
	_combat_message.max_lines_visible = 1 if active else 2
	_combat_status.custom_minimum_size.y = _combat_message.max_lines_visible * _combat_message.get_line_height() + 14
	_place_action_rows()
	if not active: _compact_combat.hide()

func _add_action_cooldown(button: Button, behind_label: bool) -> ColorRect:
	var fill := ColorRect.new()
	fill.color = COMBAT_ACTION_COOLDOWN
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill.show_behind_parent = behind_label
	fill.hide()
	button.add_child(fill)
	fill.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return fill

func _set_action_presentation(button: Button, cooldown_fill: ColorRect, action: Dictionary) -> void:
	var guard_remaining := clampf(float(action.get("guard_duration_ratio", 0.0)), 0.0, 1.0)
	var remaining := guard_remaining if guard_remaining > 0.0 else clampf(float(action.get("cooldown", 0.0)), 0.0, 1.0)
	cooldown_fill.color = COMBAT_ACTION_GUARD if guard_remaining > 0.0 else COMBAT_ACTION_COOLDOWN
	cooldown_fill.visible = remaining > 0.0
	if cooldown_fill.visible:
		cooldown_fill.anchor_right = remaining
		cooldown_fill.offset_right = 0.0
	var highlighted := bool(action.get("highlighted", false)) and not button.disabled
	var previously_highlighted := button.has_meta(&"normal_action_style")
	if highlighted and not previously_highlighted:
		button.set_meta(&"normal_action_style", button.get_theme_stylebox("normal"))
		button.add_theme_stylebox_override("normal", _combat_action_highlight)
	elif previously_highlighted and not highlighted:
		button.add_theme_stylebox_override("normal", button.get_meta(&"normal_action_style") as StyleBox)
		button.remove_meta(&"normal_action_style")

func _invoke(id: String) -> void:
	if region_move_active: return
	var callback: Callable = _callbacks.get(id, Callable())
	if callback.is_valid(): callback.call()

func set_fishing_result(before: int, after: int) -> void:
	if after < 0 or (before >= 0 and after <= before): return
	if _pond_layout:
		# The server confirms exactly one fish on success, including resumed casts.
		_pond_catch_label.text = "민물고기 +1 · 현재 %d마리" % after
		_pond_catch.show()
		if _primary_id == "fish":
			_primary_title.text = "다시 낚시하기"
			_primary.accessibility_name = _primary_title.text
		record(_pond_catch_label.text)
		return
	if before < 0:
		_catch_title.text = "민물고기 획득"
		_catch_count.text = "보유 %d마리" % after
	else:
		_catch_title.text = "민물고기 %d마리 획득" % (after - before)
		_catch_count.text = "%d마리 → %d마리" % [before, after]
	_receipt.show()

func record(message: String, tone: String = "") -> void:
	var line := message.strip_edges()
	if line.is_empty(): return
	if _combat_layout_active:
		_combat_result = line
		_combat_result_tone = tone
		_combat_result_timer.start()
		_update_combat_message()
	else:
		_show_notice(line)
	if line == _last_result and tone.is_empty(): return
	_last_result = line
	var label := _label(line, 13, _combat_feedback_color(tone, ACCENT))
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_results.add_child(label)
	_results.move_child(label, 0)
	if _results.get_child_count() > RESULT_LIMIT:
		var oldest := _results.get_child(-1)
		_results.remove_child(oldest)
		oldest.queue_free()
	_sync_combat_results()

func clear_log() -> void:
	_last_result = ""
	_clear_notice()
	_combat_result = ""
	_combat_result_tone = ""
	_combat_result_timer.stop()
	_enemy_hit_timer.stop()
	_enemy_damage_number.hide()
	if _combat_layout_active: _update_enemy_portrait()
	_combat_log_toggle.set_pressed_no_signal(false)
	_combat_log_toggle.text = "전투 기록 펼치기"
	_update_combat_message()
	_receipt.hide()
	_pond_catch.hide()
	for row in _results.get_children():
		_results.remove_child(row)
		row.queue_free()
	_sync_combat_results()

func _layout() -> void:
	_update_compact_combat()
	var content_width := 740.0 if _compact_combat_active else 560.0
	var side := maxi(12 if size.x < 340 else 22, roundi((size.x - content_width) * 0.5))
	_shell.add_theme_constant_override("margin_left", side)
	_shell.add_theme_constant_override("margin_right", side)
	_shell.add_theme_constant_override("margin_top", 4)
	_shell.add_theme_constant_override("margin_bottom", 6)
	var map_side := clampf(size.x - 2.0 * side, 0.0, 320.0)
	var map_size := Vector2.ONE * roundf(map_side)
	_local_map.custom_minimum_size = map_size
	_local_map.size = map_size
	_local_map_frame.custom_minimum_size = map_size * _local_map.scale

func _row(parent: Control, gap: int) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_PASS
	row.add_theme_constant_override("separation", gap)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(row)
	return row

func _column(parent: Control, gap: int) -> VBoxContainer:
	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_PASS
	box.add_theme_constant_override("separation", gap)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(box)
	return box

func _spacer(parent: HBoxContainer) -> void:
	var spacer := Control.new()
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(spacer)

func _label(text: String, size_px: int, color: Color, font: Font = FONT) -> Label:
	var label := Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", font)
	label.add_theme_font_size_override("font_size", size_px)
	label.add_theme_color_override("font_color", color)
	return label

func _button(text: String, text_color: Color) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 44
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	button.add_theme_font_override("font", FONT_STRONG)
	button.add_theme_font_size_override("font_size", 13)
	for state: String in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, text_color)
	button.add_theme_color_override("font_disabled_color", MUTED)
	button.add_theme_stylebox_override("normal", _fill(Color.TRANSPARENT))
	button.add_theme_stylebox_override("disabled", _fill(Color.TRANSPARENT))
	button.add_theme_stylebox_override("hover", _fill(PALE, 3))
	button.add_theme_stylebox_override("pressed", _fill(SKY, 3))
	var focus := _fill(Color.TRANSPARENT)
	focus.draw_center = false
	focus.border_color = ACCENT
	focus.set_border_width_all(2)
	button.add_theme_stylebox_override("focus", focus)
	return button

func _fill(color: Color, radius: int = 0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	return style

func _rule() -> HSeparator:
	var rule := HSeparator.new()
	var line := StyleBoxLine.new()
	line.color = RULE
	line.thickness = 1
	rule.add_theme_constant_override("separation", 1)
	rule.add_theme_stylebox_override("separator", line)
	return rule
