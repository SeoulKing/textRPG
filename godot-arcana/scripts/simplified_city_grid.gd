extends Control
## City and interior grids. Movement and access are supplied by simplified_play.
signal place_requested(id: String)

const ICONS = preload("res://art/export/text-mode/map-icons.png")
const HOME_ICON = preload("res://art/export/text-mode/home.png")
const STORAGE_ICON = preload("res://art/export/outdoor-unified-v1/crate.png")
const SHOP_ICON = preload("res://art/export/shop.png")
const ROOM_ICONS = preload("res://art/export/text-mode/home-room-icons.png")
const PLAYER_PORTRAIT = preload("res://art/export/text-mode/player-portrait.png")
const ACADEMY_STAIRS_UP = preload("res://art/export/academy-interior/stairs-up.png")
const ACADEMY_STAIRS_DOWN = preload("res://art/export/academy-interior/stairs-down.png")
const ACADEMY_ICONS := {
	"hall": preload("res://art/export/academy-interior/orrery.png"),
	"classroom": preload("res://art/export/academy-interior/blackboard.png"),
	"practice": preload("res://art/export/academy-interior/first-floor/crystal.png"),
	"headmaster": preload("res://art/export/academy-interior/desk.png"),
	"garden": preload("res://art/export/academy-interior/plant.png"),
	"observatory": preload("res://art/export/academy-interior/telescope.png"),
}
const MEADOW_ICON = preload("res://art/export/outdoor-unified-v1/grass-clump.png")
const MeadowOx = preload("res://scripts/native_2d_meadow_ox.gd")
const SLIME_FRAMES = preload("res://art/export/monsters/slime.tres")
const GRID_SIZE := 5
const PLAZA_AREA := "arcana_plaza"
const MEADOW_AREA := "arcana_meadow_field"
const ACADEMY_FIRST_AREA := "arcana_academy:1"
const ACADEMY_SECOND_AREA := "arcana_academy:2"
const MEADOW_PLACES := {
	"meadow_ox": [Vector2i(1, 1), MeadowOx.DISPLAY_NAME],
	"meadow_entrance": [Vector2i(1, 2), "초원 입구", 4],
}
const PLAZA_PLACES := {
	"plaza_fountain": [Vector2i(1, 1), "분수"],
	"plaza_slime": [Vector2i(1, 2), "슬라임"],
}
const FONT = preload("res://fonts/NotoSansKR-SemiBold.tres")
const PLACES := {
	"inn": [Vector2i(0, 0), "여관", 0],
	"academy": [Vector2i(4, 0), "마법학교", 1],
	"home": [Vector2i(3, 1), "내 집"],
	"plaza": [Vector2i(2, 2), "분수 광장", 2],
	"restaurant": [Vector2i(0, 2), "식당", 3],
	"shop": [Vector2i(1, 2), "상점"],
	"river": [Vector2i(2, GRID_SIZE - 1), "남쪽 강", 4],
	"meadow": [Vector2i(4, 4), "뿔소 초원"],
}
const HOME_PLACES := {
	"home_kitchen": [Vector2i(0, 1), "주방", 0],
	"home_bed": [Vector2i(4, 0), "침실"],
	"home_bathroom": [Vector2i(0, 3), "욕실", 1],
	"home_sofa": [Vector2i(4, 3), "거실", 2],
	"home_table": [Vector2i(3, 2), "작업대", 3],
	"home_storage": [Vector2i(4, 2), "보관함"],
	"home_door": [Vector2i(2, 4), "현관", 4],
}
const EXIT_TILE := [Vector2i(2, 4), "출입구", 4]
const INN_PLACES := {
	"inn_window_bench": [Vector2i(2, 1), "창가 벤치", 2],
	"inn_quest_board": [Vector2i(3, 1), "의뢰판"],
	"innkeeper": [Vector2i(4, 2), "접수대", 3],
	"inn_sofa": [Vector2i(1, 3), "소파", 2],
	"inn_armchair": [Vector2i(2, 3), "안락의자", 2],
	"inn_entrance_bench": [Vector2i(4, 4), "입구 벤치", 2],
	"exit": EXIT_TILE,
}
const RESTAURANT_PLACES := {
	"counter": [Vector2i(2, 1), "조리대", 0],
	"restaurant_window_north": [Vector2i(0, 1), "북쪽 창가"],
	"restaurant_window_south": [Vector2i(0, 3), "남쪽 창가"],
	"restaurant_table_four": [Vector2i(4, 2), "4인석"],
	"restaurant_table_shared": [Vector2i(3, 3), "공용 식탁", 3],
	"exit": EXIT_TILE,
}
const ACADEMY_FIRST_PLACES := {
	"academy_stairs": [Vector2i(2, 0), "2층 계단"],
	"practice": [Vector2i(4, 1), "수정 실습실"],
	"library": [Vector2i(0, 2), "도서관"],
	"hall": [Vector2i(2, 2), "중앙 회랑"],
	"classroom": [Vector2i(4, 3), "기초 강의실"],
	"exit": [Vector2i(2, 4), "정문", 4],
}
const ACADEMY_SECOND_PLACES := {
	"headmaster": [Vector2i(0, 1), "교장실"],
	"observatory": [Vector2i(4, 1), "천문 관측탑"],
	"garden": [Vector2i(0, 3), "별빛 정원"],
	"academy_stairs": [Vector2i(2, 4), "1층 계단"],
}
const INTERIOR_PLACES := {
	PLAZA_AREA: PLAZA_PLACES,
	MEADOW_AREA: MEADOW_PLACES,
	"arcana_home": HOME_PLACES,
	"arcana_inn": INN_PLACES,
	"arcana_restaurant": RESTAURANT_PLACES,
	ACADEMY_FIRST_AREA: ACADEMY_FIRST_PLACES,
	ACADEMY_SECOND_AREA: ACADEMY_SECOND_PLACES,
}
const ROOM_AMBER := Color("996c3699")
const ROOM_VIOLET := Color("83649799")
const ROOM_TEAL := Color("4b829199")
const ROOM_GREEN := Color("69875299")
const ROOM_INDIGO := Color("6179a399")
# Optional room metadata marks a named space. Plain floor patches carry no room label.
const HOME_FLOORS := [
	[Rect2(0, 0, 2, 3), Color("f9f2e6"), {"place": "home_kitchen", "border": ROOM_AMBER}],
	[Rect2(3, 0, 2, 2), Color("f3edf5"), {"place": "home_bed", "border": ROOM_VIOLET}],
	[Rect2(0, 3, 2, 2), Color("edf7fa"), {"place": "home_bathroom", "border": ROOM_TEAL}],
	[Rect2(3, 2, 2, 3), Color("faf4e9"), {"place": "home_sofa", "border": ROOM_GREEN}],
	[Rect2(2, 0, 1, 5), Color("f8fafc")],
]
const INTERIOR_FLOORS := {
	PLAZA_AREA: [
		[Rect2(0, 0, 3, 3), Color("f7faf8")],
		[Rect2(1, 0, 1, 3), Color("f4f0e8")],
		[Rect2(0, 1, 3, 1), Color("f4f0e8")],
	],
	MEADOW_AREA: [[Rect2(0, 0, 3, 3), Color("e7f2d7")], [Rect2(1, 2, 1, 1), Color("f3ecd9")]],
	"arcana_home": HOME_FLOORS,
	"arcana_inn": [
		[Rect2(0, 0, 5, 5), Color("fbf7ee"), {"name": "여관 로비", "border": ROOM_VIOLET}],
		[Rect2(0, 2, 3, 2), Color("f1e9ed")],
		[Rect2(4, 1, 1, 2), Color("f4ebdc")],
		[Rect2(2, 4, 1, 1), Color("eaf4f8")],
	],
	"arcana_restaurant": [
		[Rect2(0, 0, 5, 5), Color("fcf7ef"), {"name": "식당 홀", "border": ROOM_AMBER}],
		[Rect2(1, 0, 4, 2), Color("f4e8db")],
		[Rect2(0, 0, 1, 5), Color("eaf5f7")],
		[Rect2(3, 2, 2, 2), Color("faf0e1")],
		[Rect2(2, 4, 1, 1), Color("eaf4f8")],
	],
	ACADEMY_FIRST_AREA: [
		[Rect2(0, 0, 2, 5), Color("f8f0e2"), {"place": "library", "border": ROOM_AMBER}],
		[Rect2(2, 0, 1, 5), Color("f5f8fa"), {"place": "hall", "border": ROOM_TEAL}],
		[Rect2(3, 0, 2, 2), Color("f1ebf5"), {"place": "practice", "border": ROOM_VIOLET}],
		[Rect2(3, 2, 2, 3), Color("f8f0e2"), {"place": "classroom", "border": ROOM_GREEN}],
	],
	ACADEMY_SECOND_AREA: [
		[Rect2(0, 0, 2, 3), Color("f8f0e2"), {"place": "headmaster", "border": ROOM_AMBER}],
		[Rect2(0, 3, 2, 2), Color("edf4eb"), {"place": "garden", "border": ROOM_GREEN}],
		[Rect2(2, 0, 1, 5), Color("f5f8fa")],
		[Rect2(3, 0, 2, 5), Color("eef1f9"), {"place": "observatory", "border": ROOM_INDIGO}],
	],
}
const HOME_WALLS := [
	[Vector2(0, 3), Vector2(2, 3)],
	[Vector2(2, 0), Vector2(2, 1)], [Vector2(2, 2), Vector2(2, 3.5)], [Vector2(2, 4), Vector2(2, 5)],
	[Vector2(3, 0), Vector2(3, 1)], [Vector2(3, 2), Vector2(3, 3)],
	[Vector2(3, 2), Vector2(5, 2)],
]
const INTERIOR_WALLS := {
	"arcana_home": HOME_WALLS,
	ACADEMY_FIRST_AREA: [
		[Vector2(2, 0), Vector2(2, 2)], [Vector2(2, 3), Vector2(2, 5)],
		[Vector2(3, 0), Vector2(3, 1)], [Vector2(3, 2), Vector2(3, 3)],
		[Vector2(3, 4), Vector2(3, 5)], [Vector2(3, 2), Vector2(5, 2)],
	],
	ACADEMY_SECOND_AREA: [
		[Vector2(2, 0), Vector2(2, 1)], [Vector2(2, 2), Vector2(2, 3)],
		[Vector2(2, 4), Vector2(2, 5)], [Vector2(3, 0), Vector2(3, 1)],
		[Vector2(3, 2), Vector2(3, 5)], [Vector2(0, 3), Vector2(2, 3)],
	],
}
const ROADS := [
	[Vector2i(0, 0), Vector2i(4, 0)], [Vector2i(0, 0), Vector2i(0, 2)],
	[Vector2i(2, 0), Vector2i(2, GRID_SIZE - 1)], [Vector2i(0, 2), Vector2i(2, 2)],
	[Vector2i(4, 0), Vector2i(4, 1)], [Vector2i(2, 1), Vector2i(4, 1)],
	[Vector2i(2, 2), Vector2i(4, 2)], [Vector2i(4, 2), Vector2i(4, 4)],
]
const WALK_DIRECTIONS := [Vector2i.UP, Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT]
const PORTRAIT_SIZE := Vector2(32, 32)
const PORTRAIT_Y_OFFSET := 8.0
const ROOM_TITLE_FONT_SIZE := 14
const ROOM_TITLE_SHIFT := 10.0
const INK := Color("192f43")
const SKY := Color("e5f5ff")
const BLUE := Color("247caf")
const GRID := Color("d3dfe7")
var _area := ""
var _current := ""
var _moving_to := ""
var _destinations: Dictionary = {}
var _locked: Dictionary = {}
var _buttons: Dictionary = {}
var _button_contents: Dictionary = {}
var _labels: Dictionary = {}
var _pictures: Dictionary = {}
var _avatar: TextureRect
var _avatar_cell := Vector2.ZERO
var _walk_tween: Tween
var _arrived := false

static func icon(index: int) -> AtlasTexture:
	var image := AtlasTexture.new()
	image.atlas = ICONS
	image.region = Rect2(index * 24, 0, 24, 24)
	image.filter_clip = true
	return image

static func places_for(area: String) -> Dictionary:
	return INTERIOR_PLACES.get(area, PLACES)

static func meadow_destinations(monster_available: bool) -> Dictionary:
	var destinations := {"meadow_entrance": MEADOW_PLACES.meadow_entrance[1]}
	if monster_available:
		destinations["meadow_ox"] = MEADOW_PLACES.meadow_ox[1]
	return destinations

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var focus := StyleBoxFlat.new()
	focus.draw_center = false
	focus.border_color = BLUE
	focus.set_border_width_all(2)
	var all_places := PLACES.duplicate()
	for places: Dictionary in INTERIOR_PLACES.values():
		all_places.merge(places)
	for id: String in all_places:
		var button := Button.new()
		button.flat = true
		button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		button.add_theme_stylebox_override("focus", focus)
		for state: String in ["normal", "pressed", "hover", "disabled"]:
			button.add_theme_stylebox_override(state, StyleBoxEmpty.new())
		button.pressed.connect(func(): place_requested.emit(id))
		add_child(button)
		var center := CenterContainer.new()
		center.mouse_filter = Control.MOUSE_FILTER_IGNORE
		button.add_child(center)
		center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var stack := VBoxContainer.new()
		stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stack.add_theme_constant_override("separation", 1)
		center.add_child(stack)
		var picture := TextureRect.new()
		picture.texture = _place_icon(id, all_places[id])
		picture.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		picture.custom_minimum_size = Vector2(30, 30)
		picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		picture.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stack.add_child(picture)
		var label := Label.new()
		label.add_theme_font_override("font", FONT)
		label.add_theme_font_size_override("font_size", 12)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		stack.add_child(label)
		_buttons[id] = button
		_button_contents[id] = center
		_labels[id] = label
		_pictures[id] = picture
	_avatar = TextureRect.new()
	_avatar.texture = PLAYER_PORTRAIT
	_avatar.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_avatar.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_avatar.size = PORTRAIT_SIZE
	_avatar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_avatar.z_index = 1
	add_child(_avatar)
	resized.connect(_layout_cells)
	_layout_cells()
	_sync_avatar()
	_update_buttons()

func _place_icon(id: String, place: Array) -> Texture2D:
	if id == "plaza_fountain": return icon(PLACES.plaza[2])
	if id == "plaza_slime": return SLIME_FRAMES.get_frame_texture(&"idle", 0)
	if id == "meadow": return MEADOW_ICON
	if id == "meadow_ox": return MeadowOx.pose_texture()
	if id == "meadow_entrance": return icon(4)
	if id == "home": return HOME_ICON
	if id == "home_storage": return STORAGE_ICON
	if id == "shop": return SHOP_ICON
	if id == "home_bed": return icon(0)
	if id == "inn_quest_board": return icon(1)
	if id == "library": return icon(1)
	if id == "academy_stairs": return ACADEMY_STAIRS_DOWN if _area == ACADEMY_SECOND_AREA else ACADEMY_STAIRS_UP
	if ACADEMY_ICONS.has(id): return ACADEMY_ICONS[id]
	if PLACES.has(id): return icon(place[2])
	if place.size() == 2: return icon(3)
	var room := AtlasTexture.new()
	room.atlas = ROOM_ICONS
	room.region = Rect2(place[2] * 24, 0, 24, 24)
	room.filter_clip = true
	return room

func set_state(current: String, destinations: Dictionary, area: String, locked: Dictionary = {}) -> void:
	if _area == area and _current == current and _destinations == destinations and _locked == locked: return
	var area_changed := _area != area
	var moved := area_changed or _current != current
	_area = area
	_current = current
	_destinations = destinations.duplicate()
	_locked = locked.duplicate()
	if area_changed:
		var stairs: TextureRect = _pictures["academy_stairs"]
		stairs.texture = _place_icon("academy_stairs", [])
		_layout_cells()
	if moved or (not _moving_to.is_empty() and (not _destinations.has(_moving_to) or _locked.has(_moving_to))):
		finish_move()
	_update_buttons()

func _update_buttons() -> void:
	var places := places_for(_area)
	for id: String in _buttons:
		var button: Button = _buttons[id]
		button.visible = places.has(id)
		if not button.visible: continue
		var label: Label = _labels[id]
		var picture: TextureRect = _pictures[id]
		label.text = str(_destinations.get(id, places[id][1]))
		label.self_modulate.a = 1.0
		button.disabled = not _destinations.has(id)
		var status := "현재 위치" if id == _current else "이동 중" if id == _moving_to else ""
		if _locked.has(id):
			status = str(_locked[id])
		button.accessibility_name = label.text + (" · " + status if not status.is_empty() else "")
		button.tooltip_text = button.accessibility_name
		button.modulate.a = 0.53 if button.disabled and id != _current else 1.0
		var portrait_here := id == (_moving_to if _arrived else _current)
		picture.self_modulate.a = 0.0 if portrait_here else 1.0
		label.add_theme_color_override("font_color", BLUE if id == _current else INK)
	for floor: Array in INTERIOR_FLOORS.get(_area, []):
		if floor.size() > 2 and floor[2].has("place"):
			# Keep the icon aligned while its text is shown at the edge of the room.
			var label: Label = _labels[floor[2]["place"]]
			label.self_modulate.a = 0.0
	queue_redraw()

## Returns the preview duration, or a negative value when the tile cannot be chosen.
func start_move(target: String) -> float:
	if not _destinations.has(target) or _locked.has(target) or not _moving_to.is_empty():
		return -1.0
	var places := places_for(_area)
	if target == _current or not places.has(_current) or not places.has(target):
		return 0.0
	var path := _route(places[_current][0], places[target][0])
	if path.size() < 2:
		return 0.0
	_moving_to = target
	_arrived = false
	var step_seconds := minf(0.16, 1.05 / (path.size() - 1))
	_walk_tween = create_tween()
	for i in range(1, path.size()):
		_walk_tween.tween_method(_set_avatar_cell, _tile_center(path[i - 1]), _tile_center(path[i]), step_seconds)
	_update_buttons()
	return step_seconds * (path.size() - 1)

func arrive_preview(target: String) -> bool:
	if _moving_to != target:
		return false
	if _walk_tween:
		_walk_tween.kill()
		_walk_tween = null
	_arrived = true
	_sync_avatar()
	_update_buttons()
	return true

func finish_move() -> void:
	var was_moving := not _moving_to.is_empty()
	if _walk_tween:
		_walk_tween.kill()
		_walk_tween = null
	_moving_to = ""
	_arrived = false
	_sync_avatar()
	if was_moving:
		_update_buttons()

func _sync_avatar() -> void:
	var places := places_for(_area)
	var marker := _moving_to if _arrived else _current
	_avatar.visible = places.has(marker)
	if _avatar.visible:
		_set_avatar_cell(_tile_center(places[marker][0]))

func _set_avatar_cell(point: Vector2) -> void:
	_avatar_cell = point
	_position_avatar()

func _position_avatar() -> void:
	if _avatar.visible:
		var center := _avatar_cell * (size.x / _grid_size())
		center.y += _room_title_shift(_avatar_cell) - PORTRAIT_Y_OFFSET
		_avatar.position = (center - PORTRAIT_SIZE * 0.5).round()

func _route(from: Vector2i, to: Vector2i) -> Array[Vector2i]:
	var frontier: Array[Vector2i] = [from]
	var previous: Dictionary = {from: from}
	var limits := Rect2i(Vector2i.ZERO, Vector2i.ONE * _grid_size())
	while not frontier.is_empty() and not previous.has(to):
		var cell: Vector2i = frontier.pop_front()
		for direction: Vector2i in WALK_DIRECTIONS:
			var next := cell + direction
			if limits.has_point(next) and not previous.has(next) and _can_step(cell, next):
				previous[next] = cell
				frontier.push_back(next)
	var path: Array[Vector2i] = []
	if previous.has(to):
		var cell := to
		while cell != from:
			path.push_back(cell)
			cell = previous[cell]
		path.push_back(from)
		path.reverse()
	return path

func _can_step(from: Vector2i, to: Vector2i) -> bool:
	if _area.is_empty():
		for road: Array in ROADS:
			var bounds := Rect2i(road[0], road[1] - road[0] + Vector2i.ONE)
			if bounds.has_point(from) and bounds.has_point(to):
				return true
		return false
	var crossing := (_tile_center(from) + _tile_center(to)) * 0.5
	for wall: Array in INTERIOR_WALLS.get(_area, []):
		var start: Vector2 = wall[0]
		var end: Vector2 = wall[1]
		if from.x != to.x and start.x == end.x and crossing.x == start.x and crossing.y > start.y and crossing.y < end.y:
			return false
		if from.y != to.y and start.y == end.y and crossing.y == start.y and crossing.x > start.x and crossing.x < end.x:
			return false
	return true

func _grid_size() -> int:
	return 3 if _area in [PLAZA_AREA, MEADOW_AREA] else GRID_SIZE

func _tile_center(cell: Vector2i) -> Vector2:
	return Vector2(cell) + Vector2(0.5, 0.5)

func _layout_cells() -> void:
	var side := size.x / _grid_size()
	custom_minimum_size.y = roundf(size.x)
	var places := places_for(_area)
	for id: String in places:
		var button: Button = _buttons[id]
		var tile: Vector2i = places[id][0]
		var cell := _cell_rect(tile, side)
		button.position = cell.position
		button.size = cell.size
		var contents: CenterContainer = _button_contents[id]
		var shift := _room_title_shift(_tile_center(tile))
		contents.offset_top = shift
		contents.offset_bottom = shift
	_position_avatar()
	queue_redraw()

func _room_title_shift(point: Vector2) -> float:
	var shift := 0.0
	for floor: Array in INTERIOR_FLOORS.get(_area, []):
		if floor.size() < 3: continue
		var bounds: Rect2 = floor[0]
		var first_row := Vector2(clampf(point.x, bounds.position.x + 0.5, bounds.end.x - 0.5), bounds.position.y + 0.5)
		shift = maxf(shift, (1.0 - point.distance_to(first_row)) * ROOM_TITLE_SHIFT)
	return shift

func _cell_rect(cell: Vector2i, side: float) -> Rect2:
	return _grid_rect(Rect2(Vector2(cell), Vector2.ONE), side)

func _grid_rect(bounds: Rect2, side: float) -> Rect2:
	var start := (bounds.position * side).round()
	var end := (bounds.end * side).round()
	return Rect2(start, end - start)

func _center(cell: Vector2i, side: float) -> Vector2:
	return (_tile_center(cell) * side).round()

func _draw() -> void:
	var cells := _grid_size()
	var side := size.x / cells
	if side < 1: return
	var extent := roundf(size.x)
	var floors: Array = INTERIOR_FLOORS.get(_area, [])
	for floor: Array in floors:
		draw_rect(_grid_rect(floor[0], side), floor[1])
	for i in range(cells + 1):
		var edge := clampf(roundf(i * side), 0, extent - 1)
		draw_rect(Rect2(edge, 0, 1, extent), GRID)
		draw_rect(Rect2(0, edge, extent, 1), GRID)
	for ends: Array in INTERIOR_WALLS.get(_area, []):
		draw_line((ends[0] * side).round(), (ends[1] * side).round(), Color("9aafbd"), 2.0)
	if _area.is_empty():
		_draw_city_paths(side)
	var places := places_for(_area)
	for id: String in places:
		var cell := _cell_rect(places[id][0], side)
		if id == _current or id == _moving_to:
			draw_rect(cell.grow(-1), SKY if id == _current else Color("f3faff"))
			draw_rect(cell.grow(-1), BLUE if id == _current else Color("91c8ea"), false, 2)
		elif _area.is_empty():
			var cover := Vector2(minf(48, side - 4), minf(46, side - 4))
			draw_rect(Rect2((cell.get_center() - cover * 0.5).round(), cover), Color.WHITE)
		if _locked.has(id):
			var lock_top := Vector2(cell.end.x - 10, cell.position.y + 8)
			draw_arc(lock_top, 2.0, PI, TAU, 8, INK, 1.0, true)
			draw_rect(Rect2(lock_top + Vector2(-3, 0), Vector2(6, 5)), INK)
	for floor: Array in floors:
		if floor.size() > 2:
			_draw_room(_grid_rect(floor[0], side), floor[2], places)

func _draw_room(bounds: Rect2, room: Dictionary, places: Dictionary) -> void:
	if bounds.size.x <= 8.0 or bounds.size.y <= 8.0: return
	draw_rect(bounds.grow(-2.0), room["border"], false, 2.0)
	var title: String = room.get("name", "")
	if room.has("place"):
		var id: String = room["place"]
		title = str(_destinations.get(id, places[id][1]))
	if title.is_empty(): return
	var available_width := bounds.size.x - 8.0
	var text_width := FONT.get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, ROOM_TITLE_FONT_SIZE).x
	var font_size := clampi(floori(ROOM_TITLE_FONT_SIZE * available_width / text_width), 1, ROOM_TITLE_FONT_SIZE)
	draw_string(FONT, bounds.position + Vector2(4, 17), title, HORIZONTAL_ALIGNMENT_LEFT, available_width, font_size, INK)

func _draw_city_paths(side: float) -> void:
	for ends: Array in ROADS:
		var a := _center(ends[0], side)
		var b := _center(ends[1], side)
		draw_dashed_line(a, b, Color("a9bdca"), 1.0, 3.0)
	for col in range(GRID_SIZE):
		if col in [PLACES.river[0].x, PLACES.meadow[0].x]: continue
		var center := _center(Vector2i(col, GRID_SIZE - 1), side)
		for offset in [Vector2(-7, -2), Vector2(7, 3)]:
			var wave: Vector2 = center + offset
			for dx in range(12):
				var dy: int = [1, 1, 0, 0, -1, -1, 0, 0, 1, 1, 0, 0][dx]
				draw_rect(Rect2(wave + Vector2(dx - 6, dy), Vector2.ONE), Color("cfe6f5"))
