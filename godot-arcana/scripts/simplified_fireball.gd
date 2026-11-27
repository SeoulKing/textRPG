extends "res://scripts/native_2d_flame.gd"
## Projects one confirmed shot toward the enemy portrait in the combat panel.

var caster: Control
var target: Control
var travel_seconds: float
var reduced_motion: bool
var _progress := 0.0
var _speed := 0.0
var _resolved := false
var _hit := false

func _ready() -> void:
	super()
	z_index = 1
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	scale = Vector2.ONE * 0.8
	light_enabled = false
	_speed = 1.0 / travel_seconds
	_draw_flight(0.0)

func resolve(hit: bool) -> void:
	if _resolved: return
	_resolved = true
	_hit = hit
	# Even a point-blank cast and hit can arrive in the same world frame.
	var time_to_land := maxf(0.07, 0.20 - elapsed)
	_speed = maxf(_speed, (1.0 - _progress) / time_to_land)

func _process(delta: float) -> void:
	if burst:
		if reduced_motion:
			elapsed += delta
		else:
			update_pose(null, delta, false, false)
		if finished(): queue_free()
		return
	_progress = minf(1.0, _progress + delta * _speed)
	_draw_flight(delta)
	if _progress < 1.0: return
	if _resolved:
		if _hit:
			burst = true
			elapsed = 0.0
			modulate.a = 1.0
			show()
			position = _aim_point()
			update_pose(null, 0.0, false, reduced_motion)
		else:
			queue_free()
	else:
		hide()
		if elapsed > travel_seconds + 2.0: queue_free()

func _draw_flight(delta: float) -> void:
	var layer := get_parent() as Node2D
	var hand := layer.to_local(caster.get_global_transform() * (caster.size * Vector2(0.5, 0.55) + Vector2(12, 0)))
	var aim := _aim_point()
	direction = hand.direction_to(aim)
	position = hand if reduced_motion else hand.lerp(aim, _progress)
	if _resolved and not _hit:
		modulate.a = clampf((1.0 - _progress) / 0.35, 0.0, 1.0)
	update_pose(null, delta, false, reduced_motion)

func _aim_point() -> Vector2:
	var layer := get_parent() as Node2D
	return layer.to_local(target.get_global_transform() * (target.size * Vector2(0.5, 0.72)))
