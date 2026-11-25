extends Control

signal navigation_requested(kind: String)
signal place_requested(id: String)
signal local_place_requested(id: String)

const CityGrid = preload("res://scripts/simplified_city_grid.gd")
const FISH = preload("res://art/export/items/river-fish.png")
const CLOCK_DAY = preload("res://art/export/text-mode/clock-day.svg")
const CLOCK_NIGHT = preload("res://art/export/text-mode/clock-night.svg")
const HEALTH_ICON := preload("res://art/export/text-mode/status-health.png")
const MANA_ICON := preload("res://art/export/text-mode/status-mana.png")
const HUNGER_ICON := preload("res://art/export/text-mode/status-hunger.png")
const HERO_MODEL := preload("res://art/characters/hero-v12/hero.glb")
const HERO_APPEARANCE := preload("res://scripts/characters/hero_v12/equipment_appearance.gd")
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
var _hero_portrait: TextureRect
var _slime_portrait: TextureRect
var _enemy_caption: Label
var _enemy_name := "슬라임"
var _fireball_layer: Node2D
var _fireballs: Dictionary[String, BattleFireball] = {}
var _hero_column: VBoxContainer
var _hero_caption: Label
var _dodge_meter: ProgressBar
var _dodge_sample := 0.0
var _dodge_tween: Tween
var _status_row: HBoxContainer
var _enemy_health: Dictionary
var _hero_stage: SubViewport
var _hero_appearance := HERO_APPEARANCE.new()
var _hero_loadout: Dictionary = {}
var _slime_pose: StringName
var _combat_telegraph: ProgressBar
var _clock_badge: TextureRect
var _clock_label: Label
var _clock_minute := -1
var _money: Label
var _vitals: Dictionary = {}
var _primary: Button
var _primary_id := ""
var _rod: TextureRect
var _primary_title: Label
var _primary_detail: Label
var _primary_cooldown: ColorRect
var _action_highlight := _fill(Color("e6ddfb"), 5)
var _secondary: VBoxContainer
var _rows: Dictionary = {}
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
	page.add_child(_rule())

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
	_vitals.hunger = _add_vital(row, "허기", HUNGER_ICON, Color("e8ba36"), Color("fff3ce"))
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
	var trail: ColorRect
	if texture == HEALTH_ICON:
		trail = ColorRect.new()
		trail.color = Color("ff9e35")
		trail.mouse_filter = Control.MOUSE_FILTER_IGNORE
		meter.add_child(trail)
		trail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		trail.offset_top = 2
		trail.offset_bottom = -2
		trail.hide()
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
	_local_map_frame.add_child(_local_map)
	_local_map.place_requested.connect(func(id: String): local_place_requested.emit(id))
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
	_combat_message = _label("", 13, ACCENT)
	_combat_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_combat_message.max_lines_visible = 2
	_combat_message.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_combat_status.add_child(_combat_message)
	_combat_message.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_combat_message.offset_bottom = -9
	_combat_status.custom_minimum_size.y = 2 * _combat_message.get_line_height() + 14
	_combat_status.hide()
	_combat_telegraph = ProgressBar.new()
	_combat_telegraph.max_value = 1.0
	_combat_telegraph.step = 0.0
	_combat_telegraph.show_percentage = false
	_combat_telegraph.layout_direction = Control.LAYOUT_DIRECTION_LTR
	_combat_telegraph.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_combat_telegraph.add_theme_stylebox_override("background", _fill(Color("eee8f7")))
	_combat_telegraph.add_theme_stylebox_override("fill", _fill(Color("7650a7")))
	_combat_status.add_child(_combat_telegraph)
	_combat_telegraph.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_combat_telegraph.offset_top = -6
	_combat_telegraph.hide()
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
	_results = _column(body, 4)
	_results.hide()
	_notice_timer = Timer.new()
	_notice_timer.one_shot = true
	_notice_timer.wait_time = 4.0
	_notice_timer.timeout.connect(_clear_notice)
	add_child(_notice_timer)
	var bottom := Control.new()
	bottom.custom_minimum_size.y = 4
	body.add_child(bottom)

func _build_combatants(parent: Control) -> void:
	_combatants = PanelContainer.new()
	var surface := _fill(PALE, 6)
	surface.content_margin_top = 6
	surface.content_margin_bottom = 8
	_combatants.add_theme_stylebox_override("panel", surface)
	_combatants.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(_combatants)
	var lineup := _row(_combatants, 8)
	_hero_column = _column(lineup, 3)
	_hero_portrait = _add_portrait(_hero_column)
	var hero_status := Control.new()
	hero_status.custom_minimum_size.y = 26
	hero_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_hero_column.add_child(hero_status)
	_hero_caption = _label("내 캐릭터", 13, INK, FONT_STRONG)
	_hero_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hero_status.add_child(_hero_caption)
	_hero_caption.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_hero_caption.offset_bottom = -4
	_dodge_meter = ProgressBar.new()
	_dodge_meter.max_value = 1.0
	_dodge_meter.step = 0.0
	_dodge_meter.show_percentage = false
	_dodge_meter.accessibility_name = "회피 효과 남은 시간"
	_dodge_meter.layout_direction = Control.LAYOUT_DIRECTION_LTR
	_dodge_meter.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dodge_meter.add_theme_stylebox_override("background", _fill(Color("c5e1da"), 2))
	_dodge_meter.add_theme_stylebox_override("fill", _fill(DODGE_COLOR, 2))
	hero_status.add_child(_dodge_meter)
	_dodge_meter.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	_dodge_meter.offset_top = -5
	_dodge_meter.hide()
	var enemy_column := _column(lineup, 3)
	_slime_portrait = _add_portrait(enemy_column)
	_enemy_caption = _label(_enemy_name, 13, INK, FONT_STRONG)
	_enemy_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_enemy_caption.custom_minimum_size.y = hero_status.custom_minimum_size.y
	enemy_column.add_child(_enemy_caption)
	_enemy_health = _add_vital(enemy_column, "슬라임 체력", HEALTH_ICON, HEALTH_COLOR)
	_fireball_layer = Node2D.new()
	_combatants.add_child(_fireball_layer)
	_combatants.visibility_changed.connect(_clear_hidden_fireballs)
	_combatants.hide()

func show_fireball(id: String, travel_seconds: float, reduced_motion: bool) -> void:
	if not _combatants.is_visible_in_tree() or _fireballs.has(id): return
	var shot := BattleFireball.new()
	shot.caster = _hero_portrait
	shot.target = _slime_portrait
	shot.travel_seconds = clampf(travel_seconds, 0.24, 0.8)
	shot.reduced_motion = reduced_motion
	_fireballs[id] = shot
	shot.tree_exiting.connect(func(): _fireballs.erase(id), CONNECT_ONE_SHOT)
	_fireball_layer.add_child(shot)

func resolve_fireball(id: String, hit: bool) -> void:
	if _fireballs.has(id): _fireballs[id].resolve(hit)

func _clear_hidden_fireballs() -> void:
	if _combatants.is_visible_in_tree(): return
	for shot: BattleFireball in _fireballs.values():
		shot.hide()
		shot.queue_free()

func _add_portrait(actor: VBoxContainer) -> TextureRect:
	var portrait := TextureRect.new()
	portrait.custom_minimum_size.y = 116
	portrait.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	actor.add_child(portrait)
	return portrait

func _create_combat_hero() -> void:
	_hero_stage = SubViewport.new()
	_hero_stage.size = Vector2i(76, 128)
	_hero_stage.own_world_3d = true
	_hero_stage.transparent_bg = true
	_hero_stage.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_hero_stage)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.86
	camera.position = Vector3(0, 0.85, 4)
	_hero_stage.add_child(camera)
	camera.current = true
	var model := HERO_MODEL.instantiate() as Node3D
	model.rotation.y = PI / 4.0
	_hero_stage.add_child(model)
	var rigs := model.find_children("*", "Skeleton3D", true, false)
	if not rigs.is_empty():
		_hero_appearance.setup(model, rigs[0] as Skeleton3D)
	var players := model.find_children("*", "AnimationPlayer", true, false)
	if not players.is_empty():
		var animation := players[0] as AnimationPlayer
		if animation.has_animation(&"Idle"):
			animation.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
			animation.play(&"Idle")
			animation.advance(0.0)
	_hero_portrait.texture = _hero_stage.get_texture()

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

func set_local_map_state(area: String, current: String, destinations: Dictionary, show_map: bool, locked: Dictionary = {}) -> void:
	_local_map_center.visible = show_map and not area.is_empty()
	if _local_map_center.visible:
		var map_scale := 1.0 if area in [CityGrid.PLAZA_AREA, CityGrid.MEADOW_AREA] else 0.75
		var display_scale := Vector2.ONE * map_scale
		if _local_map.scale != display_scale:
			_local_map.scale = display_scale
			_local_map_frame.custom_minimum_size = _local_map.size * display_scale
		_local_map.set_state(current, destinations, area, locked)
	else:
		_local_map.finish_move()

func play_map_move(id: String, local: bool) -> bool:
	var grid := _local_map if local else _map
	if not is_instance_valid(grid) or not grid.is_visible_in_tree():
		return false
	var duration := grid.start_move(id)
	if duration <= 0.0:
		return is_zero_approx(duration)
	# The world map is freed when its panel closes, so the grid cannot own this wait.
	await get_tree().create_timer(duration).timeout
	if not is_instance_valid(grid):
		return false
	if not grid.is_visible_in_tree() or grid != (_local_map if local else _map):
		grid.finish_move()
		return false
	return grid.arrive_preview(id)

func finish_map_move(local: bool) -> void:
	var grid := _local_map if local else _map
	if is_instance_valid(grid):
		grid.finish_move()

func set_status(location: String, combat: Dictionary, life: Dictionary, money: int, world_elapsed_ms: int) -> void:
	if _location.text.is_empty(): _location.text = location
	for id: String in _vitals:
		var maximum := 100
		var value: int
		if id == "hunger":
			value = int(life.get(id, maximum))
		else:
			var is_hp := id == "hp"
			var default_maximum := 100 if is_hp else 30
			value = int(combat.get(id, default_maximum))
			maximum = maxi(1, int(combat.get("maxHp" if is_hp else "maxMp", default_maximum)))
		_set_vital(_vitals[id], value, maximum, _combatants.is_visible_in_tree())
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
	_results.visible = _combat_status.visible and _results.get_child_count() > 0

func set_place_detail(title: String, equipment: String) -> void:
	if _location.text != title:
		scroll_to_scene_start()
		_location.text = title
	_equipment.text = equipment
	_equipment.visible = not equipment.is_empty()

func scroll_to_scene_start() -> void:
	_scroll.set_deferred("scroll_vertical", 0)

func set_scene(description: String, context: String, combat_layout: bool = false) -> void:
	if not combat_layout and context.is_empty(): context = _notice
	_description.text = description
	_description.visible = not description.is_empty()
	if _combat_status.visible != combat_layout:
		_combat_status.visible = combat_layout
		_sync_combat_results()
	_context.visible = not combat_layout and not context.is_empty()
	if combat_layout:
		_combat_message.text = context
	else:
		_context.text = context

func set_combatants(active: bool, equipment: Dictionary, slime_pose: StringName, hp: int, max_hp: int, meadow_ox: bool) -> void:
	var visibility_changed := active != _combatants.visible
	_combatants.visible = active
	if visibility_changed:
		var hp_meter: ProgressBar = _vitals.hp.meter
		var mp_meter: ProgressBar = _vitals.mp.meter
		var parent: Container = _hero_column if active else _status_row
		hp_meter.reparent(parent, false)
		mp_meter.reparent(parent, false)
		if not active:
			_reset_dodge_feedback()
			parent.move_child(hp_meter, 0)
			parent.move_child(mp_meter, 1)
			_set_vital(_vitals.hp, int(hp_meter.value), int(hp_meter.max_value), false)
	if not active: return
	_set_vital(_enemy_health, hp, max_hp, not visibility_changed and _slime_pose != &"death")
	if _hero_stage == null: _create_combat_hero()
	if visibility_changed or _hero_loadout != equipment:
		_hero_appearance.apply(equipment)
		_hero_loadout = equipment.duplicate()
		_hero_stage.render_target_update_mode = SubViewport.UPDATE_ONCE
	var enemy_name := MeadowOx.DISPLAY_NAME if meadow_ox else "슬라임"
	if _slime_pose == slime_pose and _enemy_name == enemy_name: return
	_slime_pose = slime_pose
	_enemy_name = enemy_name
	_enemy_caption.text = enemy_name
	_enemy_health.meter.accessibility_name = enemy_name + " 체력"
	_slime_portrait.modulate.a = 0.4 if meadow_ox and slime_pose == &"death" else 1.0
	if meadow_ox:
		_slime_portrait.texture = MeadowOx.pose_texture(slime_pose)
		return
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
	_slime_portrait.texture = SLIME_FRAMES.get_frame_texture(animation, mini(frame, SLIME_FRAMES.get_frame_count(animation) - 1))

func set_combat_telegraph(fraction: float) -> void:
	_combat_telegraph.visible = fraction >= 0.0
	if _combat_telegraph.visible: _combat_telegraph.value = clampf(fraction, 0.0, 1.0)

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
	_hero_caption.text = "회피 중 · 남은 1회"
	_hero_caption.add_theme_color_override("font_color", DODGE_COLOR)
	_dodge_tween = create_tween()
	_dodge_tween.tween_property(_dodge_meter, "value", 0.0, _dodge_meter.value)
	_dodge_tween.tween_callback(show_dodge_result.bind(false))

func show_dodge_result(success: bool) -> void:
	if not _combatants.visible: return
	if _dodge_tween: _dodge_tween.kill()
	_dodge_meter.hide()
	_hero_caption.text = "회피 성공 · 피해 0" if success else "회피 효과 종료"
	_hero_caption.add_theme_color_override("font_color", DODGE_COLOR if success else MUTED)
	_dodge_tween = create_tween()
	_dodge_tween.tween_interval(1.5)
	_dodge_tween.tween_callback(_restore_hero_caption)

func _restore_hero_caption() -> void:
	_hero_caption.text = "내 캐릭터"
	_hero_caption.add_theme_color_override("font_color", INK)

func _reset_dodge_feedback() -> void:
	if _dodge_tween: _dodge_tween.kill()
	_dodge_sample = 0.0
	_dodge_meter.hide()
	_restore_hero_caption()

func set_actions(actions: Array[Dictionary], uniform_rows: bool = false) -> void:
	_callbacks.clear()
	var has_primary := not uniform_rows and not actions.is_empty() and not str(actions[0].id).begins_with("story_")
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
			if not _rows.has(id):
				var item := _column(_secondary, 0)
				item.add_child(_rule())
				var choice := _button("", INK)
				choice.alignment = HORIZONTAL_ALIGNMENT_LEFT
				choice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
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
			cooldown_fill = row.cooldown
			var row_index := index - int(has_primary)
			if row.item.get_index() != row_index: _secondary.move_child(row.item, row_index)
			var detail: Label = row.detail
			detail.text = str(action.get("detail", ""))
			var inline_detail := uniform_rows or _pond_layout
			var detail_parent: Control = button if inline_detail else row.item
			if detail.get_parent() != detail_parent:
				detail.reparent(detail_parent, false)
				if inline_detail:
					detail.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
					detail.offset_left = 84
					detail.offset_right = -6
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
			_secondary.remove_child(item)
			item.queue_free()
			_rows.erase(id)
	_secondary.visible = not present.is_empty()

func _add_action_cooldown(button: Button, behind_label: bool) -> ColorRect:
	var fill := ColorRect.new()
	fill.color = Color("cadff1")
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fill.show_behind_parent = behind_label
	fill.hide()
	button.add_child(fill)
	fill.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return fill

func _set_action_presentation(button: Button, cooldown_fill: ColorRect, action: Dictionary) -> void:
	var remaining := clampf(float(action.get("cooldown", 0.0)), 0.0, 1.0)
	cooldown_fill.visible = remaining > 0.0
	if cooldown_fill.visible:
		cooldown_fill.anchor_right = remaining
		cooldown_fill.offset_right = 0.0
	var highlighted := bool(action.get("highlighted", false)) and not button.disabled
	var previously_highlighted := button.has_meta(&"normal_action_style")
	if highlighted and not previously_highlighted:
		button.set_meta(&"normal_action_style", button.get_theme_stylebox("normal"))
		button.add_theme_stylebox_override("normal", _action_highlight)
	elif previously_highlighted and not highlighted:
		button.add_theme_stylebox_override("normal", button.get_meta(&"normal_action_style") as StyleBox)
		button.remove_meta(&"normal_action_style")

func _invoke(id: String) -> void:
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

func record(message: String) -> void:
	var line := message.strip_edges()
	if line.is_empty(): return
	_show_notice(line)
	if line == _last_result: return
	_last_result = line
	var label := _label(line, 13, ACCENT)
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
	_receipt.hide()
	_pond_catch.hide()
	for row in _results.get_children():
		_results.remove_child(row)
		row.queue_free()
	_sync_combat_results()

func _layout() -> void:
	var side := maxi(12 if size.x < 340 else 22, roundi((size.x - 560.0) * 0.5))
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
