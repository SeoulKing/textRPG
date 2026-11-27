extends Node2D
## Server phases drive the performance. Only the server awards catches and XP.
const TOOLS = preload("res://art/export/fishing-v3-mystic/tools.res")

# Shoulder, elbow, upper-body lean, and rod angle along the cast direction.
const CARRY := Vector4(-0.75, -0.35, 0.0, 0.0)
const GATHER := Vector4(-0.88, -0.56, -0.025, -0.18)
const WINDUP := Vector4(-2.04, -1.13, -0.14, -1.0)
const RELEASE := Vector4(-1.49, -0.13, 0.19, 1.0)
const WAITING := Vector4(-1.04, -0.34, 0.04, 0.62)
const BITE := Vector4(-1.10, -0.40, 0.06, 0.44)
const HOOK := Vector4(-1.46, -0.66, -0.16, -0.95)
const REEL := Vector4(-1.14, -0.45, -0.03, 0.25)
const LIFT := Vector4(-1.42, -0.72, -0.12, -0.76)

const CAST_GATHER := 0.14
const CAST_WINDUP := 0.41
const CAST_RELEASE := 0.59
const CAST_FOLLOW := 0.67
const CAST_SETTLE := 0.98
const CAST_LAND := 1.03
const CATCH_LIFT := 0.42
const CATCH_RETURN := 0.80
const CATCH_END := 1.32
const CARRY_TURN_SPEED := 11.0

var main: Node
var session_id := ""
var phase := ""
var session_age := 0.0
var phase_age := 0.0
var heading := Vector2.DOWN
var hand := Vector2.ZERO
var tip := Vector2.ZERO
var bobber := Vector2.ZERO
var fish_position := Vector2.ZERO
var drawing := false
var active := false
var reduced := false
var _pose := CARRY
var _phase_start := CARRY
var _cast_origin := Vector2.ZERO
var _cast_start_yaw := 0.0
var _line_released := false
var _catch_origin := Vector2.ZERO
var _carrying := false
var _carry_yaw := 0.0

func _process(delta: float) -> void:
	var renderer = main.world_renderer
	var hero = renderer.hero
	renderer.fishing_view = main.fishing.visible
	var state: Dictionary = main.fishing.state if main.fishing.visible else {}
	active = not state.is_empty() and state.get("bobber") is Dictionary and main.world.indoor.is_empty()
	var equipped: bool = str(main._state().get("flags", {}).get("arcana_life_tool", "")) == "fishingRod"
	var can_carry: bool = equipped and not main.life.blocking() and not main._online_fighting() and main.world.bench_state.is_empty() and hero.cast_age < 0.0 and hero.dash_age < 0.0 and main.world.teleport_age < 0.0 and hero.aim_facing.length_squared() < 0.001
	var indoor_avatar: bool = main.world.indoor in ["arcana_shop", "arcana_inn"]
	reduced = main.world.reduced_motion or not main.world.effects_enabled
	drawing = false
	if active:
		present_session(state, hero, delta)
		_carrying = false
		return
	elif can_carry and not main.life.axe_equipped() and (hero.visible or indoor_avatar):
		_sync_carry(hero, delta)
	else:
		session_id = ""
		_pose = CARRY
		_carrying = false
	visible = drawing
	queue_redraw()

func _sync_carry(hero: Node2D, delta: float) -> void:
	session_id = ""
	_pose = CARRY
	var target_yaw: float = hero.last_yaw - hero.camera_yaw
	var frame := minf(delta, 0.025)
	var response := 1.0 - exp(-frame * 18.0)
	if not _carrying:
		_carry_yaw = target_yaw
	else:
		var difference := wrapf(target_yaw - _carry_yaw, -PI, PI)
		_carry_yaw += clampf(difference * response, -frame * CARRY_TURN_SPEED, frame * CARRY_TURN_SPEED)
	var wrist: Variant = hero.present_rod_carry(_carry_yaw)
	if wrist is Vector2:
		hero.pose_rod(_carry_yaw, 0.0, 1.0, 0.0, reduced)
	_carrying = wrist is Vector2

## Called after this actor's ordinary pose, for the local angler and for spectators.
func present_session(state: Dictionary, hero: Node2D, delta: float) -> void:
	active = true
	drawing = false
	reduced = main.world.reduced_motion or not main.world.effects_enabled
	_sync_session(state, hero, delta)
	visible = drawing
	queue_redraw()

func _sync_session(state: Dictionary, hero: Node2D, delta: float) -> void:
	var next_id: String = str(state.id)
	var next_phase: String = str(state.phase)
	var new_cast := next_id != session_id
	var target: Dictionary = state.bobber
	var landing: Vector2 = main.world_renderer.map_point(Vector2(float(target.x), float(target.y))) - hero.position
	if new_cast:
		session_id = next_id
		session_age = _elapsed_from_server(state, "castStartedAt")
		_cast_start_yaw = _carry_yaw + hero.camera_yaw if _carrying else hero.last_yaw
		_line_released = false
		phase = ""
		_pose = CARRY if next_phase == "waiting" else WAITING
		bobber = landing
	else:
		session_age += delta
	if next_phase != phase:
		_phase_start = _pose
		_catch_origin = bobber
		phase_age = _elapsed_from_server(state, "phaseStartedAt")
		phase = next_phase
	else:
		phase_age += delta

	var direction: Dictionary = state.direction
	heading = Vector2(float(direction.x), float(direction.y)).normalized()
	if heading.is_zero_approx():
		heading = Vector2.DOWN
	_pose = _sample_pose()
	var displayed := CARRY.lerp(_pose, 0.35) if reduced else _pose
	var shoulder_amount := _shoulder_carry_amount()
	var crank := 0.0
	if phase == "reeling" and not reduced:
		crank = sin(phase_age * 7.5) * smoothstep(0.13, 0.40, phase_age)
	var facing := heading
	if phase == "waiting" and session_age < CAST_WINDUP and not reduced:
		var yaw := lerp_angle(_cast_start_yaw, atan2(heading.x, heading.y), smoothstep(0.0, CAST_WINDUP, session_age))
		facing = Vector2(sin(yaw), cos(yaw))
	var wrist: Variant = hero.present_fishing_pose(facing, Vector3(displayed.x, displayed.y, displayed.z), shoulder_amount, crank, _cast_drive())
	if not wrist is Vector2:
		return
	_place_rod(hero, wrist, displayed.w, shoulder_amount)

	if not _line_released and (session_age >= CAST_RELEASE or reduced or phase != "waiting"):
		_line_released = true
		_cast_origin = tip
	bobber = landing
	if not _line_released:
		# A short hanging leader swings forward on the backswing and trails the wrist on the throw.
		var backswing := sin(PI * smoothstep(CAST_GATHER, CAST_WINDUP, session_age))
		var forward := sin(PI * smoothstep(CAST_WINDUP, CAST_RELEASE, session_age))
		var leader := Vector2.DOWN * 12.0 + landing.normalized() * (backswing * 6.0 - forward * 10.0)
		bobber = tip + leader * (1.0 - smoothstep(CAST_RELEASE - 0.075, CAST_RELEASE, session_age))
	elif phase == "waiting" and session_age < CAST_LAND and not reduced:
		var flight := clampf(inverse_lerp(CAST_RELEASE, CAST_LAND, session_age), 0.0, 1.0)
		var arc_height := clampf(_cast_origin.distance_to(landing) * 0.26, 18.0, 56.0)
		bobber = _cast_origin.lerp(landing, flight) + Vector2.UP * (4.0 * flight * (1.0 - flight) * arc_height)
	elif not reduced:
		match phase:
			"bite":
				var pulse := sin(phase_age * 22.0) * exp(-phase_age * 2.8)
				bobber += Vector2(pulse * 4.0, absf(pulse) * 7.0)
			"reeling":
				bobber += Vector2(sin(phase_age * 13.0) * 3.0, sin(phase_age * 8.0) * 2.0)
			"waiting":
				var on_water := maxf(session_age - CAST_LAND, 0.0)
				var splash_dip := 5.0 * sin(on_water * 23.0) * exp(-on_water * 8.0)
				bobber.y += splash_dip + sin(on_water * 3.0) * 1.5 * smoothstep(0.0, 0.3, on_water)
	if phase == "success":
		var rise := smoothstep(0.0, CATCH_LIFT, phase_age)
		var near_hand := hand + Vector2(heading.x * 24.0 + heading.y * 9.0, 13.0)
		var arc := 42.0 if not reduced else 0.0
		fish_position = _catch_origin.lerp(near_hand, rise) - Vector2(0, sin(rise * PI) * arc)

func _elapsed_from_server(state: Dictionary, field: String) -> float:
	if not state.has(field):
		return 0.0
	return maxf(0.0, (main.life.now() - float(state[field])) / 1000.0)

func _sample_pose() -> Vector4:
	match phase:
		"waiting":
			if session_age < CAST_GATHER:
				return _phase_start.lerp(GATHER, smoothstep(0.0, CAST_GATHER, session_age))
			if session_age < CAST_WINDUP:
				return GATHER.lerp(WINDUP, smoothstep(CAST_GATHER, CAST_WINDUP, session_age))
			if session_age < CAST_FOLLOW:
				# Hips lead the shoulder, then the elbow opens and the rod overtakes the hand.
				return Vector4(
					lerpf(WINDUP.x, RELEASE.x, smoothstep(CAST_WINDUP, CAST_RELEASE - 0.035, session_age)),
					lerpf(WINDUP.y, RELEASE.y, smoothstep(CAST_WINDUP + 0.055, CAST_RELEASE + 0.015, session_age)),
					lerpf(WINDUP.z, RELEASE.z, smoothstep(CAST_WINDUP, CAST_RELEASE - 0.065, session_age)),
					lerpf(WINDUP.w, RELEASE.w, smoothstep(CAST_WINDUP + 0.045, CAST_FOLLOW, session_age)))
			var resting := WAITING
			if not reduced:
				# A breath through the shoulders trails into the rod tip.
				var breath := sin((session_age - CAST_SETTLE) * 1.65)
				resting += Vector4(0.032, -0.022, 0.018, -0.035) * breath
			var settle := RELEASE.lerp(resting, smoothstep(CAST_FOLLOW, CAST_SETTLE, session_age))
			if not reduced and session_age < CAST_SETTLE:
				var recovery := inverse_lerp(CAST_FOLLOW, CAST_SETTLE, session_age)
				settle.w -= 0.12 * sin(recovery * TAU) * sin(recovery * PI)
			# At the pond, an unanswered nibble settles back into the same cast.
			if phase_age < 0.22 and session_age > CAST_LAND:
				return _phase_start.lerp(resting, smoothstep(0.0, 0.22, phase_age))
			return settle
		"bite":
			return _phase_start.lerp(BITE, smoothstep(0.0, 0.14, phase_age))
		"reeling":
			if phase_age < 0.13:
				return _phase_start.lerp(HOOK, smoothstep(0.0, 0.13, phase_age))
			var winding := REEL
			if not reduced:
				var pull := sin((phase_age - 0.40) * 5.2)
				winding += Vector4(-0.085, -0.10, -0.045, -0.12) * pull
			return HOOK.lerp(winding, smoothstep(0.13, 0.40, phase_age))
		"success":
			var lifted := _phase_start.lerp(LIFT, smoothstep(0.0, CATCH_LIFT, phase_age))
			return lifted.lerp(CARRY, smoothstep(CATCH_RETURN, CATCH_END, phase_age))
		"escaped":
			return _phase_start.lerp(CARRY, smoothstep(0.0, 0.43, phase_age))
	return CARRY

func _cast_drive() -> float:
	if phase != "waiting" or session_age >= CAST_SETTLE: return 0.0
	var drive := -smoothstep(0.0, CAST_WINDUP - 0.07, session_age)
	drive += 2.0 * smoothstep(CAST_WINDUP - 0.07, CAST_RELEASE - 0.055, session_age)
	drive -= smoothstep(CAST_RELEASE, CAST_SETTLE, session_age)
	return drive * (0.25 if reduced else 1.0)

func cast_flex_amount() -> float:
	if reduced: return 0.0
	match phase:
		"waiting":
			# Each swing loads the blank away from the accelerating hand. It rebounds as the wrist brakes.
			var back_load := sin(PI * smoothstep(CAST_GATHER, CAST_WINDUP, session_age)) * 0.32
			var forward_load := smoothstep(CAST_WINDUP - 0.04, CAST_RELEASE - 0.055, session_age)
			forward_load *= 1.0 - smoothstep(CAST_RELEASE - 0.055, CAST_FOLLOW - 0.02, session_age)
			var rebound := smoothstep(CAST_RELEASE, CAST_FOLLOW + 0.015, session_age)
			rebound *= 1.0 - smoothstep(CAST_FOLLOW + 0.015, CAST_SETTLE, session_age)
			return back_load - 0.88 * forward_load + 0.30 * rebound + 0.05 * smoothstep(CAST_FOLLOW, CAST_SETTLE, session_age)
		"bite": return lerpf(0.05, 0.27, smoothstep(0.0, 0.12, phase_age))
		"reeling": return lerpf(0.27, 0.68 + 0.14 * sin(phase_age * 7.5), smoothstep(0.0, 0.18, phase_age))
		"success": return 0.68 * (1.0 - smoothstep(0.0, CATCH_LIFT, phase_age))
	return 0.0

func _shoulder_carry_amount() -> float:
	match phase:
		"waiting":
			return 1.0 - smoothstep(0.0, CAST_WINDUP - 0.08, session_age)
		"success":
			return smoothstep(CATCH_RETURN, CATCH_END, phase_age)
		"escaped":
			return smoothstep(0.0, 0.43, phase_age)
	return 0.0

func _place_rod(hero: Node2D, wrist: Vector2, posture: float, shoulder_amount: float) -> void:
	global_position = hero.global_position
	z_as_relative = false
	z_index = hero.z_index
	var yaw: float = hero.last_yaw - hero.camera_yaw
	hand = hero.art.transform * wrist
	tip = hero.art.transform * hero.pose_rod(yaw, posture, shoulder_amount, cast_flex_amount(), reduced)
	drawing = true

func _draw() -> void:
	if not drawing or not active: return
	if phase == "success":
		var opacity := 1.0 - smoothstep(CATCH_RETURN, CATCH_END, phase_age)
		if opacity > 0.0:
			draw_line(tip, fish_position, Color(1.0, 0.96, 0.85, opacity), 1.0, false)
			draw_texture_rect_region(TOOLS, Rect2(fish_position - Vector2(18, 14), Vector2(36, 28)), Rect2(33, 49, 18, 14), Color(1.0, 1.0, 1.0, opacity))
			if not reduced:
				for i in range(5):
					draw_circle(fish_position + Vector2(sin(float(i) * 2.1) * 12.0, float(i) * 9.0 + 8.0), 1.5, Color(0.73, 0.91, 0.93, opacity))
		return
	if phase == "escaped": return
	var opacity := 1.0 if _line_released else smoothstep(0.0, CAST_GATHER, session_age)
	var slack := 0.0
	if phase == "waiting" and not reduced:
		slack = minf(tip.distance_to(bobber) * 0.09, 10.0)
		if session_age < CAST_LAND:
			slack *= smoothstep(CAST_RELEASE, CAST_LAND, session_age)
	var line := PackedVector2Array()
	for segment in range(9):
		var along := float(segment) / 8.0
		line.append(tip.lerp(bobber, along) + Vector2.DOWN * (4.0 * slack * along * (1.0 - along)))
	draw_polyline(line, Color(Color("fff4d9"), opacity), 1.0)
	draw_texture_rect_region(TOOLS, Rect2(bobber - Vector2(5, 5), Vector2(10, 10)), Rect2(50, 41, 10, 10), Color(1.0, 1.0, 1.0, opacity))
	if session_age >= CAST_LAND or reduced:
		for ring in range(2):
			var radius: float = 8+float(ring)*7+(0 if reduced else fmod(session_age*9,7))
			var ripple := PackedVector2Array()
			for i in range(25):ripple.append(bobber+Vector2(cos(float(i)*TAU/24)*radius,sin(float(i)*TAU/24)*radius*.5+4))
			draw_polyline(ripple,Color(.8,.95,1,.65-float(ring)*.2),1,false)
	if phase=="bite":
		draw_rect(Rect2(bobber+Vector2(-2,-32),Vector2(4,14)),Color("ffe29a"))
		draw_rect(Rect2(bobber+Vector2(-2,-14),Vector2(4,4)),Color("ffe29a"))
