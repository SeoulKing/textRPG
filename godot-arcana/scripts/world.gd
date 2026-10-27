extends Node2D

signal interacted(entity: Dictionary)
const Pixels = preload("res://scripts/pixel_art.gd")
const Art = preload("res://scripts/art_library.gd")
const TILE = 16
const CELLS = Vector2i(72, 90)
const SPAWN = Vector2(576, 500)
const WALK_SPEED = 84.0
const CAMERA_MARGIN = Vector2(16, 24)
var spawn_position = SPAWN
var layout: Node3D
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
var reduced_motion = false
var motion_materials: Array[ShaderMaterial] = []
var effects_layer: Node2D
var camera_follow = SPAWN
var camera_player_position = SPAWN
var player_gait = 0.0
var traveler_gait = 0.0
var traveler_facing = "south"
var footstep_distance = 0.0
var footsteps: Array[Dictionary] = []
var visual_battle_id = ""
var enemy_visual_hp = 30.0
var impact_remaining = 0.0

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	ground = TileMapLayer.new()
	ground.z_index = -10
	add_child(ground)
	if layout == null: layout = load("res://scenes/plaza.tscn").instantiate()
	layout.refresh_plan()
	_make_tiles()
	objects = Node2D.new()
	objects.y_sort_enabled = true
	add_child(objects)
	if layout == null: layout = load("res://scenes/plaza.tscn").instantiate()
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
	effects_layer = Node2D.new()
	effects_layer.z_index = 5
	effects_layer.draw.connect(_draw_effects)
	add_child(effects_layer)
	if is_instance_valid(water):
		water.position = -Vector2(96,184)
		water.draw.connect(_draw_fountain_water)
	_rebuild_grid()

func _material_at(p: Vector2) -> int:
	return layout.material_at(p)

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
	# Keep foliage and cloth silhouettes intact. Row-wise UV displacement
	# looked like video interference even when the player was standing still.
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
	# The saved 3D scene owns placements. 2D nodes only retain legacy logic/effects.
	for entry in layout.placements():
		var at = entry.map_position(layout)
		var kind = entry.model_kind
		if kind in ["hero","traveler"]: continue
		if not Art.definition(kind).is_empty():
			var sprite = _art(kind,at,false)
			if kind == "fountain" and fountain == null: fountain = sprite
		elif kind == "academy": _sprite(Pixels.building(kind),at)
		elif kind == "portal": _sprite(Pixels.portal(),at)
	if is_instance_valid(fountain):
		var fountain_material = ShaderMaterial.new()
		fountain_material.shader = preload("res://art/resources/fountain.gdshader")
		fountain.material = fountain_material
		motion_materials.append(fountain_material)
		water = Node2D.new()
		fountain.add_child(water)
	traveler = Art.actor(true)
	objects.add_child(traveler)
	apply_layout(layout,true)

func apply_layout(value: Node3D, initial: bool = false) -> void:
	layout = value
	layout.refresh_plan()
	var next_entities: Array[Dictionary] = []
	var next_obstacles: Array[Rect2] = []
	var seen: Dictionary = {}
	var next_spawn = SPAWN
	var next_home = Vector2(534,536)
	var has_resident = false
	for entry in layout.placements():
		var hit = entry.map_collision(layout)
		if hit.has_area(): next_obstacles.append(hit)
		var id = entry.gameplay_id
		if id.is_empty(): continue
		if seen.has(id):
			push_warning("Duplicate layout game ID ignored: "+id)
			continue
		seen[id] = true
		if id == "player_spawn":
			next_spawn = entry.map_position(layout)
		elif id == "resident":
			next_home = entry.map_position(layout)
			has_resident = true
		else:
			next_entities.append({"id":id,"name":entry.display_name,"kind":entry.interaction_kind,"pos":entry.interaction_position(layout)})
	# Regions outside the editable plaza retain their original transition rules.
	next_entities.append({"id":"arcana_city_gate","name":"남문 · 별빛 평원","kind":"gate","pos":Vector2(576,768)})
	next_entities.append({"id":"slime","name":"슬라임의 흔적","kind":"slime","pos":Vector2(600,1054)})
	next_entities.append({"id":"city","name":"도시로 돌아가기","kind":"city","pos":Vector2(576,815)})
	traveler_index = -1
	if has_resident:
		if initial or not next_home.is_equal_approx(traveler_home): traveler_position = next_home
		traveler_home = next_home
		traveler_index = next_entities.size()
		next_entities.append({"id":"resident","name":"여행자","kind":"resident","pos":traveler_position})
	if is_instance_valid(traveler): traveler.visible = has_resident
	var moved_spawn = not next_spawn.is_equal_approx(spawn_position)
	spawn_position = next_spawn
	_outdoor_entities = next_entities.duplicate(true)
	outside_obstacles = next_obstacles.duplicate()
	if indoor.is_empty():
		entities = next_entities
		obstacles = next_obstacles
		path.clear()
		nearest = {}
		if initial or moved_spawn: player_position = spawn_position
		player_position = nearest_walkable(player_position)
		outside_position = player_position
	elif moved_spawn: outside_position = spawn_position
	if not initial:
		if indoor.is_empty(): _make_tiles()
		_rebuild_grid()

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
	var best = spawn_position if indoor == "" else Vector2(192,200)
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

# Movement uses manual collision checks, so update it with the rendered frame.
# This keeps the actor, ground effects and camera on the same clock at 60/120 Hz.
func _process(delta: float) -> void:
	if enabled: time += delta
	for material in motion_materials: material.set_shader_parameter("motion_time",time if effects_enabled and not reduced_motion else 0.0)
	var battle_id = str(battle.get("id",""))
	if battle_id != visual_battle_id:
		visual_battle_id = battle_id
		impact_remaining = 0.0
		enemy_visual_hp = float(battle.get("enemyHp",30))
	impact_remaining = maxf(0,impact_remaining-delta)
	if impact_remaining <= 0: enemy_visual_hp = float(battle.get("enemyHp",30))
	var before_motion = player_position
	var motion = touch_direction
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): motion.y -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): motion.y += 1
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): motion.x -= 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): motion.x += 1
	# Discard long suspension gaps rather than jumping through obstacles on resume.
	var movement_budget = WALK_SPEED * minf(delta, .05)
	if not enabled:
		motion = Vector2.ZERO
	elif motion.length() > .01:
		path.clear()
		_move_player(motion.limit_length() * movement_budget)
	else:
		# Spend the whole frame's distance across path corners. Removing a waypoint
		# must not consume a stationary frame or overshoot at a low frame rate.
		while not path.is_empty() and movement_budget > .0001:
			var diff = path[0] - player_position
			if diff.length() <= .001:
				path.remove_at(0)
				continue
			var step = minf(diff.length(), movement_budget)
			var before_step = player_position
			_move_player(diff.normalized() * step)
			movement_budget -= step
			if player_position.distance_squared_to(before_step) < .000001: break
			if player_position.distance_squared_to(path[0]) <= .000001: path.remove_at(0)
	var actual_motion = player_position - before_motion
	if actual_motion.length_squared() > .0001:
		if absf(actual_motion.x) > absf(actual_motion.y): direction = 2 if actual_motion.x < 0 else 3
		else: direction = 1 if actual_motion.y < 0 else 0
		anim += delta * 9
	else: anim = 0
	walking = player_position.distance_squared_to(before_motion) > .0001
	player.position = (player_position * 2).round() / 2
	var facing = ["south","north","west","east"][direction]
	var traveled = player_position.distance_to(before_motion)
	player_gait = _animate_actor(player,walking,facing,traveled,player_gait)
	if walking and effects_enabled and not reduced_motion:
		footstep_distance += traveled
		if footstep_distance >= 7:
			footstep_distance = fmod(footstep_distance,7)
			footsteps.append({"pos":player_position,"life":.38})
	elif not walking: footstep_distance = 0
	if indoor == "" and is_instance_valid(traveler):
		var phase = fmod(time, 20.0)
		var target = traveler_home + Vector2(20,0) if phase > 9 and phase < 18 else traveler_home
		var before = traveler_position
		if enabled and traveler_position.distance_to(target) > 1:
			var next = traveler_position.move_toward(target,delta*13)
			if _can_stand(next) and next.distance_to(player_position) > 14: traveler_position = next
		var moving = traveler_position.distance_to(before) > .01
		if moving: traveler_facing = "east" if target.x > before.x else "west"
		traveler_gait = _animate_actor(traveler,moving,traveler_facing,traveler_position.distance_to(before),traveler_gait)
		traveler.position = (traveler_position * 2).round() / 2
		if traveler_index >= 0: entities[traveler_index].pos = traveler_position
	_update_camera()
	nearest = {}
	var closest = 34.0
	for entity in entities:
		var dist = player_position.distance_to(entity.pos)
		if dist < closest:
			closest = dist
			nearest = entity
	for p in footsteps: p.life -= delta if enabled else 0.0
	footsteps = footsteps.filter(func(p): return p.life > 0)
	for p in particles: p.life -= delta
	particles = particles.filter(func(p): return p.life > 0)
	if is_instance_valid(water): water.queue_redraw()
	if is_instance_valid(effects_layer): effects_layer.queue_redraw()
	queue_redraw()

func _move_player(offset: Vector2) -> void:
	var next = player_position + Vector2(offset.x, 0)
	if _can_stand(next): player_position.x = next.x
	next = player_position + Vector2(0, offset.y)
	if _can_stand(next): player_position.y = next.y

func _update_camera(reset: bool = false) -> void:
	var visible_size = get_viewport_rect().size / camera.zoom
	# A small central resting area absorbs short steps and direction changes.
	# Outside it, track displacement directly: no catch-up drift after stopping.
	var margin = visible_size * .08
	margin.x = minf(margin.x, CAMERA_MARGIN.x)
	margin.y = minf(margin.y, CAMERA_MARGIN.y)
	margin = (margin * 2).floor() / 2
	if reset or camera_player_position.distance_to(player_position) > 64:
		camera_follow = player_position
	else:
		camera_follow.x = clampf(camera_follow.x, player_position.x - margin.x, player_position.x + margin.x)
		camera_follow.y = clampf(camera_follow.y, player_position.y - margin.y, player_position.y + margin.y)
	camera_player_position = player_position
	var half = visible_size / 2
	var bounds = Vector2(CELLS * TILE) if indoor == "" else Vector2(384, 344)
	camera_follow.x = clampf(camera_follow.x, minf(half.x, bounds.x / 2), maxf(bounds.x / 2, bounds.x - half.x))
	camera_follow.y = clampf(camera_follow.y, minf(half.y, bounds.y / 2), maxf(bounds.y / 2, bounds.y - half.y))
	# Snap the final canvas translation, including the viewport center. Odd
	# screen dimensions otherwise introduce a half-pixel sampling offset.
	var screen_center = get_viewport_rect().size / 2
	camera.position = ((camera_follow * camera.zoom - screen_center).round() + screen_center) / camera.zoom
	camera.force_update_scroll()

func _animate_actor(actor: AnimatedSprite2D, moving: bool, facing: String, distance: float, phase: float) -> float:
	if moving:
		phase += distance * .20
		actor.animation = "walk_" + facing
		actor.pause()
		actor.set_frame_and_progress(int(phase) % actor.sprite_frames.get_frame_count(actor.animation),0.0)
	else:
		actor.play("idle_" + facing)
		actor.speed_scale = 1.0 if enabled and not reduced_motion else 0.0
	return phase

func interact() -> void:
	if enabled and not nearest.is_empty(): interacted.emit(nearest)

func change_interior(id: String) -> void:
	if indoor == "": outside_position = player_position
	indoor = id
	path.clear()
	footsteps.clear()
	particles.clear()
	player_gait = 0.0
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
	_update_camera(true)
	set_art_state(dusk, effects_enabled)
	_rebuild_grid()

func effect(kind: String, amount: String = "") -> void:
	if kind == "fireball":
		visual_battle_id = str(battle.get("id",""))
		impact_remaining = 0.0 if reduced_motion or not effects_enabled else .30
		enemy_visual_hp = minf(30,float(battle.get("enemyHp",30))+float(amount))
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
	for p in footsteps:
		var age = 1.0-p.life/.38
		draw_ellipse(p.pos,Vector2(1+age*3,.5+age),Color(.78,.76,.58,(1-age)*.24))
func draw_ellipse(pos: Vector2, radius: Vector2, color: Color) -> void:
	draw_set_transform(pos, 0, radius)
	draw_circle(Vector2.ZERO, 1, color)
	draw_set_transform(Vector2.ZERO)

func _draw_outdoors() -> void:
	# Native art supplies the plaza's structure and contact shadows.
	# Effects sit on the basin only; disabling them leaves the complete source art.
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
	if battle.get("phase", "") not in ["victory", "defeat"] or impact_remaining > 0:
		draw_ellipse(slime_pos + Vector2(0, 1), Vector2(12, 3), Color(0.12, .28, .22, .4))
		draw_texture(slime_frames[int(time * 2) % 2], slime_pos - Vector2(12, 20))
		if not battle.is_empty():
			var attack_in = float(battle.get("attackIn", 6))
			draw_rect(Rect2(584, 1024, 32, 2), Color("344d48"))
			draw_rect(Rect2(584, 1024, 32 * enemy_visual_hp / 30, 2), Color("c4756c"))
			if attack_in <= 3: draw_rect(Rect2(584,1028,32*clampf(attack_in/3,0,1),1),Color("c7a0ab"))

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

func _draw_fountain_water() -> void:
	if not effects_enabled or reduced_motion or indoor != "": return
	# Child of the fountain, in its original source-pixel coordinates and Y order.
	var tick = int(time*10)
	for side in [-1,1]:
		for i in range(9):
			var t = float((i*7+tick*2)%65)/65.0
			var p = Vector2(96+side*(17+t*3),62+t*65).round()
			water.draw_rect(Rect2(p,Vector2(1,2)),Color("beddd0"))
	for i in range(4):
		var phase = fmod(time*.55+i*.25,1.0)
		var center = Vector2(96+(i%2*2-1)*17,132)
		water.draw_set_transform(center,0,Vector2(1,.32))
		water.draw_arc(Vector2.ZERO,3+phase*17,0,TAU,24,Color(.70,.87,.82,(1-phase)*.55),1)
		water.draw_set_transform(Vector2.ZERO)
	for i in range(7):
		var p = Vector2(52+(i*17)%90,130+(i*7)%20)
		water.draw_rect(Rect2(p+Vector2((tick+i)%5,0),Vector2(2+i%3,1)),Color(.84,.94,.89,.6))

func _draw_effects() -> void:
	if not is_instance_valid(effects_layer): return
	for p in particles:
		var age = 1.0-p.life
		var end = Vector2(600,1040) if indoor == "" else Vector2(192,130)
		if p.kind == "fireball":
			if reduced_motion or not effects_enabled:
				if not p.text.is_empty(): effects_layer.draw_string(world_label_font,end+Vector2(-5,-12),"−"+p.text,HORIZONTAL_ALIGNMENT_LEFT,-1,10,Color(1,.9,.66,p.life))
				continue
			var origin: Vector2 = p.pos-Vector2(0,12)
			var t = minf(1,age/.30)
			var point = origin.lerp(end,t)+Vector2(-sin(t*PI)*10,-sin(t*PI)*14)
			if age < .30:
				for i in range(7):
					var trail = (point-(end-origin).normalized()*i*2).round()
					effects_layer.draw_rect(Rect2(trail,Vector2(4-i/3,3)),Color(1,.52+i*.04,.22,.85-i*.10))
				effects_layer.draw_rect(Rect2(point.round(),Vector2(3,3)),Color("f9e7a6"))
			else:
				var burst = clampf((age-.30)/.45,0,1)
				effects_layer.draw_arc(end,4+burst*18,0,TAU,20,Color(1,.72,.37,(1-burst)*.85),1)
				for i in range(8):
					var offset = Vector2.from_angle(i*TAU/8)*burst*22+Vector2(0,burst*burst*8)
					effects_layer.draw_rect(Rect2((end+offset).round(),Vector2(2,2)),Color(1,.75,.38,1-burst))
				if not p.text.is_empty(): effects_layer.draw_string(world_label_font,end+Vector2(-5,-12-burst*14),"−"+p.text,HORIZONTAL_ALIGNMENT_LEFT,-1,10,Color(1,.9,.66,1-burst))
		elif p.kind == "dodge":
			if reduced_motion or not effects_enabled: continue
			for i in range(3): effects_layer.draw_arc(p.pos,8+age*16+i*3,-PI*.85,-PI*.1,16,Color(.72,.90,.90,p.life*(.6-i*.14)),1)
