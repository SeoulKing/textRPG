extends Node2D

signal interacted(entity: Dictionary)
signal building_entry_intended(entity: Dictionary)
var click_door_id = ""
var door_intent_id = ""
var door_intent_time = 0.0
var entered_door_id = ""
## Contact hook only; future scene transitions must be connected explicitly.
signal entrance_contacted(entrance: Dictionary)
var entrances: Array[Dictionary] = []
var current_entrance: Dictionary = {}
const Pixels = preload("res://scripts/pixel_art.gd")
const Art = preload("res://scripts/art_library.gd")
const Fountain = preload("res://scripts/fountain_spec.gd")
const Shop2D = preload("res://scripts/shop_layout_2d.gd")
var shop_layout: Dictionary = {}
const TILE = 16
const CELLS = Vector2i(72, 90)
const SPAWN = Vector2(576, 500)
# Full input moves three navigation tiles per second.
const WALK_SPEED = TILE * 3.0
var developer_speed_boost = false
const CAMERA_MARGIN = Vector2(16, 24)
var spawn_position = SPAWN
var layout: Node
var player_position = SPAWN
var destination = Vector2.ZERO
var walking = false
var casting = false
const DASH_DISTANCE = 28.0
const DASH_MOVE_TIME = .18
const DASH_POSE_TIME = .28
var dash_age = -1.0
var dash_direction = Vector2.DOWN
var dash_origin = Vector2.ZERO
var dash_target = Vector2.ZERO
var dash_correction = Vector2.ZERO
var dash_lock = 0.0
var last_move_direction = Vector2.DOWN
const TELEPORT_DURATION = .16
var teleport_age = -1.0
var teleport_lock = 0.0
var teleport_direction = Vector2.DOWN
var teleport_origin = Vector2.ZERO
var teleport_target = Vector2.ZERO

func begin_teleport(heading: Vector2) -> void:
	teleport_direction=heading.normalized()
	teleport_origin=player_position
	_move_player(teleport_direction*DASH_DISTANCE)
	teleport_target=player_position
	# Common request origin/endpoint contract; dash animation is never started.
	dash_origin=teleport_origin
	dash_target=teleport_target
	teleport_age=0.0
	teleport_lock=0.0
	casting=false
	path.clear()
	click_door_id=""
	last_move_direction=teleport_direction

func cancel_teleport() -> void:
	teleport_age=-1.0
	teleport_lock=0.0


func dash_heading() -> Vector2:
	var input = touch_direction
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): input.y -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): input.y += 1
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): input.x -= 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): input.x += 1
	if input.length_squared()>.0001:return (input_projection*input).normalized()
	if not path.is_empty() and player_position.distance_squared_to(path[0])>.0001:return (path[0]-player_position).normalized()
	return last_move_direction

func begin_dash(heading: Vector2) -> void:
	dash_direction=heading.normalized()
	dash_origin=player_position
	_move_player(dash_direction*DASH_DISTANCE)
	dash_target=player_position
	player_position=dash_origin
	dash_correction=Vector2.ZERO
	dash_age=.016
	dash_lock=5.0
	casting=false
	path.clear()
	click_door_id=""
	# First displacement happens in this input frame, without a windup.
	_move_player((dash_target-dash_origin)/DASH_MOVE_TIME*.016)

func reconcile_dash(endpoint: Vector2, expected: Vector2) -> void:
	var correction=endpoint-expected
	if dash_age>=0 and dash_age<DASH_MOVE_TIME:dash_correction=correction
	else:_move_player(correction)

func cancel_dash() -> void:
	dash_age=-1.0
	dash_lock=0.0
	dash_correction=Vector2.ZERO

# Local pose only: feet remain on a walkable point, never inside bench collision.
var bench_state = ""
var bench_entity: Dictionary = {}
var bench_age = 0.0
var bench_stalled = 0.0
var bench_wants_stand = false
var bench_destination = Vector2.ZERO
var bench_has_destination = false
const BENCH_SIT_DURATION = .52
const BENCH_STAND_DURATION = .42
var direction = 0
var anim = 0.0
var time = 0.0
var touch_direction = Vector2.ZERO
# Identity keeps the preserved 2D world unchanged; the 3D camera supplies its axes.
var input_projection = Transform2D.IDENTITY
var enabled = true
var indoor = ""
var academy_floor: int = 1
const Academy = preload("res://scripts/academy_interior.gd")
var outside_position = SPAWN
var nearest: Dictionary = {}
var clicked_interaction_id: String = ""
var entities: Array[Dictionary] = []
var obstacles: Array[Rect2] = []
var outside_obstacles: Array[Rect2] = []
var round_obstacles: Array[Dictionary] = []
var outside_round_obstacles: Array[Dictionary] = []
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
var spatial_selected = false
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
var predicted_enemy_damage = 0.0
var impact_remaining = 0.0

func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	ground = TileMapLayer.new()
	ground.z_index = -10
	add_child(ground)
	if layout == null: layout = load("res://scenes/native_2d/plaza.tscn").instantiate()
	layout.normalize_coordinate_frame()
	layout.refresh_plan()
	_make_tiles()
	objects = Node2D.new()
	objects.y_sort_enabled = true
	add_child(objects)
	if layout == null: layout = load("res://scenes/native_2d/plaza.tscn").instantiate()
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

func apply_layout(value: Node, initial: bool = false) -> void:
	clear_bench()
	layout = value
	layout.normalize_coordinate_frame()
	layout.refresh_plan()
	var next_entities: Array[Dictionary] = []
	var next_obstacles: Array[Rect2] = layout.wall_collision_rects()
	var next_round_obstacles: Array[Dictionary] = []
	var seen: Dictionary = {}
	var next_spawn = SPAWN
	var next_home = Vector2(534,536)
	var has_resident = false
	entrances.clear()
	current_entrance = {}
	for entry in layout.placements():
		next_obstacles.append_array(entry.map_collision_parts(layout))
		var entrance = entry.map_entrance(layout)
		if not entrance.is_empty(): entrances.append(entrance)
		var circle = entry.map_round_collision(layout)
		if not circle.is_empty(): next_round_obstacles.append(circle)
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
			var entity = {"id":id,"name":entry.display_name,"kind":entry.interaction_kind,"pos":entry.interaction_position(layout)}
			if entry.interaction_kind=="bench":
				# Bench art is a front-facing billboard; register boots at its foot.
				var origin: Vector2 = entry.map_position(layout)
				entity.pos = origin + Vector2(0,8)
				entity.seat_visual = origin + Vector2(0,.5)
			if entry.interaction_kind=="building":
				var basis = entry.layout_transform(layout).basis
				entity.inward = Vector2(-basis.z.x,-basis.z.z).normalized()
				entity.door_width = maxf(.6,basis.x.length()*.6)*TILE
				entity.interaction_radius = 20.0
				entity.auto_enter = entry.entrance_id.is_empty() or entry.entrance_enabled
			next_entities.append(entity)
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
	outside_round_obstacles = next_round_obstacles.duplicate(true)
	if indoor.is_empty():
		entities = next_entities
		obstacles = next_obstacles
		round_obstacles = next_round_obstacles
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

func _update_entrance_contact() -> void:
	var contact: Dictionary = {}
	if indoor.is_empty():
		for entrance in entrances:
			if entrance.area.has_point(player_position):
				contact = entrance
				break
	var changed = str(contact.get("id","")) != str(current_entrance.get("id",""))
	current_entrance = contact
	if changed and not contact.is_empty(): entrance_contacted.emit(contact.duplicate(true))

func _can_stand(pos: Vector2) -> bool:
	if indoor == "arcana_shop": return Shop2D.can_stand(shop_layout,pos)
	if indoor == "":
		if pos.x < 32 or pos.y < 48 or pos.x > 1110 or pos.y > 1400: return false
		if pos.x > 930 and pos.y > 840 and pos.y < 1200: return false
	else:
		if pos.x < 30 or pos.x > 350 or pos.y < 30 or pos.y > 326: return false
	for rect in obstacles:
		if rect.grow(3).has_point(pos): return false
	for circle in round_obstacles:
		if Fountain.contains_map_point(circle,pos): return false
	return true

func walk_to(pos: Vector2) -> void:
	clicked_interaction_id = ""
	if not enabled: return
	if not bench_state.is_empty():
		if bench_state == "approach": clear_bench()
		else:
			bench_destination = pos
			bench_has_destination = true
			stand_from_bench()
			return
	click_door_id = ""
	if indoor.is_empty():
		for entity in entities:
			if entity.kind!="building" or not entity.get("auto_enter",false): continue
			var delta = pos-entity.pos
			var inward: Vector2 = entity.inward
			var side = Vector2(inward.y,-inward.x)
			if absf(delta.dot(side))<=float(entity.door_width) and delta.dot(inward)>=-6 and delta.dot(inward)<=48:
				click_door_id = entity.id
				pos = entity.pos
				break
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
	if enabled:
		time += delta
		dash_lock=maxf(0,dash_lock-delta)
		teleport_lock=maxf(0,teleport_lock-delta)
	# Blink is already committed locally; its visual must finish during API waits.
	if teleport_age>=0:
		teleport_age+=minf(delta,.05)
		if teleport_age>=TELEPORT_DURATION:teleport_age=-1.0
	for material in motion_materials: material.set_shader_parameter("motion_time",time if effects_enabled and not reduced_motion else 0.0)
	var battle_id = str(battle.get("id",""))
	if battle_id != visual_battle_id:
		visual_battle_id = battle_id
		impact_remaining = 0.0
		enemy_visual_hp = float(battle.get("enemyHp",30))
	impact_remaining = maxf(0,impact_remaining-delta)
	if impact_remaining <= 0: enemy_visual_hp = maxf(0.0,float(battle.get("enemyHp",30))-predicted_enemy_damage)
	var before_motion = player_position
	var motion = touch_direction
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP): motion.y -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN): motion.y += 1
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT): motion.x -= 1
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT): motion.x += 1
	# Project direct input once, after combining touch and keyboard. Path points
	# already use map coordinates and must never pass through this transform.
	var input_strength = minf(motion.length(),1.0)
	motion = (input_projection*motion).normalized()*input_strength
	# Discard long suspension gaps rather than jumping through obstacles on resume.
	var movement_budget = WALK_SPEED * (3.0 if developer_speed_boost else 1.0) * minf(delta, .05)
	if not bench_state.is_empty() and (indoor!=str(bench_entity.get("seat_room","")) or (not battle.is_empty() and (not battle.get("online",false) or battle.get("selfCombat",false)))): clear_bench()
	if enabled:
		if motion.length()>.01:
			if bench_state=="approach": clear_bench()
			elif bench_pose_active():
				bench_has_destination = false
				stand_from_bench()
		advance_bench(minf(delta,.05))
	if not enabled or casting or bench_pose_active() or (teleport_age>=0 and teleport_age<.12):
		motion = Vector2.ZERO
	elif dash_age>=0 and dash_age<DASH_MOVE_TIME:
		dash_age=minf(DASH_MOVE_TIME,dash_age+minf(delta,.05))
		var point=dash_origin.lerp(dash_target,dash_age/DASH_MOVE_TIME)
		_move_player(point-player_position)
		if dash_age>=DASH_MOVE_TIME:
			_move_player(dash_correction)
			dash_correction=Vector2.ZERO
	elif motion.length() > .01:
		clicked_interaction_id = ""
		click_door_id = ""
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
	if enabled and bench_state=="approach":
		if player_position.distance_to(bench_entity.pos)<.5:
			player_position = bench_entity.pos
			path.clear()
			bench_state = "sit"
			bench_age = 0.0
			direction = 0
		else:
			bench_stalled = bench_stalled + delta if player_position.distance_squared_to(before_motion)<.0001 else 0.0
			if path.is_empty() or bench_stalled>.6: clear_bench()
	if enabled and dash_age>=DASH_MOVE_TIME:
		dash_age+=minf(delta,.05)
		if dash_age>=DASH_POSE_TIME:dash_age=-1.0
	var actual_motion = player_position - before_motion
	if actual_motion.length_squared()>.0001:last_move_direction=actual_motion.normalized()
	if actual_motion.length_squared() > .0001:
		if absf(actual_motion.x) > absf(actual_motion.y): direction = 2 if actual_motion.x < 0 else 3
		else: direction = 1 if actual_motion.y < 0 else 0
		anim += delta * 9
	else: anim = 0
	walking = player_position.distance_squared_to(before_motion) > .0001
	_update_door_intent(Vector2.ZERO if bench_pose_active() else motion,delta)
	_update_entrance_contact()
	player.position = (player_position * 2).round() / 2
	var facing = ["south","north","west","east"][direction]
	var traveled = player_position.distance_to(before_motion)
	player_gait = _animate_actor(player,walking,facing,traveled,player_gait)
	if walking and effects_enabled and not reduced_motion:
		footstep_distance += traveled
		if footstep_distance >= 8:
			footstep_distance = fmod(footstep_distance,8)
			footsteps.append({"pos":player_position,"life":.38})
	elif not walking: footstep_distance = 0
	if indoor == "" and traveler_index >= 0 and is_instance_valid(traveler):
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
		if dist < closest and dist < float(entity.get("interaction_radius",34.0)):
			closest = dist
			nearest = entity
	if enabled and not clicked_interaction_id.is_empty():
		for entity in entities:
			if entity.id != clicked_interaction_id: continue
			if player_position.distance_to(entity.pos) < float(entity.get("interaction_radius",34.0)):
				clicked_interaction_id = ""
				path.clear()
				nearest = entity
				interacted.emit(entity)
			elif path.is_empty(): clicked_interaction_id = ""
			break
	if bench_pose_active(): nearest = bench_entity
	for p in footsteps: p.life -= delta if enabled else 0.0
	footsteps = footsteps.filter(func(p): return p.life > 0)
	for p in particles: p.life -= delta
	particles = particles.filter(func(p): return p.life > 0)
	if is_instance_valid(water): water.queue_redraw()
	if is_instance_valid(effects_layer): effects_layer.queue_redraw()
	queue_redraw()

func _update_door_intent(motion: Vector2, delta: float) -> void:
	if not enabled or not indoor.is_empty():
		door_intent_id = ""
		door_intent_time = 0.0
		return
	var candidate: Dictionary = {}
	var still_near_latched = false
	for entity in entities:
		if entity.kind!="building" or not entity.get("auto_enter",false): continue
		var offset = player_position-entity.pos
		if entity.id==entered_door_id and offset.length()<TILE*1.4: still_near_latched = true
		var inward: Vector2 = entity.inward
		var side = Vector2(inward.y,-inward.x)
		# Feet at the door, rather than the broad interaction radius.
		if absf(offset.dot(side))>float(entity.door_width) or offset.dot(inward)<-.5 or offset.dot(inward)>10: continue
		var walking_in = motion.length()>.01 and motion.normalized().dot(inward)>.65
		if walking_in or click_door_id==entity.id:
			candidate = entity
			break
	if not still_near_latched and not entered_door_id.is_empty():
		# Candidate might have been reached before the latched entry in the list.
		for entity in entities:
			if entity.id==entered_door_id and player_position.distance_to(entity.pos)<TILE*1.4: still_near_latched = true
		if not still_near_latched: entered_door_id = ""
	var id = str(candidate.get("id",""))
	if id.is_empty() or id==entered_door_id:
		door_intent_id = ""
		door_intent_time = 0.0
		return
	if id!=door_intent_id:
		door_intent_id = id
		door_intent_time = 0.0
	door_intent_time += minf(delta,.05)
	if door_intent_time>=.12:
		entered_door_id = id
		click_door_id = ""
		door_intent_time = 0.0
		path.clear()
		building_entry_intended.emit(candidate.duplicate())

func _move_player(offset: Vector2) -> void:
	# Keep boosted movement from skipping narrow collision boundaries.
	var steps = maxi(1,int(ceil(offset.length()/3.0)))
	var step = offset/float(steps)
	for i in range(steps):
		var next = player_position + Vector2(step.x,0)
		if _can_stand(next): player_position.x = next.x
		next = player_position + Vector2(0,step.y)
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

func bench_pose_active() -> bool:
	return bench_state in ["sit","seated","stand"]

func clear_bench() -> void:
	if bench_state=="approach": path.clear()
	bench_state = ""
	bench_entity = {}
	bench_age = 0.0
	bench_stalled = 0.0
	bench_wants_stand = false
	bench_has_destination = false

func sit_on_bench(entity: Dictionary) -> bool:
	if not enabled or casting or not battle.is_empty(): return false
	if indoor!=str(entity.get("seat_room","")): return false
	if entity.get("kind","") not in ["bench","inn_sofa"] or not _can_stand(entity.pos): return false
	clear_bench()
	click_door_id = ""
	path = _seat_route(entity.pos)
	if path.is_empty(): return false
	bench_entity = entity.duplicate(true)
	bench_state = "approach"
	return true

# Seat fronts may sit between two solid grid-cell centers (bench and flowerbed).
# Connect a collision-checked final segment instead of routing through either prop.
func _seat_segment_clear(from: Vector2,to: Vector2) -> bool:
	var steps = maxi(1,int(ceil(from.distance_to(to)/2.0)))
	for i in range(steps+1):
		if not _can_stand(from.lerp(to,float(i)/float(steps))): return false
	return true

func _seat_route(to: Vector2) -> PackedVector2Array:
	if _seat_segment_clear(player_position,to): return PackedVector2Array([to])
	var result = PackedVector2Array()
	var best = INF
	var target_cell = Vector2i(to/TILE)
	var from_cell = Vector2i(player_position/TILE)
	for dx in range(-2,3):
		for dy in range(-2,3):
			var cell = target_cell+Vector2i(dx,dy)
			if not grid.is_in_boundsv(cell) or grid.is_point_solid(cell): continue
			var at = Vector2(cell*TILE)+Vector2(8,8)
			if not _seat_segment_clear(at,to): continue
			var route = grid.get_point_path(from_cell,cell)
			if route.is_empty() or not _seat_segment_clear(player_position,route[0]): continue
			var distance = player_position.distance_to(route[0])+at.distance_to(to)
			for i in range(1,route.size()): distance += route[i-1].distance_to(route[i])
			if distance>=best: continue
			best = distance
			result = route
			result.append(to)
	return result

func stand_from_bench() -> void:
	if bench_state=="sit": bench_wants_stand = true
	elif bench_state=="seated":
		bench_state = "stand"
		bench_age = 0.0
	elif bench_state=="approach": clear_bench()

func advance_bench(delta: float) -> void:
	if not bench_pose_active(): return
	bench_age += delta
	if bench_state=="sit" and bench_age>=BENCH_SIT_DURATION:
		bench_state = "seated"
		bench_age = 0.0
		if bench_wants_stand: stand_from_bench()
	elif bench_state=="stand" and bench_age>=BENCH_STAND_DURATION:
		var resume = bench_has_destination
		var destination_after_stand = bench_destination
		clear_bench()
		if resume: walk_to(destination_after_stand)

func bench_visual_position() -> Vector2:
	if not bench_pose_active(): return player_position
	var blend = 1.0
	if bench_state=="sit": blend = clampf(bench_age/BENCH_SIT_DURATION,0,1)
	elif bench_state=="stand": blend = 1.0-clampf(bench_age/BENCH_STAND_DURATION,0,1)
	if reduced_motion: blend = 0.0 if bench_state=="stand" else 1.0
	return player_position.lerp(bench_entity.seat_visual,smoothstep(0,1,blend))

func interact_with(entity: Dictionary) -> void:
	if not enabled or not bench_state.is_empty(): return
	if entity.kind == "building" and entity.get("auto_enter",false):
		walk_to(entity.pos)
		return
	if player_position.distance_to(entity.pos) < float(entity.get("interaction_radius",34.0)):
		clicked_interaction_id = ""
		path.clear()
		nearest = entity
		interacted.emit(entity)
	else:
		walk_to(entity.pos)
		if not path.is_empty(): clicked_interaction_id = str(entity.id)

func interact() -> void:
	if not enabled: return
	if not bench_state.is_empty():
		stand_from_bench()
	elif not nearest.is_empty(): interacted.emit(nearest)

func change_interior(id: String) -> void:
	clicked_interaction_id = ""
	clear_bench()
	if indoor == "": outside_position = player_position
	if id == "arcana_academy" and indoor != id: academy_floor = 1
	indoor = id
	nearest = {}
	touch_direction = Vector2.ZERO
	walking = false
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
	round_obstacles.clear()
	if id == "":
		entities = _outdoor_entities.duplicate(true)
		obstacles = outside_obstacles.duplicate()
		round_obstacles = outside_round_obstacles.duplicate(true)
		player_position = outside_position
	else:
		player_position = Vector2(192, 200)
		entities.append({"id":"exit", "name":"밖으로 나가기", "kind":"exit", "pos":Vector2(192, 308)})
		if id == "arcana_academy":
			entities.clear()
			entities.append_array(Academy.rooms(academy_floor))
			entities.append({"id":"academy_stairs","name":"2층으로 올라가기" if academy_floor == 1 else "1층으로 내려가기","kind":"academy_stairs","pos":Academy.stair_point(academy_floor)})
			if academy_floor == 1:
				entities.append({"id":"exit","name":"밖으로 나가기","kind":"exit","pos":Vector2(192,304)})
			obstacles.append_array(Academy.collision_rects(academy_floor))
			player_position = Vector2(192,260) if academy_floor == 1 else Academy.arrival_point(2)
		elif id == "arcana_shop":
			shop_layout = Shop2D.load_layout()
			if not shop_layout.get("valid",false):
				push_error("Shop TileMap requires one counter, one doorway and floor cells.")
				return
			entities[0].pos = shop_layout.markers.exit
			entities.append({"id":"merchant","name":"상인과 거래하기","kind":"merchant","pos":shop_layout.markers.merchant})
			obstacles.append_array(shop_layout.rectangles)
			player_position = shop_layout.markers.arrival
		elif id == "arcana_inn":
			var lobby = preload("res://scripts/inn_lobby.gd")
			entities[0].pos = lobby.EXIT_POINT
			entities.append({"id":"inn_quest_board", "name":"퀘스트판 살펴보기", "kind":"quest_board", "pos":lobby.QUEST_BOARD_POINT, "interaction_radius":26.0})
			entities.append({"id":"innkeeper", "name":"여관주인과 대화하기", "kind":"innkeeper", "pos":lobby.COUNTER_POINT})
			entities.append({"id":"inn_sofa", "name":"소파에서 쉬기", "kind":"inn_sofa", "pos":lobby.SOFA_POINT, "seat_visual":lobby.SOFA_SEAT_VISUAL, "seat_room":"arcana_inn"})
			obstacles.append_array(lobby.collision_rects())
		else:
			entities.append({"id":"counter", "name":"시설 이용하기", "kind":"scene", "pos":Vector2(192, 148)})
			obstacles.append(Rect2(110, 90, 166, 35))
			_sprite(Pixels.person("9b8571", "b2a383", 0, 0), Vector2(192, 100), true)
	player_position = nearest_walkable(player_position)
	_update_camera(true)
	set_art_state(dusk, effects_enabled)
	_rebuild_grid()

func change_academy_floor(level: int) -> void:
	if indoor != "arcana_academy": return
	academy_floor = clampi(level,1,2)
	change_interior("arcana_academy")
	player_position = nearest_walkable(Academy.arrival_point(academy_floor))
	player.position = player_position
	_update_camera(true)


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
