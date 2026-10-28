extends Node
## Input prediction and rendering only. All hits, resources and rewards come from the server.
const EnemyHealthOverlay = preload("res://scripts/enemy_health_overlay.gd")
var enemy_health_hud: Control
const FlameVfx = preload("res://scripts/fireball_vfx.gd")
const EffectPool = preload("res://scripts/combat_effect_pool.gd")
var effect_pool: Node
var pending_cast: Dictionary = {}
# One follow-up input bridges the windup without building an endless cast backlog.
var buffered_cast: Dictionary = {}
var dash_pending=false
var charge_vfx: Node3D
var flame_bursts: Array[Node3D] = []
const AimOverlay = preload("res://scripts/spell_aim_overlay.gd")
const CONFIG = preload("res://art/export/combat-layout.json")
var main
var layout: Dictionary = {}
var selected = false
var request_busy = false
var connection_lost = false
var timer = 0.0
var visual_age = 0.0
var last_event = 0
var battle_id = ""
var failed_at = -100.0
var paused_sent = true
var queue: Array[Dictionary] = []
var aim_owner = -1 # touch index, -2 mouse, -3 keyboard
var aim_key = 0
var aim_started = 0.0
var aim_origin = Vector2.ZERO
var aim_pointer = Vector2.ZERO
var aim_direction = Vector2.ZERO
var aim_spell = "fireball"
var manual = false
var aim_overlay: Control
var selected_ring: Node3D
var aim_end_ring: Node3D
var aim_line: MeshInstance3D
var aim_cone: MeshInstance3D
var guard_ring: Node3D
var guard_flash = 0.0
var wave_effects: Array[Dictionary] = []
var jump_line: MeshInstance3D
var projectile_nodes: Dictionary = {}
var visual_outcomes: Dictionary = {}
var transient: Array[Dictionary] = []
var reward_effects: Node
var predicted: Dictionary = {}
var local_shots: Dictionary = {}
var local_shot_sequence = 0
var movement_sequence = 0
var displayed_enemy = Vector2.ZERO
var observed_initial = false

func _ready() -> void:
	effect_pool = EffectPool.new()
	add_child(effect_pool)
	effect_pool.prepare.call_deferred(main.world_renderer,main.world_renderer.hero)
	reward_effects = preload("res://scripts/combat_rewards.gd").new()
	reward_effects.main = main
	add_child(reward_effects)
	layout = CONFIG.data
	enemy_health_hud = EnemyHealthOverlay.new()
	main.ui.root.add_child(enemy_health_hud)
	displayed_enemy = _point(layout.home)
	aim_overlay = AimOverlay.new()
	main.ui.root.add_child(aim_overlay)
	aim_overlay.hide()
	selected_ring = main.world_renderer._ring(.55,"f2cf79")
	main.world_renderer.add_child(selected_ring)
	aim_end_ring = main.world_renderer._ring(.16,"f9c67a")
	main.world_renderer.add_child(aim_end_ring)
	aim_line = _line(Color("f9c67a"))
	aim_cone = _line(Color(1.0,.55,.15,.25))
	aim_cone.material_override.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	aim_cone.material_override.cull_mode = BaseMaterial3D.CULL_DISABLED
	guard_ring = main.world_renderer._ring(.65,"ffae46")
	main.world_renderer.add_child(guard_ring)
	for angle in [0.0,PI*.5]:
		var hoop: Node3D = main.world_renderer._ring(.65,"ffae46")
		hoop.rotation = Vector3(PI*.5,angle,0)
		hoop.position.y = .65
		guard_ring.add_child(hoop)
	jump_line = _line(Color("ad63d9"))
	jump_line.hide()

func _point(value: Dictionary) -> Vector2:
	return Vector2(float(value.get("x",0)),float(value.get("y",0)))

func _json(point: Vector2) -> Dictionary:
	return {"x":point.x,"y":point.y}

func _battle() -> Dictionary:
	return main._battle()

func _spatial() -> Dictionary:
	return _battle().get("spatial",{})

func available() -> bool:
	return not main.snapshot.is_empty() and main.world.indoor.is_empty() and main._state().get("flags",{}).get("in_magic_world",false) and (not _spatial().is_empty() or (main._state().get("location","") == "arcana_plaza" and _battle().is_empty()))

func enemy_position() -> Vector2:
	return _point(_spatial().get("enemy",layout.home))

func _screen(point: Vector2, height: float = 0.0) -> Vector2:
	var camera: Camera3D = main.world_renderer.camera
	var rendered = camera.unproject_position(main.world_renderer.map_point(point,height))
	var local = rendered*main.viewport_host.size/Vector2(main.viewport.size)
	return main.viewport_host.get_global_transform()*local

func _world(point: Vector2) -> Vector2:
	var local = main.viewport_host.get_global_transform().affine_inverse()*point
	return main.world_renderer.pick(local*Vector2(main.viewport.size)/main.viewport_host.size)

func visible_enemy() -> bool:
	var point = _screen(enemy_position(),.5)
	return Rect2(Vector2.ZERO,main.get_viewport().get_visible_rect().size).has_point(point) and _battle().get("phase","") not in ["victory","defeat"]

func select_at(point: Vector2) -> bool:
	if not available() or not visible_enemy() or main.ui.overlay.visible: return false
	for button in main.ui.touch_buttons:
		if button.is_visible_in_tree() and button.get_global_rect().has_point(point): return false
	var foot = _screen(enemy_position())
	var top = _screen(enemy_position(),1.25)
	var width = maxf(18,absf(foot.y-top.y)*.55)
	if Rect2(Vector2(minf(top.x,foot.x)-width,minf(top.y,foot.y)-5),Vector2(width*2,absf(foot.y-top.y)+10)).has_point(point):
		selected = true
		main.world.path.clear()
		return true
	return false

func can_cast(command: String = "fireball") -> bool:
	if effect_pool == null or not effect_pool.prepared: return false
	var spell: Dictionary = main._spell(command)
	return (command=="fireball" or (main.world.teleport_age<0 and main.world.dash_age<0)) and main.world.bench_state.is_empty() and not spell.is_empty() and spell.get("unlocked",false) and spell.get("equipped",false) and available() and _battle().get("phase","") not in ["victory","defeat"] and _spatial().get("behavior","") != "return" and float(main._combat().get("mp",0))>=float(spell.cost) and float(main._combat().get("cooldowns",{}).get(command,0))<=.01

func _begin(owner: int, point: Vector2, key: int = 0, command: String = "fireball") -> void:
	if not can_cast(command) or main.busy or main.ui.overlay.visible: return
	aim_spell = command
	aim_owner = owner
	aim_key = key
	aim_origin = point
	aim_pointer = point
	aim_started = Time.get_ticks_msec()/1000.0
	manual = false
	aim_direction = (enemy_position()-main.world.player_position).normalized()
	aim_overlay.origin = point
	var screen_size = main.get_viewport().get_visible_rect().size
	aim_overlay.cancel_center = Vector2(clampf(point.x,42,screen_size.x-42),clampf(point.y-120,48,screen_size.y-100))
	main._clear_zoom_touches()

func cancel_aim() -> void:
	aim_owner = -1
	manual = false
	main.world_renderer.hero.aim_facing = Vector2.ZERO
	if is_instance_valid(aim_overlay): aim_overlay.hide()
	predicted = {} if not request_busy else predicted

func _update_aim_direction() -> void:
	if not manual: return
	if aim_owner == -3:
		aim_pointer = main.get_viewport().get_mouse_position()
		aim_direction = (_world(aim_pointer)-main.world.player_position).normalized()
	elif aim_pointer.distance_to(aim_origin)>=12:
		aim_direction = (_world(aim_origin+(aim_pointer-aim_origin).limit_length(80))-_world(aim_origin)).normalized()

func _finish(cancelled: bool = false) -> void:
	if aim_owner == -1: return
	manual = manual or Time.get_ticks_msec()/1000.0-aim_started>=.2 or aim_pointer.distance_to(aim_origin)>=12
	_update_aim_direction()
	var direct = manual
	var direction = aim_direction
	var command = aim_spell
	var abort = cancelled or (direct and aim_pointer.distance_to(aim_overlay.cancel_center)<=40)
	cancel_aim()
	if abort: return
	if not direct:
		direction = _auto_direction(command)
	queue_command(command,direction)

func _spell_range(command: String) -> float:
	return float(main._spell(command).get("rangeTiles",6))*float(layout.tuning.tile)

func cast_auto(command: String = "fireball") -> void:
	if not can_cast(command): return
	queue_command(command,_auto_direction(command))

func _auto_direction(command: String) -> Vector2:
	if visible_enemy() and main.world.player_position.distance_to(enemy_position())<=_spell_range(command)+float(layout.tuning.enemyRadius):
		selected = true
		return (enemy_position()-main.world.player_position).normalized()
	var yaw = main.world_renderer.hero.last_yaw
	return Vector2(sin(yaw),cos(yaw))

func can_dash(command: String = "dodge") -> bool:
	# Blink input depends on the local scene, never on an acknowledgement,
	# cooldown snapshot, or the preceding blink's visual age.
	if command == "teleport":
		return not main.snapshot.is_empty() and not main.gate_crossing and not main.ui.overlay.visible and main.world.bench_state.is_empty() and main.page_active and _battle().get("phase","") != "defeat"
	return not main.snapshot.is_empty() and main.world.enabled and not main.busy and not main.ui.overlay.visible and main.world.bench_state.is_empty() and (command=="teleport" or (not dash_pending and main.world.teleport_age<0 and main.world.dash_age<0)) and float(main.world.teleport_lock if command=="teleport" else main.world.dash_lock)<=.01 and float(main._combat().get("cooldowns",{}).get(command,0))<=.01 and _battle().get("phase","") not in ["victory","defeat"] and main.page_active

func start_dash(command: String = "dodge") -> void:
	if not can_dash(command):return
	var heading: Vector2=main.world.dash_heading()
	_cancel_pending_cast()
	cancel_aim()
	main.world_renderer.hero.cancel_cast()
	if command=="teleport":main.world.begin_teleport(heading)
	else:main.world.begin_dash(heading)
	movement_sequence += 1
	dash_pending=true
	if available():
		queue.append({"command":command,"direction":heading,"origin":main.world.dash_origin,"endpoint":main.world.dash_target,"movementSequence":movement_sequence})
	else:
		_standard_dash(command)

func _standard_dash(command: String) -> void:
	var sent_movement_sequence = movement_sequence
	var action={"type":"arcana_combat","command":command}
	if not _battle().is_empty():action.battleId=_battle().id
	var data: Dictionary=await main._api("/api/games/"+main.game_id+"/actions",HTTPClient.METHOD_POST,action)
	if sent_movement_sequence == movement_sequence: dash_pending=false
	if data.has("state"):
		if sent_movement_sequence == movement_sequence: main._apply(data)
	elif sent_movement_sequence == movement_sequence:
		if command == "dodge": main.world.cancel_dash()
		main.ui.toast(data.get("message","대시를 사용할 수 없습니다."))

func queue_command(command: String, direction: Vector2 = Vector2.ZERO) -> void:
	if command in ["dodge","teleport"]:
		start_dash(command)
		return
	if not available() or main.busy or main.ui.overlay.visible or not main.world.bench_state.is_empty(): return
	if not main._spell(command).is_empty() and not can_cast(command): return
	for pending in queue:
		if command != "fireball" and pending.command == command: return
	if command == "fireball":
		direction = direction.normalized() if direction.length_squared()>.00001 else _auto_direction(command)
		if not pending_cast.is_empty():
			buffered_cast = {"direction":direction}
		else:
			_start_fireball(direction)
		return
	queue.append({"command":command,"direction":direction})

func _start_fireball(direction: Vector2) -> void:
	pending_cast = {"direction":direction,"elapsed":0.0}
	main.world_renderer.hero.begin_cast(direction)
	main.world.casting = true
	charge_vfx = effect_pool.charge

func _cancel_pending_cast() -> void:
	buffered_cast.clear()
	if pending_cast.is_empty(): return
	pending_cast.clear()
	main.world.casting = false
	main.world_renderer.hero.cancel_cast()
	if is_instance_valid(charge_vfx): charge_vfx.hide()

func _update_cast(delta: float, active: bool, paused: bool) -> void:
	var hero = main.world_renderer.hero
	if not active or (paused and not pending_cast.is_empty()): _cancel_pending_cast()
	hero.advance_cast(delta,paused)
	if not pending_cast.is_empty():
		if not paused: pending_cast.elapsed += delta
		# Hold the gathering pose until the local release time.
		hero.cast_age = minf(float(pending_cast.elapsed),hero.CAST_GATHER-.001)
	if is_instance_valid(charge_vfx):
		charge_vfx.enabled = main.world.effects_enabled
		charge_vfx.visible = active and main.world.effects_enabled and hero.cast_age>=0 and hero.cast_age<.464
		var heading = Vector2(sin(hero.cast_yaw),cos(hero.cast_yaw))
		charge_vfx.position = main.world_renderer.map_point(main.world.player_position+heading*7.0,1.25)
		charge_vfx.update_charge(maxf(0,hero.cast_age),main.world.reduced_motion)

func _aim_slot(point: Vector2) -> String:
	for i in range(main.ui.quickslot_buttons.size()):
		if main.ui.quickslot_bindings[i] in ["fireball","flame_wave"] and main.ui.quickslot_buttons[i].get_global_rect().has_point(point): return main.ui.quickslot_bindings[i]
	return ""

func _input(event: InputEvent) -> void:
	if not available(): return
	if aim_owner != -1 and ((event is InputEventKey and event.pressed and event.physical_keycode == KEY_ESCAPE) or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT)):
		cancel_aim()
		get_viewport().set_input_as_handled()
		return
	if main.ui.overlay.visible or main.busy or not main.page_active:
		cancel_aim()
		return
	var handled = false
	if event is InputEventKey and not event.echo:
		var keys = [KEY_1,KEY_2,KEY_3,KEY_4]
		if event.physical_keycode in keys and main.ui.quickslot_bindings[keys.find(event.physical_keycode)] in ["fireball","flame_wave"]:
			if event.pressed and aim_owner == -1: _begin(-3,main.get_viewport().get_mouse_position(),event.physical_keycode,main.ui.quickslot_bindings[keys.find(event.physical_keycode)])
			elif not event.pressed and aim_owner == -3 and aim_key == event.physical_keycode: _finish()
			handled = true
	elif event is InputEventScreenTouch:
		var command = _aim_slot(event.position)
		if event.pressed and not event.canceled and aim_owner == -1 and not command.is_empty():
			_begin(event.index,event.position,0,command)
			handled = true
		elif event.index == aim_owner:
			aim_pointer = event.position
			if not event.pressed or event.canceled: _finish(event.canceled)
			handled = true
	elif event is InputEventScreenDrag and event.index == aim_owner:
		aim_pointer = event.position
		manual = manual or aim_pointer.distance_to(aim_origin)>=12
		handled = true
	elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION and event.button_index == MOUSE_BUTTON_LEFT:
		var command = _aim_slot(event.position)
		if event.pressed and aim_owner == -1 and not command.is_empty():
			_begin(-2,event.position,0,command)
			handled = true
		elif not event.pressed and aim_owner == -2:
			aim_pointer = event.position
			_finish()
			handled = true
	elif event is InputEventMouseMotion and aim_owner in [-2,-3]:
		aim_pointer = event.position
		manual = manual or (aim_owner == -2 and aim_pointer.distance_to(aim_origin)>=12)
		handled = aim_owner == -2
	if not handled and aim_owner == -1:
		if event is InputEventScreenTouch and event.pressed and not event.canceled: handled = select_at(event.position)
		elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION: handled = select_at(event.position)
	if handled: get_viewport().set_input_as_handled()

func _process(delta: float) -> void:
	if not is_instance_valid(main.ui): return
	visual_age += delta
	var active = available()
	if _spatial().is_empty() and local_shots.is_empty() and predicted.is_empty() and not request_busy:
		visual_outcomes.clear()
		main.world.predicted_enemy_damage = 0.0
	if not observed_initial and not main.snapshot.is_empty():
		observed_initial = true
		battle_id = str(_battle().get("id",""))
		for event in _spatial().get("events",[]): last_event = maxi(last_event,int(event.id))
		if not _spatial().is_empty() and _battle().get("phase","") in ["victory","defeat"]:
			_restore_result_panel.call_deferred()
	var paused = not main.page_active or main.ui.overlay.visible or main.busy
	_update_cast(delta,active,paused)
	if not active or paused:
		cancel_aim()
		_clear_queued_commands(active and main.page_active and not main.ui.overlay.visible)
	if aim_owner != -1:
		manual = manual or Time.get_ticks_msec()/1000.0-aim_started>=.2
		if manual:
			_update_aim_direction()
			main.world_renderer.hero.aim_facing = aim_direction
			aim_overlay.pointer = aim_pointer
			aim_overlay.cancelled = aim_pointer.distance_to(aim_overlay.cancel_center)<=40
			aim_overlay.show()
			aim_overlay.queue_redraw()
	if active and not _spatial().is_empty():
		if not paused and not _battle().get("paused",true):
			for key in ["fireball","flame_wave","flame_guard","dodge","teleport","potion"]:
				main._combat().cooldowns[key] = maxf(0,float(main._combat().cooldowns.get(key,0))-delta)
			main.world.battle.attackIn = maxf(0,float(main.world.battle.get("attackIn",6))-delta)
		timer += delta
	# The animation windup is local and never waits for an HTTP response.
	if active and not pending_cast.is_empty() and float(pending_cast.elapsed)>=.32 and not paused:
		var direction: Vector2 = pending_cast.direction
		pending_cast.clear()
		main.world.casting = false
		if can_cast("fireball"):
			main.world_renderer.hero.cast_age = .32
			local_shot_sequence += 1
			var shot_id = "local_"+str(local_shot_sequence)
			var origin: Vector2 = main.world.player_position
			local_shots[shot_id] = {"position":origin,"direction":direction,"elapsed":0.0}
			queue.append({"command":"fireball","direction":direction,"origin":origin,"shotId":shot_id})
		else:
			main.world_renderer.hero.cancel_cast()
		if not buffered_cast.is_empty():
			var next_direction: Vector2 = buffered_cast.direction
			buffered_cast.clear()
			if can_cast("fireball"): _start_fireball(next_direction)
	if active and not request_busy and not main.clock_busy and not main.busy and Time.get_ticks_msec()/1000.0-failed_at>2:
		if not queue.is_empty() and not paused:
			var command = queue.pop_front()
			_request(command.command,false,command.direction,command.get("origin",Vector2.INF),command.get("endpoint",Vector2.INF),command.get("shotId",""),int(command.get("movementSequence",0)))
		elif _battle().get("phase","") not in ["victory","defeat"] and (not _spatial().is_empty() or connection_lost) and ((paused != paused_sent) or (not paused and timer>=.1) or connection_lost):
			_request("spatial_sync",paused or connection_lost)
	_render(delta,active,paused)

func _restore_result_panel() -> void:
	if _battle().get("phase","") == "defeat" and not main.busy:
		main._scene()

func _clear_queued_commands(keep_teleports: bool = false) -> void:
	_cancel_pending_cast()
	var retained: Array[Dictionary] = []
	for pending in queue:
		if keep_teleports and pending.command == "teleport":
			retained.append(pending)
			continue
		var shot_id = str(pending.get("shotId",""))
		local_shots.erase(shot_id)
		visual_outcomes.erase(shot_id)
		if pending.command in ["dodge","teleport"]:
			dash_pending=false
			main.world.cancel_dash()
			main.world.cancel_teleport()
	queue.assign(retained)
	if not retained.is_empty(): dash_pending = true

func before_action() -> void:
	cancel_aim()
	_cancel_pending_cast()
	_clear_queued_commands()
	while request_busy: await get_tree().process_frame
	if not _spatial().is_empty(): await _request("spatial_sync",true)

func _request(command: String, paused: bool, direction: Vector2 = Vector2.ZERO, dash_origin: Vector2 = Vector2.INF, dash_endpoint: Vector2 = Vector2.INF, shot_id: String = "", move_sequence: int = 0) -> void:
	request_busy = true
	timer = 0
	main.sequence += 1
	var sent_position: Vector2 = dash_origin if dash_origin != Vector2.INF else main.world.player_position
	var input = {"encounterId":"plaza_slime","clientId":main.client_id,"sequence":main.sequence,"position":_json(sent_position),"paused":paused,"developerSpeed":main.developer_tools and main.world.developer_speed_boost}
	if command in ["fireball","flame_wave","dodge","teleport"]:
		input.aim = _json(direction)
	if command == "fireball" and shot_id.is_empty():
		predicted = {"position":sent_position,"direction":direction,"elapsed":0.0}
	var action = {"type":"arcana_combat","command":command,"spatial":input}
	if not _battle().is_empty(): action.battleId = _battle().id
	var data: Dictionary = await main._api("/api/games/"+main.game_id+"/actions",HTTPClient.METHOD_POST,action)
	predicted = {}
	if data.has("spatialCombat"):
		connection_lost = false
		var previous_phase = str(_battle().get("phase",""))
		var previous_spells: Array = main._unlocked_spell_ids()
		main.snapshot.state.merge(data.state,true)
		main.snapshot.arcanaSpells = data.get("arcanaSpells",main.snapshot.get("arcanaSpells",[]))
		main._notify_spell_unlocks(previous_spells)
		main.snapshot.availableActions = data.get("availableActions",[])
		if data.get("currentScene") is Dictionary: main.snapshot.currentScene = data.currentScene
		main.world.battle = _battle().duplicate(true)
		main.world.enemy_visual_hp = float(_battle().get("enemyHp",30))
		main.world.impact_remaining = 0
		main.previous_enemy_hp = main.world.enemy_visual_hp
		main._update_hud()
		main._refresh_controls()
		visual_age = 0
		paused_sent = paused
		main.last_clock_paused = paused
		main.heartbeat = 0
		if command == "fireball":
			var cast_id = ""
			for event in _spatial().get("events",[]):
				if event.kind == "cast": cast_id = str(event.get("projectileId",""))
			local_shots.erase(shot_id)
			if not cast_id.is_empty() and not shot_id.is_empty():
				if visual_outcomes.has(shot_id):
					visual_outcomes[cast_id] = visual_outcomes[shot_id]
					visual_outcomes.erase(shot_id)
				if projectile_nodes.has(shot_id):
					projectile_nodes[cast_id] = projectile_nodes[shot_id]
					projectile_nodes.erase(shot_id)
		var id = str(_battle().get("id",""))
		var preserve_first_shot = previous_phase.is_empty() and command == "fireball"
		if id != battle_id:
			battle_id = id
			last_event = 0
			if not preserve_first_shot:
				visual_outcomes.clear()
				for effect in transient: effect_pool.release_label(effect.node)
				transient.clear()
				for burst in flame_bursts: effect_pool.release_flame(burst)
				flame_bursts.clear()
		if not _spatial().is_empty():
			var server_position = _point(_spatial().player)
			if command in ["dodge","teleport"]:
				if move_sequence == movement_sequence: main.world.reconcile_dash(server_position,dash_endpoint)
			elif not dash_pending and main.world.teleport_age<0 and main.world.dash_age<0 and server_position.distance_to(sent_position)>2:
				main.world.player_position = main.world.nearest_walkable(server_position+(main.world.player_position-sent_position))
			for event in _spatial().get("events",[]):
				if int(event.id)<=last_event: continue
				last_event = int(event.id)
				_event(event)
		if command in ["dodge","teleport"] and move_sequence == movement_sequence:dash_pending=false
		_update_predicted_health()
		if previous_phase != _battle().get("phase","") and _battle().get("phase","") in ["victory","defeat"]:
			_clear_queued_commands()
			cancel_aim()
			if _battle().get("phase","")=="victory":
				# Rewards were granted on defeat of the enemy; finish only acknowledges.
				var result: Dictionary = await main._api("/api/games/"+main.game_id+"/actions",HTTPClient.METHOD_POST,{"type":"arcana_combat","command":"finish","battleId":_battle().id})
				if result.has("state"): main._apply(result)
				else: main.ui.toast(result.get("message","전투 종료를 확인하지 못했습니다."))
				selected = false
			else:
				var result: Dictionary = await main._api("/api/games/"+main.game_id+"/state")
				if result.has("state"): main._apply(result)
				main._scene()
		elif command == "finish":
			var result: Dictionary = await main._api("/api/games/"+main.game_id+"/state")
			if result.has("state"): main._apply(result)
	elif data.has("error"):
		local_shots.erase(shot_id)
		visual_outcomes.erase(shot_id)
		if command in ["dodge","teleport"] and move_sequence == movement_sequence:
			dash_pending=false
			if command == "dodge":
				main.world.cancel_dash()
				if not _spatial().is_empty():main.world.player_position=main.world.nearest_walkable(_point(_spatial().player))
			# A failed acknowledgement must not rewind a locally completed blink.
			# The next position sync reconciles it with the server.
		if command == "fireball" and pending_cast.is_empty(): main.world_renderer.hero.cancel_cast()
		visual_outcomes.erase("predicted")
		_update_predicted_health()
		if data.get("error","") in ["network","invalid_response"]:
			failed_at = Time.get_ticks_msec()/1000.0
			connection_lost = true
		main.ui.toast(data.get("message","전투 연결을 확인해 주세요."))
		# This response belongs to the failed request, not to newer local inputs.
		# Keep later commands queued so a delayed failure cannot eat blink taps.
	request_busy = false

func _update_predicted_health() -> void:
	var pending = 0.0
	for outcome in visual_outcomes.values():
		if not outcome.settled: pending += float(outcome.damage)
	main.world.predicted_enemy_damage = pending
	var minimum = 1.0 if _battle().get("phase","") not in ["victory","defeat"] else 0.0
	main.world.enemy_visual_hp = maxf(minimum,float(_battle().get("enemyHp",30))-pending)

func _present_contact(id: String, kind: String, point: Vector2) -> void:
	if visual_outcomes.has(id): return
	var damage = float(main._spell("fireball").get("magnitude",5)) if kind=="hit" else 0.0
	visual_outcomes[id] = {"kind":kind,"damage":damage,"settled":false}
	# Bound receipts from long neutral practice sessions; unresolved shots stay tracked.
	if visual_outcomes.size()>64:
		for old_id in visual_outcomes.keys():
			if visual_outcomes[old_id].settled:
				visual_outcomes.erase(old_id)
				if visual_outcomes.size()<=32: break
	_update_predicted_health()
	_event({"kind":kind,"position":_json(point),"amount":damage,"projectileId":id,"_predicted":true})

func _event(event: Dictionary) -> void:
	var local = bool(event.get("_predicted",false))
	if not local and event.kind in ["hit","miss"] and event.has("projectileId"):
		var id = str(event.projectileId)
		if visual_outcomes.has(id):
			var presented_kind = str(visual_outcomes[id].kind)
			visual_outcomes[id].settled = true
			_update_predicted_health()
			# Confirmed hits only need a new impact if the prediction was a miss.
			if presented_kind == "hit" or event.kind == "miss": return
	if not local and event.kind in ["return","reset","victory","defeat"]:
		for outcome in visual_outcomes.values(): outcome.settled = true
		_update_predicted_health()
	var effect_point = _point(event.position)
	if not local and event.kind == "hit" and event.has("targetPosition"):
		# Exact server contact offset, translated to the receiver's current visual pose.
		effect_point = enemy_position()+(_point(event.position)-_point(event.targetPosition))
	if not local and event.kind == "hit" and event.has("projectileId"):
		# Reconcile the receiver and impact on the same authoritative snapshot.
		displayed_enemy = enemy_position()
		main.world_renderer.plaza_slime.position = main.world_renderer.map_point(displayed_enemy)
		var shot_id = str(event.projectileId)
		if projectile_nodes.has(shot_id): projectile_nodes[shot_id].visible = false

	if event.kind in ["hit","miss"] and event.has("projectileId") and main.world.effects_enabled:
		var burst = effect_pool.take_flame(true,event.kind == "miss")
		burst.position = main.world_renderer.map_point(effect_point,.6)
		flame_bursts.append(burst)

	if event.kind == "victory" and is_instance_valid(reward_effects):
		var amounts: Dictionary = event.get("rewards",{})
		reward_effects.show_reward(str(_battle().get("id",""))+":"+str(event.id),_point(event.position),int(amounts.get("xp",0)),int(amounts.get("money",0)))
	if event.kind == "wave" and main.world.effects_enabled:
		var wave = _line(Color(1.0,.45,.12,.65))
		wave.material_override.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		wave.material_override.cull_mode = BaseMaterial3D.CULL_DISABLED
		wave_effects.append({"node":wave,"at":_point(event.position),"direction":_point(event.get("direction",{"x":0,"y":-1})),"age":0.0})
	if event.kind == "absorb": guard_flash = .15
	if event.kind in ["hit","hurt","evade","absorb"]:
		var text = "회피" if event.kind == "evade" else ("흡수 %d" % int(event.amount) if event.kind == "absorb" else ("%d" % int(event.amount) if event.kind == "hit" else "−%d" % int(event.amount)))
		var label = effect_pool.take_label(text,Color("df596c") if event.kind in ["hit","hurt"] else Color("f9e7a6"))
		transient.append({"node":label,"at":enemy_position() if event.kind == "hit" and event.has("targetPosition") else effect_point,"age":0.0})
		if event.kind == "hit":
			var monster = main.world_renderer.plaza_slime
			monster.play_hit()
			if float(_battle().get("enemyHp",30))<=0: monster.death_at = monster.local_clock
	if event.kind == "defeat":
		main.world.player_position = main.world.spawn_position
		main.world.path.clear()
		main.world.touch_direction = Vector2.ZERO
	if event.kind == "reset": selected = false

func _line(color: Color) -> MeshInstance3D:
	var node = MeshInstance3D.new()
	var material = StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	material.no_depth_test = true
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	main.world_renderer.add_child(node)
	return node

func _draw_line(node: MeshInstance3D, from: Vector2, to: Vector2, width: float) -> void:
	var direction = (to-from).normalized()
	var side = Vector2(-direction.y,direction.x)*width
	var mesh = ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for point in [from+side,to+side,to-side,from+side,to-side,from-side]: mesh.surface_add_vertex(main.world_renderer.map_point(point,.055))
	mesh.surface_end()
	node.mesh = mesh

func _preview_end(from: Vector2, direction: Vector2) -> Vector2:
	var distance = _spell_range(aim_spell)
	for step in range(1,int(distance)+1):
		var point = from+direction*step
		if not main.world._can_stand(point): return point
		if point.distance_to(displayed_enemy)<=float(layout.tuning.enemyRadius): return point
	return from+direction*distance

func _draw_cone(node: MeshInstance3D, origin: Vector2, direction: Vector2, radius: float, clip: bool = false) -> void:
	var mesh = ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	var half_angle = deg_to_rad(float(main._spell("flame_wave").get("angle",90))*.5)
	for i in range(16):
		var a = direction.rotated(lerpf(-half_angle,half_angle,float(i)/16))
		var b = direction.rotated(lerpf(-half_angle,half_angle,float(i+1)/16))
		var end_a = origin+a*radius
		var end_b = origin+b*radius
		if clip:
			for step in range(1,int(radius)+1):
				if not main.world._can_stand(origin+a*step):
					end_a = origin+a*maxi(0,step-1)
					break
			for step in range(1,int(radius)+1):
				if not main.world._can_stand(origin+b*step):
					end_b = origin+b*maxi(0,step-1)
					break
		for point in [origin,end_a,end_b]: mesh.surface_add_vertex(main.world_renderer.map_point(point,.07))
	mesh.surface_end()
	node.mesh = mesh

# Same relative swept-circle equation and map-pixel units as server sweptCircle.
# A negative fraction means no contact. This never awards damage locally.
func _swept_contact(from: Vector2, to: Vector2, enemy_from: Vector2, enemy_to: Vector2, radius: float) -> float:
	var relative = from-enemy_from
	var velocity = (to-from)-(enemy_to-enemy_from)
	var c = relative.length_squared()-radius*radius
	if c<=0: return 0.0
	var a = velocity.length_squared()
	if a<.000000000001: return -1.0
	var b = 2.0*relative.dot(velocity)
	var discriminant = b*b-4.0*a*c
	if discriminant<0: return -1.0
	var fraction = (-b-sqrt(discriminant))/(2.0*a)
	return fraction if fraction>=0 and fraction<=1 else -1.0

func _project_hud(point: Vector3) -> Vector2:
	var renderer: Vector2 = main.world_renderer.camera.unproject_position(point)
	var local = renderer*main.viewport_host.size/Vector2(main.viewport.size)
	return main.viewport_host.get_global_transform()*local

func _update_enemy_health_hud() -> void:
	var renderer = main.world_renderer
	var anchor: Vector3 = renderer.slime.global_position+Vector3.UP*1.25
	var camera: Camera3D = renderer.camera
	var center = _project_hud(anchor)
	var edge = _project_hud(anchor+camera.global_basis.x*renderer.ENEMY_BAR_WIDTH)
	var screen: Rect2 = main.get_viewport().get_visible_rect()
	var shown = renderer.enemy_meter_visible and main.world.indoor.is_empty() and not main.ui.overlay.visible and not camera.is_position_behind(anchor) and screen.has_point(center)
	enemy_health_hud.update_meter(center,center.distance_to(edge),float(main.world.enemy_visual_hp)/30.0,float(renderer.enemy_trail_hp)/30.0,shown)

func _render(delta: float, active: bool, paused: bool) -> void:
	main.world.spatial_selected = active and selected
	selected_ring.visible = active and selected and visible_enemy()
	aim_line.visible = active and manual and aim_owner != -1 and aim_spell == "fireball"
	aim_cone.visible = active and manual and aim_owner != -1 and aim_spell == "flame_wave"
	aim_end_ring.visible = aim_line.visible
	guard_ring.visible = not main.snapshot.is_empty() and float(main._combat().get("guard",{}).get("amount",0))>0 and main.world.indoor.is_empty()
	if guard_ring.visible:
		guard_ring.position = main.world_renderer.map_point(main.world.player_position,.2)
		var size_factor = .8+.2*float(main._combat().guard.seconds)/4.0
		if guard_flash > 0 and not main.world.reduced_motion: size_factor *= 1.08
		guard_ring.scale = Vector3(size_factor,size_factor,size_factor)
	if not paused: guard_flash = maxf(0,guard_flash-delta)
	if aim_cone.visible: _draw_cone(aim_cone,main.world.player_position,aim_direction,_spell_range(aim_spell),true)
	jump_line.visible = false
	var previous_enemy_position = displayed_enemy
	if active:
		if not paused: displayed_enemy = displayed_enemy.lerp(enemy_position(),1.0-exp(-delta*24)) if not main.world.reduced_motion else enemy_position()
		var monster: Node3D = main.world_renderer.plaza_slime
		monster.position = main.world_renderer.map_point(displayed_enemy)
		selected_ring.position = main.world_renderer.map_point(displayed_enemy,.04)
	if aim_line.visible:
		var end = _preview_end(main.world.player_position,aim_direction)
		_draw_line(aim_line,main.world.player_position,end,1.0)
		aim_end_ring.position = main.world_renderer.map_point(end,.06)
	if jump_line.visible:
		_draw_line(jump_line,_point(_spatial().jumpFrom),_point(_spatial().jumpTo),float(layout.tuning.enemyRadius))
	var living: Dictionary = {}
	var headings: Dictionary = {}
	var origins: Dictionary = {}
	var distances: Dictionary = {}
	var reach = float(layout.tuning.range)
	var speed = float(layout.tuning.projectileSpeed)
	for p in _spatial().get("projectiles",[]):
		var position = _point(p.position)
		if not paused: position += _point(p.direction)*minf(float(p.remaining),float(layout.tuning.projectileSpeed)*minf(visual_age,.15))
		living[str(p.id)] = position
		headings[str(p.id)] = _point(p.direction)
		origins[str(p.id)] = _point(p.position)-_point(p.direction)*(reach-float(p.remaining))
		distances[str(p.id)] = reach-float(p.remaining)
	if not predicted.is_empty():
		# Prefer the new local shot over any stale pre-cast snapshot.
		living.clear()
		headings.clear()
		if not paused: predicted.elapsed += delta
		headings.predicted = predicted.direction
		origins.predicted = predicted.position
		distances.predicted = minf(reach,predicted.elapsed*speed)
		living.predicted = predicted.position+predicted.direction*minf(float(layout.tuning.range),predicted.elapsed*float(layout.tuning.projectileSpeed))
	for local_id in local_shots:
		var shot: Dictionary = local_shots[local_id]
		if not paused: shot.elapsed += delta
		headings[local_id] = shot.direction
		origins[local_id] = shot.position
		distances[local_id] = minf(reach,float(shot.elapsed)*speed)
		living[local_id] = shot.position+shot.direction*distances[local_id]
	# Retain the animated flame across prediction -> authoritative projectile handoff.
	if projectile_nodes.has("predicted") and not living.has("predicted") and living.size()==1:
		var server_id = living.keys()[0]
		if not projectile_nodes.has(server_id):
			projectile_nodes[server_id] = projectile_nodes.predicted
			projectile_nodes.erase("predicted")
	for id in projectile_nodes.keys():
		if not living.has(id):
			effect_pool.release_flame(projectile_nodes[id])
			projectile_nodes.erase(id)
	for id in living:
		if not projectile_nodes.has(id):
			var node = effect_pool.take_flame()
			projectile_nodes[id] = node
		var node = projectile_nodes[id]
		var heading: Vector2 = headings.get(id,Vector2.RIGHT)
		if visual_outcomes.has(id):
			node.visible = false
			continue
		var reported = float(distances[id])
		var start_distance = maxf(node.flight_distance,reported) if node.flight_started else reported
		var end_distance = minf(reach,maxf(node.flight_distance+speed*delta,reported)) if node.flight_started else reported
		if not paused and _battle().get("phase","") not in ["victory","defeat"] and _spatial().get("behavior","") != "return":
			var origin: Vector2 = origins[id]
			var fraction = _swept_contact(origin+heading*start_distance,origin+heading*end_distance,previous_enemy_position,displayed_enemy,float(layout.tuning.enemyRadius)+float(layout.tuning.projectileRadius))
			if fraction>=0:
				var contact = origin+heading*lerpf(start_distance,end_distance,fraction)
				node.visible = false
				_present_contact(str(id),"hit",contact)
				continue
		var traveled: float = node.advance_flight(reported,speed,reach,delta,paused)
		if not paused and traveled>=reach-.001:
			node.visible = false
			_present_contact(str(id),"miss",origins[id]+heading*reach)
			continue
		# Keep an expired prediction until its acknowledgement is reconciled, hidden.
		# Recreating it here would make a single cast appear to launch twice.
		node.light_enabled = main.world.effects_enabled
		node.visible = active and traveled<reach-.001
		# Leave the same palm point as the gathered flame, then settle to flight height.
		var display_distance = minf(reach,maxf(traveled,7.0))
		var flight_height = lerpf(1.25,.6,clampf(traveled/48.0,0,1))
		node.position = main.world_renderer.map_point(origins[id]+heading*display_distance,flight_height)
		node.direction = Vector3(heading.x,0,heading.y)
		node.update_pose(main.world_renderer.camera,delta,paused,main.world.reduced_motion)
	for burst in flame_bursts:
		burst.light_enabled = main.world.effects_enabled
		burst.visible = active and main.world.effects_enabled
		burst.update_pose(main.world_renderer.camera,delta,paused,main.world.reduced_motion)
		if burst.finished(): effect_pool.release_flame(burst)
	flame_bursts = flame_bursts.filter(func(effect): return not effect.finished())
	_update_enemy_health_hud()
	for effect in transient:
		if not paused: effect.age += delta
		effect.node.visible = active
		effect.node.position = main.world_renderer.map_point(effect.at,1.1+(0.0 if main.world.reduced_motion else effect.age*.8))
		effect.node.modulate.a = maxf(0,1-effect.age)
		if effect.age>=1: effect_pool.release_label(effect.node)
	transient = transient.filter(func(effect): return effect.age<1)
	for wave in wave_effects:
		if not paused: wave.age += delta
		wave.node.visible = active and main.world.effects_enabled
		_draw_cone(wave.node,wave.at,wave.direction,_spell_range("flame_wave") if main.world.reduced_motion else _spell_range("flame_wave")*minf(1,wave.age/.10),true)
		var wave_color = Color(1.0,.45,.12,maxf(0,.65*(1-wave.age/.3)))
		wave.node.material_override.albedo_color = wave_color
		if wave.age>=.3: wave.node.queue_free()
	wave_effects = wave_effects.filter(func(wave): return wave.age<.3)
