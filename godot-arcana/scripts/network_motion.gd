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
	if not samples.is_empty() and is_equal_approx(at,float(samples.back().time)):
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
	return result
