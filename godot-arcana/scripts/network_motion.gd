extends RefCounted
## Timestamped render samples. Never changes server-owned state or collisions.
const MAX_SAMPLES: int = 24
var samples: Array[Dictionary] = []

func clear() -> void:
	samples.clear()

func push(at: float, data: Dictionary, discontinuity: bool = false) -> void:
	var point: Dictionary = data.get("position",{})
	if not point.has("x") or not point.has("y"): return
	var position := Vector2(float(point.x),float(point.y))
	if discontinuity: clear()
	if not samples.is_empty() and at < float(samples.back().time): return
	var direction: Dictionary = data.get("direction",{})
	var value: Dictionary = {"time":at,"position":position,"direction":Vector2(float(direction.get("x",0)),float(direction.get("y",1))),"gait":float(data.get("gait",0)),"walking":bool(data.get("walking",false))}
	if data.has("enemy_pose"):
		value.enemy_pose = data.enemy_pose
	# These timestamps come from integer milliseconds. Relative epsilon grows
	# with the age of the server and can collapse distinct snapshots.
	if not samples.is_empty() and at == float(samples.back().time):
		samples[samples.size()-1] = value
	else:
		samples.append(value)
	while samples.size()>MAX_SAMPLES: samples.pop_front()

func sample(at: float) -> Dictionary:
	if samples.is_empty(): return {}
	while samples.size()>2 and float(samples[1].time)<=at: samples.pop_front()
	if samples.size()==1: return samples[0]
	var a: Dictionary = samples[0]
	var b: Dictionary = samples[1]
	var blend: float = clampf((at-float(a.time))/maxf(.001,float(b.time)-float(a.time)),0,1)
	var result: Dictionary = b.duplicate() if blend>=1 else a.duplicate()
	result.position = Vector2(a.position).lerp(Vector2(b.position),blend)
	result.gait = lerpf(float(a.gait),float(b.gait),blend)
	result.direction = Vector2(a.direction).lerp(Vector2(b.direction),blend).normalized()
	# Keep walking until the buffered movement has actually reached its stop.
	result.walking = bool(a.walking) or (blend<1 and Vector2(a.position).distance_squared_to(Vector2(b.position))>.001)
	if blend>=1: result.walking = bool(b.walking)
	if a.has("enemy_pose") and b.has("enemy_pose"):
		_sample_enemy_transition(result, a, b, at)
	return result

func _sample_enemy_transition(result: Dictionary, a: Dictionary, b: Dictionary, at: float) -> void:
	var before: Dictionary = a.enemy_pose.spatial
	var after: Dictionary = b.enemy_pose.spatial
	var previous_phase := str(before.get("behavior", ""))
	var next_phase := str(after.get("behavior", ""))
	if previous_phase == next_phase: return
	# A packet can land between two network updates, after the phase has already started.
	var phase_age := 0.0
	match next_phase:
		"prepare": phase_age = maxf(0.0, float(after.get("windupDuration", 0.0)) - float(b.enemy_pose.attackIn))
		"attack": phase_age = float(after.get("jumpElapsed", 0.0))
		"recover": phase_age = float(after.get("recoveryElapsed", 0.0))
	var transition := clampf(float(b.time) - phase_age, float(a.time), float(b.time))
	if at >= transition:
		result.enemy_pose = b.enemy_pose
		result.time = b.time
	var movement_start := transition if previous_phase == "prepare" and next_phase == "attack" else float(a.time)
	var movement_end := transition if next_phase in ["prepare", "recover"] else float(b.time)
	var progress := clampf((at - movement_start) / maxf(.001, movement_end - movement_start), 0.0, 1.0)
	result.position = Vector2(a.position).lerp(Vector2(b.position), progress)
