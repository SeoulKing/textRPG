@tool
extends RefCounted
## The editable run library is shared by AnimationPlayer and runtime sampling.
## Neutral proportions and registration remain in shared-run.json.
const DEFAULT_PATH := "res://art/characters/hybrid-v1/run-keyframes.tres"
const CLIP_NAME := &"run"
const CHANNELS := [
	{"path":"전체_이동:position", "node_path":"전체_이동", "property":"position", "section":"root", "key":"", "label":"전체 이동"},
	{"path":"몸통_기울기:rotation", "node_path":"몸통_기울기", "property":"rotation", "section":"angles", "key":"neck", "label":"몸통 기울기"},
	{"path":"고개_기울기:rotation", "node_path":"고개_기울기", "property":"rotation", "section":"ends", "key":"head", "label":"고개 기울기"},
	{"path":"왼팔_상박:rotation", "node_path":"왼팔_상박", "property":"rotation", "section":"angles", "key":"elbow_l", "label":"왼팔 상박"},
	{"path":"왼팔_전완:rotation", "node_path":"왼팔_전완", "property":"rotation", "section":"angles", "key":"wrist_l", "label":"왼팔 전완"},
	{"path":"오른팔_상박:rotation", "node_path":"오른팔_상박", "property":"rotation", "section":"angles", "key":"elbow_r", "label":"오른팔 상박"},
	{"path":"오른팔_전완:rotation", "node_path":"오른팔_전완", "property":"rotation", "section":"angles", "key":"wrist_r", "label":"오른팔 전완"},
	{"path":"왼다리_허벅지:rotation", "node_path":"왼다리_허벅지", "property":"rotation", "section":"angles", "key":"knee_l", "label":"왼다리 허벅지"},
	{"path":"왼다리_정강이:rotation", "node_path":"왼다리_정강이", "property":"rotation", "section":"angles", "key":"ankle_l", "label":"왼다리 정강이"},
	{"path":"오른다리_허벅지:rotation", "node_path":"오른다리_허벅지", "property":"rotation", "section":"angles", "key":"knee_r", "label":"오른다리 허벅지"},
	{"path":"오른다리_정강이:rotation", "node_path":"오른다리_정강이", "property":"rotation", "section":"angles", "key":"ankle_r", "label":"오른다리 정강이"},
	{"path":"왼발_회전:rotation", "node_path":"왼발_회전", "property":"rotation", "section":"ends", "key":"ankle_l", "label":"왼발 회전"},
	{"path":"오른발_회전:rotation", "node_path":"오른발_회전", "property":"rotation", "section":"ends", "key":"ankle_r", "label":"오른발 회전"},
	{"path":"고급/angle_spine:rotation", "node_path":"고급/angle_spine", "property":"rotation", "section":"angles", "key":"spine", "label":"고급: 척추 원본 각도"},
	{"path":"고급/angle_head:rotation", "node_path":"고급/angle_head", "property":"rotation", "section":"angles", "key":"head", "label":"고급: 머리 연결 구간"},
	{"path":"고급/angle_shoulder_l:rotation", "node_path":"고급/angle_shoulder_l", "property":"rotation", "section":"angles", "key":"shoulder_l", "label":"고급: 왼어깨 위치"},
	{"path":"고급/angle_shoulder_r:rotation", "node_path":"고급/angle_shoulder_r", "property":"rotation", "section":"angles", "key":"shoulder_r", "label":"고급: 오른어깨 위치"},
	{"path":"고급/angle_hip_l:rotation", "node_path":"고급/angle_hip_l", "property":"rotation", "section":"angles", "key":"hip_l", "label":"고급: 왼골반 위치"},
	{"path":"고급/angle_hip_r:rotation", "node_path":"고급/angle_hip_r", "property":"rotation", "section":"angles", "key":"hip_r", "label":"고급: 오른골반 위치"},
	{"path":"고급/end_wrist_l:rotation", "node_path":"고급/end_wrist_l", "property":"rotation", "section":"ends", "key":"wrist_l", "label":"고급: 왼손 원본 각도"},
	{"path":"고급/end_wrist_r:rotation", "node_path":"고급/end_wrist_r", "property":"rotation", "section":"ends", "key":"wrist_r", "label":"고급: 오른손 원본 각도"}
]

var library: AnimationLibrary
var animation: Animation
var last_error := ""
var duration: float:
	get: return animation.length if is_instance_valid(animation) else 0.0
var _neutral: Dictionary = {}
var _tracks: Dictionary = {}
var _needs_validation := false

static func channel_specs() -> Array:
	return CHANNELS.duplicate(true)

static func pose_to_deltas(pose: Dictionary, neutral: Dictionary) -> Dictionary:
	var result := {}
	for channel: Dictionary in CHANNELS:
		var path: String = channel.path
		if channel.section == "root":
			result[path] = _point(pose.root) - _point(neutral.root)
		else:
			result[path] = wrapf(float(pose[channel.section][channel.key]) - float(neutral[channel.section][channel.key]), -PI, PI)
	return result

static func deltas_to_pose(deltas: Dictionary, neutral: Dictionary) -> Dictionary:
	var result: Dictionary = neutral.duplicate(true)
	for channel: Dictionary in CHANNELS:
		var path: String = channel.path
		if channel.section == "root":
			var position: Vector2 = _point(neutral.root) + (deltas.get(path, Vector2.ZERO) as Vector2)
			result.root = [position.x, position.y]
		else:
			result[channel.section][channel.key] = float(neutral[channel.section][channel.key]) + float(deltas.get(path, 0.0))
	return result

static func unwrap_delta(value: float, previous: float) -> float:
	return previous + wrapf(value - previous, -PI, PI)

func setup(neutral: Dictionary, path: String = DEFAULT_PATH) -> bool:
	last_error = ""
	_tracks.clear()
	_neutral = neutral.duplicate(true)
	if not ResourceLoader.exists(path, "AnimationLibrary"):
		return _fail("Run keyframe library is missing: " + path)
	# Reuse the resource so merely opening an authoring preview never reloads
	# over unsaved AnimationPlayer changes in the same editor process.
	var resource: Resource = ResourceLoader.load(path, "AnimationLibrary")
	if not resource is AnimationLibrary:
		return _fail("Run keyframes must be an AnimationLibrary: " + path)
	library = resource
	if not library.has_animation(CLIP_NAME):
		return _fail("Run keyframe library needs the 'run' animation: " + path)
	animation = library.get_animation(CLIP_NAME)
	if not animation.changed.is_connected(_invalidate): animation.changed.connect(_invalidate)
	return _validate()

func sample(phase: float) -> Dictionary:
	if not is_finite(phase):
		_fail("Run keyframe phase must be finite")
		return {}
	if not is_instance_valid(animation):
		_fail("Call run keyframe setup before sampling")
		return {}
	if _needs_validation and not _validate(): return {}
	var time: float = fposmod(phase, 1.0) * animation.length
	var deltas := {}
	for channel: Dictionary in CHANNELS:
		var path: String = channel.path
		var track: int = _tracks[path]
		var value: Variant = animation.value_track_interpolate(track, time)
		if not _valid_value(value, channel.property == "position"):
			_fail("Invalid run keyframe interpolation: " + path)
			return {}
		deltas[path] = value
	last_error = ""
	return deltas_to_pose(deltas, _neutral)

func _validate() -> bool:
	_tracks.clear()
	_needs_validation = true
	if not is_instance_valid(animation) or not is_finite(animation.length) or animation.length <= 0.0:
		return _fail("Run animation length must be positive and finite")
	if animation.loop_mode != Animation.LOOP_LINEAR:
		return _fail("Run animation must use linear looping")
	if animation.get_track_count() != CHANNELS.size():
		return _fail("Run animation must keep its 21 registered property tracks")
	for channel: Dictionary in CHANNELS:
		var path: String = channel.path
		var index: int = animation.find_track(NodePath(path), Animation.TYPE_VALUE)
		if index < 0: return _fail("Run keyframe channel is missing: " + path)
		if not animation.track_is_enabled(index): return _fail("Run keyframe channel is disabled: " + path)
		if animation.value_track_get_update_mode(index) != Animation.UPDATE_CONTINUOUS:
			return _fail("Run keyframe channel must use continuous updates: " + path)
		var count: int = animation.track_get_key_count(index)
		if count == 0: return _fail("Run keyframe channel has no keys: " + path)
		for key_index: int in count:
			var time: float = animation.track_get_key_time(index, key_index)
			var value: Variant = animation.track_get_key_value(index, key_index)
			if not is_finite(time) or time < 0.0 or time > animation.length + 0.000001:
				return _fail("Run keyframe time is outside the animation: " + path)
			if not _valid_value(value, channel.property == "position"):
				return _fail("Run keyframe value has the wrong type or is not finite: " + path)
		_tracks[path] = index
	_needs_validation = false
	last_error = ""
	return true

func _invalidate() -> void:
	_needs_validation = true

static func _valid_value(value: Variant, position: bool) -> bool:
	if position: return value is Vector2 and is_finite(value.x) and is_finite(value.y)
	return (value is float or value is int) and is_finite(float(value))

static func _point(value: Array) -> Vector2:
	return Vector2(float(value[0]), float(value[1]))

func _fail(message: String) -> bool:
	last_error = message
	return false
