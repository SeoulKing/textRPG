@tool
extends Resource

const RunClip = preload("res://scripts/characters/hybrid_v1/run_keyframe_clip.gd")
const PATH := "res://art/characters/hybrid-v1/action-poses.tres"
const MIN_DURATION := 0.05
const MAX_DURATION := 10.0
const PEAK_PHASE := 0.4

@export var poses: Dictionary = {}

func find_pose(action_id: String) -> Dictionary:
	var entry: Variant = poses.get(action_id)
	if not entry is Dictionary or not entry.get("target") is Dictionary:
		return {}
	var seconds: Variant = entry.get("duration")
	if not (seconds is float or seconds is int) or not is_valid_duration(float(seconds)):
		return {}
	return entry if RunClip.valid_pose_deltas(entry.target) else {}

static func target_pose(entry: Dictionary, neutral: Dictionary) -> Dictionary:
	return RunClip.deltas_to_pose(entry.target, neutral)

static func is_valid_duration(seconds: float) -> bool:
	return is_finite(seconds) and seconds >= MIN_DURATION and seconds <= MAX_DURATION

static func weight_at(elapsed: float, seconds: float) -> float:
	var phase := elapsed / seconds
	return smoothstep(0.0, PEAK_PHASE, phase) * (1.0 - smoothstep(PEAK_PHASE, 1.0, phase))
