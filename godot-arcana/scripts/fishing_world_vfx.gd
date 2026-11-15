extends Node2D
## Server phases drive the performance. Only the server awards catches and XP.
const TOOLS = preload("res://art/export/fishing-v3-mystic/tools.res")
const RodVisual = preload("res://scripts/fishing_rod_visual.gd")

# Shoulder, elbow, upper-body lean, and rod angle along the cast direction.
const CARRY := Vector4(-0.75, -0.35, 0.0, 0.0)
const WINDUP := Vector4(-1.08, -0.78, -0.12, -1.0)
const RELEASE := Vector4(-1.38, -0.16, 0.16, 1.0)
const WAITING := Vector4(-1.04, -0.34, 0.04, 0.62)
const BITE := Vector4(-1.10, -0.40, 0.06, 0.44)
const HOOK := Vector4(-1.46, -0.66, -0.16, -0.95)
const REEL := Vector4(-1.14, -0.45, -0.03, 0.25)
const LIFT := Vector4(-1.42, -0.72, -0.12, -0.76)

const CAST_WINDUP := 0.19
const CAST_RELEASE := 0.31
const CAST_SETTLE := 0.58
const CAST_LAND := 0.72
const CATCH_LIFT := 0.42
const CATCH_RETURN := 0.80
const CATCH_END := 1.32
const CARRY_TURN_SPEED := 11.0
const CARRY_ROD_TURN_SPEED := 8.0

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
var _line_released := false
var _catch_origin := Vector2.ZERO
var _carrying := false
var _carry_yaw := 0.0
var _rod_behind := false

func _process(delta: float) -> void:
	var renderer = main.world_renderer
	var hero = renderer.hero
	renderer.fishing_view = main.fishing.visible
	var state: Dictionary = main.fishing.state if main.fishing.visible else {}
	active = not state.is_empty() and state.get("bobber") is Dictionary and main.world.indoor.is_empty()
	var equipped: bool = str(main._state().get("flags", {}).get("arcana_life_tool", "")) == "fishingRod"
	var can_carry: bool = equipped and not main._online_fighting() and main.world.bench_state.is_empty() and hero.cast_age < 0.0 and hero.dash_age < 0.0 and main.world.teleport_age < 0.0 and hero.aim_facing.length_squared() < 0.001
	var shop: bool = main.world.indoor == "arcana_shop"
	reduced = main.world.reduced_motion or not main.world.effects_enabled
	drawing = false
	if active:
		_sync_session(state, hero, delta)
		_carrying = false
	elif can_carry and (hero.visible or shop):
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
		var shaft: Vector2 = hero.shoulder_rod_vector(_carry_yaw, reduced)
		if _carrying:
			var last_shaft := tip - hand
			var difference := wrapf(shaft.angle() - last_shaft.angle(), -PI, PI)
			var angle := last_shaft.angle() + clampf(difference * response, -frame * CARRY_ROD_TURN_SPEED, frame * CARRY_ROD_TURN_SPEED)
			shaft = Vector2.from_angle(angle) * lerpf(last_shaft.length(), shaft.length(), response)
		hand = wrist
		tip = hand + shaft
		hero.draw_rod_behind_actor(hand, tip)
	_carrying = wrist is Vector2

func _sync_session(state: Dictionary, hero: Node2D, delta: float) -> void:
	var next_id: String = str(state.id)
	var next_phase: String = str(state.phase)
	if next_id != session_id:
		session_id = next_id
		session_age = 0.0
		_line_released = false
		phase = ""
	else:
		session_age += delta
	if next_phase != phase:
		_phase_start = _pose
		_catch_origin = bobber
		phase_age = 0.0
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
	var wrist: Variant = hero.present_fishing_pose(heading, Vector3(displayed.x, displayed.y, displayed.z), shoulder_amount)
	if not wrist is Vector2:
		return
	_place_rod(hero, wrist, displayed.w, shoulder_amount)

	var target: Dictionary = state.bobber
	var landing: Vector2 = main.world_renderer.map_point(Vector2(float(target.x), float(target.y))) - position
	if not _line_released and (session_age >= CAST_RELEASE or reduced):
		_line_released = true
		_cast_origin = tip
	bobber = landing
	if phase == "waiting" and _line_released and session_age < CAST_LAND and not reduced:
		var flight := clampf(inverse_lerp(CAST_RELEASE, CAST_LAND, session_age), 0.0, 1.0)
		bobber = _cast_origin.lerp(landing, flight) - Vector2(0, sin(flight * PI) * 62.0)
	elif not reduced:
		match phase:
			"bite":
				var pulse := sin(phase_age * 22.0) * exp(-phase_age * 2.8)
				bobber += Vector2(pulse * 4.0, absf(pulse) * 7.0)
			"reeling":
				bobber += Vector2(sin(phase_age * 13.0) * 3.0, sin(phase_age * 8.0) * 2.0)
			"waiting":
				bobber.y += sin(session_age * 3.0) * 1.5 * smoothstep(CAST_LAND, CAST_LAND + 0.18, session_age)
	if phase == "success":
		var rise := smoothstep(0.0, CATCH_LIFT, phase_age)
		var near_hand := hand + Vector2(heading.x * 24.0 + heading.y * 9.0, 13.0)
		var arc := 42.0 if not reduced else 0.0
		fish_position = _catch_origin.lerp(near_hand, rise) - Vector2(0, sin(rise * PI) * arc)

func _sample_pose() -> Vector4:
	match phase:
		"waiting":
			if session_age < CAST_WINDUP:
				return _phase_start.lerp(WINDUP, smoothstep(0.0, CAST_WINDUP, session_age))
			if session_age < CAST_RELEASE:
				return WINDUP.lerp(RELEASE, smoothstep(CAST_WINDUP, CAST_RELEASE, session_age))
			return RELEASE.lerp(WAITING, smoothstep(CAST_RELEASE, CAST_SETTLE, session_age))
		"bite":
			return _phase_start.lerp(BITE, smoothstep(0.0, 0.14, phase_age))
		"reeling":
			if phase_age < 0.13:
				return _phase_start.lerp(HOOK, smoothstep(0.0, 0.13, phase_age))
			return HOOK.lerp(REEL, smoothstep(0.13, 0.40, phase_age))
		"success":
			var lifted := _phase_start.lerp(LIFT, smoothstep(0.0, CATCH_LIFT, phase_age))
			return lifted.lerp(CARRY, smoothstep(CATCH_RETURN, CATCH_END, phase_age))
		"escaped":
			return _phase_start.lerp(CARRY, smoothstep(0.0, 0.43, phase_age))
	return CARRY

func _shoulder_carry_amount() -> float:
	match phase:
		"waiting":
			return 1.0 - smoothstep(0.0, CAST_WINDUP, session_age)
		"success":
			return smoothstep(CATCH_RETURN, CATCH_END, phase_age)
		"escaped":
			return smoothstep(0.0, 0.43, phase_age)
	return 0.0

func _place_rod(hero: Node2D, wrist: Vector2, posture: float, shoulder_amount: float) -> void:
	position = hero.position
	z_index = hero.z_index
	hand = wrist
	# The grip stays to the side of the body when the cast points along the camera.
	var carry := Vector2(heading.x * 55.0 + heading.y * 18.0, heading.y * 18.0 - 75.0)
	var extended := Vector2(heading.x * 98.0 + heading.y * 37.0, heading.y * 84.0 - 48.0)
	var lifted := Vector2(-heading.x * 32.0 + heading.y * 10.0, -112.0)
	var target := extended if posture >= 0.0 else lifted
	var angle := lerp_angle(carry.angle(), target.angle(), absf(posture))
	var length := lerpf(83.0, 110.0, absf(heading.x))
	length *= 1.0 - 0.35 * absf(heading.y) * maxf(0.0, posture)
	if shoulder_amount > 0.0:
		var shoulder_vector: Vector2 = hero.shoulder_rod_vector(hero.last_yaw - hero.camera_yaw, reduced)
		angle = lerp_angle(angle, shoulder_vector.angle(), shoulder_amount)
		length = lerpf(length, shoulder_vector.length(), shoulder_amount)
	tip = hand + Vector2.from_angle(angle) * length
	_rod_behind = shoulder_amount >= 0.5
	if _rod_behind:
		hero.draw_rod_behind_actor(hand, tip)
	drawing = true

func _draw() -> void:
	if not drawing: return
	var bend: float = 0.0
	if active and not reduced:
		if phase == "reeling":
			bend = (10.0 + sin(phase_age * 10.0) * 3.0) * smoothstep(0.0, 0.12, phase_age)
		elif phase == "success":
			bend = 10.0 * (1.0 - smoothstep(0.0, CATCH_LIFT, phase_age))
	if not _rod_behind:
		RodVisual.draw_rod(self, hand, tip, heading * bend)
	if not active: return
	if phase == "success":
		var opacity := 1.0 - smoothstep(CATCH_RETURN, CATCH_END, phase_age)
		if opacity > 0.0:
			draw_line(tip, fish_position, Color(1.0, 0.96, 0.85, opacity), 1.0, false)
			draw_texture_rect_region(TOOLS, Rect2(fish_position - Vector2(18, 14), Vector2(36, 28)), Rect2(33, 49, 18, 14), Color(1.0, 1.0, 1.0, opacity))
			if not reduced:
				for i in range(5):
					draw_circle(fish_position + Vector2(sin(float(i) * 2.1) * 12.0, float(i) * 9.0 + 8.0), 1.5, Color(0.73, 0.91, 0.93, opacity))
		return
	if phase == "escaped" or not _line_released: return
	draw_line(tip,bobber,Color("fff4d9"),1,false)
	draw_texture_rect_region(TOOLS,Rect2(bobber-Vector2(5,5),Vector2(10,10)),Rect2(50,41,10,10))
	if session_age >= CAST_LAND or reduced:
		for ring in range(2):
			var radius: float = 8+float(ring)*7+(0 if reduced else fmod(session_age*9,7))
			var ripple := PackedVector2Array()
			for i in range(25):ripple.append(bobber+Vector2(cos(float(i)*TAU/24)*radius,sin(float(i)*TAU/24)*radius*.5+4))
			draw_polyline(ripple,Color(.8,.95,1,.65-float(ring)*.2),1,false)
	if phase=="bite":
		draw_rect(Rect2(bobber+Vector2(-2,-32),Vector2(4,14)),Color("ffe29a"))
		draw_rect(Rect2(bobber+Vector2(-2,-14),Vector2(4,4)),Color("ffe29a"))
