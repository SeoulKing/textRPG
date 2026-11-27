extends Node
## Input prediction and rendering only. All hits, resources and rewards come from the server.

signal confirmed_combat_event(event: Dictionary)

const EnemyHealthOverlay = preload("res://scripts/enemy_health_overlay.gd")
var enemy_health_hud: Control
const FlameVfx = preload("res://scripts/native_2d_flame.gd")
const EffectPool = preload("res://scripts/native_2d_effect_pool.gd")
var effect_pool: Node
const Anticipation = preload("res://scripts/skill_anticipation.gd")
var anticipation = Anticipation.new()
var pending_cast: Dictionary = {}
# One follow-up input bridges the windup without building an endless cast backlog.
var buffered_cast: Dictionary = {}
var buffered_dodge: Dictionary = {}
var dash_pending=false
var charge_vfx: Node2D
var flame_bursts: Array[Node2D] = []
const AimOverlay = preload("res://scripts/spell_aim_overlay.gd")
const AIMED_SPELLS = ["fireball", "flame_wave", "meteor", "giant_fireball"]
const CONFIG = preload("res://art/export/combat-layout.json")
const FIREBALL_WINDUP_SECONDS := 0.32
const COMBAT_INPUT_BUFFER_MS := 180
const FEEDBACK_LIFETIME := 0.82
const SERVER_COMBAT_TICK_SECONDS := 0.05
const LEAP_PATH_CLEARANCE := 2.0
const LEAP_SNAPSHOT_MAX_AGE_MS := 150
var main
var layout: Dictionary = {}
var selected = false
var request_busy = false
var in_flight: int = 0
var pending_commands: Dictionary = {}
var settling: bool = false
var applied_sequence: int = -1
const MAX_IN_FLIGHT: int = 4
const INPUT_MAX_AGE_MS: int = 500
var connection_lost = false
# Commands and pause transitions bypass the background position interval.
const SYNC_INTERVAL: float = 0.25
var timer = 0.0
var visual_age = 0.0
var last_event = 0
var battle_id = ""
var failed_at = -100.0
var connection_failures: int = 0
var retry_delay: float = 2.0
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
var selected_ring: Node2D
var aim_end_ring: Node2D
var aim_line: Polygon2D
var aim_cone: Polygon2D
var guard_ring: Node2D
var guard_flash = 0.0
var wave_effects: Array[Dictionary] = []
var jump_line: Polygon2D
var jump_edge: Line2D
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
var additional_visuals: Node
const UltimateVisuals = preload("res://scripts/native_2d_ultimate.gd")
var world_visuals_enabled := true

func _ready() -> void:
	anticipation.combat = self
	additional_visuals = UltimateVisuals.new()
	additional_visuals.combat = self
	add_child(additional_visuals)
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
	guard_ring = main.world_renderer._ring(.65,"ffae46")
	main.world_renderer.add_child(guard_ring)
	jump_line = _line(Color("ad63d9"))
	jump_line.hide()
	jump_edge = Line2D.new()
	jump_edge.closed = true
	jump_edge.width = 1.5
	jump_edge.z_index = jump_line.z_index + 1
	main.world_renderer.add_child(jump_edge)
	jump_edge.hide()

func set_world_visuals_enabled(value: bool) -> void:
	if world_visuals_enabled == value: return
	world_visuals_enabled = value
	reward_effects.set_world_visuals_enabled(value)
	if value:
		displayed_enemy = enemy_position()
		return
	enemy_health_hud.hide()
	for node in [aim_overlay, selected_ring, aim_end_ring, aim_line, aim_cone, guard_ring, jump_line, jump_edge]:
		node.hide()
	_cancel_pending_cast()
	buffered_dodge.clear()
	main.world_renderer.set_slime_target_outline(false)
	main.world_renderer.hero.cancel_cast()
	if is_instance_valid(charge_vfx): charge_vfx.hide()
	guard_flash = 0.0
	for flame in projectile_nodes.values():
		flame.scale = Vector2.ONE
		effect_pool.release_flame(flame)
	projectile_nodes.clear()
	for burst in flame_bursts:
		burst.scale = Vector2.ONE
		effect_pool.release_flame(burst)
	flame_bursts.clear()
	for effect in transient: effect_pool.release_label(effect.node)
	transient.clear()
	for wave in wave_effects: wave.node.queue_free()
	wave_effects.clear()
	additional_visuals.clear_visuals()

func network_interrupted() -> void:
	connection_lost = true
	anticipation.clear()
	main.world.cancel_dash()
	main.world.cancel_teleport()
	cancel_aim()
	_clear_queued_commands()
	local_shots.clear()
	predicted.clear()
	visual_outcomes.clear()
	_update_predicted_health()

func _point(value: Dictionary) -> Vector2:
	return Vector2(float(value.get("x",0)),float(value.get("y",0)))

func _snapshot_point(value: Variant) -> Vector2:
	if not value is Dictionary: return Vector2.INF
	var x: Variant = value.get("x")
	var y: Variant = value.get("y")
	if not (x is float or x is int) or not (y is float or y is int): return Vector2.INF
	return _point(value)

func _json(point: Vector2) -> Dictionary:
	return {"x":point.x,"y":point.y}

func _battle() -> Dictionary:
	return main._battle()

func _spatial() -> Dictionary:
	return _battle().get("spatial",{})

func available() -> bool:
	if is_instance_valid(main.life) and main.life.blocking(): return false
	return not main.snapshot.is_empty() and main.world.indoor.is_empty() and main._state().get("flags",{}).get("in_magic_world",false) and (not _spatial().is_empty() or (main._state().get("location","") == "arcana_plaza" and _battle().is_empty()))

func _visible_targets(command: String = "fireball") -> Array:
	var result: Array = []
	var candidates: Array = _spatial().get("enemies",[])
	var primary := str(_spatial().get("primaryEnemyId", "slime_0"))
	if candidates.is_empty() and _spatial().is_empty(): candidates = [{"id":"slime_0","position":layout.home,"hp":30}]
	for enemy in candidates:
		var point := _point(enemy.position)
		var in_range: bool = main.world.player_position.distance_to(point) <= _spell_range(command) + float(layout.tuning.enemyRadius)
		var visible_point := _rendered_enemy_position() if str(enemy.get("id", "")) == primary else point
		if float(enemy.hp) > 0 and in_range and (not world_visuals_enabled or _in_world_view(visible_point)):
			result.append(enemy)
	result.sort_custom(func(a,b): return main.world.player_position.distance_squared_to(_point(a.position))<main.world.player_position.distance_squared_to(_point(b.position)))
	return result

func _in_world_view(point: Vector2) -> bool:
	return main.get_viewport().get_visible_rect().has_point(_screen(point, .5))

func enemy_position() -> Vector2:
	return _point(_spatial().get("enemy",layout.home))

func _rendered_enemy_position() -> Vector2:
	if main.online_world and world_visuals_enabled:
		var point: Vector2 = main.world_renderer.rendered_enemy_point
		if point.is_finite(): return point
	return enemy_position()

func _screen(point: Vector2, height: float = 0.0) -> Vector2:
	var rendered: Vector2 = main.world_renderer.screen_point(point,height)
	var local = rendered*main.viewport_host.size/Vector2(main.viewport.size)
	return main.viewport_host.get_global_transform()*local

func _world(point: Vector2) -> Vector2:
	var local = main.viewport_host.get_global_transform().affine_inverse()*point
	return main.world_renderer.pick(local*Vector2(main.viewport.size)/main.viewport_host.size)

func visible_enemy() -> bool:
	if main.online_world and float(_battle().get("enemyHp",30))<=0: return false
	if _battle().get("phase", "") in ["victory", "defeat"]: return false
	if not world_visuals_enabled:
		var range_limit := maxf(_spell_range("fireball"), _spell_range("meteor")) + float(layout.tuning.enemyRadius)
		return main.world.player_position.distance_to(enemy_position()) <= range_limit
	return _in_world_view(_rendered_enemy_position())

func select_at(point: Vector2) -> bool:
	if not available() or not visible_enemy() or main.ui.overlay.visible: return false
	for button in main.ui.touch_buttons:
		if button.is_visible_in_tree() and button.get_global_rect().has_point(point): return false
	var enemy := _rendered_enemy_position()
	var foot = _screen(enemy)
	var top = _screen(enemy,1.25)
	var width = maxf(18,absf(foot.y-top.y)*.55)
	if Rect2(Vector2(minf(top.x,foot.x)-width,minf(top.y,foot.y)-5),Vector2(width*2,absf(foot.y-top.y)+10)).has_point(point):
		selected = true
		main.world.path.clear()
		return true
	return false

func _reserved_cost() -> float:
	var cost: float = 0.0
	for pending in queue:
		cost += float(main._spell(str(pending.command)).get("cost",0))
	for command in pending_commands.values():
		cost += float(main._spell(str(command)).get("cost",0))
	return cost+anticipation.reserved_cost()

func _plaza_fireball_cooldown() -> Dictionary:
	if not main.online_world: return {}
	var spatial := _spatial()
	if spatial.get("encounterId", "") != "plaza_slime": return {}
	var cooldown: Variant = spatial.get("plazaFireballCooldown")
	return cooldown if cooldown is Dictionary else {}

func fireball_cooldown_duration() -> float:
	var plaza := _plaza_fireball_cooldown()
	if not plaza.is_empty(): return float(plaza.get("durationSeconds", 0.0))
	return float(main._spell("fireball").get("cooldown", 0.0))

func fireball_cooldown_remaining() -> float:
	var plaza := _plaza_fireball_cooldown()
	if not plaza.is_empty(): return float(plaza.get("remainingSeconds", 0.0))
	return float(main._combat().get("cooldowns", {}).get("fireball", 0.0))

func fireball_cast_pending() -> bool:
	return not pending_cast.is_empty() or _queued_or_sent("fireball")

func _queued_or_sent(command: String) -> bool:
	if pending_commands.values().has(command): return true
	for pending in queue:
		if pending.command == command: return true
	return false

func _command_pending(command: String) -> bool:
	var spell: Dictionary = main._spell(command)
	# Zero-cooldown spells may be pipelined; do not turn network RTT into
	# an unintended cooldown. Resource reservations still apply.
	if not spell.is_empty() and float(spell.get("cooldown", 0.0)) <= 0.0 \
		and (command != "fireball" or _plaza_fireball_cooldown().is_empty()): return false
	if command in ["meteor","giant_fireball","flame_barrage"]:
		for value in pending_commands.values():
			if value in ["meteor","giant_fireball","flame_barrage"]: return true
	return _queued_or_sent(command)

func _cast_context_ready(command: String) -> bool:
	if main.fishing.visible or (is_instance_valid(main.life) and main.life.blocking()): return false
	if world_visuals_enabled and (effect_pool == null or not effect_pool.prepared): return false
	if connection_lost or settling or queue.size() >= 8: return false
	var spell: Dictionary = main._spell(command)
	var combat: Dictionary = main._combat()
	return main.world.bench_state.is_empty() and not spell.is_empty() and spell.get("unlocked", false) \
		and spell.get("equipped", false) and available() and _battle().get("phase", "") not in ["victory", "defeat"] \
		and _spatial().get("behavior", "") != "return" and float(combat.get("mp", 0)) - _reserved_cost() >= float(spell.cost)

func _remaining_cast_movement() -> float:
	var world = main.world
	var dash := maxf(0.0, world.DASH_MOVE_TIME - float(world.dash_age)) if world.dash_age >= 0 else 0.0
	var blink := maxf(0.0, 0.12 - float(world.teleport_age)) if world.teleport_age >= 0 else 0.0
	return maxf(dash, blink)

func can_cast(command: String = "fireball") -> bool:
	if not _cast_context_ready(command) or _command_pending(command): return false
	if command == "fireball":
		if not pending_cast.is_empty() or (world_visuals_enabled and _remaining_cast_movement() > 0.0): return false
		var plaza := _plaza_fireball_cooldown()
		return fireball_cooldown_remaining() <= (0.01 if plaza.is_empty() else 0.0)
	return main.world.teleport_age < 0 and main.world.dash_age < 0 \
		and float(main._combat().get("cooldowns", {}).get(command, 0.0)) <= 0.01

func can_accept_cast_input(command: String) -> bool:
	if can_cast(command): return true
	if command != "fireball" or not world_visuals_enabled or not _cast_context_ready(command): return false
	if not pending_cast.is_empty() and not _plaza_fireball_cooldown().is_empty(): return false
	var windup := maxf(0.0, FIREBALL_WINDUP_SECONDS - float(pending_cast.get("elapsed", 0.0))) if not pending_cast.is_empty() else 0.0
	var wait := maxf(windup, maxf(_remaining_cast_movement(), fireball_cooldown_remaining()))
	return wait * 1000.0 <= COMBAT_INPUT_BUFFER_MS

func _begin(owner: int, point: Vector2, key: int = 0, command: String = "fireball") -> void:
	if not can_accept_cast_input(command) or main.busy or main.ui.overlay.visible: return
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
	if world_visuals_enabled: main.world_renderer.hero.aim_facing = Vector2.ZERO
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
	if command == "giant_fireball" and not direct and _visible_targets(command).is_empty(): return
	if command == "meteor":
		var targets = _visible_targets(command)
		if not direct and targets.is_empty(): return
		var target = main.world.player_position+direction*_spell_range(command)*clampf(aim_pointer.distance_to(aim_origin)/80.0,0,1) if direct else _point(targets[0].position)
		queue_command(command,direction,target)
	else: queue_command(command,direction)

func _spell_range(command: String) -> float:
	return float(main._spell(command).get("rangeTiles",6))*float(layout.tuning.tile)

func cast_auto(command: String = "fireball") -> void:
	if not can_accept_cast_input(command): return
	if command == "giant_fireball" and _visible_targets(command).is_empty(): return
	if command == "meteor":
		var targets = _visible_targets(command)
		if targets.is_empty(): return
		queue_command(command,_auto_direction(command),_point(targets[0].position))
	else: queue_command(command,_auto_direction(command))

func _can_start_targeted_cast(command: String) -> bool:
	return main.online_world and main.combat_socket.socket_ready and main.page_active and not main.busy and not main.ui.overlay.visible \
		and (command != "fireball" or pending_cast.is_empty()) and can_cast(command)

func _targeted_enemy(command: String, life_id: String = "", require_clear_path: bool = true) -> Dictionary:
	var spatial := _spatial()
	var simple_plaza: bool = main.online_world and not world_visuals_enabled \
		and main._state().get("location", "") == "arcana_plaza" and spatial.get("encounterId", "") == "plaza_slime"
	if spatial.get("behavior", "") == "return" or (command == "flame_wave" and not simple_plaza): return {}
	var origin: Vector2 = main.world.player_position
	for enemy in _visible_targets(command):
		var enemy_life_id := str(enemy.get("lifeId", ""))
		if enemy_life_id.is_empty() or (not life_id.is_empty() and enemy_life_id != life_id): continue
		if not require_clear_path or not simple_plaza: return enemy
		var target := _point(enemy.position)
		var path_clear := plaza_flame_wave_path_clear(origin, target) if command == "flame_wave" else plaza_fireball_path_clear(origin, target)
		if path_clear: return enemy
	return {}

func _direction_to_enemy(enemy: Dictionary) -> Vector2:
	var direction: Vector2 = _point(enemy.position) - main.world.player_position
	return direction.normalized() if not direction.is_zero_approx() else main.world.last_move_direction

func can_target_fireball() -> bool:
	return _can_start_targeted_cast("fireball") and has_fireball_target()

func has_fireball_target(require_clear_path: bool = true) -> bool:
	return not _targeted_enemy("fireball", "", require_clear_path).is_empty()

func can_target_flame_wave() -> bool:
	return _can_start_targeted_cast("flame_wave") and has_flame_wave_target()

func has_flame_wave_target(require_clear_path: bool = true) -> bool:
	return not _targeted_enemy("flame_wave", "", require_clear_path).is_empty()

func plaza_fireball_path_clear(from: Vector2, target: Vector2) -> bool:
	if layout.is_empty() or not from.is_finite() or not target.is_finite(): return false
	var tuning: Dictionary = layout.tuning
	var projectile_radius := float(tuning.projectileRadius)
	var enemy_radius := float(tuning.enemyRadius)
	var distance := from.distance_to(target)
	if distance > _spell_range("fireball") + enemy_radius: return false
	# The projectile only needs an open path to the enemy's near edge.
	var hit_distance := maxf(0.0, distance - enemy_radius - projectile_radius)
	var hit_point := from.move_toward(target, hit_distance)
	return _plaza_cast_segment_clear(from, hit_point, projectile_radius)

func plaza_flame_wave_path_clear(from: Vector2, target: Vector2) -> bool:
	if layout.is_empty() or not from.is_finite() or not target.is_finite(): return false
	if from.distance_to(target) > _spell_range("flame_wave") + float(layout.tuning.enemyRadius): return false
	return _plaza_cast_segment_clear(from, target, 0.1)

func plaza_leap_path_clear(spatial: Dictionary, in_progress: bool) -> bool:
	if spatial.get("jumpHit") != false or not is_instance_valid(main.online_presence): return false
	var elapsed: Variant = spatial.get("elapsed")
	if not (elapsed is float or elapsed is int): return false
	var snapshot_time := float(elapsed)
	var server_time: float = main.online_presence.server_time
	if not is_finite(snapshot_time) or not is_finite(server_time) or snapshot_time < 0.0 \
		or absf(snapshot_time - server_time) >= 0.001: return false
	var received_at: int = main.online_presence.received_at
	var age := Time.get_ticks_msec() - received_at
	if received_at <= 0 or age < 0 or age > LEAP_SNAPSHOT_MAX_AGE_MS: return false
	var confirmed := _snapshot_point(spatial.get("player"))
	var start := _snapshot_point(spatial.get("enemy" if in_progress else "jumpFrom"))
	var landing := _snapshot_point(spatial.get("jumpTo"))
	var local: Vector2 = main.world.player_position
	if not confirmed.is_finite() or not start.is_finite() or not landing.is_finite() or not local.is_finite(): return false
	var tuning: Dictionary = layout.get("tuning", {})
	var enemy_radius: Variant = tuning.get("enemyRadius")
	var player_radius: Variant = tuning.get("playerRadius")
	if not (enemy_radius is float or enemy_radius is int) or not (player_radius is float or player_radius is int): return false
	if not is_finite(float(enemy_radius)) or not is_finite(float(player_radius)) or float(enemy_radius) <= 0.0 or float(player_radius) <= 0.0: return false
	var closest := Geometry2D.get_closest_point_to_segment(confirmed, start, landing)
	var path_distance := confirmed.distance_to(closest)
	# Keep the warning if the local prediction could close the remaining gap.
	var required_distance := float(enemy_radius) + float(player_radius) + LEAP_PATH_CLEARANCE + confirmed.distance_to(local)
	return is_finite(path_distance) and path_distance > required_distance

func _plaza_cast_segment_clear(from: Vector2, to: Vector2, radius: float) -> bool:
	var bounds: Dictionary = layout.bounds
	var lower := Vector2(bounds.x, bounds.y) + Vector2.ONE * radius
	var upper := Vector2(bounds.x + bounds.w, bounds.y + bounds.h) - Vector2.ONE * radius
	# The inset bounds are convex, so a segment between two inside points stays inside.
	for point: Vector2 in [from, to]:
		if point.x < lower.x or point.y < lower.y or point.x > upper.x or point.y > upper.y: return false
	var steps := maxi(1, ceili(from.distance_to(to) / 0.75))
	for i in range(steps + 1):
		if _plaza_cast_obstacle_at(from.lerp(to, float(i) / steps), radius): return false
	return true

func _plaza_cast_obstacle_at(point: Vector2, radius: float) -> bool:
	for shape: Dictionary in layout.circles:
		var inverse: Array = shape.inverse
		# Use the server's exported transform convention for the collision sample.
		var x_row := Vector2(inverse[0], inverse[1])
		var y_row := Vector2(inverse[2], inverse[3])
		var local := Vector2(x_row.dot(point) + inverse[4], y_row.dot(point) + inverse[5])
		var limit := float(shape.localRadius) + radius * maxf(x_row.length(), y_row.length())
		if local.length_squared() < limit * limit: return true
	for shape: Dictionary in layout.rectangles:
		var nearest := Vector2(clampf(point.x, shape.x, shape.x + shape.w), clampf(point.y, shape.y, shape.y + shape.h))
		if point.distance_squared_to(nearest) < radius * radius: return true
	return false

func targeted_fireball_arrival_seconds() -> float:
	var tuning: Dictionary = layout.get("tuning", {})
	var speed := float(tuning.get("projectileSpeed", 0.0))
	var projectile_radius := float(tuning.get("projectileRadius", -1.0))
	var enemy_radius := float(tuning.get("enemyRadius", -1.0))
	if speed <= 0.0 or projectile_radius < 0.0 or enemy_radius < 0.0 or float(tuning.get("tile", 0.0)) <= 0.0:
		return -1.0
	var enemy := _targeted_enemy("fireball")
	if enemy.is_empty(): return -1.0
	var origin: Vector2 = main.world.player_position
	var distance := maxf(0.0, origin.distance_to(_point(enemy.position)) - projectile_radius - enemy_radius)
	return FIREBALL_WINDUP_SECONDS + distance / speed + estimated_combat_input_seconds()

func estimated_combat_input_seconds() -> float:
	var estimate := SERVER_COMBAT_TICK_SECONDS
	if main.online_world and is_instance_valid(main.combat_socket):
		estimate += maxf(0.0, float(main.combat_socket.rtt_ms)) / 1000.0
	if main.online_world and is_instance_valid(main.online_presence):
		var received_at: int = main.online_presence.received_at
		var snapshot_time := float(_spatial().get("elapsed", -1.0))
		if received_at > 0 and absf(snapshot_time - float(main.online_presence.server_time)) < 0.001:
			estimate += maxf(0.0, float(Time.get_ticks_msec() - received_at)) / 1000.0
	return estimate

func cast_targeted_fireball() -> void:
	if not _can_start_targeted_cast("fireball"): return
	var enemy := _targeted_enemy("fireball")
	if enemy.is_empty(): return
	selected = true
	_start_fireball(_direction_to_enemy(enemy), str(enemy.lifeId))

func cast_targeted_flame_wave() -> void:
	if not _can_start_targeted_cast("flame_wave"): return
	var enemy := _targeted_enemy("flame_wave")
	if enemy.is_empty(): return
	selected = true
	queue_command("flame_wave", _direction_to_enemy(enemy), Vector2.INF, str(enemy.lifeId))

func _auto_direction(command: String) -> Vector2:
	var targets = _visible_targets(command)
	if not targets.is_empty():
		selected = true
		return (_point(targets[0].position)-main.world.player_position).normalized()
	if not world_visuals_enabled: return main.world.last_move_direction
	var yaw = main.world_renderer.hero.last_yaw
	return Vector2(sin(yaw),cos(yaw))

func can_dash(command: String = "dodge") -> bool:
	if main.fishing.visible or (is_instance_valid(main.life) and main.life.blocking()): return false
	# Blink input depends on the local scene, never on an acknowledgement,
	# cooldown snapshot, or the preceding blink's visual age.
	if command == "teleport":
		return not main.snapshot.is_empty() and not main.gate_crossing and not main.ui.overlay.visible and main.world.bench_state.is_empty() and main.page_active and _battle().get("phase","") != "defeat"
	return _dodge_context_ready() and not _command_pending(command) and not dash_pending \
		and main.world.teleport_age < 0 and main.world.dash_age < 0 and _dodge_cooldown() <= .01

func _dodge_context_ready() -> bool:
	return not connection_lost and not settling and queue.size() < 8 and not main.snapshot.is_empty() \
		and main.world.enabled and not main.busy and not main.ui.overlay.visible and main.world.bench_state.is_empty() \
		and _battle().get("phase", "") not in ["victory", "defeat"] and main.page_active

func _dodge_cooldown() -> float:
	return maxf(float(main.world.dash_lock), float(main._combat().get("cooldowns", {}).get("dodge", 0)))

func can_accept_dodge_input() -> bool:
	return can_dash("dodge") or (world_visuals_enabled and available() and not main.fishing.visible \
		and not main.life.blocking() and _dodge_context_ready() and not dash_pending \
		and _dodge_cooldown() * 1000.0 <= COMBAT_INPUT_BUFFER_MS)

func dodge_slime() -> void:
	if not available(): return
	var spatial := _spatial()
	var committed_attack: bool = spatial.get("slimeAction", "") in ["leap", "charge"] and spatial.get("behavior", "") in ["prepare", "attack"]
	var heading: Vector2 = main.world.player_position - enemy_position()
	if committed_attack and spatial.has("jumpFrom") and spatial.has("jumpTo"):
		var attack_heading := _point(spatial.jumpTo) - _point(spatial.jumpFrom)
		if not attack_heading.is_zero_approx(): heading = attack_heading
	if heading.is_zero_approx(): heading = main.world.dash_heading()
	var side := Vector2(-heading.y, heading.x).normalized()
	var origin: Vector2 = main.world.player_position
	var to_one_side: Vector2 = main.world.project_dash_endpoint(side) - origin
	var to_other_side: Vector2 = main.world.project_dash_endpoint(-side) - origin
	start_dash("dodge", -side if to_other_side.dot(-side) > to_one_side.dot(side) else side)

func start_dash(command: String = "dodge", heading: Vector2 = Vector2.ZERO) -> void:
	if not can_dash(command):
		if command == "dodge" and can_accept_dodge_input():
			buffered_dodge = {"heading": heading, "expires": Time.get_ticks_msec() + COMBAT_INPUT_BUFFER_MS}
		return
	buffered_dodge.clear()
	if heading.is_zero_approx(): heading = main.world.dash_heading()
	_cancel_pending_cast()
	cancel_aim()
	if world_visuals_enabled: main.world_renderer.hero.cancel_cast()
	if command=="teleport":main.world.begin_teleport(heading)
	else:main.world.begin_dash(heading)
	movement_sequence += 1
	dash_pending=true
	if available():
		if connection_lost or settling or queue.size() >= 8:
			dash_pending = false
			return
		var movement := {"queuedAt":Time.get_ticks_msec(),"command":command,"direction":heading,"origin":main.world.dash_origin,"endpoint":main.world.dash_target,"movementSequence":movement_sequence}
		if command == "dodge": queue.push_front(movement)
		else: queue.append(movement)
	else:
		_standard_dash(command)

func _standard_dash(command: String) -> void:
	var sent_movement_sequence = movement_sequence
	var action={"type":"arcana_combat","command":command}
	if not _battle().is_empty():action.battleId=_battle().id
	var data: Dictionary
	if main.online_world:
		main.sequence += 1
		action.spatial = {"sequence":main.sequence,"aim":_json(main.world.dash_heading()),"position":_json(main.world.teleport_origin if command=="teleport" else main.world.dash_origin)}
		data = await main.combat_socket.request(action)
	else:
		data = await main._api("/api/games/"+main.game_id+"/actions",HTTPClient.METHOD_POST,action)
	if sent_movement_sequence == movement_sequence: dash_pending=false
	if data.has("state"):
		if main.online_world: main._accept_online_result(data)
		elif sent_movement_sequence == movement_sequence: main._apply(data)
	elif sent_movement_sequence == movement_sequence:
		if command == "dodge": main.world.cancel_dash()
		main.ui.toast(data.get("message","대시를 사용할 수 없습니다."))

func flame_guard_pending() -> bool:
	return anticipation.guard_pending()

func can_cast_guard() -> bool:
	return can_cast("flame_guard") and not flame_guard_pending()

func instant_guard() -> Dictionary:
	if not can_cast_guard(): return {"error":"skill_unavailable","quiet":true}
	var id: String = anticipation.begin("flame_guard",main.world.last_move_direction,Vector2.INF)
	var result: Dictionary = await main.combat_socket.request({"type":"arcana_combat","command":"flame_guard","actionId":id})
	if int(result.get("transportGeneration",main.combat_socket.connection_generation))==main.combat_socket.connection_generation: anticipation.confirm(id,result)
	else: anticipation.cancel(id)
	return result

func queue_command(command: String, direction: Vector2 = Vector2.ZERO, target: Vector2 = Vector2.INF, target_life_id: String = "") -> void:
	if main.online_world and command in ["potion","flame_guard"]:
		main._online_instant(command)
		return
	if command in ["dodge","teleport"]:
		start_dash(command)
		return
	if not available() or connection_lost or settling or queue.size() >= 8 or main.busy or main.ui.overlay.visible or not main.world.bench_state.is_empty(): return
	if command == "fireball":
		if not can_accept_cast_input(command): return
		direction = direction.normalized() if direction.length_squared() > .00001 else _auto_direction(command)
		if can_cast(command):
			buffered_cast.clear()
			_start_fireball(direction, target_life_id)
		else:
			buffered_cast = {"direction": direction, "targetLifeId": target_life_id, "expires": Time.get_ticks_msec() + COMBAT_INPUT_BUFFER_MS}
		return
	if _command_pending(command) or (not main._spell(command).is_empty() and not can_cast(command)): return
	for pending in queue:
		if command != "fireball" and pending.command == command: return
	var preview_id: String = anticipation.begin(command,direction,target) if main.online_world else ""
	queue.append({"queuedAt":Time.get_ticks_msec(),"command":command,"direction":direction,"target":target,"shotId":preview_id,"targetLifeId":target_life_id})

func _start_fireball(direction: Vector2, target_life_id: String = "") -> void:
	anticipation.last_cast_id = ""
	pending_cast = {"direction":direction,"elapsed":0.0,"targetLifeId":target_life_id}
	main.world.casting = true
	if world_visuals_enabled:
		main.world_renderer.hero.begin_cast(direction, "fireball")
		charge_vfx = effect_pool.charge

func _cancel_pending_cast() -> void:
	buffered_cast.clear()
	if pending_cast.is_empty(): return
	pending_cast.clear()
	main.world.casting = false
	if world_visuals_enabled:
		main.world_renderer.hero.cancel_cast()
		if is_instance_valid(charge_vfx): charge_vfx.hide()

func cancel_unreleased_cast() -> void:
	_cancel_pending_cast()

func _take_buffered_dodge() -> void:
	if not buffered_dodge.is_empty():
		if Time.get_ticks_msec() > int(buffered_dodge.expires):
			buffered_dodge.clear()
		elif can_dash("dodge"):
			start_dash("dodge", buffered_dodge.heading)

func _take_buffered_cast() -> void:
	if not buffered_cast.is_empty():
		if Time.get_ticks_msec() > int(buffered_cast.expires):
			buffered_cast.clear()
		elif can_cast("fireball"):
			var direction: Vector2 = buffered_cast.direction
			var target_life_id: String = buffered_cast.targetLifeId
			buffered_cast.clear()
			_start_fireball(direction, target_life_id)

func _update_cast(delta: float, active: bool, paused: bool) -> void:
	if not active or (paused and not pending_cast.is_empty()): _cancel_pending_cast()
	if not pending_cast.is_empty() and not paused: pending_cast.elapsed += delta
	if not world_visuals_enabled: return
	var hero = main.world_renderer.hero
	hero.advance_cast(delta,paused)
	if not pending_cast.is_empty():
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
		if main.ui.quickslot_bindings[i] in AIMED_SPELLS and main.ui.quickslot_buttons[i].get_global_rect().has_point(point): return main.ui.quickslot_bindings[i]
	return ""

func _preview_auto_aim_spell() -> String:
	if aim_owner != -1:
		return aim_spell if not manual and can_cast(aim_spell) else ""
	var hovered := _aim_slot(main.get_viewport().get_mouse_position())
	if not hovered.is_empty():
		return hovered if can_cast(hovered) else ""
	for command: String in main.ui.quickslot_bindings:
		if command in AIMED_SPELLS and can_cast(command):
			return command
	return ""

func _update_target_outline(active: bool, paused: bool) -> void:
	var outlined := false
	if active and not paused and (not main.online_world or main.combat_socket.socket_ready):
		var command := _preview_auto_aim_spell()
		if not command.is_empty():
			var targets := _visible_targets(command)
			# The world renderer presents the primary enemy from the combat snapshot.
			var displayed_id := str(_spatial().get("primaryEnemyId", "slime_0"))
			outlined = not targets.is_empty() and str(targets[0].id) == displayed_id
	main.world_renderer.set_slime_target_outline(outlined)

func _input(event: InputEvent) -> void:
	if not world_visuals_enabled: return
	if not available(): return
	if aim_owner != -1 and ((event is InputEventKey and event.pressed and event.physical_keycode == KEY_ESCAPE) or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_RIGHT)):
		cancel_aim()
		get_viewport().set_input_as_handled()
		return
	if main.ui.overlay.visible or main.fishing.visible or main.busy or not main.page_active:
		cancel_aim()
		return
	var handled = false
	if event is InputEventKey and not event.echo:
		var keys = [KEY_1,KEY_2,KEY_3,KEY_4]
		if event.physical_keycode in keys and main.ui.quickslot_bindings[keys.find(event.physical_keycode)] in AIMED_SPELLS:
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
	anticipation.tick(delta)
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
	if active:
		if not _spatial().is_empty() and not paused and not _battle().get("paused",true):
			for key in ["fireball","flame_wave","flame_guard","meteor","giant_fireball","flame_barrage","ultimate","dodge","teleport","potion"]:
				main._combat().cooldowns[key] = maxf(0,float(main._combat().cooldowns.get(key,0))-delta)
			main.world.battle.attackIn = maxf(0,float(main.world.battle.get("attackIn",6))-delta)
		timer += delta
	# When both inputs become ready in the same frame, the dodge cancels the windup.
	if active and not paused: _take_buffered_dodge()
	# The animation windup is local and never waits for an HTTP response.
	if active and not pending_cast.is_empty() and float(pending_cast.elapsed) >= FIREBALL_WINDUP_SECONDS and not paused:
		var direction: Vector2 = pending_cast.direction
		var target_life_id: String = pending_cast.targetLifeId
		pending_cast.clear()
		main.world.casting = false
		if can_cast("fireball"):
			if world_visuals_enabled: main.world_renderer.hero.cast_age = FIREBALL_WINDUP_SECONDS
			local_shot_sequence += 1
			var shot_id: String = main._new_action_id()
			var origin: Vector2 = main.world.player_position
			local_shots[shot_id] = {"position":origin,"direction":direction,"elapsed":0.0}
			queue.append({"queuedAt":Time.get_ticks_msec(),"command":"fireball","direction":direction,"origin":origin,"shotId":shot_id,"targetLifeId":target_life_id})
		elif world_visuals_enabled:
			main.world_renderer.hero.cancel_cast()
	if active and not paused: _take_buffered_cast()
	var sync_interval: float = 1.0 if _spatial().is_empty() else SYNC_INTERVAL
	var transport_ready: bool = not main.online_world or main.combat_socket.socket_ready
	# Keep a transport slot for a defensive input while spell acknowledgements are pending.
	var dodge_first: bool = not queue.is_empty() and queue[0].command == "dodge"
	var send_limit := MAX_IN_FLIGHT - 1 if main.online_world and not dodge_first else MAX_IN_FLIGHT
	if active and transport_ready and not settling and in_flight < send_limit and not main.clock_busy and not main.busy and Time.get_ticks_msec()/1000.0-failed_at>retry_delay:
		if not queue.is_empty() and not paused and not connection_lost:
			var command = queue.pop_front()
			var target_life_id := str(command.get("targetLifeId", ""))
			var target_enemy: Dictionary = {} if target_life_id.is_empty() else _targeted_enemy(str(command.command), target_life_id)
			if Time.get_ticks_msec()-int(command.get("queuedAt",0)) > INPUT_MAX_AGE_MS or (not target_life_id.is_empty() and target_enemy.is_empty()):
				var expired_shot: String = str(command.get("shotId",""))
				anticipation.cancel(expired_shot)
				local_shots.erase(expired_shot)
				visual_outcomes.erase(expired_shot)
				_update_predicted_health()
				if command.command in ["dodge","teleport"] and int(command.get("movementSequence",0)) == movement_sequence: dash_pending = false
			else:
				var direction: Vector2 = command.direction
				if not target_enemy.is_empty():
					direction = _direction_to_enemy(target_enemy)
					if local_shots.has(command.shotId): local_shots[command.shotId].direction = direction
				_request(command.command,false,direction,command.get("origin",Vector2.INF),command.get("endpoint",Vector2.INF),command.get("shotId",""),int(command.get("movementSequence",0)),command.get("target",Vector2.INF),target_life_id)
		elif not main.online_world and not request_busy and _battle().get("phase","") not in ["victory","defeat"] and (not _spatial().is_empty() or _battle().is_empty() or connection_lost) and ((paused != paused_sent) or (not paused and timer>=sync_interval) or connection_lost):
			_request("spatial_sync",paused or connection_lost)
	var visuals_paused: bool = paused and not main.online_world
	if not visuals_paused:
		for shot in local_shots.values(): shot.elapsed += delta
	if world_visuals_enabled:
		_update_target_outline(active, paused)
		_render(delta, active, visuals_paused)

func _restore_result_panel() -> void:
	if _battle().get("phase","") == "defeat" and not main.busy:
		main._scene()

func _clear_queued_commands(keep_teleports: bool = false) -> void:
	_cancel_pending_cast()
	buffered_dodge.clear()
	var retained: Array[Dictionary] = []
	for pending in queue:
		if keep_teleports and pending.command == "teleport":
			retained.append(pending)
			continue
		var shot_id = str(pending.get("shotId",""))
		if not shot_id.is_empty(): anticipation.cancel(shot_id)
		local_shots.erase(shot_id)
		visual_outcomes.erase(shot_id)
		if pending.command in ["dodge","teleport"]:
			dash_pending=false
			main.world.cancel_dash()
			main.world.cancel_teleport()
	queue.assign(retained)
	if not retained.is_empty(): dash_pending = true

func before_action() -> bool:
	cancel_aim()
	_cancel_pending_cast()
	_clear_queued_commands()
	while request_busy: await get_tree().process_frame
	if main.online_world: return await main.combat_socket.synchronize()
	if not _spatial().is_empty(): await _request("spatial_sync",true)
	return true

func _request(command: String, paused: bool, direction: Vector2 = Vector2.ZERO, dash_origin: Vector2 = Vector2.INF, dash_endpoint: Vector2 = Vector2.INF, shot_id: String = "", move_sequence: int = 0, target: Vector2 = Vector2.INF, target_life_id: String = "") -> void:
	in_flight += 1
	request_busy = true
	timer = 0
	main.sequence += 1
	var sent_sequence: int = main.sequence
	pending_commands[sent_sequence] = command
	var sent_position: Vector2 = dash_origin if dash_origin != Vector2.INF else main.world.player_position
	var input = {"encounterId":str(_spatial().get("encounterId", "plaza_slime")),"clientId":main.client_id,"sequence":main.sequence,"position":_json(sent_position),"paused":paused,"developerSpeed":main.developer_tools and main.world.developer_speed_boost}
	input.visibleEnemyIds = []
	for enemy in _spatial().get("enemies", []):
		if float(enemy.hp) <= 0: continue
		var point := _point(enemy.position)
		# Flame barrage resolves targets within eight tiles on the server.
		var visible: bool = _in_world_view(point) if world_visuals_enabled else sent_position.distance_to(point) <= 8.0 * float(layout.tuning.tile)
		if visible: input.visibleEnemyIds.append(str(enemy.id))
	if _spatial().is_empty(): input.visibleEnemyIds = ["slime_0"]
	if command in ["fireball","flame_wave","giant_fireball","dodge","teleport"]:
		input.aim = _json(direction)
	if command == "meteor" and target != Vector2.INF: input.target = _json(target)
	if main.online_world and command == "flame_wave" and not target_life_id.is_empty(): input.targetLifeId = target_life_id
	if command == "fireball" and shot_id.is_empty():
		predicted = {"position":sent_position,"direction":direction,"elapsed":0.0}
	var action = {"type":"arcana_combat","command":command,"spatial":input}
	if not shot_id.is_empty(): action.actionId = shot_id
	if not _battle().is_empty(): action.battleId = _battle().id
	var data: Dictionary
	if main.online_world:
		data = await main.combat_socket.request(action)
	else:
		data = await main._api("/api/games/" + main.game_id + "/actions", HTTPClient.METHOD_POST, action)
	if main.online_world and command in ["dodge", "teleport"]:
		_reconcile_online_movement(data, move_sequence, dash_endpoint)
	if main.online_world and int(data.get("transportGeneration",main.combat_socket.connection_generation))==main.combat_socket.connection_generation: anticipation.confirm(shot_id,data)
	if command == "fireball": predicted = {}
	pending_commands.erase(sent_sequence)
	if (main.online_world and int(data.get("transportGeneration",main.combat_socket.connection_generation))!=main.combat_socket.connection_generation) or settling or (main.online_world and data.has("spatialCombat") and int(data.get("worldRevision",0)) < main.online_presence.revision) or (data.has("spatialCombat") and int(data.get("sequence",-1)) < applied_sequence):
		local_shots.erase(shot_id)
		if command in ["dodge","teleport"] and move_sequence == movement_sequence: dash_pending = false
		in_flight -= 1
		request_busy = in_flight > 0
		if not request_busy: settling = false
		return
	if data.has("spatialCombat"):
		applied_sequence = int(data.get("sequence",sent_sequence))
		connection_lost = false
		connection_failures = 0
		retry_delay = 2.0
		var previous_phase = str(_battle().get("phase",""))
		var previous_spells: Array = main._unlocked_spell_ids()
		main.snapshot.state.merge(data.state,true)
		main.snapshot.arcanaSpells = data.get("arcanaSpells",main.snapshot.get("arcanaSpells",[]))
		main._notify_spell_unlocks(previous_spells)
		main.snapshot.availableActions = data.get("availableActions",main.snapshot.get("availableActions",[]))
		if data.get("currentScene") is Dictionary: main.snapshot.currentScene = data.currentScene
		if main.online_world: main.online_presence.reconcile_self(data)
		main.world.battle = _battle().duplicate(true)
		if main.online_world and float(main.world.battle.get("enemyHp",30))<=0: main.world.battle.phase = "victory"
		main.world.enemy_visual_hp = float(_battle().get("enemyHp",30))
		main.world.impact_remaining = 0
		main.previous_enemy_hp = main.world.enemy_visual_hp
		main._update_hud()
		main._refresh_controls()
		visual_age = 0
		paused_sent = paused
		main.last_clock_paused = paused
		main.heartbeat = 0
		if not main.online_world and command == "fireball":
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
			if not main.online_world and command in ["dodge","teleport"]:
				if move_sequence == movement_sequence: main.world.reconcile_dash(server_position,dash_endpoint)
			elif not main.online_world and not dash_pending and main.world.teleport_age<0 and main.world.dash_age<0 and server_position.distance_to(sent_position)>2:
				main.world.player_position = main.world.nearest_walkable(server_position+(main.world.player_position-sent_position))
			for event in _spatial().get("events",[]):
				if int(event.id)<=last_event: continue
				last_event = int(event.id)
				_event(event)
		if command in ["dodge","teleport"] and move_sequence == movement_sequence:dash_pending=false
		_update_predicted_health()
		if previous_phase != _battle().get("phase","") and _battle().get("phase","") in ["victory","defeat"]:
			settling = true
			_clear_queued_commands()
			cancel_aim()
			if _battle().get("phase","")=="victory":
				# The plaza slime respawns as soon as the server confirms the victory.
				var death_started_at: int = Time.get_ticks_msec()
				var death_duration: float = 0.0 if _spatial().get("encounterId","")=="plaza_slime" else (.9 if main.world.effects_enabled and not main.world.reduced_motion else .1)
				# Rewards were granted on defeat of the enemy; finish only acknowledges.
				var result: Dictionary = await main._api("/api/games/"+main.game_id+"/actions",HTTPClient.METHOD_POST,{"type":"arcana_combat","command":"finish","battleId":_battle().id})
				var remaining: float = death_duration-float(Time.get_ticks_msec()-death_started_at)/1000.0
				if remaining>0: await get_tree().create_timer(remaining).timeout
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
		if world_visuals_enabled and command == "fireball" and pending_cast.is_empty(): main.world_renderer.hero.cancel_cast()
		visual_outcomes.erase("predicted")
		_update_predicted_health()
		if data.get("error","") in ["network","invalid_response"]:
			failed_at = Time.get_ticks_msec()/1000.0
			connection_lost = true
			_clear_queued_commands()
			connection_failures = mini(connection_failures + 1, 5)
			retry_delay = minf(30.0, pow(2.0, connection_failures))
		if connection_failures <= 1: main.ui.toast(data.get("message","전투 연결을 확인해 주세요."))
		# Never replay uncertain actions after disconnect. A paused sync reads
		# the server result before new combat inputs are admitted.
	in_flight -= 1
	request_busy = in_flight > 0
	if not request_busy: settling = false

func _reconcile_online_movement(data: Dictionary, move_sequence: int, expected: Vector2) -> void:
	if move_sequence != movement_sequence or settling or not expected.is_finite() \
		or not data.has("spatialCombat") or data.has("error") or data.get("resync", false): return
	if int(data.get("transportGeneration", main.combat_socket.connection_generation)) != main.combat_socket.connection_generation \
		or int(data.get("placeRevision", -1)) != int(main.snapshot.get("onlinePlaceRevision", 0)): return
	# A newer presence frame can supersede the reply's combat state. Its landing still
	# belongs to this exact predicted movement, so apply only the endpoint correction.
	var position := _snapshot_point(data.get("position"))
	if position.is_finite(): main.world.reconcile_dash(position, expected)

func _update_predicted_health() -> void:
	var pending = 0.0
	for outcome in visual_outcomes.values():
		if not outcome.settled: pending += float(outcome.damage)
	main.world.predicted_enemy_damage = pending
	# Prediction can empty the meter; only the server confirms death and rewards.
	main.world.enemy_visual_hp = maxf(0.0,float(_battle().get("enemyHp",30))-pending)

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
	if event.has("id") and not event.get("_predicted", false) and not event.get("_anticipated", false):
		confirmed_combat_event.emit(event)
	if not event.get("_anticipated",false) and anticipation.suppress_event(event): return
	if world_visuals_enabled: _show_event(event)
	if event.kind=="defeat":
		main.world.player_position = main.world.spawn_position
		if main.online_world: main.online_presence.reset_prediction()
		main.world.path.clear()
		main.world.touch_direction = Vector2.ZERO
	if event.kind=="reset": selected = false

func _show_event(event: Dictionary) -> void:
	var point = _point(event.get("targetPosition",event.position))
	if event.kind in ["hit","miss","explosion","meteor"] and main.world.effects_enabled:
		var burst: Node2D = effect_pool.take_flame(true,event.kind == "miss")
		burst.position = main.world_renderer.map_point(_point(event.position),.6)
		burst.scale = Vector2.ONE*(3.0 if event.kind=="meteor" else 2.0 if event.kind=="explosion" else 1.0)
		flame_bursts.append(burst)
	if event.kind in ["enemy_down","victory"] and is_instance_valid(reward_effects):
		if event.kind == "enemy_down" and str(event.get("enemyId", "")) == "slime_0" \
			and main.world_renderer.uses_plaza_v2() and main.world.effects_enabled and not main.world.reduced_motion:
			main.world_renderer.plaza3d.play_slime_defeat(point)
		var amounts: Dictionary = event.get("rewards",{})
		if int(amounts.get("slimeMucus",0))>0: reward_effects.show_slime_loot(str(_battle().get("id",""))+":"+str(event.id),int(amounts.slimeMucus))
		var meat := int(amounts.get("rawMeat", 0))
		if meat > 0 and event.get("actorId", "") == main.online_presence.character_id:
			main.ui.toast("+%d 고기" % meat)
		if int(amounts.get("money",0))>0: reward_effects.show_reward(str(_battle().get("id",""))+":"+str(event.id),point,int(amounts.get("xp",0)),int(amounts.money))
	if event.kind == "wave" and main.world.effects_enabled:
		var wave = _line(Color(1.0,.45,.12,.65))
		wave_effects.append({"node":wave,"at":point,"direction":_point(event.get("direction",{"x":0,"y":-1})),"age":0.0,"actionId":event.get("clientActionId","")})
	if event.kind == "absorb": guard_flash = .15
	if event.kind == "hurt" and float(event.get("amount",0))>0:
		var source := _snapshot_point(event.get("sourcePosition"))
		var incoming: Vector2 = point - source if source.is_finite() else main.world.player_position - enemy_position()
		main.world_renderer.hero.play_hurt(incoming)
	# Movement acknowledgements reuse evade; only avoided attacks show the label.
	if event.kind in ["hit","hurt","evade","absorb"] and not (event.kind == "evade" and event.has("movement")):
		var amount := int(event.get("amount", 0))
		var text := str(amount)
		var color := Color("ffeed0")
		match event.kind:
			"hit":
				if int(event.get("slimeCounterBonus", 0)) > 0:
					text = "반격 %d" % amount
					color = Color("ffd46c")
			"hurt":
				text = "−%d" % amount
				color = Color("ff8b9e")
			"evade":
				text = "회피"
				color = Color("cbeeb7")
			"absorb":
				text = "흡수 %d" % amount
				color = Color("bde7ff")
		var value = effect_pool.take_label(text, color)
		var lane := 0
		for effect in transient:
			if effect.age < .24 and point.distance_squared_to(effect.at) < 36.0: lane += 1
		transient.append({"node":value,"at":point,"age":0.0,"lane":lane})
		if event.kind=="hit" and _hit_matches_enemy_life(event):
			if event.get("enemyId", "") == "meadow-ox" and main.world.meadow_active:
				main.world_renderer.meadow_ox.play_hit()
			additional_visuals.hit_enemy(str(event.get("enemyId","")))

func _hit_matches_enemy_life(event: Dictionary) -> bool:
	var life_id := str(event.get("enemyLifeId", ""))
	if life_id.is_empty(): return true
	for enemy: Dictionary in _spatial().get("enemies", []):
		if enemy.get("id") == event.get("enemyId"): return enemy.get("lifeId", "") == life_id
	return false

func _line(color: Color) -> Polygon2D:
	var node=Polygon2D.new();node.color=color;node.z_index=3990
	main.world_renderer.add_child(node)
	return node
func _draw_line(node: Polygon2D,from: Vector2,to: Vector2,width: float) -> void:
	var side=(to-from).normalized().orthogonal()*width
	var points=PackedVector2Array()
	for point in [from+side,to+side,to-side,from-side]:points.append(main.world_renderer.map_point(point,.055))
	node.polygon=points

func _update_attack_path(spatial: Dictionary, active: bool) -> void:
	var action := str(spatial.get("slimeAction", ""))
	var behavior := str(spatial.get("behavior", ""))
	var show_path := active and action in ["leap", "charge"] and behavior in ["prepare", "attack"] \
		and not bool(spatial.get("jumpHit", false))
	var from := _snapshot_point(spatial.get("enemy" if behavior == "attack" else "jumpFrom"))
	var to := _snapshot_point(spatial.get("jumpTo"))
	show_path = show_path and from.is_finite() and to.is_finite()
	jump_line.visible = show_path
	jump_edge.visible = show_path
	if not show_path: return
	var radius := float(spatial.get("dangerRadius", float(layout.tuning.enemyRadius) + float(layout.tuning.playerRadius)))
	var angle := (to - from).angle()
	var points := PackedVector2Array()
	# The rounded ends show that the sweep can hit alongside the origin and landing point.
	for step in range(9):
		var offset := Vector2.from_angle(angle - PI * 0.5 + PI * step / 8.0) * radius
		points.append(main.world_renderer.map_point(to + offset, .055))
	for step in range(9):
		var offset := Vector2.from_angle(angle + PI * 0.5 + PI * step / 8.0) * radius
		points.append(main.world_renderer.map_point(from + offset, .055))
	var committed := bool(spatial.get("targetLocked", false)) or behavior == "attack"
	var danger := Color("f49d71") if committed else Color("d4abf5")
	jump_line.polygon = points
	jump_line.color = Color(danger, .22 if committed else .12)
	jump_edge.points = points
	jump_edge.default_color = Color(danger, .82 if committed else .42)

func _projectile_snapshot_age(spatial: Dictionary) -> float:
	if not main.online_world: return minf(visual_age, .1)
	var presence = main.online_presence
	var stamp := float(spatial.get("elapsed", -1.0))
	if stamp < 0.0 or presence.server_time < 0.0: return 0.0
	var confirmed_time := float(presence.server_time) + float(Time.get_ticks_msec() - presence.received_at) / 1000.0
	return clampf(confirmed_time - stamp, 0.0, .1)
func _preview_end(from: Vector2, direction: Vector2) -> Vector2:
	var distance = _spell_range(aim_spell)
	for step in range(1,int(distance)+1):
		var point = from+direction*step
		if not main.world._can_stand(point): return point
		if point.distance_to(displayed_enemy)<=float(layout.tuning.enemyRadius): return point
	return from+direction*distance

func _draw_cone(node: Polygon2D, origin: Vector2, direction: Vector2, radius: float, clip: bool = false) -> void:
	var points=PackedVector2Array([main.world_renderer.map_point(origin,.07)])
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
		if i==0:points.append(main.world_renderer.map_point(end_a,.07))
		points.append(main.world_renderer.map_point(end_b,.07))
	node.polygon=points

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

func _update_enemy_health_hud() -> void:
	var renderer=main.world_renderer
	var point=displayed_enemy if main.world.battle.has("spatial") else main.world.CityMap.HUNTING_HOME
	var center=_screen(point,1.25)
	var edge=_screen(point+Vector2(14.4,0),1.25)
	var shown=renderer.enemy_meter_visible and main.world.indoor.is_empty() and not main.ui.overlay.visible and main.get_viewport().get_visible_rect().has_point(center)
	var enemies: Array = _spatial().get("enemies", [])
	var max_hp := maxf(1.0, float(enemies[0].get("maxHp", 30.0))) if not enemies.is_empty() else 30.0
	enemy_health_hud.update_meter(center,center.distance_to(edge),float(main.world.enemy_visual_hp)/max_hp,float(renderer.enemy_trail_hp)/max_hp,shown)

func _render(delta: float, active: bool, paused: bool) -> void:
	main.world.spatial_selected = active and selected
	selected_ring.visible = active and selected and visible_enemy()
	aim_line.visible = active and manual and aim_owner != -1 and aim_spell in ["fireball","giant_fireball"]
	aim_cone.visible = active and manual and aim_owner != -1 and aim_spell == "flame_wave"
	aim_end_ring.visible = aim_line.visible
	guard_ring.visible = not main.snapshot.is_empty() and (float(main._combat().get("guard",{}).get("amount",0))>0 or anticipation.guard_pending()) and main.world.indoor.is_empty()
	if guard_ring.visible:
		guard_ring.position = main.world_renderer.map_point(main.world.player_position,.2)
		var size_factor: float = 1.0 if anticipation.guard_pending() else .8+.2*float(main._combat().guard.seconds)/4.0
		if guard_flash > 0 and not main.world.reduced_motion: size_factor *= 1.08
		guard_ring.scale = Vector2.ONE*size_factor
	if not paused: guard_flash = maxf(0,guard_flash-delta)
	if aim_cone.visible: _draw_cone(aim_cone,main.world.player_position,aim_direction,_spell_range(aim_spell),true)
	var spatial := _spatial()
	_update_attack_path(spatial, active)
	if active:
		var monster: Node2D = main.world_renderer.meadow_ox if main.world.meadow_active else main.world_renderer.plaza_slime
		if main.online_world:
			var sample: Vector2 = main.world_renderer.rendered_enemy_point
			displayed_enemy = sample if sample.is_finite() else enemy_position()
			if not sample.is_finite(): monster.position = main.world_renderer.map_point(displayed_enemy)
		elif not paused:
			displayed_enemy = displayed_enemy.lerp(enemy_position(),1.0-exp(-delta*24)) if not main.world.reduced_motion else enemy_position()
		if not main.online_world: monster.position = main.world_renderer.map_point(displayed_enemy)
		selected_ring.position = main.world_renderer.map_point(displayed_enemy,.04)
	if aim_line.visible:
		var end = _preview_end(main.world.player_position,aim_direction)
		_draw_line(aim_line,main.world.player_position,end,1.0)
		aim_end_ring.position = main.world_renderer.map_point(end,.06)
	var living: Dictionary = {}
	var snapshot_age := _projectile_snapshot_age(spatial)
	for shot in spatial.get("projectiles",[]):
		var data: Dictionary = shot.duplicate(true)
		var point = _point(shot.position)
		if not paused: point += _point(shot.direction)*minf(float(shot.remaining),float(layout.tuning.projectileSpeed)*snapshot_age)
		data.position = _json(point)
		living[str(shot.id)] = data
	for id in local_shots:
		var shot: Dictionary = local_shots[id]
		var spell_id: String = str(shot.get("spellId","fireball"))
		if spell_id=="flame_barrage": shot.direction = (enemy_position()-Vector2(shot.position)).normalized()
		var point: Vector2 = shot.position+shot.direction*minf(_spell_range(spell_id),float(shot.elapsed)*float(layout.tuning.projectileSpeed))
		living[id] = {"position":_json(point),"origin":_json(shot.position),"direction":_json(shot.direction),"spellId":spell_id}
	for id in projectile_nodes.keys():
		if not living.has(id):
			projectile_nodes[id].scale = Vector2.ONE
			effect_pool.release_flame(projectile_nodes[id])
			projectile_nodes.erase(id)
	for id in living:
		if not projectile_nodes.has(id): projectile_nodes[id] = effect_pool.take_flame()
		var node: Node2D = projectile_nodes[id]
		var shot: Dictionary = living[id]
		var heading = _point(shot.direction)
		node.visible = active
		node.scale = Vector2.ONE*(2.0 if shot.get("spellId","")=="giant_fireball" else 1.0)
		var point = _point(shot.position)
		if str(shot.get("spellId","fireball")) in ["fireball","giant_fireball"] and shot.has("origin"):
			var origin = _point(shot.origin)
			# Continue between snapshots and preserve progress when a local shot is acknowledged.
			var distance = node.advance_flight(origin.distance_to(point),float(layout.tuning.projectileSpeed),_spell_range(str(shot.get("spellId","fireball"))),delta,paused)
			point = origin+heading*distance
		node.position = main.world_renderer.map_point(point,.75)
		node.direction = heading
		node.light_enabled = main.world.effects_enabled
		node.update_pose(main.world_renderer.camera,delta,paused,main.world.reduced_motion)
	additional_visuals.render(delta,active,paused)
	for burst in flame_bursts:
		burst.light_enabled = main.world.effects_enabled
		burst.visible = active and main.world.effects_enabled
		burst.update_pose(main.world_renderer.camera,delta,paused,main.world.reduced_motion)
		if burst.finished():
			burst.scale = Vector2.ONE
			effect_pool.release_flame(burst)
	flame_bursts = flame_bursts.filter(func(effect): return not effect.finished())
	_update_enemy_health_hud()
	for effect in transient:
		if not paused: effect.age += delta
		effect.node.visible = active
		var rise := 0.0 if main.world.reduced_motion else .62 * (1.0 - pow(1.0 - clampf(effect.age / FEEDBACK_LIFETIME, 0.0, 1.0), 2.0))
		effect.node.position = main.world_renderer.map_point(effect.at, 1.1 + rise) \
			- Vector2(effect.node.get_minimum_size().x * .5, 25.0 * int(effect.lane))
		effect.node.modulate.a = 1.0 - smoothstep(.42, FEEDBACK_LIFETIME, effect.age)
		if effect.age >= FEEDBACK_LIFETIME: effect_pool.release_label(effect.node)
	transient = transient.filter(func(effect): return effect.age < FEEDBACK_LIFETIME)
	for wave in wave_effects:
		if not paused: wave.age += delta
		wave.node.visible = active and main.world.effects_enabled
		_draw_cone(wave.node,wave.at,wave.direction,_spell_range("flame_wave") if main.world.reduced_motion else _spell_range("flame_wave")*minf(1,wave.age/.10),true)
		var wave_color = Color(1.0,.45,.12,maxf(0,.65*(1-wave.age/.3)))
		wave.node.color = wave_color
		if wave.age>=.3: wave.node.queue_free()
	wave_effects = wave_effects.filter(func(wave): return wave.age<.3)
