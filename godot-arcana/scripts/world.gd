extends Node2D

signal interacted(entity: Dictionary)
const Pixels = preload("res://scripts/pixel_art.gd")
const Art = preload("res://scripts/art_library.gd")
const BREEZE = preload("res://art/resources/breeze.gdshader")
const TILE = 16
const CELLS = Vector2i(72, 90)
const SPAWN = Vector2(576, 500)
var player_position = SPAWN
var destination = Vector2.ZERO
var walking = false
var direction = 0
var anim = 0.0
var time = 0.0
var touch_direction = Vector2.ZERO
var enabled = true
var indoor = ""
var outside_position = SPAWN
var nearest: Dictionary = {}
var entities: Array[Dictionary] = []
var obstacles: Array[Rect2] = []
var outside_obstacles: Array[Rect2] = []
var path: PackedVector2Array = []
var grid = AStarGrid2D.new()
var ground: TileMapLayer
var objects: Node2D
var player: AnimatedSprite2D
var camera: Camera2D
var traveler: AnimatedSprite2D
var traveler_position = Vector2(534, 536)
var traveler_home = Vector2(534, 536)
var traveler_index = -1
var ambient: CanvasModulate
var lanterns: Array[PointLight2D] = []
var dusk = false
var effects_enabled = true
var decals: Node2D
var fountain: Sprite2D
var water: Node2D
var slime_frames: Array[Texture2D] = []
var battle: Dictionary = {}
var particles: Array[Dictionary] = []
var world_label_font = preload("res://fonts/KoPubBatangMedium.ttf")
var _outdoor_entities: Array[Dictionary] = []
var _decor: Node2D
var _indoor_sprites: Array[Node] = []
var _click_marker = Vector2.ZERO

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	ground = TileMapLayer.new()
	ground.z_index = -10
	add_child(ground)
	_make_tiles()
	objects = Node2D.new()
	objects.y_sort_enabled = true
	add_child(objects)
	_build_outdoors()
	_outdoor_entities = entities.duplicate(true)
	outside_obstacles = obstacles.duplicate()
	for f in range(2): slime_frames.append(Pixels.slime(f))
	player = Art.actor()
	objects.add_child(player)
	camera = Camera2D.new()
	camera.position_smoothing_enabled = false
	camera.position = player_position
	camera.zoom = Vector2(2, 2)
	add_child(camera)
	ambient = CanvasModulate.new()
	add_child(ambient)
	set_art_state(false)
	_rebuild_grid()

func _material_at(p: Vector2) -> int:
	# Curved plaza and worn approach paths, sampled at shared tile corners.
	var plaza = Vector2((p.x - 576) / 100.0, (p.y - 472) / 116.0).length() - 1.0
	var north_south = absf(p.x - 576) - 20.0 if p.y > 210 and p.y < 1260 else 999.0
	var crossroad = absf(p.y - 460) - 16.0 if p.x > 419 and p.x < 747 else 999.0
	var inn_path = absf(p.x - 514) - 17.0 if p.y > 454 and p.y < 632 else 999.0
	var academy_path = absf(p.x - 752) - 20.0 if p.y > 238 and p.y < 460 else 999.0
	var edge = minf(minf(north_south, crossroad), minf(inn_path, academy_path))
	if (plaza < 0.0 or edge < 0.0) and p.y < 775: return 2
	# Buffer wider than a cell diagonal prevents grass/stone/dirt meeting in
	# one two-material atlas cell, which would create an abrupt tile edge.
	if plaza < .25 or edge < 24.0: return 1
	return 0

func _make_tiles() -> void:
	ground.tile_set = Art.TERRAIN
	ground.scale = Vector2.ONE * Art.SCALE
	for y in range(CELLS.y):
		for x in range(CELLS.x):
			var materials: Array[int] = []
			for corner in [Vector2(0,0), Vector2(16,0), Vector2(0,16), Vector2(16,16)]:
				materials.append(_material_at(Vector2(x * TILE, y * TILE) + corner))
			var row = 1 if materials.has(0) else 2
			var mask = 0
			for i in range(4):
				if materials[i] >= row: mask |= 1 << i
			var variant = (x % 4) + (y % 4) * 4
			ground.set_cell(Vector2i(x,y), 0, Vector2i(mask,1 + variant * 2 + row - 1))
	decals = Node2D.new()
	decals.z_index = -8
	add_child(decals)

func _sprite(tex: Texture2D, pos: Vector2, indoor_sprite: bool = false) -> Sprite2D:
	var node = Sprite2D.new()
	node.texture = tex
	node.centered = false
	node.position = pos
	node.offset = Vector2(-tex.get_width() / 2.0, -tex.get_height())
	objects.add_child(node)
	if indoor_sprite: _indoor_sprites.append(node)
	return node

func _art(id: String, pos: Vector2, solid: bool = true) -> Sprite2D:
	var definition = Art.definition(id)
	var parent = decals if definition.get("layer", "objects") == "decals" else objects
	var node = Art.place(id, pos, parent)
	var hit: Array = definition.get("collision", [])
	if solid and hit.size() == 4:
		obstacles.append(Rect2(pos + Vector2(hit[0],hit[1]), Vector2(hit[2],hit[3])))
	var animation = str(definition.get("animation", ""))
	if not animation.is_empty():
		var material = ShaderMaterial.new()
		material.shader = BREEZE
		material.set_shader_parameter("cloth", animation == "cloth")
		material.set_shader_parameter("phase", pos.x * .1)
		node.material = material
	return node

func _building(kind: String, pos: Vector2, id: String, title: String) -> void:
	if kind == "academy":
		# Beyond the first art district, keep the existing academy facade.
		var tex = Pixels.building(kind)
		_sprite(tex, pos)
		obstacles.append(Rect2(pos.x - 52, pos.y - 33, 104, 29))
	else: _art(kind, pos)
	entities.append({"id":id, "name":title, "kind":"building", "pos":pos + Vector2(0,9)})

func _lamp(pos: Vector2) -> void:
	_art("lamp-post", pos)
	var lamp = PointLight2D.new()
	lamp.position = pos + Vector2(0,-30)
	lamp.texture = Art.texture("lamp-light")
	lamp.texture_scale = 1.25
	lamp.color = Color("f2cf79")
	lamp.energy = .65
	lamp.shadow_enabled = false
	add_child(lamp)
	lanterns.append(lamp)

func _build_outdoors() -> void:
	# Door anchors are layout data; server location IDs and movement units stay intact.
	_building("shop", Vector2(542, 398), "arcana_shop", "아르카나 상점")
	_building("inn", Vector2(514, 616), "arcana_inn", "푸른 지붕 여관")
	_building("restaurant", Vector2(656, 398), "arcana_restaurant", "광장 식당")
	_building("academy", Vector2(752, 238), "arcana_academy", "아르카나 아카데미")
	fountain = _art("fountain", Vector2(576,458))
	var fountain_material = ShaderMaterial.new()
	fountain_material.shader = preload("res://art/resources/fountain.gdshader")
	fountain.material = fountain_material
	water = Node2D.new()
	fountain.add_child(water)
	_sprite(Pixels.portal(), Vector2(576, 214))
	obstacles.append(Rect2(557, 188, 38, 24))
	entities.append({"id":"arcana_return_portal", "name":"귀환 포탈", "kind":"portal", "pos":Vector2(576,225)})
	entities.append({"id":"arcana_city_gate", "name":"남문 · 별빛 평원", "kind":"gate", "pos":Vector2(576,768)})
	entities.append({"id":"workbench", "name":"비전 작업대", "kind":"workbench", "pos":Vector2(664,515)})
	entities.append({"id":"dungeon", "name":"별빛 회랑", "kind":"dungeon", "pos":Vector2(868,602)})
	entities.append({"id":"slime", "name":"슬라임의 흔적", "kind":"slime", "pos":Vector2(600,1054)})
	entities.append({"id":"city", "name":"도시로 돌아가기", "kind":"city", "pos":Vector2(576,815)})
	# Deliberate little places: bench nook, flower borders, delivery and stall corners.
	for entry in [
		["bench",Vector2(514,498)], ["bench",Vector2(637,498)],
		["flowerbed",Vector2(516,516)], ["flowerbed",Vector2(639,516)],
		["flowerbed",Vector2(528,366)], ["flowerbed",Vector2(623,366)],
		["crate",Vector2(430,450)], ["barrels",Vector2(442,477)],
		["flowerpot",Vector2(556,403)], ["flowerpot",Vector2(671,404)],
		["sign",Vector2(458,451)], ["lantern",Vector2(489,603)],
		["basket",Vector2(716,451)], ["handcart",Vector2(724,476)],
		["workbench",Vector2(664,506)], ["canopy",Vector2(661,553)],
		["pennant",Vector2(545,590)], ["shrub",Vector2(516,575)],
		["oak",Vector2(494,571)], ["birch",Vector2(672,567)],
		["spruce",Vector2(677,667)], ["oak",Vector2(425,333)],
		["birch",Vector2(689,329)], ["shrub",Vector2(620,575)],
		["flowers",Vector2(529,565)], ["flowers",Vector2(622,564)],
		["flowers",Vector2(520,373)], ["flowers",Vector2(635,372)]]:
		_art(entry[0],entry[1])
	for pos in [Vector2(530,398), Vector2(625,398), Vector2(535,564), Vector2(617,564)]: _lamp(pos)
	var rng = RandomNumberGenerator.new()
	rng.seed = 240927
	for i in range(125):
		var pos = Vector2(rng.randi_range(3,68)*16, rng.randi_range(3,86)*16)
		if pos.x > 390 and pos.x < 810 and pos.y > 130 and pos.y < 690: continue
		if absf(pos.x - 576) < 76: continue
		if pos.y > 980 and pos.y < 1090 and pos.x > 250 and pos.x < 900: continue
		if pos.distance_to(Vector2(868,602)) < 70: continue
		_art(["oak","birch","spruce"][i%3],pos)
	traveler = Art.actor(true)
	traveler.position = traveler_position
	objects.add_child(traveler)
	traveler_index = entities.size()
	entities.append({"id":"resident","name":"여행자","kind":"resident","pos":traveler_position})

func set_art_state(evening: bool, effects: bool = true) -> void:
	dusk = evening
	effects_enabled = effects
	if is_instance_valid(ambient): ambient.color = Color("9eabc0") if evening and effects and indoor == "" else Color.WHITE
	for lamp in lanterns: lamp.visible = evening and effects and indoor == ""
	for node in objects.get_children():
		if node is Sprite2D and node.material is ShaderMaterial:
			node.use_parent_material = not effects
	queue_redraw()

func nearest_walkable(point: Vector2) -> Vector2:
	if _can_stand(point): return point
	# Same-place correction; search nearest by actual distance, not loop order.
	var best = SPAWN if indoor == "" else Vector2(192,200)
	var distance = INF
	for y in range(CELLS.y if indoor == "" else 21):
		for x in range(CELLS.x if indoor == "" else 24):
			var at = Vector2(x*TILE+8,y*TILE+8)
			if _can_stand(at) and at.distance_squared_to(point) < distance:
				distance = at.distance_squared_to(point)
				best = at
	return best

func _rebuild_grid() -> void:
	grid.region = Rect2i(Vector2i.ZERO, CELLS)
	grid.cell_size = Vector2(TILE, TILE)
	grid.offset = Vector2(8, 8)
	grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	grid.update()
	for y in range(CELLS.y):
		for x in range(CELLS.x):
			var p = Vector2(x * TILE + 8, y * TILE + 8)
			if not _can_stand(p): grid.set_point_solid(Vector2i(x, y))

func _can_stand(pos: Vector2) -> bool:
	if indoor == "":
		if pos.x < 32 or pos.y < 48 or pos.x > 1110 or pos.y > 1400: return false
		# City walls have one open southern gate.
		if pos.y > 741 and pos.y < 775 and (pos.x < 546 or pos.x > 606): return false
		if pos.x > 930 and pos.y > 840 and pos.y < 1200: return false
	else:
		if pos.x < 30 or pos.x > 350 or pos.y < 30 or pos.y > 326: return false
	for rect in obstacles:
		if rect.grow(3).has_point(pos): return false
	return true

func walk_to(pos: Vector2) -> void:
	if not enabled: return
	var from = Vector2i(player_position / TILE)
	var to = Vector2i(pos / TILE)
	if not grid.is_in_boundsv(to) or grid.is_point_solid(to):
		var found = false
		for radius in range(1, 5):
			for dx in range(-radius, radius + 1):
				for dy in range(-radius, radius + 1):
					var point = to + Vector2i(dx, dy)
					if grid.is_in_boundsv(point) and not grid.is_point_solid(point):
						to = point
						found = true
						break
				if found: break
			if found: break
		if not found: return
	path = grid.get_point_path(from, to)
	if not path.is_empty(): path.remove_at(0)
	_click_marker = pos

func _physics_process(delta: float) -> void:
	time += delta
	var before_motion = player_position
	var motion = touch_direction
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): motion.y -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): motion.y += 1
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): motion.x -= 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): motion.x += 1
	if not enabled: motion = Vector2.ZERO
	elif motion.length() > .01: path.clear()
	elif not path.is_empty():
		var diff = path[0] - player_position
		if diff.length() < 3:
			path.remove_at(0)
		else: motion = diff.normalized()
	walking = motion.length() > .01
	if walking:
		motion = motion.normalized()
		if absf(motion.x) > absf(motion.y): direction = 2 if motion.x < 0 else 3
		else: direction = 1 if motion.y < 0 else 0
		var speed = 84.0
		var next = player_position + Vector2(motion.x * speed * delta, 0)
		if _can_stand(next): player_position.x = next.x
		next = player_position + Vector2(0, motion.y * speed * delta)
		if _can_stand(next): player_position.y = next.y
		anim += delta * 9
	else: anim = 0
	walking = player_position.distance_squared_to(before_motion) > .0001
	player.position = (player_position * 2).round() / 2
	var facing = ["south","north","west","east"][direction]
	player.play(("walk_" if walking else "idle_") + facing)
	player.speed_scale = 1.0 if enabled else 0.0
	if indoor == "" and is_instance_valid(traveler):
		var phase = fmod(time, 20.0)
		var target = traveler_home + Vector2(20,0) if phase > 9 and phase < 18 else traveler_home
		var before = traveler_position
		if enabled and traveler_position.distance_to(target) > 1:
			var next = traveler_position.move_toward(target,delta*13)
			if _can_stand(next) and next.distance_to(player_position) > 14: traveler_position = next
		var moving = traveler_position.distance_to(before) > .01
		traveler.play(("walk_east" if target.x > before.x else "walk_west") if moving else "idle_south")
		traveler.speed_scale = .5 if enabled else 0.0
		traveler.position = (traveler_position * 2).round() / 2
		if traveler_index >= 0: entities[traveler_index].pos = traveler_position
	var camera_target = player_position
	if indoor != "":
		var half = get_viewport_rect().size / camera.zoom / 2
		camera_target.x = clampf(camera_target.x, minf(192, half.x), maxf(192, 384 - half.x))
		camera_target.y = clampf(camera_target.y, minf(172, half.y), maxf(172, 344 - half.y))
	camera.position = (camera_target * 2).round() / 2
	nearest = {}
	var closest = 34.0
	for entity in entities:
		var dist = player_position.distance_to(entity.pos)
		if dist < closest:
			closest = dist
			nearest = entity
	for p in particles: p.life -= delta
	particles = particles.filter(func(p): return p.life > 0)
	queue_redraw()

func interact() -> void:
	if enabled and not nearest.is_empty(): interacted.emit(nearest)

func change_interior(id: String) -> void:
	if indoor == "": outside_position = player_position
	indoor = id
	path.clear()
	for child in _indoor_sprites: child.queue_free()
	_indoor_sprites.clear()
	for child in objects.get_children():
		if child != player: child.visible = id == ""
	ground.visible = id == ""
	decals.visible = id == ""
	entities.clear()
	obstacles.clear()
	if id == "":
		entities = _outdoor_entities.duplicate(true)
		obstacles = outside_obstacles.duplicate()
		player_position = outside_position
	else:
		player_position = Vector2(192, 200)
		entities.append({"id":"exit", "name":"밖으로 나가기", "kind":"exit", "pos":Vector2(192, 308)})
		if id == "arcana_academy":
			var rooms = [{"id":"courtyard", "name":"학교 앞뜰", "pos":Vector2(192, 280)}, {"id":"headmaster", "name":"교장실", "pos":Vector2(75, 82)}, {"id":"library", "name":"도서관", "pos":Vector2(300, 82)}, {"id":"classroom", "name":"기초 강의실", "pos":Vector2(75, 158)}, {"id":"practice", "name":"수정 실습실", "pos":Vector2(300, 158)}, {"id":"garden", "name":"별빛 정원", "pos":Vector2(75, 244)}, {"id":"observatory", "name":"천문 관측탑", "pos":Vector2(300, 244)}, {"id":"hall", "name":"중앙 회랑", "pos":Vector2(192, 126)}]
			for room in rooms:
				entities.append({"id":room.id, "name":room.name, "kind":"academy_room", "pos":room.pos})
				var hair = "c6c4d1" if room.id == "garden" else "7c6457"
				if room.id != "courtyard": _sprite(Pixels.person("8b819c", hair, 0, 0), room.pos - Vector2(0, 14), true)
		elif id == "dungeon":
			entities.append({"id":"dungeon_actions", "name":"탐험 계속하기", "kind":"scene", "pos":Vector2(192, 140)})
		else:
			entities.append({"id":"counter", "name":"시설 이용하기", "kind":"scene", "pos":Vector2(192, 148)})
			obstacles.append(Rect2(110, 90, 166, 35))
			_sprite(Pixels.person("9b8571", "b2a383", 0, 0), Vector2(192, 100), true)
	player_position = nearest_walkable(player_position)
	set_art_state(dusk, effects_enabled)
	_rebuild_grid()

func effect(kind: String, amount: String = "") -> void:
	particles.append({"kind":kind, "text":amount, "life":1.0, "pos":player_position})

func _draw() -> void:
	if not is_instance_valid(player): return
	if indoor == "": _draw_outdoors()
	else: _draw_indoors()
	# Soft ground shadow and a tiny wayfinding ring.
	draw_ellipse(player_position + Vector2(0, 1), Vector2(8, 3), Color(0.10, .20, .19, .35))
	if not path.is_empty():
		draw_arc(path[path.size() - 1], 5, 0, TAU, 12, Color("d3d5a2"), 1)
	if not nearest.is_empty():
		var p: Vector2 = nearest.pos
		draw_line(p + Vector2(-5, 4), p + Vector2(5, 4), Color("f0d7a0"), 1)
		draw_circle(p + Vector2(0, -32 + sin(time * 4) * 2), 2, Color("ead5a0"))
	for p in particles:
		if p.kind == "fireball":
			var t = 1.0 - p.life
			var end = Vector2(600, 1038) if indoor == "" else Vector2(192, 130)
			var point = (p.pos as Vector2).lerp(end, minf(1, t * 2))
			for i in range(6): draw_circle(point - (end - p.pos).normalized() * i * 2, 3 - i * .3, Color(1, .57 + i * .03, .22, .9 - i * .13))
		elif p.kind == "dodge":
			draw_arc(player_position, 11 + (1 - p.life) * 12, 0, TAU, 16, Color(.72, .90, .90, p.life), 1)
		if not p.text.is_empty(): draw_string(world_label_font, player_position + Vector2(-8, -24 - (1 - p.life) * 20), p.text, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, .88, .66, p.life))

func draw_ellipse(pos: Vector2, radius: Vector2, color: Color) -> void:
	draw_set_transform(pos, 0, radius)
	draw_circle(Vector2.ZERO, 1, color)
	draw_set_transform(Vector2.ZERO)

func _draw_outdoors() -> void:
	# Native art supplies the plaza's structure and contact shadows.
	# Effects sit on the basin only; disabling them leaves the complete source art.
	if effects_enabled:
		for i in range(4):
			var p = Vector2(554+i*14,438+int(time*9+i*3)%6)
			draw_line(p,p+Vector2(4,0),Color("d6eee1"),.5)
	# Southern rampart and gate towers.
	for rect in [Rect2(32, 736, 510, 24), Rect2(610, 736, 510, 24)]:
		draw_rect(rect, Color("637975"))
		draw_rect(Rect2(rect.position, Vector2(rect.size.x, 5)), Color("acb6a1"))
		for x in range(int(rect.position.x), int(rect.end.x), 14): draw_rect(Rect2(x, 731, 8, 8), Color("8b9e90"))
	for x in [526, 610]:
		draw_rect(Rect2(x, 708, 17, 49), Color("8c9e92"))
		draw_rect(Rect2(x + 2, 711, 4, 44), Color("b2b9a0"))
		draw_rect(Rect2(x + 5, 702, 9, 17), Color("577c94"))
	# Dungeon arch.
	draw_rect(Rect2(844, 560, 48, 40), Color("5c6d6c"))
	draw_rect(Rect2(852, 568, 32, 32), Color("243a42"))
	draw_rect(Rect2(859, 572, 18, 28), Color("1c303a"))
	for x in [846, 887]: draw_rect(Rect2(x, 574, 3, 9), Color("a3b6d0"))
	# East river with stepped banks and moving glints.
	draw_rect(Rect2(940, 842, 212, 358), Color("457d8b"))
	for i in range(50):
		var p = Vector2(944 + (i * 31) % 204, 848 + (i * 37) % 348)
		draw_rect(Rect2(p + Vector2(int(time * 3 + i) % 6, 0), Vector2(5 + i % 5, 1)), Color("6ca1a4"))
	# The encounter marker is the actual enemy, not a second combat illustration.
	var slime_pos = Vector2(600, 1054)
	if battle.get("phase", "") not in ["victory", "defeat"]:
		draw_ellipse(slime_pos + Vector2(0, 1), Vector2(12, 3), Color(0.12, .28, .22, .4))
		draw_texture(slime_frames[int(time * 2) % 2], slime_pos - Vector2(12, 20))
		if not battle.is_empty():
			var attack_in = float(battle.get("attackIn", 6))
			draw_rect(Rect2(584, 1024, 32, 2), Color("344d48"))
			draw_rect(Rect2(584, 1024, 32 * float(battle.get("enemyHp", 30)) / 30, 2), Color("bdd69c"))
			draw_rect(Rect2(584, 1028, 32 * clampf(attack_in / 6, 0, 1), 1), Color("dcb080"))

func _draw_indoors() -> void:
	draw_rect(Rect2(-500, -500, 1500, 1500), Color("152d32"))
	draw_rect(Rect2(20, 12, 344, 322), Color("5c6962"))
	draw_rect(Rect2(25, 30, 334, 296), Color("b2aa87"))
	for y in range(32, 326, 8):
		for x in range(26, 359, 24):
			draw_rect(Rect2(x + (12 if y % 16 else 0), y, 22, 7), Color("b7b08d" if (x + y) % 3 else "bfb594"))
	draw_rect(Rect2(25, 14, 334, 20), Color("8d9c88"))
	draw_rect(Rect2(25, 14, 334, 3), Color("cad0b0"))
	draw_rect(Rect2(178, 314, 28, 13), Color("536458"))
	if indoor == "arcana_academy":
		draw_rect(Rect2(165, 40, 54, 268), Color("7b8191"))
		for entity in entities:
			if entity.kind != "academy_room": continue
			var pos: Vector2 = entity.pos
			draw_rect(Rect2(pos - Vector2(35, 23), Vector2(70, 39)), Color("798676"))
			draw_rect(Rect2(pos - Vector2(32, 20), Vector2(64, 34)), Color("c4bea0"))
			draw_line(pos - Vector2(20, -3), pos + Vector2(20, 3), Color("9ca18a"), 1)
			draw_string(world_label_font, pos - Vector2(28, 34), entity.name, HORIZONTAL_ALIGNMENT_LEFT, -1, 8, Color("e3dfbf"))
	elif indoor == "dungeon":
		draw_rect(Rect2(26, 34, 332, 280), Color("4b5a60"))
		for x in [70, 300]:
			draw_rect(Rect2(x, 60, 15, 220), Color("536a73"))
			draw_rect(Rect2(x + 4, 65, 3, 200), Color("71868b"))
		draw_circle(Vector2(192, 134), 24, Color("7985a5"))
		draw_circle(Vector2(192, 134), 18, Color("333f60"))
	else:
		draw_rect(Rect2(107, 94, 170, 27), Color("73614c"))
		draw_rect(Rect2(105, 89, 174, 6), Color("a58a60"))
		for x in range(42, 330, 46):
			draw_rect(Rect2(x, 43, 30, 30), Color("75674e"))
			draw_rect(Rect2(x + 2, 46, 26, 2), Color("ad966d"))
			for i in range(4): draw_rect(Rect2(x + 4 + i * 6, 51, 4, 12), Color("7b96a1" if i % 2 else "b1a47e"))
		for pos in [Vector2(70, 200), Vector2(302, 200)]:
			draw_rect(Rect2(pos, Vector2(25, 16)), Color("8c7656"))
			draw_rect(Rect2(pos + Vector2(2, 2), Vector2(21, 3)), Color("ba9f74"))
