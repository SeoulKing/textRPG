@tool
extends Node3D
## A real shared-motion Skeleton3D drives a continuous upper-body Polygon2D,
## two whole-leg Polygon2Ds and directional head/pelvis/boot sprites.
const PoseSource = preload("res://scripts/characters/hybrid_v1/hybrid_pose_source.gd")
const UpperRig = preload("res://scripts/characters/hybrid_v1/upper_body_polygon.gd")
const LegRig = preload("res://scripts/characters/hybrid_v1/leg_polygon.gd")
const SleeveMotion = preload("res://scripts/characters/hybrid_v1/reference_sleeve_motion.gd")
const BUNDLE := "res://art/characters/hybrid-v1/assembly/parts.json"
const ROOT_ART := "res://art/characters/hybrid-v1/"
const DIRECTIONS: Array[String] = ["s","se","e","ne","n","nw","w","sw"]
const DOWN := {"shoulder_l":"elbow_l","elbow_l":"wrist_l","shoulder_r":"elbow_r","elbow_r":"wrist_r","hip_l":"knee_l","knee_l":"ankle_l","hip_r":"knee_r","knee_r":"ankle_r"}
const UP := {"hip":"spine","spine":"neck","neck":"head"}
const HEAD_PIVOT := Vector2(24,44)
const PELVIS_PIVOT := Vector2(24,9)
const BOOT_PIVOT := Vector2(24,21)
const PROFILE := {"upper_vertical_scale":1.2,"waist_to_spine":7.2,"spine_to_neck":16.8,"hip_half_width":6.0,"waist_to_hip":8.0,"thigh_length":26.5,"shin_length":16.3,"sole_drop":6.0,"hand_scale":0.75}
const MOTION_DEFAULTS := {"thigh_gain":0.72,"knee_flex_soft_start_deg":100.0,"knee_flex_max_deg":115.0,"knee_extension_min_deg":-3.0,"upper_arm_gain":0.72,"forearm_gain":0.60,"body_bob_gain":0.70,"body_lean_gain":1.0,"head_pitch_gain":0.85,"boot_relative_roll_limit_deg":18.0,"boot_roll_follow":0.85,"flight_start_half_cycle":0.38,"flight_height_px":1.0,"support_fade_weight":0.25}

@export var motion_polish := true
## Gameplay actions deform the same approved art; no legacy character atlas.
var presentation_clip := ""
var presentation_progress := 0.0

var source = PoseSource.new()
var skeleton: Skeleton3D
var camera: Camera3D
var joints: Dictionary = {}
var points: Dictionary = {}
## Screen-space registration points for the painted upper-body bindings.
## The underlying Skeleton3D positions remain available separately in points.
var art_points: Dictionary = {}
var data: Dictionary = {}
var direction := -1
var phase := 0.0
var weight := 0.0
var heading := 0.0
var floor_position := Vector3.ZERO
var registration_path := ""
var last_error := ""
var show_hands := true
var show_mesh := false
var motion_metrics: Dictionary = {}

var _canvas: Node2D
var _cache: Dictionary = {}
var _upper_manifest: Dictionary = {}
var _leg_manifest: Dictionary = {}
var _hand_registration: Dictionary = {}
var _neutral: Dictionary = {}
var _profile_vectors: Dictionary = {}
var _waist_height := 0.0
var _motion: Dictionary = MOTION_DEFAULTS.duplicate()
var _boot_foot_hulls: Dictionary = {}

func setup(path: String,fixed_camera: Camera3D) -> bool:
	if not is_inside_tree():return _fail("Add the reference assembler to a viewport before setup")
	camera=fixed_camera
	# Keep the existing orthographic angle and pixel scale, with room for the
	# new three-head silhouette above the floor throughout the movement area.
	camera.v_offset=24.0
	registration_path=path
	if not source.setup():return _fail(source.last_error)
	var bundle := _read_json(path)
	if not bundle.get("parts") is Dictionary:return _fail("Reference part bundle needs parts: "+path)
	data=bundle
	var tuning := _read_json(str(bundle.get("motion_tuning","res://art/characters/hybrid-v1/assembly/motion-polish.json")))
	var parameters: Dictionary=tuning.get("parameters",{})
	for key: String in MOTION_DEFAULTS:
		var value: Variant=parameters.get(key,MOTION_DEFAULTS[key])
		if (value is float or value is int) and is_finite(float(value)):_motion[key]=float(value)
	_upper_manifest=_read_json(str(bundle.parts.upper_body.manifest))
	_leg_manifest=_read_json(str(bundle.parts.legs.manifest))
	_hand_registration=_read_json(ROOT_ART+"hands/manifest.json")
	if not _upper_manifest.get("directions") is Dictionary or not _leg_manifest.get("directions") is Dictionary:
		return _fail("Missing native upper-body or whole-leg manifests")
	for d: String in DIRECTIONS:
		if not _upper_manifest.directions.get(d) is Dictionary or not _leg_manifest.directions.get(d) is Dictionary:
			return _fail("Missing reference direction: "+d)
	_neutral=source.sample(0.0,0.0).duplicate(true)
	_make_profile()
	_prepare_boot_contacts()
	_build_skeleton()
	_canvas=Node2D.new()
	_canvas.name="ProjectedReferenceCharacter"
	_canvas.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	add_child(_canvas)
	return true

func _make_profile() -> void:
	var up_y := maxf(0.1,camera.global_basis.y.y)
	_profile_vectors={
		"spine":Vector3(0,PROFILE.waist_to_spine/up_y,0),
		"neck":Vector3(0,PROFILE.spine_to_neck/up_y,0),
		"head":Vector3(0,17.0/up_y,0),
		"shoulder_l":Vector3(-12,9.6/up_y,0),"shoulder_r":Vector3(12,9.6/up_y,0),
		"elbow_l":Vector3(-3.6,-13.2/up_y,0),"elbow_r":Vector3(3.6,-13.2/up_y,0),
		"wrist_l":Vector3(0,-10.8/up_y,0),"wrist_r":Vector3(0,-10.8/up_y,0),
		"hip_l":Vector3(-PROFILE.hip_half_width,-PROFILE.waist_to_hip/up_y,0),
		"hip_r":Vector3(PROFILE.hip_half_width,-PROFILE.waist_to_hip/up_y,0),
		"knee_l":Vector3(0,-PROFILE.thigh_length/up_y,0),"knee_r":Vector3(0,-PROFILE.thigh_length/up_y,0),
		"ankle_l":Vector3(0,-PROFILE.shin_length/up_y,0),"ankle_r":Vector3(0,-PROFILE.shin_length/up_y,0)}
	_waist_height=(PROFILE.waist_to_hip+PROFILE.thigh_length+PROFILE.shin_length+PROFILE.sole_drop)/up_y

func _build_skeleton() -> void:
	skeleton=Skeleton3D.new()
	skeleton.name="Skeleton3D"
	add_child(skeleton)
	for joint: String in source.joint_order:
		skeleton.add_bone(joint)
		var index := skeleton.find_bone(joint)
		joints[joint]=index
		var parent: String=source.parents[joint]
		if not parent.is_empty():skeleton.set_bone_parent(index,joints[parent])
		skeleton.set_bone_rest(index,Transform3D.IDENTITY)

func apply_pose(p_phase: float,p_weight: float,p_heading: float,p_floor_position: Vector3=Vector3.ZERO,forced_direction: int=-1) -> bool:
	if not is_instance_valid(skeleton):return _fail("Reference assembler is not configured")
	phase=p_phase;weight=p_weight;heading=p_heading;floor_position=p_floor_position
	var sampled: Dictionary=source.sample(phase,weight)
	if sampled.is_empty():return _fail(source.last_error)
	var candidate := posmod(roundi(heading/(TAU/8.0)),8)
	if direction<0 or absf(wrapf(heading-float(direction)*TAU/8.0,-PI,PI))>deg_to_rad(27):direction=candidate
	if forced_direction>=0:direction=posmod(forced_direction,8)
	var retargeted := _retarget(sampled)
	_pose_skeleton(retargeted)
	var key: String=DIRECTIONS[direction]
	if not _cache.has(key) and not _make_direction(key):return false
	for d: String in _cache:(_cache[d].group as Node2D).visible=d==key
	_place_art(_cache[key])
	return true

func _retarget(sampled: Dictionary,neutral_registration: bool=false) -> Dictionary:
	var local := {}
	var root_delta: Vector3=(sampled.hip as Vector3)-(_neutral.hip as Vector3)
	var root_motion := root_delta*1.3
	if motion_polish:root_motion.y=root_delta.y*float(_motion.body_bob_gain)
	local.hip=Vector3(0,_waist_height,0)+root_motion
	var lean := _motion_delta("neck",sampled)
	for joint: String in source.joint_order:
		if joint=="hip":continue
		var parent: String=source.parents[joint]
		var delta := _motion_delta(joint,sampled)
		if joint in ["spine","neck"]:delta=lean
		elif joint.begins_with("shoulder_"):delta+=lean
		var vector: Vector3=_profile_vectors[joint]
		if joint=="head":
			var pitch: float=0.0 if neutral_registration else source.last_end_pitch.get("head",0.0)
			if motion_polish:pitch*=float(_motion.head_pitch_gain)
			vector=Vector3(0,cos(pitch),sin(pitch))*vector.length()
		else:vector=Basis(Vector3.RIGHT,delta)*vector
		local[joint]=(local[parent] as Vector3)+vector
	if not neutral_registration:_apply_presentation(local)
	# Seated feet follow the existing seat's visual anchor.
	if not neutral_registration and presentation_clip=="bench":
		motion_metrics={"phase":phase,"polish_enabled":motion_polish,"support_clearance_measured":false}
	elif motion_polish and not neutral_registration and weight>0.00001:
		_ground_support(local)
	else:
		var minimum := minf((local.ankle_l as Vector3).y,(local.ankle_r as Vector3).y)
		var sole_height: float=PROFILE.sole_drop/maxf(0.1,camera.global_basis.y.y)
		if minimum<sole_height:
			var correction := Vector3(0,sole_height-minimum,0)
			for key: String in local:local[key]=(local[key] as Vector3)+correction
		if not neutral_registration:
			motion_metrics={"phase":phase,"polish_enabled":motion_polish,"support_clearance_measured":false}
	var yaw := Basis(Vector3.UP,heading)
	var result := {}
	for joint: String in source.joint_order:result[joint]=yaw*(local[joint] as Vector3)+floor_position
	return result

func _apply_presentation(local: Dictionary) -> void:
	if presentation_clip=="bench":
		var seated := clampf(presentation_progress,0.0,1.0)
		for joint: String in local:local[joint]=(local[joint] as Vector3)+Vector3(0,-19.0*seated,0)
		for side: String in ["l","r"]:
			_rotate_chain(local,"hip_"+side,["knee_"+side,"ankle_"+side],-1.25*seated)
			_rotate_chain(local,"knee_"+side,["ankle_"+side],1.25*seated)
	elif presentation_clip in ["cast","carry_idle","carry_run","fishing"]:
		var amount := 1.0
		if presentation_clip=="cast":amount=sin(clampf(presentation_progress,0.0,1.0)*PI)
		elif presentation_clip=="fishing":amount=smoothstep(0.0,2.0/3.0,presentation_progress)
		var arm_angle := -0.75 if presentation_clip.begins_with("carry") else -1.05
		for side: String in ["l","r"]:
			_rotate_chain(local,"shoulder_"+side,["elbow_"+side,"wrist_"+side],arm_angle*amount)
			_rotate_chain(local,"elbow_"+side,["wrist_"+side],-0.35*amount)

func _rotate_chain(local: Dictionary,pivot: String,chain: Array,angle: float) -> void:
	var origin: Vector3=local[pivot]
	var rotation := Basis(Vector3.RIGHT,angle)
	for joint: String in chain:local[joint]=origin+rotation*((local[joint] as Vector3)-origin)

func _motion_delta(joint: String,sampled: Dictionary) -> float:
	var delta := _raw_motion_delta(joint,sampled)
	if not motion_polish:return delta
	if joint.begins_with("knee_"):return delta*float(_motion.thigh_gain)
	if joint.begins_with("ankle_"):
		var side := joint.trim_prefix("ankle_")
		var original_thigh := _raw_motion_delta("knee_"+side,sampled)
		var flex := wrapf(delta-original_thigh,-PI,PI)
		var start := deg_to_rad(float(_motion.knee_flex_soft_start_deg))
		var maximum := deg_to_rad(float(_motion.knee_flex_max_deg))
		if flex>start:flex=start+(maximum-start)*tanh((flex-start)/maxf(0.001,maximum-start))
		flex=maxf(deg_to_rad(float(_motion.knee_extension_min_deg)),flex)
		return original_thigh*float(_motion.thigh_gain)+flex
	if joint.begins_with("elbow_"):return delta*float(_motion.upper_arm_gain)
	if joint.begins_with("wrist_"):return delta*float(_motion.forearm_gain)
	if joint in ["spine","neck"]:return delta*float(_motion.body_lean_gain)
	return delta

func _raw_motion_delta(joint: String,sampled: Dictionary) -> float:
	var parent: String=source.parents[joint]
	var current: Vector3=(sampled[joint] as Vector3)-(sampled[parent] as Vector3)
	var original: Vector3=(_neutral[joint] as Vector3)-(_neutral[parent] as Vector3)
	return wrapf(atan2(-current.y,current.z)-atan2(-original.y,original.z),-PI,PI)

func _prepare_boot_contacts() -> void:
	_boot_foot_hulls.clear()
	for key: String in DIRECTIONS:
		var texture := _texture(ROOT_ART+"boots/"+key+"/boot.png")
		var image := texture.get_image() if texture!=null else null
		var corners := PackedVector2Array()
		if image!=null:
			for y in range(20,image.get_height()):
				for x in image.get_width():
					if image.get_pixel(x,y).a<0.5:continue
					for p: Vector2 in [Vector2(x,y),Vector2(x+1,y),Vector2(x+1,y+1),Vector2(x,y+1)]:corners.append(p-BOOT_PIVOT)
		_boot_foot_hulls[key]=Geometry2D.convex_hull(corners) if corners.size()>=3 else PackedVector2Array([Vector2(0,6)])

func _boot_angle(side: String,world_points: Dictionary) -> float:
	var calf: Vector3=(world_points["ankle_"+side] as Vector3)-(world_points["knee_"+side] as Vector3)
	var screen_calf := Vector2(calf.dot(camera.global_basis.x),-calf.dot(camera.global_basis.y))
	var driven := screen_calf.angle()-Vector2.DOWN.angle()
	if not motion_polish:return driven
	var yaw := Basis(Vector3.UP,heading)
	var pitch: float=source.last_end_pitch.get("ankle_"+side,0.0)
	var neutral_axis := yaw*Vector3.BACK
	var foot_axis := yaw*Vector3(0,-sin(pitch),cos(pitch))
	var before := Vector2(neutral_axis.dot(camera.global_basis.x),-neutral_axis.dot(camera.global_basis.y))
	var after := Vector2(foot_axis.dot(camera.global_basis.x),-foot_axis.dot(camera.global_basis.y))
	if before.length_squared()<0.001 or after.length_squared()<0.001:return driven
	var roll := wrapf(after.angle()-before.angle(),-PI,PI)
	var limit := deg_to_rad(float(_motion.boot_relative_roll_limit_deg))
	return driven+clampf(wrapf(roll-driven,-PI,PI),-limit,limit)*float(_motion.boot_roll_follow)

func _ground_support(local: Dictionary) -> void:
	# Existing editor/runtime instances can survive a script hot reload while
	# gaining this cache field. Build it once before using the new contact solver.
	if _boot_foot_hulls.is_empty():_prepare_boot_contacts()
	var yaw := Basis(Vector3.UP,heading)
	var world := {}
	for key: String in local:world[key]=yaw*(local[key] as Vector3)
	var up_y := maxf(0.1,camera.global_basis.y.y)
	var minimum := INF
	var key: String=DIRECTIONS[maxi(0,direction)]
	for side: String in ["l","r"]:
		var rotation := _boot_angle(side,world)
		var drop := -INF
		for point: Vector2 in _boot_foot_hulls[key]:drop=maxf(drop,point.rotated(rotation).y)
		minimum=minf(minimum,(world["ankle_"+side] as Vector3).y*up_y-drop)
	var half_phase := fposmod(phase,0.5)
	var start := clampf(float(_motion.flight_start_half_cycle),0.0,0.49)
	var flight := 0.0
	if half_phase>start:flight=pow(sin(PI*(half_phase-start)/(0.5-start)),2.0)*float(_motion.flight_height_px)*weight
	var blend := smoothstep(0.0,maxf(0.001,float(_motion.support_fade_weight)),weight)
	var correction := (flight-minimum)*blend/up_y
	for name: String in local:local[name]=(local[name] as Vector3)+Vector3(0,correction,0)
	motion_metrics={"phase":phase,"polish_enabled":true,"support_clearance_measured":true,"support_clearance_before_px":minimum,"support_clearance_after_px":minimum+correction*up_y,"target_flight_px":flight}

func _pose_skeleton(retargeted: Dictionary) -> void:
	var poses := {}
	var yaw := Basis(Vector3.UP,heading)
	for joint: String in source.joint_order:
		var basis_value := yaw
		var child: String=str(DOWN.get(joint,UP.get(joint,"")))
		if not child.is_empty():
			var axis: Vector3=(retargeted[child] as Vector3)-(retargeted[joint] as Vector3)
			if DOWN.has(joint):axis=-axis
			var y := axis.normalized()
			var x := y.cross(yaw*Vector3.BACK)
			if x.length_squared()<0.0001:x=Vector3.RIGHT
			x=x.normalized();basis_value=Basis(x,y,x.cross(y).normalized())
		var pose := Transform3D(basis_value,retargeted[joint])
		poses[joint]=pose
		var parent: String=source.parents[joint]
		var local_pose: Transform3D=pose if parent.is_empty() else (poses[parent] as Transform3D).affine_inverse()*pose
		var index: int=joints[joint]
		skeleton.set_bone_pose_position(index,local_pose.origin)
		skeleton.set_bone_pose_rotation(index,local_pose.basis.orthonormalized().get_rotation_quaternion())
		skeleton.set_bone_pose_scale(index,Vector3.ONE)
	skeleton.force_update_all_bone_transforms()
	points.clear()
	for joint: String in source.joint_order:points[joint]=skeleton.global_transform*skeleton.get_bone_global_pose(joints[joint]).origin

func _make_direction(key: String) -> bool:
	var group := Node2D.new();group.name="Direction_"+key.to_upper();_canvas.add_child(group)
	var upper = _load_native("res://art/characters/hybrid-v1/rigs/upper-body/"+key+".tscn",UpperRig)
	group.add_child(upper)
	if not upper.reload_texture():return _fail(upper.last_error)
	var derived := ROOT_ART+"assembly/upper-body-assembly/"+key+".png"
	var upper_texture := _texture(derived)
	if upper_texture!=null:upper.polygon.texture=upper_texture
	if upper.bones.has("torso"):(upper.bones.torso as Bone2D).visible=false
	upper.z_index=20
	var pelvis := _sprite(ROOT_ART+"pelvis/"+key+"/pelvis.png",group,10)
	var head := _sprite(ROOT_ART+"heads/"+key+"/head.png",group,30)
	if pelvis.texture==null or head.texture==null:return _fail("Missing pelvis/head: "+key)
	var legs := {}
	var boots := {}
	var hands := {}
	for side: String in ["l","r"]:
		var layer := Node2D.new();layer.name="Leg_"+side;group.add_child(layer)
		var leg = _load_native("res://art/characters/hybrid-v1/rigs/legs/"+key+".tscn",LegRig)
		layer.add_child(leg)
		if not leg.reload_texture():return _fail(leg.last_error)
		if leg.bones.has("thigh"):(leg.bones.thigh as Bone2D).visible=false
		legs[side]={"layer":layer,"rig":leg}
		var boot := _sprite(ROOT_ART+"boots/"+key+"/boot.png",layer,1)
		if boot.texture==null:return _fail("Missing one-foot boot: "+key)
		boots[side]=boot
		var info: Dictionary=_hand_registration.get("directions",{}).get(key,{}).get("parts",{}).get("hand_"+side,{})
		var hand := _sprite(str(info.get("texture","")),group,22)
		hands[side]={"sprite":hand,"info":info}
	_cache[key]={"group":group,"upper":upper,"pelvis":pelvis,"head":head,"legs":legs,"boots":boots,"hands":hands,"upper_reference":_points2(_upper_manifest.directions[key].joints),"leg_reference":_points2(_leg_manifest.directions[key].joints)}
	return true

func _load_native(path: String,fallback: Script) -> Node2D:
	if ResourceLoader.exists(path):
		var packed := ResourceLoader.load(path,"PackedScene",ResourceLoader.CACHE_MODE_IGNORE) as PackedScene
		if packed!=null:return packed.instantiate() as Node2D
	return fallback.new()

func _place_art(entry: Dictionary) -> void:
	var projected := {}
	for joint: String in points:projected[joint]=camera.unproject_position(points[joint])
	var ref: Dictionary=entry.upper_reference
	var upper_pose := _registered_upper_pose(projected,ref)
	upper_pose=SleeveMotion.polish(upper_pose,ref,1.0 if motion_polish else 0.0)
	art_points=projected.duplicate()
	for joint: String in upper_pose:art_points[joint]=upper_pose[joint]
	entry.upper.show_mesh=show_mesh
	entry.upper.apply_projected_pose(upper_pose)
	var original: Vector2=(ref.neck as Vector2)-(ref.spine as Vector2)
	var current: Vector2=(projected.neck as Vector2)-(projected.spine as Vector2)
	var angle := current.angle()-original.angle()
	var torso_scale := Vector2(1,current.length()/maxf(0.01,original.length()))
	var torso_basis := Transform2D(angle,torso_scale,0.0,Vector2.ZERO)
	var waist: Vector2=(projected.spine as Vector2)+torso_basis*(Vector2(24,29)-(ref.spine as Vector2))
	var pelvis: Sprite2D=entry.pelvis
	pelvis.rotation=angle;pelvis.scale=Vector2.ONE
	pelvis.position=waist-PELVIS_PIVOT.rotated(angle)
	var head_axis: Vector2=(projected.head as Vector2)-(projected.neck as Vector2)
	var head_angle := head_axis.angle()-Vector2.UP.angle()
	var head: Sprite2D=entry.head
	head.rotation=head_angle;head.position=(projected.neck as Vector2)-HEAD_PIVOT.rotated(head_angle)
	var depth_l := _depth((points.knee_l as Vector3)+(points.ankle_l as Vector3))
	var depth_r := _depth((points.knee_r as Vector3)+(points.ankle_r as Vector3))
	for side: String in ["l","r"]:
		var leg_data: Dictionary=entry.legs[side]
		var leg_pose := {"hip":projected["hip_"+side],"knee":projected["knee_"+side],"ankle":projected["ankle_"+side]}
		leg_data.rig.show_mesh=show_mesh
		leg_data.rig.apply_pose(leg_pose)
		leg_data.layer.z_index=2 if ((side=="l" and depth_l>=depth_r) or (side=="r" and depth_r>depth_l)) else 0
		# Every boot master has the same upright cuff/ankle axis. Do not import
		# a direction's painted stocking bend into the boot's resting rotation.
		var boot_angle := _boot_angle(side,points)
		var boot: Sprite2D=entry.boots[side]
		boot.rotation=boot_angle;boot.scale=Vector2.ONE
		boot.position=(leg_pose.ankle as Vector2)-BOOT_PIVOT.rotated(boot_angle)
		var hand_data: Dictionary=entry.hands[side]
		var hand: Sprite2D=hand_data.sprite
		hand.visible=show_hands and hand.texture!=null
		if hand.visible:
			var before_arm: Vector2=(ref["wrist_"+side] as Vector2)-(ref["elbow_"+side] as Vector2)
			var after_arm: Vector2=(upper_pose["wrist_"+side] as Vector2)-(upper_pose["elbow_"+side] as Vector2)
			var hand_angle := after_arm.angle()-before_arm.angle()
			var pivot: Array=hand_data.info.get("targetPivot",[0,0])
			hand.rotation=hand_angle;hand.scale=Vector2.ONE*PROFILE.hand_scale
			hand.position=(upper_pose["wrist_"+side] as Vector2)-(Vector2(float(pivot[0]),float(pivot[1]))*PROFILE.hand_scale).rotated(hand_angle)
			hand.z_index=22 if _depth(points["wrist_"+side])>=_depth(points.spine) else 8

func _registered_upper_pose(projected: Dictionary,reference: Dictionary) -> Dictionary:
	# A painted rear-quarter sleeve does not encode the fixed camera's full
	# near/far shoulder elevation. Keep its approved neutral registration, then
	# add the real 3D motion relative to that neutral pose. This avoids forcing
	# the neutral sleeve into a different silhouette when a direction changes.
	var neutral_world := _retarget(_neutral,true)
	var neutral_projected := {}
	for key: String in neutral_world:
		neutral_projected[key]=camera.unproject_position(global_transform*(neutral_world[key] as Vector3))
	var current_torso := _torso_transform(projected,reference)
	var neutral_torso := _torso_transform(neutral_projected,reference)
	var torso_motion := current_torso*neutral_torso.affine_inverse()
	var result := {"spine":projected.spine,"neck":projected.neck}
	for joint: String in ["shoulder_l","elbow_l","wrist_l","shoulder_r","elbow_r","wrist_r"]:
		var moving_reference: Vector2=torso_motion*(neutral_projected[joint] as Vector2)
		var limb_motion: Vector2=(projected[joint] as Vector2)-moving_reference
		result[joint]=current_torso*(reference[joint] as Vector2)+limb_motion
	return result

func _torso_transform(projected: Dictionary,reference: Dictionary) -> Transform2D:
	var before: Vector2=(reference.neck as Vector2)-(reference.spine as Vector2)
	var after: Vector2=(projected.neck as Vector2)-(projected.spine as Vector2)
	var transform := Transform2D(after.angle()-before.angle(),Vector2(1,after.length()/maxf(0.01,before.length())),0.0,Vector2.ZERO)
	transform.origin=(projected.spine as Vector2)-transform*(reference.spine as Vector2)
	return transform

func _depth(point: Vector3) -> float:
	return camera.global_basis.z.dot(point)

func _sprite(path: String,parent: Node,z: int) -> Sprite2D:
	var sprite := Sprite2D.new();sprite.centered=false;sprite.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.texture=_texture(path);sprite.z_index=z;parent.add_child(sprite)
	return sprite

func _texture(path: String) -> Texture2D:
	if path.is_empty():return null
	if not Engine.is_editor_hint() and ResourceLoader.exists(path):
		var imported := load(path) as Texture2D
		if imported!=null:return imported
	if not FileAccess.file_exists(path):return null
	var image := Image.load_from_file(ProjectSettings.globalize_path(path))
	return ImageTexture.create_from_image(image) if image!=null else null

func _points2(raw: Dictionary) -> Dictionary:
	var result := {}
	for key: String in raw:
		var p: Array=raw[key];result[key]=Vector2(float(p[0]),float(p[1]))
	return result

func _read_json(path: String) -> Dictionary:
	var parsed: Variant=JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}

func _fail(message: String) -> bool:
	last_error=message;push_error(message);return false
