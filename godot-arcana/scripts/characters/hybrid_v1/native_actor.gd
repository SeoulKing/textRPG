@tool
extends Node2D
## Hybrid version 1: gameplay owns the floor anchor; the fixed pixel viewport
## presents the approved shared Skeleton3D and continuous Polygon2D parts.
const Assembler = preload("res://scripts/characters/hybrid_v1/reference_character_assembler.gd")
const ActionLibrary = preload("res://scripts/characters/hybrid_v1/action_pose_library.gd")
const BenchMotion = preload("res://scripts/bench_motion.gd")
const ACTIONS = preload("res://art/characters/hybrid-v1/action-poses.tres")
const SPEC = preload("res://art/resources/heroine_reference_spec.gd")
const BUNDLE := "res://art/characters/hybrid-v1/assembly/parts.json"
const VIEW_SIZE := Vector2i(320,180)
const DIRECTIONS := ["s","se","e","ne","n","nw","w","sw"]
const DEFAULT_OUTFIT := ["travel-top","travel-trousers","boots-taupe"]
const CAST_GATHER := 0.32
const CAST_DURATION := 0.68
const DODGE_TRAVEL_TIME := 0.18
const DODGE_PEAK_PHASE := 0.24
const HURT_RECOIL_PEAK := 0.045
const HURT_RECOIL_END := 0.25
const RUN_CYCLE_DISTANCE := 24.0
const RUN_BLEND_IN := 0.12
const RUN_BLEND_OUT := 0.16
const ARM_BLEND_RESPONSE := 0.04
const ACTION_INTERRUPTION_BLEND := 0.08
class OutfitSlots:
	const ITEM_SLOTS = {"travel-top":["top"],"travel-trousers":["bottom"],"boots-taupe":["feet"]}
const LEGACY = OutfitSlots

var outfit := PackedStringArray(DEFAULT_OUTFIT)
var art: Sprite2D
var sprite_material: ShaderMaterial
var stage: SubViewport
var fixed_camera: Camera3D
var assembler
var skeleton_runtime: Node
var skeleton_ready := false
var using_skeleton := true
var camera_yaw := 0.0
var last_yaw := 0.0
var walk_phase := 0.0
var idle_age := 0.0
var previous_pose_time := -1.0
var previous_gait := 0.0
var was_walking := false
var display_direction := 0
var pose_updates := 0
var gameplay_pose_delta := 0.0
var dash_age := -1.0
var dash_yaw := 0.0
var cast_age := -1.0
var cast_yaw := 0.0
var _fishing_cast_drive := 0.0
var aim_facing := Vector2.ZERO
var hurt_age := -1.0
var hurt_direction := Vector2.ZERO
var bench_state := ""
var bench_age := 0.0
var bench_reduced := false
var _bench_facing := Vector2.ZERO
var preview_clip := ""
var preview_direction := 0
var preview_frame := 0
var current_frame: Vector2:
	get:return Vector2(floori(walk_phase*8.0),display_direction)
var _movement_progress := 0.0
var _movement_weight := 0.0
var _arm_pose := Vector2.ZERO
var _previous_frame_arms := Vector2.ZERO
var _arm_blend_weight := 0.0
var _action_target: Dictionary = {}
var _action_duration := 0.0
var _action_age := 0.0
var _outgoing_pose: Dictionary = {}
var _outgoing_age := 0.0
var _authored_cast := false
var _authored_hurt := false
var _action_from_cast := false
var _dodge_pose_active := false
var _previous_dash_age := -1.0
var _contact_shadow: Polygon2D
var _contact_shadow_enabled := true
var _capture_anchor := Vector2(160,164)

func _ready() -> void:
	texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	stage=SubViewport.new();stage.name="HybridV1Pixels";stage.size=VIEW_SIZE
	stage.transparent_bg=true;stage.own_world_3d=true
	stage.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	stage.msaa_3d=Viewport.MSAA_DISABLED;stage.screen_space_aa=Viewport.SCREEN_SPACE_AA_DISABLED
	add_child(stage)
	var rig_world := Node3D.new();rig_world.name="HybridV1Rig";stage.add_child(rig_world)
	fixed_camera=Camera3D.new();fixed_camera.projection=Camera3D.PROJECTION_ORTHOGONAL
	fixed_camera.size=180.0;fixed_camera.near=0.1;fixed_camera.far=1000.0
	rig_world.add_child(fixed_camera);fixed_camera.position=Vector3(0,160,260)
	fixed_camera.look_at(Vector3(0,42,0),Vector3.UP);fixed_camera.current=true
	assembler=Assembler.new();assembler.name="ApprovedHybridV1";rig_world.add_child(assembler)
	skeleton_ready=assembler.setup(BUNDLE,fixed_camera)
	skeleton_runtime=self
	_capture_anchor=fixed_camera.unproject_position(Vector3.ZERO).round()
	art=Sprite2D.new();art.name="HybridV1Composite";art.texture=stage.get_texture()
	art.centered=false;art.offset=-_capture_anchor
	sprite_material=ShaderMaterial.new();sprite_material.shader=preload("res://art/resources/native_actor.gdshader")
	sprite_material.set_shader_parameter("avatar_texture",stage.get_texture())
	sprite_material.set_shader_parameter("sheet_grid",Vector2.ONE)
	art.material=sprite_material;material=sprite_material;add_child(art)
	art.set_meta("dynamic_character",true);art.set_meta("character_ground_y",0.0)
	set_meta("dynamic_character",true)
	_contact_shadow=Polygon2D.new();_contact_shadow.name="ContactShadow"
	var shadow_points := PackedVector2Array()
	for i in range(24):shadow_points.append(Vector2(cos(i*TAU/24)*17,sin(i*TAU/24)*7))
	_contact_shadow.polygon=shadow_points;_contact_shadow.color=Color(0,0,0,0.18);_contact_shadow.z_index=-1
	add_child(_contact_shadow)
	pose(0,0,false,Vector2.ZERO,true,false)

func set_contact_shadow_enabled(enabled: bool) -> void:
	if _contact_shadow_enabled == enabled:
		return
	_contact_shadow_enabled = enabled
	_contact_shadow.visible = enabled and bench_state.is_empty()

static func direction_for_yaw(world_yaw: float,view_yaw: float) -> int:
	return posmod(roundi((world_yaw-view_yaw)/TAU*8.0),8)

func set_camera_yaw(value: float) -> void:camera_yaw=value

func pose(time: float,gait: float,walking: bool,motion: Vector2,_pixelated: bool,effects: bool,use_gait_distance: bool=false,locomotion_heading: Vector2=Vector2.ZERO) -> void:
	if not skeleton_ready:return
	pose_updates+=1
	var delta := clampf(time-previous_pose_time,0.0,0.1) if previous_pose_time>=0 else 0.0
	previous_pose_time=time;gameplay_pose_delta=delta
	# Life poses can replace locomotion later in the same frame.
	# Each request blends from the last pose displayed, without advancing twice.
	_previous_frame_arms = _arm_pose
	# The movement clock pauses while the fishing panel is open.
	var frame_delta := delta
	_arm_blend_weight = 1.0 - exp(-frame_delta / ARM_BLEND_RESPONSE)
	if dash_age >= 0.0 and (_previous_dash_age < 0.0 or dash_age < _previous_dash_age):
		if cast_age >= 0.0: cancel_cast()
		play_action_pose("dodge")
	if _dodge_pose_active:
		if dash_age >= 0.0:
			_action_age = minf(dash_age, _action_duration)
		else:
			_capture_outgoing_pose()
			_action_target = {}
			_dodge_pose_active = false
	_previous_dash_age = dash_age
	var facing := locomotion_heading if locomotion_heading.length_squared()>0.00001 else motion
	if walking and facing.length_squared()>0.00001:last_yaw=atan2(facing.x,facing.y)
	if aim_facing.length_squared()>0.00001:last_yaw=atan2(aim_facing.x,aim_facing.y)
	if cast_age>=0:last_yaw=cast_yaw
	if dash_age>=0:last_yaw=dash_yaw
	display_direction=direction_for_yaw(last_yaw,camera_yaw)
	# Dodge displacement is not a stride. Resume the last foot phase when the
	# control layer gives movement back during the dodge recovery.
	var gait_walking := walking and not (dash_age >= 0.0 and dash_age < DODGE_TRAVEL_TIME)
	if gait_walking:
		# World.player_gait advances by map distance * 0.20.
		var distance := maxf(0.0,gait-previous_gait)*5.0 if use_gait_distance and was_walking else motion.length()
		_advance_gait(distance, frame_delta)
	# Keep breathing continuous across the idle/movement blend.
	idle_age += delta
	previous_gait=gait;was_walking=gait_walking
	var blend_duration := RUN_BLEND_IN if gait_walking else RUN_BLEND_OUT
	_movement_progress = move_toward(_movement_progress, 1.0 if gait_walking else 0.0, delta / blend_duration)
	_movement_weight = smoothstep(0.0, 1.0, _movement_progress)
	var clip := "run" if gait_walking or _movement_weight>0.001 else "idle"
	var progress := 0.0
	if cast_age>=0:clip="cast";progress=cast_age/CAST_DURATION
	if not preview_clip.is_empty():
		clip=preview_clip;display_direction=preview_direction;walk_phase=float(preview_frame)/8.0
	var action: Dictionary = {}
	if bench_state.is_empty() and preview_clip.is_empty():
		action = _sample_action_pose()
	_present(clip,display_direction,walk_phase,_movement_weight,progress,action)
	if not _action_target.is_empty():
		if _action_age >= _action_duration:
			_action_target = {}
		elif not _dodge_pose_active:
			_action_age = minf(_action_duration, _action_age + frame_delta)
	if not _outgoing_pose.is_empty():
		if _outgoing_age >= ACTION_INTERRUPTION_BLEND:
			_outgoing_pose = {}
		else:
			_outgoing_age = minf(ACTION_INTERRUPTION_BLEND, _outgoing_age + frame_delta)
	update_hurt(delta,effects)

func _advance_gait(distance: float, _delta: float) -> void:
	walk_phase = fposmod(walk_phase + distance / RUN_CYCLE_DISTANCE, 1.0)

func _present(clip: String,direction: int,phase: float,movement: float,progress: float=0.0,action: Dictionary={},fishing_pose: Vector3=Vector3.ZERO,rod_carry: float=0.0,visual_yaw: float=NAN) -> bool:
	if not skeleton_ready:return false
	assembler.presentation_clip=clip
	assembler.presentation_progress=progress
	var target_arms := Vector2.ZERO
	if clip == "cast" and not _authored_cast:
		target_arms = Assembler.cast_arm_angles(progress * CAST_DURATION, CAST_GATHER, CAST_DURATION)
	var arms := target_arms
	if clip == "fishing":
		arms = Vector2(fishing_pose.x, fishing_pose.y)
	elif preview_clip.is_empty() and clip != "bench":
		arms = _previous_frame_arms.lerp(target_arms, _arm_blend_weight)
		if arms.distance_squared_to(target_arms) < 0.000001:
			arms = target_arms
	assembler.presentation_arms = arms
	assembler.presentation_lean = fishing_pose.z
	assembler.presentation_rod_carry = rod_carry
	var yaw := float(direction) * TAU / 8.0 if is_nan(visual_yaw) else visual_yaw
	if not assembler.apply_pose(phase,movement,yaw,Vector3.ZERO,direction,action):return false
	_arm_pose = arms
	return true

func is_skeleton_active() -> bool:return skeleton_ready
func clip_duration(_clip: String,_direction: int=0) -> float:return float(assembler.source.duration) if skeleton_ready else 0.64

func present_rod_carry(view_yaw: float) -> Variant:
	display_direction = direction_for_yaw(view_yaw, 0.0)
	if not _present("rod_carry", display_direction, walk_phase, _movement_weight, 0.0, {}, Vector3.ZERO, 1.0, view_yaw):
		return null
	return _rod_grip()

func present_fishing_pose(heading: Vector2, pose_angles: Vector3, rod_carry: float, crank: float = 0.0, cast_drive: float = 0.0) -> Variant:
	face_attack(heading)
	display_direction = direction_for_yaw(last_yaw, camera_yaw)
	_fishing_cast_drive = cast_drive
	if not _present("fishing", display_direction, 0.0, 0.0, crank, {}, pose_angles, rod_carry, last_yaw - camera_yaw):
		return null
	return _rod_grip()

func _rod_grip() -> Variant:
	var wrist: Variant = assembler.art_points.get("wrist_r")
	return wrist - _capture_anchor if wrist is Vector2 else null

func supports_bench_pose() -> bool:return skeleton_ready
func set_bench_pose(state: String, age: float, reduced: bool, facing: Vector2 = Vector2.ZERO) -> void:
	bench_state = state if BenchMotion.has_pose(state) else ""
	bench_age = age
	bench_reduced = reduced
	_bench_facing = facing

func apply_bench_pose() -> void:
	if bench_state.is_empty():
		return
	var amount := BenchMotion.seated_weight(bench_state, bench_age, bench_reduced)
	last_yaw = camera_yaw if _bench_facing.is_zero_approx() else atan2(_bench_facing.x, _bench_facing.y)
	display_direction = direction_for_yaw(last_yaw, camera_yaw)
	_present("bench", display_direction, 0.0, 0.0, amount, {}, Vector3.ZERO, 0.0, last_yaw - camera_yaw)
	_contact_shadow.visible = _contact_shadow_enabled and amount < 0.5

func face_attack(direction: Vector2) -> void:
	if direction.length_squared()>0.00001:last_yaw=atan2(direction.x,direction.y)
func begin_cast(direction: Vector2, spell_id: String = "") -> void:
	face_attack(direction);cast_yaw=last_yaw;cast_age=0.0
	_authored_cast = play_action_pose(spell_id, "cast")
	if not _authored_cast:
		_stop_cast_pose()
	_action_from_cast = _authored_cast

func cancel_cast() -> void:
	cast_age = -1.0
	_authored_cast = false
	_stop_cast_pose()

func _stop_cast_pose() -> void:
	if _action_from_cast:
		_capture_outgoing_pose()
		_action_target = {}
		_action_from_cast = false

func play_action_pose(action_id: String, fallback_id: String = "") -> bool:
	if not skeleton_ready:
		return false
	var entry: Dictionary = ACTIONS.find_pose(action_id)
	if entry.is_empty() and not fallback_id.is_empty() and action_id != fallback_id:
		entry = ACTIONS.find_pose(fallback_id)
	if entry.is_empty():
		return false
	_capture_outgoing_pose()
	_action_target = ActionLibrary.target_pose(entry, assembler.source.get_neutral_pose())
	_action_duration = float(entry.duration)
	_action_age = 0.0
	_action_from_cast = false
	_dodge_pose_active = action_id == "dodge"
	return true

func _capture_outgoing_pose() -> void:
	if not skeleton_ready:
		return
	_outgoing_pose = assembler.source.last_action_pose
	_outgoing_age = 0.0

func _sample_action_pose() -> Dictionary:
	var mix := {}
	if not _action_target.is_empty():
		mix.target = _action_target
		var elapsed := _action_age
		if _dodge_pose_active:
			var phase := clampf(elapsed / _action_duration, 0.0, 1.0)
			var authored_peak: float = ActionLibrary.PEAK_PHASE
			var timing := lerpf(0.0, authored_peak, phase / DODGE_PEAK_PHASE) if phase < DODGE_PEAK_PHASE \
				else lerpf(authored_peak, 1.0, inverse_lerp(DODGE_PEAK_PHASE, 1.0, phase))
			elapsed = timing * _action_duration
		mix.weight = ActionLibrary.weight_at(elapsed, _action_duration)
	if not _outgoing_pose.is_empty():
		mix.from = _outgoing_pose
		mix.from_weight = 1.0 - smoothstep(0.0, ACTION_INTERRUPTION_BLEND, _outgoing_age)
	return mix

func advance_cast(delta: float,paused: bool) -> void:
	if cast_age<0 or paused:return
	cast_age+=delta
	if cast_age>=CAST_DURATION:cast_age=-1.0
func play_hurt(direction: Vector2) -> void:
	hurt_age = 0.0
	hurt_direction = direction.normalized()
	if hurt_direction.is_zero_approx():
		# A landing can share our floor anchor. Recoil away from our forward side.
		hurt_direction = Vector2(-sin(last_yaw), -cos(last_yaw))
	_authored_hurt = play_action_pose("hurt")

func recoil_direction() -> Vector2:
	if _authored_hurt or bench_reduced or hurt_age < 0.0 or hurt_age >= HURT_RECOIL_END:
		return Vector2.ZERO
	var sway := smoothstep(0.0, HURT_RECOIL_PEAK, hurt_age) * (1.0 - smoothstep(HURT_RECOIL_PEAK, HURT_RECOIL_END, hurt_age))
	return hurt_direction * sway

func update_hurt(delta: float,effects: bool) -> void:
	if sprite_material==null:return
	var strength := 0.0
	if hurt_age>=0:
		strength=maxf(0.0,1.0-hurt_age/0.30);hurt_age+=delta
		if hurt_age>=0.30:hurt_age=-1.0
	sprite_material.set_shader_parameter("hurt_flash",strength if effects else 0.0)
	_contact_shadow.visible = _contact_shadow_enabled and bench_state.is_empty()
func set_outfit(items: PackedStringArray) -> bool:
	if items.size()!=DEFAULT_OUTFIT.size():return false
	for item: String in DEFAULT_OUTFIT:
		if item not in items:return false
	outfit=items.duplicate();return true
func set_preview_pose(direction: int,animation: String,frame: int) -> void:
	preview_direction=posmod(direction,8);preview_clip=animation;preview_frame=frame
func clear_preview_pose() -> void:preview_clip=""
func portrait_texture() -> Texture2D:
	var portrait := AtlasTexture.new();portrait.atlas=get_live_texture()
	portrait.region=Rect2(_capture_anchor-Vector2(48,136),Vector2(96,136))
	return portrait
func get_live_texture() -> Texture2D:return stage.get_texture() if is_instance_valid(stage) else null
func capture_anchor() -> Vector2:return _capture_anchor
static func idle_frame(age: float) -> int:return posmod(int(age*4.0),4)
