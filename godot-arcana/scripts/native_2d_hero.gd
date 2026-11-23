@tool
extends "res://scripts/characters/hybrid_v1/native_actor.gd"
## The gameplay actor keeps its floor anchor and drives the approved 3D model.

const HERO_MODEL = preload("res://art/characters/hero-v12/hero.glb")
const ActionRetarget = preload("res://scripts/characters/hero_v12/action_retarget.gd")
const ROD_SCENE := preload("res://art/props/fishing/mystic_rod.glb")
const ROD_LENGTH := 92.0
const ROD_CAPTURE_SIZE := Vector2i(304, 240)

var _model: Node3D
var _model_skeleton: Skeleton3D
var _player: AnimationPlayer
# Travel in logical map pixels per full left/right cycle at the model's gameplay scale.
const WALK_STRIDE := 18.0
const RUN_STRIDE := 30.0
const TURN_RESPONSE := 0.045

var move_strength := -1.0 # Local simulation supplies actual travel / maximum step.
var _run_weight := 0.0
var _locomotion_visual_yaw := NAN
var _run: Animation
var _walk: Animation
var _idle: Animation
var _action_retarget := ActionRetarget.new()
var _hand := -1
var _toe_rest: Dictionary[int, Quaternion] = {}
var _rod_model: Node3D
var _rod_mesh: MeshInstance3D
var _rod_flex := -1
var _rod_cast_lag := -1


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
		for name_in_rig in [&"Toe.L", &"Toe.R"]:
			var toe := _model_skeleton.find_bone(name_in_rig)
			if toe >= 0:
				_toe_rest[toe] = _model_skeleton.get_bone_rest(toe).basis.get_rotation_quaternion()
		_idle = _player.get_animation(&"Idle") if _player.has_animation(&"Idle") else null
		_walk = _player.get_animation(&"Walk") if _player.has_animation(&"Walk") else null
		_run = _player.get_animation(&"Run") if _player.has_animation(&"Run") else null
	if _idle == null or _walk == null or _run == null or _hand < 0 or not _action_retarget.setup(_model_skeleton, assembler.points):
		push_error("The v12 hero requires its exported skeleton and Idle, Walk and Run animations.")
		_model.queue_free()
		_model = null
		return
	_player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	assembler.use_mesh_presentation()
	sprite_material.set_shader_parameter("model_outline", true)
	set_meta("model_outline", true)
	_present("idle", display_direction, 0.0, 0.0)


func _present(clip: String, direction: int, phase: float, movement: float, progress: float = 0.0, action: Dictionary = {}, fishing_pose: Vector3 = Vector3.ZERO, rod_carry: float = 0.0, visual_yaw: float = NAN) -> bool:
	if is_instance_valid(_rod_model) and clip not in ["fishing", "rod_carry"]:
		_rod_model.hide()
	var model_ready := is_instance_valid(_model)
	var yaw := float(direction) * TAU / 8.0 if is_nan(visual_yaw) else visual_yaw
	# The mesh can follow the actual travel angle between its eight authored views.
	var locomotion := clip in ["idle", "walk", "run"] and is_nan(visual_yaw)
	var free_facing := preview_clip.is_empty() and action.is_empty() and aim_facing.is_zero_approx() \
		and cast_age < 0.0 and dash_age < 0.0 and bench_state.is_empty()
	if model_ready and locomotion and free_facing:
		yaw = last_yaw - camera_yaw
		if not bench_reduced and not is_nan(_locomotion_visual_yaw):
			var difference := angle_difference(_locomotion_visual_yaw, yaw)
			if absf(difference) > 0.001:
				yaw -= difference * exp(-gameplay_pose_delta / TURN_RESPONSE)
	_locomotion_visual_yaw = yaw
	visual_yaw = yaw
	# Plain locomotion poses come entirely from the mesh animations. Only build
	# reference joints when another pose or its fading arms can affect the mesh.
	var plain_locomotion := model_ready and clip in ["idle", "walk", "run"] and action.is_empty() and _previous_frame_arms == Vector2.ZERO
	if plain_locomotion:
		_arm_pose = Vector2.ZERO
		if not assembler.source.last_action_pose.is_empty():
			assembler.source.last_action_pose = {}
	elif not super._present(clip, direction, phase, movement, progress, action, fishing_pose, rod_carry, visual_yaw):
		return false
	if not model_ready:
		return true
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
			# Authored full-body actions drive the boot as a whole. Fade out its walking flex.
			for toe: int in _toe_rest:
				var gait_rotation := _model_skeleton.get_bone_pose_rotation(toe)
				_model_skeleton.set_bone_pose_rotation(toe, gait_rotation.slerp(_toe_rest[toe], action_blend))
		if clip == "rod_carry":
			_action_retarget.apply_upper_body(points, yaw)
		elif clip == "fishing":
			_action_retarget.apply_fishing(points, yaw, _fishing_cast_drive)
		else:
			_action_retarget.apply(points, yaw, 1.0)
	else:
		_model_skeleton.force_update_all_bone_transforms()
	return true


func _advance_gait(distance: float, delta: float) -> void:
	if delta <= 0.0:
		return
	# Remote actors and previews provide displacement only. Match the local 48 px/s pace.
	var strength := move_strength if move_strength >= 0.0 else distance / (delta * 48.0)
	var target_run := smoothstep(0.52, 0.96, strength)
	# A brief stop still has a visible gait pose. Preserve its walk/run mix.
	_run_weight = move_toward(_run_weight, target_run, delta / 0.09) if _movement_weight > 0.001 else target_run
	var stride_length := lerpf(WALK_STRIDE, RUN_STRIDE, _run_weight)
	# Bound cadence on teleports and at triple developer speed.
	var phase_step := minf(distance / stride_length, delta * 2.7)
	walk_phase = fposmod(walk_phase + phase_step, 1.0)


func _sample_locomotion(phase: float, stride: float) -> void:
	var idle_pose: Array[Transform3D] = []
	if stride < .999:
		_sample_animation(&"Idle", fposmod(idle_age, _idle.length))
		if stride <= .001:
			return
		idle_pose = _locomotion_pose()
	var run_amount := _run_weight
	if preview_clip == "run" or preview_clip == "walk":
		run_amount = 1.0 if preview_clip == "run" else 0.0
	phase = fposmod(phase, 1.0)
	if run_amount >= .999:
		_sample_animation(&"Run", phase * _run.length)
	else:
		_sample_animation(&"Walk", phase * _walk.length)
		if run_amount > .001:
			var walk_pose := _locomotion_pose()
			_sample_animation(&"Run", phase * _run.length)
			_blend_locomotion_pose(walk_pose, run_amount)
	if not idle_pose.is_empty():
		_blend_locomotion_pose(idle_pose, stride)


func _locomotion_pose() -> Array[Transform3D]:
	var bones: Array[Transform3D] = []
	for bone in range(_model_skeleton.get_bone_count()):
		bones.append(_model_skeleton.get_bone_pose(bone))
	return bones


func _blend_locomotion_pose(from: Array[Transform3D], weight: float) -> void:
	for bone in range(from.size()):
		var target := _model_skeleton.get_bone_pose(bone)
		_model_skeleton.set_bone_pose(bone, from[bone].interpolate_with(target, weight))


func _sample_animation(animation: StringName, time: float) -> void:
	if _player.current_animation != animation:
		_player.play(animation)
		_player.advance(0.0)
	_player.seek(time, true, true)


func _grip_position() -> Vector3:
	# The hand bone starts at the wrist. Seat the handle in the palm.
	var palm := _model_skeleton.get_bone_global_pose(_hand) * Vector3(0.0, 0.042, 0.0)
	return _model_skeleton.to_global(palm)


func _rod_grip() -> Variant:
	if not is_instance_valid(_model):
		return null
	return fixed_camera.unproject_position(_grip_position()) - capture_anchor()


func _equip_rod_model() -> void:
	# Preserve one rig unit per capture pixel, with headroom for the backswing.
	stage.size = ROD_CAPTURE_SIZE
	fixed_camera.size = float(ROD_CAPTURE_SIZE.y)
	fixed_camera.v_offset += float(ROD_CAPTURE_SIZE.y - VIEW_SIZE.y) * 0.5
	_capture_anchor = fixed_camera.unproject_position(Vector3.ZERO).round()
	art.offset = -_capture_anchor
	_rod_model = ROD_SCENE.instantiate() as Node3D
	fixed_camera.get_parent().add_child(_rod_model)
	_rod_mesh = _rod_model.find_child("Rod", true, false) as MeshInstance3D
	_rod_flex = _rod_mesh.find_blend_shape_by_name("Flex")
	_rod_cast_lag = _rod_mesh.find_blend_shape_by_name("CastLag")


func pose_rod(yaw: float, posture: float, shoulder: float, flex: float, reduced: bool) -> Vector2:
	if not is_instance_valid(_rod_model):
		_equip_rod_model()
	var pitch := deg_to_rad(12.0 + 62.0 * posture)
	var sway := 0.0 if reduced else sin(walk_phase * TAU * 2.0) * _movement_weight * 0.035
	pitch = lerpf(pitch, deg_to_rad(-61.0) + sway, shoulder)
	var rotation_basis := Basis(Vector3.UP, yaw) * Basis(Vector3.BACK, -0.105) * Basis(Vector3.RIGHT, pitch)
	_rod_model.global_transform = Transform3D(rotation_basis.scaled(Vector3.ONE * ROD_LENGTH), _grip_position())
	_rod_model.show()
	_rod_mesh.set_blend_shape_value(_rod_flex, maxf(0.0, flex))
	_rod_mesh.set_blend_shape_value(_rod_cast_lag, maxf(0.0, -flex))
	# Both morphs shorten the shaft equally and bend the guide in opposite directions.
	var line_guide := _rod_mesh.to_global(Vector3(0.0, 1.0 - 0.05 * absf(flex), 0.22 * flex))
	return fixed_camera.unproject_position(line_guide) - capture_anchor()
