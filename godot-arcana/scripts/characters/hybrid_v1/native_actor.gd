@tool
extends Node2D
## Hybrid version 1: gameplay owns the floor anchor; the fixed pixel viewport
## presents the approved shared Skeleton3D and continuous Polygon2D parts.
const Assembler = preload("res://scripts/characters/hybrid_v1/reference_character_assembler.gd")
const SPEC = preload("res://art/resources/heroine_reference_spec.gd")
const BUNDLE := "res://art/characters/hybrid-v1/assembly/parts.json"
const VIEW_SIZE := Vector2i(320,180)
const DIRECTIONS := ["s","se","e","ne","n","nw","w","sw"]
const DEFAULT_OUTFIT := ["travel-top","travel-trousers","boots-taupe"]
const CAST_GATHER := 0.32
const CAST_DURATION := 0.68
const RUN_CYCLE_DISTANCE := 24.0
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
var aim_facing := Vector2.ZERO
var hurt_age := -1.0
var hurt_direction := Vector2.ZERO
var bench_state := ""
var bench_age := 0.0
var bench_reduced := false
var preview_clip := ""
var preview_direction := 0
var preview_frame := 0
var current_frame: Vector2:
	get:return Vector2(floori(walk_phase*8.0),display_direction)
var _movement_weight := 0.0
var _contact := {}
var _contact_shadow: Polygon2D
var _capture_anchor := Vector2(160,164)
var _rod: Line2D

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
	_rod=Line2D.new();_rod.name="EquippedRod";_rod.width=2.0;_rod.default_color=Color("58434a")
	_rod.antialiased=false;_rod.z_index=100;_rod.hide();stage.add_child(_rod)
	pose(0,0,false,Vector2.ZERO,true,false)

static func direction_for_yaw(world_yaw: float,view_yaw: float) -> int:
	return posmod(roundi((world_yaw-view_yaw)/TAU*8.0),8)

func set_camera_yaw(value: float) -> void:camera_yaw=value

func pose(time: float,gait: float,walking: bool,motion: Vector2,_pixelated: bool,effects: bool,use_gait_distance: bool=false,locomotion_heading: Vector2=Vector2.ZERO) -> void:
	if not skeleton_ready:return
	pose_updates+=1
	var delta := clampf(time-previous_pose_time,0.0,0.1) if previous_pose_time>=0 else 0.0
	previous_pose_time=time;gameplay_pose_delta=delta
	var facing := locomotion_heading if locomotion_heading.length_squared()>0.00001 else motion
	if walking and facing.length_squared()>0.00001:last_yaw=atan2(facing.x,facing.y)
	if aim_facing.length_squared()>0.00001:last_yaw=atan2(aim_facing.x,aim_facing.y)
	if cast_age>=0:last_yaw=cast_yaw
	if dash_age>=0:last_yaw=dash_yaw
	display_direction=direction_for_yaw(last_yaw,camera_yaw)
	if walking:
		# World.player_gait advances by map distance * 0.20.
		var distance := maxf(0.0,gait-previous_gait)*5.0 if use_gait_distance and was_walking else motion.length()
		walk_phase=fposmod(walk_phase+distance/RUN_CYCLE_DISTANCE,1.0)
		idle_age=0.0
	else:idle_age+=delta
	previous_gait=gait;was_walking=walking
	_movement_weight=move_toward(_movement_weight,1.0 if walking else 0.0,delta*10.0)
	var clip := "run" if walking or _movement_weight>0.001 else "idle"
	var progress := 0.0
	if cast_age>=0:clip="cast";progress=cast_age/CAST_DURATION
	if not preview_clip.is_empty():
		clip=preview_clip;display_direction=preview_direction;walk_phase=float(preview_frame)/8.0
	_present(clip,display_direction,walk_phase,_movement_weight,progress)
	_rod.hide()
	update_hurt(delta,effects)

func _present(clip: String,direction: int,phase: float,movement: float,progress: float=0.0) -> bool:
	if not skeleton_ready:return false
	assembler.presentation_clip=clip
	assembler.presentation_progress=progress
	if not assembler.apply_pose(phase,movement,float(direction)*TAU/8.0,Vector3.ZERO,direction):return false
	_update_contact()
	return true

func _update_contact() -> void:
	var projected: Dictionary=assembler.art_points
	if not projected.get("wrist_r") is Vector2:return
	var grip: Vector2=(projected.wrist_r as Vector2)-_capture_anchor
	var heading := Vector2(sin(last_yaw-camera_yaw),cos(last_yaw-camera_yaw))
	var rod_vector := Vector2(heading.x*55.0,heading.y*18.0-75.0)
	if assembler.presentation_clip=="fishing":
		var progress: float=clampf(assembler.presentation_progress,0.0,1.0)
		var resting := Vector2(heading.x*85.0,heading.y*30.0-95.0)
		rod_vector=rod_vector.lerp(resting,smoothstep(0.0,2.0/3.0,progress))
		if progress>2.0/3.0:rod_vector=resting.lerp(Vector2(heading.x*38.0,-136.0),(progress-2.0/3.0)*3.0)
	_contact={"hand":[grip.x,grip.y],"rodVector":[rod_vector.x,rod_vector.y],"vector":[rod_vector.x,rod_vector.y],"character_id":"hybrid-v1"}

func is_skeleton_active() -> bool:return skeleton_ready
func clip_duration(_clip: String,_direction: int=0) -> float:return float(assembler.source.duration) if skeleton_ready else 0.64
func skeleton_contact_data() -> Dictionary:return _contact.duplicate(true)

func present_life_pose(clip: String,direction: int,source_frame: float=-1.0,seconds: float=0.0,with_rod: bool=false) -> Dictionary:
	var phase := fposmod(seconds/clip_duration(clip,direction),1.0) if clip=="carry_run" else 0.0
	if not _present(clip,direction,phase,_movement_weight if clip=="carry_run" else 0.0,source_frame/3.0 if source_frame>=0 else 0.0):return {}
	if with_rod and not _contact.is_empty():
		var grip: Array=_contact.hand;var axis: Array=_contact.rodVector
		var start := Vector2(float(grip[0]),float(grip[1]))+_capture_anchor
		_rod.points=PackedVector2Array([start,start+Vector2(float(axis[0]),float(axis[1]))]);_rod.show()
	return skeleton_contact_data()

func supports_bench_pose() -> bool:return skeleton_ready
func set_bench_pose(state: String,age: float,reduced: bool) -> void:
	bench_state=state;bench_age=age;bench_reduced=reduced
func apply_bench_pose() -> void:
	if bench_state.is_empty():return
	var amount := 1.0
	if bench_state=="sit":amount=1.0 if bench_reduced else smoothstep(0,0.39,bench_age)
	elif bench_state=="stand":amount=0.0 if bench_reduced else 1.0-smoothstep(0,0.315,bench_age)
	display_direction=0;last_yaw=camera_yaw
	_present("bench",0,0.0,0.0,amount)
	_contact_shadow.visible=amount<0.5

func face_attack(direction: Vector2) -> void:
	if direction.length_squared()>0.00001:last_yaw=atan2(direction.x,direction.y)
func begin_cast(direction: Vector2) -> void:
	face_attack(direction);cast_yaw=last_yaw;cast_age=0.0
func cancel_cast() -> void:cast_age=-1.0
func advance_cast(delta: float,paused: bool) -> void:
	if cast_age<0 or paused:return
	cast_age+=delta
	if cast_age>=CAST_DURATION:cast_age=-1.0
func play_hurt(direction: Vector2) -> void:
	hurt_age=0.0;hurt_direction=direction.normalized()
func update_hurt(delta: float,effects: bool) -> void:
	if sprite_material==null:return
	var strength := 0.0
	if hurt_age>=0:
		strength=maxf(0.0,1.0-hurt_age/0.30);hurt_age+=delta
		if hurt_age>=0.30:hurt_age=-1.0
	sprite_material.set_shader_parameter("hurt_flash",strength if effects else 0.0)
	_contact_shadow.visible=bench_state.is_empty()
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
