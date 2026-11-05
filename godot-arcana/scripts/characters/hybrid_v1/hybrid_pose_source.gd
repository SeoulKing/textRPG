@tool
extends RefCounted
## Shared fixed-length 3D motion, measured in source pixels.
## Godot coordinates: +Y up, +Z model forward, X left/right. Apply actor yaw
## after sampling. Points include the hip's root-local height above the floor.

const DEFAULT_PATH := "res://art/characters/hybrid-v1/shared-run.json"
const RunClip = preload("res://scripts/characters/hybrid_v1/run_keyframe_clip.gd")
const END_JOINTS: Array[String] = ["head", "wrist_l", "wrist_r", "ankle_l", "ankle_r"]

var last_error: String = ""
var duration: float = 0.64
var joint_order: Array[String] = []
var parents: Dictionary[String, String] = {}
var last_end_pitch: Dictionary[String, float] = {}
var _data: Dictionary = {}
var keyframes = RunClip.new()
var _authoring_pose: Dictionary = {}

func setup(path: String = DEFAULT_PATH) -> bool:
	_data.clear()
	joint_order.clear()
	parents.clear()
	last_end_pitch.clear()
	_authoring_pose.clear()
	last_error = ""
	if not FileAccess.file_exists(path):
		return _fail("Shared motion file does not exist: " + path)
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return _fail("Shared motion must be a JSON dictionary: " + path)
	var candidate: Dictionary = parsed
	for key: String in ["parents", "plane_lengths", "lateral_offsets", "neutral"]:
		if not candidate.get(key) is Dictionary:
			return _fail("Shared motion needs dictionary: " + key)
	if str(candidate.get("root", "")) != "hip" or not candidate.get("samples") is Array:
		return _fail("Shared motion needs root hip and a samples array")
	var samples: Array = candidate.samples
	if samples.size() < 2:
		return _fail("Shared motion needs at least two samples")
	if not _finite(candidate.get("duration")) or float(candidate.duration) <= 0.0:
		return _fail("Shared motion has an invalid duration")
	var raw_parents: Dictionary = candidate.parents
	if not raw_parents.has("hip") or str(raw_parents.hip) != "":
		return _fail("Shared motion hip must be the sole hierarchy root")
	var order: Array[String] = ["hip"]
	var pending: Array = raw_parents.keys()
	pending.erase("hip")
	while not pending.is_empty():
		var before: int = pending.size()
		for value: Variant in pending.duplicate():
			var joint: String = str(value)
			if order.has(str(raw_parents[joint])):
				if not _finite(candidate.plane_lengths.get(joint)) or float(candidate.plane_lengths[joint]) <= 0.0:
					return _fail("Shared motion has invalid plane length: " + joint)
				if not _finite(candidate.lateral_offsets.get(joint, 0.0)):
					return _fail("Shared motion has invalid lateral offset: " + joint)
				order.append(joint)
				pending.erase(value)
		if pending.size() == before:
			return _fail("Shared motion hierarchy contains a missing parent or cycle")
	if not _valid_pose(candidate.neutral, order):
		return _fail("Shared motion has an invalid neutral pose")
	for index: int in range(samples.size()):
		if not _valid_pose(samples[index], order):
			return _fail("Shared motion has an invalid sample: " + str(index))
	var candidate_clip = RunClip.new()
	if not candidate_clip.setup(candidate.neutral):
		return _fail(candidate_clip.last_error)
	_data = candidate
	keyframes = candidate_clip
	duration = keyframes.duration
	joint_order = order
	for joint: String in order:
		parents[joint] = str(raw_parents[joint])
	return true

func set_authoring_pose(pose: Dictionary = {}) -> bool:
	if pose.is_empty():
		_authoring_pose.clear()
		last_error = ""
		return true
	if _data.is_empty(): return _fail("Set up shared motion before supplying an authoring pose")
	if not _valid_pose(pose, joint_order): return _fail("Authoring pose needs finite absolute root, angles and ends")
	_authoring_pose = pose.duplicate(true)
	last_error = ""
	return true

func get_neutral_pose() -> Dictionary:
	return _data.get("neutral", {}).duplicate(true)

func sample(phase: float, blend: float = 1.0) -> Dictionary[String, Vector3]:
	var points: Dictionary[String, Vector3] = {}
	if _data.is_empty():
		last_error = "Call setup before sampling shared motion"
		return points
	if not is_finite(phase) or not is_finite(blend):
		last_error = "Shared motion phase and blend must be finite"
		return points
	last_error = ""
	var animated_pose: Dictionary = _authoring_pose if not _authoring_pose.is_empty() else keyframes.sample(phase)
	if animated_pose.is_empty():
		last_error = keyframes.last_error
		return points
	duration = keyframes.duration
	var neutral: Dictionary = _data.neutral
	var weight: float = clampf(blend, 0.0, 1.0)
	var root2: Vector2 = _point(neutral.root).lerp(_point(animated_pose.root), weight)
	points["hip"] = Vector3(0.0, -root2.y, root2.x)
	for joint: String in joint_order:
		if joint == "hip":
			continue
		var animated: float = float(animated_pose.angles[joint])
		var angle: float = lerp_angle(float(neutral.angles[joint]), animated, weight)
		var length: float = float(_data.plane_lengths[joint])
		var lateral: float = float(_data.lateral_offsets.get(joint, 0.0))
		points[joint] = points[parents[joint]] + Vector3(lateral, -sin(angle) * length, cos(angle) * length)
	last_end_pitch.clear()
	for joint: String in END_JOINTS:
		var animated: float = float(animated_pose.ends[joint])
		last_end_pitch[joint] = lerp_angle(float(neutral.ends[joint]), animated, weight)
	return points

func _valid_pose(value: Variant, order: Array[String]) -> bool:
	if not value is Dictionary:
		return false
	var pose: Dictionary = value
	if not pose.get("root") is Array or not pose.get("angles") is Dictionary or not pose.get("ends") is Dictionary:
		return false
	var root: Array = pose.root
	if root.size() != 2 or not _finite(root[0]) or not _finite(root[1]):
		return false
	for joint: String in order:
		if joint != "hip" and not _finite(pose.angles.get(joint)):
			return false
	for joint: String in END_JOINTS:
		if not _finite(pose.ends.get(joint)):
			return false
	return true

func _point(value: Array) -> Vector2:
	return Vector2(float(value[0]), float(value[1]))

func _finite(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value))

func _fail(message: String) -> bool:
	last_error = message
	return false
