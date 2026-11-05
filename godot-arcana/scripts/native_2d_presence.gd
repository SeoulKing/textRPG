extends Node
## Render projections only. Account identity, positions, combat and rewards are server-owned.
const Hero = preload("res://scripts/native_2d_hero.gd")
const Blink = preload("res://scripts/native_2d_blink.gd")
const Motion = preload("res://scripts/network_motion.gd")
const HARD_CORRECTION_DISTANCE: float = 96.0
var input_history: Dictionary = {}
var correction_total := Vector2.ZERO
var correction_remaining := Vector2.ZERO
var reconciled_sequence: int = -1
var server_time: float = -1.0
var received_at: int = 0
var render_time: float = 0.0
var interpolation_delay: float = .12
var jitter: float = 0.0
var enemy_motion = Motion.new()
var enemy_hp: float = -1.0
var correction_count: int = 0
var hard_correction_count: int = 0
var main: Node
var actors: Dictionary = {}
var packet: Dictionary = {}
var revision: int = -1
var character_id: String = ""
var self_name: Label

func _ready() -> void:
	self_name = _label()

func _label() -> Label:
	var label = Label.new()
	label.add_theme_font_size_override("font_size",13)
	label.add_theme_color_override("font_color",Color("f4ecd9"))
	label.add_theme_color_override("font_shadow_color",Color("171c26"))
	label.add_theme_constant_override("shadow_offset_x",1)
	label.add_theme_constant_override("shadow_offset_y",1)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	main.ui.root.add_child(label)
	return label

func reset_prediction() -> void:
	input_history.clear()
	correction_total = Vector2.ZERO
	correction_remaining = Vector2.ZERO
	reconciled_sequence = -1

func reset_stream() -> void:
	reset_prediction()
	revision = -1
	packet = {}
	server_time = -1.0
	received_at = 0
	interpolation_delay = .12
	jitter = 0.0
	enemy_motion.clear()
	enemy_hp = -1.0
	for remote in actors.values(): remote.motion.clear()

func record_input(sequence: int, input: Dictionary) -> void:
	if not input.get("position") is Dictionary: return
	var point: Dictionary = input.position
	input_history[sequence] = {"position":Vector2(float(point.x),float(point.y)),"correction":correction_total,"place":int(input.get("placeRevision",0)),"special":str(input.get("command","")) in ["dodge","teleport"] or main.world.dash_age>=0 or main.world.teleport_age>=0}
	while input_history.size()>128: input_history.erase(input_history.keys()[0])

func reconcile_self(update: Dictionary) -> void:
	var sequence: int = int(update.get("acceptedInput",update.get("sequence",-1)))
	if sequence<=reconciled_sequence: return
	reconciled_sequence = sequence
	var sent: Dictionary = input_history.get(sequence,{})
	for key in input_history.keys():
		if int(key)<=sequence: input_history.erase(key)
	if sent.is_empty() or not update.get("position") is Dictionary: return
	if int(sent.place)!=int(update.get("placeRevision",0)) or bool(sent.special) or main.world.dash_age>=0 or main.world.teleport_age>=0 or not main.world.bench_state.is_empty():
		correction_remaining = Vector2.ZERO
		return
	var point: Dictionary = update.position
	var authoritative := Vector2(float(point.x),float(point.y))
	# Preserve movement after this acknowledged input, excluding corrections already applied.
	var error: Vector2 = authoritative-Vector2(sent.position)-(correction_total-Vector2(sent.correction))
	correction_remaining = error if error.length()>.75 else Vector2.ZERO
	if correction_remaining.is_zero_approx(): return
	correction_count += 1
	if error.length()>HARD_CORRECTION_DISTANCE:
		var before: Vector2 = main.world.player_position
		main.world.player_position = main.world.nearest_walkable(before+error)
		correction_total += main.world.player_position-before
		correction_remaining = Vector2.ZERO
		main.world.path.clear()
		hard_correction_count += 1

func _observe_time(at: float) -> void:
	if at<=server_time: return
	var now: int = Time.get_ticks_msec()
	if server_time<0:
		render_time = at-interpolation_delay
	else:
		var arrival_gap: float = float(now-received_at)/1000.0
		var server_gap: float = at-server_time
		jitter = lerpf(jitter,minf(.2,absf(arrival_gap-server_gap)),.15)
		interpolation_delay = clampf(.1+jitter*2,.1,.22)
		if server_gap>.75: render_time = at-interpolation_delay
	server_time = at
	received_at = now

func enemy_position(fallback: Vector2) -> Vector2:
	var sample: Dictionary = enemy_motion.sample(render_time)
	return sample.get("position",fallback)

func diagnostics() -> Dictionary:
	return {"bufferMs":roundi(interpolation_delay*1000),"jitterMs":roundi(jitter*1000),"corrections":correction_count,"hardCorrections":hard_correction_count,"pendingInputs":input_history.size()}

func accept(value: Dictionary) -> void:
	if int(value.get("revision",-1))<revision: return
	if value.get("playersDelta",false):
		var merged: Dictionary = {}
		for player in packet.get("players",[]): merged[str(player.id)] = player
		for id in value.get("removedPlayers",[]): merged.erase(str(id))
		for player in value.get("players",[]): merged[str(player.id)] = player
		value = value.duplicate(true)
		value.players = merged.values()
		value.playersDelta = false
		value.removedPlayers = []
	var initial: bool = revision < 0
	revision = int(value.get("revision",0))
	packet = value
	_observe_time(float(value.get("elapsedMs",0))/1000.0)
	if value.get("self") is Dictionary:
		var update: Dictionary = value.self
		character_id = str(update.get("characterId",character_id))
		var old_place_revision: int = int(main.snapshot.get("onlinePlaceRevision",0))
		var next_place_revision: int = int(update.get("placeRevision",old_place_revision))
		main.snapshot.onlinePlaceRevision = next_place_revision
		main.snapshot.onlineFighting = update.get("onlineFighting",false)
		main.snapshot.state.merge(update.get("state",{}),true)
		var location = str(main.snapshot.state.get("location",""))
		var expected_interior = location if location in ["arcana_shop","arcana_inn","arcana_restaurant","arcana_academy"] else ""
		if main.world.indoor != expected_interior:
			main._apply(main.snapshot.duplicate(true))
			for player in value.get("players",[]):
				if str(player.get("id","")) == character_id and player.get("position") is Dictionary:
					main.world.player_position = main.world.nearest_walkable(Vector2(float(player.position.x),float(player.position.y)))
					main.world.path.clear()
					break
		if update.get("place") is Dictionary and main.world.indoor=="arcana_academy" and main.world.academy_floor!=int(update.place.floor):
			main.world.change_academy_floor(int(update.place.floor))
		if next_place_revision!=old_place_revision:
			reset_prediction()
			enemy_motion.clear()
		if next_place_revision!=old_place_revision and update.get("position") is Dictionary:
			main.world.player_position = main.world.nearest_walkable(Vector2(float(update.position.x),float(update.position.y)))
			main.world.path.clear()
		main.snapshot.arcanaSpells = update.get("arcanaSpells",main.snapshot.get("arcanaSpells",[]))
		if update.has("fishing"):
			main.snapshot.fishing = update.fishing
			main.fishing.accept(update.fishing)
		main.life.accept_world(value)
		main.world.battle = main._battle().duplicate(true)
		if float(main.world.battle.get("enemyHp",30))<=0: main.world.battle.phase = "victory"
		main.world.enemy_visual_hp = float(main._battle().get("enemyHp",30))
		var combat = main.spatial_combat
		combat.anticipation.observe(main._battle().get("spatial",{}))
		for entry in main._battle().get("spatial",{}).get("events",[]):
			if initial: combat.last_event = maxi(combat.last_event,int(entry.id))
			if int(entry.id)>combat.last_event:
				combat.last_event = int(entry.id)
				combat._event(entry)
				if entry.get("kind","")=="defeat": reset_prediction()
		reconcile_self(update)
		if main._battle().get("spatial") is Dictionary:
			var hp: float = float(main._battle().get("enemyHp",0))
			enemy_motion.push(server_time,{"position":main._battle().spatial.enemy},enemy_hp>=0 and hp>enemy_hp)
			enemy_hp = hp
		else:
			enemy_motion.clear()
		main._update_hud()
		main._refresh_controls()
	var retained: Dictionary = {}
	for player in value.get("players",[]):
		var id: String = str(player.id)
		retained[id] = true
		if id == character_id:
			self_name.text = str(player.name)+" · 나"
			continue
		if not actors.has(id):
			var hero = Hero.new()
			main.world_renderer.add_child(hero)
			var blink = Blink.new()
			main.world_renderer.add_child(blink)
			var guard = main.world_renderer._ring(.65,"ffae46")
			hero.add_child(guard)
			actors[id] = {"hero":hero,"blink":blink,"guard":guard,"movement":int(player.get("movement",{}).get("id",0)) if player.get("movement") is Dictionary else 0,"blink_age":-1.0,"motion":Motion.new(),"label":_label(),"position":Vector2(float(player.position.x),float(player.position.y)),"data":player,"cast":int(player.get("cast",0)),"bench_age":0.0}
		var remote: Dictionary = actors[id]
		if str(remote.data.get("bench","")) != str(player.get("bench","")): remote.bench_age = 0.0
		remote.data = player
		var point := Vector2(float(player.position.x),float(player.position.y))
		var discontinuity: bool = remote.position.distance_to(point)>128
		if player.get("movement") is Dictionary and int(player.movement.id)>int(remote.movement) and player.movement.get("movement","")=="teleport": discontinuity = true
		remote.motion.push(server_time,player,discontinuity)
		if discontinuity: remote.position = point
		if player.get("movement") is Dictionary and int(player.movement.id)>int(remote.movement):
			remote.movement = int(player.movement.id)
			var move_heading = Vector2(float(player.movement.direction.x),float(player.movement.direction.y))
			if player.movement.get("movement","")=="dodge":
				remote.hero.dash_age = 0.0
				remote.hero.dash_yaw = atan2(move_heading.x,move_heading.y)
			else:
				remote.blink_age = 0.0
				remote.position = Vector2(float(player.position.x),float(player.position.y))
		remote.label.text = str(player.name)+("" if player.get("connected",true) else " · 재접속 중")
		if int(player.get("cast",0))>int(remote.cast):
			remote.cast = int(player.cast)
			var heading = Vector2(float(player.direction.x),float(player.direction.y))
			remote.hero.begin_cast(heading)
	for id in actors.keys():
		if not retained.has(id):
			if is_instance_valid(main.world_renderer.shop2d): main.world_renderer.shop2d.remove_remote(str(id))
			actors[id].hero.queue_free()
			actors[id].blink.queue_free()
			actors[id].label.queue_free()
			actors.erase(id)

func _process(delta: float) -> void:
	if main.snapshot.is_empty(): return
	if server_time>=0:
		var age: float = minf(.22,float(Time.get_ticks_msec()-received_at)/1000.0)
		var target: float = minf(server_time,server_time+age-interpolation_delay)
		if target-render_time>.5: render_time = target
		else: render_time = minf(target,render_time+minf(delta,.25)*clampf(1+(target-render_time)*3,.8,1.2)) if target>=render_time else render_time
	if not correction_remaining.is_zero_approx() and main.combat_socket.socket_ready and main.world.dash_age<0 and main.world.teleport_age<0 and main.world.bench_state.is_empty():
		var step: Vector2 = correction_remaining*(1-exp(-minf(delta,.05)*14))
		var before: Vector2 = main.world.player_position
		main.world._move_player(step)
		correction_total += main.world.player_position-before
		correction_remaining -= step
		if correction_remaining.length()<.05: correction_remaining = Vector2.ZERO
	if is_instance_valid(self_name):
		self_name.visible = not main.ui.overlay.visible
		self_name.position = main.spatial_combat._screen(main.world.player_position,2.1)-Vector2(self_name.size.x*.5,0)
	for remote in actors.values():
		var data: Dictionary = remote.data
		var sample: Dictionary = remote.motion.sample(render_time)
		var previous_render_position: Vector2 = remote.position
		remote.position = sample.get("position",remote.position)
		var rendered_motion: Vector2 = Vector2(remote.position)-previous_render_position
		var hero = remote.hero
		var heading: Vector2 = sample.get("direction",Vector2.DOWN)
		hero.set_camera_yaw(main.world_renderer.view_yaw())
		remote.bench_age += delta
		var seat_state: String = str(data.get("bench",""))
		var seat: Dictionary = main.world.furniture_at(remote.position) if seat_state in ["sit","seated","stand"] else {}
		hero.position = main.world_renderer.map_point(main.world.furniture_visual_position(remote.position,seat_state,float(remote.bench_age),seat))
		hero.set_meta("seat_id",str(seat.get("id","")))
		hero.set_meta("seat_sort_y",main.world_renderer.map_point(remote.position).y)
		hero.set_bench_pose(seat_state,float(remote.bench_age),main.world.reduced_motion)
		hero.advance_cast(delta,false)
		if hero.dash_age>=0:
			hero.dash_age += delta
			if hero.dash_age>.3: hero.dash_age = -1
		remote.guard.visible = float(data.get("guard",{}).get("amount",0))>0
		if float(remote.blink_age)>=0:
			remote.blink_age += delta
			if remote.blink_age>.5: remote.blink_age = -1.0
		hero.visible = not Blink.hides_character(float(remote.blink_age),main.world.effects_enabled,main.world.reduced_motion)
		if data.get("movement") is Dictionary and data.movement.get("movement","")=="teleport":
			var move: Dictionary = data.movement
			var from = Vector2(float(move.sourcePosition.x),float(move.sourcePosition.y))
			var to = Vector2(float(move.position.x),float(move.position.y))
			var direction: int = Hero.direction_for_yaw(atan2(to.x-from.x,to.y-from.y),main.world_renderer.view_yaw())
			remote.blink.update_pose(float(remote.blink_age),direction,main.world_renderer.map_point(from),main.world_renderer.map_point(to),main.world.effects_enabled,main.world.reduced_motion)
		hero.pose(main.world.time,float(sample.get("gait",0)),bool(sample.get("walking",false)),rendered_motion,main.world_renderer.pixelated,main.world.effects_enabled,false,heading)
		hero.apply_bench_pose()
		if main.world.indoor == "arcana_shop" and is_instance_valid(main.world_renderer.shop2d):
			main.world_renderer.shop2d.sync_remote(str(data.id),hero,remote.position)
			hero.hide()
		remote.label.position = main.spatial_combat._screen(remote.position,2.1)-Vector2(remote.label.size.x*.5,0)
		remote.label.visible = not main.ui.overlay.visible and main.get_viewport().get_visible_rect().has_point(remote.label.position)

func _exit_tree() -> void:
	for remote in actors.values():
		if is_instance_valid(remote.hero): remote.hero.queue_free()
		if is_instance_valid(remote.blink): remote.blink.queue_free()
		if is_instance_valid(remote.label): remote.label.queue_free()
	if is_instance_valid(self_name): self_name.queue_free()
