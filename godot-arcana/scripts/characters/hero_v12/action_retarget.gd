@tool
extends RefCounted
## Retarget the existing gameplay action poses onto the imported v12 skeleton.

const MODEL_SCALE := 70.0
const SEGMENTS := {
	"Chest": ["spine", "neck"],
	"Head": ["neck", "head"],
	"Upper arm.L": ["shoulder_l", "elbow_l"],
	"Upper arm.R": ["shoulder_r", "elbow_r"],
	"Forearm.L": ["elbow_l", "wrist_l"],
	"Forearm.R": ["elbow_r", "wrist_r"],
	"Thigh.L": ["hip_l", "knee_l"],
	"Thigh.R": ["hip_r", "knee_r"],
	"Shin.L": ["knee_l", "ankle_l"],
	"Shin.R": ["knee_r", "ankle_r"],
}
const END_PITCH := {
	"Foot.L": "ankle_l",
	"Foot.R": "ankle_r",
}

var _model: Skeleton3D
var _hips := -1
var _rod_upper_arm := -1
var _rod_forearm := -1
var _neutral_hip := Vector3.ZERO
var _parents := PackedInt32Array()
var _rest_rotations: Array[Quaternion] = []
var _segments: Dictionary = {}
var _end_pitch_bones: Dictionary[int, String] = {}
var _rest_hips_position := Vector3.ZERO
var _global_poses: Array[Transform3D] = []

func setup(model: Skeleton3D, neutral_points: Dictionary) -> bool:
	_model = null
	_segments.clear()
	_end_pitch_bones.clear()
	if not is_instance_valid(model) or not neutral_points.get("hip") is Vector3:
		return false
	_hips = model.find_bone("Hips")
	_rod_upper_arm = model.find_bone("Upper arm.R")
	_rod_forearm = model.find_bone("Forearm.R")
	if _hips < 0:
		return false
	for name: String in SEGMENTS:
		var index := model.find_bone(name)
		var keys: Array = SEGMENTS[name]
		var start: Variant = neutral_points.get(keys[0])
		var end: Variant = neutral_points.get(keys[1])
		if index < 0 or not start is Vector3 or not end is Vector3:
			return false
		var axis: Vector3 = end - start
		if axis.length_squared() < 0.000001:
			return false
		_segments[index] = {"start": keys[0], "end": keys[1], "axis": axis.normalized()}
	for name: String in END_PITCH:
		var index := model.find_bone(name)
		if index < 0:
			return false
		_end_pitch_bones[index] = END_PITCH[name]
	var count := model.get_bone_count()
	_parents.resize(count)
	_rest_rotations.resize(count)
	_global_poses.resize(count)
	for index in count:
		_parents[index] = model.get_bone_parent(index)
		_rest_rotations[index] = model.get_bone_global_rest(index).basis.get_rotation_quaternion()
	_rest_hips_position = model.get_bone_rest(_hips).origin
	_neutral_hip = neutral_points.hip
	_model = model
	return true

func apply_upper_body(points: Dictionary, yaw: float) -> void:
	_apply(points, yaw, 1.0, 1.0, 1.0, true)

func apply(points: Dictionary, yaw: float, blend: float, root_y: float = 1.0, root_z: float = 1.0) -> void:
	_apply(points, yaw, blend, root_y, root_z, false)

func _apply(points: Dictionary, yaw: float, blend: float, root_y: float, root_z: float, rod_arm_only: bool) -> void:
	if not is_instance_valid(_model) or blend <= 0.0 or not points.get("hip") is Vector3:
		return
	var weight := clampf(blend, 0.0, 1.0)
	var unyaw := Basis(Vector3.UP, -yaw)
	var hip: Vector3 = points.hip
	var root_motion := (unyaw * hip - _neutral_hip) / MODEL_SCALE
	root_motion.y *= root_y
	root_motion.z *= root_z
	var end_pitches: Dictionary = points.get("end_pitch", {})
	# Imported bones are ordered parent-first. Resolve each target global
	# orientation back to local space so the hierarchy keeps its segment lengths.
	for index in _parents.size():
		var parent := _parents[index]
		var parent_pose := _global_poses[parent] if parent >= 0 else Transform3D.IDENTITY
		var pose := _model.get_bone_pose(index)
		if index == _hips and not rod_arm_only:
			var local_motion := parent_pose.basis.inverse() * root_motion
			pose.origin = pose.origin.lerp(_rest_hips_position + local_motion, weight)
			_model.set_bone_pose_position(index, pose.origin)
		var retarget_rotation := (index == _rod_upper_arm or index == _rod_forearm) if rod_arm_only else (
			_segments.has(index) or _end_pitch_bones.has(index)
		)
		if retarget_rotation:
			var target := _rest_rotations[index]
			if _segments.has(index):
				var segment: Dictionary = _segments[index]
				var start: Vector3 = points.get(segment.start, Vector3.ZERO)
				var end: Vector3 = points.get(segment.end, start)
				var direction := (unyaw * (end - start)).normalized()
				if not direction.is_zero_approx():
					target = Quaternion(segment.axis, direction) * target
			else:
				var pitch := float(end_pitches.get(_end_pitch_bones[index], 0.0))
				target = Quaternion(Vector3.RIGHT, pitch) * target
			var parent_rotation := parent_pose.basis.get_rotation_quaternion()
			var target_local := (parent_rotation.inverse() * target).normalized()
			var rotation := pose.basis.get_rotation_quaternion().slerp(target_local, weight)
			_model.set_bone_pose_rotation(index, rotation)
			pose.basis = Basis(rotation).scaled_local(_model.get_bone_pose_scale(index))
		_global_poses[index] = parent_pose * pose
	_model.force_update_all_bone_transforms()
