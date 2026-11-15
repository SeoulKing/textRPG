@tool
extends "res://scripts/characters/hybrid_v1/native_actor.gd"
## The gameplay actor keeps its floor anchor and drives the approved 3D model.

const HERO_MODEL = preload("res://art/characters/hero-v12/hero.glb")
const ActionRetarget = preload("res://scripts/characters/hero_v12/action_retarget.gd")

var _model: Node3D
var _model_skeleton: Skeleton3D
var _player: AnimationPlayer
var _walk: Animation
var _idle: Animation
var _action_retarget := ActionRetarget.new()
var _hand := -1


func _ready() -> void:
	super._ready()
	if not skeleton_ready:
		return
	_model = HERO_MODEL.instantiate() as Node3D
	fixed_camera.get_parent().add_child(_model)
	_model.scale = Vector3.ONE * ActionRetarget.MODEL_SCALE
	var skeletons := _model.find_children("*", "Skeleton3D", true, false)
	var players := _model.find_children("*", "AnimationPlayer", true, false)
	if not skeletons.is_empty() and not players.is_empty():
		_model_skeleton = skeletons[0] as Skeleton3D
		_player = players[0] as AnimationPlayer
		_hand = _model_skeleton.find_bone("Hand.R")
		_idle = _player.get_animation(&"Idle") if _player.has_animation(&"Idle") else null
		_walk = _player.get_animation(&"Walk") if _player.has_animation(&"Walk") else null
	if _idle == null or _walk == null or _hand < 0 or not _action_retarget.setup(_model_skeleton, assembler.points):
		push_error("The v12 hero requires its exported skeleton and Idle and Walk animations.")
		_model.queue_free()
		_model = null
		return
	_player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	assembler.use_mesh_presentation()
	_place_rod_under_model()
	sprite_material.set_shader_parameter("model_outline", true)
	set_meta("model_outline", true)
	_present("idle", display_direction, 0.0, 0.0)


func _present(clip: String, direction: int, phase: float, movement: float, progress: float = 0.0, action: Dictionary = {}, fishing_pose: Vector3 = Vector3.ZERO, rod_carry: float = 0.0, visual_yaw: float = NAN) -> bool:
	if not super._present(clip, direction, phase, movement, progress, action, fishing_pose, rod_carry, visual_yaw):
		return false
	if not is_instance_valid(_model):
		return true
	var yaw := float(direction) * TAU / 8.0 if is_nan(visual_yaw) else visual_yaw
	_model.rotation.y = yaw
	var stride := clampf(movement, 0.0, 1.0) if clip in ["run", "walk", "rod_carry"] else 0.0
	if not preview_clip.is_empty() and clip in ["run", "walk"]:
		stride = 1.0
	_sample_locomotion(phase, stride)

	var action_blend := maxf(float(action.get("weight", 0.0)), float(action.get("from_weight", 0.0)))
	# The shared source points have already blended in action weight and casting arms.
	if clip in ["bench", "fishing", "rod_carry", "cast"] or action_blend > 0.0 or _arm_pose.length_squared() > .0001:
		var points: Dictionary = assembler.points.duplicate()
		if action_blend > 0.0:
			points["end_pitch"] = assembler.source.last_end_pitch
		if clip == "rod_carry":
			_action_retarget.apply_upper_body(points, yaw)
		else:
			_action_retarget.apply(points, yaw, 1.0)
	else:
		_model_skeleton.force_update_all_bone_transforms()
	return true


func _sample_locomotion(phase: float, stride: float) -> void:
	if stride >= .999:
		_sample_animation(&"Walk", fposmod(phase, 1.0) * _walk.length)
		return
	_sample_animation(&"Idle", fposmod(idle_age, _idle.length))
	if stride <= .001:
		return
	var idle_poses: Array[Transform3D] = []
	for bone in range(_model_skeleton.get_bone_count()):
		idle_poses.append(_model_skeleton.get_bone_pose(bone))
	_sample_animation(&"Walk", fposmod(phase, 1.0) * _walk.length)
	for bone in range(idle_poses.size()):
		_model_skeleton.set_bone_pose(bone, idle_poses[bone].interpolate_with(_model_skeleton.get_bone_pose(bone), stride))


func _sample_animation(animation: StringName, time: float) -> void:
	if _player.current_animation != animation:
		_player.play(animation)
		_player.advance(0.0)
	_player.seek(time, true, true)


func _rod_grip() -> Variant:
	if not is_instance_valid(_model):
		return super._rod_grip()
	var grip := _model_skeleton.to_global(_model_skeleton.get_bone_global_pose(_hand).origin)
	return fixed_camera.unproject_position(grip) - capture_anchor()


func _place_rod_under_model() -> void:
	# Compatibility clears the transparent target before BG_CANVAS only when
	# the environment belongs to the viewport's World3D.
	var environment := Environment.new()
	environment.background_mode = Environment.BG_CANVAS
	environment.background_canvas_max_layer = -1
	var world_environment := WorldEnvironment.new()
	world_environment.environment = environment
	stage.add_child(world_environment)
	var rod_layer := CanvasLayer.new()
	rod_layer.layer = -1
	stage.add_child(rod_layer)
	_rod.reparent(rod_layer, false)
